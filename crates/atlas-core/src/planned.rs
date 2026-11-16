//! Planned notices: notices a plugin wants shown at a later moment, such as a calendar event's reminder
//! (docs/guides/PLUGIN-API.md, "Planned notices"). A plugin's tool with `on = "plan"` answers
//! `planned: [{ at, until?, title, body?, level?, open?, id }]`; the answer replaces that plugin's whole plan, so an
//! event deleted since simply drops out. This loop asks every few minutes, fires each planned notice once when its
//! moment comes, as an ordinary `Event::Notify` (notify.rs: the page's toast, the desktop's or the phone's
//! notification), and asks the plugin again just before firing, so an event moved a minute ago rings at its new time,
//! not at the old one.
//!
//! What fired is kept by id and moment in `.atlas/cache/planned-fired.json`, the plan in `planned.json`: this device's
//! runtime state (every device rings for itself, as calendar apps do), so a cache file kept out of sync rather than a
//! note. A restart never fires one twice; a moved event's reminder, at a new moment, rings again.
//!
//! A planned notice that names no buttons gets Open (when it has a note to open) and Snooze 10 min
//! (`NoticeAction::snooze`, answered by [`snooze`] through notice_actions.rs): the snoozed copy is kept in
//! `planned-snoozed.json` and rings at its new moment, as long as the plugin's plan still lists the notice.
//!
//! It runs on a core that shows notices to a person (the desktop's own, the phone's), not on a headless server, and
//! not under `ATLAS_NO_SCHEDULE` (a test's or a probe's core).
use crate::api::{Event, Notice, NoticeAction};
use crate::events::EventBus;
use crate::{vault_write, Workspace};
use chrono::{DateTime, Duration, FixedOffset, Utc};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::{BTreeMap, BTreeSet};
use std::path::Path;

/// The `on` event of a tool that plans notices.
pub const EVENT: &str = "plan";

/// How often the plans are asked for: a change made elsewhere (another device, the server) reaches the plan within
/// this; one made here is caught by the ask just before firing anyway.
const ASK_EVERY: std::time::Duration = std::time::Duration::from_secs(300);

/// How often the loop looks for a due notice: a reminder rings at most this late.
const TICK: std::time::Duration = std::time::Duration::from_secs(15);

/// How long after its moment a planned notice still fires when it says no `until` (Atlas started late).
const GRACE: Duration = Duration::minutes(15);

/// How long a fired record is kept: longer than any plan looks back.
const KEEP_FIRED: Duration = Duration::days(3);

const PLANS: &str = "planned.json";
const FIRED: &str = "planned-fired.json";
const SNOOZED: &str = "planned-snoozed.json";

/// How long the Snooze a planned notice gets by default puts it off.
pub const SNOOZE_MINUTES: u32 = 10;

/// One notice for later: when, until when it is still worth showing, and the notice (its `id` required: it is how
/// a plan made again names the same reminder).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Planned {
    /// RFC 3339
    pub at: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub until: Option<String>,
    #[serde(flatten)]
    pub notice: Notice,
}

impl Planned {
    fn at(&self) -> Option<DateTime<FixedOffset>> {
        DateTime::parse_from_rfc3339(&self.at).ok()
    }

    /// Due at `now`: its moment come and its `until` (default: [`GRACE`] after it) not passed.
    pub fn due(&self, now: DateTime<Utc>) -> bool {
        let Some(at) = self.at() else { return false };
        let until = self.until.as_deref().and_then(|u| DateTime::parse_from_rfc3339(u).ok()).unwrap_or(at + GRACE);
        at <= now && now < until
    }

    /// The notice as it rings: its own buttons, or Open and Snooze.
    fn ringing(&self, plugin: &str) -> Notice {
        let mut n = self.notice.clone().source(plugin);
        if n.actions.is_empty() {
            if n.open.is_some() {
                n.actions.push(NoticeAction::new(NoticeAction::OPEN, "Open"));
            }
            n.actions.push(NoticeAction::snooze(SNOOZE_MINUTES));
        }
        n
    }

    /// What "fired" is kept by: the plugin, the id and the moment.
    fn key(&self, plugin: &str) -> String {
        format!("{plugin}:{}@{}", self.notice.id.as_deref().unwrap_or(""), self.at().map_or(0, |t| t.timestamp()))
    }
}

/// Each plugin's plan, by id.
pub type Plans = BTreeMap<String, Vec<Planned>>;
/// What fired, by key: when (unix ms).
type Fired = BTreeMap<String, i64>;

fn read<T: serde::de::DeserializeOwned + Default>(path: &Path) -> T {
    std::fs::read_to_string(path).ok().and_then(|t| serde_json::from_str(&t).ok()).unwrap_or_default()
}

fn write<T: Serialize>(path: &Path, v: &T) {
    if let Err(e) = vault_write::cache::write(path, serde_json::to_string_pretty(v).unwrap_or_default().as_bytes()) {
        eprintln!("atlas: {}: {e}", path.display());
    }
}

/// The plans as kept.
pub fn plans(cache: &Path) -> Plans {
    read(&cache.join(PLANS))
}

/// The snoozed copies, by plugin.
fn snoozed(cache: &Path) -> Plans {
    read(&cache.join(SNOOZED))
}

/// What may ring: the plans and the snoozed copies.
fn ringing(cache: &Path) -> Plans {
    let mut all = plans(cache);
    for (plugin, list) in snoozed(cache) {
        all.entry(plugin).or_default().extend(list);
    }
    all
}

/// Snooze pressed on the planned notice `id` of `plugin`: it rings again at `at` (a copy of it as last planned, its
/// `until` the default grace). False when no plan has it (already gone: nothing to put off).
pub fn snooze(cache: &Path, plugin: &str, id: &str, at: DateTime<Utc>) -> bool {
    let has = |list: &Vec<Planned>| list.iter().find(|p| p.notice.id.as_deref() == Some(id)).cloned();
    let mut all = snoozed(cache);
    let Some(mut p) = plans(cache).get(plugin).and_then(has).or_else(|| all.get(plugin).and_then(has)) else { return false };
    p.at = at.to_rfc3339();
    p.until = None;
    let list = all.entry(plugin.to_string()).or_default();
    list.retain(|q| q.notice.id.as_deref() != Some(id));
    list.push(p);
    write(&cache.join(SNOOZED), &all);
    true
}

/// The snoozed copies still worth keeping: the plugin's plan still lists the notice (an event deleted meanwhile
/// drops its snooze too), and it has not rung.
fn keep_snoozed(cache: &Path, fired: &Fired) {
    let (plans, mut all) = (plans(cache), snoozed(cache));
    if all.is_empty() {
        return;
    }
    for (plugin, list) in all.iter_mut() {
        let listed = |p: &Planned| plans.get(plugin).is_some_and(|l| l.iter().any(|q| q.notice.id == p.notice.id));
        list.retain(|p| listed(p) && !fired.contains_key(&p.key(plugin)));
    }
    all.retain(|_, l| !l.is_empty());
    write(&cache.join(SNOOZED), &all);
}

/// A plan tool's answer: its `planned` list replaces the plugin's plan (empty: none); an answer without one leaves
/// the plan as it was (a round that could not look). A planned notice with no id or no moment is dropped, said in
/// the log.
pub fn take(cache: &Path, plugin: &str, answer: &Value) {
    let Some(list) = answer.get("planned").and_then(Value::as_array) else { return };
    let mut plan = Vec::new();
    for v in list {
        match serde_json::from_value::<Planned>(v.clone()) {
            Ok(p) if p.notice.id.is_some() && p.at().is_some() => plan.push(p),
            Ok(_) => eprintln!("atlas: {plugin}: a planned notice needs an id and an RFC 3339 `at`: {v}"),
            Err(e) => eprintln!("atlas: {plugin}: a planned notice is not one ({e}): {v}"),
        }
    }
    let mut all = plans(cache);
    if plan.is_empty() {
        all.remove(plugin);
    } else {
        all.insert(plugin.to_string(), plan);
    }
    write(&cache.join(PLANS), &all);
}

/// The planned notices due at `now` and not fired yet: (plugin, notice).
fn due(plans: &Plans, fired: &Fired, now: DateTime<Utc>) -> Vec<(String, Planned)> {
    plans.iter().flat_map(|(plugin, list)| list.iter().filter(|p| p.due(now) && !fired.contains_key(&p.key(plugin))).map(|p| (plugin.clone(), p.clone()))).collect()
}

/// What `before` (plans and snoozed copies) had that `after` (the plans) no longer lists: (plugin, planned notice).
fn dropped(before: Plans, after: &Plans) -> Vec<(String, Planned)> {
    let listed = |plugin: &str, p: &Planned| after.get(plugin).is_some_and(|l| l.iter().any(|q| q.notice.id == p.notice.id));
    let mut out = Vec::new();
    for (plugin, list) in before {
        out.extend(list.into_iter().filter(|p| !listed(&plugin, p)).map(|p| (plugin.clone(), p)));
    }
    out
}

/// The planned notices that dropped out of their plan (the event deleted, the reminder taken off, the task done)
/// while their notice still rings — fired, and within its `until` at `now` — are withdrawn. One whose time simply
/// passed is left alone: it dropped out because it is over, not because it is gone.
fn withdraw_dropped(cache: &Path, bus: &EventBus, gone: Vec<(String, Planned)>, now: DateTime<Utc>) {
    if gone.is_empty() {
        return;
    }
    let fired: Fired = read(&cache.join(FIRED));
    let mut said = BTreeSet::new();
    for (plugin, p) in gone {
        let Some(id) = p.notice.id.clone() else { continue };
        if p.due(now) && fired.contains_key(&p.key(&plugin)) && said.insert(id.clone()) {
            bus.publish(Event::Withdraw { id });
        }
    }
}

/// Asks the plan tools (`only`: one plugin's) for their plans; a plugin no longer planning (switched off, removed,
/// its tool gone) loses its plan. A tool that fails keeps its last plan, said in the log. Gives what dropped out of
/// the plans ([`withdraw_dropped`]).
async fn ask(ws: &Workspace, helpers: &crate::helper::Helpers, only: Option<&str>) -> Vec<(String, Planned)> {
    let cache = ws.cache_dir();
    let before = ringing(&cache);
    asked(ws, helpers, only).await;
    dropped(before, &plans(&cache))
}

async fn asked(ws: &Workspace, helpers: &crate::helper::Helpers, only: Option<&str>) {
    let Ok(cfg) = ws.config() else { return };
    let cache = ws.cache_dir();
    let tools = crate::plugin_tools::listening(ws.root(), &cfg, EVENT);
    if only.is_none() {
        let mut all = plans(&cache);
        let before = all.len();
        all.retain(|plugin, _| tools.iter().any(|(p, _)| p == plugin));
        if all.len() != before {
            write(&cache.join(PLANS), &all);
        }
    }
    let store = crate::secrets::Store::for_vault(ws.root());
    for (plugin, tool) in tools.iter().filter(|(p, _)| only.is_none_or(|o| o == p)) {
        match crate::plugin_tools::call(ws.root(), &cfg, helpers, &store, plugin, tool, json!({})).await {
            Ok(answer) => take(&cache, plugin, &answer),
            Err(e) => eprintln!("atlas: {plugin} · {tool} (plan): {e}; its last plan stands"),
        }
    }
}

/// Fires what is due at `now`, once each: the plugins with something due are asked again first (`helpers`; None:
/// the plan as kept), and only what their fresh plan still has due fires.
pub async fn fire(ws: &Workspace, bus: &EventBus, helpers: Option<&crate::helper::Helpers>, now: DateTime<Utc>) {
    let cache = ws.cache_dir();
    let mut fired: Fired = read(&cache.join(FIRED));
    let pending = due(&ringing(&cache), &fired, now);
    if pending.is_empty() {
        return;
    }
    if let Some(h) = helpers {
        for plugin in pending.iter().map(|(p, _)| p.as_str()).collect::<BTreeSet<_>>() {
            let gone = ask(ws, h, Some(plugin)).await;
            withdraw_dropped(&cache, bus, gone, now);
        }
    }
    keep_snoozed(&cache, &fired);
    for (plugin, p) in due(&ringing(&cache), &fired, now) {
        fired.insert(p.key(&plugin), now.timestamp_millis());
        bus.publish(Event::Notify(p.ringing(&plugin)));
    }
    let old = (now - KEEP_FIRED).timestamp_millis();
    fired.retain(|_, t| *t > old);
    write(&cache.join(FIRED), &fired);
    keep_snoozed(&cache, &fired);
}

/// The loop for a served vault whose core shows notices to a person; aborted with the server.
pub fn spawn(ws: Workspace, bus: EventBus, helpers: crate::helper::Helpers) -> tokio::task::JoinHandle<()> {
    let off = std::env::var_os("ATLAS_NO_SCHEDULE").is_some();
    tokio::spawn(async move {
        if off {
            return;
        }
        let mut asked: Option<std::time::Instant> = None;
        loop {
            // first after a tick: the vault's opening goes first
            tokio::time::sleep(TICK).await;
            if asked.is_none_or(|t| t.elapsed() >= ASK_EVERY) {
                let gone = ask(&ws, &helpers, None).await;
                withdraw_dropped(&ws.cache_dir(), &bus, gone, Utc::now());
                asked = Some(std::time::Instant::now());
            }
            fire(&ws, &bus, Some(&helpers), Utc::now()).await;
        }
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn planned(at: DateTime<Utc>, until: Option<DateTime<Utc>>, id: &str) -> Value {
        let mut v = json!({ "at": at.to_rfc3339(), "id": id, "title": "Seminar", "body": "in 15 min · 10:00–11:00 · D3-2041", "open": "notes/Seminar.md" });
        if let Some(u) = until {
            v["until"] = json!(u.to_rfc3339());
        }
        v
    }

    #[test]
    fn a_planned_notice_is_due_from_its_moment_until_its_until() {
        let now = Utc::now();
        let p = |at: DateTime<Utc>, until| serde_json::from_value::<Planned>(planned(at, until, "a")).unwrap();
        assert!(!p(now + Duration::minutes(1), None).due(now), "not yet");
        assert!(p(now, None).due(now), "at its moment");
        assert!(p(now - Duration::minutes(10), None).due(now), "late, within the grace");
        assert!(!p(now - Duration::minutes(20), None).due(now), "too late: noise");
        assert!(p(now - Duration::minutes(20), Some(now + Duration::minutes(1))).due(now), "its own until says longer");
    }

    #[test]
    fn an_answer_replaces_the_plugins_plan_and_one_without_planned_leaves_it() {
        let t = tempfile::tempdir().unwrap();
        let d = t.path().join(".atlas/cache");
        let d = &d;
        let now = Utc::now();
        take(d, "dav", &json!({ "planned": [planned(now, None, "a"), { "at": now.to_rfc3339(), "title": "no id" }, { "title": "no moment", "id": "x" }] }));
        take(d, "other", &json!({ "planned": [planned(now, None, "b")] }));
        let ids = |d: &Path| plans(d).iter().flat_map(|(k, v)| v.iter().map(move |p| format!("{k}:{}", p.notice.id.clone().unwrap()))).collect::<Vec<_>>();
        assert_eq!(ids(d), ["dav:a", "other:b"], "malformed ones dropped");
        take(d, "dav", &json!({ "summary": "could not look" }));
        assert_eq!(ids(d), ["dav:a", "other:b"], "no plan in the answer: kept");
        take(d, "dav", &json!({ "planned": [] }));
        assert_eq!(ids(d), ["other:b"], "an empty plan: gone");
    }

    /// A vault with a plan plugin whose helper (JavaScript, in the core) answers `answers[n]` at its n-th call (the
    /// last one from then on).
    fn vault(answers: &[Value]) -> (tempfile::TempDir, Workspace, crate::helper::Helpers, EventBus) {
        let d = tempfile::tempdir().unwrap();
        let p = d.path().join(".atlas/plugins/cal");
        std::fs::create_dir_all(&p).unwrap();
        std::fs::write(p.join("plugin.toml"), "title = \"Cal\"\n[helper]\njs = \"helper.js\"\n[[tool]]\nname = \"reminders\"\ndescription = \"the coming reminders\"\non = \"plan\"\n").unwrap();
        let list = serde_json::to_string(answers).unwrap();
        std::fs::write(p.join("helper.js"), format!("const answers = {list}; let n = 0;\natlas.method(\"reminders\", () => answers[Math.min(n++, answers.length - 1)]);\n")).unwrap();
        let ws = Workspace::open(d.path()).unwrap();
        let bus = EventBus::default();
        let helpers = crate::helper::Helpers::new(d.path(), bus.clone());
        (d, ws, helpers, bus)
    }

    fn heard(rx: &mut tokio::sync::broadcast::Receiver<Event>) -> Vec<Notice> {
        std::iter::from_fn(|| match rx.try_recv() {
            Ok(Event::Notify(n)) => Some(Some(n)),
            Ok(_) => Some(None),
            Err(_) => None,
        })
        .flatten()
        .collect()
    }

    #[tokio::test]
    async fn a_reminder_fires_once_at_its_moment_even_across_a_restart() {
        let now = Utc::now();
        let (_d, ws, helpers, bus) = vault(&[json!({ "planned": [planned(now + Duration::minutes(10), None, "s1")] })]);
        let mut rx = bus.subscribe();
        ask(&ws, &helpers, None).await;
        fire(&ws, &bus, Some(&helpers), now).await;
        assert!(heard(&mut rx).is_empty(), "not yet");
        let then = now + Duration::minutes(10) + Duration::seconds(5);
        fire(&ws, &bus, Some(&helpers), then).await;
        let n = heard(&mut rx);
        assert_eq!(n.len(), 1);
        assert_eq!((n[0].title.as_str(), n[0].source.as_deref(), n[0].open.as_deref()), ("Seminar", Some("cal"), Some("notes/Seminar.md")));
        fire(&ws, &bus, Some(&helpers), then + Duration::seconds(15)).await;
        assert!(heard(&mut rx).is_empty(), "once");
        // a restart: a new core, the same cache
        let fresh = crate::helper::Helpers::new(ws.root(), bus.clone());
        fire(&ws, &bus, Some(&fresh), then + Duration::seconds(30)).await;
        assert!(heard(&mut rx).is_empty(), "not again after a restart");
    }

    #[tokio::test]
    async fn an_event_moved_or_deleted_after_its_reminder_was_planned_moves_or_drops_it() {
        let now = Utc::now();
        let soon = now + Duration::minutes(10);
        let later = now + Duration::hours(2);
        // planned for `soon`; asked again just before it rings, the event has moved two hours on
        let (_d, ws, helpers, bus) = vault(&[json!({ "planned": [planned(soon, None, "s1")] }), json!({ "planned": [planned(later, None, "s1")] })]);
        let mut rx = bus.subscribe();
        ask(&ws, &helpers, None).await;
        fire(&ws, &bus, Some(&helpers), soon).await;
        assert!(heard(&mut rx).is_empty(), "not at the old moment");
        assert_eq!(plans(&ws.cache_dir())["cal"][0].at, later.to_rfc3339(), "the plan follows the event");
        fire(&ws, &bus, Some(&helpers), later).await;
        assert_eq!(heard(&mut rx).len(), 1, "at the new one");

        let (_d, ws, helpers, bus) = vault(&[json!({ "planned": [planned(soon, None, "s1")] }), json!({ "planned": [] })]);
        let mut rx = bus.subscribe();
        ask(&ws, &helpers, None).await;
        fire(&ws, &bus, Some(&helpers), soon).await;
        assert!(heard(&mut rx).is_empty(), "deleted: never rings");
        assert!(plans(&ws.cache_dir()).is_empty());
    }

    #[tokio::test]
    async fn a_reminder_carries_open_and_snooze_and_a_snooze_rings_it_again_once() {
        let now = Utc::now();
        let (_d, ws, helpers, bus) = vault(&[json!({ "planned": [planned(now, None, "s1")] })]);
        let mut rx = bus.subscribe();
        ask(&ws, &helpers, None).await;
        fire(&ws, &bus, Some(&helpers), now).await;
        let n = heard(&mut rx);
        assert_eq!(n[0].actions, [NoticeAction::new(NoticeAction::OPEN, "Open"), NoticeAction::snooze(10)]);
        let cache = ws.cache_dir();
        assert!(snooze(&cache, "cal", "s1", now + Duration::minutes(10)));
        assert!(!snooze(&cache, "cal", "nope", now + Duration::minutes(10)), "not planned: nothing to put off");
        fire(&ws, &bus, Some(&helpers), now + Duration::minutes(5)).await;
        assert!(heard(&mut rx).is_empty(), "not before its new moment");
        fire(&ws, &bus, Some(&helpers), now + Duration::minutes(10)).await;
        assert_eq!(heard(&mut rx).iter().map(|n| n.title.as_str()).collect::<Vec<_>>(), ["Seminar"], "rung again");
        fire(&ws, &bus, Some(&helpers), now + Duration::minutes(11)).await;
        assert!(heard(&mut rx).is_empty(), "once");
        assert!(snoozed(&cache).is_empty(), "the copy gone once rung");

        // snoozed, then the event deleted: the snooze goes with it
        let (_d, ws, helpers, bus) = vault(&[json!({ "planned": [planned(now, None, "s1")] }), json!({ "planned": [] })]);
        let mut rx = bus.subscribe();
        ask(&ws, &helpers, None).await;
        fire(&ws, &bus, None, now).await;
        heard(&mut rx);
        assert!(snooze(&ws.cache_dir(), "cal", "s1", now + Duration::minutes(10)));
        fire(&ws, &bus, Some(&helpers), now + Duration::minutes(10)).await;
        assert!(heard(&mut rx).is_empty(), "deleted meanwhile: never rings");
    }

    #[tokio::test]
    async fn a_rung_reminder_whose_event_is_deleted_is_withdrawn_but_one_merely_over_is_not() {
        let now = Utc::now();
        let withdrawn = |rx: &mut tokio::sync::broadcast::Receiver<Event>| {
            std::iter::from_fn(|| rx.try_recv().ok()).filter_map(|e| if let Event::Withdraw { id } = e { Some(id) } else { None }).collect::<Vec<_>>()
        };
        for (later, expect) in [(Duration::minutes(5), vec!["s1".to_string()]), (Duration::minutes(20), vec![])] {
            let (_d, ws, helpers, bus) = vault(&[json!({ "planned": [planned(now, None, "s1"), planned(now + Duration::hours(1), None, "s2")] }), json!({ "planned": [] })]);
            let mut rx = bus.subscribe();
            let _ = ask(&ws, &helpers, None).await;
            fire(&ws, &bus, None, now).await;
            assert_eq!(heard(&mut rx).len(), 1, "s1 rang");
            let gone = ask(&ws, &helpers, None).await;
            assert_eq!(gone.len(), 2, "both dropped out of the plan");
            withdraw_dropped(&ws.cache_dir(), &bus, gone, now + later);
            assert_eq!(withdrawn(&mut rx), expect, "only a rung one still within its time; s2 never rang");
        }
    }

    #[tokio::test]
    async fn a_plan_tool_that_cannot_answer_leaves_the_last_plan_to_ring() {
        let now = Utc::now();
        let (_d, ws, helpers, bus) = vault(&[json!({ "planned": [planned(now, None, "s1")] })]);
        let mut rx = bus.subscribe();
        ask(&ws, &helpers, None).await;
        std::fs::write(ws.root().join(".atlas/plugins/cal/helper.js"), "atlas.method(\"reminders\", () => { throw new atlas.AtlasError(\"offline\"); });").unwrap();
        let broken = crate::helper::Helpers::new(ws.root(), bus.clone());
        fire(&ws, &bus, Some(&broken), now + Duration::seconds(1)).await;
        assert_eq!(heard(&mut rx).len(), 1, "better a reminder from the last plan than none");
    }
}
