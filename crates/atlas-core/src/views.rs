//! View blocks (docs/design/MALLEABLE.md, R4 — Embark's views over the surrounding document): a fenced
//! ```` ```view ```` block in a note holds YAML, and this turns it into rows for a registered view
//! (calendar, list, table…, drawn by `ui/src/lib/views.ts`, which Lua widgets share):
//! ```yaml
//! type: calendar        # any registered view
//! from: section         # section (default) | note | tasks | next-actions | folder:<dir> | base:<file.base> | plugin:<id>/<tool>
//! args: {days: 60}      # plugin: only — the tool's input
//! filters: ...          # Bases filters, for notes (folder:/base:/next-actions/or alone)
//! date: due             # the property holding a note's date (default: date)
//! dated: true           # only items with a date (a calendar beside a task list)
//! by: up                # tree view: the property that names a note's parent
//! columns: [state]      # more properties to carry in each row's `props`
//! ```
//! `next-actions` is the first open task of each matching note (a project's next step): a note whose
//! `start:` is in the future is left out, and rows are ordered by the task's date, else the note's `due`.
//! Tasks come from checkboxes (`- [ ]` / `- [x]`), their date from the first ISO date in the line
//! (`📅 2026-10-12`, `due:: 2026-10-12`, plain) — shape-based, so Obsidian Tasks syntax just works.
use crate::api::{BaseCell, ViewResult, ViewRow};
use crate::{bases, today, Error, Result, Workspace};
use serde::Deserialize;
use std::collections::BTreeMap;

#[derive(Debug, Deserialize)]
struct Spec {
    #[serde(rename = "type", default = "list")]
    kind: String,
    #[serde(default)]
    from: Option<String>,
    #[serde(default)]
    filters: Option<serde_yaml::Value>,
    #[serde(default)]
    date: Option<String>,
    #[serde(default)]
    dated: bool,
    #[serde(default)]
    by: Option<String>,
    #[serde(default)]
    columns: Vec<String>,
    /// The input of a `plugin:` source's tool.
    #[serde(default)]
    args: Option<serde_yaml::Value>,
    /// What a task block asks (show, tag, path, priority, due, sort, group, limit): crate::tasks.
    #[serde(flatten)]
    tasks: crate::tasks::Query,
}

fn list() -> String {
    "list".into()
}

/// Where the rows come from.
#[derive(Debug, PartialEq)]
enum From<'a> {
    Section,
    Note,
    /// Open tasks anywhere in the workspace (Today's list).
    Tasks,
    /// The first open task of each note matching the filters.
    NextActions,
    Folder(&'a str),
    Base(&'a str),
    /// A plugin tool's answer (`plugin:dav/events`): the rows a plugin supplies (events from a calendar server).
    Plugin { plugin: &'a str, tool: &'a str },
}

fn parse_from(s: Option<&str>, has_filters: bool) -> Result<From<'_>> {
    Ok(match s.map(str::trim) {
        None if has_filters => From::Folder(""),
        None | Some("section") => From::Section,
        Some("note") => From::Note,
        Some("tasks") => From::Tasks,
        Some("next-actions") => From::NextActions,
        Some(x) if x.starts_with("folder:") => From::Folder(x["folder:".len()..].trim().trim_matches('/')),
        Some(x) if x.starts_with("base:") => From::Base(x["base:".len()..].trim()),
        Some(x) if x.starts_with("plugin:") => match x["plugin:".len()..].trim().split_once('/') {
            Some((plugin, tool)) if !plugin.is_empty() && !tool.is_empty() => From::Plugin { plugin, tool },
            _ => return Err(Error::BadRequest(format!("view: `from: {x}` names no tool (plugin:<id>/<tool>, e.g. plugin:dav/events)"))),
        },
        Some(x) => return Err(Error::BadRequest(format!("view: unknown `from: {x}` (section, note, tasks, next-actions, folder:…, base:…, plugin:…/…)"))),
    })
}

/// The first `YYYY-MM-DD` in a text, and the text without it (and without the 📅 / `due::` that
/// introduced it).
fn split_date(text: &str) -> (String, Option<String>) {
    let b = text.as_bytes();
    let at = (0..b.len().saturating_sub(9)).find(|&i| {
        let d = |k: usize| b[i + k].is_ascii_digit();
        d(0) && d(1) && d(2) && d(3) && b[i + 4] == b'-' && d(5) && d(6) && b[i + 7] == b'-' && d(8) && d(9)
            && (i == 0 || !b[i - 1].is_ascii_alphanumeric())
    });
    let Some(i) = at else { return (text.trim().to_string(), None) };
    let date = text[i..i + 10].to_string();
    let mut title = format!("{}{}", &text[..i], &text[i + 10..]);
    for marker in ["📅", "🗓️", "🗓", "[due::]", "due::", "@"] {
        title = title.replace(marker, " ");
    }
    (title.split_whitespace().collect::<Vec<_>>().join(" "), Some(date))
}

/// Every checkbox of `lines` (open and done), outside code fences.
fn tasks_in(path: &str, lines: &[&str], first_line: u32) -> Vec<ViewRow> {
    let mut out = Vec::new();
    let mut fence = false;
    for (i, l) in lines.iter().enumerate() {
        if l.trim_start().starts_with("```") || l.trim_start().starts_with("~~~") {
            fence = !fence;
            continue;
        }
        if fence {
            continue;
        }
        let (text, done) = if let Some(t) = today::parse_task(l) {
            (t, false)
        } else if let Some(t) = today::done_task(l) {
            (t, true)
        } else {
            continue;
        };
        out.push(task_row(path, first_line + i as u32, text, done));
    }
    out
}

/// A task as a row: its text without the fields, the date a calendar places it on, and the fields
/// (priority, recurrence, due / scheduled / start, tags) as `props`.
fn task_row(path: &str, line: u32, text: &str, done: bool) -> ViewRow {
    let t = crate::tasks::parse(text);
    ViewRow { path: Some(path.into()), line: Some(line), date: t.date().map(|d| d.format("%Y-%m-%d").to_string()), done: Some(done), props: t.props(), title: t.title }
}

/// A task block's own questions (crate::tasks::Query) put to rows that are tasks; each kept row
/// gets its group's name as `props.group`.
fn ask(rows: Vec<ViewRow>, q: &crate::tasks::Query, today: chrono::NaiveDate) -> Result<Vec<ViewRow>> {
    let found = rows
        .into_iter()
        .filter_map(|r| Some(crate::tasks::Found { path: r.path.clone()?, line: r.line?, done: r.done?, task: task_of(&r) }))
        .collect();
    let kept = q.apply(found, today).map_err(|e| Error::BadRequest(format!("view: {e}")))?;
    Ok(kept
        .into_iter()
        .map(|(f, group)| {
            let mut props = f.task.props();
            if let Some(g) = group {
                props.insert("group".into(), g);
            }
            ViewRow { path: Some(f.path), line: Some(f.line), date: f.task.date().map(|d| d.format("%Y-%m-%d").to_string()), done: Some(f.done), title: f.task.title, props }
        })
        .collect())
}

/// The task a row was made from (its fields are in `props`).
fn task_of(r: &ViewRow) -> crate::tasks::Task {
    let day = |k: &str| r.props.get(k).and_then(|d| chrono::NaiveDate::parse_from_str(d, "%Y-%m-%d").ok());
    let mut t = crate::tasks::parse(&r.title);
    t.title = r.title.clone();
    (t.due, t.scheduled, t.start, t.created, t.completed) = (day("due"), day("scheduled"), day("start"), day("created"), day("completed"));
    t.recurrence = r.props.get("recurrence").cloned();
    t.priority = r.props.get("priority").and_then(|p| crate::tasks::Priority::from_name(p)).unwrap_or(crate::tasks::Priority::Normal);
    t
}

/// The 0-based line range of the section holding line `at` (0-based): from its heading to the next
/// heading of the same or a higher level; the whole note when `at` is above every heading.
fn section_range(lines: &[&str], at: usize) -> (usize, usize) {
    let level = |l: &str| {
        let n = l.chars().take_while(|&c| c == '#').count();
        (n > 0 && n <= 6 && l[n..].starts_with(' ')).then_some(n)
    };
    let Some((start, lv)) = (0..=at.min(lines.len().saturating_sub(1))).rev().find_map(|i| level(lines[i]).map(|n| (i, n)))
    else {
        return (0, lines.len());
    };
    let end = (start + 1..lines.len()).find(|&i| level(lines[i]).is_some_and(|n| n <= lv)).unwrap_or(lines.len());
    (start, end)
}

/// The 0-based line of the ```` ```view ```` block whose body is `src` (the renderer has no line numbers).
fn block_line(lines: &[&str], src: &str) -> Option<usize> {
    let want = src.trim();
    let mut i = 0;
    while i < lines.len() {
        if lines[i].trim_start().starts_with("```view") {
            let end = (i + 1..lines.len()).find(|&j| lines[j].trim_start().starts_with("```")).unwrap_or(lines.len());
            if lines[i + 1..end].join("\n").trim() == want {
                return Some(i);
            }
            i = end;
        }
        i += 1;
    }
    None
}

/// A cell as text: a link is the note it resolves to (so a parent can be matched by path).
fn cell_text(c: &BaseCell) -> Option<String> {
    match c {
        BaseCell::Date { text } | BaseCell::Text { value: text } => Some(text.clone()),
        BaseCell::Link { text, path } => Some(path.clone().unwrap_or_else(|| text.clone())),
        BaseCell::Num { value } => Some(value.to_string()),
        BaseCell::Bool { value } => Some(value.to_string()),
        BaseCell::List { items } => items.first().and_then(cell_text),
        BaseCell::Null => None,
    }
}

/// The Bases query for "notes under `dir` matching `filters`", showing `columns`.
fn notes_query(dir: &str, filters: Option<&serde_yaml::Value>, columns: &[&str]) -> String {
    let mut and = Vec::new();
    if !dir.is_empty() {
        and.push(serde_yaml::Value::String(format!("file.inFolder(\"{dir}\")")));
    }
    and.extend(filters.cloned());
    let mut f = serde_yaml::Mapping::new();
    f.insert("and".into(), serde_yaml::Value::Sequence(and));
    let mut order: Vec<serde_yaml::Value> = vec!["file.name".into()];
    order.extend(columns.iter().filter(|c| !c.is_empty()).map(|c| serde_yaml::Value::from(*c)));
    order.dedup();
    let mut view = serde_yaml::Mapping::new();
    view.insert("type".into(), "table".into());
    view.insert("order".into(), serde_yaml::Value::Sequence(order));
    let mut doc = serde_yaml::Mapping::new();
    doc.insert("filters".into(), serde_yaml::Value::Mapping(f));
    doc.insert("views".into(), serde_yaml::Value::Sequence(vec![serde_yaml::Value::Mapping(view)]));
    serde_yaml::to_string(&doc).unwrap_or_default()
}

/// Notes as rows (folder:/base:/filters), dated by `date_prop`; every property column of the query
/// is carried in the row's `props`.
fn notes(ws: &Workspace, note: &str, base_src: String, date_prop: &str) -> Result<Vec<ViewRow>> {
    let r = bases::evaluate(ws.root(), &ws.config()?, &base_src, Some(note));
    if let Some(e) = r.error {
        return Err(Error::BadRequest(e));
    }
    let Some(v) = r.views.into_iter().next() else { return Ok(Vec::new()) };
    Ok(v.rows
        .into_iter()
        .map(|row| {
            let props: BTreeMap<String, String> = v
                .columns
                .iter()
                .zip(&row.cells)
                .filter_map(|(c, cell)| Some((c.key.clone()?, cell_text(cell)?)))
                .collect();
            let date = props.get(date_prop).map(|d| d.chars().take(10).collect::<String>());
            let title = row.path.rsplit('/').next().unwrap_or(&row.path).trim_end_matches(".md").to_string();
            ViewRow { path: Some(row.path), line: None, title, date: date.filter(|d| split_date(d).1.is_some()), done: None, props }
        })
        .collect())
}

/// The next step of each note in `notes`: its first open task. A note that starts later is not due
/// for action yet; rows are ordered by date (the task's, else the note's `due`), undated last.
fn next_actions(ws: &Workspace, notes: Vec<ViewRow>, today: &str) -> Vec<ViewRow> {
    let mut out: Vec<ViewRow> = notes
        .into_iter()
        .filter(|n| n.props.get("start").is_none_or(|s| s.chars().take(10).collect::<String>().as_str() <= today))
        .filter_map(|n| {
            let path = n.path?;
            let text = crate::files::read_text(ws, &path).ok()?.text;
            let lines: Vec<&str> = text.lines().collect();
            let mut task = tasks_in(&path, &lines, 1).into_iter().find(|t| t.done == Some(false))?;
            task.date = task.date.or_else(|| n.props.get("due").map(|d| d.chars().take(10).collect()));
            task.props = n.props;
            task.props.insert("note".into(), n.title);
            Some(task)
        })
        .collect();
    out.sort_by(|a, b| (a.date.is_none(), &a.date, &a.path).cmp(&(b.date.is_none(), &b.date, &b.path)));
    out
}

/// Evaluates a view block of `note` (workspace-relative) whose YAML body is `src`.
pub fn evaluate(ws: &Workspace, note: &str, src: &str) -> Result<ViewResult> {
    let spec: Spec = serde_yaml::from_str(src).map_err(|e| Error::BadRequest(format!("view: {e}")))?;
    let date_prop = spec.date.clone().unwrap_or_else(|| "date".into());
    let extra: Vec<&str> = spec.by.iter().chain(&spec.columns).map(String::as_str).collect();
    let rows = match parse_from(spec.from.as_deref(), spec.filters.is_some())? {
        From::Section | From::Note => {
            let text = crate::files::read_text(ws, note)?.text;
            let lines: Vec<&str> = text.lines().collect();
            let (a, b) = match parse_from(spec.from.as_deref(), false)? {
                From::Note => (0, lines.len()),
                _ => section_range(&lines, block_line(&lines, src).unwrap_or(0)),
            };
            tasks_in(note, &lines[a..b], a as u32 + 1)
        }
        // open tasks only (and capped) unless the block asks for done ones too
        From::Tasks if spec.tasks.show == crate::tasks::Show::Open => {
            today::scan_tasks(ws.root(), &ws.config()?).into_iter().map(|h| task_row(&h.path, h.line, &h.text, false)).collect()
        }
        From::Tasks => today::all_tasks(ws.root(), &ws.config()?).into_iter().map(|(h, done)| task_row(&h.path, h.line, &h.text, done)).collect(),
        From::NextActions => {
            let mut cols = vec!["start", "due"];
            cols.extend(extra.iter().copied());
            let all = notes(ws, note, notes_query("", spec.filters.as_ref(), &cols), "due")?;
            next_actions(ws, all, &chrono::Local::now().format("%Y-%m-%d").to_string())
        }
        From::Folder(dir) => {
            let mut cols = vec![date_prop.as_str()];
            cols.extend(extra.iter().copied());
            notes(ws, note, notes_query(dir, spec.filters.as_ref(), &cols), &date_prop)?
        }
        From::Base(file) => {
            let src = crate::files::read_text(ws, file)?.text;
            notes(ws, note, src, &date_prop)?
        }
        From::Plugin { .. } => return Err(Error::BadRequest("view: a plugin's rows are asked through the server (views::from_plugin)".into())),
    };
    finish(spec, rows)
}

/// The rows of a view block whose source is a plugin tool (`from: plugin:<id>/<tool>`), or None for any other block.
/// The tool is called like any (its permissions and secrets), with `args:` as its input.
pub async fn from_plugin(ws: &Workspace, helpers: &crate::helper::Helpers, src: &str) -> Option<Result<ViewResult>> {
    let spec: Spec = serde_yaml::from_str(src).ok()?;
    let (plugin, tool) = match parse_from(spec.from.as_deref(), spec.filters.is_some()) {
        Ok(From::Plugin { plugin, tool }) => (plugin.to_string(), tool.to_string()),
        _ => return None,
    };
    let input = match spec.args.as_ref().map(serde_json::to_value).transpose() {
        Ok(v) => v.unwrap_or_else(|| serde_json::json!({})),
        Err(e) => return Some(Err(Error::BadRequest(format!("view: args: {e}")))),
    };
    let run = async {
        let cfg = ws.config()?;
        let store = crate::secrets::Store::for_vault(ws.root());
        let answer = crate::plugin_tools::call(ws.root(), &cfg, helpers, &store, &plugin, &tool, input).await?;
        finish(spec, plugin_rows(&answer))
    };
    Some(run.await)
}

/// A tool's answer as rows, by its shape: an array of objects, or the first array in an object (`{events: […]}`). A
/// row's title is its `title`, `summary` or `name`; its date the first ten characters of `date`, `start` or `due`
/// (`2026-10-22T10:00` → the day); its `path` (or a `source` that is a note) opens it; every other plain field is a prop.
fn plugin_rows(v: &serde_json::Value) -> Vec<ViewRow> {
    use serde_json::Value;
    let items = match v {
        Value::Array(a) => a.as_slice(),
        Value::Object(o) => o.values().find_map(Value::as_array).map_or(&[][..], Vec::as_slice),
        _ => &[],
    };
    let text = |x: &Value| match x {
        Value::String(s) => Some(s.clone()),
        Value::Number(n) => Some(n.to_string()),
        Value::Bool(b) => Some(b.to_string()),
        _ => None,
    };
    items.iter().filter_map(Value::as_object).map(|o| {
        let first = |keys: &[&str]| keys.iter().find_map(|k| o.get(*k).and_then(text).filter(|s| !s.is_empty()));
        let date = first(&["date", "start", "due"]).and_then(|d| d.get(..10).filter(|d| split_date(d).1.is_some()).map(str::to_string));
        ViewRow {
            // An event made from a note names it as its `source`: the row opens that note.
            path: first(&["path"]).or_else(|| first(&["source"]).filter(|s| s.ends_with(".md"))),
            line: None,
            title: first(&["title", "summary", "name"]).unwrap_or_default(),
            date,
            done: o.get("done").and_then(Value::as_bool),
            props: o.iter().filter_map(|(k, x)| Some((k.clone(), text(x)?))).collect(),
        }
    }).collect()
}

/// What every source shares: a task block's questions, `dated:`, the view's kind.
fn finish(spec: Spec, rows: Vec<ViewRow>) -> Result<ViewResult> {
    // a `task-list` block, or any block that sets a task option, asks its questions of the rows that are tasks
    // (only where the rows are tasks: a table of notes that says `limit:` must not lose its rows here)
    let of_tasks = matches!(parse_from(spec.from.as_deref(), spec.filters.is_some())?, From::Section | From::Note | From::Tasks);
    let rows = if of_tasks && (spec.kind == "task-list" || !spec.tasks.is_plain()) { ask(rows, &spec.tasks, chrono::Local::now().date_naive())? } else { rows };
    let rows = if spec.dated { rows.into_iter().filter(|r| r.date.is_some()).collect() } else { rows };
    Ok(ViewResult { kind: spec.kind, rows })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_plugin_tool_is_a_source_and_its_answer_rows_by_shape() {
        assert_eq!(parse_from(Some("plugin:dav/events"), false).unwrap(), From::Plugin { plugin: "dav", tool: "events" });
        assert!(parse_from(Some("plugin:dav"), false).is_err());
        let answer = serde_json::json!({ "calendar": "Personal", "events": [
            { "uid": "a1", "summary": "Exam", "start": "2026-11-03T09:00", "location": "D7", "source": "notes/course.md" },
            { "title": "Deadline", "date": "2026-11-10", "path": "notes/paper.md", "done": false },
            { "summary": "No date" },
        ] });
        let rows = plugin_rows(&answer);
        assert_eq!(rows.len(), 3);
        assert_eq!((rows[0].title.as_str(), rows[0].date.as_deref()), ("Exam", Some("2026-11-03")));
        assert_eq!(rows[0].props.get("location").map(String::as_str), Some("D7"));
        assert_eq!(rows[0].path.as_deref(), Some("notes/course.md"), "its source note");
        assert_eq!((rows[1].path.as_deref(), rows[1].done), (Some("notes/paper.md"), Some(false)));
        assert_eq!(rows[2].date, None);
        // A file-reading evaluation never calls a tool.
        let d = tempfile::tempdir().unwrap();
        assert!(matches!(evaluate(&Workspace::open(d.path()).unwrap(), "x.md", "from: plugin:dav/events"), Err(Error::BadRequest(_))));
    }

    #[test]
    fn dates_are_found_by_shape_and_removed_from_the_title() {
        assert_eq!(split_date("read Georges 1996 📅 2026-10-12"), ("read Georges 1996".into(), Some("2026-10-12".into())));
        assert_eq!(split_date("run sweep due:: 2026-10-13 fast"), ("run sweep fast".into(), Some("2026-10-13".into())));
        assert_eq!(split_date("no date here"), ("no date here".into(), None));
        assert_eq!(split_date("v12026-10-12"), ("v12026-10-12".into(), None), "not inside a word");
    }

    #[test]
    fn a_section_block_sees_only_its_section_and_folders_use_bases() {
        let d = tempfile::tempdir().unwrap();
        let note = "# Plan\n\n## Monday\n- [ ] read 📅 2026-10-12\n- [x] done 📅 2026-10-11\n```view\ntype: calendar\n```\n\n## Tuesday\n- [ ] other 📅 2026-10-13\n";
        std::fs::write(d.path().join("plan.md"), note).unwrap();
        std::fs::create_dir_all(d.path().join("lec")).unwrap();
        std::fs::write(d.path().join("lec/a.md"), "---\ndate: 2026-10-01\n---\n").unwrap();
        std::fs::write(d.path().join("lec/b.md"), "no date\n").unwrap();
        let ws = Workspace::open(d.path()).unwrap();
        let r = evaluate(&ws, "plan.md", "type: calendar").unwrap();
        assert_eq!(r.kind, "calendar");
        let got: Vec<_> = r.rows.iter().map(|x| (x.title.as_str(), x.date.as_deref(), x.done, x.line)).collect();
        assert_eq!(got, vec![("read", Some("2026-10-12"), Some(false), Some(4)), ("done", Some("2026-10-11"), Some(true), Some(5))]);
        assert_eq!(evaluate(&ws, "plan.md", "type: list\nfrom: note").unwrap().rows.len(), 3);
        let f = evaluate(&ws, "plan.md", "type: calendar\nfrom: folder:lec").unwrap();
        let mut got: Vec<_> = f.rows.iter().map(|x| (x.title.clone(), x.date.clone())).collect();
        got.sort();
        assert_eq!(got, vec![("a".to_string(), Some("2026-10-01".to_string())), ("b".to_string(), None)]);
        assert!(evaluate(&ws, "plan.md", "from: nowhere").is_err());
        assert_eq!(evaluate(&ws, "plan.md", "from: folder:lec\ndated: true").unwrap().rows.len(), 1);
    }

    #[test]
    fn next_actions_are_the_first_open_task_of_each_matching_note() {
        let d = tempfile::tempdir().unwrap();
        let w = |name: &str, text: &str| std::fs::write(d.path().join(name), text).unwrap();
        w("Paper.md", "---\ntype: project\ndue: 2026-11-01\nup: \"[[Thesis]]\"\n---\n- [x] outline\n- [ ] write intro\n- [ ] figures\n");
        w("Thesis.md", "---\ntype: project\n---\n- [ ] ask for the template 📅 2026-10-20\n");
        w("Later.md", "---\ntype: project\nstart: 2999-01-01\n---\n- [ ] not yet\n");
        w("Done.md", "---\ntype: project\n---\n- [x] all done\n");
        w("note.md", "- [ ] not a project\n");
        // a template is not a note: it says `type: project` and must not be listed as one
        std::fs::create_dir_all(d.path().join("templates")).unwrap();
        w("templates/project.md", "---\ntype: project\n---\n- [ ] {{title}}\n");
        // nor are an agent's own files (docs/memory is out of the index by default)
        std::fs::create_dir_all(d.path().join("docs/memory")).unwrap();
        w("docs/memory/project_x.md", "---\ntype: project\n---\n- [ ] agent memory\n");
        let ws = Workspace::open(d.path()).unwrap();
        let r = evaluate(&ws, "note.md", "type: list\nfrom: next-actions\nfilters: 'type == \"project\"'").unwrap();
        let got: Vec<_> = r.rows.iter().map(|x| (x.title.as_str(), x.date.as_deref(), x.line, x.props["note"].as_str())).collect();
        assert_eq!(
            got,
            vec![("ask for the template", Some("2026-10-20"), Some(4), "Thesis"), ("write intro", Some("2026-11-01"), Some(7), "Paper")],
            "ordered by date; the note's due stands in for an undated task; a later start and a finished note are left out"
        );
        // a tree needs each note's parent: `by` carries the property, a link resolved to its note
        let t = evaluate(&ws, "note.md", "type: tree\nby: up\nfilters: 'type == \"project\"'").unwrap();
        let paper = t.rows.iter().find(|x| x.title == "Paper").unwrap();
        assert_eq!(paper.props.get("up").map(String::as_str), Some("Thesis.md"));
    }
}
