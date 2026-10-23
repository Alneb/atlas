//! The vault's important dates, found deterministically in its notes (README.md, "Important notes"): a note with
//! `important: true` and a `due:` or `event:` date → an event per date, its UID from the note's path.
//!
//! Notes only, never mail: a mail note (`message_id` / `type: email`) is Email's, and its invitations reach the
//! Calendar through Email's call (`import_invite`), not a scan. Free-text dates: an agent reads them (`add_event`).
use crate::caldav::{Client, DavError, Existing, Outcome};
use crate::ics::{Event, When};
use crate::uid;
use chrono::{Duration, NaiveDate, Utc};
use serde::Serialize;
use serde_yaml::Value as Yaml;
use std::path::{Path, PathBuf};
use url::Url;

/// Where to look and how far back.
#[derive(Debug, Clone)]
pub struct Scope {
    /// vault folders searched; empty: the whole vault (hidden folders skipped)
    pub folders: Vec<String>,
    /// an event that ended more than this many days ago is left out
    pub past_days: i64,
}

/// A dated thing found in the vault: `important: true` + `due:` / `event:` on a note.
#[derive(Debug, Clone)]
pub struct Found {
    pub note: String,
    pub event: Event,
}

/// A path left out, and why.
#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct Skip {
    pub path: String,
    pub why: String,
}

#[derive(Debug, Default)]
pub struct Scan {
    pub found: Vec<Found>,
    /// left out on purpose (in the past, a cancellation)
    pub skipped: Vec<Skip>,
    /// could not be read (a date that is not one, a broken .ics)
    pub problems: Vec<Skip>,
}

/// One line of a sync's report.
#[derive(Debug, Clone, Serialize)]
pub struct Report {
    pub title: String,
    pub start: String,
    pub uid: String,
    pub path: String,
    /// added · updated · unchanged · failed
    pub outcome: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub why: Option<String>,
}

/// Whether a vault path is under one of the folders (no folders: anywhere but a hidden one).
pub fn in_scope(path: &str, folders: &[String]) -> bool {
    let p = path.trim_start_matches("./");
    let named: Vec<&str> = folders.iter().map(|f| f.trim().trim_matches('/')).filter(|f| !f.is_empty()).collect();
    if named.is_empty() {
        return !p.split('/').any(|part| part.starts_with('.'));
    }
    named.iter().any(|f| p == *f || p.starts_with(&format!("{f}/")))
}

/// A mail kept as a note (Email's: a `message_id`, or `type: email`): never read for dates.
pub fn is_mail(m: &serde_yaml::Mapping) -> bool {
    prop(m, "message_id").is_some() || prop(m, "type").is_some_and(|t| t.eq_ignore_ascii_case("email"))
}

/// A note's frontmatter (an empty map when it has none or it is not YAML).
pub fn frontmatter(text: &str) -> serde_yaml::Mapping {
    let Some(rest) = text.strip_prefix("---\n").or_else(|| text.strip_prefix("---\r\n")) else {
        return Default::default();
    };
    let end = rest.find("\n---").unwrap_or(rest.len());
    match serde_yaml::from_str::<Yaml>(&rest[..end]) {
        Ok(Yaml::Mapping(m)) => m,
        _ => Default::default(),
    }
}

/// A property as text: a scalar as written, a list's first item.
fn prop(m: &serde_yaml::Mapping, key: &str) -> Option<String> {
    let v = m.get(key)?;
    let v = match v {
        Yaml::Sequence(s) => s.first()?,
        v => v,
    };
    let s = match v {
        Yaml::String(s) => s.trim().to_string(),
        Yaml::Number(n) => n.to_string(),
        Yaml::Bool(b) => b.to_string(),
        _ => return None,
    };
    (!s.is_empty()).then_some(s)
}

fn truthy(m: &serde_yaml::Mapping, key: &str) -> bool {
    match m.get(key) {
        Some(Yaml::Bool(b)) => *b,
        Some(Yaml::String(s)) => matches!(s.trim().to_ascii_lowercase().as_str(), "true" | "yes" | "y" | "1"),
        Some(Yaml::Number(n)) => n.as_i64() == Some(1),
        _ => false,
    }
}

/// A note's title: `title`, else `subject`, else its first `# ` heading, else its file name.
pub fn title_of(path: &str, text: &str, m: &serde_yaml::Mapping) -> String {
    prop(m, "title")
        .or_else(|| prop(m, "subject"))
        .or_else(|| {
            text.lines().find_map(|l| l.strip_prefix("# ").map(|t| t.trim().to_string())).filter(|t| !t.is_empty())
        })
        .unwrap_or_else(|| Path::new(path).file_stem().map(|s| s.to_string_lossy().into_owned()).unwrap_or_default())
}

/// The dated events an important note asks for (`due:`, `event:` with `event_end:`); a date that is not one is a problem.
pub fn dated_events(path: &str, text: &str) -> (Vec<Event>, Vec<Skip>) {
    let m = frontmatter(text);
    let (mut out, mut bad) = (Vec::new(), Vec::new());
    if !truthy(&m, "important") || is_mail(&m) {
        return (out, bad);
    }
    let title = title_of(path, text, &m);
    let source = path.to_string();
    let description = format!("From the note {path} in Atlas");
    for (key, prefix) in [("due", "Due: "), ("event", "")] {
        let Some(raw) = prop(&m, key) else { continue };
        let start = match When::parse(&raw) {
            Ok(w) => w,
            Err(e) => {
                bad.push(Skip { path: path.into(), why: format!("{key}: {e}") });
                continue;
            }
        };
        let mut end = None;
        if key == "event" {
            if let Some(raw_end) = prop(&m, "event_end") {
                match When::parse(&raw_end) {
                    // an all-day end is the last day, inclusive; DTEND is the day after
                    Ok(When::Day(d)) if start.is_day() => end = Some(When::Day(d + Duration::days(1))),
                    Ok(w) if w.naive() > start.naive() => end = Some(w),
                    Ok(_) => bad.push(Skip {
                        path: path.into(),
                        why: "event_end: is not after event:; the default length was used".into(),
                    }),
                    Err(e) => bad.push(Skip { path: path.into(), why: format!("event_end: {e}") }),
                }
            }
        }
        out.push(Event {
            uid: uid::derive(&source, key),
            summary: format!("{prefix}{title}"),
            start,
            end,
            description: Some(description.clone()),
            location: prop(&m, "location"),
            source: Some(path.to_string()),
        });
    }
    (out, bad)
}

/// A path's vault-relative form, when it is a file inside the vault (no `..` or link out of it).
fn inside(root: &Path, p: &Path) -> Option<String> {
    let (r, f) = (root.canonicalize().ok()?, p.canonicalize().ok()?);
    let rel = f.strip_prefix(&r).ok()?;
    f.is_file().then(|| rel.to_string_lossy().replace('\\', "/"))
}

/// The Markdown notes under the scope's folders, or the whole vault (hidden folders skipped).
fn walk(root: &Path, folders: &[String]) -> Vec<String> {
    let mut out = Vec::new();
    let named: Vec<PathBuf> = folders.iter().map(|f| f.trim().trim_matches('/')).filter(|f| !f.is_empty()).map(|f| root.join(f)).collect();
    let mut stack: Vec<PathBuf> = if named.is_empty() { vec![root.to_path_buf()] } else { named.into_iter().filter(|p| p.is_dir()).collect() };
    while let Some(d) = stack.pop() {
        let Ok(entries) = std::fs::read_dir(&d) else { continue };
        for e in entries.flatten() {
            let p = e.path();
            let name = e.file_name().to_string_lossy().into_owned();
            if name.starts_with('.') {
                continue;
            }
            if p.is_dir() {
                stack.push(p);
            } else if name.ends_with(".md") {
                if let Some(rel) = inside(root, &p) {
                    out.push(rel);
                }
            }
        }
    }
    out.sort();
    out
}

/// Finds the dated notes under the scope (or only in `only`, the paths that just changed). `today` sets "the past".
pub fn scan(root: &Path, scope: &Scope, only: Option<&[String]>, today: NaiveDate) -> Scan {
    let paths: Vec<String> = match only {
        Some(ps) => ps.iter().filter(|p| in_scope(p, &scope.folders) && p.ends_with(".md")).cloned().collect(),
        None => walk(root, &scope.folders),
    };
    let oldest = today - Duration::days(scope.past_days.max(0));
    let mut scan = Scan::default();
    for p in &paths {
        let Ok(text) = std::fs::read_to_string(root.join(p)) else { continue };
        let (events, bad) = dated_events(p, &text);
        scan.problems.extend(bad);
        for event in events {
            if event.end().date() < oldest {
                scan.skipped.push(Skip { path: p.clone(), why: format!("\"{}\" ended before {oldest}", event.summary) });
            } else {
                scan.found.push(Found { note: p.clone(), event });
            }
        }
    }
    scan
}

/// Writes what a scan found into the calendar, one narrated line each; `told` hears every event added or updated.
pub fn push(client: &Client, cal: &Url, found: &[Found], told: &dyn Fn(&Report)) -> Vec<Report> {
    let mut out = Vec::new();
    for f in found {
        let ev = &f.event;
        let result: Result<Outcome, DavError> = client.upsert(cal, &ev.uid, &ev.to_ics(Utc::now()), Some(&ev.hash()), Existing::Update).map(|(o, _)| o);
        let report = |outcome: String, why: Option<String>| Report { title: ev.summary.clone(), start: ev.start.human(), uid: ev.uid.clone(), path: f.note.clone(), outcome, why };
        let r = match result {
            Ok(o) => report(format!("{o:?}").to_lowercase(), None),
            Err(e @ DavError::Auth { .. }) | Err(e @ DavError::Network { .. }) => {
                // the rest would fail the same way
                eprintln!("dav: sync stopped: {e}");
                out.push(report("failed".into(), Some(e.to_string())));
                break;
            }
            Err(e) => report("failed".into(), Some(e.to_string())),
        };
        match r.outcome.as_str() {
            "added" | "updated" => {
                eprintln!("dav: {} \"{}\" ({}) from {}", r.outcome, r.title, r.start, r.path);
                told(&r);
            }
            "failed" => eprintln!("dav: could not write \"{}\" ({}) from {}: {}", r.title, r.start, r.path, r.why.as_deref().unwrap_or("")),
            _ => {}
        }
        out.push(r);
    }
    out
}

/// "2 added, 1 updated, 5 unchanged, 1 skipped, 1 failed".
pub fn summary(reports: &[Report], skipped: usize, problems: usize) -> String {
    let n = |o: &str| reports.iter().filter(|r| r.outcome == o).count();
    let mut parts: Vec<String> = [
        ("added", n("added")),
        ("updated", n("updated")),
        ("unchanged", n("unchanged")),
        ("skipped", skipped),
        ("failed", n("failed") + problems),
    ]
    .iter()
    .filter(|(_, k)| *k > 0)
    .map(|(w, k)| format!("{k} {w}"))
    .collect();
    if parts.is_empty() {
        parts.push("no important dates found".into());
    }
    parts.join(", ")
}

#[cfg(test)]
mod tests {
    use super::*;

    fn day(s: &str) -> NaiveDate {
        NaiveDate::parse_from_str(s, "%Y-%m-%d").unwrap()
    }

    fn vault(files: &[(&str, &str)]) -> tempdir::Dir {
        let d = tempdir::Dir::new();
        for (p, text) in files {
            let path = d.0.join(p);
            std::fs::create_dir_all(path.parent().unwrap()).unwrap();
            std::fs::write(path, text).unwrap();
        }
        d
    }

    /// A temporary folder removed when dropped (std only).
    mod tempdir {
        pub struct Dir(pub std::path::PathBuf);
        impl Dir {
            pub fn new() -> Dir {
                use std::sync::atomic::{AtomicU32, Ordering};
                static N: AtomicU32 = AtomicU32::new(0);
                let p = std::env::temp_dir().join(format!("atlas-dav-test-{}-{}", std::process::id(), N.fetch_add(1, Ordering::Relaxed)));
                std::fs::create_dir_all(&p).unwrap();
                Dir(p)
            }
        }
        impl Drop for Dir {
            fn drop(&mut self) {
                let _ = std::fs::remove_dir_all(&self.0);
            }
        }
    }

    // as the email plugin writes a mail note (JSON-quoted properties), with important/due added
    const MAIL: &str = "---\ntype: email\nfrom: \"Prof <prof@uni.example.org>\"\nsubject: \"Rapport d'étape\"\nmessage_id: \"<abc123@uni.example.org>\"\nimportant: true\ndue: 2026-11-15\n---\n# Rapport\n\n- ![[mail/uni/Inbox/2026-10-20 Rapport files/invite.ics]]\n";
    const ICS: &str = "BEGIN:VCALENDAR\r\nMETHOD:REQUEST\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:meet-1@uni.example.org\r\nSUMMARY:Comité\r\nDTSTART:20261120T140000Z\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n";
    const NOTE: &str = "---\nimportant: true\ndue: 2026-11-15\ntitle: Rapport d'étape\n---\n# Rapport\n";

    fn everywhere() -> Scope {
        Scope { folders: vec![], past_days: 30 }
    }

    #[test]
    fn an_important_note_gives_its_due_date_with_a_uid_from_its_path() {
        let (evs, bad) = dated_events("notes/Rapport.md", NOTE);
        assert!(bad.is_empty(), "{bad:?}");
        assert_eq!(evs.len(), 1);
        let e = &evs[0];
        assert_eq!(e.summary, "Due: Rapport d'étape", "the title property names it");
        assert_eq!(e.start, When::Day(day("2026-11-15")));
        assert_eq!(e.uid, uid::derive("notes/Rapport.md", "due"));
    }

    #[test]
    fn mail_is_never_read_for_dates() {
        assert!(dated_events("mail/uni/Inbox/a.md", MAIL).0.is_empty(), "a message_id: Email's");
        assert!(dated_events("x.md", "---\ntype: email\nimportant: true\ndue: 2026-11-15\n---\n").0.is_empty(), "type: email");
    }

    #[test]
    fn notes_not_marked_important_or_with_a_bad_date_give_nothing_or_a_reason() {
        assert!(dated_events("a.md", &NOTE.replace("important: true", "important: false")).0.is_empty());
        assert!(dated_events("a.md", "no frontmatter\n").0.is_empty());
        let (evs, bad) = dated_events("a.md", "---\nimportant: yes\ndue: someday\nevent: \"2026-12-01 10:00\"\nevent_end: \"2026-12-01 12:30\"\ntitle: Defence\nlocation: D3\n---\n");
        assert_eq!(bad.len(), 1, "{bad:?}");
        assert!(bad[0].why.starts_with("due:"));
        assert_eq!(evs.len(), 1);
        assert_eq!((evs[0].summary.as_str(), evs[0].end().human(), evs[0].location.as_deref()), ("Defence", "2026-12-01 12:30".to_string(), Some("D3")));
        assert_eq!(evs[0].uid, uid::derive("a.md", "event"));
        // an all-day event_end is the last day, inclusive
        let (evs, _) = dated_events("b.md", "---\nimportant: true\nevent: 2026-12-01\nevent_end: 2026-12-03\n---\n");
        assert_eq!(evs[0].end(), When::Day(day("2026-12-04")));
    }

    #[test]
    fn a_scan_reads_notes_only_never_mail_or_calendar_files() {
        let past = NOTE.replace("2026-11-15", "2025-01-01");
        let v = vault(&[
            ("mail/uni/Inbox/2026-10-20 Rapport.md", MAIL),
            ("mail/uni/Inbox/2026-10-20 Rapport files/invite.ics", ICS),
            ("notes/Rapport.md", NOTE),
            ("notes/old.md", &past),
            ("notes/invite.ics", ICS),
            (".atlas/x.md", NOTE),
        ]);
        let s = scan(&v.0, &everywhere(), None, day("2026-10-21"));
        let found: Vec<&str> = s.found.iter().map(|f| f.note.as_str()).collect();
        assert_eq!(found, ["notes/Rapport.md"], "no mail, no .ics, no hidden folder");
        assert!(s.skipped.iter().any(|k| k.why.contains("ended before")), "{:?}", s.skipped);
        let only = vec!["notes/Rapport.md".to_string(), "mail/uni/Inbox/2026-10-20 Rapport.md".into(), "notes/invite.ics".into(), "notes/gone.md".into()];
        assert_eq!(scan(&v.0, &everywhere(), Some(&only), day("2026-10-21")).found.len(), 1);
        let narrow = Scope { folders: vec!["projects".into()], past_days: 30 };
        assert!(scan(&v.0, &narrow, None, day("2026-10-21")).found.is_empty(), "outside the folders: never read");
    }

    #[test]
    fn scope_and_summary() {
        let f = vec!["notes".to_string(), "/projects/dates/".into()];
        assert!(in_scope("notes/a.md", &f) && in_scope("projects/dates/x.md", &f) && in_scope("./notes/a.md", &f));
        assert!(!in_scope("notesbox/a.md", &f) && !in_scope("projects/a.md", &f));
        assert!(in_scope("anything/a.md", &[]) && !in_scope(".atlas/a.md", &[]), "no folders: the vault, hidden ones out");
        assert_eq!(summary(&[], 0, 0), "no important dates found");
        let r = |o: &str| Report { title: String::new(), start: String::new(), uid: String::new(), path: String::new(), outcome: o.into(), why: None };
        assert_eq!(summary(&[r("added"), r("added"), r("unchanged"), r("failed")], 2, 1), "2 added, 1 unchanged, 2 skipped, 2 failed");
    }
}
