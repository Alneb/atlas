//! Template values from plugins (docs/guides/TEMPLATES.md, "Values from plugins"): a tool declaring
//! `template = "weather"` answers `{{weather.…}}` in a note made from a template — what Templater did with user
//! scripts, without a template ever running code. Asked just before the note is made, only for names it uses.
//! One value is the core's own: `tasks`, the vault's open tasks for the note's day (`tasks_for`).
use crate::api::NewNote;
use crate::helper::Helpers;
use crate::Workspace;
use serde_json::json;

/// `req.values` completed with the values the template reads that plugins provide and nobody gave. A provider that
/// fails is said in the log and its tags stay as written in the note (template.rs never drops what it cannot fill).
pub async fn add_provided(ws: &Workspace, helpers: &Helpers, req: &mut NewNote) {
    let Ok(cfg) = ws.config() else { return };
    let root = ws.root();
    let Some(text) = crate::notes::template_for(root, &cfg, req) else { return };
    let used = crate::template::names_used(&text);
    if used.iter().any(|n| n == "tasks") && !req.values.as_ref().is_some_and(|v| v.contains_key("tasks")) {
        let day = chrono::NaiveDate::parse_from_str(req.title.trim().get(..10).unwrap_or(""), "%Y-%m-%d").unwrap_or_else(|_| chrono::Local::now().date_naive());
        req.values.get_or_insert_with(Default::default).insert("tasks".into(), tasks_for(root, &cfg, day));
    }
    let providers: Vec<_> = crate::plugin_tools::providers(root, &cfg).into_iter().filter(|(_, _, name)| used.contains(name)).collect();
    if providers.is_empty() {
        return;
    }
    let store = crate::secrets::Store::for_vault(root);
    for (plugin, tool, name) in providers {
        if req.values.as_ref().is_some_and(|v| v.contains_key(&name)) {
            continue;
        }
        match crate::plugin_tools::call(root, &cfg, helpers, &store, &plugin, &tool, json!({ "title": req.title })).await {
            Ok(v) => {
                req.values.get_or_insert_with(Default::default).insert(name, v);
            }
            Err(e) => eprintln!("atlas: template value {{{{{name}}}}} from {plugin}/{tool}: {e}"),
        }
    }
}

/// The open tasks for `day`, for a daily template: `due` that day, `overdue` before it, `scheduled` for it — each
/// `{ title, note, due }` (`note`: the file's name, for `{{note | link}}`).
pub fn tasks_for(root: &std::path::Path, cfg: &crate::config::Config, day: chrono::NaiveDate) -> serde_json::Value {
    let (mut due, mut overdue, mut scheduled) = (vec![], vec![], vec![]);
    for hit in crate::today::scan_tasks(root, cfg) {
        let t = crate::tasks::parse(crate::today::parse_task(&hit.text).unwrap_or(&hit.text));
        let note = hit.path.rsplit('/').next().unwrap_or(&hit.path).trim_end_matches(".md").to_string();
        let item = |d: Option<chrono::NaiveDate>| json!({ "title": t.title, "note": note, "due": d.map(|d| d.format("%Y-%m-%d").to_string()) });
        match t.due {
            Some(d) if d == day => due.push(item(t.due)),
            Some(d) if d < day => overdue.push(item(t.due)),
            _ if t.scheduled == Some(day) => scheduled.push(item(t.due)),
            _ => {}
        }
    }
    json!({ "due": due, "overdue": overdue, "scheduled": scheduled })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_daily_template_gets_the_tasks_due_overdue_and_scheduled_that_day() {
        let d = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(d.path().join("notes")).unwrap();
        std::fs::write(d.path().join("notes/phd.md"), "- [ ] submit the abstract 📅 2026-10-20\n- [ ] old report 📅 2026-10-01\n- [ ] read DMFT ⏳ 2026-10-20\n- [x] done 📅 2026-10-20\n- [ ] later 📅 2026-11-01\n").unwrap();
        let day = chrono::NaiveDate::from_ymd_opt(2026, 10, 20).unwrap();
        let v = tasks_for(d.path(), &crate::config::Config::default(), day);
        let titles = |k: &str| v[k].as_array().unwrap().iter().map(|t| t["title"].as_str().unwrap().to_string()).collect::<Vec<_>>();
        assert_eq!(titles("due"), vec!["submit the abstract"]);
        assert_eq!(titles("overdue"), vec!["old report"]);
        assert_eq!(titles("scheduled"), vec!["read DMFT"]);
        assert_eq!(v["due"][0]["note"], "phd");
    }
}
