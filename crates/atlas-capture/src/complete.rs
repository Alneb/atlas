//! What the box offers while typing. Notes, tags and `@days` as the web boxes do
//! (ui/src/lib/textarea-complete.ts — kept in step by hand); a to-do's fields come from the core
//! itself (atlas_core::task_suggest), the one implementation every box and the editor use.
use atlas_core::config::TaskSuggestMode;
use crate::icons::Icon;
use atlas_core::task_suggest::TaskIcon;
use chrono::{Local, NaiveDate};
use std::ops::Range;

#[derive(Clone, Debug, PartialEq)]
pub struct Suggestion {
    pub label: String,
    pub detail: String,
    pub icon: Icon,
    /// what replaces `replace` in the text
    pub insert: String,
    pub replace: Range<usize>,
    /// a to-do's "new line" row: Enter is the box's own (send)
    pub new_line: bool,
    /// after taking it, ask again (the dates after a date field)
    pub more: bool,
}

const MOST: usize = 7;
const DAYS: [&str; 11] = ["today", "tomorrow", "mon", "tue", "wed", "thu", "fri", "sat", "sun", "+3d", "+7d"];

/// A to-do in capture's short forms (`[] x`, `- [ ] x`, `todo x`, `TODO: x`…): the core's own rule.
pub fn is_todo(text: &str) -> bool {
    atlas_core::capture::starts_as_task(text)
}

/// The day the text names (`@tomorrow`, `@fri`, `@+3d` — as capture.rs writes them — or `📅 YYYY-MM-DD`).
pub fn due(text: &str, today: NaiveDate) -> Option<NaiveDate> {
    let words: Vec<&str> = text.split_whitespace().collect();
    words.iter().enumerate().find_map(|(i, w)| {
        if let Some(d) = w.strip_prefix('@') {
            return atlas_core::capture::day_of(d, today).or_else(|| NaiveDate::parse_from_str(d, "%Y-%m-%d").ok());
        }
        (w.trim_end_matches('\u{FE0F}') == "📅").then(|| words.get(i + 1).and_then(|d| NaiveDate::parse_from_str(d, "%Y-%m-%d").ok())).flatten()
    })
}

/// A day as people say it: today, tomorrow, Friday (within the week), else "Thu 22 Oct".
pub fn say_day(d: NaiveDate, today: NaiveDate) -> String {
    match (d - today).num_days() {
        0 => "today".into(),
        1 => "tomorrow".into(),
        2..=6 => d.format("%A").to_string(),
        _ => d.format("%a %-d %b").to_string(),
    }
}

/// What the lists draw on: the vault's note names and tags, and when its tasks offer their fields.
#[derive(Debug, Clone, Default)]
pub struct Names {
    pub notes: Vec<String>,
    pub tags: Vec<String>,
    /// `[editor] task_suggest`, as in a note.
    pub tasks: TaskSuggestMode,
}

impl Names {
    /// The vault's note names (not the agent's files) and tags: slow on a big vault, so callers read it off the
    /// thread that types.
    pub fn load(root: &std::path::Path) -> Option<Names> {
        let ws = atlas_core::Workspace::open(root).ok()?;
        let cfg = ws.config().ok()?;
        let mut notes: Vec<String> = atlas_core::walk::files(ws.root(), &cfg)
            .filter(|(_, rel)| rel.ends_with(".md") && !cfg.is_agent_file(rel))
            .map(|(_, rel)| rel.rsplit('/').next().unwrap_or(&rel).trim_end_matches(".md").to_string())
            .collect();
        notes.sort();
        notes.dedup();
        let tags = atlas_core::tags::all(ws.root(), &cfg).into_iter().map(|t| t.tag.trim_start_matches('#').to_string()).collect();
        Some(Names { notes, tags, tasks: cfg.editor.task_suggest })
    }
}

/// The suggestions for the text with the caret at byte `caret`.
pub fn suggest(text: &str, caret: usize, names: &Names) -> Vec<Suggestion> {
    let (notes, tags) = (&names.notes, &names.tags);
    let before = &text[..caret];
    // `[[` a note
    if let Some(open) = before.rfind("[[") {
        let typed = &before[open + 2..];
        if !typed.contains(']') && !typed.contains('\n') {
            let q = typed.to_lowercase();
            let mut hits: Vec<&String> = notes.iter().filter(|n| n.to_lowercase().starts_with(&q)).collect();
            hits.extend(notes.iter().filter(|n| !n.to_lowercase().starts_with(&q) && n.to_lowercase().contains(&q)));
            return hits.into_iter().take(MOST).map(|n| s(n, "", Icon::Note, &format!("{n}]] "), open + 2..caret)).collect();
        }
    }
    // `#tag`, `@day`: a word starting with the sign
    let word_start = before.rfind(|c: char| c.is_whitespace()).map_or(0, |i| i + before[i..].chars().next().map_or(1, char::len_utf8));
    let word = &before[word_start..];
    if let Some(typed) = word.strip_prefix('#') {
        let q = typed.to_lowercase();
        return tags.iter().filter(|t| t.to_lowercase().starts_with(&q) && t.to_lowercase() != q).take(MOST).map(|t| s(&format!("#{t}"), "", Icon::Tag, &format!("{t} "), word_start + 1..caret)).collect();
    }
    if let Some(typed) = word.strip_prefix('@') {
        let today = Local::now().date_naive();
        return DAYS
            .iter()
            .filter(|d| d.starts_with(typed) && **d != typed)
            .take(MOST)
            .map(|d| {
                let when = atlas_core::capture::day_of(d, today).map(atlas_core::task_suggest::say).unwrap_or_default();
                s(&format!("@{d}"), &when, Icon::Calendar, &format!("{d} "), word_start + 1..caret)
            })
            .collect();
    }
    if is_todo(text) {
        return task(before, caret, names.tasks);
    }
    vec![]
}

/// What the text will become once sent: "a to-do, due tomorrow", "a line in today's log".
pub fn what_it_becomes(text: &str) -> String {
    let today = chrono::Local::now().date_naive();
    let when = due(text, today).map(|d| say_day(d, today));
    match (is_todo(text), when) {
        (true, Some(w)) => format!("a to-do, due {w}"),
        (true, None) => "a to-do".into(),
        (false, Some(w)) => format!("a line in today's log · mentions {w}"),
        (false, None) => "a line in today's log".into(),
    }
}

fn s(label: &str, detail: &str, icon: Icon, insert: &str, replace: Range<usize>) -> Suggestion {
    Suggestion { label: label.into(), detail: detail.into(), icon, insert: insert.into(), replace, new_line: false, more: false }
}

/// A task row's picture: the web lists' (ui/src/lib/task-complete.ts, TASK_ICON).
pub fn task_icon(t: TaskIcon) -> Icon {
    match t {
        TaskIcon::NewLine => Icon::Return,
        TaskIcon::Due | TaskIcon::Day => Icon::Calendar,
        TaskIcon::Scheduled => Icon::Clock,
        TaskIcon::Start => Icon::Flag,
        TaskIcon::Created => Icon::Plus,
        TaskIcon::Done => Icon::Check,
        TaskIcon::PriorityUp => Icon::ChevronsUp,
        TaskIcon::PriorityDown => Icon::ChevronsDown,
        TaskIcon::Repeat => Icon::Repeat,
    }
}

/// A to-do's fields, dates and rules (atlas_core::task_suggest), on the line the caret is in.
fn task(before: &str, caret: usize, mode: TaskSuggestMode) -> Vec<Suggestion> {
    let line = &before[before.rfind('\n').map_or(0, |i| i + 1)..];
    // as in a note (Obsidian Tasks' rules, `[editor] task_suggest`); Enter (the ⏎ row) still saves
    if mode == TaskSuggestMode::Off {
        return vec![];
    }
    let ask = atlas_core::task_suggest::Ask { browse: mode == TaskSuggestMode::Always, keep_enter: true, ..Default::default() };
    let Some(found) = atlas_core::task_suggest::suggest(line, Local::now().date_naive(), ask) else { return vec![] };
    // what a row replaces is plain ASCII (a word, a typed date): characters are bytes
    let from = caret - found.replace;
    found
        .items
        .into_iter()
        .map(|it| Suggestion {
            new_line: it.icon == TaskIcon::NewLine,
            icon: task_icon(it.icon),
            more: it.more,
            label: it.label,
            detail: it.detail,
            insert: it.insert,
            replace: from..caret,
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn notes_tags_days_and_task_fields_are_offered() {
        let notes = vec!["Kondo".to_string(), "GW notes".to_string()];
        let tags = vec!["physics".to_string()];
        let names = Names { notes, tags, tasks: TaskSuggestMode::Always };
        let t = "see [[ko";
        assert_eq!(suggest(t, t.len(), &names)[0].insert, "Kondo]] ");
        let t = "x #ph";
        assert_eq!(suggest(t, t.len(), &names)[0].label, "#physics");
        let t = "call @tom";
        assert_eq!(suggest(t, t.len(), &names)[0].insert, "tomorrow ");
        let t = "[] pay rent due";
        let fields = suggest(t, t.len(), &names);
        assert!(fields[0].new_line, "Enter stays the box's own after a word");
        assert_eq!((fields[1].insert.as_str(), fields[1].more), ("📅 ", true));
        let t = "[] pay rent 📅 tom";
        let d = suggest(t, t.len(), &names);
        assert_eq!(d[0].label, "tomorrow");
        assert_eq!(d[0].replace, t.len() - 3..t.len());
        assert!(suggest("pay rent due", 12, &names).is_empty(), "not a to-do: no task fields");
        let thu = NaiveDate::from_ymd_opt(2026, 10, 15).unwrap();
        assert_eq!(due("[] call x @tomorrow", thu), NaiveDate::from_ymd_opt(2026, 10, 16));
        assert_eq!(due("[] call x 📅 2026-10-20", thu), NaiveDate::from_ymd_opt(2026, 10, 20));
        assert_eq!(say_day(NaiveDate::from_ymd_opt(2026, 10, 17).unwrap(), thu), "Saturday");
        assert_eq!(due("plain words", thu), None);
        let t = "[] call x h";
        let h: Vec<String> = suggest(t, t.len(), &names).into_iter().map(|s| s.label).collect();
        assert_eq!(h, ["new line", "scheduled date", "high priority", "highest priority"], "one letter is enough; Obsidian's order, by contains");
        let t = "[] call x ";
        let all = suggest(t, t.len(), &names);
        assert_eq!((all[0].new_line, all[1].label.as_str(), all.len()), (true, "due date", 12), "every field, as in Obsidian Tasks; Enter still saves");
        assert!(is_todo("TODO call") && is_todo("- [ ] x") && is_todo("todo: x") && !is_todo("todos"));
    }
}
