//! Typst in the core (docs/design/DESIGN-export.md §2.2): a ```typst fence drawn as SVG pages, a vault `.typ` compiled
//! into a PDF. The project root is the vault (a file names pictures beside it, `/x` from the vault's top, nothing
//! outside); fonts are Typst's embedded ones plus the machine's, scanned once; `@ns/name:ver` packages come from the
//! local Typst package folders only — nothing is downloaded while compiling.

use std::path::{Path, PathBuf};
use std::sync::OnceLock;

use typst::diag::{FileError, FileResult, PackageError, SourceDiagnostic};
use typst::foundations::{Bytes, Datetime, Duration};
use typst_layout::PagedDocument;
use typst::syntax::{FileId, RootedPath, Source, VirtualPath, VirtualRoot};
use typst::text::{Font, FontBook};
use typst::utils::LazyHash;
use typst::{Library, LibraryExt, World, WorldExt};
use typst_kit::files::{FileLoader, FileStore};
use typst_kit::fonts::FontStore;

/// What a fence gets before its own text: a page as big as what it holds, transparent, so a formula or a diagram
/// sits in the note like a picture. One line, taken off the line numbers of errors.
const FENCE_PAGE: &str = "#set page(width: auto, height: auto, margin: 4pt, fill: none)\n";

fn fonts() -> &'static FontStore {
    static FONTS: OnceLock<FontStore> = OnceLock::new();
    FONTS.get_or_init(|| {
        let mut store = FontStore::new();
        store.extend(typst_kit::fonts::embedded());
        store.extend(typst_kit::fonts::system());
        store
    })
}

fn library() -> &'static LazyHash<Library> {
    static LIB: OnceLock<LazyHash<Library>> = OnceLock::new();
    LIB.get_or_init(|| LazyHash::new(Library::default()))
}

/// The local Typst package folders, as the `typst` program uses them: `{data,cache}/typst/packages/<ns>/<name>/<ver>`.
fn package_dirs() -> Vec<PathBuf> {
    let home = std::env::var_os("HOME").map(PathBuf::from);
    let data = std::env::var_os("XDG_DATA_HOME").map(PathBuf::from).or_else(|| home.as_ref().map(|h| h.join(".local/share")));
    let cache = std::env::var_os("XDG_CACHE_HOME").map(PathBuf::from).or_else(|| home.as_ref().map(|h| h.join(".cache")));
    [data, cache].into_iter().flatten().map(|d| d.join("typst/packages")).collect()
}

/// Files for the compiler: the vault for the project, the local package folders for packages.
struct VaultFiles {
    root: PathBuf,
}

impl FileLoader for VaultFiles {
    fn load(&self, id: FileId) -> FileResult<Bytes> {
        let base = match id.root() {
            VirtualRoot::Project => self.root.clone(),
            VirtualRoot::Package(spec) => package_dirs()
                .into_iter()
                .map(|d| d.join(spec.namespace.as_str()).join(spec.name.as_str()).join(spec.version.to_string()))
                .find(|d| d.is_dir())
                .ok_or_else(|| FileError::Package(PackageError::NotFound(spec.clone())))?,
        };
        let path = id.vpath().realize(&base).map_err(FileError::Realize)?;
        if path.is_dir() {
            return Err(FileError::IsDirectory);
        }
        std::fs::read(&path).map(Bytes::new).map_err(|e| FileError::from_io(e, &path))
    }
}

struct VaultWorld {
    main: FileId,
    /// A fence's text, standing for `main` (it is in no file).
    text: Option<String>,
    files: FileStore<VaultFiles>,
}

impl VaultWorld {
    fn new(root: &Path, main: &str, text: Option<String>) -> Result<Self, String> {
        let vpath = VirtualPath::new(main).map_err(|e| format!("{main}: {e:?}"))?;
        Ok(Self {
            main: RootedPath::new(VirtualRoot::Project, vpath).intern(),
            text,
            files: FileStore::new(VaultFiles { root: root.to_path_buf() }),
        })
    }
}

impl World for VaultWorld {
    fn library(&self) -> &LazyHash<Library> {
        library()
    }
    fn book(&self) -> &LazyHash<FontBook> {
        fonts().book()
    }
    fn main(&self) -> FileId {
        self.main
    }
    fn source(&self, id: FileId) -> FileResult<Source> {
        match &self.text {
            Some(t) if id == self.main => Ok(Source::new(id, t.clone())),
            _ => self.files.source(id),
        }
    }
    fn file(&self, id: FileId) -> FileResult<Bytes> {
        self.files.file(id)
    }
    fn font(&self, index: usize) -> Option<Font> {
        fonts().font(index)
    }
    fn today(&self, offset: Option<Duration>) -> Option<Datetime> {
        use chrono::Datelike;
        let date = match offset {
            Some(o) => (chrono::Utc::now() + chrono::Duration::seconds(o.seconds() as i64)).date_naive(),
            None => chrono::Local::now().date_naive(),
        };
        Datetime::from_ymd(date.year(), date.month() as u8, date.day() as u8)
    }
}

/// Typst's errors as a person reads them: `line N: message` (the fence's own numbering), with Typst's hints.
fn explain(world: &VaultWorld, diags: &[SourceDiagnostic], shift: usize) -> String {
    let mut out = Vec::new();
    for d in diags.iter().filter(|d| d.severity == typst::diag::Severity::Error) {
        let at = d.span.id().and_then(|id| {
            let src = world.source(id).ok()?;
            let line = src.lines().byte_to_line(world.range(d.span)?.start)? + 1;
            let file = if id == world.main { String::new() } else { format!("{} ", id.vpath().get_without_slash()) };
            Some(format!("{file}line {}: ", line.saturating_sub(if id == world.main { shift } else { 0 })))
        });
        out.push(format!("{}{}", at.unwrap_or_default(), d.message));
        out.extend(d.hints.iter().map(|h| format!("  hint: {}", h.v)));
    }
    if out.is_empty() { "Typst could not compile this".into() } else { out.join("\n") }
}

fn compile(world: &VaultWorld, shift: usize) -> Result<PagedDocument, String> {
    typst::compile::<PagedDocument>(world).output.map_err(|e| explain(world, &e, shift))
}

/// A ```typst fence as the page gets it: its pages, or why Typst could not draw it.
#[derive(Debug, serde::Serialize, ts_rs::TS)]
#[serde(tag = "kind", rename_all = "lowercase")]
#[ts(export)]
pub enum TypstDrawn {
    Pages { svg: Vec<String> },
    Error { error: String },
}

/// The fence drawn for the page.
pub fn draw(root: &Path, note: &str, source: &str) -> TypstDrawn {
    match fence_svg(root, note, source) {
        Ok(svg) => TypstDrawn::Pages { svg },
        Err(error) => TypstDrawn::Error { error },
    }
}

/// Where a fence of the note at `note` stands for the compiler: beside the note, so it names pictures as the note does.
fn fence_main(note: &str) -> String {
    match Path::new(note).parent().map(|p| p.to_string_lossy().replace('\\', "/")).filter(|d| !d.is_empty()) {
        Some(dir) => format!("/{dir}/.fence.typ"),
        None => "/.fence.typ".into(),
    }
}

/// A ```typst fence of the note at `note` (a vault path): its pages as SVG, or Typst's errors.
pub fn fence_svg(root: &Path, note: &str, source: &str) -> Result<Vec<String>, String> {
    let world = VaultWorld::new(root, &fence_main(note), Some(format!("{FENCE_PAGE}{source}")))?;
    let doc = compile(&world, FENCE_PAGE.lines().count())?;
    let opts = typst_svg::SvgOptions::default();
    Ok(doc.pages().iter().map(|p| typst_svg::svg(p, &opts)).collect())
}

/// Typst compiled into a PDF at `pdf` (a vault path) → that path. The source is the vault's `.typ` at `typ`, or
/// `source` standing at that path (its pictures read beside it); `fence`: sized to what it holds, as a fence is drawn.
pub fn to_pdf(root: &Path, typ: &str, pdf: &str, source: Option<&str>, fence: bool) -> Result<String, String> {
    let (typ, pdf) = (typ.trim_start_matches('/'), pdf.trim_start_matches('/'));
    if !typ.to_lowercase().ends_with(".typ") || !pdf.to_lowercase().ends_with(".pdf") {
        return Err(format!("Typst compiles a .typ into a .pdf, not {typ} → {pdf}"));
    }
    crate::paths::safe_join(root, typ).map_err(|e| e.to_string())?;
    let out = crate::paths::safe_join(root, pdf).map_err(|e| e.to_string())?;
    let text = source.map(|s| if fence { format!("{FENCE_PAGE}{s}") } else { s.to_string() });
    let world = VaultWorld::new(root, &format!("/{typ}"), text)?;
    let shift = if fence { FENCE_PAGE.lines().count() } else { 0 };
    let doc = compile(&world, shift)?;
    let bytes = typst_pdf::pdf(&doc, &typst_pdf::PdfOptions::default()).map_err(|e| explain(&world, &e, shift))?;
    if let Some(dir) = out.parent() {
        crate::vault_write::mkdir(dir).map_err(|e| e.to_string())?;
    }
    crate::vault_write::write(&out, &bytes).map_err(|e| e.to_string())?;
    Ok(pdf.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_fence_draws_with_pictures_beside_its_note_and_says_where_it_is_wrong() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(dir.path().join("notes")).unwrap();
        std::fs::write(dir.path().join("notes/data.csv"), "a,b\n1,2\n").unwrap();
        let svg = fence_svg(dir.path(), "notes/x.md", "$ E = m c^2 $ #csv(\"data.csv\").len()").unwrap();
        assert_eq!(svg.len(), 1);
        assert!(svg[0].starts_with("<svg") && svg[0].contains("<path"), "{}", &svg[0][..200.min(svg[0].len())]);
        let why = fence_svg(dir.path(), "notes/x.md", "fine\n#nope(1)").unwrap_err();
        assert!(why.starts_with("line 2: ") && why.contains("nope"), "{why}");
        let why = fence_svg(dir.path(), "notes/x.md", "#image(\"../../etc/passwd\")").unwrap_err();
        assert!(!why.is_empty(), "{why}");
        let why = fence_svg(dir.path(), "x.md", "#import \"@preview/not-here:0.0.1\": *").unwrap_err();
        assert!(why.contains("not-here"), "{why}");
    }

    #[test]
    fn a_typ_file_becomes_a_pdf() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(dir.path().join("exports")).unwrap();
        std::fs::write(dir.path().join("exports/x.typ"), "= Title\nSome text with $integral_0^1 x dif x$.\n").unwrap();
        assert_eq!(to_pdf(dir.path(), "exports/x.typ", "exports/x.pdf", None, false).unwrap(), "exports/x.pdf");
        assert!(std::fs::read(dir.path().join("exports/x.pdf")).unwrap().starts_with(b"%PDF"));
        assert!(to_pdf(dir.path(), "exports/x.typ", "../x.pdf", None, false).is_err());
        // a text standing beside a note: its pictures read there, the PDF where asked
        std::fs::write(dir.path().join("exports/dot.svg"), "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"4\" height=\"4\"/>").unwrap();
        to_pdf(dir.path(), "exports/.fence.typ", ".atlas/cache/f.pdf", Some("#image(\"dot.svg\")"), true).unwrap();
        assert!(dir.path().join(".atlas/cache/f.pdf").is_file());
    }
}
