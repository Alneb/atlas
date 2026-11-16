//! View blocks (docs/guides/MALLEABLE.md, R4 — Embark's views over the surrounding document): a fenced
//! ```` ```view ```` block in a note holds YAML, and this turns it into rows for a registered view
//! (calendar, list, table…, drawn by `ui/src/lib/views.ts`, which Lua widgets share):
//! ```yaml
//! type: calendar        # any registered view
//! from: section         # section (default) | note | tasks | next-actions | deadlines | folder:<dir> | base:<file.base> | plugin:<id>/<tool>
//! args: {days: 60}      # plugin: only — the tool's input
//! filters: ...          # Bases filters, for notes (folder:/base:/next-actions/or alone)
//! date: due             # the property holding a note's date (default: date)
//! dated: true           # only items with a date (a calendar beside a task list)
//! by: up                # tree view: the property that names a note's parent
//! columns: [state]      # more properties to carry in each row's `props`
//! ```
//! `deadlines` is everything that must be done by a day (docs/design/DESIGN-calendar-tasks-nudges.md §2.4): open tasks
//! with 📅 (⏳ too with `scheduled: true`), notes with a `due:` that are not done (never mail), and the events of the
//! calendar plugin's deadline calendars — each row with `props.from` (task / note / event), `props.days` (from today)
//! and `props.group` (Overdue · Today · This week · Later), in date order; `horizon: 30` drops what is further away.
//! Home's `deadlines` box, the Deadlines page and the Today chips all read it.
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
    /// `from: deadlines`: a task's ⏳ counts as its deadline when it has no 📅.
    #[serde(default)]
    scheduled: bool,
    /// `from: deadlines`: only what falls within this many days (overdue always shows).
    #[serde(default)]
    horizon: Option<i64>,
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
    /// What must be done by a day: dated tasks, notes with `due:`, deadline calendars' events.
    Deadlines,
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
        Some("deadlines") => From::Deadlines,
        Some(x) if x.starts_with("folder:") => From::Folder(x["folder:".len()..].trim().trim_matches('/')),
        Some(x) if x.starts_with("base:") => From::Base(x["base:".len()..].trim()),
        Some(x) if x.starts_with("plugin:") => match x["plugin:".len()..].trim().split_once('/') {
            Some((plugin, tool)) if !plugin.is_empty() && !tool.is_empty() => From::Plugin { plugin, tool },
            _ => return Err(Error::BadRequest(format!("view: `from: {x}` names no tool (plugin:<id>/<tool>, e.g. plugin:dav/events)"))),
        },
        Some(x) => return Err(Error::BadRequest(format!("view: unknown `from: {x}` (section, note, tasks, next-actions, deadlines, folder:…, base:…, plugin:…/…)"))),
    })
}

/// Every checkbox of `lines` (open and done), outside code fences.
fn tasks_in(path: &str, lines: &[&str], first_line: u32) -> Vec<ViewRow> {
    today::task_lines(lines.iter().copied()).map(|(i, text, done)| task_row(path, first_line + i as u32, text, done)).collect()
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
/// heading of the same or a higher level; the whole note when `at` is above every heading. Headings inside code fences
/// (a shell `# comment`) are not.
fn section_range(lines: &[&str], at: usize) -> (usize, usize) {
    let mut fences = atlas_text::fence::Fences::default();
    let heads: Vec<Option<usize>> = lines
        .iter()
        .map(|l| {
            let code = fences.code(l);
            let n = l.chars().take_while(|&c| c == '#').count();
            (!code && n > 0 && n <= 6 && l[n..].starts_with(' ')).then_some(n)
        })
        .collect();
    let level = |i: usize| heads[i];
    if lines.is_empty() {
        return (0, 0);
    }
    let Some((start, lv)) = (0..=at.min(lines.len().saturating_sub(1))).rev().find_map(|i| level(i).map(|n| (i, n)))
    else {
        return (0, lines.len());
    };
    let end = (start + 1..lines.len()).find(|&i| level(i).is_some_and(|n| n <= lv)).unwrap_or(lines.len());
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
            ViewRow { path: Some(row.path), line: None, title, date: date.filter(|d| crate::tasks::first_date(d).is_some()), done: None, props }
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

// ----- deadlines (`from: deadlines`)

/// The group a deadline `days` from today falls in.
fn deadline_group(days: i64) -> &'static str {
    match days {
        ..0 => "Overdue",
        0 => "Today",
        1..=7 => "This week",
        _ => "Later",
    }
}

/// Open tasks whose line gives a deadline: its 📅, else (with `scheduled`) its ⏳. The row's date is that day.
fn deadline_tasks(ws: &Workspace, scheduled: bool) -> Result<Vec<ViewRow>> {
    let cfg = ws.config()?;
    Ok(today::all_tasks(ws.root(), &cfg)
        .into_iter()
        .filter(|(_, done)| !done)
        .filter_map(|(h, _)| {
            let t = crate::tasks::parse(&h.text);
            let day = t.due.or(t.scheduled.filter(|_| scheduled))?;
            let mut r = task_row(&h.path, h.line, &h.text, false);
            r.date = Some(day.format("%Y-%m-%d").to_string());
            r.props.insert("from".into(), "task".into());
            Some(r)
        })
        .collect())
}

/// Notes with a `due:` that are not done (`done: true`, `status: done | cancelled`), never kept mail — the
/// convention the Calendar's important notes and `next-actions` read, without needing `important: true`.
fn deadline_notes(ws: &Workspace, note: &str) -> Result<Vec<ViewRow>> {
    let has_due = serde_yaml::Value::String("!due.isEmpty()".into());
    let cols = ["due", "done", "status", "type", "message_id", "priority"];
    let finished = |p: &BTreeMap<String, String>| {
        p.get("done").is_some_and(|d| d.eq_ignore_ascii_case("true"))
            || p.get("status").is_some_and(|s| ["done", "cancelled", "canceled"].iter().any(|x| s.trim().eq_ignore_ascii_case(x)))
    };
    Ok(notes(ws, note, notes_query("", Some(&has_due), &cols), "due")?
        .into_iter()
        .filter(|r| r.date.is_some() && !finished(&r.props))
        .filter(|r| !crate::note_props::is_mail(r.props.get("type").map(String::as_str), |k| r.props.contains_key(k)))
        .map(|mut r| {
            r.props.insert("from".into(), "note".into());
            r
        })
        .collect())
}

/// The vault's own deadlines: dated tasks and notes.
fn deadline_files(ws: &Workspace, note: &str, scheduled: bool) -> Result<Vec<ViewRow>> {
    let mut rows = deadline_tasks(ws, scheduled)?;
    rows.extend(deadline_notes(ws, note)?);
    Ok(rows)
}

/// Deadlines as the view shows them: each with its distance (`days`) and `group`, ordered by day, then priority
/// (highest first), then title; beyond `horizon` days left out; an event made from a note (the Calendar's important
/// notes) only once, as the note.
fn deadlines(rows: Vec<ViewRow>, today: chrono::NaiveDate, horizon: Option<i64>) -> Vec<ViewRow> {
    let notes: Vec<(String, String)> = rows.iter().filter(|r| r.props.get("from").is_some_and(|f| f == "note")).filter_map(|r| Some((r.path.clone()?, r.date.clone()?))).collect();
    let twin = |r: &ViewRow| r.props.get("from").is_some_and(|f| f == "event") && notes.iter().any(|(p, d)| r.path.as_ref() == Some(p) && r.date.as_ref() == Some(d));
    let rank = |r: &ViewRow| r.props.get("priority").and_then(|p| crate::tasks::Priority::from_name(p)).unwrap_or(crate::tasks::Priority::Normal);
    let mut out: Vec<(i64, ViewRow)> = rows
        .into_iter()
        .filter(|r| !twin(r))
        .filter_map(|mut r| {
            let day = chrono::NaiveDate::parse_from_str(r.date.as_deref()?.get(..10)?, "%Y-%m-%d").ok()?;
            let days = (day - today).num_days();
            if horizon.is_some_and(|h| days > h) {
                return None;
            }
            r.props.insert("days".into(), days.to_string());
            r.props.insert("group".into(), deadline_group(days).into());
            Some((days, r))
        })
        .collect();
    out.sort_by(|(da, a), (db, b)| da.cmp(db).then(rank(b).cmp(&rank(a))).then_with(|| a.title.cmp(&b.title)));
    out.into_iter().map(|(_, r)| r).collect()
}

/// The calendar plugin's deadline events (the plugin that `provides = ["calendar"]` and has a `deadlines` tool) as
/// rows; none when no such plugin runs. A failing tool is said on stderr and leaves the files' deadlines standing.
async fn deadline_events(ws: &Workspace, helpers: &crate::helper::Helpers) -> Vec<ViewRow> {
    let root = ws.root().to_path_buf();
    let Ok(cfg) = ws.config() else { return Vec::new() };
    let off = cfg.plugins.off.clone();
    let found = tokio::task::spawn_blocking(move || {
        let all = crate::plugins::list(&root);
        let id = crate::plugins::provider(&all, &off, "calendar")?.id.clone();
        let has = crate::plugins::tool_parts(&root, &id).ok()?.0.iter().any(|t| t.name == "deadlines");
        has.then_some(id)
    })
    .await
    .ok()
    .flatten();
    let Some(id) = found else { return Vec::new() };
    let store = crate::secrets::Store::for_vault(ws.root());
    match crate::plugin_tools::call(ws.root(), &cfg, helpers, &store, &id, "deadlines", serde_json::json!({})).await {
        Ok(answer) => plugin_rows(&answer)
            .into_iter()
            .map(|mut r| {
                r.props.insert("from".into(), "event".into());
                r
            })
            .collect(),
        Err(e) => {
            eprintln!("atlas: deadlines: {id} · deadlines: {e}; the vault's own deadlines stand");
            Vec::new()
        }
    }
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
        // the files' deadlines only: the server adds the calendar's (views::from_plugin)
        From::Deadlines => deadlines(deadline_files(ws, note, spec.scheduled)?, chrono::Local::now().date_naive(), spec.horizon),
        From::Plugin { .. } => return Err(Error::BadRequest("view: a plugin's rows are asked through the server (views::from_plugin)".into())),
    };
    finish(spec, rows)
}

/// The rows of a view block whose source calls a plugin's tool — `from: plugin:<id>/<tool>`, and `from: deadlines`
/// (the calendar's deadline events beside the files') — or None for any other block, which [`evaluate`] reads.
/// The tool is called like any (its permissions and secrets), with `args:` as its input.
pub async fn from_plugin(ws: &Workspace, helpers: &crate::helper::Helpers, note: &str, src: &str) -> Option<Result<ViewResult>> {
    let spec: Spec = serde_yaml::from_str(src).ok()?;
    let (plugin, tool) = match parse_from(spec.from.as_deref(), spec.filters.is_some()) {
        Ok(From::Plugin { plugin, tool }) => (plugin.to_string(), tool.to_string()),
        Ok(From::Deadlines) => {
            let (w, n, scheduled) = (ws.clone(), note.to_string(), spec.scheduled);
            let files = tokio::task::spawn_blocking(move || deadline_files(&w, &n, scheduled)).await;
            let mut rows = match files {
                Ok(Ok(rows)) => rows,
                Ok(Err(e)) => return Some(Err(e)),
                Err(e) => return Some(Err(Error::Other(anyhow::anyhow!("deadlines: {e}")))),
            };
            rows.extend(deadline_events(ws, helpers).await);
            let rows = deadlines(rows, chrono::Local::now().date_naive(), spec.horizon);
            return Some(finish(spec, rows));
        }
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

/// A tool's answer as rows, by its shape: an array of objects, or an object's array — `items`, `rows` or `events` when it
/// has one, else its longest array (`{calendars: [2], events: [40]}` rows the events). A
/// row's title is its `title`, `summary` or `name`; its date the first ten characters of `date`, `start` or `due`
/// (`2026-10-22T10:00` → the day); its `path` (or a `source` that is a note) opens it; every other plain field is a prop.
fn plugin_rows(v: &serde_json::Value) -> Vec<ViewRow> {
    use serde_json::Value;
    let items = match v {
        Value::Array(a) => a.as_slice(),
        Value::Object(o) => ["items", "rows", "events"]
            .iter()
            .find_map(|k| o.get(*k).and_then(Value::as_array))
            .or_else(|| o.values().filter_map(Value::as_array).max_by_key(|a| a.len()))
            .map_or(&[][..], Vec::as_slice),
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
        let date = first(&["date", "start", "due"]).and_then(|d| d.get(..10).filter(|d| crate::tasks::first_date(d).is_some()).map(str::to_string));
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
    let mut rows = if spec.dated { rows.into_iter().filter(|r| r.date.is_some()).collect() } else { rows };
    // deadlines are not asked a task block's questions (their rows are notes and events too), but keep its `limit`
    if matches!(parse_from(spec.from.as_deref(), spec.filters.is_some())?, From::Deadlines) {
        rows.truncate(spec.tasks.limit.unwrap_or(usize::MAX));
    }
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
        // several arrays: the named one, else the longest — never whichever key sorts first
        let two = serde_json::json!({ "calendars": [{ "name": "A" }, { "name": "B" }], "events": [{ "summary": "Exam" }] });
        assert_eq!(plugin_rows(&two)[0].title, "Exam");
        let unnamed = serde_json::json!({ "a": [{ "name": "x" }], "b": [{ "name": "y" }, { "name": "z" }] });
        assert_eq!(plugin_rows(&unnamed).len(), 2);
        // A file-reading evaluation never calls a tool.
        let d = tempfile::tempdir().unwrap();
        assert!(matches!(evaluate(&Workspace::open(d.path()).unwrap(), "x.md", "from: plugin:dav/events"), Err(Error::BadRequest(_))));
    }

    #[test]
    fn deadlines_are_dated_tasks_and_notes_grouped_by_how_far_mail_and_done_notes_left_out() {
        let d = tempfile::tempdir().unwrap();
        let today = chrono::Local::now().date_naive();
        let day = |n: i64| (today + chrono::Duration::days(n)).format("%Y-%m-%d").to_string();
        let w = |name: &str, text: String| {
            if let Some((dir, _)) = name.rsplit_once('/') {
                std::fs::create_dir_all(d.path().join(dir)).unwrap();
            }
            std::fs::write(d.path().join(name), text).unwrap();
        };
        w(
            "plan.md",
            format!(
                "- [ ] late report 📅 {}\n- [ ] call the bank ⏫ 📅 {}\n- [ ] buy stamps 📅 {}\n- [ ] book flights 📅 {}\n- [ ] far away 📅 {}\n- [x] already sent 📅 {}\n- [ ] only scheduled ⏳ {}\n- [ ] no date\n",
                day(-2), day(0), day(0), day(3), day(40), day(1), day(2)
            ),
        );
        w("Grant.md", format!("---\ndue: {}\n---\n# Grant\n", day(5)));
        w("Thesis.md", format!("---\ndue: {}\nstatus: Done\n---\n", day(1)));
        w("Talk.md", format!("---\ndue: {}\ndone: true\n---\n", day(1)));
        w("Dropped.md", format!("---\ndue: {}\nstatus: cancelled\n---\n", day(1)));
        w("mail/uni/Inbox/2026-11-01 Rapport.md", format!("---\ntype: email\nmessage_id: \"<a@uni.example.org>\"\ndue: {}\n---\n", day(1)));
        w("mail/uni/Inbox/2026-11-02 Other.md", format!("---\nmessage_id: \"<b@uni.example.org>\"\ndue: {}\n---\n", day(1)));
        let ws = Workspace::open(d.path()).unwrap();
        let r = evaluate(&ws, "Home.page", "type: task-list\nfrom: deadlines").unwrap();
        assert_eq!(r.kind, "task-list");
        let got: Vec<_> = r.rows.iter().map(|x| (x.title.as_str(), x.props["group"].as_str(), x.props["from"].as_str())).collect();
        assert_eq!(
            got,
            vec![
                ("late report", "Overdue", "task"),
                ("call the bank", "Today", "task"),
                ("buy stamps", "Today", "task"),
                ("book flights", "This week", "task"),
                ("Grant", "This week", "note"),
                ("far away", "Later", "task"),
            ],
            "by day, the higher priority first within a day; done tasks, done or cancelled notes and mail left out"
        );
        assert_eq!(r.rows[0].props["days"], "-2");
        assert_eq!((r.rows[1].line, r.rows[1].done), (Some(2), Some(false)), "a task row can be ticked");
        assert_eq!((r.rows[4].path.as_deref(), r.rows[4].line, r.rows[4].date.clone()), (Some("Grant.md"), None, Some(day(5))));
        // ⏳ counts when asked; `horizon` keeps the near ones (overdue always), `limit` the first
        let s = evaluate(&ws, "Home.page", "type: task-list\nfrom: deadlines\nscheduled: true\nhorizon: 7").unwrap();
        let titles: Vec<_> = s.rows.iter().map(|x| x.title.as_str()).collect();
        assert_eq!(titles, ["late report", "call the bank", "buy stamps", "only scheduled", "book flights", "Grant"]);
        assert_eq!(evaluate(&ws, "Home.page", "from: deadlines\nlimit: 2").unwrap().rows.len(), 2);
    }

    #[test]
    fn a_deadline_event_made_from_a_note_shows_once_as_the_note() {
        let today = chrono::NaiveDate::from_ymd_opt(2026, 11, 16).unwrap();
        let row = |title: &str, from: &str, path: Option<&str>, date: &str| ViewRow {
            path: path.map(str::to_string),
            line: None,
            title: title.into(),
            date: Some(date.into()),
            done: None,
            props: BTreeMap::from([("from".to_string(), from.to_string())]),
        };
        let rows = vec![
            row("Grant", "note", Some("Grant.md"), "2026-11-20"),
            row("Grant", "event", Some("Grant.md"), "2026-11-20"),
            row("Exam", "event", None, "2026-11-16"),
            row("Moved", "event", Some("Grant.md"), "2026-12-01"),
        ];
        let got: Vec<_> = deadlines(rows, today, None).into_iter().map(|r| (r.title, r.props["from"].clone(), r.props["group"].clone())).collect();
        assert_eq!(
            got,
            vec![("Exam".into(), "event".into(), "Today".into()), ("Grant".into(), "note".into(), "This week".into()), ("Moved".into(), "event".into(), "Later".into())]
        );
    }

    #[test]
    fn a_fenced_comment_is_not_a_section_heading() {
        let lines = ["# A", "- [ ] one", "```sh", "# not a heading", "```", "- [ ] two", "```view", "```", "# B"];
        assert_eq!(section_range(&lines, 6), (0, 8));
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
