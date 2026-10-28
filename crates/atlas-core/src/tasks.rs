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

const MARKERS: [(&str, Field); 13] = [
    ("📅", Field::Due),
    ("🗓️", Field::Due),
    ("🗓", Field::Due),
    ("⏳", Field::Scheduled),
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
}

fn first_date(s: &str) -> Option<(NaiveDate, usize)> {
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
    let mut t = Task { title: String::new(), due: None, scheduled: None, start: None, created: None, completed: None, priority: Priority::Normal, recurrence: None, tags: Vec::new() };
    let mut title = text[..cuts.first().map_or(text.len(), |c| c.0)].to_string();
    for (k, (at, len, field)) in cuts.iter().enumerate() {
        let value = &text[at + len..cuts.get(k + 1).map_or(text.len(), |c| c.0)];
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
                if let Some((date, i)) = first_date(value).filter(|(_, i)| value[..*i].trim().is_empty()) {
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
    t.tags = title.split_whitespace().filter(|w| w.len() > 1 && w.starts_with('#') && !w[1..].starts_with('#')).map(|w| w[1..].trim_end_matches([',', '.', ';', ':']).to_string()).collect();
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

/// `every week`, `every 3 days`, `every month on the 1st` (the day is kept by the date itself),
/// `every weekday`, each optionally ending in `when done`. None: a rule Atlas does not read — the
/// task is then ticked like any other and nothing new is made, rather than made wrongly.
pub(crate) fn step(rule: &str, from: NaiveDate) -> Option<NaiveDate> {
    let r = rule.to_ascii_lowercase();
    let r = r.trim().strip_prefix("every")?.trim().trim_end_matches("when done").trim();
    let (n, unit) = match r.split_once(' ') {
        Some((n, rest)) if n.parse::<u32>().is_ok() => (n.parse::<u32>().ok()?, rest.trim()),
        _ => (1, r),
    };
    let unit = unit.split_whitespace().next()?;
    if n == 0 {
        return None;
    }
    let months = |m: u32| -> Option<NaiveDate> {
        let total = from.year() * 12 + from.month0() as i32 + m as i32;
        let (y, mo) = (total.div_euclid(12), total.rem_euclid(12) as u32 + 1);
        // the 31st of a month without one is that month's last day
        (0..4).find_map(|back| NaiveDate::from_ymd_opt(y, mo, from.day().saturating_sub(back)))
    };
    match unit.trim_end_matches('s') {
        "day" => Some(from + Duration::days(i64::from(n))),
        "week" => Some(from + Duration::weeks(i64::from(n))),
        "month" => months(n),
        "year" => months(12 * n),
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
    let mut out = line.to_string();
    for d in [t.due, t.scheduled, t.start].into_iter().flatten() {
        out = out.replacen(&d.format("%Y-%m-%d").to_string(), &shift(d), 1);
    }
    if t.date().is_none() {
        // a rule and no date: the next one is due when the rule says
        out = format!("{} 📅 {}", out.trim_end(), next_anchor.format("%Y-%m-%d"));
    }
    Some(out)
}

/// Does the line use the Tasks plugin's fields at all? (Then a tick also writes `✅ date`, as that plugin does.)
pub fn uses_fields(line: &str) -> bool {
    MARKERS.iter().any(|(m, _)| line.contains(m))
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
        self.show == Show::Open && self.tag.is_empty() && self.path.is_none() && self.priority.is_none() && self.due.is_none() && self.sort.is_empty() && self.group.is_none() && self.limit.is_none()
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
        if !self.tag.is_empty() && !self.tag.iter().any(|want| { let w = want.trim_start_matches('#'); t.tags.iter().any(|have| have == w || have.starts_with(&format!("{w}/"))) }) {
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
            "tag" => f.task.tags.first().map(|t| format!("#{t}")).unwrap_or_else(|| "no tag".into()),
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
                "title" => kept.sort_by_key(|x| x.0.task.title.to_lowercase()),
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
            kept.sort_by_key(|x| rank(&x.1));
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
        assert_eq!(t.date(), Some(d("2026-10-17")));
        let p = t.props();
        assert_eq!((p["priority"].as_str(), p["recurrence"].as_str(), p["due"].as_str(), p["tags"].as_str()), ("high", "every week", "2026-10-17", "work admin/forms"));

        // text after a field is text; a date without an emoji is the due date; nothing at all is a plain task
        let t = parse("call Ana 📅 2026-10-12 before lunch");
        assert_eq!((t.title.as_str(), t.due), ("call Ana before lunch", Some(d("2026-10-12"))));
        let t = parse("run sweep due:: 2026-10-13 fast");
        assert_eq!((t.title.as_str(), t.due), ("run sweep fast", Some(d("2026-10-13"))));
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
        assert_eq!(next("- [ ] review 🔁 every 2 days").as_deref(), Some("- [ ] review 🔁 every 2 days 📅 2026-10-21"), "no date: due from today");
        assert_eq!(next("- [ ] standup 🔁 every weekday 📅 2026-10-16").as_deref(), Some("- [ ] standup 🔁 every weekday 📅 2026-10-19"), "Friday → Monday");
        assert_eq!(next("- [ ] taxes 🔁 every year 📅 2026-06-30").as_deref(), Some("- [ ] taxes 🔁 every year 📅 2027-06-30"));
        assert_eq!(next("- [ ] odd 🔁 every full moon 📅 2026-10-17"), None, "a rule not read: nothing is invented");
        assert_eq!(next("- [ ] plain 📅 2026-10-17"), None);
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
        assert_eq!(names(&q("{}")), ["write intro #work", "fix figure 2 #work/figures", "buy dice #fun"], "open, started");
        assert_eq!(names(&q("started: false")).len(), 4);
        assert_eq!(names(&q("show: done")), ["pay rent"]);
        assert_eq!(names(&q("tag: work")), ["write intro #work", "fix figure 2 #work/figures"], "a tag takes its sub-tags");
        assert_eq!(names(&q("tag: [fun, nothing]")), ["buy dice #fun"]);
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
}
