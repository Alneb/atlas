//! Every capture, found and triaged (docs/design/DESIGN-capture-triage.md). A capture is a top-level list item of a
//! day's log (in its `## Log` section when it has one) or a note of the inbox folder. Its state is read from the file
//! itself — the box (`[ ]` task, `[x]` done, `[-]` dismissed), a trailing `→ [[note]]` (filed), a note's `review:` and
//! `filed:` properties — and changed only through [`triage`], so the files stay the whole truth.
use crate::api::{CaptureItem, CaptureKind, CaptureList, CaptureState, TriageAction, TriageRequest};
use crate::config::Config;
use crate::{frontmatter, paths, vault_write, walk, Error, Result};
use chrono::NaiveDateTime;
use std::path::Path;

/// At most this many captures are listed, newest first (the untriaged count covers all of them).
pub const MAX_LISTED: usize = 500;

/// One capture line taken apart: `- [c] HH:MM text → [[note]]`, every part but the text optional.
#[derive(Debug, PartialEq)]
pub struct Line<'a> {
    /// The status inside the box, when the line has one.
    pub status: Option<char>,
    pub time: Option<&'a str>,
    /// What was captured, without the box, the time and the filing link.
    pub text: &'a str,
    /// The note named by a trailing `→ [[note]]`.
    pub filed: Option<&'a str>,
}

impl Line<'_> {
    pub fn state(&self) -> CaptureState {
        match self.status {
            Some(' ') => CaptureState::Task,
            Some('-') => CaptureState::Dismissed,
            // any other status is a closed box, as Obsidian draws it
            Some(_) => CaptureState::Done,
            None if self.filed.is_some() => CaptureState::Filed,
            None => CaptureState::Open,
        }
    }
}

/// A capture's time at the start of its text: `09:05 …` → (`09:05`, `…`). The one reader of the stamp
/// [`crate::capture::format_entry`] writes.
pub fn stamp(text: &str) -> Option<(&str, &str)> {
    let b = text.as_bytes();
    let colon = text.find(':').filter(|&i| i == 1 || i == 2)?;
    let end = colon + 3;
    let shape = b[..colon].iter().all(u8::is_ascii_digit) && b.get(colon + 1..end).is_some_and(|m| m.iter().all(u8::is_ascii_digit));
    let rest = text.get(end..)?;
    (shape && (rest.is_empty() || rest.starts_with(' '))).then(|| (&text[..end], rest.trim_start()))
}

/// A top-level list item as a capture; None for anything else (an indented line, a heading, prose).
pub fn parse_line(line: &str) -> Option<Line<'_>> {
    let rest = line.strip_prefix(['-', '*', '+'])?.strip_prefix(' ')?;
    let (status, rest) = match rest.as_bytes() {
        [b'[', _, ..] => {
            let c = rest[1..].chars().next()?;
            let after = rest.get(1 + c.len_utf8()..)?;
            match after.strip_prefix("] ").or_else(|| after.strip_prefix(']').filter(|a| a.is_empty())) {
                Some(after) => (Some(c), after),
                None => (None, rest),
            }
        }
        _ => (None, rest),
    };
    let (time, rest) = stamp(rest).map_or((None, rest), |(t, r)| (Some(t), r));
    let (text, filed) = match rest.rfind(" → [[") {
        Some(i) if rest.trim_end().ends_with("]]") => {
            let target = rest[i + " → [[".len()..].trim_end().trim_end_matches("]]");
            (rest[..i].trim_end(), Some(target.split('|').next().unwrap_or(target)))
        }
        _ => (rest.trim_end(), None),
    };
    (!text.is_empty() || filed.is_some()).then_some(Line { status, time, text, filed })
}

/// The day a log file is for: its name, `YYYY-MM-DD.md`, under the vault's log folder.
fn log_day(cfg: &Config, rel: &str) -> Option<String> {
    let dir = cfg.log_dir.trim_matches('/');
    let name = rel.strip_prefix(dir)?.strip_prefix('/')?.rsplit('/').next()?.strip_suffix(".md")?;
    chrono::NaiveDate::parse_from_str(name, "%Y-%m-%d").ok().map(|_| name.to_string())
}

/// The 0-based line range a log's captures are in: its `## Log` section when it has one, else the whole note.
fn log_section(lines: &[&str]) -> std::ops::Range<usize> {
    let heading = |l: &str| l.starts_with('#') && l.trim_start_matches('#').starts_with(' ');
    let Some(start) = lines.iter().position(|l| crate::capture::is_log_heading(l)) else { return 0..lines.len() };
    let level = lines[start].chars().take_while(|&c| c == '#').count();
    let end = lines[start + 1..]
        .iter()
        .position(|l| heading(l) && l.chars().take_while(|&c| c == '#').count() <= level)
        .map_or(lines.len(), |i| start + 1 + i);
    start + 1..end
}

/// The captures of one day's log, in file order.
fn in_log(rel: &str, day: &str, text: &str) -> Vec<CaptureItem> {
    let lines: Vec<&str> = text.split('\n').collect();
    let mut fence = false;
    let mut out = vec![];
    for i in log_section(&lines) {
        let l = lines[i];
        if l.trim_start().starts_with("```") {
            fence = !fence;
        }
        let Some(c) = (!fence).then(|| parse_line(l)).flatten() else { continue };
        out.push(CaptureItem {
            kind: CaptureKind::Line,
            path: rel.to_string(),
            line: i as u32 + 1,
            day: day.to_string(),
            time: c.time.map(str::to_string),
            text: c.text.to_string(),
            state: c.state(),
            filed: c.filed.map(str::to_string),
            source: l.to_string(),
        });
    }
    out
}

/// A note of the inbox as a capture: its state from the properties the Review block also writes (`review: done`)
/// and the note it was filed into (`filed:`).
fn inbox_note(rel: &str, text: &str, mtime: Option<std::time::SystemTime>) -> CaptureItem {
    let props = frontmatter::mapping(text);
    let get = |k: &str| props.get(k).and_then(|v| v.as_str().map(str::to_string).or_else(|| v.as_bool().map(|b| b.to_string())));
    let filed = get("filed").map(|f| f.trim_start_matches("[[").trim_end_matches("]]").to_string()).filter(|f| !f.is_empty());
    let state = match (filed.is_some(), get("review").as_deref()) {
        (true, _) => CaptureState::Filed,
        (false, Some("done")) => CaptureState::Dismissed,
        _ => CaptureState::Open,
    };
    let day = get("created").map(|c| c.chars().take(10).collect()).or_else(|| {
        mtime.map(|t| chrono::DateTime::<chrono::Local>::from(t).format("%Y-%m-%d").to_string())
    });
    let body = frontmatter::split(text).1;
    let first = body.lines().map(str::trim).find(|l| !l.is_empty()).unwrap_or("");
    let name = rel.rsplit('/').next().unwrap_or(rel).trim_end_matches(".md");
    CaptureItem {
        kind: CaptureKind::Note,
        path: rel.to_string(),
        line: 0,
        day: day.unwrap_or_default(),
        time: None,
        text: if first.is_empty() { name.to_string() } else { first.trim_start_matches('#').trim().to_string() },
        state,
        filed,
        source: String::new(),
    }
}

/// Every capture of the vault, newest first; `open` counts the ones still waiting to be triaged.
pub fn list(root: &Path, cfg: &Config) -> CaptureList {
    let mut items = vec![];
    if let Ok(dir) = paths::safe_join(root, cfg.log_dir.trim_matches('/')) {
        for (abs, rel) in walk::files_under(root, &dir, cfg) {
            let Some(day) = log_day(cfg, &rel) else { continue };
            let Ok(text) = std::fs::read_to_string(&abs) else { continue };
            items.extend(in_log(&rel, &day, &text));
        }
    }
    if let Ok(dir) = paths::safe_join(root, cfg.notes.inbox.trim_matches('/')) {
        for (abs, rel) in walk::files_under(root, &dir, cfg) {
            if !rel.ends_with(".md") {
                continue;
            }
            let Ok(text) = std::fs::read_to_string(&abs) else { continue };
            items.push(inbox_note(&rel, &text, abs.metadata().and_then(|m| m.modified()).ok()));
        }
    }
    // newest day first; within a day, the latest line first (notes, with no line, after the day's log)
    items.sort_by(|a, b| b.day.cmp(&a.day).then(b.time.cmp(&a.time)).then(b.line.cmp(&a.line)).then(a.path.cmp(&b.path)));
    let open = items.iter().filter(|c| c.state == CaptureState::Open).count() as u32;
    let total = items.len() as u32;
    items.truncate(MAX_LISTED);
    CaptureList { items, open, total }
}

/// `[[name]]` of a note's path: its file name without `.md` (Obsidian finds it by name).
pub fn wikilink(note: &str) -> String {
    let name = note.rsplit('/').next().unwrap_or(note);
    format!("[[{}]]", name.strip_suffix(".md").unwrap_or(name))
}

/// A capture line with ` → [[note]]` added; None when it already links there. The capture hooks (a link filed by
/// the catalog) and "File into…" both write it.
pub fn link_line(line: &str, note: &str) -> Option<String> {
    let link = wikilink(note);
    (!line.contains(&link)).then(|| format!("{} → {link}", line.trim_end()))
}

/// The line with its box set to `status` (`None`: no box); the time, text and link kept.
fn with_status(line: &str, status: Option<char>) -> Option<String> {
    let c = parse_line(line)?;
    let bullet = &line[..1];
    let after_box = match c.status {
        Some(s) => &line[2 + 1 + s.len_utf8() + 2..],
        None => &line[2..],
    };
    Some(match status {
        Some(s) => format!("{bullet} [{s}] {after_box}"),
        None => format!("{bullet} {after_box}"),
    })
}

/// One triage answer, written into the capture's own file (and the note it is filed into). The line must still be what
/// the view showed (`source`): edited meanwhile, nothing is written and the view is told to read again.
pub fn triage(root: &Path, cfg: &Config, req: &TriageRequest, now: NaiveDateTime) -> Result<Vec<String>> {
    let abs = paths::safe_join(root, &req.path)?;
    let text = std::fs::read_to_string(&abs).map_err(|_| Error::NotFound(req.path.clone()))?;
    if req.line == 0 {
        return triage_note(root, cfg, &abs, &req.path, &text, &req.action, now);
    }
    let mut lines: Vec<String> = text.split('\n').map(str::to_string).collect();
    let idx = req.line as usize - 1;
    let line = lines.get(idx).ok_or(Error::Conflict { current: None })?.clone();
    if line != req.source {
        return Err(Error::Conflict { current: None });
    }
    let c = parse_line(&line).ok_or_else(|| Error::BadRequest("that line is not a capture".into()))?;
    let mut touched = vec![req.path.clone()];
    let next: Vec<String> = match &req.action {
        TriageAction::Task => vec![with_status(&line, Some(' ')).unwrap_or(line.clone())],
        // a task ticks the way every tick does (a recurring one leaves its next occurrence, `✅ day` with Tasks fields)
        TriageAction::Done if c.status == Some(' ') => crate::today::tick_line(&line, now.date()).unwrap_or(vec![line.clone()]),
        TriageAction::Done => vec![with_status(&line, Some('x')).unwrap_or(line.clone())],
        TriageAction::Dismiss => vec![with_status(&line, Some('-')).unwrap_or(line.clone())],
        TriageAction::Reopen => {
            let open = with_status(&line, None).unwrap_or(line.clone());
            let done = regex::Regex::new(r"\s*✅\u{FE0F}?\s*\d{4}-\d{2}-\d{2}").expect("static regex");
            let open = done.replace(&open, "").into_owned();
            vec![if c.filed.is_some() { strip_link(&open) } else { open }]
        }
        TriageAction::File { note } => {
            let more = continuation(&lines, idx);
            let day = log_day(cfg, &req.path);
            let entry = filed_entry(c.text, &more, day.as_deref().map(wikilink).as_deref());
            touched.push(file_into(root, note, &entry)?);
            vec![link_line(&line, note).unwrap_or(line.clone())]
        }
    };
    lines.splice(idx..=idx, next);
    vault_write::write(&abs, lines.join("\n").as_bytes())?;
    Ok(touched)
}

/// A line's trailing filing link taken off (`… → [[a|b]]`).
fn strip_link(line: &str) -> String {
    match line.rfind(" → [[") {
        Some(i) => line[..i].to_string(),
        None => line.to_string(),
    }
}

/// The capture's own lines under it (a picture, the address a share sent), as written: indented, up to the next item.
fn continuation(lines: &[String], idx: usize) -> Vec<String> {
    let mut more: Vec<String> = lines[idx + 1..].iter().take_while(|l| l.is_empty() || l.starts_with([' ', '\t'])).cloned().collect();
    while more.last().is_some_and(|l| l.trim().is_empty()) {
        more.pop();
    }
    more
}

/// What a filed capture becomes in its note: one list item, its lines under it, and where it came from.
fn filed_entry(text: &str, more: &[String], from: Option<&str>) -> String {
    let mut out = format!("- {text}{}\n", from.map(|f| format!(" ({f})")).unwrap_or_default());
    for l in more {
        out.push_str(l);
        out.push('\n');
    }
    out
}

/// Appends `entry` to the note at `note` (a vault path; made when missing, named by its file), returning its path.
fn file_into(root: &Path, note: &str, entry: &str) -> Result<String> {
    let rel = if note.ends_with(".md") { note.to_string() } else { format!("{note}.md") };
    let abs = paths::safe_join(root, &rel)?;
    match std::fs::read_to_string(&abs) {
        Ok(text) => {
            let sep = if text.is_empty() || text.ends_with('\n') { "" } else { "\n" };
            vault_write::append(&abs, format!("{sep}{entry}").as_bytes())?;
        }
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
            if let Some(dir) = abs.parent() {
                vault_write::mkdir(dir)?;
            }
            let title = rel.rsplit('/').next().unwrap_or(&rel).trim_end_matches(".md");
            // made by someone else meanwhile: added to theirs
            if vault_write::create(&abs, format!("# {title}\n\n{entry}").as_bytes())? != vault_write::Created::New {
                vault_write::append(&abs, entry.as_bytes())?;
            }
        }
        Err(e) => return Err(e.into()),
    }
    Ok(rel)
}

/// A note of the inbox triaged: its properties say what became of it; filed, its text is added to the other note;
/// made a task, the task is a line of today's log that links it.
fn triage_note(root: &Path, cfg: &Config, abs: &Path, rel: &str, text: &str, action: &TriageAction, now: NaiveDateTime) -> Result<Vec<String>> {
    use serde_yaml::Value;
    let s = |v: &str| Value::String(v.to_string());
    let mut touched = vec![rel.to_string()];
    let next = match action {
        TriageAction::Dismiss | TriageAction::Done => frontmatter::set_property(text, "review", &s("done")),
        TriageAction::Reopen => frontmatter::remove_property(&frontmatter::remove_property(text, "filed"), "review"),
        TriageAction::File { note } => {
            let body = frontmatter::split(text).1.trim();
            let mut lines = body.lines();
            let first = lines.next().unwrap_or_default();
            let more: Vec<String> = lines.map(|l| if l.is_empty() { String::new() } else { format!("  {l}") }).collect();
            touched.push(file_into(root, note, &filed_entry(first, &more, Some(&wikilink(rel))))?);
            let t = frontmatter::set_property(text, "filed", &s(&wikilink(note)));
            frontmatter::set_property(&t, "review", &s("done"))
        }
        TriageAction::Task => {
            let item = inbox_note(rel, text, None);
            let r = crate::capture::capture_at(root, cfg, &format!("[ ] {} {}", item.text, wikilink(rel)), now)?;
            touched.push(r.path.clone());
            let t = frontmatter::set_property(text, "filed", &s(&wikilink(&r.path)));
            frontmatter::set_property(&t, "review", &s("done"))
        }
    };
    vault_write::write(abs, next.as_bytes())?;
    Ok(touched)
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::NaiveDate;

    fn now() -> NaiveDateTime {
        NaiveDate::from_ymd_opt(2026, 10, 27).unwrap().and_hms_opt(21, 40, 0).unwrap()
    }

    #[test]
    fn a_capture_line_is_taken_apart_in_the_new_and_the_old_shapes() {
        let l = parse_line("- 09:12 check the tail").unwrap();
        assert_eq!((l.status, l.time, l.text, l.filed, l.state()), (None, Some("09:12"), "check the tail", None, CaptureState::Open));
        let l = parse_line("- [ ] 10:30 call the lab").unwrap();
        assert_eq!((l.status, l.time, l.text, l.state()), (Some(' '), Some("10:30"), "call the lab", CaptureState::Task));
        // the old task shape: no time
        let l = parse_line("- [ ] try t'=0.05").unwrap();
        assert_eq!((l.time, l.text, l.state()), (None, "try t'=0.05", CaptureState::Task));
        assert_eq!(parse_line("- [x] write the report").unwrap().state(), CaptureState::Done);
        assert_eq!(parse_line("- [-] 08:00 never mind").unwrap().state(), CaptureState::Dismissed);
        let l = parse_line("- 15:48 http://x.org/doi → [[gull2015quasiparticle]]").unwrap();
        assert_eq!((l.text, l.filed, l.state()), ("http://x.org/doi", Some("gull2015quasiparticle"), CaptureState::Filed));
        assert_eq!(parse_line("- 9:05 a").unwrap().time, Some("9:05"));
        assert_eq!(parse_line("- 12:345 a").unwrap().time, None, "not a time");
        assert_eq!(parse_line("- [link](x) text").unwrap().status, None, "a link is not a box");
        for not in ["  - indented", "# heading", "prose", "-", "- ", "1. ordered"] {
            assert!(parse_line(not).is_none(), "{not:?}");
        }
    }

    const LOG: &str = "---\ndate: 2026-10-27\ntype: log\n---\n# Tuesday\n\n## Journal\n- a thought in the journal\n\n## Log\n- [ ] look at R0\n- 09:12 check the tail\n  http://x.org\n- 14:43 Bulk DCA → [[Notes]]\n- [x] the report\n\n```view\ntype: activity\n```\n";

    fn vault() -> (tempfile::TempDir, Config) {
        let d = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(d.path().join("notes/log/2026/10-October")).unwrap();
        std::fs::write(d.path().join("notes/log/2026/10-October/2026-10-27.md"), LOG).unwrap();
        std::fs::write(d.path().join("notes/log/2026/10-October/2026-10-26.md"), "# Monday\n\n- 10:02 fit the bath\n- 11:30 https://example.org\n").unwrap();
        std::fs::write(d.path().join("notes/log/2026/10-October/notes.md"), "- not a day\n").unwrap();
        std::fs::create_dir_all(d.path().join("inbox")).unwrap();
        std::fs::write(d.path().join("inbox/A thought.md"), "---\ntype: fleeting\ncreated: 2026-10-25\n---\nA thought about sectors\nmore\n").unwrap();
        (d, Config::default())
    }

    #[test]
    fn every_capture_is_listed_newest_first_with_its_state() {
        let (d, cfg) = vault();
        let l = list(d.path(), &cfg);
        let seen: Vec<(&str, &str, CaptureState)> = l.items.iter().map(|c| (c.day.as_str(), c.text.as_str(), c.state)).collect();
        assert_eq!(
            seen,
            vec![
                ("2026-10-27", "Bulk DCA", CaptureState::Filed),
                ("2026-10-27", "check the tail", CaptureState::Open),
                ("2026-10-27", "the report", CaptureState::Done),
                ("2026-10-27", "look at R0", CaptureState::Task),
                ("2026-10-26", "https://example.org", CaptureState::Open),
                ("2026-10-26", "fit the bath", CaptureState::Open),
                ("2026-10-25", "A thought about sectors", CaptureState::Open),
            ],
            "the journal's bullet and the activity block are not captures; a file not named by its day is not a log"
        );
        assert_eq!((l.open, l.total), (4, 7));
        assert_eq!(l.items[1].line, 12);
    }

    fn ask(d: &Path, cfg: &Config, path: &str, line: u32, action: TriageAction) -> Result<Vec<String>> {
        let text = std::fs::read_to_string(d.join(path)).unwrap();
        let source = if line == 0 { String::new() } else { text.split('\n').nth(line as usize - 1).unwrap().to_string() };
        triage(d, cfg, &TriageRequest { path: path.into(), line, source, action }, now())
    }

    #[test]
    fn a_log_line_is_triaged_in_place_and_only_that_line_changes() {
        let (d, cfg) = vault();
        let p = "notes/log/2026/10-October/2026-10-27.md";
        let read = || std::fs::read_to_string(d.path().join(p)).unwrap();
        ask(d.path(), &cfg, p, 12, TriageAction::Task).unwrap();
        assert_eq!(read(), LOG.replace("- 09:12 check", "- [ ] 09:12 check"));
        ask(d.path(), &cfg, p, 12, TriageAction::Done).unwrap();
        assert_eq!(read(), LOG.replace("- 09:12 check", "- [x] 09:12 check"));
        ask(d.path(), &cfg, p, 12, TriageAction::Reopen).unwrap();
        assert_eq!(read(), LOG);
        ask(d.path(), &cfg, p, 11, TriageAction::Dismiss).unwrap();
        assert_eq!(read(), LOG.replace("- [ ] look at R0", "- [-] look at R0"));
        ask(d.path(), &cfg, p, 14, TriageAction::Reopen).unwrap();
        assert!(read().contains("\n- 14:43 Bulk DCA\n"), "the filing link goes with a reopen");
        // a line changed since the view read it: nothing written
        let stale = TriageRequest { path: p.into(), line: 12, source: "- 09:12 something else".into(), action: TriageAction::Dismiss };
        assert!(matches!(triage(d.path(), &cfg, &stale, now()), Err(Error::Conflict { .. })));
        assert!(read().contains("- 09:12 check the tail"));
    }

    #[test]
    fn filing_adds_the_capture_to_its_note_and_links_the_line() {
        let (d, cfg) = vault();
        let p = "notes/log/2026/10-October/2026-10-27.md";
        let touched = ask(d.path(), &cfg, p, 12, TriageAction::File { note: "notes/Bath.md".into() }).unwrap();
        assert_eq!(touched, vec![p.to_string(), "notes/Bath.md".into()]);
        assert_eq!(std::fs::read_to_string(d.path().join("notes/Bath.md")).unwrap(), "# Bath\n\n- check the tail ([[2026-10-27]])\n  http://x.org\n");
        let log = std::fs::read_to_string(d.path().join(p)).unwrap();
        assert!(log.contains("- 09:12 check the tail → [[Bath]]\n  http://x.org\n"), "{log}");
        assert_eq!(list(d.path(), &cfg).items[1].state, CaptureState::Filed);
        // a second capture goes to the end of the same note
        ask(d.path(), &cfg, "notes/log/2026/10-October/2026-10-26.md", 3, TriageAction::File { note: "notes/Bath.md".into() }).unwrap();
        assert!(std::fs::read_to_string(d.path().join("notes/Bath.md")).unwrap().ends_with("http://x.org\n- fit the bath ([[2026-10-26]])\n"));
    }

    #[test]
    fn an_inbox_note_is_triaged_by_its_properties() {
        let (d, cfg) = vault();
        let p = "inbox/A thought.md";
        let read = || std::fs::read_to_string(d.path().join(p)).unwrap();
        ask(d.path(), &cfg, p, 0, TriageAction::Dismiss).unwrap();
        assert!(read().contains("review: done"));
        assert_eq!(list(d.path(), &cfg).items.last().unwrap().state, CaptureState::Dismissed);
        ask(d.path(), &cfg, p, 0, TriageAction::Reopen).unwrap();
        assert!(!read().contains("review"));
        ask(d.path(), &cfg, p, 0, TriageAction::File { note: "notes/Sectors.md".into() }).unwrap();
        assert!(read().contains("filed: '[[Sectors]]'") || read().contains("filed: \"[[Sectors]]\""), "{}", read());
        assert_eq!(std::fs::read_to_string(d.path().join("notes/Sectors.md")).unwrap(), "# Sectors\n\n- A thought about sectors ([[A thought]])\n  more\n");
        let last = list(d.path(), &cfg).items.into_iter().find(|c| c.path == p).unwrap();
        assert_eq!((last.state, last.filed.as_deref()), (CaptureState::Filed, Some("Sectors")));
        // made a task: a line of today's log that links the note
        ask(d.path(), &cfg, p, 0, TriageAction::Reopen).unwrap();
        let touched = ask(d.path(), &cfg, p, 0, TriageAction::Task).unwrap();
        let log = std::fs::read_to_string(d.path().join(&touched[1])).unwrap();
        assert!(log.contains("- [ ] 21:40 A thought about sectors [[A thought]]\n"), "{log}");
    }

    #[test]
    fn the_hooks_link_and_the_box_keep_the_rest_of_the_line() {
        assert_eq!(link_line("- 10:02 x", "Films/Dune.md").as_deref(), Some("- 10:02 x → [[Dune]]"));
        assert_eq!(link_line("- 10:02 x → [[Dune]]", "Films/Dune.md"), None);
        assert_eq!(with_status("- 10:02 x", Some(' ')).as_deref(), Some("- [ ] 10:02 x"));
        assert_eq!(with_status("* [x] 10:02 x", Some('-')).as_deref(), Some("* [-] 10:02 x"));
        assert_eq!(with_status("- [x] 10:02 x", None).as_deref(), Some("- 10:02 x"));
        assert_eq!(stamp("10:02 x"), Some(("10:02", "x")));
        assert_eq!(stamp("10:02"), Some(("10:02", "")));
        assert_eq!(stamp("1002 x"), None);
    }
}
