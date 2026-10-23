//! What to offer while a task (`- [ ] …`) is typed — the Obsidian Tasks fields (dates, priority,
//! recurrence), written in that plugin's emoji so the notes stay readable by it, but offered with
//! plain names and the app's own icons. One implementation for every place a task is typed: the
//! note editor and the web capture boxes (`GET /api/tasks/suggest`) and the native capture box
//! (atlas-capture, which links this crate). docs/guides/TASKS.md, "Typing a task".
use crate::tasks;
use chrono::{Datelike, Duration, NaiveDate, Weekday};
use serde::Serialize;
use ts_rs::TS;

/// What a row is: its icon in the list, and what taking it does.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "snake_case")]
#[ts(export)]
pub enum TaskIcon {
    /// Not a field: Enter makes a new line (the first row while a word merely looks like a field's name).
    NewLine,
    Due,
    Scheduled,
    Start,
    Created,
    Done,
    PriorityUp,
    PriorityDown,
    Repeat,
    /// A day, after a date field.
    Day,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[ts(export)]
pub struct TaskSuggestion {
    /// What the row says ("due date", "next friday").
    pub label: String,
    /// The hint beside it ("when it must be done", "Fri 17 Oct").
    pub detail: String,
    /// What replaces the typed word; empty for the new-line row.
    pub insert: String,
    pub icon: TaskIcon,
    /// After taking it, ask again: the dates after a date field, the rules after "repeats".
    pub more: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[ts(export)]
pub struct TaskSuggest {
    /// How many characters before the caret a row replaces (plain ASCII: a typed word or date).
    pub replace: usize,
    pub items: Vec<TaskSuggestion>,
    /// Every field, offered because nothing typed matched one (`Ask::browse`): Tab then indents the
    /// task, as in Obsidian, instead of walking the list.
    pub browsing: bool,
}

const DATE_MARKS: [char; 5] = ['📅', '⏳', '🛫', '✅', '➕'];

struct FieldRow {
    label: &'static str,
    detail: &'static str,
    /// The words that bring it up (a typed word that starts one of them).
    words: &'static [&'static str],
    insert: &'static str,
    icon: TaskIcon,
    /// The marker that says the line has it already (then it is not offered again).
    marker: &'static str,
    more: bool,
}

/// In Obsidian Tasks' order and words (its `CU` suggester: due, start, scheduled, the priorities, recurring,
/// created), so a list the user knows from Obsidian reads the same; "done today" last, Atlas's own.
const FIELDS: [FieldRow; 11] = [
    FieldRow { label: "due date", detail: "when it must be done", words: &["due", "date", "deadline"], insert: "📅 ", icon: TaskIcon::Due, marker: "📅", more: true },
    FieldRow { label: "start date", detail: "not before", words: &["start", "date", "begin"], insert: "🛫 ", icon: TaskIcon::Start, marker: "🛫", more: true },
    FieldRow { label: "scheduled date", detail: "when to work on it", words: &["scheduled", "date", "plan"], insert: "⏳ ", icon: TaskIcon::Scheduled, marker: "⏳", more: true },
    FieldRow { label: "high priority", detail: "", words: &["high", "priority", "important"], insert: "⏫ ", icon: TaskIcon::PriorityUp, marker: "⏫", more: false },
    FieldRow { label: "medium priority", detail: "", words: &["medium", "priority"], insert: "🔼 ", icon: TaskIcon::PriorityUp, marker: "🔼", more: false },
    FieldRow { label: "low priority", detail: "", words: &["low", "priority"], insert: "🔽 ", icon: TaskIcon::PriorityDown, marker: "🔽", more: false },
    FieldRow { label: "highest priority", detail: "", words: &["highest", "priority", "urgent"], insert: "🔺 ", icon: TaskIcon::PriorityUp, marker: "🔺", more: false },
    FieldRow { label: "lowest priority", detail: "", words: &["lowest", "priority", "someday"], insert: "⏬ ", icon: TaskIcon::PriorityDown, marker: "⏬", more: false },
    FieldRow { label: "recurring (repeat)", detail: "every day, week, month…", words: &["repeats", "recurring", "every"], insert: "🔁 ", icon: TaskIcon::Repeat, marker: "🔁", more: true },
    FieldRow { label: "created today", detail: "", words: &["created"], insert: "➕ ", icon: TaskIcon::Created, marker: "➕", more: false },
    FieldRow { label: "done today", detail: "", words: &["done", "completed"], insert: "✅ ", icon: TaskIcon::Done, marker: "✅", more: false },
];
const PRIORITY_MARKS: [&str; 5] = ["🔺", "⏫", "🔼", "🔽", "⏬"];

/// How the list is asked for.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct Ask {
    /// Asked for (Ctrl+Space): every field, no new-line row.
    pub explicit: bool,
    /// `@` also starts a date and opens the fields (the editor; capture's `@tomorrow` short forms are its own).
    pub at: bool,
    /// Obsidian Tasks with "minimum match 0": on a task line the list is always
    /// there — the fields the last word matches, else all of them under a ⏎ row. Off: only a word that
    /// matches a field shows the list.
    pub browse: bool,
    /// The ⏎ row first even when a word matched: a word that only looks like a field never takes Enter
    /// (the capture boxes, where Enter saves; and the note editor, where "fix the low" + Enter
    /// became 🔽 — Obsidian lets it). Tab or ↓ go to the fields.
    pub keep_enter: bool,
}

/// The rules offered after 🔁: only those `tasks` can step (a rule it cannot read would make nothing).
const RULES: [&str; 8] = ["every day", "every weekday", "every week", "every 2 weeks", "every month", "every year", "every week when done", "every month when done"];

/// A day as people say it in a list: "Fri 17 Oct".
pub fn say(d: NaiveDate) -> String {
    d.format("%a %-d %b").to_string()
}

const WEEKDAYS: [(&str, Weekday); 7] =
    [("monday", Weekday::Mon), ("tuesday", Weekday::Tue), ("wednesday", Weekday::Wed), ("thursday", Weekday::Thu), ("friday", Weekday::Fri), ("saturday", Weekday::Sat), ("sunday", Weekday::Sun)];

/// The next `w` after `today` (a week on when today is `w`).
fn next_weekday(today: NaiveDate, w: Weekday) -> NaiveDate {
    let ahead = (i64::from(w.num_days_from_monday()) - i64::from(today.weekday().num_days_from_monday())).rem_euclid(7);
    today + Duration::days(if ahead == 0 { 7 } else { ahead })
}

/// A weekday by the start of its name, when only one starts so ("f", "th"; not "t").
fn weekday_named(word: &str) -> Option<Weekday> {
    let mut hits = WEEKDAYS.iter().filter(|(name, _)| !word.is_empty() && name.starts_with(word));
    match (hits.next(), hits.next()) {
        (Some((_, w)), None) => Some(*w),
        _ => None,
    }
}

fn add_months(d: NaiveDate, m: i32) -> NaiveDate {
    let total = d.year() * 12 + d.month0() as i32 + m;
    let (y, mo) = (total.div_euclid(12), total.rem_euclid(12) as u32 + 1);
    (0..4).find_map(|back| NaiveDate::from_ymd_opt(y, mo, d.day().saturating_sub(back))).unwrap_or(d)
}

/// A date as typed: `today`, `tomorrow`, `fri`, `next fri`, `next week` (Monday), `next month`,
/// `in 3 days`, `in 2 weeks`, `3d`, `+2w`, `2026-10-17`. None for anything else.
pub fn natural_date(text: &str, today: NaiveDate) -> Option<NaiveDate> {
    let t = text.trim().to_ascii_lowercase();
    let words: Vec<&str> = t.split_whitespace().collect();
    let count = |n: &str, unit: &str| -> Option<NaiveDate> {
        let n: i64 = n.trim_start_matches('+').parse().ok()?;
        match unit.trim_end_matches('s') {
            "d" | "day" => Some(today + Duration::days(n)),
            "w" | "week" => Some(today + Duration::weeks(n)),
            "m" | "month" => Some(add_months(today, n as i32)),
            "y" | "year" => Some(add_months(today, 12 * n as i32)),
            _ => None,
        }
    };
    match words.as_slice() {
        ["today"] | ["now"] => Some(today),
        ["tomorrow"] | ["tmr"] => Some(today + Duration::days(1)),
        ["yesterday"] => Some(today - Duration::days(1)),
        ["next", "week"] => Some(next_weekday(today, Weekday::Mon)),
        ["next", "month"] => Some(add_months(today, 1)),
        ["next", "year"] => Some(add_months(today, 12)),
        ["next", day] | ["this", day] => weekday_named(day).map(|w| next_weekday(today, w)),
        ["in", n, unit] => count(n, unit),
        [one] => {
            if let Ok(d) = NaiveDate::parse_from_str(one, "%Y-%m-%d") {
                return Some(d);
            }
            let split = one.trim_start_matches('+').find(|c: char| !c.is_ascii_digit()).map(|i| i + usize::from(one.starts_with('+')));
            if let Some(i) = split.filter(|&i| i > 0 && one[..i].trim_start_matches('+').parse::<i64>().is_ok()) {
                return count(&one[..i], &one[i..]);
            }
            weekday_named(one).map(|w| next_weekday(today, w))
        }
        _ => None,
    }
}

/// The days worth naming, soonest first.
fn named_days(today: NaiveDate) -> Vec<(String, NaiveDate)> {
    let mut out = vec![("today".to_string(), today), ("tomorrow".to_string(), today + Duration::days(1))];
    for i in 2..8 {
        let d = today + Duration::days(i);
        out.push((WEEKDAYS[d.weekday().num_days_from_monday() as usize].0.to_string(), d));
    }
    out.push(("next week".into(), next_weekday(today, Weekday::Mon)));
    out.push(("in two weeks".into(), today + Duration::weeks(2)));
    out.push(("next month".into(), add_months(today, 1)));
    out.push(("next year".into(), add_months(today, 12)));
    out
}

/// The typed text after the last marker of `marks` in `before`, when the caret is still in that
/// field's value (only letters, digits, spaces and `+` since the marker).
fn after_marker<'a>(before: &'a str, marks: &[char], at: bool) -> Option<&'a str> {
    let i = before.rfind(|c| marks.contains(&c));
    let at_i = at.then(|| before.rfind('@').filter(|&i| i == 0 || before[..i].ends_with(char::is_whitespace))).flatten();
    let start = match (i, at_i) {
        (Some(a), Some(b)) => a.max(b),
        (a, b) => a.or(b)?,
    };
    let rest = &before[start..];
    let rest = &rest[rest.chars().next()?.len_utf8()..];
    let rest = rest.trim_start_matches('\u{FE0F}');
    let rest = rest.strip_prefix(' ').unwrap_or(rest);
    rest.chars().all(|c| c.is_ascii_alphanumeric() || c == ' ' || c == '+' || c == '-').then_some(rest)
}

/// What to offer at the end of `before` (a task's text up to the caret).
pub fn suggest(before: &str, today: NaiveDate, ask: Ask) -> Option<TaskSuggest> {
    let Ask { explicit, at, browse, keep_enter } = ask;
    // `@` with nothing after it is the fields' list, not a date (dates come from `@tom…` or after 📅)
    let bare_at = at && before.ends_with('@') && before[..before.len() - 1].chars().last().is_none_or(char::is_whitespace);
    if let Some(typed) = after_marker(before, &DATE_MARKS, at).filter(|_| !bare_at) {
        // a date written out (`2026-10-17 `), or one typed and a space after it: the field is done
        let written = typed.len() >= 11 && NaiveDate::parse_from_str(&typed[..10], "%Y-%m-%d").is_ok();
        if !written && !(typed.ends_with(' ') && natural_date(typed, today).is_some()) && !typed.contains("  ") {
            let lower = typed.to_ascii_lowercase();
            let mut items: Vec<TaskSuggestion> = Vec::new();
            let mut push = |label: String, d: NaiveDate| {
                let insert = format!("{} ", d.format("%Y-%m-%d"));
                if !items.iter().any(|x| x.insert == insert) {
                    items.push(TaskSuggestion { label, detail: say(d), insert, icon: TaskIcon::Day, more: false });
                }
            };
            if let Some(d) = natural_date(&lower, today).filter(|_| !lower.trim().is_empty()) {
                push(typed.trim().to_string(), d);
            }
            // trim the start only: "t " (a word, then a space) names no day, "next " still does
            for (name, d) in named_days(today) {
                if name.starts_with(lower.trim_start()) {
                    push(name, d);
                }
            }
            // "next fr", "this sa": the weekdays by name
            if let Some(rest) = lower.trim().strip_prefix("next ").or_else(|| lower.trim().strip_prefix("this ")) {
                for (name, w) in WEEKDAYS {
                    if name.starts_with(rest.trim()) {
                        push(format!("next {name}"), next_weekday(today, w));
                    }
                }
            }
            if !items.is_empty() {
                return Some(TaskSuggest { replace: typed.len(), items, browsing: false });
            }
        }
    }
    if let Some(typed) = after_marker(before, &['🔁'], false) {
        let lower = typed.to_ascii_lowercase();
        let items: Vec<TaskSuggestion> = RULES
            .iter()
            .filter(|r| r.starts_with(lower.trim_start()) && **r != lower.trim() && tasks::step(r, today).is_some())
            .map(|r| TaskSuggestion { label: r.to_string(), detail: String::new(), insert: format!("{r} "), icon: TaskIcon::Repeat, more: false })
            .collect();
        if !items.is_empty() {
            return Some(TaskSuggest { replace: typed.len(), items, browsing: false });
        }
    }
    // The fields. The last word typed picks those whose name or words contain it (Obsidian Tasks matches
    // by "contains"); a word right after `@` replaces the `@` too.
    let word_start = before.trim_end_matches(|c: char| c.is_ascii_alphabetic() || c == '\'' || c == '_' || c == '-').len();
    let word = &before[word_start..];
    let at_word = at && before[..word_start].ends_with('@') && before[..word_start - 1].chars().last().is_none_or(char::is_whitespace);
    let replace = word.len() + usize::from(at_word);
    let has_priority = PRIORITY_MARKS.iter().any(|m| before.contains(m));
    let open: Vec<&FieldRow> = FIELDS
        .iter()
        .filter(|f| !before.contains(f.marker) && !(has_priority && PRIORITY_MARKS.contains(&f.marker)))
        .collect();
    let typed = word.to_ascii_lowercase();
    let matching: Vec<&FieldRow> = if typed.is_empty() {
        Vec::new()
    } else {
        open.iter().copied().filter(|f| f.label.contains(typed.as_str()) || f.words.iter().any(|w| w.starts_with(&typed))).collect()
    };
    let row = |f: &FieldRow, lead: &str| {
        let insert = match f.icon {
            TaskIcon::Created | TaskIcon::Done => format!("{lead}{}{} ", f.insert, today.format("%Y-%m-%d")),
            _ => format!("{lead}{}", f.insert),
        };
        let detail = match f.icon {
            TaskIcon::Created | TaskIcon::Done => say(today),
            _ => f.detail.to_string(),
        };
        TaskSuggestion { label: f.label.into(), detail, insert, icon: f.icon, more: f.more }
    };
    let new_line = || TaskSuggestion { label: "new line".into(), detail: "Enter".into(), insert: String::new(), icon: TaskIcon::NewLine, more: false };
    if !matching.is_empty() {
        let mut items: Vec<TaskSuggestion> = matching.iter().map(|f| row(f, "")).collect();
        if keep_enter && !explicit {
            items.insert(0, new_line());
        }
        return Some(TaskSuggest { replace, items, browsing: false });
    }
    if !(browse || explicit || bare_at) || open.is_empty() {
        return None;
    }
    // nothing matched: every field, appended where the caret is (a space first after a word), under ⏎
    let (replace, lead) = if bare_at { (1, "") } else if before.ends_with(char::is_whitespace) || before.is_empty() { (0, "") } else { (0, " ") };
    let mut items: Vec<TaskSuggestion> = open.iter().map(|f| row(f, lead)).collect();
    if !explicit {
        items.insert(0, new_line());
    }
    Some(TaskSuggest { replace, items, browsing: true })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn thu() -> NaiveDate {
        NaiveDate::from_ymd_opt(2026, 10, 15).unwrap() // a Thursday
    }
    fn d(s: &str) -> Option<NaiveDate> {
        NaiveDate::parse_from_str(s, "%Y-%m-%d").ok()
    }

    #[test]
    fn dates_are_read_as_people_type_them() {
        let t = thu();
        for (typed, want) in [
            ("today", "2026-10-15"), ("tomorrow", "2026-10-16"), ("fri", "2026-10-16"), ("thursday", "2026-10-22"), ("next fri", "2026-10-16"),
            ("next week", "2026-10-19"), ("next month", "2026-11-15"), ("in 3 days", "2026-10-18"), ("in 2 weeks", "2026-10-29"), ("3d", "2026-10-18"),
            ("+2w", "2026-10-29"), ("1m", "2026-11-15"), ("2026-12-01", "2026-12-01"),
        ] {
            assert_eq!(natural_date(typed, t), d(want), "{typed}");
        }
        assert_eq!(natural_date("f", t), d("2026-10-16"), "one weekday starts so");
        for typed in ["", "soon", "t", "in days", "next"] {
            assert_eq!(natural_date(typed, t), None, "{typed:?}");
        }
        assert_eq!(say(thu()), "Thu 15 Oct");
    }

    const EDITOR: Ask = Ask { explicit: false, at: true, browse: true, keep_enter: true };
    const CAPTURE: Ask = Ask { explicit: false, at: false, browse: true, keep_enter: true };
    const QUIET: Ask = Ask { explicit: false, at: false, browse: false, keep_enter: true };
    fn labels(s: &TaskSuggest) -> Vec<&str> {
        s.items.iter().map(|i| i.label.as_str()).collect()
    }

    #[test]
    fn on_a_task_line_the_list_is_always_there_as_in_obsidian_tasks() {
        // nothing typed yet, or a word no field contains: every field, in Obsidian Tasks' order, under ⏎
        for before in ["- [ ] ", "- [ ] pay the rent", "- [ ] pay the rent "] {
            let s = suggest(before, thu(), EDITOR).unwrap();
            assert_eq!(
                labels(&s),
                ["new line", "due date", "start date", "scheduled date", "high priority", "medium priority", "low priority", "highest priority", "lowest priority", "recurring (repeat)", "created today", "done today"],
                "{before:?}"
            );
            assert_eq!(s.replace, 0);
        }
        assert_eq!(suggest("- [ ] pay the rent", thu(), EDITOR).unwrap().items[1].insert, " 📅 ", "after a word, a space first");
        assert!(suggest("- [ ] pay ", thu(), EDITOR).unwrap().browsing, "nothing matched: Tab indents");
        // a word a field contains: those fields under ⏎ (Enter stays a new line, Tab goes down); "date" is in
        // three, and "du" in sche-du-led too: Obsidian matches by "contains" as well
        let du = suggest("- [ ] pay rent du", thu(), EDITOR).unwrap();
        assert_eq!((labels(&du), du.replace, du.items[1].insert.as_str(), du.browsing), (vec!["new line", "due date", "scheduled date"], 2, "📅 ", false));
        assert_eq!(labels(&suggest("- [ ] pay date", thu(), EDITOR).unwrap()), ["new line", "due date", "start date", "scheduled date"]);
        assert_eq!(labels(&suggest("- [ ] x low", thu(), EDITOR).unwrap()), ["new line", "low priority", "lowest priority"]);
        assert_eq!(suggest("x crea", thu(), EDITOR).unwrap().items[1].insert, "➕ 2026-10-15 ");
        // fields the line has are not offered again; one priority takes the others away
        let has = suggest("- [ ] pay 📅 2026-10-20 ⏫ ", thu(), EDITOR).unwrap();
        assert!(has.items.iter().all(|i| i.insert != "📅 " && !i.label.contains("priority")), "{:?}", labels(&has));
        // asked for: every field, no new-line row
        assert!(suggest("pay ", thu(), Ask { explicit: true, ..QUIET }).unwrap().items.iter().all(|i| i.icon != TaskIcon::NewLine));
    }

    #[test]
    fn a_bare_at_opens_the_fields_and_is_replaced() {
        let s = suggest("- [ ] mail ana @", thu(), EDITOR).unwrap();
        assert_eq!((s.replace, s.items[0].icon, s.items[1].label.as_str(), s.items[1].insert.as_str()), (1, TaskIcon::NewLine, "due date", "📅 "));
        let du = suggest("- [ ] mail ana @du", thu(), EDITOR).unwrap();
        assert_eq!((du.replace, labels(&du)), (3, vec!["new line", "due date", "scheduled date"]), "the @ goes with the word");
    }

    #[test]
    fn in_a_capture_box_enter_stays_the_boxs_own() {
        let s = suggest("[] pay rent due", thu(), CAPTURE).unwrap();
        assert_eq!(labels(&s), ["new line", "due date"], "a matching word does not take Enter: Enter saves");
        assert_eq!(suggest("[] pay rent ", thu(), CAPTURE).unwrap().items[0].icon, TaskIcon::NewLine, "the list is offered there too");
        assert!(suggest("pay rent ", thu(), QUIET).is_none(), "quiet: nothing typed, nothing shown");
        assert_eq!(labels(&suggest("pay rent due", thu(), QUIET).unwrap()), ["new line", "due date"]);
    }

    #[test]
    fn after_a_date_field_the_days_and_what_was_typed() {
        let s = suggest("pay rent 📅 ", thu(), QUIET).unwrap();
        assert_eq!((s.replace, s.items[0].label.as_str(), s.items[0].insert.as_str()), (0, "today", "2026-10-15 "));
        let fri = suggest("pay rent 📅 next fr", thu(), QUIET).unwrap();
        assert_eq!((fri.replace, fri.items[0].detail.as_str(), fri.items[0].insert.as_str()), (7, "Fri 16 Oct", "2026-10-16 "));
        let nf = suggest("pay 📅 next f", thu(), QUIET).unwrap();
        assert_eq!((nf.items[0].label.as_str(), nf.items[0].detail.as_str()), ("next f", "Fri 16 Oct"));
        let typed = suggest("call ⏳ in 3 days", thu(), QUIET).unwrap();
        assert_eq!(typed.items[0].insert, "2026-10-18 ");
        assert!(suggest("pay 📅 2026-10-20 ", thu(), QUIET).is_none_or(|s| s.items[0].icon != TaskIcon::Day), "a written date ends the field");
        let next = suggest("pay 📅 2026-10-20 hig", thu(), QUIET).unwrap();
        assert_eq!((next.replace, labels(&next)), (3, vec!["new line", "high priority", "highest priority"]), "after the date, the next field");
        assert!(suggest("- [ ] call @t ", thu(), EDITOR).is_none_or(|s| s.items.iter().all(|i| i.icon != TaskIcon::Day)), "`@t ` names no day");
        assert_eq!(suggest("- [ ] call @next ", thu(), EDITOR).unwrap().items[0].label, "next week");
        assert_eq!(suggest("mail ana @tom", thu(), Ask { at: true, ..QUIET }).unwrap().items[0].insert, "2026-10-16 ", "@ starts a date in the editor");
        assert!(suggest("mail ana@tom", thu(), Ask { at: true, ..QUIET }).is_none_or(|s| s.items[0].icon != TaskIcon::Day), "not inside a word (an address)");
    }

    #[test]
    fn after_repeats_the_rules_atlas_can_step() {
        let s = suggest("water 🔁 every w", thu(), QUIET).unwrap();
        assert_eq!(s.items.iter().map(|i| i.label.as_str()).collect::<Vec<_>>(), ["every weekday", "every week", "every week when done"]);
        assert!(RULES.iter().all(|r| tasks::step(r, thu()).is_some()));
        let all = suggest("pay the rent 📅 2026-10-18 ⏫ 🔁 ", thu(), Ask { explicit: true, at: true, ..QUIET }).unwrap();
        assert_eq!(all.items.len(), RULES.len(), "after 🔁 (asked for), every rule");
    }
}
