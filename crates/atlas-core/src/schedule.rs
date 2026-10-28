//! Scheduled workspace commands: a manifest's `schedule = "daily 03:00"`, `"every 2h"`, `"every 30m"`
//! or `"hourly"`. They run while an Atlas server is up (the app or `atlas serve`); each run is
//! recorded in `.atlas/cache/schedule.json` (last run per command) and `schedule.log`, and a failure
//! notifies the UI. `[automation] run_schedules = false` turns it off.
use crate::api::Mtime;
use crate::api::{Event, Notice, NoticeLevel, ScheduledRun};
use crate::commands::{run_script, scripts, ScriptCommand, SCRIPT_TIMEOUT};
use crate::events::EventBus;
use crate::{vault_write, Workspace};
use chrono::{DateTime, Local, NaiveTime};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::path::Path;
use std::str::FromStr;
use std::time::Duration;

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum Schedule {
    Every(Duration),
    Daily(NaiveTime),
}

impl FromStr for Schedule {
    type Err = String;
    fn from_str(s: &str) -> Result<Self, String> {
        let s = s.trim().to_lowercase();
        let bad = || format!("schedule `{s}`: use `daily HH:MM`, `every 30m` / `every 2h` / `every 1d`, or `hourly`");
        if s == "hourly" {
            return Ok(Schedule::Every(Duration::from_secs(3600)));
        }
        if let Some(t) = s.strip_prefix("daily") {
            return NaiveTime::parse_from_str(t.trim(), "%H:%M").map(Schedule::Daily).map_err(|_| bad());
        }
        let d = span(s.strip_prefix("every").ok_or_else(bad)?).ok_or_else(bad)?;
        // a floor of 5 minutes: a scheduler is not a busy loop
        Ok(Schedule::Every(d.max(Duration::from_secs(300))))
    }
}

/// A length in the schedule's words (`30m`, `2 hours`, `1d`); None when it is not one, or zero.
pub fn span(s: &str) -> Option<Duration> {
    let n = s.trim();
    let (num, unit) = n.split_at(n.find(|c: char| !c.is_ascii_digit())?);
    let k: u64 = num.parse().ok().filter(|k| *k > 0)?;
    let secs = match unit.trim() {
        "m" | "min" | "mins" | "minutes" => 60,
        "h" | "hour" | "hours" => 3600,
        "d" | "day" | "days" => 86_400,
        _ => return None,
    };
    Some(Duration::from_secs(k * secs))
}

impl Schedule {
    /// Due now? `Every` runs at once the first time, then each period; `Daily` runs once per day
    /// at or after its time (a missed slot runs when Atlas next starts that day).
    pub fn due(&self, last: Option<DateTime<Local>>, now: DateTime<Local>) -> bool {
        match *self {
            Schedule::Every(d) => last.is_none_or(|l| (now - l).to_std().is_ok_and(|e| e >= d)),
            Schedule::Daily(t) => {
                let Some(slot) = now.date_naive().and_time(t).and_local_timezone(Local).earliest() else {
                    return false;
                };
                now >= slot && last.is_none_or(|l| l < slot)
            }
        }
    }
}

const STATE: &str = "schedule.json";
const LOG: &str = "schedule.log";

pub fn records(cache: &Path) -> HashMap<String, ScheduledRun> {
    std::fs::read_to_string(cache.join(STATE)).ok().and_then(|t| serde_json::from_str(&t).ok()).unwrap_or_default()
}

fn log_line(cache: &Path, line: &str) {
    let path = cache.join(LOG);
    if std::fs::metadata(&path).is_ok_and(|m| m.len() > 1 << 20) {
        let _ = vault_write::cache::remove_file(&path); // capped: a failing job cannot fill the disk
    }
    let _ = vault_write::cache::append(&path, format!("{} {line}\n", Local::now().format("%Y-%m-%d %H:%M:%S")).as_bytes());
}

/// One scheduled job: a vault command, or a plugin's tool (a sync), each recorded under its own id.
enum Job {
    Command(ScriptCommand),
    Tool(crate::plugin_tools::Scheduled),
}

impl Job {
    fn id(&self) -> String {
        match self {
            Job::Command(s) => s.id.clone(),
            Job::Tool(t) => format!("plugin.{}.{}", t.plugin, t.tool),
        }
    }
    fn spec(&self) -> Option<&str> {
        match self {
            Job::Command(s) => s.manifest.schedule.as_deref(),
            Job::Tool(t) => Some(&t.schedule),
        }
    }
    fn title(&self) -> String {
        match self {
            Job::Command(s) => s.manifest.title.clone(),
            Job::Tool(t) => format!("{} · {}", t.plugin, t.tool),
        }
    }
}

/// One pass: run every due scheduled command and plugin tool (sequentially), record and report. Plugin tools run only
/// where the vault's helpers are (`helpers`: a served vault).
pub async fn tick(ws: &Workspace, bus: &EventBus, helpers: Option<&crate::helper::Helpers>, now: DateTime<Local>) {
    let Ok(cfg) = ws.config() else { return };
    if !cfg.automation.run_schedules {
        return;
    }
    let cache = ws.cache_dir();
    let mut recs = records(&cache);
    let mut jobs: Vec<Job> = scripts(ws.root()).into_iter().map(Job::Command).collect();
    if helpers.is_some() {
        jobs.extend(crate::plugin_tools::scheduled(ws.root(), &cfg).into_iter().map(Job::Tool));
    }
    for job in jobs {
        let id = job.id();
        let Some(spec) = job.spec() else { continue };
        let sched = match spec.parse::<Schedule>() {
            Ok(x) => x,
            Err(e) => {
                if recs.get(&id).is_none_or(|r| r.summary != e) {
                    log_line(&cache, &format!("{id}: {e}"));
                    recs.insert(id.clone(), ScheduledRun { time: Mtime(now.timestamp_millis() as u64), ok: false, summary: e });
                }
                continue;
            }
        };
        let last = recs.get(&id).and_then(|r| DateTime::from_timestamp_millis(r.time.0 as i64)).map(|t| t.with_timezone(&Local));
        if !sched.due(last, now) {
            continue;
        }
        let out = match &job {
            Job::Command(s) => run_script(ws.root(), s, &json!({}), s.manifest.timeout_secs.map_or(SCRIPT_TIMEOUT, Duration::from_secs)).await,
            Job::Tool(t) => {
                let Some(h) = helpers else { continue };
                let store = crate::secrets::Store::for_vault(ws.root());
                crate::plugin_tools::call(ws.root(), &cfg, h, &store, &t.plugin, &t.tool, json!({})).await
            }
        };
        let (ok, summary) = match &out {
            Ok(v) => (true, v.get("summary").and_then(Value::as_str).map(str::to_string).or_else(|| v.as_str().map(str::to_string)).unwrap_or_else(|| v.to_string())),
            Err(e) => (false, e.to_string()),
        };
        let summary: String = summary.trim().lines().last().unwrap_or("").chars().take(300).collect();
        log_line(&cache, &format!("{id} {}: {summary}", if ok { "ok" } else { "FAILED" }));
        // once per failure, not per run: a job every 5 min that keeps failing the same way (a cluster not connected)
        // notified every 5 min; again when it fails for another reason, or fails anew after working
        if !ok && recs.get(&id).is_none_or(|prev| prev.ok || prev.summary != summary) {
            bus.publish(Event::Notify(Notice::new(format!("{} failed (scheduled)", job.title())).body(summary.clone()).source("schedule").level(NoticeLevel::Failure).id(format!("schedule:{id}"))));
        }
        recs.insert(id, ScheduledRun { time: Mtime(Local::now().timestamp_millis() as u64), ok, summary });
    }
    let _ = vault_write::cache::write(&cache.join(STATE), serde_json::to_string_pretty(&recs).unwrap_or_default().as_bytes());
}

/// The scheduler loop (every 30 s) for a running server; aborted with the server.
pub fn spawn(ws: Workspace, bus: EventBus, helpers: crate::helper::Helpers) -> tokio::task::JoinHandle<()> {
    tokio::spawn(async move {
        loop {
            tick(&ws, &bus, Some(&helpers), Local::now()).await;
            tokio::time::sleep(Duration::from_secs(30)).await;
        }
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::TimeZone;

    #[test]
    fn parses_schedules_and_rejects_nonsense() {
        assert_eq!("daily 03:00".parse(), Ok(Schedule::Daily(NaiveTime::from_hms_opt(3, 0, 0).unwrap())));
        assert_eq!("every 2h".parse(), Ok(Schedule::Every(Duration::from_secs(7200))));
        assert_eq!("Every 30 min".parse(), Ok(Schedule::Every(Duration::from_secs(1800))));
        assert_eq!("every 1m".parse(), Ok(Schedule::Every(Duration::from_secs(300))), "5-minute floor");
        assert_eq!("hourly".parse(), Ok(Schedule::Every(Duration::from_secs(3600))));
        for bad in ["nightly", "daily 25:00", "every", "every 0h", "every 3 weeks"] {
            assert!(bad.parse::<Schedule>().is_err(), "{bad}");
        }
    }

    #[test]
    fn due_rules() {
        let at = |h, m| Local.with_ymd_and_hms(2026, 10, 6, h, m, 0).unwrap();
        let daily: Schedule = "daily 03:00".parse().unwrap();
        assert!(!daily.due(None, at(2, 59)));
        assert!(daily.due(None, at(9, 0)), "missed slot runs later that day");
        assert!(!daily.due(Some(at(3, 1)), at(9, 0)), "once per day");
        assert!(daily.due(Some(at(3, 1) - chrono::Duration::days(1)), at(3, 0)));
        let every: Schedule = "every 2h".parse().unwrap();
        assert!(every.due(None, at(9, 0)));
        assert!(!every.due(Some(at(8, 0)), at(9, 0)));
        assert!(every.due(Some(at(7, 0)), at(9, 0)));
    }

    #[tokio::test]
    async fn tick_runs_due_commands_and_records_them() {
        let d = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(d.path().join(".atlas/commands")).unwrap();
        std::fs::write(
            d.path().join(".atlas/commands/stamp.toml"),
            "title = \"Stamp\"\nrun = \"echo stamped\"\nschedule = \"every 2h\"\n",
        )
        .unwrap();
        std::fs::write(
            d.path().join(".atlas/commands/bad.toml"),
            "title = \"Bad\"\nrun = \"true\"\nschedule = \"nightly\"\n",
        )
        .unwrap();
        let ws = Workspace::open(d.path()).unwrap();
        let bus = EventBus::default();
        tick(&ws, &bus, None, Local::now()).await;
        let r = records(&ws.cache_dir());
        assert!(r["stamp"].ok && r["stamp"].summary == "stamped", "{r:?}");
        assert!(!r["bad"].ok && r["bad"].summary.contains("use `daily HH:MM`"));
        let first = r["stamp"].time;
        tick(&ws, &bus, None, Local::now()).await; // not due again for 2 h
        assert_eq!(records(&ws.cache_dir())["stamp"].time, first);
    }

    #[tokio::test]
    async fn a_job_failing_the_same_way_notifies_once() {
        let d = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(d.path().join(".atlas/commands")).unwrap();
        let cmd = d.path().join(".atlas/commands/poll.toml");
        let write = |why: &str| std::fs::write(&cmd, format!("title = \"Poll\"\nrun = \"echo {why}; exit 1\"\nschedule = \"every 1m\"\n")).unwrap();
        write("not connected");
        let ws = Workspace::open(d.path()).unwrap();
        let bus = EventBus::default();
        let mut rx = bus.subscribe();
        let at = |m: i64| Local::now() + chrono::Duration::minutes(m);
        for m in [0, 2, 4] {
            tick(&ws, &bus, None, at(m)).await;
        }
        write("host unknown"); // another reason: said again
        tick(&ws, &bus, None, at(6)).await;
        let mut said = vec![];
        while let Ok(Event::Notify(n)) = rx.try_recv() {
            said.push(n.body.unwrap_or_default());
        }
        assert_eq!(said.len(), 2, "{said:?}");
        assert!(said[1].contains("host unknown"), "{said:?}");
    }
}
