//! Zero-field capture, nothing asked: one timestamped bullet appended to today's log, or — with
//! `[notes] capture = "note"` — a note of its own in the inbox folder (a fleeting note, reviewed later).
use crate::api::{CaptureResult, NewNote};
use crate::config::{CaptureMode, Config};
use crate::{paths, vault_write, Error, Result};
use chrono::NaiveDateTime;
use std::path::Path;

/// Every capture box's empty-box prompt. Mirrored in `ui/src/lib/capture-guides.ts` and `CaptureActivity.java`
/// (atlas-capture's tests fail when a mirror differs).
pub const PROMPT: &str = "Capture a thought, a to-do, a link…";

/// One short form a capture can start with, as the boxes show it while they are empty.
pub struct Guide {
    /// What the chip reads.
    pub shown: &'static str,
    /// What a click on the chip puts in the box.
    pub starts: &'static str,
    /// The word beside the chip.
    pub what: &'static str,
    /// The chip's tooltip: the form with examples.
    pub tip: &'static str,
}

/// The short forms, in the order every box shows them (mirrored like [`PROMPT`]).
pub const GUIDES: [Guide; 4] = [
    Guide { shown: "[]", starts: "[] ", what: "to-do", tip: "A to-do — [] pay the rent @fri · todo: call Ada" },
    Guide { shown: "@fri", starts: "@", what: "date", tip: "A date — @today, @tomorrow, @fri, @+3d, @2026-11-02 (on a to-do: when it is due)" },
    Guide { shown: "[[", starts: "[[", what: "link", tip: "A link to a note — [[ then a few letters of its name" },
    Guide { shown: "#", starts: "#", what: "tag", tip: "A tag — #idea, #physics" },
];

pub fn capture(root: &Path, cfg: &Config, text: &str) -> Result<CaptureResult> {
    capture_at(root, cfg, text, chrono::Local::now().naive_local())
}

/// Captures written while no Atlas served their vault, waiting for its capture hooks (capture_hooks.rs): the next
/// core to serve the vault runs them first, so a link captured offline is still filed, a screenshot still read.
/// Synced with the vault (not in `.atlas/cache`, which stays per machine): a capture on the phone reaches the desktop.
/// One file per device, so two machines never append to the same file; every file here is taken (conflict copies too).
pub const PENDING_DIR: &str = ".atlas/pending";

/// This device's file in [`PENDING_DIR`]: its host name, letters and digits only.
fn pending_file(root: &Path) -> std::path::PathBuf {
    let host = crate::platform::proc::hostname();
    let host: String = host.chars().filter(|c| c.is_ascii_alphanumeric() || *c == '-').collect();
    root.join(PENDING_DIR).join(format!("{}.jsonl", if host.is_empty() { "device" } else { &host }))
}

/// A capture by a door that found no Atlas serving the vault (the CLI, the desktop box, a capture into another
/// vault): written now, and kept for the hooks. Keeping it never fails the capture (said on stderr instead).
pub fn capture_unserved(root: &Path, cfg: &Config, text: &str) -> Result<CaptureResult> {
    let r = capture(root, cfg, text)?;
    if cfg!(target_os = "android") {
        // the phone: nothing left pending; its own helpers (the APK's Python) file what they can
        return Ok(r);
    }
    let c = crate::events::Captured { text: text.to_string(), path: r.path.clone(), line: r.line };
    if let Err(e) = remember(root, &c) {
        eprintln!("atlas: the capture is written, but not kept for the capture hooks: {e}");
    }
    Ok(r)
}

fn remember(root: &Path, c: &crate::events::Captured) -> Result<()> {
    let line = serde_json::to_string(c).map_err(|e| Error::BadRequest(e.to_string()))?;
    vault_write::append(&pending_file(root), format!("{line}\n").as_bytes())
}

/// The captures kept for the hooks, from every device, each file's in order; the files are removed (each capture is
/// acted on once).
pub fn take_pending(root: &Path) -> Vec<crate::events::Captured> {
    let Ok(dir) = std::fs::read_dir(root.join(PENDING_DIR)) else { return vec![] };
    let mut files: Vec<_> = dir.flatten().map(|e| e.path()).filter(|p| p.is_file()).collect();
    files.sort();
    let mut out = vec![];
    for f in files {
        let Ok(text) = std::fs::read_to_string(&f) else { continue };
        let _ = vault_write::remove_file(&f);
        out.extend(text.lines().filter_map(|l| serde_json::from_str(l).ok()));
    }
    out
}

/// A capture meant as a task, in any of the quick spellings: `[] x`, `[ ] x`, `- [ ] x`, `todo x`,
/// `todo: x`, `t: x` (any case) → `x`.
pub(crate) fn as_task(first: &str) -> Option<&str> {
    let s = first.trim_start();
    let s = s.strip_prefix(['-', '*', '+']).map(str::trim_start).unwrap_or(s);
    for box_ in ["[ ]", "[]"] {
        if let Some(rest) = s.strip_prefix(box_) {
            return Some(rest.trim()).filter(|r| !r.is_empty());
        }
    }
    let lower = s.to_ascii_lowercase();
    ["todo:", "todo ", "t:"].iter().find(|p| lower.starts_with(*p)).map(|p| s[p.len()..].trim()).filter(|r| !r.is_empty())
}

/// Whether `text` starts as a task in those spellings, its text perhaps still being typed: the capture boxes
/// offer the task fields from here on (the native box; `TODO` in ui/src/lib/textarea-complete.ts says the same).
pub fn starts_as_task(text: &str) -> bool {
    let s = text.trim_start();
    let s = s.strip_prefix(['-', '*', '+']).map(str::trim_start).unwrap_or(s);
    let lower = s.to_ascii_lowercase();
    ["[ ] ", "[] ", "todo: ", "todo ", "t: "].iter().any(|p| lower.starts_with(p))
}

/// The day a capture's `@word` names: `today`, `tomorrow`, `mon`…`sun` (the next such day), `+3d`.
/// Also used by the quick-capture box to say when a to-do is due (crates/atlas-capture).
pub fn day_of(word: &str, today: chrono::NaiveDate) -> Option<chrono::NaiveDate> {
    use chrono::{Datelike, Duration};
    const DAYS: [&str; 7] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
    let w = word.to_ascii_lowercase();
    match w.as_str() {
        "today" => Some(today),
        "tomorrow" | "tmr" => Some(today + Duration::days(1)),
        _ => {
            if let Some(n) = w.strip_prefix('+').and_then(|n| n.strip_suffix('d')).and_then(|n| n.parse::<i64>().ok()) {
                return Some(today + Duration::days(n));
            }
            let i = DAYS.iter().position(|d| w.starts_with(d) && w.len() <= 9)? as i64;
            let ahead = (i - today.weekday().num_days_from_monday() as i64).rem_euclid(7);
            Some(today + Duration::days(if ahead == 0 { 7 } else { ahead }))
        }
    }
}

/// The day words the capture boxes offer after `@`, in their order.
pub const DAY_WORDS: [&str; 11] = ["today", "tomorrow", "mon", "tue", "wed", "thu", "fri", "sat", "sun", "+3d", "+7d"];

/// [`DAY_WORDS`] with the day each names from `today`.
pub fn days(today: chrono::NaiveDate) -> Vec<crate::api::CaptureDay> {
    DAY_WORDS.iter().filter_map(|w| Some(crate::api::CaptureDay { word: w.to_string(), date: day_of(w, today)?.format("%Y-%m-%d").to_string() })).collect()
}

/// The day the text names (`@tomorrow`, `@fri`, `@+3d`, `@2026-10-30`, or `📅 YYYY-MM-DD`).
pub fn due(text: &str, today: chrono::NaiveDate) -> Option<chrono::NaiveDate> {
    use chrono::NaiveDate;
    let words: Vec<&str> = text.split_whitespace().collect();
    words.iter().enumerate().find_map(|(i, w)| {
        if let Some(d) = w.strip_prefix('@') {
            return day_of(d, today).or_else(|| NaiveDate::parse_from_str(d, "%Y-%m-%d").ok());
        }
        (w.trim_end_matches('\u{FE0F}') == "📅").then(|| words.get(i + 1).and_then(|d| NaiveDate::parse_from_str(d, "%Y-%m-%d").ok())).flatten()
    })
}

/// A day as people say it: today, tomorrow, Friday (within the week), else "Thu 22 Oct".
pub fn say_day(d: chrono::NaiveDate, today: chrono::NaiveDate) -> String {
    match (d - today).num_days() {
        0 => "today".into(),
        1 => "tomorrow".into(),
        2..=6 => d.format("%A").to_string(),
        _ => d.format("%a %-d %b").to_string(),
    }
}

/// What `text` will become once sent, for every capture box. With its vault (`at`), the vault's own capture mode and
/// inbox, and the kind the catalog would file it as, count; without, a vault's defaults.
pub fn describe(at: Option<(&Path, &Config)>, text: &str, today: chrono::NaiveDate) -> crate::api::CaptureHint {
    let task = starts_as_task(text);
    let due = due(text, today);
    let when = due.map(|d| say_day(d, today));
    let note = at.is_some_and(|(_, cfg)| cfg.notes.capture == CaptureMode::Note);
    let mut says = match (task, when) {
        (true, Some(w)) => format!("a to-do, due {w}"),
        (true, None) => "a to-do".into(),
        (false, w) => {
            let what = if note { format!("a note in {}", at.map_or("", |(_, c)| c.notes.inbox.trim_matches('/'))) } else { "a line in today's log".into() };
            w.map_or(what.clone(), |w| format!("{what} · mentions {w}"))
        }
    };
    if let Some(kind) = at.and_then(|(root, cfg)| crate::catalog_hint::kind_of(root, cfg, text)) {
        says = format!("{says} · catalogued as {}", crate::catalog_hint::kind_words(&kind));
    }
    crate::api::CaptureHint { task, due: due.map(|d| d.format("%Y-%m-%d").to_string()), says }
}

/// `@today`, `@tomorrow`, `@mon`…`@sun` and `@+3d` → `@YYYY-MM-DD`, the date the task views read;
/// any other word is left as typed.
fn with_dates(text: &str, today: chrono::NaiveDate) -> String {
    text.split(' ')
        .map(|w| w.strip_prefix('@').and_then(|d| day_of(d, today)).map(|d| format!("@{}", d.format("%Y-%m-%d"))).unwrap_or_else(|| w.to_string()))
        .collect::<Vec<_>>()
        .join(" ")
}

/// `- HH:MM first line`, or `- [ ] HH:MM first line` for a capture written as a task ([`as_task`]): every capture
/// carries its time, so the log draws one timeline and captures.rs finds each one by its shape;
/// continuation lines indented 2 spaces (blank ones left empty). A line repeating one already written is dropped: a
/// share sends its title and its address, often the same URL twice (2026-10-21, PhysRevB.91.085116 logged twice).
pub fn format_entry(text: &str, now: NaiveDateTime) -> Result<String> {
    let text = text.replace("\r\n", "\n");
    let text = text.trim_end().trim_start_matches('\n');
    if text.trim().is_empty() {
        return Err(Error::BadRequest("capture text is empty".into()));
    }
    let mut lines = text.lines();
    let first = lines.next().unwrap_or_default().trim_end();
    let mut out = match as_task(first) {
        Some(task) => format!("- [ ] {} {}\n", now.format("%H:%M"), with_dates(task, now.date())),
        // a line too: `@fri` becomes its date, as the box said ("mentions Friday")
        None => format!("- {} {}\n", now.format("%H:%M"), with_dates(first, now.date())),
    };
    let mut seen = vec![first.trim()];
    for l in lines {
        let l = l.trim_end();
        if seen.contains(&l.trim()) && !l.trim().is_empty() {
            continue;
        }
        seen.push(l.trim());
        if l.is_empty() {
            out.push('\n');
        } else {
            out.push_str("  ");
            out.push_str(l);
            out.push('\n');
        }
    }
    Ok(out)
}

/// Every door's capture ends here: its addresses lose their share-tracking parameters first (`atlas_text::links`).
pub fn capture_at(root: &Path, cfg: &Config, text: &str, now: NaiveDateTime) -> Result<CaptureResult> {
    let text = &atlas_text::links::untracked(text);
    match cfg.notes.capture {
        CaptureMode::Log => append_to_log(root, cfg, text, now),
        // a task is a line among the day's tasks, never a note of its own
        CaptureMode::Note if as_task(text.trim_start().lines().next().unwrap_or_default()).is_some() => append_to_log(root, cfg, text, now),
        CaptureMode::Note => {
            if text.trim().is_empty() {
                return Err(Error::BadRequest("capture text is empty".into()));
            }
            // named by its first line; the whole text is the note's body
            let title = text.trim().lines().next().unwrap_or_default().to_string();
            // its template by the rules (template_rules.rs): a template's own for captures or the inbox, else
            // `capture_template`; none fits: the new-note rules, then the default
            let at = format!("{}/{}.md", cfg.notes.inbox.trim_matches('/'), crate::notes::file_stem(&title));
            let template = crate::template_rules::choose(root, cfg, &crate::template_rules::Moment::Capture { path: &at }).map(|c| c.template);
            let req = NewNote {
                template,
                title,
                dir: Some(cfg.notes.inbox.clone()),
                near: None,
                text: Some(text.replace("\r\n", "\n")),
                values: None,
            };
            let r = crate::notes::new_note_at(root, cfg, &req, now)?;
            Ok(CaptureResult { path: r.path, line: r.line, source: None })
        }
    }
}

/// Where a day's log is, from the vault's root: `<log_dir>/<log_folders>/YYYY-MM-DD.md`. Every reader and writer of a day's log asks here.
pub fn day_log(cfg: &Config, day: chrono::NaiveDate) -> String {
    let dir = cfg.log_dir.trim_matches('/');
    let pattern = cfg.log_folders.trim().trim_matches('/');
    let folders = if pattern.is_empty() {
        String::new()
    } else {
        let _names = crate::bases::dates::names(cfg.editor.date_names == crate::config::DateNames::Spanish);
        format!("{}/", crate::bases::dates::format(&day.and_hms_opt(12, 0, 0).expect("noon exists"), pattern))
    };
    format!("{dir}/{folders}{}.md", day.format("%Y-%m-%d"))
}

/// Today's log, made from the log template when it is missing (the Home log card's one button: "create or edit the
/// log"). Never rewrites one that is there; `create_new` so two doors making it at once never clobber each other.
pub fn today_log(root: &Path, cfg: &Config, now: NaiveDateTime) -> Result<crate::api::TodayLog> {
    let rel = day_log(cfg, now.date());
    let path = paths::safe_join(root, &rel)?;
    if path.exists() {
        return Ok(crate::api::TodayLog { path: rel, created: false });
    }
    let text = crate::notes::daily_log_start(root, cfg, &now.format("%Y-%m-%d").to_string(), now);
    let created = vault_write::create(&path, text.as_bytes())? == vault_write::Created::New;
    Ok(crate::api::TodayLog { path: rel, created })
}

/// `![[shot.png]]` → `![[shot.png|160]]`: a captured picture is a thumbnail in the log. Sized ones, and files that are
/// not pictures, are left as they are; `width` 0 leaves everything.
fn sized_pictures(text: &str, width: u32) -> String {
    if width == 0 {
        return text.to_string();
    }
    static EMBED: std::sync::LazyLock<regex::Regex> = std::sync::LazyLock::new(|| regex::Regex::new(r"!\[\[([^\]|#\n]+)\]\]").expect("valid"));
    EMBED
        .replace_all(text, |c: &regex::Captures| match crate::link_targets::is_image(c[1].trim()) {
            true => format!("![[{}|{width}]]", &c[1]),
            false => c[0].to_string(),
        })
        .into_owned()
}

/// Appends (never rewrites) so a concurrent editor sees a plain mtime change.
fn append_to_log(root: &Path, cfg: &Config, text: &str, now: NaiveDateTime) -> Result<CaptureResult> {
    let entry = format_entry(&sized_pictures(text, cfg.notes.capture_thumbnail), now)?;
    let date = now.format("%Y-%m-%d").to_string();
    let rel = day_log(cfg, now.date());
    let path = paths::safe_join(root, &rel)?;
    let existing = match std::fs::read_to_string(&path) {
        Ok(s) => Some(s),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => None,
        Err(e) => return Err(e.into()),
    };
    // a new day: its template, or its date as properties (Bases, templates, the weather plugin find it) and a heading
    let made = existing.is_none();
    let text = existing.unwrap_or_else(|| crate::notes::daily_log_start(root, cfg, &date, now));
    // blocks closing the day's note (```view … ``` after `## Log`, as the activity block): the entry goes above them
    if let Some(at) = tail_blocks(&text) {
        let (head, tail) = text.split_at(at);
        let head = head.trim_end_matches('\n');
        let line = head.lines().count() as u32 + 1;
        let out = format!("{head}\n{entry}\n{}", tail.trim_start_matches('\n'));
        vault_write::write(&path, out.as_bytes())?;
        return Ok(CaptureResult { path: rel, line, source: Some(first_line(&entry)) });
    }
    let lines_before = text.lines().count();
    let prefix = match made {
        true => text,
        false if !text.is_empty() && !text.ends_with('\n') => "\n".into(),
        false => String::new(),
    };
    vault_write::append(&path, format!("{prefix}{entry}").as_bytes())?;
    Ok(CaptureResult { path: rel, line: lines_before as u32 + 1, source: Some(first_line(&entry)) })
}

fn first_line(entry: &str) -> String {
    entry.split('\n').next().unwrap_or_default().to_string()
}

/// The heading of a day's log section, in the date names Atlas writes.
const LOG_HEADING: &str = r"(?i)^##\s+(log|registro|bit[aá]cora)\s*$";

/// Whether `line` is that heading (captures.rs reads a log's captures under it).
pub fn is_log_heading(line: &str) -> bool {
    static RE: std::sync::LazyLock<regex::Regex> = std::sync::LazyLock::new(|| regex::Regex::new(LOG_HEADING).expect("valid"));
    RE.is_match(line)
}

/// Where a run of ```view blocks closing the note starts, when a `## Log` heading comes before it: a capture is written
/// above them, so the log stays the log's last section.
fn tail_blocks(text: &str) -> Option<usize> {
    let log = regex::Regex::new(&format!("(?m){LOG_HEADING}")).ok()?.find(text)?.end();
    let tail = regex::Regex::new(r"(?:\n```view\n(?:[^`]|`[^`]|``[^`])*?\n```[ \t]*\n?\s*)+\z").ok()?.find(&text[log..])?;
    Some(log + tail.start())
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::{Datelike, NaiveDate};

    fn at(h: u32, m: u32) -> NaiveDateTime {
        NaiveDate::from_ymd_opt(2026, 10, 5).unwrap().and_hms_opt(h, m, 7).unwrap()
    }

    #[test]
    fn a_capture_goes_above_the_blocks_that_close_the_log() {
        let d = tempfile::tempdir().unwrap();
        let rel = "notes/log/2026-10-05.md";
        std::fs::create_dir_all(d.path().join("notes/log")).unwrap();
        std::fs::write(d.path().join(rel), "# Day\n\n## Log\n- 08:00 first\n\n```view\ntype: activity\n```\n").unwrap();
        let r = capture_at(d.path(), &Config::default(), "second", at(9, 5)).unwrap();
        assert_eq!(r.line, 5);
        assert_eq!(std::fs::read_to_string(d.path().join(rel)).unwrap(), "# Day\n\n## Log\n- 08:00 first\n- 09:05 second\n\n```view\ntype: activity\n```\n");
    }

    #[test]
    fn todays_log_is_made_once_and_then_only_found() {
        let d = tempfile::tempdir().unwrap();
        let made = today_log(d.path(), &Config::default(), at(8, 0)).unwrap();
        assert_eq!((made.path.as_str(), made.created), ("notes/log/2026-10-05.md", true));
        let text = std::fs::read_to_string(d.path().join(&made.path)).unwrap();
        assert!(text.starts_with("---\ndate: 2026-10-05\ntype: log\n---\n# Monday"), "{text}");
        std::fs::write(d.path().join(&made.path), "mine\n").unwrap();
        assert!(!today_log(d.path(), &Config::default(), at(9, 0)).unwrap().created);
        assert_eq!(std::fs::read_to_string(d.path().join(&made.path)).unwrap(), "mine\n", "never rewritten");
    }

    #[test]
    fn new_file_gets_header_and_bullet() {
        let d = tempfile::tempdir().unwrap();
        let r = capture_at(d.path(), &Config::default(), "Idea about $\\Sigma(i\\omega_n)$", at(9, 5)).unwrap();
        assert_eq!(r.path, "notes/log/2026-10-05.md");
        assert_eq!(r.line, 7);
        let text = std::fs::read_to_string(d.path().join("notes/log/2026-10-05.md")).unwrap();
        assert_eq!(text, "---\ndate: 2026-10-05\ntype: log\n---\n# Monday, 5 October 2026\n\n- 09:05 Idea about $\\Sigma(i\\omega_n)$\n");
    }

    #[test]
    fn a_new_day_starts_from_the_log_template_and_in_the_vaults_date_names() {
        let d = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(d.path().join("templates")).unwrap();
        std::fs::write(d.path().join("templates/day.md"), "---\ntemplate_title: Day\ntype: log\ntopics:\n---\n## {{date:dddd}}\n").unwrap();
        let mut cfg = Config { log_template: "day".into(), ..Config::default() };
        let r = capture_at(d.path(), &cfg, "x", at(9, 5)).unwrap();
        let text = std::fs::read_to_string(d.path().join(&r.path)).unwrap();
        assert_eq!(text, "---\ntype: log\ntopics:\n---\n## Monday\n\n- 09:05 x\n");
        assert_eq!(r.line, 7);
        // a template that is not there: the built-in start, never a failed capture; Spanish names when the vault says so
        cfg.log_template = "gone".into();
        cfg.editor.date_names = crate::config::DateNames::Spanish;
        let r = capture_at(d.path(), &cfg, "y", at(9, 5).with_day(6).unwrap()).unwrap();
        let text = std::fs::read_to_string(d.path().join(&r.path)).unwrap();
        assert!(text.starts_with("---\ndate: 2026-10-06\ntype: log\n---\n# martes, 6 octubre 2026\n\n- 09:05 y"), "{text}");
    }

    #[test]
    fn a_day_is_filed_by_year_and_month_when_the_vault_says_so_in_its_date_names() {
        let mut cfg = Config::default();
        let day = NaiveDate::from_ymd_opt(2026, 10, 5).unwrap();
        assert_eq!(day_log(&cfg, day), "notes/log/2026-10-05.md", "no folders: as before");
        cfg.log_folders = "YYYY/MM-MMMM".into();
        assert_eq!(day_log(&cfg, day), "notes/log/2026/10-October/2026-10-05.md");
        cfg.editor.date_names = crate::config::DateNames::Spanish;
        assert_eq!(day_log(&cfg, day), "notes/log/2026/10-octubre/2026-10-05.md");
        let d = tempfile::tempdir().unwrap();
        let r = capture_at(d.path(), &cfg, "x", at(9, 5)).unwrap();
        assert_eq!(r.path, "notes/log/2026/10-octubre/2026-10-05.md", "capture writes there");
        assert!(d.path().join(&r.path).is_file());
    }

    #[test]
    fn appends_to_existing_and_fixes_missing_newline() {
        let d = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(d.path().join("notes/log")).unwrap();
        let p = d.path().join("notes/log/2026-10-05.md");
        std::fs::write(&p, "# 2026-10-05\n\nReorganized ~/Notes.").unwrap();
        let r = capture_at(d.path(), &Config::default(), "second", at(14, 30)).unwrap();
        assert_eq!(r.line, 4);
        assert_eq!(std::fs::read_to_string(&p).unwrap(), "# 2026-10-05\n\nReorganized ~/Notes.\n- 14:30 second\n");
        let r = capture_at(d.path(), &Config::default(), "third", at(14, 31)).unwrap();
        assert_eq!(r.line, 5);
    }

    #[test]
    fn every_box_is_told_what_the_text_becomes() {
        let thu = chrono::NaiveDate::from_ymd_opt(2026, 10, 15).unwrap();
        assert_eq!(due("[] call x @tomorrow", thu), chrono::NaiveDate::from_ymd_opt(2026, 10, 16));
        assert_eq!(due("[] call x 📅 2026-10-20", thu), chrono::NaiveDate::from_ymd_opt(2026, 10, 20));
        assert_eq!(due("plain words", thu), None);
        assert_eq!(say_day(chrono::NaiveDate::from_ymd_opt(2026, 10, 17).unwrap(), thu), "Saturday");
        let h = describe(None, "[] pay rent @fri", thu);
        assert_eq!((h.task, h.due.as_deref(), h.says.as_str()), (true, Some("2026-10-16"), "a to-do, due tomorrow"));
        assert_eq!(describe(None, "* [ ] x", thu).says, "a to-do", "every bullet the capture accepts");
        assert_eq!(describe(None, "lunch with Ana @mon", thu).says, "a line in today's log · mentions Monday");
        let t = tempfile::tempdir().unwrap();
        let mut cfg = Config::default();
        cfg.notes.capture = CaptureMode::Note;
        assert_eq!(describe(Some((t.path(), &cfg)), "an idea", thu).says, "a note in inbox", "the vault's own capture mode");
        assert_eq!(describe(Some((t.path(), &cfg)), "todo x", thu).says, "a to-do", "a task is a line even then");
        let d = days(thu);
        assert_eq!(d.len(), DAY_WORDS.len());
        assert_eq!((d[1].word.as_str(), d[1].date.as_str()), ("tomorrow", "2026-10-16"));
    }

    #[test]
    fn a_capture_written_as_a_task_is_a_task() {
        let now = at(9, 5); // 2026-06-01 is a Monday in `at`? the weekday is read from the date itself
        for typed in ["[] call Ana", "[ ] call Ana", "- [ ] call Ana", "todo call Ana", "TODO: call Ana", "t: call Ana"] {
            assert_eq!(format_entry(typed, now).unwrap(), "- [ ] 09:05 call Ana\n", "{typed}");
            let entry = format_entry(typed, now).unwrap();
            let line = crate::captures::parse_line(entry.trim_end()).unwrap();
            assert_eq!((line.time, line.text, line.state()), (Some("09:05"), "call Ana", crate::api::CaptureState::Task));
            assert!(crate::today::parse_task(entry.trim_end()).is_some(), "still a task everywhere tasks are read");
        }
        assert!(format_entry("todos are fine", now).unwrap().starts_with("- 09:05 todos are fine"));
        for typed in ["[] ", "[ ] x", "- [ ] x", "todo ", "TODO call", "Todo: x", "t: x"] {
            assert!(starts_as_task(typed), "{typed:?}");
        }
        for typed in ["todos are fine", "[]x", "today", "t:x"] {
            assert!(!starts_as_task(typed), "{typed:?}");
        }
        let d = now.date();
        let next = |n: i64| (d + chrono::Duration::days(n)).format("%Y-%m-%d").to_string();
        assert_eq!(format_entry("[] pay rent @tomorrow", now).unwrap(), format!("- [ ] 09:05 pay rent @{}\n", next(1)));
        assert_eq!(format_entry("[] pay rent @+3d now", now).unwrap(), format!("- [ ] 09:05 pay rent @{} now\n", next(3)));
        assert_eq!(format_entry("[] mail @ana", now).unwrap(), "- [ ] 09:05 mail @ana\n");
        assert_eq!(format_entry("lunch with Ana @tomorrow", now).unwrap(), format!("- 09:05 lunch with Ana @{}\n", next(1)), "a line's day too");
        assert_eq!(format_entry("ask @ana\n@tomorrow below", now).unwrap(), "- 09:05 ask @ana\n  @tomorrow below\n", "the first line only");
    }

    #[test]
    fn a_captured_picture_is_written_as_a_thumbnail() {
        let text = "Screen\n![[Screen 1.png]] ![[shot.JPG|300]] ![[log.txt]] ![[Note#Part]]";
        assert_eq!(sized_pictures(text, 160), "Screen\n![[Screen 1.png|160]] ![[shot.JPG|300]] ![[log.txt]] ![[Note#Part]]");
        assert_eq!(sized_pictures(text, 0), text);
        let d = tempfile::tempdir().unwrap();
        let cfg = Config::default();
        let r = capture_at(d.path(), &cfg, "Screen\n![[Screen 2026-10-21 093924.png]]", at(9, 39)).unwrap();
        let log = std::fs::read_to_string(d.path().join(&r.path)).unwrap();
        assert!(log.contains("- 09:39 Screen\n  ![[Screen 2026-10-21 093924.png|160]]\n"), "{log}");
    }

    #[test]
    fn multiline_is_indented() {
        let s = format_entry("first\r\nsecond line\n\n  third  \n", at(8, 0)).unwrap();
        assert_eq!(s, "- 08:00 first\n  second line\n\n    third\n");
    }

    #[test]
    fn a_shared_url_sent_twice_is_written_once() {
        let u = "http://link.aps.org/doi/10.1103/PhysRevB.91.085116";
        assert_eq!(format_entry(&format!("{u}\n{u}\n"), at(15, 48)).unwrap(), format!("- 15:48 {u}\n"));
        assert_eq!(format_entry("Title\nhttps://x.org\n https://x.org", at(9, 0)).unwrap(), "- 09:00 Title\n  https://x.org\n");
    }

    #[test]
    fn empty_is_rejected_and_log_dir_honored() {
        let d = tempfile::tempdir().unwrap();
        assert!(matches!(capture_at(d.path(), &Config::default(), " \n ", at(1, 0)), Err(Error::BadRequest(_))));
        let cfg = Config { log_dir: "journal/daily/".into(), ..Config::default() };
        let r = capture_at(d.path(), &cfg, "x", at(1, 0)).unwrap();
        assert_eq!(r.path, "journal/daily/2026-10-05.md");
        let bad = Config { log_dir: "../outside".into(), ..Config::default() };
        assert!(matches!(capture_at(d.path(), &bad, "x", at(1, 0)), Err(Error::BadPath(_))));
    }

    #[test]
    fn note_mode_makes_a_fleeting_note_per_capture() {
        let d = tempfile::tempdir().unwrap();
        let mut cfg = Config::default();
        cfg.notes.capture = CaptureMode::Note;
        let r = capture_at(d.path(), &cfg, "Bath fitting: try L-BFGS\nsecond line", at(9, 5)).unwrap();
        assert_eq!(r.path, "inbox/Bath fitting try L-BFGS.md");
        assert_eq!(
            std::fs::read_to_string(d.path().join(&r.path)).unwrap(),
            "---\ntype: fleeting\ncreated: 2026-10-05\n---\nBath fitting: try L-BFGS\nsecond line\n"
        );
        assert!(!d.path().join("log").exists(), "nothing goes to the log in note mode");
        assert!(matches!(capture_at(d.path(), &cfg, "  ", at(9, 5)), Err(Error::BadRequest(_))));
    }

    #[test]
    fn a_capture_with_no_atlas_serving_is_kept_for_the_hooks_once() {
        let d = tempfile::tempdir().unwrap();
        let cfg = Config::default();
        let r = capture_unserved(d.path(), &cfg, "https://letterboxd.com/film/the-realm-2018/").unwrap();
        let pending = take_pending(d.path());
        assert_eq!(pending, vec![crate::events::Captured { text: "https://letterboxd.com/film/the-realm-2018/".into(), path: r.path, line: r.line }]);
        assert!(take_pending(d.path()).is_empty(), "acted on once");
        // the phone's file, synced in beside this machine's (a Syncthing conflict copy is read too)
        let other = crate::events::Captured { text: "from the phone".into(), path: "log/x.md".into(), line: 3 };
        std::fs::create_dir_all(d.path().join(PENDING_DIR)).unwrap();
        std::fs::write(d.path().join(PENDING_DIR).join("phone.sync-conflict-1.jsonl"), format!("{}\n", serde_json::to_string(&other).unwrap())).unwrap();
        assert_eq!(take_pending(d.path()), vec![other]);
    }
}
