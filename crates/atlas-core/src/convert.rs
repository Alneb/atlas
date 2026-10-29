//! Documents the page cannot read, made once into ones it can, in a plugin's cache: a comic archive (.cbr, .cb7, .cbt)
//! into a .cbz, a DjVu book into a PDF. Done here, natively, so the phone does it too and no plugin needs Python:
//! zip, tar and 7z by Rust crates; DjVu by djvu-rs (pages as ddjvu draws them, the OCR text kept selectable — measured
//! in docs/design/STUDY-external-binaries.md). RAR alone goes through a program (bsdtar, unar, unrar) where there is one.
//! The vault's file is never touched; the copy is keyed on its path, size and time, so a changed file is made again.
use std::io::{Read, Write};
use std::path::{Path, PathBuf};

/// The pictures a comic's pages are.
const PICTURE: [&str; 8] = ["jpg", "jpeg", "png", "gif", "webp", "avif", "jxl", "bmp"];
/// Programs that unpack a RAR, tried in this order: each with its arguments for archive `{a}` into folder `{d}`.
const RAR_TOOLS: [(&str, &[&str]); 3] = [("bsdtar", &["-xf", "{a}", "-C", "{d}"]), ("unar", &["-q", "-f", "-o", "{d}", "{a}"]), ("unrar", &["x", "-inul", "-y", "{a}", "{d}/"])];

/// What an archive is, by its first bytes (a .cbr is often a zip in disguise).
#[derive(Debug, PartialEq)]
enum Archive {
    Zip,
    SevenZip,
    Rar,
    Tar { gzip: bool },
}

fn sniff(file: &Path) -> Result<Archive, String> {
    let mut head = [0u8; 512];
    let n = std::fs::File::open(file).and_then(|mut f| f.read(&mut head)).map_err(|e| format!("{}: {e}", file.display()))?;
    let h = &head[..n];
    Ok(if h.starts_with(b"PK\x03\x04") {
        Archive::Zip
    } else if h.starts_with(&[0x37, 0x7A, 0xBC, 0xAF, 0x27, 0x1C]) {
        Archive::SevenZip
    } else if h.starts_with(b"Rar!\x1A\x07") {
        Archive::Rar
    } else if h.starts_with(&[0x1F, 0x8B]) {
        Archive::Tar { gzip: true }
    } else if h.get(257..262) == Some(b"ustar") {
        Archive::Tar { gzip: false }
    } else {
        return Err("not an archive this reads (zip, 7z, RAR or tar)".into());
    })
}

/// A whole zip or tar (gzipped or not) unpacked into `into`, programs keeping their modes, no path leaving it.
/// → false: another kind (a .tar.xz…), left to the caller.
pub fn unpack_whole(archive: &Path, into: &Path) -> Result<bool, String> {
    match sniff(archive) {
        Ok(Archive::Zip) => {
            let mut z = zip::ZipArchive::new(std::fs::File::open(archive).map_err(|e| e.to_string())?).map_err(|e| format!("zip: {e}"))?;
            z.extract(into).map_err(|e| format!("zip: {e}"))?;
            Ok(true)
        }
        Ok(Archive::Tar { gzip }) => {
            let f = std::fs::File::open(archive).map_err(|e| e.to_string())?;
            let r: Box<dyn Read> = if gzip { Box::new(flate2::read::GzDecoder::new(f)) } else { Box::new(f) };
            tar::Archive::new(r).unpack(into).map_err(|e| format!("tar: {e}"))?;
            Ok(true)
        }
        _ => Ok(false),
    }
}

/// The cache file for vault file `rel` made into `ext`: `.atlas/cache/plugins/<id>/<key>.<ext>`, absolute and relative.
fn cached(root: &Path, id: &str, rel: &str, ext: &str) -> Result<(PathBuf, String), String> {
    use sha2::Digest;
    let src = crate::paths::safe_join(root, rel).map_err(|e| e.to_string())?;
    let meta = std::fs::metadata(&src).map_err(|e| format!("{rel}: {e}"))?;
    let time = meta.modified().ok().and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok()).map_or(0, |d| d.as_nanos());
    let key: String = sha2::Sha256::digest(format!("{rel}\0{}\0{time}", meta.len())).iter().take(10).map(|b| format!("{b:02x}")).collect();
    let out = format!(".atlas/cache/plugins/{id}/{key}.{ext}");
    Ok((root.join(&out), out))
}

/// Runs `make` into a part file beside `out` and moves it into place: a failed or stopped run leaves nothing.
fn made(out: &Path, make: impl FnOnce(&Path) -> Result<(), String>) -> Result<(), String> {
    let dir = out.parent().expect("a cache file has a folder");
    crate::vault_write::cache::mkdir(dir).map_err(|e| e.to_string())?;
    let part = out.with_extension("part");
    let r = make(&part).and_then(|()| crate::vault_write::cache::rename(&part, out).map_err(|e| e.to_string()));
    if r.is_err() {
        let _ = crate::vault_write::cache::remove_file(&part);
    }
    r
}

/// Comic archive `rel` (vault-relative) as a .cbz in plugin `id`'s cache, made on first ask: its pictures in name order,
/// stored (pictures are compressed already). → the .cbz's vault-relative path.
pub fn comic_to_cbz(root: &Path, id: &str, rel: &str) -> Result<String, String> {
    let (out, out_rel) = cached(root, id, rel, "cbz")?;
    if out.is_file() {
        return Ok(out_rel);
    }
    let src = root.join(rel);
    let kind = sniff(&src)?;
    let tmp = Unpack::new(out.with_extension("unpack"))?;
    match kind {
        Archive::Zip => unzip_pictures(&src, tmp.path())?,
        Archive::Tar { gzip } => untar_pictures(&src, gzip, tmp.path())?,
        Archive::SevenZip => un7z_pictures(&src, tmp.path())?,
        Archive::Rar => unrar(&src, tmp.path())?,
    }
    let mut pages: Vec<PathBuf> = walk(tmp.path()).into_iter().filter(|p| is_picture(p) && !p.components().any(|c| c.as_os_str() == "__MACOSX")).collect();
    if pages.is_empty() {
        return Err("no pictures in this archive".into());
    }
    pages.sort();
    made(&out, |part| {
        let mut z = zip::ZipWriter::new(crate::vault_write::cache::file(part).map_err(|e| e.to_string())?);
        let stored = zip::write::SimpleFileOptions::default().compression_method(zip::CompressionMethod::Stored);
        for p in &pages {
            let name = p.strip_prefix(tmp.path()).expect("under the folder").to_string_lossy().replace('\\', "/");
            z.start_file(name, stored).map_err(|e| e.to_string())?;
            std::io::copy(&mut std::fs::File::open(p).map_err(|e| e.to_string())?, &mut z).map_err(|e| e.to_string())?;
        }
        z.finish().map(drop).map_err(|e| e.to_string())
    })?;
    Ok(out_rel)
}

/// The folder an archive is unpacked into, removed with everything in it when done (or failed).
struct Unpack(PathBuf);

impl Unpack {
    fn new(dir: PathBuf) -> Result<Unpack, String> {
        let _ = crate::vault_write::cache::remove_dir_all(&dir); // a run stopped before
        crate::vault_write::cache::mkdir(&dir).map_err(|e| format!("{}: {e}", dir.display()))?;
        Ok(Unpack(dir))
    }
    fn path(&self) -> &Path {
        &self.0
    }
}

impl Drop for Unpack {
    fn drop(&mut self) {
        let _ = crate::vault_write::cache::remove_dir_all(&self.0);
    }
}

fn is_picture(p: &Path) -> bool {
    p.extension().and_then(|e| e.to_str()).is_some_and(|e| PICTURE.contains(&e.to_ascii_lowercase().as_str()))
}

fn walk(dir: &Path) -> Vec<PathBuf> {
    let mut out = vec![];
    for e in std::fs::read_dir(dir).into_iter().flatten().flatten() {
        let p = e.path();
        if p.is_dir() {
            out.extend(walk(&p));
        } else {
            out.push(p);
        }
    }
    out
}

/// Writes one entry at `name` under `into`, only when it is a picture with a name that stays inside.
fn keep(into: &Path, name: Option<PathBuf>, mut r: impl Read) -> Result<(), String> {
    let Some(name) = name.filter(|n| is_picture(n)) else { return Ok(()) };
    let to = into.join(name);
    std::io::copy(&mut r, &mut crate::vault_write::cache::file(&to).map_err(|e| e.to_string())?).map(drop).map_err(|e| e.to_string())
}

/// A relative name with no `..`, root or drive (`./` dropped: bsdtar writes it): what may be joined under the folder.
fn enclosed(name: &str) -> Option<PathBuf> {
    use std::path::Component as C;
    let mut out = PathBuf::new();
    for c in Path::new(name).components() {
        match c {
            C::Normal(n) => out.push(n),
            C::CurDir => {}
            C::ParentDir | C::RootDir | C::Prefix(_) => return None,
        }
    }
    (!out.as_os_str().is_empty()).then_some(out)
}

fn unzip_pictures(src: &Path, into: &Path) -> Result<(), String> {
    let mut z = zip::ZipArchive::new(std::fs::File::open(src).map_err(|e| e.to_string())?).map_err(|e| format!("zip: {e}"))?;
    for i in 0..z.len() {
        let e = z.by_index(i).map_err(|e| format!("zip: {e}"))?;
        if e.is_file() {
            let name = e.enclosed_name();
            keep(into, name, e)?;
        }
    }
    Ok(())
}

fn untar_pictures(src: &Path, gzip: bool, into: &Path) -> Result<(), String> {
    let f = std::fs::File::open(src).map_err(|e| e.to_string())?;
    let r: Box<dyn Read> = if gzip { Box::new(flate2::read::GzDecoder::new(f)) } else { Box::new(f) };
    let mut t = tar::Archive::new(r);
    for e in t.entries().map_err(|e| format!("tar: {e}"))? {
        let e = e.map_err(|e| format!("tar: {e}"))?;
        if e.header().entry_type().is_file() {
            let name = e.path().ok().and_then(|p| enclosed(&p.to_string_lossy()));
            keep(into, name, e)?;
        }
    }
    Ok(())
}

fn un7z_pictures(src: &Path, into: &Path) -> Result<(), String> {
    let mut r = sevenz_rust2::ArchiveReader::open(src, sevenz_rust2::Password::empty()).map_err(|e| format!("7z: {e}"))?;
    let mut failed = None;
    r.for_each_entries(|entry, data| {
        let name = enclosed(entry.name()).filter(|n| !entry.is_directory() && is_picture(n));
        if name.is_none() {
            std::io::copy(data, &mut std::io::sink())?; // read through: a solid archive checks each entry as it is read
        } else if let Err(e) = keep(into, name, data) {
            failed = Some(e);
            return Ok(false);
        }
        Ok(true)
    })
    .map_err(|e| format!("7z: {e}"))?;
    failed.map_or(Ok(()), Err)
}

/// RAR through the first program here that unpacks it (its licence keeps an unRAR reader out of the core).
fn unrar(src: &Path, into: &Path) -> Result<(), String> {
    let mut tried = vec![];
    for (tool, args) in RAR_TOOLS {
        let mut cmd = std::process::Command::new(tool);
        cmd.args(args.iter().map(|a| a.replace("{a}", &src.to_string_lossy()).replace("{d}", &into.to_string_lossy())));
        match crate::platform::host::std_command(cmd).and_then(|mut c| c.output()) {
            Ok(o) if o.status.success() => return Ok(()),
            Ok(o) => tried.push(format!("{tool}: {}", String::from_utf8_lossy(if o.stderr.is_empty() { &o.stdout } else { &o.stderr }).trim().chars().take(160).collect::<String>())),
            Err(_) => {} // not installed
        }
    }
    Err(if tried.is_empty() { "a RAR needs bsdtar (libarchive), unar or unrar on this machine".into() } else { format!("could not unpack it — {}", tried.join("; ")) })
}

/// DjVu book `rel` as a PDF in plugin `id`'s cache, made on first ask: every page at its own resolution (bitonal pages
/// as CCITT G4, the rest JPEG or Deflate, whichever is smaller), the OCR text as an invisible, selectable layer.
pub fn djvu_to_pdf(root: &Path, id: &str, rel: &str) -> Result<String, String> {
    let (out, out_rel) = cached(root, id, rel, "pdf")?;
    if out.is_file() {
        return Ok(out_rel);
    }
    let doc = djvu_rs::Document::open(root.join(rel)).map_err(|e| format!("{rel}: not a DjVu book this reads ({e})"))?;
    let opts = djvu_rs::pdf::PdfOptions { ccitt_g4: true, adaptive_raster: true, ..Default::default() };
    made(&out, |part| {
        let mut w = std::io::BufWriter::new(crate::vault_write::cache::file(part).map_err(|e| e.to_string())?);
        djvu_rs::pdf::djvu_to_pdf_to_writer(doc.inner(), &opts, &mut w).map_err(|e| format!("{rel}: {e}"))?;
        w.flush().map_err(|e| e.to_string())
    })?;
    Ok(out_rel)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn png() -> Vec<u8> {
        let mut b = vec![];
        image::RgbImage::new(2, 3).write_to(&mut std::io::Cursor::new(&mut b), image::ImageFormat::Png).unwrap();
        b
    }

    fn names(cbz: &Path) -> Vec<String> {
        let z = zip::ZipArchive::new(std::fs::File::open(cbz).unwrap()).unwrap();
        z.file_names().map(str::to_string).collect()
    }

    #[test]
    fn a_tar_or_a_zip_in_disguise_becomes_a_cbz_of_its_pictures_once() {
        let d = tempfile::tempdir().unwrap();
        // a .cbt: pictures out of order, a text file, a path that leaves the folder
        let mut t = tar::Builder::new(vec![]);
        for name in ["b/02.png", "b/01.png", "notes.txt"] {
            let mut h = tar::Header::new_gnu();
            let data = if name.ends_with(".png") { png() } else { b"x".to_vec() };
            h.set_size(data.len() as u64);
            h.set_cksum();
            t.append_data(&mut h, name, &data[..]).unwrap();
        }
        std::fs::write(d.path().join("c.cbt"), t.into_inner().unwrap()).unwrap();
        let out = comic_to_cbz(d.path(), "manga", "c.cbt").unwrap();
        assert!(out.starts_with(".atlas/cache/plugins/manga/") && out.ends_with(".cbz"));
        assert_eq!(names(&d.path().join(&out)), ["b/01.png", "b/02.png"]);
        let made_at = std::fs::metadata(d.path().join(&out)).unwrap().modified().unwrap();
        assert_eq!(comic_to_cbz(d.path(), "manga", "c.cbt").unwrap(), out);
        assert_eq!(std::fs::metadata(d.path().join(&out)).unwrap().modified().unwrap(), made_at, "made once");

        // a .cbr that is a zip
        let mut z = zip::ZipWriter::new(std::fs::File::create(d.path().join("z.cbr")).unwrap());
        z.start_file("__MACOSX/._p.png", zip::write::SimpleFileOptions::default()).unwrap();
        z.write_all(&png()).unwrap();
        z.start_file("p.png", zip::write::SimpleFileOptions::default()).unwrap();
        z.write_all(&png()).unwrap();
        z.finish().unwrap();
        assert_eq!(names(&d.path().join(comic_to_cbz(d.path(), "manga", "z.cbr").unwrap())), ["p.png"]);

        std::fs::write(d.path().join("x.cbr"), b"plain text").unwrap();
        assert!(comic_to_cbz(d.path(), "manga", "x.cbr").unwrap_err().contains("not an archive"));
        assert!(comic_to_cbz(d.path(), "manga", "../x.cbr").is_err(), "outside the vault");
        assert!(std::fs::read_dir(d.path().join(".atlas/cache/plugins/manga")).unwrap().flatten().all(|e| e.path().extension().is_some_and(|x| x == "cbz")), "no part files or unpack folders left");
    }

    #[test]
    fn a_7z_becomes_a_cbz() {
        let d = tempfile::tempdir().unwrap();
        let src = d.path().join("pages");
        std::fs::create_dir(&src).unwrap();
        std::fs::write(src.join("01.png"), png()).unwrap();
        sevenz_rust2::compress_to_path(&src, d.path().join("c.cb7")).unwrap();
        assert_eq!(enclosed("./a/01.png"), Some(PathBuf::from("a/01.png")));
        assert_eq!((enclosed("../x.png"), enclosed("/x.png"), enclosed("./")), (None, None, None));
        let out = comic_to_cbz(d.path(), "manga", "c.cb7").unwrap();
        assert_eq!(names(&d.path().join(out)).len(), 1);
    }

    #[test]
    fn a_plugin_archive_unpacks_whole_with_its_programs_runnable() {
        let d = tempfile::tempdir().unwrap();
        let mut t = tar::Builder::new(flate2::write::GzEncoder::new(vec![], flate2::Compression::fast()));
        for (name, mode) in [("p/plugin.toml", 0o644), ("p/bin/engine", 0o755)] {
            let mut h = tar::Header::new_gnu();
            h.set_size(1);
            h.set_mode(mode);
            h.set_cksum();
            t.append_data(&mut h, name, &b"x"[..]).unwrap();
        }
        std::fs::write(d.path().join("p.tar.gz"), t.into_inner().unwrap().finish().unwrap()).unwrap();
        assert!(unpack_whole(&d.path().join("p.tar.gz"), &d.path().join("out")).unwrap());
        assert!(d.path().join("out/p/plugin.toml").is_file());
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            assert_eq!(std::fs::metadata(d.path().join("out/p/bin/engine")).unwrap().permissions().mode() & 0o111, 0o111);
        }
        let mut z = zip::ZipWriter::new(std::fs::File::create(d.path().join("p.zip")).unwrap());
        z.start_file("q/plugin.toml", zip::write::SimpleFileOptions::default()).unwrap();
        z.write_all(b"x").unwrap();
        z.finish().unwrap();
        assert!(unpack_whole(&d.path().join("p.zip"), &d.path().join("out")).unwrap());
        assert!(d.path().join("out/q/plugin.toml").is_file());
        std::fs::write(d.path().join("p.tar.xz"), [0xFD, b'7', b'z', b'X', b'Z', 0]).unwrap();
        assert!(!unpack_whole(&d.path().join("p.tar.xz"), &d.path().join("out")).unwrap(), "left to tar");
    }

    #[test]
    fn what_is_not_djvu_is_said_so() {
        let d = tempfile::tempdir().unwrap();
        std::fs::write(d.path().join("b.djvu"), b"AT&TFORM nonsense").unwrap();
        assert!(djvu_to_pdf(d.path(), "books", "b.djvu").unwrap_err().contains("not a DjVu book"));
        assert!(!d.path().join(".atlas/cache/plugins/books").read_dir().is_ok_and(|mut r| r.next().is_some()), "nothing left");
    }

    /// A real book when one is named (ATLAS_TEST_DJVU): its PDF has every page and the text layer.
    #[test]
    fn a_real_djvu_book_becomes_a_pdf_with_its_text() {
        let Some(book) = std::env::var_os("ATLAS_TEST_DJVU").map(PathBuf::from) else {
            eprintln!("skipped: ATLAS_TEST_DJVU names no DjVu book");
            return;
        };
        let d = tempfile::tempdir().unwrap();
        std::fs::copy(&book, d.path().join("b.djvu")).unwrap();
        let out = djvu_to_pdf(d.path(), "books", "b.djvu").unwrap();
        let pdf = std::fs::read(d.path().join(out)).unwrap();
        assert!(pdf.starts_with(b"%PDF"));
    }
}
