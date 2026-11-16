//! What a task line says beyond its text, and the questions a task block can ask of a list of tasks.
//! The syntax read is the one of Obsidian's Tasks plugin (emoji fields), by shape — so the user's
//! existing notes work — but the block's options are Atlas's own small set (docs/guides/TASKS.md), not a
//! port of that plugin's query language.
//!
//! `- [ ] Submit the abstract ⏫ 🔁 every week 🛫 2026-10-10 📅 2026-10-17 #work`
use chrono::{Datelike, Duration, NaiveDate};
use serde::Deserialize;
use std::collections::BTreeMap;

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub enum Priority {
    Lowest,
    Low,
    /// A task that says nothing.
    Normal,
    Medium,
    High,
    Highest,
}

impl Priority {
    pub fn name(self) -> &'static str {
        match self {
            Self::Lowest => "lowest",
            Self::Low => "low",
            Self::Normal => "normal",
            Self::Medium => "medium",
            Self::High => "high",
            Self::Highest => "highest",
        }
    }

    pub fn from_name(s: &str) -> Option<Self> {
        [Self::Lowest, Self::Low, Self::Normal, Self::Medium, Self::High, Self::Highest].into_iter().find(|p| p.name() == s.trim().to_ascii_lowercase())
    }

    /// The marker [`render`] writes it with (the Tasks plugin's first one); none for a task that says nothing.
    fn mark(self) -> Option<&'static str> {
        MARKERS.iter().find(|(_, f)| *f == Field::Priority(self)).map(|(m, _)| *m)
    }
}

/// The emoji that start a field, and what they start.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Field {
    Due,
    Scheduled,
    Start,
    Created,
    Completed,
    Recurrence,
    Priority(Priority),
}

/// The Tasks plugin's markers, its alternatives too (`📆` / `🗓` due, `⌛` scheduled); a marker may carry the emoji
/// variation selector (U+FE0F), read as blank by [`blank`].
const MARKERS: [(&str, Field); 14] = [
    ("📅", Field::Due),
    ("📆", Field::Due),
    ("🗓", Field::Due),
    ("⏳", Field::Scheduled),
    ("⌛", Field::Scheduled),
    ("🛫", Field::Start),
    ("➕", Field::Created),
    ("✅", Field::Completed),
    ("🔁", Field::Recurrence),
    ("🔺", Field::Priority(Priority::Highest)),
    ("⏫", Field::Priority(Priority::High)),
    ("🔼", Field::Priority(Priority::Medium)),
    ("🔽", Field::Priority(Priority::Low)),
    ("⏬", Field::Priority(Priority::Lowest)),
];

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Task {
    /// The text without its fields (tags stay: they are part of how a task reads).
    pub title: String,
    pub due: Option<NaiveDate>,
    pub scheduled: Option<NaiveDate>,
    pub start: Option<NaiveDate>,
    pub created: Option<NaiveDate>,
    pub completed: Option<NaiveDate>,
    pub priority: Priority,
    /// As written: `every week`, `every 2 months when done`.
    pub recurrence: Option<String>,
    pub tags: Vec<String>,
    /// An Obsidian block id ending the line (`^t3f9a` → `t3f9a`): how a link (`[[note#^t3f9a]]`) or a nudge reaches
    /// the task wherever its line moves. Not part of the title.
    pub block: Option<String>,
}

/// The first `YYYY-MM-DD` of `s` that is a real day and not inside a word, and where it starts.
pub(crate) fn first_date(s: &str) -> Option<(NaiveDate, usize)> {
    let b = s.as_bytes();
    (0..b.len().saturating_sub(9)).find_map(|i| {
        // exactly `YYYY-MM-DD` (the date parser alone would also take a leading space and one-digit days)
        let shape = (0..10).all(|k| if k == 4 || k == 7 { b[i + k] == b'-' } else { b[i + k].is_ascii_digit() });
        if !shape || (i > 0 && b[i - 1].is_ascii_alphanumeric()) {
            return None;
        }
        NaiveDate::parse_from_str(&s[i..i + 10], "%Y-%m-%d").ok().map(|date| (date, i))
    })
}

/// Reads a task's text (what follows the checkbox).
pub fn parse(text: &str) -> Task {
    // the block id is the line's last word (Obsidian's rule), read before any field so a rule (`🔁 every week ^t1`)
    // never takes it in
    let (text, block) = split_block(text);
    // a captured task's time (`- [ ] 09:05 …`, capture.rs) says when it was written, not what it is
    let text = crate::captures::stamp(text).map_or(text, |(_, rest)| rest);
    // cut the text at every marker: the piece after a marker is that field's value
    let mut cuts: Vec<(usize, usize, Field)> = Vec::new();
    for (m, f) in MARKERS {
        let mut from = 0;
        while let Some(i) = text[from..].find(m) {
            let at = from + i;
            if !cuts.iter().any(|(a, len, _)| at >= *a && at < a + len) {
                cuts.push((at, m.len(), f));
            }
            from = at + m.len();
        }
    }
    cuts.sort_by_key(|c| c.0);
    let mut t = Task { title: String::new(), due: None, scheduled: None, start: None, created: None, completed: None, priority: Priority::Normal, recurrence: None, tags: Vec::new(), block: block.map(str::to_string) };
    let mut title = text[..cuts.first().map_or(text.len(), |c| c.0)].to_string();
    for (k, (at, len, field)) in cuts.iter().enumerate() {
        // a marker's variation selector (`⏫\u{FE0F}`) is the marker's, not the value's or the title's
        let value = text[at + len..cuts.get(k + 1).map_or(text.len(), |c| c.0)].trim_start_matches('\u{FE0F}');
        // what follows the field's own value is text again (`📅 2026-10-17 before lunch`)
        let mut rest = value;
        match field {
            Field::Priority(p) => t.priority = *p,
            Field::Recurrence => {
                // the rule runs to the first tag or the end
                let end = value.find(" #").unwrap_or(value.len());
                t.recurrence = Some(value[..end].trim().to_string()).filter(|r| !r.is_empty());
                rest = &value[end..];
            }
            _ => {
                if let Some((date, i)) = first_date(value).filter(|(_, i)| blank(&value[..*i])) {
                    match field {
                        Field::Due => t.due = Some(date),
                        Field::Scheduled => t.scheduled = Some(date),
                        Field::Start => t.start = Some(date),
                        Field::Created => t.created = Some(date),
                        Field::Completed => t.completed = Some(date),
                        _ => {}
                    }
                    rest = &value[i + 10..];
                }
            }
        }
        title.push(' ');
        title.push_str(rest);
    }
    // a date written without an emoji (`due:: 2026-10-12`, `@2026-10-12`, plain) is the due date
    if t.due.is_none() {
        if let Some((date, i)) = first_date(&title) {
            t.due = Some(date);
            title = format!("{}{}", &title[..i], &title[i + 10..]);
            for marker in ["[due::]", "due::", "@"] {
                title = title.replace(marker, " ");
            }
        }
    }
    // a tag as the tag index reads one (tags.rs): `#1984` is a number, `#a.b` is the tag `a`
    t.tags = title.split_whitespace().filter_map(|w| crate::tags::tag_at(w.strip_prefix('#')?)).map(str::to_string).collect();
    t.title = title.split_whitespace().collect::<Vec<_>>().join(" ");
    t
}

impl Task {
    /// The date a calendar places it on: when it is due, else scheduled, else when it may start.
    pub fn date(&self) -> Option<NaiveDate> {
        self.due.or(self.scheduled).or(self.start)
    }

    /// The fields as text, for a view's row.
    pub fn props(&self) -> BTreeMap<String, String> {
        let mut p = BTreeMap::new();
        let day = |d: NaiveDate| d.format("%Y-%m-%d").to_string();
        for (k, v) in [("due", self.due), ("scheduled", self.scheduled), ("start", self.start), ("created", self.created), ("completed", self.completed)] {
            if let Some(d) = v {
                p.insert(k.to_string(), day(d));
            }
        }
        if self.priority != Priority::Normal {
            p.insert("priority".into(), self.priority.name().into());
        }
        if let Some(r) = &self.recurrence {
            p.insert("recurrence".into(), r.clone());
        }
        if !self.tags.is_empty() {
            p.insert("tags".into(), self.tags.join(" "));
        }
        p
    }
}

// --- recurrence ---------------------------------------------------------------------------------------

/// `every week`, `every 3 days`, `every month` (the day kept by the date itself), `every month on the 31st` / `on the
/// last` (that day, or the month's last when it has none), `every week on Monday, Thursday` (every N weeks counted
/// from the task's week, weeks from Monday), `every weekday`, each optionally ending in `when done`. None: a rule
/// Atlas does not read (`every month on the 2nd Tuesday`) — the task is then ticked like any other and nothing new is
/// made, rather than made wrongly.
pub(crate) fn step(rule: &str, from: NaiveDate) -> Option<NaiveDate> {
    let r = rule.to_ascii_lowercase();
    let r = r.trim().strip_prefix("every")?.trim().trim_end_matches("when done").trim();
    let (n, unit) = match r.split_once(' ') {
        Some((n, rest)) if n.parse::<u32>().is_ok() => (n.parse::<u32>().ok()?, rest.trim()),
        _ => (1, r),
    };
    let words: Vec<&str> = unit.split(|c: char| c.is_whitespace() || c == ',').filter(|w| !w.is_empty()).collect();
    let (unit, tail) = words.split_first()?;
    let unit = unit.trim_end_matches('s');
    if n == 0 {
        return None;
    }
    // `on the 31st` / `on the last`: the day every month lands on, so a 31st kept as February's 28th comes back to the
    // 31st in March instead of drifting to the 28th for good; any other tail is a rule not read
    let mut on_day = None;
    let mut on_weekdays: Vec<chrono::Weekday> = Vec::new();
    match (unit, tail) {
        (_, []) => {}
        ("month", ["on", "the", d]) => {
            on_day = Some(match *d {
                "last" => 31,
                d => {
                    let (num, suffix) = d.split_at(d.find(|c: char| !c.is_ascii_digit()).unwrap_or(d.len()));
                    let num: u32 = num.parse().ok().filter(|x| (1..=31).contains(x))?;
                    let want = match num % 100 {
                        11..=13 => "th",
                        _ => ["th", "st", "nd", "rd", "th", "th", "th", "th", "th", "th"][(num % 10) as usize],
                    };
                    (suffix.is_empty() || suffix == want).then_some(num)?
                }
            })
        }
        ("week", ["on", days @ ..]) => {
            for w in days.iter().filter(|w| **w != "and") {
                on_weekdays.push(w.trim_end_matches('s').parse::<chrono::Weekday>().ok()?);
            }
            if on_weekdays.is_empty() {
                return None;
            }
        }
        _ => return None,
    }
    // a huge count (`every 4000000000 days`) is a rule Atlas does not read, not an overflow
    let months = |m: u32| -> Option<NaiveDate> {
        let total = (from.year() * 12 + from.month0() as i32).checked_add(i32::try_from(m).ok()?)?;
        let (y, mo) = (total.div_euclid(12), total.rem_euclid(12) as u32 + 1);
        // the 31st of a month without one is that month's last day
        let day = on_day.unwrap_or(from.day());
        (0..4).find_map(|back| NaiveDate::from_ymd_opt(y, mo, day.saturating_sub(back)))
    };
    match unit {
        "day" => from.checked_add_signed(Duration::days(i64::from(n))),
        "week" if !on_weekdays.is_empty() => {
            // the next of those days in this week or every Nth one after it (as RRULE's WEEKLY;INTERVAL;BYDAY)
            let monday = |d: NaiveDate| d - Duration::days(i64::from(d.weekday().num_days_from_monday()));
            let n = i64::from(n);
            (1..=7 * (n.min(520) + 1))
                .map(|k| from + Duration::days(k))
                .find(|d| on_weekdays.contains(&d.weekday()) && ((monday(*d) - monday(from)).num_days() / 7) % n == 0)
        }
        "week" => from.checked_add_signed(Duration::weeks(i64::from(n))),
        "month" => months(n),
        "year" => months(n.checked_mul(12)?),
        "weekday" => {
            let mut d = from + Duration::days(1);
            while d.weekday().number_from_monday() > 5 {
                d += Duration::days(1);
            }
            Some(d)
        }
        _ => None,
    }
}

/// The line of the next occurrence of a recurring task line that is being ticked on `today`: the
/// same line with its dates moved on by the rule, still open. None when the line has no rule, or
/// one Atlas does not read.
///
/// The step is taken from the task's own date (due, else scheduled, else start) — a weekly task
/// done two days late is due next week all the same — unless the rule says `when done`, or the
/// task has no date at all; then it is taken from `today`.
pub fn next_occurrence(line: &str, today: NaiveDate) -> Option<String> {
    let open = line.find("[ ]")?;
    let t = parse(&line[open + 3..]);
    let rule = t.recurrence.as_deref()?;
    let when_done = rule.to_ascii_lowercase().trim_end().ends_with("when done");
    let anchor = t.date().filter(|_| !when_done);
    let next_anchor = step(rule, anchor.unwrap_or(today))?;
    let shift = |d: NaiveDate| -> String {
        // every date keeps its distance to the one the rule moves
        let moved = match anchor.or(t.date()) {
            Some(a) => next_anchor + (d - a),
            None => next_anchor,
        };
        moved.format("%Y-%m-%d").to_string()
    };
    // each date rewritten where its field has it: the same day may also be another field's (`➕ D 📅 D`), or a moved
    // date another's old one, so a text search could move the wrong one
    const DUE: &[&str] = &["📅", "📆", "🗓"];
    let others: Vec<std::ops::Range<usize>> = [&["➕"][..], &["✅"][..]].iter().filter_map(|m| marked_date(line, m)).collect();
    let mut edits: Vec<(std::ops::Range<usize>, String)> = Vec::new();
    for (d, markers) in [(t.due, DUE), (t.scheduled, &["⏳", "⌛"][..]), (t.start, &["🛫"][..])] {
        let Some(d) = d else { continue };
        let at = marked_date(line, markers).or_else(|| {
            // a due date written without an emoji (parse's fallback): its first mention outside the other fields
            let text = d.format("%Y-%m-%d").to_string();
            let taken = |a: usize| others.iter().chain(edits.iter().map(|(r, _)| r)).any(|r| r.contains(&a));
            line.match_indices(&text).map(|(a, _)| a).find(|&a| !taken(a)).map(|a| a..a + text.len())
        });
        if let Some(r) = at {
            edits.push((r, shift(d)));
        }
    }
    edits.sort_by_key(|(r, _)| std::cmp::Reverse(r.start));
    let mut out = line.to_string();
    for (r, new) in edits {
        out.replace_range(r, &new);
    }
    // the next occurrence never takes the block id: an id is unique in its note, and links to it keep pointing at
    // the task they were made for (the ticked one), as the Tasks plugin does
    let (kept, block) = split_block(&out);
    if block.is_some() {
        out = kept.trim_end().to_string();
    }
    if t.date().is_none() {
        // a rule and no date: the next one is due when the rule says
        out = format!("{} 📅 {}", out.trim_end(), next_anchor.format("%Y-%m-%d"));
    }
    Some(out)
}

/// Where the date right after the first of `markers` found in `line` is (the field's own value, as `parse` reads it).
fn marked_date(line: &str, markers: &[&str]) -> Option<std::ops::Range<usize>> {
    markers.iter().find_map(|m| {
        let after = line.find(m)? + m.len();
        let (_, i) = first_date(&line[after..]).filter(|(_, i)| blank(&line[after..after + i]))?;
        Some(after + i..after + i + 10)
    })
}

/// Nothing between a marker and its value but spaces and the emoji variation selector (`📅\u{FE0F} 2026-10-17`).
fn blank(s: &str) -> bool {
    s.chars().all(|c| c.is_whitespace() || c == '\u{FE0F}')
}

/// Does the line use the Tasks plugin's fields at all? (Then a tick also writes `✅ date`, as that plugin does.)
pub fn uses_fields(line: &str) -> bool {
    MARKERS.iter().any(|(m, _)| line.contains(m))
}

// --- block ids ----------------------------------------------------------------------------------------

/// `text` without the Obsidian block id that ends it, and that id (without `^`). The id is the last word, after
/// whitespace, of letters, digits and `-` (Obsidian's and the Tasks plugin's shape); trailing whitespace and a CRLF
/// line's `\r` are allowed after it.
pub fn split_block(text: &str) -> (&str, Option<&str>) {
    let end = text.trim_end();
    let Some(i) = end.rfind(char::is_whitespace) else { return (text, None) };
    let word = end[i..].trim_start();
    match word.strip_prefix('^') {
        Some(id) if !id.is_empty() && id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-') => (&end[..end.len() - word.len()], Some(id)),
        _ => (text, None),
    }
}

/// The 1-based line of `text` that ends in the block id `id`: where a task given an id is, wherever its line moved.
pub fn find_block(text: &str, id: &str) -> Option<u32> {
    text.split('\n').position(|l| split_block(l).1 == Some(id)).and_then(|i| u32::try_from(i + 1).ok())
}

/// A block id not yet used in `text`: `t` + 4 base-36 characters (DESIGN-calendar-tasks-nudges §2.1). Drawn from a
/// hash of `seed` (the task's line), so the same line in the same note gets the same id — tests stay deterministic,
/// and a retried action does not mint a second one.
pub fn new_block_id(text: &str, seed: &str) -> String {
    use std::hash::{Hash, Hasher};
    const DIGITS: &[u8; 36] = b"0123456789abcdefghijklmnopqrstuvwxyz";
    (0u64..)
        .map(|n| {
            let mut h = std::collections::hash_map::DefaultHasher::new();
            (seed, n).hash(&mut h);
            let mut v = h.finish();
            let mut id = String::from("t");
            for _ in 0..4 {
                id.push(DIGITS[(v % 36) as usize] as char);
                v /= 36;
            }
            id
        })
        .find(|id| find_block(text, id).is_none())
        .expect("an unused id among endless draws")
}

// --- the writer ---------------------------------------------------------------------------------------

/// A task's text written back (what follows the box) in the Tasks plugin's order: the title (its tags and links
/// in it), priority, 🔁 rule, ➕ created, 🛫 start, ⏳ scheduled, 📅 due, ✅ done, and the block id last — so a line
/// edited here and in Obsidian stays the same line. The one writer of task fields: the task dialog asks it through
/// `POST /api/task/render`.
pub fn render(t: &Task) -> String {
    let mut parts: Vec<String> = vec![t.title.trim().to_string()];
    parts.extend(t.priority.mark().map(str::to_string));
    if let Some(rule) = t.recurrence.as_deref().map(str::trim).filter(|r| !r.is_empty()) {
        let every = rule.split_whitespace().next().is_some_and(|w| w.eq_ignore_ascii_case("every"));
        parts.push(if every { format!("🔁 {rule}") } else { format!("🔁 every {rule}") });
    }
    for (mark, day) in [("➕", t.created), ("🛫", t.start), ("⏳", t.scheduled), ("📅", t.due), ("✅", t.completed)] {
        parts.extend(day.map(|d| format!("{mark} {}", d.format("%Y-%m-%d"))));
    }
    parts.extend(t.block.as_deref().filter(|b| !b.is_empty()).map(|b| format!("^{b}")));
    parts.retain(|p| !p.is_empty());
    parts.join(" ")
}

/// A whole task line taken apart: what comes before the box, the box's status, a capture's time, the task.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Line {
    /// Indentation and the list mark (`  - `, `1. `).
    pub lead: String,
    /// The character in the box: ` `, `x`, or another kept as it was (`/`, `-`).
    pub status: char,
    /// A captured task's `HH:MM` (captures.rs): kept first, as written.
    pub stamp: Option<String>,
    pub task: Task,
}

/// A task line taken apart; None when it is not a list item with a box.
pub fn parse_line(line: &str) -> Option<Line> {
    let line = line.strip_suffix('\r').unwrap_or(line);
    let i = crate::today::checkbox(line)?;
    let status = line[i + 1..].chars().next()?;
    let text = line[i + 3..].trim();
    let stamp = crate::captures::stamp(text).map(|(s, _)| s.to_string());
    Some(Line { lead: line[..i].to_string(), status, stamp, task: parse(text) })
}

/// The line [`parse_line`] read, written back by [`render`].
pub fn render_line(l: &Line) -> String {
    let stamp = l.stamp.as_deref().map(|s| format!("{s} ")).unwrap_or_default();
    format!("{}[{}] {stamp}{}", l.lead, l.status, render(&l.task))
}

impl Line {
    /// The line the task dialog's form describes (`POST /api/task/render`), done on `today` when ticked there
    /// without a day. An unknown priority or a date that is not `YYYY-MM-DD` is refused, never dropped.
    pub fn from_fields(f: &crate::api::TaskFields, today: NaiveDate) -> Result<Line, String> {
        let day = |what: &str, v: &str| -> Result<Option<NaiveDate>, String> {
            let v = v.trim();
            if v.is_empty() {
                return Ok(None);
            }
            NaiveDate::parse_from_str(v, "%Y-%m-%d").map(Some).map_err(|_| format!("the {what} date is not YYYY-MM-DD: {v}"))
        };
        let priority = match f.priority.trim() {
            "" | "none" => Priority::Normal,
            p => Priority::from_name(p).ok_or_else(|| format!("no priority `{p}`"))?,
        };
        let was = f.status.chars().next().unwrap_or(' ');
        // ticking keeps an `X`; opening a done one empties the box; another status (`/`, `-`) is kept as it was
        let status = match (f.done, was) {
            (true, 'X') => 'X',
            (true, _) => 'x',
            (false, 'x' | 'X') => ' ',
            (false, c) => c,
        };
        let completed = if f.done { day("done", &f.done_on)?.or(Some(today)) } else { None };
        let block = f.block_id.trim().trim_start_matches('^');
        let title = f.description.split_whitespace().collect::<Vec<_>>().join(" ");
        let task = Task {
            // the tags as `parse` reads them, so the task is the same whichever way it was made
            tags: parse(&title).tags,
            title,
            due: day("due", &f.due)?,
            scheduled: day("scheduled", &f.scheduled)?,
            start: day("start", &f.start)?,
            created: day("created", &f.created)?,
            completed,
            priority,
            recurrence: Some(f.repeat.trim().to_string()).filter(|r| !r.is_empty()),
            block: Some(block.to_string()).filter(|b| !b.is_empty()),
        };
        let lead = if f.lead.is_empty() { "- ".to_string() } else { f.lead.clone() };
        Ok(Line { lead, status, stamp: None, task })
    }
}

// --- what a task block asks ---------------------------------------------------------------------------

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Show {
    #[default]
    Open,
    Done,
    All,
}

/// The options of a task block (all optional). YAML: `show: open`, `tag: [work, admin]`, `path: notes/proj`,
/// `priority: high`, `due: week`, `sort: [priority, due]`, `group: due`, `limit: 20`.
#[derive(Debug, Clone, Default, Deserialize)]
pub struct Query {
    #[serde(default)]
    pub show: Show,
    /// Any of these tags (without `#`; `work` also matches `#work/thesis`).
    #[serde(default, deserialize_with = "one_or_many")]
    pub tag: Vec<String>,
    /// Only tasks in files under this folder (or that file).
    #[serde(default)]
    pub path: Option<String>,
    /// This priority or higher.
    #[serde(default)]
    pub priority: Option<String>,
    /// `overdue`, `today`, `week` (the next seven days and anything overdue), `dated`, `undated`, or a day
    /// (`2026-10-25`: due that day — a day's log asks for its own).
    #[serde(default)]
    pub due: Option<String>,
    /// Done on this day (`✅ 2026-10-25`): what a day's log shows as finished.
    #[serde(default)]
    pub completed: Option<String>,
    /// Hide tasks whose start date (🛫) is still in the future. Default: true.
    #[serde(default = "yes")]
    pub started: bool,
    #[serde(default, deserialize_with = "one_or_many")]
    pub sort: Vec<String>,
    /// `file`, `due`, `priority`, `tag`: rows get a `group` property, and arrive group by group.
    #[serde(default)]
    pub group: Option<String>,
    #[serde(default)]
    pub limit: Option<usize>,
}

fn yes() -> bool {
    true
}

fn one_or_many<'de, D: serde::Deserializer<'de>>(d: D) -> Result<Vec<String>, D::Error> {
    #[derive(Deserialize)]
    #[serde(untagged)]
    enum V {
        One(String),
        Many(Vec<String>),
    }
    Ok(match Option::<V>::deserialize(d)? {
        None => Vec::new(),
        Some(V::One(s)) => s.split(',').map(|x| x.trim().to_string()).filter(|x| !x.is_empty()).collect(),
        Some(V::Many(v)) => v,
    })
}

/// One task with where it is.
#[derive(Debug, Clone)]
pub struct Found {
    pub path: String,
    pub line: u32,
    pub done: bool,
    pub task: Task,
}

impl Query {
    /// Does any option ask for more than "the open tasks, as they come"?
    pub fn is_plain(&self) -> bool {
        self.show == Show::Open && self.tag.is_empty() && self.path.is_none() && self.priority.is_none() && self.due.is_none() && self.sort.is_empty() && self.group.is_none() && self.limit.is_none() && self.completed.as_deref().is_none_or(|c| c.trim().is_empty())
    }

    fn keeps(&self, f: &Found, today: NaiveDate) -> Result<bool, String> {
        let t = &f.task;
        if !match self.show {
            Show::Open => !f.done,
            Show::Done => f.done,
            Show::All => true,
        } {
            return Ok(false);
        }
        if !self.tag.is_empty() && !self.tag.iter().any(|want| { let w = want.trim_start_matches('#').to_lowercase(); t.tags.iter().map(|h| h.to_lowercase()).any(|have| have == w || have.starts_with(&format!("{w}/"))) }) {
            return Ok(false);
        }
        if let Some(p) = self.path.as_deref().map(|p| p.trim_matches('/')).filter(|p| !p.is_empty()) {
            if f.path != p && !f.path.starts_with(&format!("{p}/")) {
                return Ok(false);
            }
        }
        if let Some(p) = &self.priority {
            let min = Priority::from_name(p).ok_or_else(|| format!("priority: {p:?} (lowest, low, normal, medium, high, highest)"))?;
            if t.priority < min {
                return Ok(false);
            }
        }
        if self.started && !f.done && t.start.is_some_and(|s| s > today) {
            return Ok(false);
        }
        if let Some(d) = &self.due {
            let date = t.date();
            let ok = match d.trim().to_ascii_lowercase().as_str() {
                "overdue" => date.is_some_and(|x| x < today),
                "today" => date.is_some_and(|x| x <= today),
                "week" => date.is_some_and(|x| x <= today + Duration::days(7)),
                "dated" => date.is_some(),
                "undated" => date.is_none(),
                other => match NaiveDate::parse_from_str(other, "%Y-%m-%d") {
                    Ok(day) => date == Some(day),
                    Err(_) => return Err(format!("due: {other:?} (overdue, today, week, dated, undated, or a day YYYY-MM-DD)")),
                },
            };
            if !ok {
                return Ok(false);
            }
        }
        if let Some(c) = self.completed.as_deref().map(str::trim).filter(|c| !c.is_empty()) {
            let day = NaiveDate::parse_from_str(c, "%Y-%m-%d").map_err(|_| format!("completed: {c:?} (a day YYYY-MM-DD)"))?;
            if t.completed != Some(day) {
                return Ok(false);
            }
        }
        Ok(true)
    }

    fn group_of(&self, f: &Found, today: NaiveDate) -> Result<Option<String>, String> {
        let Some(g) = self.group.as_deref() else { return Ok(None) };
        Ok(Some(match g.trim().to_ascii_lowercase().as_str() {
            "file" => f.path.rsplit('/').next().unwrap_or(&f.path).trim_end_matches(".md").to_string(),
            "priority" => f.task.priority.name().to_string(),
            "tag" => f.task.tags.first().map(|t| format!("#{}", t.to_lowercase())).unwrap_or_else(|| "no tag".into()), // one group per tag, as the tag index
            "due" => match f.task.date() {
                None => "No date".into(),
                Some(d) if d < today => "Overdue".into(),
                Some(d) if d == today => "Today".into(),
                Some(d) if d <= today + Duration::days(7) => "This week".into(),
                Some(_) => "Later".into(),
            },
            other => return Err(format!("group: {other:?} (file, due, priority, tag)")),
        }))
    }

    /// The tasks the block shows, in its order; each with the name of its group, if it groups.
    pub fn apply(&self, all: Vec<Found>, today: NaiveDate) -> Result<Vec<(Found, Option<String>)>, String> {
        let mut kept = Vec::new();
        for f in all {
            if self.keeps(&f, today)? {
                let g = self.group_of(&f, today)?;
                kept.push((f, g));
            }
        }
        // the last key first: a stable sort by each key in turn gives "by the first, then the second"
        let far = NaiveDate::MAX;
        for key in self.sort.iter().rev() {
            match key.trim().to_ascii_lowercase().as_str() {
                "priority" => kept.sort_by_key(|x| std::cmp::Reverse(x.0.task.priority)),
                "due" | "date" => kept.sort_by_key(|x| x.0.task.date().unwrap_or(far)),
                "start" => kept.sort_by_key(|x| x.0.task.start.unwrap_or(far)),
                "file" | "path" => kept.sort_by(|a, b| a.0.path.cmp(&b.0.path).then(a.0.line.cmp(&b.0.line))),
                "title" => kept.sort_by_cached_key(|x| x.0.task.title.to_lowercase()),
                other => return Err(format!("sort: {other:?} (priority, due, start, file, title)")),
            }
        }
        if let Some(g) = self.group.as_deref() {
            // groups in an order that reads: by urgency for dates and priorities, by name otherwise
            let rank = |name: &Option<String>| -> (usize, String) {
                let n = name.clone().unwrap_or_default();
                let order: &[&str] = match g.trim().to_ascii_lowercase().as_str() {
                    "due" => &["Overdue", "Today", "This week", "Later", "No date"],
                    "priority" => &["highest", "high", "medium", "normal", "low", "lowest"],
                    _ => &[],
                };
                (order.iter().position(|x| *x == n).unwrap_or(order.len()), if order.is_empty() { n.to_lowercase() } else { String::new() })
            };
            kept.sort_by_cached_key(|x| rank(&x.1));
        }
        if let Some(n) = self.limit {
            kept.truncate(n);
        }
        Ok(kept)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn d(s: &str) -> NaiveDate {
        NaiveDate::parse_from_str(s, "%Y-%m-%d").unwrap()
    }

    #[test]
    fn a_task_line_is_read_by_the_shape_of_its_fields() {
        let t = parse("Submit the abstract ⏫ 🔁 every week 🛫 2026-10-10 📅 2026-10-17 #work #admin/forms");
        assert_eq!(t.title, "Submit the abstract #work #admin/forms");
        assert_eq!((t.priority, t.recurrence.as_deref()), (Priority::High, Some("every week")));
        assert_eq!((t.start, t.due), (Some(d("2026-10-10")), Some(d("2026-10-17"))));
        assert_eq!(t.tags, ["work", "admin/forms"]);
        assert_eq!(parse("fix issue #12, see #Notes; ##x").tags, ["Notes"], "a number and `##` are not tags, as in the tag index");
        assert_eq!(t.date(), Some(d("2026-10-17")));
        let p = t.props();
        assert_eq!((p["priority"].as_str(), p["recurrence"].as_str(), p["due"].as_str(), p["tags"].as_str()), ("high", "every week", "2026-10-17", "work admin/forms"));

        // text after a field is text; a date without an emoji is the due date; nothing at all is a plain task
        assert_eq!(parse("a 📆 2026-10-12").due, parse("a 📅\u{FE0F} 2026-10-12").due, "the plugin's other due marker; a variation selector");
        assert!(parse("a ⌛ 2026-10-12").scheduled.is_some() && parse("a 🗓\u{FE0F} 2026-10-12").due.is_some());
        let t = parse("call Ana 📅 2026-10-12 before lunch");
        assert_eq!((t.title.as_str(), t.due), ("call Ana before lunch", Some(d("2026-10-12"))));
        let t = parse("run sweep due:: 2026-10-13 fast");
        assert_eq!((t.title.as_str(), t.due), ("run sweep fast", Some(d("2026-10-13"))));
        assert_eq!(parse("v12026-10-12 and 2026-13-45").due, None, "not inside a word, and a real day");
        let t = parse("just do it");
        assert_eq!((t.title.as_str(), t.priority, t.date(), t.props().len()), ("just do it", Priority::Normal, None, 0));
        let t = parse("done thing ✅ 2026-10-01 ⏳ 2026-09-30");
        assert_eq!((t.completed, t.scheduled, t.date()), (Some(d("2026-10-01")), Some(d("2026-09-30")), Some(d("2026-09-30"))));
        assert_eq!(parse("issue #12 is not a date v12026-10-12").due, None);
    }

    #[test]
    fn a_recurring_task_ticked_makes_its_next_occurrence() {
        let today = d("2026-10-19"); // done two days late
        let next = |l: &str| next_occurrence(l, today);
        assert_eq!(next("- [ ] water 🔁 every week 📅 2026-10-17").as_deref(), Some("- [ ] water 🔁 every week 📅 2026-10-24"), "from its own date");
        assert_eq!(next("- [ ] water 🔁 every week when done 📅 2026-10-17").as_deref(), Some("- [ ] water 🔁 every week when done 📅 2026-10-26"), "from the day it was done");
        assert_eq!(next("  - [ ] rent 🔁 every month 🛫 2026-01-25 📅 2026-01-31").as_deref(), Some("  - [ ] rent 🔁 every month 🛫 2026-02-22 📅 2026-02-28"), "the 31st of a short month; start keeps its distance");
        let rent = |due: &str| next_occurrence(&format!("- [ ] rent 🔁 every month on the 31st 📅 {due}"), today);
        assert_eq!(rent("2026-01-31").as_deref(), Some("- [ ] rent 🔁 every month on the 31st 📅 2026-02-28"));
        assert_eq!(rent("2026-02-28").as_deref(), Some("- [ ] rent 🔁 every month on the 31st 📅 2026-03-31"), "back to the 31st");
        assert_eq!(step("every month on the last", d("2026-03-31")), Some(d("2026-04-30")));
        assert_eq!(step("every 2 months on the 1st", d("2026-01-15")), Some(d("2026-03-01")));
        assert_eq!(step("every month on the last Friday", d("2026-03-27")), None, "a weekday of the month is not read");
        assert_eq!(step("every month on the 2nd Tuesday", d("2026-03-10")), None);
        assert_eq!(step("every month on the 2nd", d("2026-03-10")), Some(d("2026-04-02")));
        assert_eq!(step("every month on the 2st", d("2026-03-10")), None);
        // 2026-10-19 is a Monday
        assert_eq!(step("every week on Monday, Thursday", d("2026-10-19")), Some(d("2026-10-22")));
        assert_eq!(step("every week on Monday and Thursday", d("2026-10-22")), Some(d("2026-10-26")));
        assert_eq!(step("every 2 weeks on Monday, Thursday", d("2026-10-22")), Some(d("2026-11-02")), "the week in between skipped");
        assert_eq!(step("every week on Mondays when done", d("2026-10-21")), Some(d("2026-10-26")));
        assert_eq!(step("every week on Funday", d("2026-10-21")), None);
        assert_eq!(step("every day at noon", d("2026-10-21")), None);
        assert_eq!(next("- [ ] review 🔁 every 2 days").as_deref(), Some("- [ ] review 🔁 every 2 days 📅 2026-10-21"), "no date: due from today");
        assert_eq!(next("- [ ] standup 🔁 every weekday 📅 2026-10-16").as_deref(), Some("- [ ] standup 🔁 every weekday 📅 2026-10-19"), "Friday → Monday");
        assert_eq!(next("- [ ] taxes 🔁 every year 📅 2026-06-30").as_deref(), Some("- [ ] taxes 🔁 every year 📅 2027-06-30"));
        assert_eq!(next("- [ ] odd 🔁 every full moon 📅 2026-10-17"), None, "a rule not read: nothing is invented");
        assert_eq!(next("- [ ] plain 📅 2026-10-17"), None);
        assert_eq!(
            next("- [ ] x 🔁 every day ➕ 2026-10-10 📅 2026-10-10").as_deref(),
            Some("- [ ] x 🔁 every day ➕ 2026-10-10 📅 2026-10-11"),
            "made and due the same day: the due date moves, not the created one"
        );
        assert_eq!(
            next("- [ ] y 🔁 every day 📅 2026-10-10 🛫 2026-10-11").as_deref(),
            Some("- [ ] y 🔁 every day 📅 2026-10-11 🛫 2026-10-12"),
            "a moved date equal to another's old one"
        );
        assert_eq!(next("- [ ] z 🔁 every 4000000000 days 📅 2026-10-10"), None, "too far: not read, no panic");
        assert_eq!(next("- [ ] z 🔁 every 400000000 years 📅 2026-10-10"), None);
    }

    #[test]
    fn a_block_filters_sorts_groups_and_limits() {
        let today = d("2026-10-14");
        let found = |path: &str, line: u32, done: bool, text: &str| Found { path: path.into(), line, done, task: parse(text) };
        let all = || vec![
            found("notes/proj/thesis.md", 3, false, "write intro 🔼 📅 2026-10-20 #work"),
            found("notes/proj/thesis.md", 4, false, "fix figure 2 ⏫ 📅 2026-10-12 #work/figures"),
            found("notes/home.md", 1, false, "buy dice #fun"),
            found("notes/home.md", 2, true, "pay rent 📅 2026-10-01 ✅ 2026-10-02"),
            found("notes/home.md", 3, false, "book flights 🛫 2026-11-01 📅 2026-11-10"),
        ];
        let q = |yaml: &str| serde_yaml::from_str::<Query>(yaml).unwrap();
        let titles = |q: &Query| q.apply(all(), today).unwrap().into_iter().map(|(f, g)| (f.task.title, g)).collect::<Vec<_>>();
        let names = |q: &Query| titles(q).into_iter().map(|(t, _)| t).collect::<Vec<_>>();

        assert!(q("{}").is_plain());
        assert!(!q("completed: 2026-10-02").is_plain(), "a calendar of the day's done tasks asks its question");
        assert_eq!(names(&q("{}")), ["write intro #work", "fix figure 2 #work/figures", "buy dice #fun"], "open, started");
        assert_eq!(names(&q("started: false")).len(), 4);
        assert_eq!(names(&q("show: done")), ["pay rent"]);
        assert_eq!(names(&q("tag: work")), ["write intro #work", "fix figure 2 #work/figures"], "a tag takes its sub-tags");
        assert_eq!(names(&q("tag: [fun, nothing]")), ["buy dice #fun"]);
        assert_eq!(names(&q("tag: '#Fun'")), ["buy dice #fun"], "without case, as the tag index");
        assert_eq!(names(&q("path: notes/proj\nsort: priority")), ["fix figure 2 #work/figures", "write intro #work"]);
        assert_eq!(names(&q("priority: high")), ["fix figure 2 #work/figures"]);
        assert_eq!(names(&q("due: overdue")), ["fix figure 2 #work/figures"]);
        assert_eq!(names(&q("due: week")), ["write intro #work", "fix figure 2 #work/figures"]);
        assert_eq!(names(&q("due: undated")), ["buy dice #fun"]);
        assert_eq!(names(&q("due: 2026-10-20")), ["write intro #work"], "due on one day");
        assert_eq!(names(&q("show: all\ncompleted: 2026-10-02")), ["pay rent"], "done on one day");
        assert!(names(&q("show: all\ncompleted: 2026-10-03")).is_empty());
        assert!(q("completed: yesterday").apply(all(), today).is_err());
        assert_eq!(names(&q("sort: [due]\nlimit: 2")), ["fix figure 2 #work/figures", "write intro #work"]);
        let by_due = titles(&q("group: due\nshow: all\nstarted: false"));
        assert_eq!(by_due.iter().map(|(_, g)| g.clone().unwrap()).collect::<Vec<_>>(), ["Overdue", "Overdue", "This week", "Later", "No date"], "groups arrive in the order of urgency");
        assert!(q("due: someday").apply(all(), today).is_err() && q("sort: colour").apply(all(), today).is_err() && q("group: mood").apply(all(), today).is_err() && q("priority: urgent").apply(all(), today).is_err());
    }

    /// The fields the task dialog's reader (ui/src/lib/task-line.ts) makes of a line, from the core's reading of it.
    fn fields_of(l: &Line) -> crate::api::TaskFields {
        let day = |d: Option<NaiveDate>| d.map(|d| d.format("%Y-%m-%d").to_string()).unwrap_or_default();
        let t = &l.task;
        crate::api::TaskFields {
            lead: l.lead.clone(),
            status: l.status.to_string(),
            block_id: t.block.clone().unwrap_or_default(),
            description: [l.stamp.as_deref(), Some(t.title.as_str())].into_iter().flatten().collect::<Vec<_>>().join(" "),
            done: matches!(l.status, 'x' | 'X'),
            priority: if t.priority == Priority::Normal { "none".into() } else { t.priority.name().into() },
            repeat: t.recurrence.clone().unwrap_or_default(),
            created: day(t.created),
            start: day(t.start),
            scheduled: day(t.scheduled),
            due: day(t.due),
            done_on: day(t.completed),
        }
    }

    #[test]
    fn obsidian_tasks_lines_come_back_as_they_went_in() {
        // the list ui/tests/task-fields.spec.ts reads too: both readers agree, and the one writer gives the line back
        let fixture: serde_json::Value = serde_json::from_str(include_str!("../../../ui/tests/fixtures/task-lines.json")).unwrap();
        let cases = fixture["lines"].as_array().unwrap();
        assert!(cases.len() >= 10);
        for c in cases {
            let line = c["line"].as_str().unwrap();
            let out = c["out"].as_str().unwrap_or(line);
            let want: crate::api::TaskFields = serde_json::from_value(c["fields"].clone()).unwrap();
            let read = parse_line(line).unwrap_or_else(|| panic!("not read as a task: {line}"));
            assert_eq!(fields_of(&read), want, "read: {line}");
            assert_eq!(render_line(&read), out, "written back from the core's reading: {line}");
            // the dialog's path: its fields (the TS reader's, the same) → the core's writer
            let from_form = Line::from_fields(&want, d("2000-01-01")).unwrap();
            assert_eq!(render_line(&from_form), out, "written back from the dialog's fields: {line}");
            assert_eq!(parse_line(out).map(|l| render_line(&l)).as_deref(), Some(out), "the written line is stable: {out}");
        }
    }

    #[test]
    fn the_dialog_s_form_is_written_the_tasks_plugin_s_way() {
        let today = d("2026-11-16");
        let form = |f: crate::api::TaskFields| Line::from_fields(&f, today).map(|l| render_line(&l));
        let base = || crate::api::TaskFields { description: "pay  rent #home".into(), ..Default::default() };
        assert_eq!(form(crate::api::TaskFields { done: true, ..base() }).unwrap(), "- [x] pay rent #home ✅ 2026-11-16", "ticked there: today's ✅");
        assert_eq!(form(crate::api::TaskFields { status: "x".into(), done_on: "2026-11-01".into(), ..base() }).unwrap(), "- [ ] pay rent #home", "opened again: no ✅");
        assert_eq!(form(crate::api::TaskFields { repeat: "week".into(), ..base() }).unwrap(), "- [ ] pay rent #home 🔁 every week");
        assert_eq!(form(crate::api::TaskFields { block_id: "^t1".into(), ..base() }).unwrap(), "- [ ] pay rent #home ^t1");
        assert!(form(crate::api::TaskFields { due: "next friday".into(), ..base() }).is_err(), "a date not written as a day is refused");
        assert!(form(crate::api::TaskFields { priority: "urgent".into(), ..base() }).is_err());
    }

    #[test]
    fn a_block_id_is_the_line_s_last_word_and_never_the_title_s() {
        assert_eq!(split_block("call Ana ^t3f9a"), ("call Ana ", Some("t3f9a")));
        assert_eq!(split_block("call Ana ^t3f9a \r"), ("call Ana ", Some("t3f9a")));
        assert_eq!(split_block("2^10 is big"), ("2^10 is big", None));
        assert_eq!(split_block("a ^ b"), ("a ^ b", None));
        assert_eq!(split_block("x^y"), ("x^y", None), "a caret inside a word is not an id");
        let t = parse("call Ana 🔁 every week 📅 2026-10-12 ^t3f9a");
        assert_eq!((t.title.as_str(), t.recurrence.as_deref(), t.block.as_deref()), ("call Ana", Some("every week"), Some("t3f9a")));
        let note = "# Plan\n- [ ] a ^t1\n- [ ] b ^t2\r\n";
        assert_eq!((find_block(note, "t1"), find_block(note, "t2"), find_block(note, "t3")), (Some(2), Some(3), None));
        let id = new_block_id(note, "- [ ] c");
        assert!(id.len() == 5 && id.starts_with('t') && id[1..].chars().all(|c| c.is_ascii_digit() || c.is_ascii_lowercase()), "{id}");
        assert_eq!(id, new_block_id(note, "- [ ] c"), "the same line gets the same id");
        let taken = format!("{note}- [ ] c ^{id}\n");
        assert_ne!(new_block_id(&taken, "- [ ] c"), id, "an id never used twice in a note");
    }

    #[test]
    fn the_next_occurrence_of_a_task_with_an_id_takes_no_id() {
        let next = next_occurrence("- [ ] water 🔁 every week 📅 2026-10-12 ^t1", d("2026-10-12")).unwrap();
        assert_eq!(next, "- [ ] water 🔁 every week 📅 2026-10-19");
    }
}
