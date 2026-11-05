//! Search: filename "contains every token" match over the walk, plus ripgrep's searcher (its crates, linked in) for content.
use crate::api::{FileWrite, LineHit, ReplaceResult, SearchResults};
use crate::config::Config;
use crate::{files, walk, Error, Result, Workspace};
use grep_regex::{RegexMatcher, RegexMatcherBuilder};
use grep_searcher::{sinks::UTF8, BinaryDetection, Searcher, SearcherBuilder};
use std::path::Path;

pub const MAX_RESULTS: usize = 200;

/// Line-search options (the Search pane's Aa / whole-word / .* toggles).
#[derive(Debug, Clone, Copy, Default)]
pub struct Opts {
    pub case: bool,
    pub word: bool,
    pub regex: bool,
    /// Also look in the agent's own files (`editor.index_exclude`); off by default.
    pub agent: bool,
    /// Only the text of the vault's PDFs (pdf_text.rs's cache), not the files; without it the PDFs' hits come after
    /// the files' (a quarter of the results at most).
    pub pdf: bool,
}

pub fn search(root: &Path, cfg: &Config, q: &str) -> SearchResults {
    search_with(root, cfg, q, Opts::default())
}

pub fn search_with(root: &Path, cfg: &Config, q: &str, o: Opts) -> SearchResults {
    if q.trim().is_empty() {
        return SearchResults::default();
    }
    // `tag:physics/dmft` lists the notes with that tag (or one nested under it) — tags.rs
    if let Some(tag) = q.trim().strip_prefix("tag:") {
        return SearchResults { files: crate::tags::notes(root, cfg, tag), lines: Vec::new() };
    }
    // one walk for both the lines and the names
    let walked: Vec<(std::path::PathBuf, String)> = walk::files(root, cfg).filter(|(_, rel)| o.agent || !cfg.is_agent_file(rel)).collect();
    crate::pdf_text::catch_up(root, cfg);
    if o.pdf {
        return SearchResults { files: Vec::new(), lines: pdf_lines(root, cfg, q, o, &walked) };
    }
    // notes first (a stable sort keeps the walk's order within each), so their hits lead and fill the cap first
    let mut texts: Vec<_> = walked.iter().filter(|&(abs, _)| small(abs)).cloned().collect();
    texts.sort_by_key(|(_, rel)| !rel.ends_with(".md"));
    // the PDFs' text read at the same time as the files, listed after their hits; the papers keep up to a quarter of
    // the results, so a common word in notes cannot crowd them out
    let (mut lines, pdf) = std::thread::scope(|s| {
        let pdf = s.spawn(|| pdf_lines(root, cfg, q, o, &walked));
        (lines_over(q, o, texts.into_iter(), true), pdf.join().unwrap_or_default())
    });
    let pdf: Vec<LineHit> = pdf.into_iter().take(MAX_RESULTS / 4).collect();
    lines.truncate(MAX_RESULTS - pdf.len());
    lines.extend(pdf);
    // a hit in a hidden note is its thing's (a drawing's note text → the drawing; companion::thing_of), as the names are;
    // the notes' properties from the index (no note read for them; the watcher keeps it current without a walk)
    let index = crate::links::snapshot(root, cfg);
    let props = |rel: &str| index.parsed.get(rel).and_then(|p| p.props_whole());
    let mut things = std::collections::HashMap::new();
    for l in &mut lines {
        let thing = things.entry(l.path.clone()).or_insert_with(|| crate::companion::thing_in(root, &l.path, props).filter(|t| !t.ends_with(".md")));
        if let Some(t) = thing {
            l.path = t.clone();
        }
    }
    SearchResults { files: if o.regex { Vec::new() } else { match_names(root, walked.into_iter().map(|(_, rel)| rel), q, props) }, lines }
}

/// Only the names [`search_with`] would list, without reading a file: what the Search pane shows at once, while the
/// files' lines are still being read.
pub fn names_with(root: &Path, cfg: &Config, q: &str, o: Opts) -> Vec<String> {
    if q.trim().is_empty() || o.regex || o.pdf {
        return Vec::new();
    }
    if let Some(tag) = q.trim().strip_prefix("tag:") {
        return crate::tags::notes(root, cfg, tag);
    }
    let index = crate::links::snapshot(root, cfg);
    let props = |rel: &str| index.parsed.get(rel).and_then(|p| p.props_whole());
    match_names(root, walk::files(root, cfg).filter(|(_, rel)| o.agent || !cfg.is_agent_file(rel)).map(|(_, rel)| rel), q, props)
}

/// The PDFs' text (pdf_text.rs's cache), each hit mapped back to its PDF and page; only PDFs this walk found: the text
/// of one deleted, moved or now excluded stays in the cache until the next pass.
fn pdf_lines(root: &Path, cfg: &Config, q: &str, o: Opts, walked: &[(std::path::PathBuf, String)]) -> Vec<LineHit> {
    if !root.join(crate::pdf_text::CACHE).is_dir() {
        return Vec::new();
    }
    let cache = lines_over(q, o, text_files(root, cfg, o, crate::pdf_text::CACHE), false);
    let pdfs: std::collections::HashSet<&str> = walked.iter().map(|(_, rel)| rel.as_str()).filter(|r| r.to_lowercase().ends_with(".pdf")).collect();
    crate::pdf_text::hits(cache, root).into_iter().filter(|h| pdfs.contains(h.path.as_str())).collect()
}

/// Every whitespace token must appear (case-insensitive) in the path; basename hits rank first.
pub fn match_files(root: &Path, cfg: &Config, q: &str, agent: bool) -> Vec<String> {
    match_names(root, walk::files(root, cfg).filter(|(_, rel)| agent || !cfg.is_agent_file(rel)).map(|(_, rel)| rel), q, |_| None)
}

/// [`match_files`] over paths already walked.
fn match_names<'p>(root: &Path, paths: impl Iterator<Item = String>, q: &str, props: impl Fn(&str) -> Option<&'p crate::note_props::Props> + Copy) -> Vec<String> {
    let tokens: Vec<String> = q.split_whitespace().map(str::to_lowercase).collect();
    let mut hits: Vec<(bool, usize, String)> = paths
        .filter_map(|rel| {
            let low = rel.to_lowercase();
            if !tokens.iter().all(|t| low.contains(t.as_str())) {
                return None;
            }
            let base = low.rsplit('/').next().unwrap_or(&low);
            let in_base = tokens.iter().all(|t| base.contains(t.as_str()));
            Some((!in_base, rel.len(), rel))
        })
        .collect();
    hits.sort();
    // one hit per thing: a PDF's ink, a mail's attachment, a hidden note are their thing's hit (companion::thing_of)
    let mut seen = std::collections::HashSet::new();
    hits.into_iter()
        .map(|(_, _, p)| crate::companion::thing_in(root, &p, props).unwrap_or(p))
        .filter(|p| seen.insert(p.clone()))
        .take(MAX_RESULTS)
        .collect()
}

/// The lines matching `q` (fixed-string, smart-case unless the options say otherwise), at most [`MAX_RESULTS`].
pub fn rg_lines(root: &Path, cfg: &Config, q: &str, o: Opts) -> Vec<LineHit> {
    lines_in(root, cfg, q, o, ".")
}

/// ripgrep's own searcher (its crates, in this process: no `rg` to install) over [`text_files`] of one folder.
fn lines_in(root: &Path, cfg: &Config, q: &str, o: Opts, dir: &str) -> Vec<LineHit> {
    lines_over(q, o, text_files(root, cfg, o, dir), true)
}

/// ripgrep's searcher over these files (absolute, relative), at most [`MAX_RESULTS`] lines, in the files' order. The
/// files are read on several threads (a vault holds thousands; one thread took seconds); `sniff` first leaves out what
/// is not worth reading ([`worth_reading`]).
fn lines_over(q: &str, o: Opts, files: impl Iterator<Item = (std::path::PathBuf, String)>, sniff: bool) -> Vec<LineHit> {
    use std::sync::atomic::{AtomicUsize, Ordering::Relaxed};
    let Ok(m) = grep_matcher(q, o) else { return Vec::new() }; // a regex being typed
    let files: Vec<_> = files.collect();
    let (next, found) = (AtomicUsize::new(0), AtomicUsize::new(0));
    let per_file = std::sync::Mutex::new(Vec::<(usize, Vec<LineHit>)>::new());
    let workers = std::thread::available_parallelism().map_or(4, |n| n.get()).clamp(1, 8);
    let (next, found, per_file, files) = (&next, &found, &per_file, &files);
    std::thread::scope(|s| {
        for _ in 0..workers {
            let m = m.clone();
            s.spawn(move || {
                let mut searcher = searcher();
                while found.load(Relaxed) < MAX_RESULTS {
                    let i = next.fetch_add(1, Relaxed);
                    let Some((abs, rel)) = files.get(i) else { break };
                    if sniff && !worth_reading(abs, rel) {
                        continue;
                    }
                    let mut hits = Vec::new();
                    let _ = searcher.search_path(&m, abs, UTF8(|n, line| {
                        if let Some(text) = shown_line(line) {
                            hits.push(LineHit { path: rel.clone(), line: n as u32, text });
                        }
                        Ok(hits.len() < MAX_RESULTS)
                    }));
                    if !hits.is_empty() {
                        found.fetch_add(hits.len(), Relaxed);
                        per_file.lock().unwrap_or_else(|e| e.into_inner()).push((i, hits));
                    }
                }
            });
        }
    });
    let mut per_file = std::mem::take(&mut *per_file.lock().unwrap_or_else(|e| e.into_inner()));
    per_file.sort_by_key(|(i, _)| *i);
    per_file.into_iter().flat_map(|(_, h)| h).take(MAX_RESULTS).collect()
}

/// Worth a content search, by the file's first 4 KB (the shape, as rg's binary sniff; no list of extensions): not
/// binary (a NUL: pictures, PDFs, archives), not an SVG picture, and — unless a note — not a table of numbers (a run's
/// `.tsv`, a data dump), whose words are only a header: under one character in twenty is in a word of four or more
/// letters (so `1.5e-3`, `nan`, `inf` do not count as words).
fn worth_reading(abs: &Path, rel: &str) -> bool {
    use std::io::Read;
    let mut head = [0u8; 4096];
    let Ok(mut f) = std::fs::File::open(abs) else { return false };
    let mut n = 0;
    while n < head.len() {
        match f.read(&mut head[n..]) {
            Ok(0) | Err(_) => break,
            Ok(k) => n += k,
        }
    }
    let head = &head[..n];
    if head.contains(&0) {
        return false;
    }
    let text = String::from_utf8_lossy(head);
    let start = text.trim_start();
    if start.starts_with("<svg") || (start.starts_with("<?xml") && text.contains("<svg")) {
        return false;
    }
    if rel.ends_with(".md") {
        return true;
    }
    let (mut in_words, mut shown, mut run) = (0usize, 0usize, 0usize);
    for c in text.chars().chain(std::iter::once(' ')) {
        if c.is_alphabetic() {
            run += 1;
        } else {
            if run >= 4 {
                in_words += run;
            }
            run = 0;
        }
        if !c.is_whitespace() {
            shown += 1;
        }
    }
    shown < 200 || in_words * 20 >= shown
}

/// Binary files (a NUL byte) stop the search of that file, as rg does.
fn searcher() -> Searcher {
    SearcherBuilder::new().binary_detection(BinaryDetection::quit(0)).line_number(true).build()
}

/// [`matcher`]'s rules for ripgrep's searcher.
fn grep_matcher(q: &str, o: Opts) -> Result<RegexMatcher> {
    let insensitive = smart_insensitive(q, o);
    let re = matcher(q, o)?;
    RegexMatcherBuilder::new().case_insensitive(insensitive).build(re.as_str()).map_err(|e| Error::BadRequest(format!("bad pattern: {e}")))
}

/// Largest file searched, as rg's `--max-filesize`.
const MAX_FILE: u64 = 5 << 20;

/// The files searched in `dir` ("." = the workspace, by the walk's ignores and, unless `o.agent`, without the agent's
/// files; any other folder whole), at most [`MAX_FILE`] long, as (absolute, relative).
fn text_files<'a>(root: &'a Path, cfg: &'a Config, o: Opts, dir: &str) -> Box<dyn Iterator<Item = (std::path::PathBuf, String)> + 'a> {
    let files: Box<dyn Iterator<Item = (std::path::PathBuf, String)>> = if dir == "." {
        Box::new(walk::files(root, cfg).filter(move |(_, rel)| o.agent || !cfg.is_agent_file(rel)))
    } else {
        Box::new(walkdir::WalkDir::new(root.join(dir)).into_iter().filter_map(|e| e.ok()).filter(|e| e.file_type().is_file()).filter_map(|e| {
            let rel = crate::paths::rel_path(root, e.path())?;
            Some((e.into_path(), rel))
        }))
    };
    Box::new(files.filter(|(abs, _)| small(abs)))
}

/// At most [`MAX_FILE`] long.
fn small(abs: &Path) -> bool {
    std::fs::metadata(abs).is_ok_and(|m| m.len() <= MAX_FILE)
}

/// The same match rules as `rg` (which uses this regex engine): literal unless `regex`, whole
/// words with `word`, and smart case (insensitive unless `case` or the query has a capital).
pub fn matcher(q: &str, o: Opts) -> Result<regex::Regex> {
    let pat = if o.regex { q.to_string() } else { regex::escape(q) };
    let pat = if o.word { format!(r"\b(?:{pat})\b") } else { pat };
    let insensitive = smart_insensitive(q, o);
    regex::RegexBuilder::new(&pat)
        .case_insensitive(insensitive)
        .multi_line(true)
        .build()
        .map_err(|e| Error::BadRequest(format!("bad pattern: {e}")))
}

/// Smart case, as rg: insensitive unless `case` or the query has a capital — in a regex, a capital it would match
/// (`\S`, `\p{Greek}`, `(?P<Name>…)` are syntax, not capitals).
fn smart_insensitive(q: &str, o: Opts) -> bool {
    if o.case {
        return false;
    }
    if !o.regex {
        return !q.chars().any(char::is_uppercase);
    }
    let mut rest = q;
    while let Some(c) = rest.chars().next() {
        rest = &rest[c.len_utf8()..];
        if c == '\\' {
            // an escape: `\p{Name}` / `\pL` skip the class's name, any other skips its one character
            let Some(e) = rest.chars().next() else { break };
            rest = &rest[e.len_utf8()..];
            if matches!(e, 'p' | 'P') {
                rest = match rest.strip_prefix('{') {
                    Some(r) => r.split_once('}').map_or("", |(_, after)| after),
                    None => rest.chars().next().map_or(rest, |n| &rest[n.len_utf8()..]),
                };
            }
        } else if c == '(' {
            // a group's name (`(?P<Name>`, `(?<Name>`) is not matched
            if let Some(r) = rest.strip_prefix("?P<").or_else(|| rest.strip_prefix("?<")) {
                rest = r.split_once('>').map_or("", |(_, after)| after);
            }
        } else if c.is_uppercase() {
            return false;
        }
    }
    true
}

/// Replace every match in the workspace's text files (the files `rg` finds with these options,
/// optionally narrowed to `only`). Regex mode expands `$1` / `${name}`; literal mode inserts
/// `with` as written. Each file is rewritten atomically. Only what the search shows is replaced: a match on a line of
/// encoded data (a drawing's compressed scene, an inline picture) is left, or the picture would be broken.
pub fn replace(ws: &Workspace, q: &str, o: Opts, with: &str, only: Option<&[String]>) -> Result<ReplaceResult> {
    if q.is_empty() {
        return Err(Error::BadRequest("empty search".into()));
    }
    let re = matcher(q, o)?;
    let cfg = ws.config()?;
    let m = grep_matcher(q, o)?;
    let mut searcher = searcher();
    let found: Vec<String> = text_files(ws.root(), &cfg, o, ".")
        .filter(|(_, rel)| only.is_none_or(|o| o.iter().any(|p| p == rel)))
        .filter(|(abs, _)| {
            let mut hit = false;
            let _ = searcher.search_path(&m, abs, UTF8(|_, _| { hit = true; Ok(false) }));
            hit
        })
        .map(|(_, rel)| rel)
        .collect();
    let mut res = ReplaceResult::default();
    for path in found.iter().map(String::as_str) {
        let Ok(doc) = files::read_text(ws, path) else { continue }; // binary or vanished
        let (text, n) = replace_shown(&re, &doc.text, with, o.regex);
        if n == 0 {
            continue;
        }
        files::write_text(ws, &FileWrite { path: path.to_string(), text, base_mtime: Some(doc.mtime), only_new: false, apply_here: false })?;
        res.replacements += n as u32;
        res.files.push(path.to_string());
    }
    Ok(res)
}

/// `re`'s matches in `text` replaced (`$1` expanded when `expand`), except on lines the search does not show →
/// (text, replacements).
fn replace_shown(re: &regex::Regex, text: &str, with: &str, expand: bool) -> (String, usize) {
    let mut n = 0;
    let mut line = (0, 0, true); // the last line looked at: (start, end, shown) — one look per line, however many hits
    let out = re.replace_all(text, |c: &regex::Captures| {
        let m = c.get(0).expect("the whole match");
        if !(line.0..line.1).contains(&m.start()) {
            let start = text[..m.start()].rfind('\n').map_or(0, |i| i + 1);
            let end = text[m.start()..].find('\n').map_or(text.len(), |i| m.start() + i);
            line = (start, end.max(start + 1), shown_line(&text[start..end]).is_some());
        }
        if !line.2 {
            return m.as_str().to_string();
        }
        n += 1;
        let mut s = String::new();
        if expand { c.expand(with, &mut s) } else { s.push_str(with) }
        s
    });
    (out.into_owned(), n)
}

/// A matching line as the search lists it (trimmed, at most 400 characters); None for one it never lists.
fn shown_line(line: &str) -> Option<String> {
    let text: String = line.trim_end().chars().take(400).collect();
    (!looks_encoded(&text)).then_some(text)
}

/// A line that is encoded data, not words: an embedded picture's base64 (a drawing's `dataURL`, a note's inline
/// image) matched "epub" in random letters. By shape, not by file kind: a run of 120 or
/// more base64 characters without a space.
fn looks_encoded(text: &str) -> bool {
    let mut run = 0;
    for c in text.chars() {
        if c.is_ascii_alphanumeric() || c == '+' || c == '/' || c == '=' {
            run += 1;
            if run >= 120 {
                return true;
            }
        } else {
            run = 0;
        }
    }
    false
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn smart_case_counts_only_the_capitals_a_pattern_matches() {
        let (lit, re) = (Opts::default(), Opts { regex: true, ..Opts::default() });
        assert!(smart_insensitive("note", lit) && !smart_insensitive("Note", lit));
        assert!(!smart_insensitive(r"\S", lit), "literal: the text as typed");
        for q in [r"\S+ items", r"\W\D\B", r"\p{Greek}x", r"\PLx", r"(?P<Name>a)", r"(?<Year>\d{4})"] {
            assert!(smart_insensitive(q, re), "{q}");
        }
        for q in [r"\SNote", r"\p{Greek}A", r"(?P<n>Ab)", "Ünder"] {
            assert!(!smart_insensitive(q, re), "{q}");
        }
        assert!(!smart_insensitive("note", Opts { case: true, ..Opts::default() }));
        assert!(matcher(r"\S+ items", re).unwrap().is_match("3 ITEMS"));
    }

    #[test]
    fn encoded_lines_are_not_hits() {
        let blob = "iVBORw0KGgo".repeat(20);
        assert!(looks_encoded(&format!("\"dataURL\": \"data:image/png;base64,{blob}\"")));
        assert!(!looks_encoded("The epub reader keeps your place in the note's properties."));
        assert!(!looks_encoded("a long path notes/lectures/supcondfatc/Supercond-Carlos-2026-week-03.md and more"));
    }

    #[test]
    fn options_case_word_regex() {
        let d = tempfile::tempdir().unwrap();
        std::fs::write(d.path().join("a.md"), "Hubbard model\nhubbardish\nU = 4.0\n").unwrap();
        let cfg = Config::default();
        let n = |q: &str, o: Opts| rg_lines(d.path(), &cfg, q, o).len();
        assert_eq!(n("hubbard", Opts::default()), 2, "smart case, substring");
        assert_eq!(n("hubbard", Opts { case: true, ..Default::default() }), 1);
        assert_eq!(n("hubbard", Opts { word: true, ..Default::default() }), 1);
        assert_eq!(n("U = \\d", Opts { regex: true, ..Default::default() }), 1);
        assert_eq!(n("U = \\d", Opts::default()), 0, "literal by default");
    }

    /// The agent's files (memories, session logs) are not found unless asked for: by text, by
    /// file name (quick open, `[[` completion) or by a replace across files.
    #[test]
    fn agent_files_are_searched_only_on_request() {
        let d = tempfile::tempdir().unwrap();
        for (f, text) in [("notes/a.md", "hubbard U\n"), ("docs/memory/log.md", "hubbard session\n"), ("AGENTS.md", "hubbard rules\n")] {
            std::fs::create_dir_all(d.path().join(f).parent().unwrap()).unwrap();
            std::fs::write(d.path().join(f), text).unwrap();
        }
        let ws = Workspace::open(d.path()).unwrap();
        let mut cfg = Config::default();
        cfg.editor.index_exclude = vec!["/docs".into(), "/AGENTS.md".into()];
        let all = Opts { agent: true, ..Default::default() };
        let paths = |o: Opts| { let mut p: Vec<String> = rg_lines(d.path(), &cfg, "hubbard", o).into_iter().map(|h| h.path).collect(); p.sort(); p };
        assert_eq!(paths(Opts::default()), ["notes/a.md"]);
        assert_eq!(paths(all), ["AGENTS.md", "docs/memory/log.md", "notes/a.md"]);
        assert_eq!(match_files(d.path(), &cfg, "log", false), Vec::<String>::new());
        assert_eq!(match_files(d.path(), &cfg, "log", true), ["docs/memory/log.md"]);
        // the default config keeps docs/memory apart, so a replace leaves it alone
        let r = replace(&ws, "hubbard", Opts::default(), "Hubbard", None).unwrap();
        assert!(!r.files.iter().any(|f| f.starts_with("docs/memory")), "{:?}", r.files);
        assert_eq!(std::fs::read_to_string(d.path().join("docs/memory/log.md")).unwrap(), "hubbard session\n");
    }

    #[test]
    fn replace_follows_the_search_options() {
        let d = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(d.path().join("notes")).unwrap();
        std::fs::write(d.path().join("notes/a.md"), "Colour colour colourful\n").unwrap();
        std::fs::write(d.path().join("notes/b.md"), "no match\n").unwrap();
        std::fs::write(d.path().join("notes/c.md"), "U = 4.0, U = 8.0\n").unwrap();
        let ws = Workspace::open(d.path()).unwrap();
        let read = |f: &str| std::fs::read_to_string(d.path().join(f)).unwrap();
        // whole word, smart case (lower-case query → insensitive)
        let r = replace(&ws, "colour", Opts { word: true, ..Default::default() }, "color", None).unwrap();
        assert_eq!((r.replacements, r.files.clone()), (2, vec!["notes/a.md".to_string()]));
        assert_eq!(read("notes/a.md"), "color color colourful\n");
        // regex with a capture group; literal mode would keep "$1" as text
        replace(&ws, r"U = (\d)\.0", Opts { regex: true, ..Default::default() }, "U=$1", None).unwrap();
        assert_eq!(read("notes/c.md"), "U=4, U=8\n");
        replace(&ws, "U=4", Opts::default(), "$1", Some(&["notes/other.md".to_string()])).unwrap();
        assert_eq!(read("notes/c.md"), "U=4, U=8\n", "`only` narrows the files");
        replace(&ws, "U=4", Opts::default(), "$1", None).unwrap();
        assert_eq!(read("notes/c.md"), "$1, U=8\n", "literal mode inserts the text as written");
        assert!(replace(&ws, "(", Opts { regex: true, ..Default::default() }, "x", None).is_err());
    }

    #[test]
    fn replace_leaves_encoded_lines_as_they_are() {
        let d = tempfile::tempdir().unwrap();
        let blob = "iVBORw0KGgoAbcAbc".repeat(10);
        let note = format!("abc here\n![x](data:image/png;base64,{blob})\nand abc\n");
        std::fs::write(d.path().join("a.md"), &note).unwrap();
        let ws = Workspace::open(d.path()).unwrap();
        let r = replace(&ws, "abc", Opts::default(), "xyz", None).unwrap();
        assert_eq!(r.replacements, 2, "only the two lines the search shows");
        assert_eq!(std::fs::read_to_string(d.path().join("a.md")).unwrap(), note.replace("abc here", "xyz here").replace("and abc", "and xyz"));
        assert_eq!(replace_shown(&regex::Regex::new("(a)").unwrap(), "a\na", "<$1>", true), ("<a>\n<a>".to_string(), 2));
    }

    #[test]
    fn only_text_worth_reading_is_searched() {
        let d = tempfile::tempdir().unwrap();
        let r = d.path();
        let numbers: String = (0..400).map(|i| format!("{i}\t{:.4e}\t{:.3}\tnan\n", i as f64 * 1.5e-3, i as f64 / 7.0)).collect();
        std::fs::write(r.join("run.tsv"), format!("energy\tdensity\tfilling\tgap\n{numbers}")).unwrap();
        std::fs::write(r.join("plot.svg"), "<svg xmlns=\"http://www.w3.org/2000/svg\"><text>energy</text></svg>").unwrap();
        std::fs::write(r.join("blob.bin"), b"energy\0\x01\x02").unwrap();
        std::fs::write(r.join("table.md"), format!("energy\n{numbers}")).unwrap(); // a note is always read
        std::fs::write(r.join("script.py"), "# the energy of the bath\nprint(1)\n").unwrap();
        let mut hits: Vec<_> = search(r, &Config::default(), "energy").lines.into_iter().map(|l| l.path).collect();
        hits.sort();
        assert_eq!(hits, ["script.py", "table.md"]);
    }

    #[test]
    fn notes_lead_and_the_order_holds_across_threads() {
        let d = tempfile::tempdir().unwrap();
        let r = d.path();
        for i in 0..40 {
            std::fs::write(r.join(format!("a{i:02}.py")), "# the lattice\n").unwrap();
            std::fs::write(r.join(format!("z{i:02}.md")), "the lattice\n").unwrap();
        }
        let hits: Vec<_> = search(r, &Config::default(), "lattice").lines.into_iter().map(|l| l.path).collect();
        assert_eq!(hits.len(), 80);
        assert!(hits[..40].iter().all(|p| p.ends_with(".md")), "{hits:?}");
        assert_eq!(hits, search(r, &Config::default(), "lattice").lines.into_iter().map(|l| l.path).collect::<Vec<_>>());
    }

    #[test]
    fn one_hit_per_thing() {
        // a drawing, its ink-free hidden note, a PDF and its ink: each thing once, by name and by what its note says
        let d = tempfile::tempdir().unwrap();
        let r = d.path();
        std::fs::create_dir_all(r.join("notes")).unwrap();
        std::fs::write(r.join("notes/qft.excalidraw"), "{}").unwrap();
        std::fs::write(r.join("notes/qft.md"), "---\ndrawing: '[[qft.excalidraw]]'\nshown: false\n---\n> renormalisation group\n").unwrap();
        std::fs::write(r.join("notes/qft.pdf"), "%PDF").unwrap();
        std::fs::write(r.join("notes/qft.pdf.excalidraw"), "{}").unwrap();
        let cfg = Config::default();
        assert_eq!(match_files(r, &cfg, "qft", false), ["notes/qft.excalidraw", "notes/qft.pdf"]);
        let hits = search(r, &cfg, "renormalisation").lines;
        assert_eq!(hits.iter().map(|h| h.path.as_str()).collect::<Vec<_>>(), ["notes/qft.excalidraw"]);
    }

    #[test]
    fn filenames_and_content() {
        let d = tempfile::tempdir().unwrap();
        let r = d.path();
        std::fs::create_dir_all(r.join("notes/dmft")).unwrap();
        std::fs::create_dir_all(r.join("runs")).unwrap();
        std::fs::write(r.join("notes/dmft/bath.md"), "Hybridization $\\Delta(i\\omega)$\nSubbath fit\n").unwrap();
        std::fs::write(r.join("notes/bath-notes.md"), "nothing\n").unwrap();
        std::fs::write(r.join("runs/bath.tsv"), "subbath in ignored dir\n").unwrap();
        let cfg = Config::default();
        assert_eq!(match_files(r, &cfg, "bath", false), ["notes/dmft/bath.md", "notes/bath-notes.md"]);
        assert_eq!(match_files(r, &cfg, "dmft bath", false), ["notes/dmft/bath.md"]);
        let res = search(r, &cfg, "subbath");
        assert_eq!(res.lines, vec![LineHit { path: "notes/dmft/bath.md".into(), line: 2, text: "Subbath fit".into() }]);
        assert!(search(r, &cfg, "  ").files.is_empty());
        // `/runs` is the top-level folder only: notes about runs stay findable, by name and by content
        std::fs::create_dir_all(r.join("notes/runs")).unwrap();
        std::fs::write(r.join("notes/runs/alpha.md"), "subbath run note\n").unwrap();
        assert!(match_files(r, &cfg, "alpha", false).is_empty(), "the default `runs` matches at any depth");
        let rooted = Config { ignore: vec!["/runs".into()], ..Config::default() };
        assert_eq!(match_files(r, &rooted, "alpha", false), ["notes/runs/alpha.md"]);
        let mut hits: Vec<_> = search(r, &rooted, "subbath").lines.into_iter().map(|l| l.path).collect();
        hits.sort(); // ripgrep searches files in parallel: their order is not fixed
        assert_eq!(hits, ["notes/dmft/bath.md", "notes/runs/alpha.md"]);
    }
}
