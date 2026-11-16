//! Event notes, on demand (docs/design/DESIGN-calendar-tasks-nudges.md §2.2): an event gets a companion note only
//! when something links to it or from it — "Note" on its card, "Link to event…", a task time-blocked into it. The
//! note is `<folder>/<YYYY>/<YYYY-MM-DD> <title>.md` (folder: the `event_notes` setting), its properties a snapshot
//! of the event (`type: event`, `uid` — the key —, `recurrence_id` for one occurrence's note, `calendar`, `start`,
//! `end`, `location`, `cancelled`) followed by `links:`, then a `calendar.event` block that draws the live event. This
//! plugin writes only those properties and `links:`; the body below the block is the user's and never rewritten.
//! After each sync the snapshot is refreshed (`round`): a moved event's note follows it and says so (`Moved`), a
//! deleted one is kept and marked `cancelled: true` — it may hold writing.
use crate::recur::{self, Instance, Range};
use crate::store::{Source, Store};
use crate::zone::Zone;
use chrono::{Duration, NaiveDate};
use serde::Serialize;
use std::path::Path;

/// The event as its note's properties say it.
#[derive(Debug, Clone, PartialEq, Default)]
pub struct Snapshot {
    pub uid: String,
    /// one occurrence's note: its RECURRENCE-ID; None: the event's (a series' note is the series')
    pub rid: Option<String>,
    pub title: String,
    pub calendar: String,
    /// `2026-11-17T14:00` (the user's wall clock) or `2026-11-17` for an all-day event
    pub start: String,
    /// as `start`; an all-day event's last day (inclusive, as people read it)
    pub end: String,
    pub location: Option<String>,
    pub cancelled: bool,
}

/// The properties this plugin owns in an event note, in the order they are written.
const OWNED: [&str; 8] = ["type", "uid", "recurrence_id", "calendar", "start", "end", "location", "cancelled"];

impl Snapshot {
    /// An occurrence as the note shows it; `rid`: the note is that occurrence's.
    pub fn of(i: &Instance, calendar: &str, rid: Option<&str>) -> Snapshot {
        let wall = |s: &str| s.get(..16).unwrap_or(s).to_string();
        let (start, end) = if i.all_day {
            let last = NaiveDate::parse_from_str(&i.end, "%Y-%m-%d").map(|d| (d - Duration::days(1)).to_string()).unwrap_or_else(|_| i.end.clone());
            (i.start.clone(), last.max(i.start.clone()))
        } else {
            (wall(&i.start), wall(&i.end))
        };
        Snapshot {
            uid: i.uid.clone(),
            rid: rid.map(str::to_string),
            title: i.summary.clone(),
            calendar: calendar.to_string(),
            start,
            end,
            location: i.location.clone().filter(|l| !l.trim().is_empty()),
            cancelled: i.status.as_deref().is_some_and(|s| s.eq_ignore_ascii_case("CANCELLED")),
        }
    }

    /// The start's day.
    pub fn day(&self) -> Option<NaiveDate> {
        NaiveDate::parse_from_str(self.start.get(..10)?, "%Y-%m-%d").ok()
    }

    fn props(&self) -> Vec<(&'static str, Option<String>)> {
        vec![
            ("type", Some("event".into())),
            ("uid", Some(scalar(&self.uid))),
            ("recurrence_id", self.rid.as_deref().map(scalar)),
            ("calendar", Some(scalar(&self.calendar))),
            ("start", Some(scalar(&self.start))),
            ("end", Some(scalar(&self.end))),
            ("location", self.location.as_deref().map(scalar)),
            ("cancelled", self.cancelled.then(|| "true".to_string())),
        ]
    }
}

/// The folder event notes go in (the `event_notes` setting; `calendar` by default).
pub fn folder(settings: &serde_json::Value) -> String {
    let f = settings["event_notes"].as_str().map(|s| s.trim().trim_matches('/')).filter(|s| !s.is_empty() && !s.starts_with('.') && !s.contains(".."));
    f.unwrap_or("calendar").to_string()
}

/// A title as a file name: the characters no file system or wikilink takes become spaces.
pub fn file_title(title: &str) -> String {
    let t: String = title.chars().map(|c| if "/\\:*?\"<>|#^[]".contains(c) || c.is_control() { ' ' } else { c }).collect();
    let t = t.split_whitespace().collect::<Vec<_>>().join(" ");
    let t: String = t.chars().take(80).collect();
    let t = t.trim().trim_start_matches('.').to_string();
    if t.is_empty() { "Event".into() } else { t }
}

/// Where a new event note goes: `<folder>/<YYYY>/<YYYY-MM-DD> <title>.md`.
pub fn path_for(folder: &str, s: &Snapshot) -> String {
    let day = s.start.get(..10).unwrap_or("0000-00-00");
    format!("{folder}/{}/{day} {}.md", &day[..4.min(day.len())], file_title(&s.title))
}

/// A YAML scalar: plain when it reads back as the same string, else double-quoted (JSON's quoting is YAML's).
fn scalar(s: &str) -> String {
    let plain = !s.is_empty()
        && s.chars().all(|c| c.is_alphanumeric() || " ._/@+-:".contains(c))
        && !s.contains(": ")
        && !s.ends_with(':')
        && !s.starts_with(|c: char| c == '-' || c == ' ' || c == ':')
        && !s.ends_with(' ')
        && !matches!(s.to_ascii_lowercase().as_str(), "true" | "false" | "yes" | "no" | "null" | "on" | "off" | "~")
        && s.parse::<f64>().is_err();
    if plain { s.to_string() } else { serde_json::to_string(s).unwrap_or_default() }
}

/// `links: ["[[a]]", "[[b]]"]`.
fn links_value(links: &[String]) -> String {
    format!("[{}]", links.iter().map(|l| serde_json::to_string(l).unwrap_or_default()).collect::<Vec<_>>().join(", "))
}

/// A new event note: its properties, `links:`, the block, an empty line for the user's writing.
pub fn render(s: &Snapshot, links: &[String]) -> String {
    let mut out = String::from("---\n");
    for (k, v) in s.props() {
        if let Some(v) = v {
            out.push_str(&format!("{k}: {v}\n"));
        }
    }
    out.push_str(&format!("links: {}\n", links_value(links)));
    out.push_str("---\n```calendar.event\n```\n\n");
    out
}

/// The frontmatter's lines and the rest of the text; None when the text has none.
fn split(text: &str) -> Option<(Vec<&str>, &str)> {
    let body = text.strip_prefix("---\n").or_else(|| text.strip_prefix("---\r\n"))?;
    let mut at = 0;
    for line in body.split_inclusive('\n') {
        if line.trim_end() == "---" {
            let fm = body[..at].lines().collect();
            return Some((fm, &body[at + line.len()..]));
        }
        at += line.len();
    }
    None
}

/// `lines` with `key` set to `value` (None: taken out), in place — its block of indented or `- ` lines too — else
/// added after the last owned property, else at the end.
fn set_prop(lines: &mut Vec<String>, key: &str, value: Option<&str>) {
    let starts = |l: &str| l.strip_prefix(key).is_some_and(|r| r.starts_with(':'));
    let at = lines.iter().position(|l| starts(l));
    let line = value.map(|v| format!("{key}: {v}"));
    match at {
        Some(i) => {
            let mut j = i + 1;
            while j < lines.len() && (lines[j].starts_with(' ') || lines[j].starts_with('\t') || lines[j].starts_with("- ")) {
                j += 1;
            }
            lines.splice(i..j, line);
        }
        None => {
            let Some(line) = line else { return };
            let after = lines.iter().rposition(|l| OWNED.iter().any(|k| l.strip_prefix(k).is_some_and(|r| r.starts_with(':'))));
            lines.insert(after.map_or(lines.len(), |i| i + 1), line);
        }
    }
}

fn join(lines: &[String], rest: &str) -> String {
    let mut out = String::from("---\n");
    for l in lines {
        out.push_str(l);
        out.push('\n');
    }
    out.push_str("---\n");
    out.push_str(rest);
    out
}

/// The note with its properties set to the event's now; None when they already were (nothing to write). Every
/// other property and the body are kept as they are.
pub fn refresh(text: &str, s: &Snapshot) -> Option<String> {
    let (fm, rest) = split(text)?;
    let mut lines: Vec<String> = fm.iter().map(|l| l.to_string()).collect();
    for (k, v) in s.props() {
        set_prop(&mut lines, k, v.as_deref());
    }
    let next = join(&lines, rest);
    (next != text).then_some(next)
}

/// The note marked `cancelled: true` (the event is gone); None when it already is.
pub fn cancel(text: &str) -> Option<String> {
    let (fm, rest) = split(text)?;
    let mut lines: Vec<String> = fm.iter().map(|l| l.to_string()).collect();
    set_prop(&mut lines, "cancelled", Some("true"));
    let next = join(&lines, rest);
    (next != text).then_some(next)
}

/// The note's `links:` (a list, or one link).
pub fn links(text: &str) -> Vec<String> {
    match crate::sync::frontmatter(text).get("links") {
        Some(serde_yaml::Value::Sequence(s)) => s.iter().filter_map(|v| v.as_str().map(str::to_string)).collect(),
        Some(serde_yaml::Value::String(s)) if !s.trim().is_empty() => vec![s.clone()],
        _ => Vec::new(),
    }
}

/// The note with `link` (`[[target]]`) added to its `links:`; None when it is there already.
pub fn add_link(text: &str, link: &str) -> Option<String> {
    let key = |l: &str| l.trim().trim_start_matches("[[").trim_end_matches("]]").split('|').next().unwrap_or_default().trim_end_matches(".md").to_lowercase();
    let mut all = links(text);
    if all.iter().any(|l| key(l) == key(link)) {
        return None;
    }
    all.push(link.to_string());
    let (fm, rest) = split(text)?;
    let mut lines: Vec<String> = fm.iter().map(|l| l.to_string()).collect();
    set_prop(&mut lines, "links", Some(&links_value(&all)));
    Some(join(&lines, rest))
}

/// A link of an event note, as its card lists it: what it opens (the vault path and, for a task's block id, its
/// line) and what to call it (a task's title, else the note's name).
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Linked {
    pub link: String,
    pub path: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub line: Option<u32>,
    pub title: String,
    /// a task: open (` `) or done (`x`)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub task: Option<String>,
}

/// `[[notes/Thesis#^t3f9a|x]]` read in the vault at `root`: the file (`.md` added when the target has no extension),
/// the line of the block id, a task's title and box.
pub fn resolve(root: &Path, link: &str) -> Linked {
    let inner = link.trim().trim_start_matches("[[").trim_end_matches("]]");
    let (target, label) = inner.split_once('|').map_or((inner, None), |(t, l)| (t, Some(l)));
    let (file, anchor) = target.split_once('#').map_or((target, None), |(f, a)| (f, Some(a)));
    let path = if Path::new(file).extension().is_some() { file.to_string() } else { format!("{file}.md") };
    let name = Path::new(file).file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
    let mut out = Linked { link: link.to_string(), path: path.clone(), line: None, title: label.unwrap_or(&name).to_string(), task: None };
    let Some(block) = anchor.and_then(|a| a.strip_prefix('^')) else { return out };
    let Ok(text) = std::fs::read_to_string(root.join(&path)) else { return out };
    let want = format!("^{block}");
    if let Some((i, line)) = text.lines().enumerate().find(|(_, l)| l.trim_end().ends_with(&want)) {
        out.line = Some(i as u32 + 1);
        let body = line.trim_start().trim_start_matches(['-', '*', '+']).trim_start();
        if let Some(rest) = body.strip_prefix('[').and_then(|r| r.get(1..)).and_then(|r| r.strip_prefix("] ")) {
            out.task = body.get(1..2).map(str::to_string);
            let cut = rest.find(|c: char| "⏫🔺🔼🔽⏬📅⏳🛫➕✅🔁^".contains(c)).unwrap_or(rest.len());
            let cut = rest[..cut].find(" [[").unwrap_or(cut);
            out.title = rest[..cut].trim().to_string();
        }
    }
    out
}

/// An event note's key: (uid, recurrence_id), when the text is one (`type: event` with a `uid`).
pub fn key_of(text: &str) -> Option<(String, Option<String>)> {
    let m = crate::sync::frontmatter(text);
    let s = |k: &str| m.get(k).and_then(|v| v.as_str().map(str::to_string).or_else(|| v.as_i64().map(|n| n.to_string()))).filter(|v| !v.trim().is_empty());
    (s("type")?.eq_ignore_ascii_case("event")).then_some(())?;
    Some((s("uid")?, s("recurrence_id")))
}

/// A note's snapshot as written (to tell a moved event from its note).
pub fn written(text: &str) -> Snapshot {
    let m = crate::sync::frontmatter(text);
    let s = |k: &str| m.get(k).and_then(|v| v.as_str().map(str::to_string)).unwrap_or_default();
    Snapshot {
        uid: s("uid"),
        rid: Some(s("recurrence_id")).filter(|r| !r.is_empty()),
        title: String::new(),
        calendar: s("calendar"),
        start: s("start"),
        end: s("end"),
        location: Some(s("location")).filter(|l| !l.is_empty()),
        cancelled: matches!(m.get("cancelled"), Some(serde_yaml::Value::Bool(true))),
    }
}

/// Every event note under `folder`: (vault path, text).
pub fn notes(root: &Path, folder: &str) -> Vec<(String, String)> {
    let mut out = Vec::new();
    let mut stack = vec![root.join(folder)];
    while let Some(d) = stack.pop() {
        let Ok(rd) = std::fs::read_dir(&d) else { continue };
        for e in rd.flatten() {
            let p = e.path();
            if p.is_dir() {
                stack.push(p);
            } else if p.extension().is_some_and(|x| x == "md") {
                let (Ok(rel), Ok(text)) = (p.strip_prefix(root), std::fs::read_to_string(&p)) else { continue };
                if key_of(&text).is_some() {
                    out.push((rel.to_string_lossy().replace('\\', "/"), text));
                }
            }
        }
    }
    out.sort();
    out
}

/// The note of an event (or of one occurrence: `rid`), when one was made.
pub fn find(root: &Path, folder: &str, uid: &str, rid: Option<&str>) -> Option<(String, String)> {
    notes(root, folder).into_iter().find(|(_, t)| key_of(t).is_some_and(|(u, r)| u == uid && r.as_deref() == rid))
}

/// A free path for a new note: `path_for`, else with ` (2)`, ` (3)`… before `.md`.
pub fn free_path(root: &Path, folder: &str, s: &Snapshot) -> String {
    let first = path_for(folder, s);
    let base = first.trim_end_matches(".md").to_string();
    (1..100).map(|n| if n == 1 { first.clone() } else { format!("{base} ({n}).md") }).find(|p| !root.join(p).exists()).unwrap_or(first)
}

/// The occurrence a note is about, from the cache: `rid`'s, else the event's first (a series' start). `around`: the
/// day the note last said, so the expansion looks there (a year each way).
pub fn instance_of(store: &Store, uid: &str, rid: Option<&str>, around: NaiveDate, user: &Zone) -> Option<(Instance, Source)> {
    store.by_uid(uid).into_iter().find_map(|o| Some((occurrence(&o.ics, uid, rid, around, user)?, store.source(&o.source)?)))
}

/// [`instance_of`] in one calendar object's text.
pub fn occurrence(ics: &str, uid: &str, rid: Option<&str>, around: NaiveDate, user: &Zone) -> Option<Instance> {
    let range = Range::days(around - Duration::days(400), around + Duration::days(400), user);
    let cal = crate::ics::parse(ics).ok()?.into_iter().find(|c| c.name == "VCALENDAR")?;
    let mut found: Vec<Instance> = recur::expand(&cal, range, user).into_iter().filter(|i| i.uid == uid).collect();
    found.sort_by_key(|i| i.from);
    match rid {
        Some(r) => found.into_iter().find(|i| i.rid.as_deref() == Some(r)),
        None => found.into_iter().next(),
    }
}

/// How a task's link names the slot it was time-blocked into: "Tue 14:00" (the setting's clock), "Tue" all day.
pub fn slot_label(s: &Snapshot, twelve: bool) -> String {
    let Some(day) = s.day() else { return s.start.clone() };
    let wd = day.format("%a").to_string();
    match chrono::NaiveDateTime::parse_from_str(&s.start, "%Y-%m-%dT%H:%M") {
        Ok(t) if twelve => format!("{wd} {}", t.format("%-I:%M %p")),
        Ok(t) => format!("{wd} {}", t.format("%H:%M")),
        Err(_) => wd,
    }
}

/// An event that moved since its note last said: what the pane offers to move the linked tasks' ⏳ for.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Moved {
    pub note: String,
    pub uid: String,
    pub title: String,
    pub from: String,
    pub to: String,
    /// the note's links (tasks among them: `[[note#^id]]`)
    pub links: Vec<String>,
}

/// One pass over the event notes after the cache changed: each note's properties follow its event; an event gone from
/// a calendar that synced fine is marked cancelled (a calendar not read yet, or failing, says nothing). `write` puts a
/// file (`atlas_plugin::write_file` in the engine, so open tabs follow). Answers the events that moved.
pub fn round(store: &Store, root: &Path, folder: &str, user: &Zone, write: &dyn Fn(&str, &str)) -> Vec<Moved> {
    let mut moved = Vec::new();
    for (path, text) in notes(root, folder) {
        let Some((uid, rid)) = key_of(&text) else { continue };
        let was = written(&text);
        let around = was.day().unwrap_or_else(|| chrono::Utc::now().date_naive());
        let next = match instance_of(store, &uid, rid.as_deref(), around, user) {
            Some((i, src)) => {
                let now = Snapshot { rid: rid.clone(), ..Snapshot::of(&i, &src.id, rid.as_deref()) };
                if !was.start.is_empty() && was.start != now.start && !now.cancelled {
                    moved.push(Moved { note: path.clone(), uid: uid.clone(), title: now.title.clone(), from: was.start.clone(), to: now.start.clone(), links: links(&text) });
                }
                refresh(&text, &now)
            }
            None => {
                let synced = store.source(&was.calendar).is_some_and(|s| s.synced > 0 && s.error.is_none());
                if synced { cancel(&text) } else { None }
            }
        };
        if let Some(t) = next {
            write(&path, &t);
        }
    }
    moved
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::store::Kind;

    fn snap() -> Snapshot {
        Snapshot { uid: "6b1f@atlas".into(), rid: None, title: "Write intro".into(), calendar: "home/personal".into(), start: "2026-11-17T14:00".into(), end: "2026-11-17T15:00".into(), location: Some("D3".into()), cancelled: false }
    }

    #[test]
    fn a_new_note_has_the_snapshot_links_and_the_block() {
        let t = render(&snap(), &["[[Thesis#^t3f9a]]".into()]);
        assert_eq!(t, "---\ntype: event\nuid: 6b1f@atlas\ncalendar: home/personal\nstart: 2026-11-17T14:00\nend: 2026-11-17T15:00\nlocation: D3\nlinks: [\"[[Thesis#^t3f9a]]\"]\n---\n```calendar.event\n```\n\n");
        assert_eq!(key_of(&t), Some(("6b1f@atlas".into(), None)));
        assert_eq!(links(&t), vec!["[[Thesis#^t3f9a]]"]);
        assert_eq!(written(&t).start, "2026-11-17T14:00");
        assert_eq!(path_for("calendar", &Snapshot { title: "Rapport d'étape: v2 / final?".into(), ..snap() }), "calendar/2026/2026-11-17 Rapport d'étape v2 final.md");
        assert_eq!(slot_label(&snap(), false), "Tue 14:00");
        assert_eq!(slot_label(&snap(), true), "Tue 2:00 PM");
        assert_eq!(scalar("yes"), "\"yes\"");
        assert_eq!(scalar("12"), "\"12\"");
        assert_eq!(scalar("Room: 3"), "\"Room: 3\"");
    }

    #[test]
    fn a_refresh_changes_only_the_owned_properties_and_never_the_body() {
        let mine = "---\ntype: event\nuid: 6b1f@atlas\ncalendar: home/personal\nstart: 2026-11-17T14:00\nend: 2026-11-17T15:00\nlocation: D3\ntags: [meeting]\nlinks: [\"[[Thesis#^t3f9a]]\"]\n---\n```calendar.event\n```\n\nMy notes: start: here.\n";
        assert_eq!(refresh(mine, &snap()), None, "unchanged: nothing written");
        let later = Snapshot { start: "2026-11-18T09:00".into(), end: "2026-11-18T10:00".into(), location: None, ..snap() };
        let t = refresh(mine, &later).unwrap();
        assert_eq!(t, "---\ntype: event\nuid: 6b1f@atlas\ncalendar: home/personal\nstart: 2026-11-18T09:00\nend: 2026-11-18T10:00\ntags: [meeting]\nlinks: [\"[[Thesis#^t3f9a]]\"]\n---\n```calendar.event\n```\n\nMy notes: start: here.\n");
        let gone = cancel(&t).unwrap();
        assert!(gone.contains("end: 2026-11-18T10:00\ncancelled: true\ntags"), "{gone}");
        assert_eq!(cancel(&gone), None, "once");
        assert!(gone.ends_with("My notes: start: here.\n"));
        // a link added once; a block list written by hand is read and replaced by one line
        let hand = "---\ntype: event\nuid: u1\nlinks:\n  - \"[[a]]\"\n---\nbody\n";
        let added = add_link(hand, "[[mail/x]]").unwrap();
        assert_eq!(added, "---\ntype: event\nuid: u1\nlinks: [\"[[a]]\", \"[[mail/x]]\"]\n---\nbody\n");
        assert_eq!(add_link(&added, "[[mail/x.md]]"), None, "the same target");
    }

    #[test]
    fn a_link_is_resolved_to_its_file_line_and_task_title() {
        let dir = std::env::temp_dir().join(format!("atlas-dav-resolve-{}", std::process::id()));
        std::fs::create_dir_all(dir.join("notes")).unwrap();
        std::fs::write(dir.join("notes/Thesis.md"), "# Thesis\n\n- [ ] Write the introduction [[calendar/2026/2026-11-17 Write|Tue 14:00]] ⏫ ⏳ 2026-11-17 ^t3f9a\n").unwrap();
        let l = resolve(&dir, "[[notes/Thesis#^t3f9a]]");
        assert_eq!((l.path.as_str(), l.line, l.title.as_str(), l.task.as_deref()), ("notes/Thesis.md", Some(3), "Write the introduction", Some(" ")));
        let m = resolve(&dir, "[[mail/uni/Inbox/2026-11-10 Rapport|the report]]");
        assert_eq!((m.path.as_str(), m.line, m.title.as_str()), ("mail/uni/Inbox/2026-11-10 Rapport.md", None, "the report"));
        assert_eq!(resolve(&dir, "[[notes/Thesis]]").title, "Thesis");
        let _ = std::fs::remove_dir_all(&dir);
    }

    const ICS: &str = "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:6b1f@atlas\r\nSUMMARY:Write intro\r\nLOCATION:D3\r\nDTSTART:20261117T140000\r\nDTEND:20261117T150000\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n";

    fn store_with(ics: Option<&str>) -> Store {
        let st = Store::memory();
        let src = Source { id: "home/personal".into(), kind: Kind::Caldav, account: Some("home".into()), url: "http://127.0.0.1:9/cal/".into(), name: "Personal".into(), color: None, writable: true, ctag: None, token: None, synced: 1, error: None, alarm: None, alarm_day: None };
        st.put_source(&src).unwrap();
        st.set_state("home/personal", None, None, 1, None);
        if let Some(t) = ics {
            st.put("home/personal", "http://127.0.0.1:9/cal/6b1f.ics", Some("\"1\""), t).unwrap();
        }
        st
    }

    /// The note written once, refreshed when the event moves (and said moved), marked cancelled when it is gone.
    #[test]
    fn a_round_keeps_the_note_with_its_event() {
        let dir = std::env::temp_dir().join(format!("atlas-dav-notes-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        let user = Zone::UTC;
        let writes = std::cell::RefCell::new(0);
        let write = |p: &str, t: &str| {
            *writes.borrow_mut() += 1;
            std::fs::write(dir.join(p), t).unwrap();
        };
        let st = store_with(Some(ICS));
        let (i, src) = instance_of(&st, "6b1f@atlas", None, NaiveDate::from_ymd_opt(2026, 11, 17).unwrap(), &user).unwrap();
        let s = Snapshot::of(&i, &src.id, None);
        assert_eq!(s, snap());
        let path = free_path(&dir, "calendar", &s);
        std::fs::create_dir_all(dir.join("calendar/2026")).unwrap();
        std::fs::write(dir.join(&path), render(&s, &["[[Thesis#^t3f9a]]".into()]) + "Mine.\n").unwrap();
        assert_eq!(free_path(&dir, "calendar", &s), "calendar/2026/2026-11-17 Write intro (2).md", "never over another note");
        assert_eq!(find(&dir, "calendar", "6b1f@atlas", None).map(|f| f.0), Some(path.clone()));
        // nothing changed: nothing written
        assert!(round(&st, &dir, "calendar", &user, &write).is_empty());
        assert_eq!(*writes.borrow(), 0);
        // moved on the server: refreshed, and said
        let st = store_with(Some(&ICS.replace("20261117T140000", "20261118T090000").replace("20261117T150000", "20261118T100000")));
        let moved = round(&st, &dir, "calendar", &user, &write);
        assert_eq!(moved.len(), 1);
        assert_eq!((moved[0].from.as_str(), moved[0].to.as_str(), moved[0].links.clone()), ("2026-11-17T14:00", "2026-11-18T09:00", vec!["[[Thesis#^t3f9a]]".to_string()]));
        let t = std::fs::read_to_string(dir.join(&path)).unwrap();
        assert!(t.contains("start: 2026-11-18T09:00") && t.ends_with("Mine.\n"), "{t}");
        assert_eq!(*writes.borrow(), 1);
        // deleted on the server of a calendar that synced: kept, marked cancelled
        assert!(round(&store_with(None), &dir, "calendar", &user, &write).is_empty());
        let t = std::fs::read_to_string(dir.join(&path)).unwrap();
        assert!(t.contains("cancelled: true") && t.ends_with("Mine.\n"), "{t}");
        // a calendar that never synced says nothing about its events
        let unsynced = store_with(None);
        unsynced.set_state("home/personal", None, None, 0, None);
        let n = *writes.borrow();
        round(&unsynced, &dir, "calendar", &user, &write);
        assert_eq!(*writes.borrow(), n);
        let _ = std::fs::remove_dir_all(&dir);
    }
}
