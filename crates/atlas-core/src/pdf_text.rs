//! PDF text for search (PLAN.md slice 4, "search md + pdf text"): ripgrep already searches notes in
//! ~20 ms, so the index that was missing is PDF text. Each PDF's text is extracted once with
//! `pdftotext` into `.atlas/cache/pdftext/<pdf path>.txt` (rebuilt when the PDF is newer) and searched
//! with the same rg; a hit maps back to the PDF and its page (`\f` separates pages). The same pass draws each PDF's
//! cover (thumbs.rs `pdf_cover`), at start and whenever a PDF arrives.
use crate::api::LineHit;
use crate::config::Config;
use crate::{vault_write, walk};
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};

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
        let ok = std::process::Command::new("pdftotext")
            .args(["-enc", "UTF-8", "-q"])
            .arg(&abs)
            .arg(&tmp)
            .status()
            .is_ok_and(|s| s.success());
        // a PDF with no text layer still gets an (empty) entry, so it is not retried on every search
        if !ok {
            let _ = vault_write::cache::write(&tmp, b"");
        }
        if vault_write::cache::rename(&tmp, &out).is_ok() {
            n += 1;
        }
    }
    n
}

static RUNNING: AtomicBool = AtomicBool::new(false);

/// `refresh` on a background thread, at most one at a time (startup, and after each search so new
/// PDFs join the next one). Without `pdftotext` installed it does nothing.
pub fn refresh_in_background(root: &Path, cfg: &Config) {
    if RUNNING.swap(true, Ordering::SeqCst) {
        return;
    }
    let (root, cfg) = (root.to_path_buf(), cfg.clone());
    std::thread::spawn(move || {
        let t = std::time::Instant::now();
        let n = refresh(&root, &cfg);
        if n > 0 {
            eprintln!("atlas: PDF text for search — {n} extracted in {:.1}s", t.elapsed().as_secs_f32());
        }
        RUNNING.store(false, Ordering::SeqCst);
    });
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
