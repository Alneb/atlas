//! A press on a button of a system notification (a notice's `actions`; DESIGN-calendar-tasks-nudges.md §3.5), and
//! what a plugin's answer says about notices. The platform's notifier (notify.rs: D-Bus, Android) says the press on
//! the bus (`EventBus::chose`); this loop answers it:
//!
//! - the core's own ids (`atlas:…`): Open does what a click does; Snooze puts a planned notice off (planned.rs);
//! - any other id goes to the notice's source plugin, to its tool with `on = "notice"`, called with
//!   `{ notice_id, action, open }` — the same `on` mechanism as `capture`, `fs` or `plan` (plugin_tools.rs);
//! - the person dismissing the notification (`atlas:dismissed`, no button: the platform says it) goes there too, so a
//!   plugin can back off; quietly, as nobody pressed anything: a plugin that does not listen, or fails, is only logged.
//!
//! A plugin's answer here (and a scheduled job's, schedule.rs) may carry `notices: [{ title, … }]`, said as notices
//! from it, and `withdraw: ["id", …]`, the notices taken away (`Event::Withdraw`): [`say`], the one reader of both.
use crate::api::{Event, Notice, NoticeAction};
use crate::events::{Chosen, EventBus};
use crate::helper::Helpers;
use crate::Workspace;
use chrono::{DateTime, Utc};
use serde_json::{json, Value};

/// The `on` event of a tool that answers a notice's buttons.
pub const EVENT: &str = "notice";

/// What a pressed button asks for.
#[derive(Debug, Clone, PartialEq, Eq)]
enum Asked {
    /// The core's Open: the notice's `open`, as a click on it.
    Open,
    /// The core's Snooze of a planned notice, by this many minutes.
    Snooze(u32),
    /// The source plugin's own action.
    Plugin(String),
    /// The person dismissed the notification: told to the source plugin, failures only logged.
    Dismissed,
    /// An `atlas:` id this core does not know (a newer core's, a typo): said in the log.
    Unknown(String),
}

impl Asked {
    fn of(action: &str) -> Self {
        let Some(own) = action.strip_prefix("atlas:") else { return Self::Plugin(action.to_string()) };
        if action == NoticeAction::OPEN {
            return Self::Open;
        }
        if action == NoticeAction::DISMISSED {
            return Self::Dismissed;
        }
        match own.strip_prefix("snooze:").map(str::parse::<u32>) {
            Some(Ok(m)) if m > 0 => Self::Snooze(m),
            _ => Self::Unknown(action.to_string()),
        }
    }
}

/// What a plugin's answer says about notices, said on the bus: its `notices` (each from `source`; one that is not a
/// notice is dropped with a log line) and its `withdraw` ids.
pub fn say(bus: &EventBus, source: &str, answer: &Value) {
    for n in answer.get("notices").and_then(Value::as_array).into_iter().flatten() {
        match serde_json::from_value::<Notice>(n.clone()) {
            Ok(notice) => bus.publish(Event::Notify(notice.source(source))),
            Err(e) => eprintln!("atlas: {source}: an answer's notice is not one ({e}): {n}"),
        }
    }
    for id in answer.get("withdraw").and_then(Value::as_array).into_iter().flatten().filter_map(Value::as_str) {
        bus.publish(Event::Withdraw { id: id.to_string() });
    }
}

/// The subject (`Notice.subject`) of the task with this block id in the note at `path`: what a notice about that task
/// carries, and what ticking it done withdraws.
pub fn task_subject(path: &str, block: &str) -> String {
    format!("{path}#^{}", block.trim_start_matches('^'))
}

/// The task on `line` of the note at `path` was ticked done: every notice about it is withdrawn (its reminders, its
/// nudges), on the system, in the tray and on the pages. A task with no block id has no subject: nothing to withdraw.
/// Whether a withdrawal was said.
pub fn task_done(bus: &EventBus, path: &str, line: &str) -> bool {
    let Some(block) = crate::tasks::split_block(line).1 else { return false };
    bus.publish(Event::Withdraw { id: task_subject(path, block) });
    true
}

/// Answers one press, at `now`.
pub async fn answer(ws: &Workspace, bus: &EventBus, helpers: &Helpers, c: Chosen, now: DateTime<Utc>) {
    match Asked::of(&c.action) {
        Asked::Open => crate::notify::open_notice(bus, c.open),
        Asked::Snooze(minutes) => {
            let (Some(plugin), Some(id)) = (c.source.as_deref(), c.notice.as_deref()) else {
                return eprintln!("atlas: Snooze pressed on a notice with no source or id: nothing to put off");
            };
            if !crate::planned::snooze(&ws.cache_dir(), plugin, id, now + chrono::Duration::minutes(minutes.into())) {
                eprintln!("atlas: {plugin}: Snooze pressed on {id}, which no plan lists any more");
            }
        }
        Asked::Plugin(action) => to_plugin(ws, bus, helpers, &c, &action, true).await,
        Asked::Dismissed => to_plugin(ws, bus, helpers, &c, NoticeAction::DISMISSED, false).await,
        Asked::Unknown(action) => eprintln!("atlas: a notice's button `{action}` is none this core knows"),
    }
}

/// The source plugin's `on = "notice"` tool answers it. `pressed`: a person pressed a button, so a plugin that cannot
/// answer is logged and its failure is a notice from it; a dismissal (not pressed) is quiet — most plugins ignore it.
async fn to_plugin(ws: &Workspace, bus: &EventBus, helpers: &Helpers, c: &Chosen, action: &str, pressed: bool) {
    let Ok(cfg) = ws.config() else { return };
    let Some(plugin) = c.source.as_deref() else {
        if pressed {
            eprintln!("atlas: `{action}` pressed on a notice with no source: nobody to answer it");
        }
        return;
    };
    let tools = crate::plugin_tools::listening(ws.root(), &cfg, EVENT);
    let Some((_, tool)) = tools.iter().find(|(p, _)| p == plugin) else {
        if pressed {
            eprintln!("atlas: {plugin}: `{action}` pressed, but it has no tool with on = \"{EVENT}\" here");
        }
        return;
    };
    let store = crate::secrets::Store::for_vault(ws.root());
    let input = json!({ "notice_id": c.notice, "action": action, "open": c.open });
    match crate::plugin_tools::call(ws.root(), &cfg, helpers, &store, plugin, tool, input).await {
        Ok(v) => say(bus, plugin, &v),
        Err(e) if !pressed => eprintln!("atlas: {plugin}: a dismissal was not taken: {e}"),
        Err(e) => bus.publish(Event::Notify(Notice::new(format!("{plugin}: “{action}” failed")).body(e.to_string()).source(plugin).level(crate::api::NoticeLevel::Failure))),
    }
}

/// Follows the presses for as long as the vault is served (beside notify::spawn: only where notices reach a person).
pub fn spawn(ws: Workspace, bus: EventBus, helpers: Helpers) -> tokio::task::JoinHandle<()> {
    let mut rx = bus.on_chosen();
    tokio::spawn(async move {
        loop {
            match rx.recv().await {
                Ok(c) => answer(&ws, &bus, &helpers, c, Utc::now()).await,
                Err(tokio::sync::broadcast::error::RecvError::Lagged(_)) => continue,
                Err(_) => return,
            }
        }
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::events::ToSystem;

    #[test]
    fn a_task_ticked_done_withdraws_the_notices_about_it() {
        let bus = EventBus::default();
        let mut events = bus.subscribe();
        assert!(task_done(&bus, "notes/Report.md", "- [ ] Send the report 📅 2026-11-20 ^t3f9a"));
        assert_eq!(events.try_recv().unwrap(), Event::Withdraw { id: "notes/Report.md#^t3f9a".into() });
        assert_eq!(task_subject("notes/Report.md", "^t3f9a"), "notes/Report.md#^t3f9a", "a block id given with its caret");
        assert!(!task_done(&bus, "notes/Report.md", "- [ ] No id here"), "no block id: no subject");
        assert!(events.try_recv().is_err());
    }

    #[test]
    fn the_cores_own_ids_are_told_from_a_plugins() {
        assert_eq!(Asked::of("atlas:open"), Asked::Open);
        assert_eq!(Asked::of(NoticeAction::DISMISSED), Asked::Dismissed);
        assert_eq!(Asked::of(&NoticeAction::snooze(10).id), Asked::Snooze(10));
        assert_eq!(Asked::of("done"), Asked::Plugin("done".into()));
        assert_eq!(Asked::of("snooze:10"), Asked::Plugin("snooze:10".into()), "a plugin's own snooze is its own");
        assert_eq!(Asked::of("atlas:snooze:0"), Asked::Unknown("atlas:snooze:0".into()));
        assert_eq!(Asked::of("atlas:later"), Asked::Unknown("atlas:later".into()));
    }

    /// A vault whose plugin `plan` answers a press with what its helper (JavaScript, in the core) makes of it.
    fn vault(helper: &str) -> (tempfile::TempDir, Workspace, Helpers, EventBus) {
        let d = tempfile::tempdir().unwrap();
        let p = d.path().join(".atlas/plugins/plan");
        std::fs::create_dir_all(&p).unwrap();
        std::fs::write(p.join("plugin.toml"), "title = \"Plan\"\n[helper]\njs = \"helper.js\"\n[[tool]]\nname = \"pressed\"\ndescription = \"a notice's button\"\non = \"notice\"\n").unwrap();
        std::fs::write(p.join("helper.js"), helper).unwrap();
        let ws = Workspace::open(d.path()).unwrap();
        let bus = EventBus::default();
        let helpers = Helpers::new(d.path(), bus.clone());
        (d, ws, helpers, bus)
    }

    fn pressed(action: &str, source: &str) -> Chosen {
        Chosen { action: action.into(), source: Some(source.into()), notice: Some("plan:t1".into()), open: Some("notes/Report.md".into()) }
    }

    #[tokio::test]
    async fn a_press_reaches_the_source_plugins_notice_tool_and_its_answer_is_said() {
        // the helper answers with what it was given, as a notice, and withdraws the notice pressed
        let (_d, ws, helpers, bus) = vault(
            "atlas.method(\"pressed\", (a) => ({ notices: [{ title: `${a.action} on ${a.notice_id}`, body: a.open }, { nope: 1 }], withdraw: [a.notice_id] }));\n",
        );
        let (mut events, mut system) = (bus.subscribe(), bus.on_notice());
        answer(&ws, &bus, &helpers, pressed("done", "plan"), Utc::now()).await;
        let Ok(Event::Notify(n)) = events.try_recv() else { panic!("the plugin's notice") };
        assert_eq!((n.title.as_str(), n.body.as_deref(), n.source.as_deref()), ("done on plan:t1", Some("notes/Report.md"), Some("plan")));
        assert_eq!(events.try_recv().unwrap(), Event::Withdraw { id: "plan:t1".into() }, "a malformed notice dropped; the withdrawal said");
        assert!(matches!(system.try_recv().unwrap(), ToSystem::Show(_)));
        assert_eq!(system.try_recv().unwrap(), ToSystem::Withdraw("plan:t1".into()), "the system's notification taken away");

        // another plugin's notice: not this tool's to answer
        answer(&ws, &bus, &helpers, pressed("done", "mail"), Utc::now()).await;
        assert!(events.try_recv().is_err());

        // a dismissal reaches it the same way, as `atlas:dismissed`
        answer(&ws, &bus, &helpers, pressed(NoticeAction::DISMISSED, "plan"), Utc::now()).await;
        let Ok(Event::Notify(n)) = events.try_recv() else { panic!("the plugin heard the dismissal") };
        assert_eq!(n.title, "atlas:dismissed on plan:t1");
    }

    #[tokio::test]
    async fn a_failing_notice_tool_is_said_and_the_cores_own_open_never_reaches_the_plugin() {
        let (_d, ws, helpers, bus) = vault("atlas.method(\"pressed\", () => { throw new atlas.AtlasError(\"no such task\"); });\n");
        let mut events = bus.subscribe();
        answer(&ws, &bus, &helpers, pressed("done", "plan"), Utc::now()).await;
        let Ok(Event::Notify(n)) = events.try_recv() else { panic!("the failure said") };
        assert_eq!((n.title.as_str(), n.level), ("plan: “done” failed", Some(crate::api::NoticeLevel::Failure)));
        answer(&ws, &bus, &helpers, pressed(NoticeAction::OPEN, "plan"), Utc::now()).await;
        assert_eq!(events.try_recv().unwrap(), Event::Open { path: "notes/Report.md".into(), line: None }, "Open opens, as a click does");
        answer(&ws, &bus, &helpers, pressed(NoticeAction::DISMISSED, "plan"), Utc::now()).await;
        assert!(events.try_recv().is_err(), "a dismissal the plugin fails to take is only logged: nobody pressed anything");
    }
}
