//! The Plan plugin (plugins/beta/plan) in a real core: its JavaScript helper run by QuickJS, its calls to the core's
//! `GET /api/tasks`, `GET /api/device`, `POST /api/task/tick` and `POST /api/task/block`, its ledger written as a note.
//! Done is never nudged: a task ticked from the nudge's Done (the core's one tick path) and a recurring task's ticked
//! occurrence drop out of the plan. The planner's own rules are tested in the plugin (helper/*.test.ts).
#![allow(clippy::disallowed_methods)] // a test writes its fixtures directly
use serde_json::{json, Value};
use std::path::Path;

/// 2026-11-16 at a local time in UTC+1, as ms.
fn at(h: u32, m: u32) -> i64 {
    chrono::NaiveDate::from_ymd_opt(2026, 11, 16).unwrap().and_hms_opt(h, m, 0).unwrap().and_utc().timestamp_millis() - 3_600_000
}

fn vault(root: &Path) {
    let repo = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../plugins/beta/plan");
    let plugin = root.join(".atlas/plugins/plan");
    std::fs::create_dir_all(&plugin).unwrap();
    for f in ["plugin.toml", "helper.js"] {
        std::fs::copy(repo.join(f), plugin.join(f)).unwrap();
    }
    std::fs::create_dir_all(root.join("notes")).unwrap();
    std::fs::write(
        root.join("notes/Thesis.md"),
        "# Thesis\n- [ ] Write the introduction ⏫ 📅 2026-11-17 ^t3f9a\n- [ ] Water the plants 🔁 every week 📅 2026-11-16 ^tw4t\n- [ ] Call the bank 📅 2026-11-20\n",
    )
    .unwrap();
}

struct Core {
    base: String,
    http: reqwest::Client,
}

impl Core {
    async fn call(&self, verb: reqwest::Method, path: &str, body: Option<Value>) -> Value {
        let mut r = self.http.request(verb, format!("{}{path}", self.base)).header("x-atlas", "1");
        if let Some(b) = body {
            r = r.json(&b);
        }
        let r = r.send().await.unwrap();
        let status = r.status();
        let v = r.json().await.unwrap_or(Value::Null);
        assert!(status.is_success(), "{path}: {status} {v}");
        v
    }
    async fn tool(&self, name: &str, args: Value) -> Value {
        self.call(reqwest::Method::POST, &format!("/api/plugins/plan/tools/{name}"), Some(args)).await
    }
}

fn ids_at(plan: &Value) -> Vec<(String, String)> {
    plan["planned"].as_array().unwrap().iter().map(|p| (p["id"].as_str().unwrap().to_string(), p["at"].as_str().unwrap().to_string())).collect()
}

#[tokio::test(flavor = "multi_thread")]
async fn nudges_are_planned_recorded_and_done_is_never_nudged() {
    // no background loops: this test asks the plan itself, at its own clock
    std::env::set_var("ATLAS_NO_SCHEDULE", "1");
    std::env::set_var("ATLAS_NO_NOTIFY", "1");
    std::env::set_var("ATLAS_NO_BROWSER", "1");
    let dir = tempfile::tempdir().unwrap();
    vault(dir.path());
    let handle = atlas_core::serve(dir.path().to_path_buf(), 0).await.unwrap();
    let core = Core { base: format!("http://127.0.0.1:{}", handle.port()), http: reqwest::Client::new() };
    let clock = |h, m| json!({ "now": at(h, m), "offset": 60, "settings": { "digest": false } });

    // the core's pieces the plugin reads
    let tasks = core.call(reqwest::Method::GET, "/api/tasks", None).await;
    assert_eq!(tasks["tasks"][0]["priority"], "high");
    assert_eq!(tasks["tasks"][0]["block"], "t3f9a");
    assert_eq!(core.call(reqwest::Method::GET, "/api/device", None).await["schedules"], true, "no schedules_on: every computer");

    // 10:00: the two important tasks are due now (recorded), the bank waits for its gap
    let plan = core.tool("nudges", clock(10, 0)).await;
    let now = ids_at(&plan);
    assert!(now.contains(&("plan:notes/Thesis.md#^t3f9a".into(), "2026-11-16T10:00:00+01:00".into())), "{plan}");
    assert!(now.contains(&("plan:notes/Thesis.md#^tw4t".into(), "2026-11-16T10:00:00+01:00".into())), "{plan}");
    // what the core's planned notices make of the answer: every one taken, with its buttons and subject
    let cache = dir.path().join(".atlas/cache");
    atlas_core::planned::take(&cache, "plan", &plan);
    let kept = atlas_core::planned::plans(&cache).remove("plan").unwrap_or_default();
    assert_eq!(kept.len(), plan["planned"].as_array().unwrap().len(), "{plan}");
    let intro = kept.iter().find(|p| p.notice.id.as_deref() == Some("plan:notes/Thesis.md#^t3f9a")).unwrap();
    assert_eq!(intro.notice.subject.as_deref(), Some("notes/Thesis.md#^t3f9a"));
    assert_eq!(intro.notice.actions.iter().map(|a| a.id.as_str()).collect::<Vec<_>>(), ["done", "snooze:2026-11-16T11:00", "atlas:open"]);
    let ledger = dir.path().join(format!("plan/ledger/2026-11 {}.md", atlas_core::platform::proc::hostname()));
    let text = std::fs::read_to_string(&ledger).unwrap();
    assert!(text.starts_with("---\ntype: plan-ledger\n"), "{text}");
    assert_eq!(text.matches("· nudged ·").count(), 2, "{text}");

    // Done on both, as the notification's button: ticked by the core (a recurring one leaves its next occurrence)
    for id in ["plan:notes/Thesis.md#^t3f9a", "plan:notes/Thesis.md#^tw4t"] {
        let r = core.tool("pressed", json!({ "notice_id": id, "action": "done", "now": at(10, 2), "offset": 60 })).await;
        assert_eq!(r["withdraw"], json!([id]));
    }
    let note = std::fs::read_to_string(dir.path().join("notes/Thesis.md")).unwrap();
    assert!(note.contains("- [x] Write the introduction ⏫ 📅 2026-11-17 ✅"), "{note}");
    assert!(note.contains("- [ ] Water the plants 🔁 every week 📅 2026-11-23\n- [x] Water the plants 🔁 every week 📅 2026-11-16"), "{note}");

    // 10:05: neither ticked task is in the plan (the core withdraws what drops out); the next occurrence waits for
    // another window; nothing new nudged now
    let plan = core.tool("nudges", clock(10, 5)).await;
    let ids = ids_at(&plan);
    assert!(!ids.iter().any(|(id, _)| id.ends_with("^t3f9a") || id.ends_with("^tw4t")), "{plan}");
    let next = ids.iter().find(|(id, _)| id == "plan:notes/Thesis.md|Water the plants").expect("the next occurrence is a task of its own");
    assert!(next.1.as_str() >= "2026-11-16T12:00", "not in the morning its ticked one was nudged in: {plan}");
    let text = std::fs::read_to_string(&ledger).unwrap();
    assert_eq!(text.matches("· done ·").count(), 2, "{text}");
    assert_eq!(text.matches("· nudged ·").count(), 2, "nothing nudged again: {text}");

    // Snooze on a task with no id: the core gives it one, and the plan keeps the promise
    let r = core.tool("pressed", json!({ "notice_id": "plan:notes/Thesis.md|Call the bank", "action": "snooze:2026-11-16T16:30", "now": at(10, 6), "offset": 60 })).await;
    assert_eq!(r["withdraw"], json!(["plan:notes/Thesis.md|Call the bank"]));
    let note = std::fs::read_to_string(dir.path().join("notes/Thesis.md")).unwrap();
    let id = note.lines().find(|l| l.contains("Call the bank")).and_then(|l| l.rsplit_once(" ^")).map(|(_, id)| id.to_string()).expect("an id");
    let plan = core.tool("nudges", clock(10, 10)).await;
    assert!(ids_at(&plan).contains(&(format!("plan:notes/Thesis.md#^{id}"), "2026-11-16T16:30:00+01:00".into())), "{plan}");

    handle.shutdown().await.unwrap();
}
