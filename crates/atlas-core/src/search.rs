//! Search: filename "contains every token" match over the walk, plus ripgrep for content.
use crate::api::{FileWrite, LineHit, ReplaceResult, SearchResults};
use crate::config::Config;
use crate::{files, walk, Error, Result, Workspace};
use std::io::{BufRead, BufReader};
use std::path::Path;
use std::process::{Command, Stdio};

pub const MAX_RESULTS: usize = 200;

/// Line-search options (the Search pane's Aa / whole-word / .* toggles).
#[derive(Debug, Clone, Copy, Default)]
pub struct Opts {
    pub case: bool,
    pub word: bool,
    pub regex: bool,
    /// Also look in the agent's own files (`editor.index_exclude`); off by default.
    pub agent: bool,
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
    let mut lines = rg_lines(root, cfg, q, o);
    // PDF text (pdf_text.rs): the same rg over the extracted-text cache, listed after the notes' hits;
    // papers keep up to a quarter of the results, so a common word in notes cannot crowd them out
    if root.join(crate::pdf_text::CACHE).is_dir() {
        let cache = run_rg(rg_in(root, cfg, q, o, &["--json", "--max-columns", "400", "--max-columns-preview"], crate::pdf_text::CACHE));
        let pdf: Vec<LineHit> = crate::pdf_text::hits(cache, root).into_iter().take(MAX_RESULTS / 4).collect();
        lines.truncate(MAX_RESULTS - pdf.len());
        lines.extend(pdf);
    }
    // a hit in a hidden note is its thing's (a drawing's note text → the drawing; companion::thing_of), as the names are
    let mut things = std::collections::HashMap::new();
    for l in &mut lines {
        let thing = things.entry(l.path.clone()).or_insert_with(|| crate::companion::thing_of(root, &l.path).filter(|t| !t.ends_with(".md")));
        if let Some(t) = thing {
            l.path = t.clone();
        }
    }
    crate::pdf_text::refresh_in_background(root, cfg);
    SearchResults { files: if o.regex { Vec::new() } else { match_files(root, cfg, q, o.agent) }, lines }
}

/// Every whitespace token must appear (case-insensitive) in the path; basename hits rank first.
pub fn match_files(root: &Path, cfg: &Config, q: &str, agent: bool) -> Vec<String> {
    let tokens: Vec<String> = q.split_whitespace().map(str::to_lowercase).collect();
    let mut hits: Vec<(bool, usize, String)> = walk::files(root, cfg)
        .filter(|(_, rel)| agent || !cfg.is_agent_file(rel))
        .filter_map(|(_, rel)| {
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
        .map(|(_, _, p)| crate::companion::thing_of(root, &p).unwrap_or(p))
        .filter(|p| seen.insert(p.clone()))
        .take(MAX_RESULTS)
        .collect()
}

/// `rg` with the pane's options and the workspace ignores; the caller adds its output mode.
fn rg(root: &Path, cfg: &Config, q: &str, o: Opts, mode: &[&str]) -> Command {
    rg_in(root, cfg, q, o, mode, ".")
}

/// `rg` over one folder of the workspace (`.` = all of it, hidden folders skipped as usual).
fn rg_in(root: &Path, cfg: &Config, q: &str, o: Opts, mode: &[&str], dir: &str) -> Command {
    let mut cmd = Command::new("rg");
    cmd.current_dir(root)
        .args(mode)
        .arg(if o.case { "--case-sensitive" } else { "--smart-case" })
        .args(["--max-filesize", "5M"]);
    if !o.regex {
        cmd.arg("--fixed-strings");
    }
    if o.word {
        cmd.arg("--word-regexp");
    }
    let apart = if o.agent { &[][..] } else { &cfg.editor.index_exclude[..] };
    for pat in cfg.ignore.iter().chain(apart) {
        // rg's globs follow gitignore: a leading `/` anchors at the root, as in the config
        let anchor = if crate::config::is_path_pattern(pat) { "/" } else { "" };
        let pat = pat.trim_matches('/');
        cmd.arg("-g").arg(format!("!{anchor}{pat}")).arg("-g").arg(format!("!{anchor}{pat}/**"));
    }
    cmd.arg("-e").arg(q).arg("--").arg(dir);
    cmd
}

/// Fixed-string, smart-case `rg --json`; empty when rg is not installed.
pub fn rg_lines(root: &Path, cfg: &Config, q: &str, o: Opts) -> Vec<LineHit> {
    run_rg(rg(root, cfg, q, o, &["--json", "--max-columns", "400", "--max-columns-preview"]))
}

fn run_rg(mut cmd: Command) -> Vec<LineHit> {
    let Ok(mut child) = cmd.stdin(Stdio::null()).stdout(Stdio::piped()).stderr(Stdio::null()).spawn() else {
        return Vec::new();
    };
    let mut out = Vec::new();
    if let Some(stdout) = child.stdout.take() {
        for line in BufReader::new(stdout).lines().map_while(Result::ok) {
            if let Some(hit) = parse_rg_match(&line) {
                out.push(hit);
                if out.len() >= MAX_RESULTS {
                    break;
                }
            }
        }
    }
    let _ = child.kill();
    let _ = child.wait();
    out
}

/// The same match rules as `rg` (which uses this regex engine): literal unless `regex`, whole
/// words with `word`, and smart case (insensitive unless `case` or the query has a capital).
pub fn matcher(q: &str, o: Opts) -> Result<regex::Regex> {
    let pat = if o.regex { q.to_string() } else { regex::escape(q) };
    let pat = if o.word { format!(r"\b(?:{pat})\b") } else { pat };
    let insensitive = !o.case && !q.chars().any(char::is_uppercase);
    regex::RegexBuilder::new(&pat)
        .case_insensitive(insensitive)
        .multi_line(true)
        .build()
        .map_err(|e| Error::BadRequest(format!("bad pattern: {e}")))
}

/// Replace every match in the workspace's text files (the files `rg` finds with these options,
/// optionally narrowed to `only`). Regex mode expands `$1` / `${name}`; literal mode inserts
/// `with` as written. Each file is rewritten atomically.
pub fn replace(ws: &Workspace, q: &str, o: Opts, with: &str, only: Option<&[String]>) -> Result<ReplaceResult> {
    if q.is_empty() {
        return Err(Error::BadRequest("empty search".into()));
    }
    let re = matcher(q, o)?;
    let out = rg(ws.root(), &ws.config()?, q, o, &["--files-with-matches"])
        .stdin(Stdio::null())
        .stderr(Stdio::null())
        .output()
        .map_err(|e| Error::BadRequest(format!("ripgrep is needed to replace: {e}")))?;
    let mut res = ReplaceResult::default();
    for path in String::from_utf8_lossy(&out.stdout).lines() {
        let path = path.strip_prefix("./").unwrap_or(path);
        if only.is_some_and(|o| !o.iter().any(|p| p == path)) {
            continue;
        }
        let Ok(doc) = files::read_text(ws, path) else { continue }; // binary or vanished
        let n = re.find_iter(&doc.text).count();
        if n == 0 {
            continue;
        }
        let text = if o.regex { re.replace_all(&doc.text, with) } else { re.replace_all(&doc.text, regex::NoExpand(with)) };
        files::write_text(ws, &FileWrite { path: path.to_string(), text: text.into_owned(), base_mtime: Some(doc.mtime), only_new: false })?;
        res.replacements += n as u32;
        res.files.push(path.to_string());
    }
    Ok(res)
}

fn parse_rg_match(line: &str) -> Option<LineHit> {
    let v: serde_json::Value = serde_json::from_str(line).ok()?;
    if v.get("type")?.as_str()? != "match" {
        return None;
    }
    let data = v.get("data")?;
    let path = data.pointer("/path/text")?.as_str()?;
    let path = path.strip_prefix("./").unwrap_or(path).to_string();
    let line = data.get("line_number")?.as_u64()? as u32;
    let text = data.pointer("/lines/text")?.as_str()?.trim_end().to_string();
    if looks_encoded(&text) {
        return None;
    }
    Some(LineHit { path, line, text })
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
