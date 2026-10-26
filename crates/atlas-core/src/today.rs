//! The Today home screen: focus, today's log, open tasks, and what moved since yesterday.
use crate::api::{Activity, Changed, Created, DayActivity, DocSlot, LineHit, Mtime, Today};
use crate::config::Config;
use crate::{paths, walk, Result};
use chrono::{DateTime, Local};
use std::path::Path;
use std::time::{Duration, SystemTime};

pub const MAX_TASKS: usize = 200;
pub const MAX_CHANGED: usize = 50;
pub const CHANGED_WINDOW: Duration = Duration::from_secs(36 * 3600);

pub fn today(root: &Path, cfg: &Config) -> Result<Today> {
    today_at(root, cfg, Local::now())
}

pub fn today_at(root: &Path, cfg: &Config, now: DateTime<Local>) -> Result<Today> {
    let date = now.format("%Y-%m-%d").to_string();
    let slot = |rel: String| -> Result<DocSlot> {
        let text = std::fs::read_to_string(paths::safe_join(root, &rel)?).ok();
        Ok(DocSlot { path: rel, text })
    };
    let files = found(root, cfg);
    Ok(Today {
        focus: slot(cfg.focus.clone())?,
        log: slot(crate::capture::day_log(cfg, now.date_naive()))?,
        date,
        tasks: open_tasks(&files, cfg),
        activity: Activity {
            commits: crate::git::log_since_yesterday(root),
            changed: changed_since(root, &files, cfg, now.into()),
            created: created_between(root, &files, cfg, start_of(now.date_naive() - chrono::Days::new(1)), start_of(now.date_naive() + chrono::Days::new(1))),
        },
    })
}

/// Text after an unchecked checkbox: `- [ ] x`, `* [ ] x`, `+ [ ] x`, any indentation.
pub fn parse_task(line: &str) -> Option<&str> {
    let rest = line.trim_start().strip_prefix(['-', '*', '+'])?;
    let rest = rest.strip_prefix(' ')?.trim_start().strip_prefix("[ ]")?;
    let text = rest.trim();
    (!text.is_empty() && (rest.starts_with(' ') || rest.starts_with('\t'))).then_some(text)
}

/// Ticks the open task on `line` (1-based) of `text`: `- [ ]` → `- [x]`. None when that line is not
/// an open task any more (edited meanwhile) — the caller reports it instead of guessing.
pub fn tick_task(text: &str, line: u32) -> Option<String> {
    tick_task_on(text, line, Local::now().date_naive())
}

/// [`tick_task`] on a given day. A line written with the Tasks plugin's fields is ticked the way
/// that plugin does it: `✅ <day>` is added, and a recurring one (`🔁 every week`) leaves its next
/// occurrence, still open, on the line above (crate::tasks::next_occurrence).
pub fn tick_task_on(text: &str, line: u32, day: chrono::NaiveDate) -> Option<String> {
    let mut lines: Vec<String> = text.split('\n').map(String::from).collect();
    let idx = line.checked_sub(1)? as usize;
    let ticked = tick_line(lines.get(idx)?, day)?;
    lines.splice(idx..=idx, ticked);
    Some(lines.join("\n"))
}

/// One open task line ticked on `day` → the lines that replace it: the next occurrence first when the
/// task recurs, then the ticked line (`✅ day` added when it uses the Tasks fields). None when the line
/// is not an open task. Shared by Home's tick and the note editor's checkbox (`POST /api/task/line`).
pub fn tick_line(l: &str, day: chrono::NaiveDate) -> Option<Vec<String>> {
    let i = l.find("[ ]").filter(|&i| {
        l[..i].trim_start().starts_with(['-', '*', '+'])
            || l[..i].trim_start().chars().next().is_some_and(|c| c.is_ascii_digit())
    })?;
    let mut ticked = format!("{}[x]{}", &l[..i], &l[i + 3..]);
    if crate::tasks::uses_fields(l) && !l.contains('✅') {
        ticked = format!("{} ✅ {}", ticked.trim_end(), day.format("%Y-%m-%d"));
    }
    Some(crate::tasks::next_occurrence(l, day).into_iter().chain([ticked]).collect())
}

/// A done task line opened again: `[x]` → `[ ]`, and its `✅ date` taken off, as the Tasks plugin
/// does. None when the line is not a done task.
pub fn untick_line(l: &str) -> Option<String> {
    let i = l.find("[x]").or_else(|| l.find("[X]")).filter(|&i| {
        l[..i].trim_start().starts_with(['-', '*', '+'])
            || l[..i].trim_start().chars().next().is_some_and(|c| c.is_ascii_digit())
    })?;
    let open = format!("{}[ ]{}", &l[..i], &l[i + 3..]);
    let done = regex::Regex::new(r"\s*✅\u{FE0F}?\s*\d{4}-\d{2}-\d{2}").expect("static regex");
    Some(done.replace(&open, "").into_owned())
}

/// Every task of the vault's notes, open and done (a task block that asks for done ones), in the
/// order of [`scan_tasks`]; at most [`MAX_ALL_TASKS`].
pub fn all_tasks(root: &Path, cfg: &Config) -> Vec<(LineHit, bool)> {
    task_hits(&found(root, cfg), cfg).take(MAX_ALL_TASKS).collect()
}
pub const MAX_ALL_TASKS: usize = 5000;

/// Text after a ticked checkbox (`- [x] …`).
pub fn done_task(line: &str) -> Option<&str> {
    let rest = line.trim_start().strip_prefix(['-', '*', '+'])?.strip_prefix(' ')?.trim_start();
    let rest = rest.strip_prefix("[x]").or_else(|| rest.strip_prefix("[X]"))?;
    let t = rest.trim();
    (!t.is_empty()).then_some(t)
}

/// A file containing this marker is not scanned for tasks.
pub const NO_TASKS_MARKER: &str = "<!-- atlas:no-tasks -->";

pub fn scan_tasks(root: &Path, cfg: &Config) -> Vec<LineHit> {
    open_tasks(&found(root, cfg), cfg)
}

fn open_tasks(files: &[Found], cfg: &Config) -> Vec<LineHit> {
    task_hits(files, cfg).filter(|(_, done)| !done).map(|(h, _)| h).take(MAX_TASKS).collect()
}

/// Every task line of the user's notes in walk order, (hit, done).
fn task_hits<'a>(files: &'a [Found], cfg: &'a Config) -> impl Iterator<Item = (LineHit, bool)> + 'a {
    files
        .iter()
        // generated transcripts quote other notes' `- [ ]` lines verbatim
        .filter(|f| f.rel.ends_with(".md") && !cfg.index_excluded(&f.rel))
        .flat_map(|f| {
            let lines = tasks_in(&f.abs, &f.meta);
            (0..lines.len()).map(move |i| {
                let (line, text, done) = &lines[i];
                (LineHit { path: f.rel.clone(), line: *line, text: text.clone() }, *done)
            })
        })
}

/// A note's task lines (line, text, done), read again only when it changed (its time, size or file — a save is a new
/// file renamed over it): Today asks after every save.
fn tasks_in(abs: &Path, meta: &std::fs::Metadata) -> std::sync::Arc<Vec<(u32, String, bool)>> {
    let stamp = (meta.modified().unwrap_or(std::time::UNIX_EPOCH), meta.len(), crate::platform::proc::file_id(meta));
    if let Some(t) = lock(&TASKS).get(abs, &stamp) {
        return t;
    }
    let mut out = Vec::new();
    // Generated checklists (e.g. a migration review) opt out so they don't flood Today.
    let text = std::fs::read_to_string(abs).unwrap_or_default();
    if !text.contains(NO_TASKS_MARKER) {
        let mut in_fence = false;
        for (i, line) in text.lines().enumerate() {
            // Checkboxes inside code fences are examples, not tasks.
            if line.trim_start().starts_with("```") {
                in_fence = !in_fence;
                continue;
            }
            let found = (!in_fence).then(|| parse_task(line).map(|t| (t, false)).or_else(|| done_task(line).map(|t| (t, true)))).flatten();
            if let Some((t, done)) = found {
                out.push((i as u32 + 1, t.to_string(), done));
            }
        }
    }
    let t = std::sync::Arc::new(out);
    lock(&TASKS).put(abs, stamp, meta.modified().ok(), t.clone());
    t
}

/// A vault file and its metadata, from one walk: a day's page asks several things of the same files.
struct Found {
    abs: std::path::PathBuf,
    rel: String,
    meta: std::fs::Metadata,
}

fn found(root: &Path, cfg: &Config) -> Vec<Found> {
    let files: Vec<Found> =
        walk::files(root, cfg).filter_map(|(abs, rel)| Some(Found { meta: abs.metadata().ok()?, abs, rel })).collect();
    let here: std::collections::HashSet<&Path> = files.iter().map(|f| f.abs.as_path()).collect();
    let now = std::time::Instant::now();
    lock(&TASKS).sweep(root, &here, now);
    lock(&FACTS).sweep(root, &here, now);
    files
}

/// Each note's task lines, by (time, size, inode): a save renames a new file over the old.
static TASKS: Cached<(SystemTime, u64, u64), TaskLines> = std::sync::LazyLock::new(Default::default);
/// (line, text, done) of each task of a note.
type TaskLines = std::sync::Arc<Vec<(u32, String, bool)>>;
/// Each file's facts, by time.
static FACTS: Cached<SystemTime, Facts> = std::sync::LazyLock::new(Default::default);
type Cached<S, V> = std::sync::LazyLock<std::sync::Mutex<PerFile<S, V>>>;

fn lock<T>(m: &std::sync::Mutex<T>) -> std::sync::MutexGuard<'_, T> {
    m.lock().unwrap_or_else(|e| e.into_inner())
}

/// A vault not walked for this long is forgotten whole (a vault opened once kept its entries all day).
const FORGET_AFTER: Duration = Duration::from_secs(30 * 60);
/// A file changed this recently is not remembered: a second same-size save within one tick of the file system's clock
/// (~15 ms on Windows, 2 s on FAT) would keep its stamp, and the cache would answer with the first save's contents.
const RACY: Duration = Duration::from_secs(2);

/// What is remembered of each file while its stamp holds. Each walk of a vault forgets the files it no longer finds
/// (deleted, renamed, newly ignored): before, an entry stayed for ever.
struct PerFile<S, V> {
    files: std::collections::HashMap<std::path::PathBuf, (S, V)>,
    walked: Vec<(std::path::PathBuf, std::time::Instant)>,
}

impl<S, V> Default for PerFile<S, V> {
    fn default() -> Self {
        Self { files: Default::default(), walked: Vec::new() }
    }
}

impl<S: PartialEq, V: Clone> PerFile<S, V> {
    fn get(&self, abs: &Path, stamp: &S) -> Option<V> {
        self.files.get(abs).filter(|(at, _)| at == stamp).map(|(_, v)| v.clone())
    }

    /// `modified`: the file's time, which [`RACY`] checks (none: not remembered).
    fn put(&mut self, abs: &Path, stamp: S, modified: Option<SystemTime>, v: V) {
        let settled = modified.and_then(|m| SystemTime::now().duration_since(m).ok()).is_some_and(|age| age >= RACY);
        if settled {
            self.files.insert(abs.to_path_buf(), (stamp, v));
        }
    }

    /// After a walk of `root` that found `here`: its other files, and every vault idle for [`FORGET_AFTER`], go.
    fn sweep(&mut self, root: &Path, here: &std::collections::HashSet<&Path>, now: std::time::Instant) {
        self.walked.retain(|(r, _)| r != root);
        let (idle, kept): (Vec<_>, Vec<_>) = self.walked.drain(..).partition(|(_, at)| now.saturating_duration_since(*at) >= FORGET_AFTER);
        self.walked = kept;
        self.walked.push((root.to_path_buf(), now));
        // (an entry dropped by mistake, e.g. under a vault nested in this one, is only read again)
        self.files.retain(|p, _| if p.starts_with(root) { here.contains(p.as_path()) } else { !idle.iter().any(|(r, _)| p.starts_with(r)) });
        self.files.shrink_to(self.files.len() * 2);
    }
}


/// Each thing once, under the path that stands for it (a file and its companion note are one: companion::stands_for);
/// `items` newest first, so the newest of a thing's files gives its time.
fn per_thing<T>(root: &Path, items: &mut Vec<T>, path: impl Fn(&mut T) -> &mut String) {
    let mut seen = std::collections::HashSet::new();
    items.retain_mut(|it| {
        let p = path(it);
        *p = crate::companion::stands_for(root, p);
        seen.insert(p.clone())
    });
}

fn changed_since(root: &Path, files: &[Found], cfg: &Config, now: SystemTime) -> Vec<Changed> {
    let since = now - CHANGED_WINDOW;
    let mut out: Vec<Changed> = files
        .iter()
        .filter(|f| !cfg.is_agent_file(&f.rel)) // the agent's files are not the user's activity
        .filter_map(|f| (f.meta.modified().ok()? >= since).then(|| Some(Changed { path: f.rel.clone(), mtime: Mtime::of(&f.meta).ok()? }))?)
        .collect();
    out.sort_by(|a, b| b.mtime.cmp(&a.mtime).then_with(|| a.path.cmp(&b.path)));
    per_thing(root, &mut out, |c| &mut c.path);
    out.truncate(MAX_CHANGED);
    out
}

/// Files made since yesterday began, newest first (Today's Activity).
pub fn recently_created(root: &Path, cfg: &Config, now: DateTime<Local>) -> Vec<Created> {
    let yesterday = now.date_naive() - chrono::Days::new(1);
    created_between(root, &found(root, cfg), cfg, start_of(yesterday), start_of(now.date_naive() + chrono::Days::new(1)))
}

/// What was made on `day`, and what else changed that day (`GET /api/activity`; a day's log shows its own).
pub fn day_activity(root: &Path, cfg: &Config, day: chrono::NaiveDate) -> DayActivity {
    let (start, end) = (start_of(day), start_of(day + chrono::Days::new(1)));
    let files = found(root, cfg);
    let created = created_between(root, &files, cfg, start, end);
    let made: std::collections::HashSet<&str> = created.iter().map(|c| c.path.as_str()).collect();
    let (from, to): (SystemTime, SystemTime) = (start.into(), end.into());
    let mut changed: Vec<Changed> = files
        .iter()
        .filter(|f| !cfg.index_excluded(&f.rel))
        .filter_map(|f| {
            let m = f.meta.modified().ok()?;
            (m >= from && m < to && !facts(&f.abs, &f.meta).mail).then(|| Some(Changed { path: f.rel.clone(), mtime: Mtime::of(&f.meta).ok()? }))?
        })
        .collect();
    changed.sort_by(|a, b| b.mtime.cmp(&a.mtime).then_with(|| a.path.cmp(&b.path)));
    per_thing(root, &mut changed, |c| &mut c.path);
    changed.retain(|c| !made.contains(c.path.as_str())); // a thing made that day is listed as made
    changed.truncate(MAX_CHANGED);
    DayActivity { day: day.format("%Y-%m-%d").to_string(), created, changed }
}

fn start_of(day: chrono::NaiveDate) -> DateTime<Local> {
    day.and_hms_opt(0, 0, 0).and_then(|d| d.and_local_timezone(Local).earliest()).unwrap_or_else(Local::now)
}

fn ms(t: SystemTime) -> u64 {
    t.duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0)
}

/// Files made in `[start, end)`, newest first. When a file was made: the day its own `created:` / `date:` property says,
/// else its first commit, else (new, not in git) its birth on disk — never the birth alone for a file git knows, since
/// every save that rewrites a file (editors, Syncthing, git) gives it a new one. Mail is left out: it has its own
/// list, and a sync makes dozens.
fn created_between(root: &Path, files: &[Found], cfg: &Config, start: DateTime<Local>, end: DateTime<Local>) -> Vec<Created> {
    let (from, to): (SystemTime, SystemTime) = (start.into(), end.into());
    let (first, last) = (start.date_naive(), end.date_naive());
    let mut git: Option<Option<crate::git::Births>> = None;
    let mut out: Vec<Created> = files
        .iter()
        .filter(|f| !cfg.index_excluded(&f.rel)) // the agent's files and the note templates are not the user's work
        .filter_map(|Found { abs, rel, meta }| {
            let rel = rel.clone();
            let f = facts(abs, meta);
            if f.mail {
                return None;
            }
            if let Some((day, at)) = f.made {
                return (day >= first && day < last).then(|| Created { path: rel, created: at.unwrap_or_else(|| ms(start_of(day).into())) });
            }
            let births = git.get_or_insert_with(|| crate::git::births(root, start.timestamp(), end.timestamp())).as_ref();
            match births {
                Some(b) if b.tracked.contains(&rel) => b.added.get(&rel).map(|&t| Created { path: rel, created: t as u64 * 1000 }),
                _ => {
                    let born = meta.created().ok()?;
                    (born >= from && born < to).then(|| Created { path: rel, created: ms(born) })
                }
            }
        })
        .collect();
    out.sort_by(|a, b| b.created.cmp(&a.created).then_with(|| a.path.cmp(&b.path)));
    per_thing(root, &mut out, |c| &mut c.path);
    out.truncate(MAX_CHANGED);
    out
}

/// What a file says of itself, read once per change (a vault's every note is asked for each day shown).
#[derive(Clone, Copy)]
struct Facts {
    /// The day its `created:` / `date:` property gives, and the time with it (ms) when it has one.
    made: Option<(chrono::NaiveDate, Option<u64>)>,
    mail: bool,
}

fn facts(abs: &Path, meta: &std::fs::Metadata) -> Facts {
    let stamp = meta.modified().unwrap_or(std::time::UNIX_EPOCH);
    if let Some(f) = lock(&FACTS).get(abs, &stamp) {
        return f;
    }
    let f = Facts { made: made_on(abs), mail: is_mail(abs) };
    lock(&FACTS).put(abs, stamp, meta.modified().ok(), f);
    f
}

/// A note's properties (its first 4 KB: they come first, and a big note is not read whole).
fn front_of(note: &Path) -> Option<String> {
    use std::io::Read;
    if note.extension()? != "md" {
        return None;
    }
    let mut head = vec![0u8; 4096];
    let n = std::fs::File::open(note).ok()?.read(&mut head).ok()?;
    let text = String::from_utf8_lossy(&head[..n]).into_owned();
    Some(text.strip_prefix("---\n")?.split_once("\n---")?.0.to_string())
}

fn property<'a>(front: &'a str, key: &str) -> Option<&'a str> {
    front.lines().find_map(|l| l.split_once(':').filter(|(k, _)| k.trim() == key).map(|(_, v)| v.trim().trim_matches(['"', '\''])))
}

/// The day a note says it was made: its `created:` or `date:` property (`2026-10-14`, `2026-10-14 12:17`).
fn made_on(abs: &Path) -> Option<(chrono::NaiveDate, Option<u64>)> {
    let front = front_of(abs)?;
    ["created", "date"].iter().find_map(|key| {
        let v = property(&front, key)?;
        let day = chrono::NaiveDate::parse_from_str(v.get(..10)?, "%Y-%m-%d").ok()?;
        let at = v.get(11..16).and_then(|t| chrono::NaiveTime::parse_from_str(t, "%H:%M").ok())
            .and_then(|t| day.and_time(t).and_local_timezone(Local).earliest()).map(|d| d.timestamp_millis() as u64);
        Some((day, at))
    })
}

/// A mail note (its `type` an `email…` one — a message, a thread — or a `message_id:` property) or a file in a mail
/// note's attachments folder (`<note> files/`).
fn is_mail(abs: &Path) -> bool {
    let mail_note = |note: &Path| front_of(note).is_some_and(|f| property(&f, "type").is_some_and(|t| t.starts_with("email")) || property(&f, "message_id").is_some());
    if mail_note(abs) {
        return true;
    }
    abs.ancestors().skip(1).take(4).any(|dir| {
        let name = dir.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
        name.strip_suffix(" files").is_some_and(|stem| mail_note(&dir.with_file_name(format!("{stem}.md"))))
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn remembered_files_are_forgotten_once_gone_or_idle() {
        let mut c: PerFile<u32, u32> = PerFile::default();
        let (a, b) = (Path::new("/v/a.md"), Path::new("/v/b.md"));
        c.put(a, 1, Some(SystemTime::UNIX_EPOCH), 10);
        c.put(b, 1, Some(SystemTime::UNIX_EPOCH), 20);
        c.put(Path::new("/w/c.md"), 1, Some(SystemTime::UNIX_EPOCH), 30);
        assert_eq!((c.get(a, &1), c.get(a, &2)), (Some(10), None), "a new stamp is a miss");
        let t0 = std::time::Instant::now();
        c.sweep(Path::new("/w"), &[Path::new("/w/c.md")].into(), t0);
        c.sweep(Path::new("/v"), &[a].into(), t0);
        assert_eq!((c.get(a, &1), c.get(b, &1)), (Some(10), None), "a file the walk no longer finds is forgotten");
        assert_eq!(c.get(Path::new("/w/c.md"), &1), Some(30), "another vault's files stay while it is in use");
        c.sweep(Path::new("/v"), &[a].into(), t0 + FORGET_AFTER);
        assert_eq!(c.get(Path::new("/w/c.md"), &1), None, "an idle vault is forgotten whole");
    }

    #[test]
    fn what_was_made_since_yesterday_is_listed_without_the_mail() {
        let d = tempfile::tempdir().unwrap();
        let r = d.path();
        std::fs::create_dir_all(r.join("mail/Inbox/2026-10-19 Hello files")).unwrap();
        std::fs::write(r.join("mail/Inbox/2026-10-19 Hello.md"), "---\ntype: email\nsubject: Hello\n---\n# Hello\n").unwrap();
        std::fs::write(r.join("mail/Inbox/2026-10-19 Hello files/slides.pdf"), "%PDF").unwrap();
        std::fs::create_dir_all(r.join("notes")).unwrap();
        std::fs::write(r.join("mail/Inbox/2026-10-19 A thread.md"), "---\ntype: email-thread\nmessages: 3\n---\n").unwrap();
        std::fs::write(r.join("notes/idea.md"), "---\ntype: note\n---\n# An idea\n").unwrap();
        // rewritten today (a new birth on disk), but its properties say when it was made
        std::fs::write(r.join("notes/RUN-DCA-fix.md"), "---\ncreated: 2026-10-14\n---\n# Fix\n").unwrap();
        let made: Vec<String> = recently_created(r, &Config::default(), Local::now()).into_iter().map(|c| c.path).collect();
        assert_eq!(made, ["notes/idea.md"]);
        let tomorrow_after = Local::now() + chrono::Duration::days(3);
        assert!(recently_created(r, &Config::default(), tomorrow_after).is_empty(), "made more than a day before: not listed");
    }

    #[test]
    fn a_file_git_had_before_yesterday_is_not_new_though_a_save_rewrote_it_today() {
        let d = tempfile::tempdir().unwrap();
        let r = d.path();
        let git = |args: &[&str]| {
            let ok = std::process::Command::new("git").arg("-C").arg(r).args(args)
                .env("GIT_AUTHOR_DATE", "2026-01-02T10:00:00").env("GIT_COMMITTER_DATE", "2026-01-02T10:00:00")
                .env("GIT_AUTHOR_NAME", "t").env("GIT_AUTHOR_EMAIL", "t@x").env("GIT_COMMITTER_NAME", "t").env("GIT_COMMITTER_EMAIL", "t@x")
                .output().unwrap().status.success();
            assert!(ok, "git {args:?}");
        };
        git(&["init", "-q"]);
        std::fs::write(r.join("old.md"), "# Old\n").unwrap();
        git(&["add", "old.md"]);
        git(&["commit", "-q", "-m", "old"]);
        // a save that writes a new file over it: a new birth on disk
        std::fs::write(r.join("old.md.tmp"), "# Old, edited\n").unwrap();
        std::fs::rename(r.join("old.md.tmp"), r.join("old.md")).unwrap();
        std::fs::write(r.join("new.md"), "# New\n").unwrap();
        let made: Vec<String> = recently_created(r, &Config::default(), Local::now()).into_iter().map(|c| c.path).collect();
        assert_eq!(made, ["new.md"]);
    }

    #[test]
    fn a_day_shows_what_its_notes_say_was_made_then_and_what_else_changed() {
        let d = tempfile::tempdir().unwrap();
        let r = d.path();
        std::fs::create_dir_all(r.join("notes")).unwrap();
        std::fs::write(r.join("notes/old idea.md"), "---\ncreated: 2026-10-14 12:17\n---\n# Old\n").unwrap();
        std::fs::write(r.join("notes/other.md"), "---\ndate: 2026-10-15\n---\n").unwrap();
        let day = chrono::NaiveDate::from_ymd_opt(2026, 10, 14).unwrap();
        let a = day_activity(r, &Config::default(), day);
        assert_eq!(a.created.iter().map(|c| c.path.as_str()).collect::<Vec<_>>(), ["notes/old idea.md"]);
        assert_eq!(a.day, "2026-10-14");
        assert!(a.changed.is_empty(), "nothing was saved on that day");
        let today = day_activity(r, &Config::default(), Local::now().date_naive());
        assert!(today.created.is_empty(), "its property says the 14th, not the day it was written");
        assert_eq!(today.changed.len(), 2, "both written today");
    }

    #[test]
    fn task_syntax() {
        assert_eq!(parse_task("- [ ] read Georges RMP"), Some("read Georges RMP"));
        assert_eq!(parse_task("    * [ ]  nested"), Some("nested"));
        assert_eq!(parse_task("- [x] done"), None);
        assert_eq!(parse_task("- [ ]"), None);
        assert_eq!(parse_task("-[ ] no space"), None);
        assert_eq!(parse_task("- [ ]x"), None);
        assert_eq!(parse_task("text - [ ] mid-line"), None);
    }

    #[test]
    fn tasks_scan_honors_ignore_dotdirs_and_fences() {
        let d = tempfile::tempdir().unwrap();
        let r = d.path();
        for dir in ["notes", "runs/x", "refs/zotero", ".hidden", "projects/a/node_modules"] {
            std::fs::create_dir_all(r.join(dir)).unwrap();
        }
        std::fs::write(r.join("notes/a.md"), "# A\n- [ ] real task\n```\n- [ ] in fence\n```\n- [x] done\n").unwrap();
        std::fs::write(r.join("runs/x/r.md"), "- [ ] ignored by name\n").unwrap();
        std::fs::write(r.join("refs/zotero/z.md"), "- [ ] ignored by nested path\n").unwrap();
        std::fs::write(r.join(".hidden/h.md"), "- [ ] hidden\n").unwrap();
        std::fs::write(r.join("projects/a/node_modules/m.md"), "- [ ] deep ignored\n").unwrap();
        std::fs::write(r.join("notes/b.txt"), "- [ ] not markdown\n").unwrap();
        std::fs::write(r.join("notes/review.md"), "<!-- atlas:no-tasks -->\n- [ ] generated checklist\n").unwrap();
        std::fs::create_dir_all(r.join("docs/sessions")).unwrap();
        std::fs::write(r.join("docs/sessions/transcript.md"), "quoted: \n- [ ] check the sign of t\n").unwrap();
        let mut cfg =
            Config { ignore: vec!["runs".into(), "refs/zotero".into(), "node_modules".into()], ..Config::default() };
        cfg.editor.index_exclude = vec!["docs/sessions".into()];
        let tasks = scan_tasks(r, &cfg);
        assert_eq!(tasks, vec![LineHit { path: "notes/a.md".into(), line: 2, text: "real task".into() }]);
    }

    #[test]
    fn tick_task_only_ticks_an_open_task() {
        assert_eq!(tick_task("a\n- [ ] do it\n", 2).as_deref(), Some("a\n- [x] do it\n"));
        assert_eq!(tick_task("  1. [ ] n\n", 1).as_deref(), Some("  1. [x] n\n"));
        assert_eq!(tick_task("- [x] done\n", 1), None);
        assert_eq!(tick_task("text [ ] not a task\n", 1), None);
        assert_eq!(tick_task("x\n", 9), None);
    }

    #[test]
    fn a_line_ticked_and_opened_again_loses_its_done_date() {
        let day = chrono::NaiveDate::from_ymd_opt(2026, 10, 15).unwrap();
        assert_eq!(tick_line("  - [ ] pay 📅 2026-10-20", day), Some(vec!["  - [x] pay 📅 2026-10-20 ✅ 2026-10-15".to_string()]));
        assert_eq!(tick_line("- [x] done", day), None);
        assert_eq!(untick_line("  - [x] pay 📅 2026-10-20 ✅ 2026-10-15").as_deref(), Some("  - [ ] pay 📅 2026-10-20"));
        assert_eq!(untick_line("1. [X] plain").as_deref(), Some("1. [ ] plain"));
        assert_eq!(untick_line("- [ ] open"), None);
        assert_eq!(untick_line("text [x] not a task"), None);
    }

    #[test]
    fn ticking_a_task_written_with_fields_dates_it_and_a_recurring_one_leaves_its_next() {
        let day = chrono::NaiveDate::from_ymd_opt(2026, 10, 14).unwrap();
        assert_eq!(tick_task_on("- [ ] plain\n", 1, day).as_deref(), Some("- [x] plain\n"), "a plain task is only ticked");
        assert_eq!(tick_task_on("- [ ] pay 📅 2026-10-15\n", 1, day).as_deref(), Some("- [x] pay 📅 2026-10-15 ✅ 2026-10-14\n"));
        assert_eq!(
            tick_task_on("# Chores\n- [ ] water 🔁 every week 📅 2026-10-12\nend\n", 2, day).as_deref(),
            Some("# Chores\n- [ ] water 🔁 every week 📅 2026-10-19\n- [x] water 🔁 every week 📅 2026-10-12 ✅ 2026-10-14\nend\n")
        );
    }

    /// Every checkbox of the vault, open and done.
    #[test]
    fn all_tasks_lists_done_ones_too() {
        let d = tempfile::tempdir().unwrap();
        std::fs::write(d.path().join("a.md"), "- [ ] open\n- [x] done\n```\n- [ ] in code\n```\n").unwrap();
        let got: Vec<_> = all_tasks(d.path(), &Config::default()).into_iter().map(|(h, done)| (h.text, done)).collect();
        assert_eq!(got, [("open".to_string(), false), ("done".to_string(), true)]);
    }

    #[test]
    fn a_note_saved_again_is_read_again() {
        let d = tempfile::tempdir().unwrap();
        let f = d.path().join("a.md");
        std::fs::write(&f, "- [ ] one\n").unwrap();
        assert_eq!(scan_tasks(d.path(), &Config::default()).len(), 1);
        std::fs::write(&f, "- [ ] one\n- [ ] two\n").unwrap(); // within the same clock tick: the size differs
        assert_eq!(scan_tasks(d.path(), &Config::default()).len(), 2);
        std::fs::write(&f, "- [x] one\n- [ ] two\n").unwrap(); // same size, perhaps the same tick: never cached yet
        assert_eq!(scan_tasks(d.path(), &Config::default()).iter().map(|h| h.text.as_str()).collect::<Vec<_>>(), ["two"]);
    }

    /// A settled file is remembered; a same-size rewrite carrying the very same time is the case [`RACY`] guards.
    #[test]
    fn a_settled_note_is_remembered_and_a_fresh_one_is_not() {
        let d = tempfile::tempdir().unwrap();
        let f = d.path().join("a.md");
        std::fs::write(&f, "- [ ] one\n").unwrap();
        let old = SystemTime::now() - Duration::from_secs(60);
        std::fs::File::options().write(true).open(&f).unwrap().set_modified(old).unwrap();
        tasks_in(&f, &f.metadata().unwrap());
        assert!(lock(&TASKS).get(&f, &stamp_of(&f)).is_some(), "a settled note is cached");
        let g = d.path().join("b.md");
        std::fs::write(&g, "- [ ] two\n").unwrap();
        tasks_in(&g, &g.metadata().unwrap());
        assert!(lock(&TASKS).get(&g, &stamp_of(&g)).is_none(), "a note saved just now is read again next time");
    }

    fn stamp_of(f: &Path) -> (SystemTime, u64, u64) {
        let m = f.metadata().unwrap();
        (m.modified().unwrap(), m.len(), crate::platform::proc::file_id(&m))
    }

    #[test]
    fn task_cap() {
        let d = tempfile::tempdir().unwrap();
        let body: String = (0..250).map(|i| format!("- [ ] t{i}\n")).collect();
        std::fs::write(d.path().join("many.md"), body).unwrap();
        assert_eq!(scan_tasks(d.path(), &Config::default()).len(), MAX_TASKS);
    }

    #[test]
    fn today_slots_and_changes() {
        let d = tempfile::tempdir().unwrap();
        std::fs::write(d.path().join("FOCUS.md"), "# Focus\n").unwrap();
        let t = today(d.path(), &Config::default()).unwrap();
        assert_eq!(t.focus.text.as_deref(), Some("# Focus\n"));
        assert!(t.log.text.is_none());
        assert_eq!(t.log.path, format!("notes/log/{}.md", t.date));
        assert!(t.activity.commits.is_empty());
        assert_eq!(t.activity.changed.len(), 1);
        assert_eq!(t.activity.changed[0].path, "FOCUS.md");
    }
}
