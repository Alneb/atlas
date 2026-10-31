//! PDF text for search (PLAN.md slice 4, "search md + pdf text"): ripgrep already searches notes in
//! ~20 ms, so the index that was missing is PDF text. Each PDF's text is extracted once into
//! `.atlas/cache/pdftext/<pdf path>.txt` (rebuilt when the PDF is newer) and searched with the same rg; a hit maps
//! back to the PDF and its page (`\f` separates pages). The text is read in Rust (pdf_oxide), so a new computer needs
//! no poppler; `pdftotext` is asked only for a PDF that reader cannot open, when it is installed. The same pass draws
//! each PDF's cover (thumbs.rs `pdf_cover`), at start and whenever a PDF arrives.
use crate::api::LineHit;
use crate::config::Config;
use crate::{vault_write, walk};
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{Duration, Instant};

pub const CACHE: &str = ".atlas/cache/pdftext";

/// Extract text for every PDF whose cache is missing or stale; returns how many were (re)extracted.
pub fn refresh(root: &Path, cfg: &Config) -> usize {
    let mut n = 0;
    for (abs, rel) in walk::files(root, cfg).filter(|(_, rel)| rel.to_lowercase().ends_with(".pdf")) {
        // its cover too, drawn once here rather than by every page that shows it (thumbs.rs)
        let _ = crate::thumbs::pdf_cover(&root.join(".atlas/cache"), &rel, &abs);
        let out = root.join(CACHE).join(format!("{rel}.txt"));
        let newer = |a: &Path, b: &Path| -> bool {
            match (std::fs::metadata(a).and_then(|m| m.modified()), std::fs::metadata(b).and_then(|m| m.modified())) {
                (Ok(x), Ok(y)) => x > y,
                (Ok(_), Err(_)) => true,
                _ => false,
            }
        };
        if !newer(&abs, &out) {
            continue;
        }
        let _ = vault_write::cache::mkdir(out.parent().expect("cache file has a folder"));
        let tmp = out.with_extension("tmp");
        // a PDF with no text layer still gets an (empty) entry, so it is not retried on every search
        let _ = vault_write::cache::write(&tmp, extract(&abs).as_bytes());
        if vault_write::cache::rename(&tmp, &out).is_ok() {
            n += 1;
        }
    }
    n
}

/// Longer than this for one PDF, and the reader is left to finish on its own while pdftotext is asked.
const EXTRACT_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(60);

/// A PDF's text, each page ending in a form feed (as pdftotext writes it); empty when nothing can read it.
pub fn extract(abs: &Path) -> String {
    let path = abs.to_path_buf();
    let (tx, rx) = std::sync::mpsc::channel();
    // its own thread: a malformed PDF that panics or loops in the reader never stops the pass
    std::thread::spawn(move || {
        let _ = tx.send(std::panic::catch_unwind(|| oxide_text(&path)).ok().flatten());
    });
    match rx.recv_timeout(EXTRACT_TIMEOUT) {
        Ok(Some(text)) => text,
        _ => pdftotext(abs).unwrap_or_default(),
    }
}

/// The text by pdf_oxide, page by page; None when it cannot open the PDF.
fn oxide_text(abs: &Path) -> Option<String> {
    let doc = pdf_oxide::PdfDocument::open(abs).ok()?;
    let mut out = String::new();
    for i in 0..doc.page_count().ok()? {
        out += &doc.extract_text(i).unwrap_or_default();
        out.push('\x0c');
    }
    Some(out)
}

/// The text by `pdftotext`, when it is installed.
fn pdftotext(abs: &Path) -> Option<String> {
    let mut cmd = std::process::Command::new("pdftotext");
    cmd.args(["-enc", "UTF-8", "-q"]).arg(abs).arg("-");
    let o = crate::platform::host::std_command(cmd).ok()?.stderr(std::process::Stdio::null()).output().ok()?;
    o.status.success().then(|| String::from_utf8_lossy(&o.stdout).into_owned())
}

/// The vaults with a pass running, each with whether another was asked for meanwhile: that one runs right after, so a
/// PDF that arrives during a pass is not left out until something asks again.
static RUNNING: Mutex<Vec<(PathBuf, bool)>> = Mutex::new(Vec::new());

/// `refresh` on a background thread, one pass per vault at a time (at start, when a PDF arrives, and [`catch_up`]).
pub fn refresh_in_background(root: &Path, cfg: &Config) {
    {
        let mut running = RUNNING.lock().unwrap_or_else(|e| e.into_inner());
        if let Some(r) = running.iter_mut().find(|(r, _)| r == root) {
            r.1 = true;
            return;
        }
        running.push((root.to_path_buf(), false));
    }
    let (root, cfg) = (root.to_path_buf(), cfg.clone());
    std::thread::spawn(move || loop {
        let t = Instant::now();
        let n = refresh(&root, &cfg);
        if n > 0 {
            eprintln!("atlas: PDF text for search — {n} extracted in {:.1}s", t.elapsed().as_secs_f32());
        }
        let mut running = RUNNING.lock().unwrap_or_else(|e| e.into_inner());
        let Some(i) = running.iter().position(|(r, _)| *r == root) else { return };
        if !std::mem::take(&mut running[i].1) {
            running.remove(i);
            return;
        }
    });
}

/// How often a search may start a pass of its own: arrivals are the watcher's, this only catches what it could not
/// see (a vault served without one). Every search started a whole walk of the vault before, a pass per key typed.
const CATCH_UP: Duration = Duration::from_secs(10 * 60);
static CAUGHT_UP: Mutex<Vec<(PathBuf, Instant)>> = Mutex::new(Vec::new());

/// [`refresh_in_background`] when this vault's last search-started pass is older than [`CATCH_UP`].
pub fn catch_up(root: &Path, cfg: &Config) {
    let now = Instant::now();
    {
        let mut last = CAUGHT_UP.lock().unwrap_or_else(|e| e.into_inner());
        match last.iter_mut().find(|(r, _)| r == root) {
            Some((_, at)) if now.saturating_duration_since(*at) < CATCH_UP => return,
            Some((_, at)) => *at = now,
            None => last.push((root.to_path_buf(), now)),
        }
    }
    refresh_in_background(root, cfg);
}

/// Search hits from the cache, mapped back to `<pdf>` with the page in `line` and a `p. N ·` prefix.
pub fn hits(cache_hits: Vec<LineHit>, root: &Path) -> Vec<LineHit> {
    let prefix = format!("{CACHE}/");
    let mut pages: std::collections::HashMap<String, Vec<u32>> = Default::default();
    cache_hits
        .into_iter()
        .filter_map(|h| {
            let pdf = h.path.strip_prefix(&prefix)?.strip_suffix(".txt")?.to_string();
            // page of each line: 1 + form feeds before it
            let starts = pages.entry(h.path.clone()).or_insert_with(|| {
                let text = std::fs::read_to_string(root.join(&h.path)).unwrap_or_default();
                let mut page = 1;
                text.split('\n')
                    .map(|l| {
                        // a form feed opening the line starts its page; later ones start the next line's
                        let lead = l.chars().take_while(|c| *c == '\u{c}').count() as u32;
                        page += lead;
                        let p = page;
                        page += l.matches('\u{c}').count() as u32 - lead;
                        p
                    })
                    .collect()
            });
            let page = starts.get(h.line.saturating_sub(1) as usize).copied().unwrap_or(1);
            Some(LineHit { path: pdf, line: page, text: format!("p. {page} · {}", h.text.trim_start_matches('\u{c}')) })
        })
        .collect()
}

#[cfg(test)]
mod tests {
    #[test]
    fn search_finds_pdf_text_and_reports_the_page() {
        let d = tempfile::tempdir().unwrap();
        let cache = d.path().join(super::CACHE).join("refs/paper.pdf.txt");
        std::fs::create_dir_all(cache.parent().unwrap()).unwrap();
        std::fs::write(&cache, "Introduction\nnothing here\n\u{c}The Hubbard model\non page two\n").unwrap();
        std::fs::write(d.path().join("note.md"), "Hubbard in a note\n").unwrap();
        let r = crate::search::search(d.path(), &crate::config::Config::default(), "hubbard");
        let paths: Vec<(&str, u32)> = r.lines.iter().map(|h| (h.path.as_str(), h.line)).collect();
        assert_eq!(paths, [("note.md", 1), ("refs/paper.pdf", 2)], "{r:?}");
        assert_eq!(r.lines[1].text, "p. 2 · The Hubbard model");
    }
}

#[cfg(test)]
mod extract_tests {
    /// A PDF of `pages`, each one line of Helvetica text.
    fn text_pdf(pages: &[&str]) -> Vec<u8> {
        let mut objs = vec!["<< /Type /Catalog /Pages 2 0 R >>".to_string(), String::new(), "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>".to_string()];
        let kids: Vec<String> = (0..pages.len()).map(|i| format!("{} 0 R", 4 + 2 * i)).collect();
        objs[1] = format!("<< /Type /Pages /Kids [{}] /Count {} >>", kids.join(" "), pages.len());
        for (i, t) in pages.iter().enumerate() {
            let body = format!("BT /F1 18 Tf 72 700 Td ({t}) Tj ET");
            objs.push(format!("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents {} 0 R >>", 5 + 2 * i));
            objs.push(format!("<< /Length {} >>\nstream\n{body}\nendstream", body.len()));
        }
        let mut out = String::from("%PDF-1.4\n");
        let mut at = vec![];
        for (i, o) in objs.iter().enumerate() {
            at.push(out.len());
            out += &format!("{} 0 obj\n{o}\nendobj\n", i + 1);
        }
        let xref = out.len();
        out += &format!("xref\n0 {}\n0000000000 65535 f \n", objs.len() + 1);
        for n in at {
            out += &format!("{n:010} 00000 n \n");
        }
        out += &format!("trailer\n<< /Size {} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n", objs.len() + 1);
        out.into_bytes()
    }

    #[test]
    fn the_text_is_read_in_rust_a_page_per_form_feed() {
        let d = tempfile::tempdir().unwrap();
        let pdf = d.path().join("a.pdf");
        std::fs::write(&pdf, text_pdf(&["The quantum dot model", "Second page words"])).unwrap();
        let text = super::oxide_text(&pdf).expect("read without pdftotext");
        let pages: Vec<&str> = text.split('\x0c').collect();
        assert_eq!(pages.len(), 3, "each page ends in a form feed: {text:?}");
        assert!(pages[0].contains("quantum dot") && pages[1].contains("Second page"), "{text:?}");
        std::fs::write(&pdf, b"not a pdf").unwrap();
        assert!(super::oxide_text(&pdf).is_none());
        assert_eq!(super::extract(&pdf), "", "nothing reads it: empty, not an error");
    }
}
