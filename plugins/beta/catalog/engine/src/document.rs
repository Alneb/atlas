//! A link to a file people read — a PDF, an EPUB, a DjVu — in a vault where no subplugin claims it (catalog-papers
//! claims PDFs where References runs): the file is downloaded into the vault's documents folder under its own name and
//! gets its companion note through the core's one path (`POST /api/companion`). These are the pure decisions; the
//! engine (`Engine::download`) does the calls.
use crate::model::canonical_url;

/// The extensions of a document worth keeping as a file (lower-case). Anything else (a video, an archive) is not one.
pub const DOCUMENTS: &[&str] = &["pdf", "epub", "djvu", "mobi", "azw3", "fb2", "cbz", "docx", "odt", "rtf"];

/// The PDF pages read for an ISBN: the copyright page sits within the first few (catalog-papers reads as many).
pub const PAGES_READ: usize = 8;

/// A link to a document file, as it will be kept.
#[derive(Debug, Clone, PartialEq)]
pub struct FileLink {
    /// the address as captured
    pub url: String,
    /// lower-case extension (`pdf`)
    pub ext: String,
    /// the file's decoded name with its extension (`Group Theory (2010).pdf`), safe as one path segment
    pub name: String,
}

impl FileLink {
    /// `url` when its last path segment names a document (`….pdf`, `….epub?dl=1`); None for a page or another file.
    pub fn of(url: &str) -> Option<FileLink> {
        if !(url.starts_with("http://") || url.starts_with("https://")) {
            return None;
        }
        let path = url.split(['?', '#']).next().unwrap_or(url);
        let last = path.split_once("://").map_or(path, |(_, r)| r).split_once('/')?.1.rsplit('/').next()?;
        let (_, ext) = last.rsplit_once('.')?;
        let ext = ext.to_ascii_lowercase();
        if !DOCUMENTS.contains(&ext.as_str()) {
            return None;
        }
        Some(FileLink { url: url.to_string(), name: safe_name(&atlas_text::links::percent_decoded(last), &ext), ext })
    }

    /// The name without its extension: the companion note's name and, with no better one, the title.
    pub fn stem(&self) -> &str {
        self.name.rsplit_once('.').map_or(self.name.as_str(), |(s, _)| s)
    }

    /// The address as compared with a note's `url` (tracking and fragments off).
    pub fn canonical(&self) -> String {
        canonical_url(&self.url)
    }

    /// The name the core's fetch saves it under in the plugin's cache, before it is moved into the vault: one per
    /// address, so a retry writes over a failed try instead of piling up.
    pub fn cache_name(&self) -> String {
        let h = self.url.bytes().fold(0xcbf2_9ce4_8422_2325u64, |h, b| (h ^ b as u64).wrapping_mul(0x100_0000_01b3));
        format!("downloads/{h:016x}.{}", self.ext)
    }
}

/// One path segment from a decoded file name: no separators, no control characters, no leading dots, not empty; the
/// extension kept as the link has it.
fn safe_name(decoded: &str, ext: &str) -> String {
    // the extension off first: `.pdf` alone is a file with no name, not one named `pdf`
    let decoded = decoded.rsplit_once('.').map_or(decoded, |(s, _)| s);
    let cleaned: String = decoded.chars().map(|c| if c.is_control() || matches!(c, '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|') { ' ' } else { c }).collect();
    let cleaned = cleaned.split_whitespace().collect::<Vec<_>>().join(" ");
    let stem = cleaned.trim_start_matches('.').trim();
    let stem = if stem.is_empty() { "document" } else { stem };
    format!("{stem}.{ext}")
}

/// `name.ext` in `folder`, else `name 2.ext`, `name 3.ext`… — never over another file, and never beside a note of
/// that name (the companion note is `name.md`: one already there would be taken for this file's).
pub fn free_name(folder: &str, link: &FileLink, taken: impl Fn(&str) -> Result<bool, String>) -> Result<String, String> {
    let at = |stem: &str| (format!("{folder}/{stem}.{}", link.ext), format!("{folder}/{stem}.md"));
    for n in 1..100 {
        let stem = if n == 1 { link.stem().to_string() } else { format!("{} {n}", link.stem()) };
        let (file, note) = at(&stem);
        if !taken(&file)? && !taken(&note)? {
            return Ok(file);
        }
    }
    Err(format!("{folder}/{}: 99 files of that name already", link.name))
}

/// The first pages of a PDF's text (pages end in a form feed, as the core's PDF text has them).
pub fn first_pages(text: &str) -> String {
    text.split('\x0c').take(PAGES_READ).collect::<Vec<_>>().join("\n")
}

/// Whether a download is a page rather than the file (a sign-in, a "your download starts" page): by its content type.
pub fn is_page(content_type: &str) -> bool {
    let t = content_type.to_ascii_lowercase();
    t.starts_with("text/html") || t.starts_with("application/xhtml")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_document_link_keeps_its_decoded_name_and_other_links_are_not_documents() {
        let l = FileLink::of("https://files.example.org/Livros/Dresselhaus%20-%20Group%20Theory%20(2010).pdf?dl=1").unwrap();
        assert_eq!((l.ext.as_str(), l.name.as_str(), l.stem()), ("pdf", "Dresselhaus - Group Theory (2010).pdf", "Dresselhaus - Group Theory (2010)"));
        assert_eq!(FileLink::of("https://x.example.org/b/Teor%C3%ADa.EPUB").unwrap().name, "Teoría.epub");
        assert_eq!(FileLink::of("https://x.example.org/a%2F..%2Fb.pdf").unwrap().name, "a .. b.pdf", "no separator survives decoding");
        assert_eq!(FileLink::of("https://x.example.org/.pdf").unwrap().name, "document.pdf");
        for u in ["https://example.org/post", "https://example.org/a.html", "https://x.example.org/v.mp4", "https://x.example.org/a.zip", "https://example.org", "ftp://x.example.org/a.pdf"] {
            assert_eq!(FileLink::of(u), None, "{u}");
        }
        assert_ne!(l.cache_name(), FileLink::of("https://files.example.org/other.pdf").unwrap().cache_name());
        assert!(l.cache_name().starts_with("downloads/") && l.cache_name().ends_with(".pdf"));
    }

    #[test]
    fn a_free_name_avoids_files_and_notes_of_that_name() {
        let l = FileLink::of("https://x.example.org/Book.pdf").unwrap();
        let taken = ["documents/Book.pdf", "documents/Book 2.md"];
        assert_eq!(free_name("documents", &l, |p| Ok(taken.contains(&p))).unwrap(), "documents/Book 3.pdf");
        assert_eq!(free_name("documents", &l, |_| Ok(false)).unwrap(), "documents/Book.pdf");
    }

    #[test]
    fn the_first_pages_and_a_page_for_a_file() {
        assert_eq!(first_pages(&(0..12).map(|i| format!("p{i}\x0c")).collect::<String>()), "p0\np1\np2\np3\np4\np5\np6\np7");
        assert!(is_page("text/html; charset=utf-8") && !is_page("application/pdf") && !is_page("application/octet-stream"));
    }
}
