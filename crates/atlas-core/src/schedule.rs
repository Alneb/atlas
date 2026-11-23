//! Scheduled workspace commands: a manifest's `schedule = "daily 03:00"`, `"every 2h"`, `"every 30m"`
//! or `"hourly"`. They run while an Atlas server is up (the app or `atlas serve`); each run is
//! recorded in `.atlas/cache/schedule.json` (last run per command) and `schedule.log`, and a failure
//! notifies the UI. `[automation] run_schedules = false` turns it off; `schedules_on` names the computers that run them.
//! `ATLAS_NO_SCHEDULE` (any value) keeps a server from running any: a core serving a copy of a vault (a probe, a
//! profile) would otherwise run the vault's cluster polls and syncs on the same computer, and notify their failures.
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
    Some(Duration::from_secs(k.checked_mul(secs)?))
}

impl Schedule {
    /// Due now? `Every` runs at once the first time, then each period; `Daily` runs once per day
    /// at or after its time (a missed slot runs when Atlas next starts that day). A last run after now (recorded
    /// while the clock was ahead) counts as none: else the job waits until the clock catches up with it.
    pub fn due(&self, last: Option<DateTime<Local>>, now: DateTime<Local>) -> bool {
        let last = last.filter(|l| *l <= now);
        match *self {
            Schedule::Every(d) => last.is_none_or(|l| (now - l).to_std().is_ok_and(|e| e >= d)),
            Schedule::Daily(t) => {
                let Some(slot) = daily_slot(now.date_naive().and_time(t), &Local) else { return false };
                now >= slot && last.is_none_or(|l| l < slot)
            }
        }
    }
}

/// A day's slot in `tz` (one the clocks skip: an hour later, `wall_clock::at`).
fn daily_slot<Tz: chrono::TimeZone>(at: chrono::NaiveDateTime, tz: &Tz) -> Option<DateTime<Tz>> {
    crate::wall_clock::at(at, tz)
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
    /// The ids the vault's `[automation] background` may name it by, most precise first (server_role.rs `in_vault`).
    fn ids(&self) -> Vec<String> {
        match self {
            Job::Command(s) => vec![s.id.clone()],
            Job::Tool(t) => vec![self.id(), format!("plugin.{}", t.plugin)],
        }
    }
    fn spec(&self) -> Option<&str> {
        match self {
            Job::Command(s) => s.manifest.schedule.as_deref(),
            Job::Tool(t) => Some(&t.schedule),
        }
    }
    /// Which of the cores serving the vault runs it (server_role.rs).
    fn background(&self) -> crate::server_role::Background {
        match self {
            Job::Command(s) => s.manifest.background,
            Job::Tool(t) => t.background,
        }
    }
    /// Whom its answer's notices come from: the command's id, the tool's plugin.
    fn source(&self) -> String {
        match self {
            Job::Command(s) => s.id.clone(),
            Job::Tool(t) => t.plugin.clone(),
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
    tick_at(ws, bus, helpers, now, crate::server_role::Seat::of(ws.root())).await
}

/// `tick` on a core in `seat`: a job whose `background` names another kind of core is left to it (server_role.rs).
async fn tick_at(ws: &Workspace, bus: &EventBus, helpers: Option<&crate::helper::Helpers>, now: DateTime<Local>, seat: crate::server_role::Seat) {
    let Ok(cfg) = ws.config() else { return };
    let host = crate::platform::proc::hostname();
    if !cfg.automation.schedules_here(&host) {
        return;
    }
    let cache = ws.cache_dir();
    let mut recs = records(&cache);
    let mut jobs = jobs(ws.root(), &cfg, helpers.is_some());
    jobs.retain(|j| {
        let ids = j.ids();
        let ids: Vec<&str> = ids.iter().map(String::as_str).collect();
        crate::server_role::job_here(&cfg.automation, &host, seat, j.background(), &ids).is_ok()
    });
    for job in jobs {
        let id = job.id();
        let Some(spec) = job.spec() else { continue };
        let sched = match spec.parse::<Schedule>() {
            Ok(x) => x,
            Err(e) => {
                if recs.get(&id).is_none_or(|r| r.summary != e) {
                    log_line(&cache, &format!("{id}: {e}"));
                    recs.insert(id.clone(), ScheduledRun { time: Mtime(now.timestamp_millis() as u64), ok: false, summary: e });
                    keep(&cache, &recs);
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
            Ok(v) => (true, said(v)),
            Err(e) => (false, e.to_string()),
        };
        let summary: String = summary.trim().lines().last().unwrap_or("").chars().take(300).collect();
        log_line(&cache, &format!("{id} {}: {summary}", if ok { "ok" } else { "FAILED" }));
        if let Ok(v) = &out {
            crate::notice_actions::say(bus, &job.source(), v);
        }
        // once per failure, not per run: a job every 5 min that keeps failing the same way (a cluster not connected)
        // notified every 5 min; again when it fails for another reason, or fails anew after working
        if !ok && recs.get(&id).is_none_or(|prev| prev.ok || prev.summary != summary) {
            bus.publish(Event::Notify(Notice::new(format!("{} failed (scheduled)", job.title())).body(summary.clone()).source("schedule").level(NoticeLevel::Failure).id(format!("schedule:{id}"))));
        }
        recs.insert(id, ScheduledRun { time: Mtime(Local::now().timestamp_millis() as u64), ok, summary });
        // after each job, not once at the end: Atlas closed during a long one must not run the ones before it again
        keep(&cache, &recs);
    }
}

/// The vault's scheduled jobs: its commands, and its plugins' scheduled tools when `tools` (only a served vault has
/// the helpers that run them).
fn jobs(root: &Path, cfg: &crate::config::Config, tools: bool) -> Vec<Job> {
    let mut jobs: Vec<Job> = scripts(root).into_iter().filter(|s| s.manifest.schedule.is_some()).map(Job::Command).collect();
    if tools {
        jobs.extend(crate::plugin_tools::scheduled(root, cfg).into_iter().map(Job::Tool));
    }
    jobs
}

/// Where a scheduled job runs, seen from this core.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, serde::Serialize, ts_rs::TS)]
#[serde(rename_all = "snake_case")]
#[ts(export)]
pub enum JobPlace {
    /// On this core.
    Here,
    /// On the vault's server (its `background = "server"`; this device's vault has a copy there).
    Server,
    /// On the person's devices (`background = "device"`; this core is the server).
    Devices,
    /// On the computers `[automation] schedules_on` names, not this one.
    OtherComputers,
    /// Nowhere: `[automation] run_schedules = false`.
    Off,
}

/// One scheduled job of a vault, where it runs and how it last went (Settings → Vaults & sync, `GET /api/schedules`).
#[derive(Debug, Clone, serde::Serialize, ts_rs::TS)]
#[ts(export)]
pub struct JobWhere {
    pub id: String,
    pub title: String,
    /// As written: `daily 03:00`, `every 2h`.
    pub schedule: String,
    pub place: JobPlace,
    /// The place in plain words.
    pub words: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub last_run: Option<ScheduledRun>,
}

/// Every scheduled job of the vault at `root`, with where it runs as `tick` decides it on this core.
pub fn where_jobs(root: &Path) -> anyhow::Result<Vec<JobWhere>> {
    let cfg = crate::config::Config::load(root)?;
    Ok(where_jobs_at(root, &cfg, &crate::platform::proc::hostname(), crate::server_role::Seat::of(root)))
}

fn where_jobs_at(root: &Path, cfg: &crate::config::Config, host: &str, seat: crate::server_role::Seat) -> Vec<JobWhere> {
    let auto = &cfg.automation;
    let recs = records(&root.join(".atlas/cache"));
    jobs(root, cfg, true)
        .into_iter()
        .filter_map(|j| {
            let schedule = j.spec()?.to_string();
            let ids = j.ids();
            let ids: Vec<&str> = ids.iter().map(String::as_str).collect();
            let bg = j.background().in_vault(&auto.background, &ids);
            // the same rules, in the same order, as `tick_at` and server_role::job_here
            let place = if !auto.run_schedules {
                JobPlace::Off
            } else if !auto.named_here(host) {
                JobPlace::OtherComputers
            } else if bg.runs_at(seat) {
                JobPlace::Here
            } else if seat == crate::server_role::Seat::Server {
                JobPlace::Devices
            } else {
                JobPlace::Server
            };
            let words = match place {
                JobPlace::Here => "here".to_string(),
                JobPlace::Server => "on the vault's server".to_string(),
                JobPlace::Devices => "on the person's devices, never on the server".to_string(),
                JobPlace::OtherComputers => format!("on {}", auto.schedules_on.join(", ")),
                JobPlace::Off => "nowhere: the vault's schedules are off".to_string(),
            };
            let id = j.id();
            Some(JobWhere { last_run: recs.get(&id).cloned(), title: j.title(), id, schedule, place, words })
        })
        .collect()
}

fn keep(cache: &Path, recs: &HashMap<String, ScheduledRun>) {
    let _ = vault_write::cache::write(&cache.join(STATE), serde_json::to_string_pretty(recs).unwrap_or_default().as_bytes());
}

/// What a job's answer says for the log: `skipped` (it had nothing it could do, e.g. a cluster not connected: never a
/// failure, never a notice), else its `summary`, else its text.
fn said(v: &Value) -> String {
    if let Some(why) = v.get("skipped").and_then(Value::as_str) {
        return format!("skipped: {why}");
    }
    v.get("summary").and_then(Value::as_str).map(str::to_string).or_else(|| v.as_str().map(str::to_string)).unwrap_or_else(|| v.to_string())
}

/// The scheduler loop (every 30 s) for a running server; aborted with the server.
pub fn spawn(ws: Workspace, bus: EventBus, helpers: crate::helper::Helpers) -> tokio::task::JoinHandle<()> {
    let off = std::env::var_os("ATLAS_NO_SCHEDULE").is_some();
    tokio::spawn(async move {
        if off {
            return;
        }
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
        let ahead = at(9, 0) + chrono::Duration::days(400);
        assert!(every.due(Some(ahead), at(9, 0)) && daily.due(Some(ahead), at(9, 0)), "a run recorded in the future");
    }

    #[test]
    fn a_slot_the_clocks_skip_runs_an_hour_later() {
        // 2026-03-08 02:30 does not exist in New York (02:00 → 03:00)
        let gap = chrono::NaiveDate::from_ymd_opt(2026, 3, 8).unwrap().and_hms_opt(2, 30, 0).unwrap();
        let ny: chrono_tz::Tz = "America/New_York".parse().unwrap();
        assert_eq!(daily_slot(gap, &ny).map(|d| d.naive_local().format("%H:%M").to_string()).as_deref(), Some("03:30"));
        let normal = gap + chrono::Duration::days(1);
        assert_eq!(daily_slot(normal, &ny).map(|d| d.naive_local()), Some(normal));
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

    #[test]
    fn a_synced_vaults_schedules_run_on_the_computers_named() {
        let mut a = crate::config::AutomationConfig::default();
        assert!(a.schedules_here("alice-desktop") && a.schedules_here(""), "none named: every computer, as before");
        a.schedules_on = vec!["Alice-Desktop".into()];
        assert!(a.schedules_here("alice-desktop"), "host names compare without case");
        assert!(!a.schedules_here("alice-laptop"), "the other computer leaves the generated files to it");
        a.run_schedules = false;
        assert!(!a.schedules_here("alice-desktop"), "off is off");
    }

    #[tokio::test]
    async fn a_job_runs_only_on_the_kind_of_core_its_background_names() {
        use crate::server_role::Seat;
        let d = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(d.path().join(".atlas/commands")).unwrap();
        for (id, bg) in [("bank", "server"), ("runs", "device"), ("plain", "any")] {
            std::fs::write(d.path().join(format!(".atlas/commands/{id}.toml")), format!("title = \"{id}\"\nrun = \"echo {id}\"\nschedule = \"every 2h\"\nbackground = \"{bg}\"\n")).unwrap();
        }
        let ran = |seat: Seat| {
            let d = d.path().to_path_buf();
            async move {
                let ws = Workspace::open(&d).unwrap();
                let _ = std::fs::remove_file(ws.cache_dir().join(STATE));
                tick_at(&ws, &EventBus::default(), None, Local::now(), seat).await;
                let mut ids: Vec<String> = records(&ws.cache_dir()).into_keys().collect();
                ids.sort();
                ids
            }
        };
        assert_eq!(ran(Seat::Server).await, ["bank", "plain"], "the server never runs a device's job");
        assert_eq!(ran(Seat::MirroredDevice).await, ["plain", "runs"], "a mirrored device leaves the server's jobs to it");
        assert_eq!(ran(Seat::LoneDevice).await, ["bank", "plain", "runs"], "no server: everything runs here");
        // the vault's own word wins over the command's
        std::fs::write(d.path().join(".atlas/config.toml"), "[automation.background]\nplain = \"device\"\nruns = \"any\"\n").unwrap();
        assert_eq!(ran(Seat::Server).await, ["bank", "runs"]);
    }

    #[tokio::test]
    async fn a_computer_not_named_runs_no_schedule() {
        let d = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(d.path().join(".atlas/commands")).unwrap();
        std::fs::write(d.path().join(".atlas/commands/stamp.toml"), "title = \"Stamp\"\nrun = \"echo stamped\"\nschedule = \"every 2h\"\n").unwrap();
        std::fs::write(d.path().join(".atlas/config.toml"), "[automation]\nschedules_on = [\"no-such-host.example.org\"]\n").unwrap();
        let ws = Workspace::open(d.path()).unwrap();
        tick(&ws, &EventBus::default(), None, Local::now()).await;
        assert!(records(&ws.cache_dir()).is_empty());
    }

    #[tokio::test]
    async fn a_skipped_run_is_logged_quietly_and_an_answer_carries_its_notices() {
        let d = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(d.path().join(".atlas/commands")).unwrap();
        let cmd = d.path().join(".atlas/commands/runs.toml");
        let answer = |json: &str| std::fs::write(&cmd, format!("title = \"Runs\"\nrun = '''echo '{json}''''\nschedule = \"every 1m\"\n")).unwrap();
        answer(r#"{"skipped": "iq not connected"}"#);
        let ws = Workspace::open(d.path()).unwrap();
        let bus = EventBus::default();
        let mut rx = bus.subscribe();
        tick(&ws, &bus, None, Local::now()).await;
        assert!(rx.try_recv().is_err(), "skipped: no notice");
        let r = records(&ws.cache_dir());
        assert!(r["runs"].ok && r["runs"].summary == "skipped: iq not connected", "{r:?}");
        answer(r#"{"summary": "1 fetched", "notices": [{"title": "Run finished: a_1", "level": "success", "open": "runs/a_1/a_1.md"}, {"nope": 1}]}"#);
        tick(&ws, &bus, None, Local::now() + chrono::Duration::minutes(6)).await;
        let Ok(Event::Notify(n)) = rx.try_recv() else { panic!("the answer's notice") };
        assert_eq!((n.title.as_str(), n.level, n.open.as_deref(), n.source.as_deref()), ("Run finished: a_1", Some(NoticeLevel::Success), Some("runs/a_1/a_1.md"), Some("runs")));
        assert!(rx.try_recv().is_err(), "a malformed notice is dropped");
        assert_eq!(records(&ws.cache_dir())["runs"].summary, "1 fetched");
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
        // three runs (the 5-minute floor apart), the same failure each time
        for m in [0, 6, 12] {
            tick(&ws, &bus, None, at(m)).await;
        }
        write("host unknown"); // another reason: said again
        tick(&ws, &bus, None, at(18)).await;
        let mut said = vec![];
        while let Ok(Event::Notify(n)) = rx.try_recv() {
            said.push(n.body.unwrap_or_default());
        }
        assert_eq!(said.len(), 2, "{said:?}");
        assert!(said[1].contains("host unknown"), "{said:?}");
    }
}

#[cfg(test)]
mod where_tests {
    use super::*;
    use crate::server_role::Seat;

    /// Settings' list says where each job runs by the same rules `tick` runs it by: its `background`, the vault's word
    /// over it, `schedules_on` and `run_schedules`.
    #[test]
    fn each_job_is_placed_as_tick_places_it() {
        let d = tempfile::tempdir().unwrap();
        let cmds = d.path().join(".atlas/commands");
        std::fs::create_dir_all(&cmds).unwrap();
        let cmd = |id: &str, extra: &str| std::fs::write(cmds.join(format!("{id}.toml")), format!("title = \"{id}\"\nrun = \"true\"\nschedule = \"every 2h\"\n{extra}")).unwrap();
        cmd("anywhere", "");
        cmd("feed", "background = \"server\"\n");
        cmd("round", "background = \"device\"\n");
        cmd("chosen", "background = \"server\"\n");
        std::fs::write(cmds.join("manual.toml"), "title = \"manual\"\nrun = \"true\"\n").unwrap();
        let mut cfg = crate::config::Config::load(d.path()).unwrap();
        cfg.automation.background.insert("chosen".into(), crate::server_role::Background::Any);
        let places = |cfg: &crate::config::Config, host: &str, seat| {
            let mut v: Vec<(String, JobPlace)> = where_jobs_at(d.path(), cfg, host, seat).into_iter().map(|j| (j.id, j.place)).collect();
            v.sort();
            v
        };
        use JobPlace::*;
        let s = |v: [(&str, JobPlace); 4]| v.map(|(a, b)| (a.to_string(), b)).to_vec();
        assert_eq!(places(&cfg, "laptop", Seat::MirroredDevice), s([("anywhere", Here), ("chosen", Here), ("feed", Server), ("round", Here)]), "a command with no schedule is not listed");
        assert_eq!(places(&cfg, "laptop", Seat::LoneDevice), s([("anywhere", Here), ("chosen", Here), ("feed", Here), ("round", Here)]));
        assert_eq!(places(&cfg, "box", Seat::Server), s([("anywhere", Here), ("chosen", Here), ("feed", Here), ("round", Devices)]));
        cfg.automation.schedules_on = vec!["desk".into()];
        assert!(places(&cfg, "laptop", Seat::LoneDevice).iter().all(|(_, p)| *p == OtherComputers));
        assert_eq!(where_jobs_at(d.path(), &cfg, "laptop", Seat::LoneDevice)[0].words, "on desk");
        cfg.automation.run_schedules = false;
        assert!(places(&cfg, "desk", Seat::LoneDevice).iter().all(|(_, p)| *p == Off));
    }
}
