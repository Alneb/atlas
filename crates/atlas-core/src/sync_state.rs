//! One vault's sync state, in plain words (DESIGN-server-role.md, "The phone, adrift"): whether it has a mirror and
//! whether that server answers, when this copy last caught up and how, the writes the server refused (this copy behind,
//! or the path held by another device), what carries the bytes (Syncthing or the mirror, `mirror_guard::Bytes`), what
//! waits, and how many conflict copies are left. `GET /api/sync/state` answers it; the desktop's Settings → Vaults & sync
//! and the phone's vault list show its `words`, so both say the same thing.
//!
//! Recorded where the work already happens — the mirror guard's lease asks and its catch-up thread (mirror_guard.rs) —
//! never by a second probe. Failures also become notices (`Event::Notify`, source `sync`), each id told once until it
//! clears or [`RETELL`] passes, so a server that stays down makes one notice, not one a minute.
use crate::api::{Event, Notice, NoticeLevel};
use crate::events::EventBus;
use crate::mirror_guard::Bytes;
use crate::server_role::Seat;
use serde::Serialize;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, LazyLock, Mutex};
use std::time::{Duration, Instant};

/// A failure already told is told again only after this long (a server down all day: one notice in the morning, one
/// in the afternoon), or once it cleared and came back.
pub const RETELL: Duration = Duration::from_secs(6 * 3600);

/// How many refused writes the state keeps by name (the newest); the count covers all of them.
const KEEP_REFUSED: usize = 5;

/// Whether the vault's server answered the last time this core asked it.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, ts_rs::TS)]
#[serde(rename_all = "lowercase")]
#[ts(export)]
pub enum Reach {
    /// Not asked since this core started (no write, no catch-up yet).
    #[default]
    Unknown,
    Answers,
    /// The server's sign-in gate turned the request away: a sign-in is needed (writes stay here meanwhile).
    Signin,
    /// No answer at all (no network, the server down).
    Offline,
}

/// Why a write's lease was refused.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, ts_rs::TS)]
#[serde(tag = "why", rename_all = "lowercase")]
#[ts(export)]
pub enum Refused {
    /// This copy was older than the server's last version: the change, computed from the old one, was not written.
    Behind { newer: Newer },
    /// Another device held the path's lease for longer than the write could wait.
    Held { by: String },
}

/// Where the server's newer version is, when a write was refused as behind.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, ts_rs::TS)]
#[serde(rename_all = "snake_case")]
#[ts(export)]
pub enum Newer {
    /// Fetched here at once (the mirror carries the files): it can be looked at now.
    Here,
    /// This device's Syncthing carries the files and has not brought it yet.
    Syncthing,
    /// The server's table has it but its disk not yet (still arriving there from the device that wrote it).
    ServerDisk,
}

/// One refused write.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, ts_rs::TS)]
#[ts(export)]
pub struct Refusal {
    pub path: String,
    #[serde(flatten)]
    pub refused: Refused,
    /// Milliseconds since 1970.
    #[ts(type = "number")]
    pub at: u64,
}

/// The last catch-up: what it brought, or why it failed.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, ts_rs::TS)]
#[ts(export)]
pub struct CatchUp {
    #[ts(type = "number")]
    pub at: u64,
    /// Files brought from the server; absent when it failed.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub brought: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub error: Option<String>,
}

/// What the guard and the catch-up saw, since this core started.
#[derive(Debug, Clone, Default)]
struct Seen {
    reach: Reach,
    why: Option<String>,
    caught_up: Option<CatchUp>,
    refused: Vec<Refusal>,
    refused_count: u32,
    /// writes made with the server unreachable, since it last answered
    here_only: u32,
}

/// One vault's live state in this process, and the bus its notices go to (none in a process that serves no page:
/// the CLI, `atlas mcp`).
#[derive(Default)]
pub struct SyncState {
    seen: Mutex<Seen>,
    bus: Mutex<Option<EventBus>>,
    told: Mutex<HashMap<String, Instant>>,
}

fn now_ms() -> u64 {
    std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map_or(0, |d| d.as_millis() as u64)
}

/// What a refused write's notice says: what happened, then what to do.
pub fn refusal_words(refused: &Refused) -> String {
    match refused {
        Refused::Behind { newer: Newer::Here } => {
            "The server had a newer version of it, written on another device. That version is here now: look at it and make your change again.".into()
        }
        Refused::Behind { newer: Newer::ServerDisk } => {
            "The server has a newer version of it, written on another device, that is still reaching the server's disk. Save again in a minute.".into()
        }
        Refused::Behind { newer: Newer::Syncthing } => "The server has a newer version of it, written on another device, which Syncthing has not brought here yet. \
             Make your change again once it arrives; if it does not come within a minute, check that Syncthing runs on this device and that neither \
             the folder nor the other device is paused (the vault's sync line says which)."
            .into(),
        Refused::Held { by } => format!("{by} was writing it, longer than this save could wait. Save again in a moment."),
    }
}

/// The vaults this process tracks, by root (as `Workspace::root` spells it).
static BY_VAULT: LazyLock<Mutex<HashMap<PathBuf, Arc<SyncState>>>> = LazyLock::new(Default::default);

impl SyncState {
    /// The state of the vault at `root`, made on first use.
    pub fn of(root: &Path) -> Arc<SyncState> {
        BY_VAULT.lock().unwrap_or_else(|e| e.into_inner()).entry(root.to_path_buf()).or_default().clone()
    }

    /// Whether this process tracks `root` (a vault it serves or guards); a vault only on the list is not watched here.
    fn tracked(root: &Path) -> Option<Arc<SyncState>> {
        BY_VAULT.lock().unwrap_or_else(|e| e.into_inner()).get(root).cloned()
    }

    /// The vault's event bus: its notices go to its pages (and the system) from now on.
    pub fn attach(&self, bus: EventBus) {
        *self.bus.lock().unwrap_or_else(|e| e.into_inner()) = Some(bus);
    }

    fn seen(&self) -> std::sync::MutexGuard<'_, Seen> {
        self.seen.lock().unwrap_or_else(|e| e.into_inner())
    }

    /// The server answered a lease ask or a catch-up: its failure notices are cleared.
    pub fn answered(&self) {
        {
            let mut s = self.seen();
            s.reach = Reach::Answers;
            s.why = None;
            s.here_only = 0;
        }
        self.clear("sync:server");
    }

    /// The server could not be asked: `signin` when its gate wants a sign-in.
    pub fn unreachable(&self, host: &str, why: &str, signin: bool) {
        {
            let mut s = self.seen();
            s.reach = if signin { Reach::Signin } else { Reach::Offline };
            s.why = Some(why.to_string());
        }
        let notice = if signin {
            Notice::new(format!("Sign in to {host} to keep this vault in step"))
                .body(format!("Its sign-in gate turned the core away ({why}). Notes are written on this device meanwhile; they reach the server once you sign in (Settings → Vaults & sync)."))
        } else {
            Notice::new(format!("{host} does not answer"))
                .body(format!("The vault's server could not be reached ({why}). Notes are written on this device meanwhile, and merged when it answers again."))
        };
        self.tell("sync:server", notice.level(NoticeLevel::Warning));
    }

    /// A write made with the server unreachable (no lease): it reaches the server later, by Syncthing or a merge.
    pub fn written_here_only(&self) {
        self.seen().here_only += 1;
    }

    /// A write's lease refused.
    pub fn refused(&self, path: &str, refused: Refused) {
        {
            let mut s = self.seen();
            s.refused_count += 1;
            s.refused.retain(|r| r.path != path);
            s.refused.push(Refusal { path: path.to_string(), refused: refused.clone(), at: now_ms() });
            let extra = s.refused.len().saturating_sub(KEEP_REFUSED);
            s.refused.drain(..extra);
        }
        let notice = Notice::new(format!("{path} was not saved")).body(refusal_words(&refused));
        self.tell(&format!("sync:refused:{path}"), notice.level(NoticeLevel::Warning).open(path));
    }

    /// A catch-up ran: `Ok(files brought)`, or why it failed. A failure is told by [`SyncState::unreachable`].
    pub fn caught_up(&self, outcome: std::result::Result<usize, String>) {
        let at = now_ms();
        let c = match outcome {
            Ok(n) => CatchUp { at, brought: Some(n as u32), error: None },
            Err(e) => CatchUp { at, brought: None, error: Some(e) },
        };
        self.seen().caught_up = Some(c);
    }

    /// Publishes `notice` under `id` unless told within [`RETELL`]; true when it was published (or would be, with no
    /// bus: the dedupe is the same).
    fn tell(&self, id: &str, notice: Notice) -> bool {
        {
            let mut told = self.told.lock().unwrap_or_else(|e| e.into_inner());
            if told.get(id).is_some_and(|at| at.elapsed() < RETELL) {
                return false;
            }
            told.insert(id.to_string(), Instant::now());
        }
        if let Some(bus) = self.bus.lock().unwrap_or_else(|e| e.into_inner()).as_ref() {
            bus.publish(Event::Notify(notice.source("sync").id(id)));
        }
        true
    }

    /// The failure under `id` is over: the next one is news.
    fn clear(&self, id: &str) {
        self.told.lock().unwrap_or_else(|e| e.into_inner()).remove(id);
    }
}

/// `GET /api/sync/state`: everything [`words`] says, and the facts it says it from.
#[derive(Debug, Clone, Serialize, ts_rs::TS)]
#[ts(export)]
pub struct SyncStatus {
    pub path: String,
    pub seat: Seat,
    /// The server vault holding this folder's copy (the vault list's `mirror`).
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub mirror: Option<String>,
    /// A Syncthing folder (its `.stfolder` at the root).
    pub syncthing: bool,
    /// With a mirror: who moves the bytes.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub bytes: Option<Bytes>,
    /// This process serves or guards the vault, so the live facts below are known; false: only on the list here.
    pub open: bool,
    pub server: Reach,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub server_why: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub caught_up: Option<CatchUp>,
    /// The newest refused writes (at most five); `refused_count` counts all since start.
    pub refused: Vec<Refusal>,
    pub refused_count: u32,
    /// Writes made with the server unreachable, since it last answered.
    pub here_only: u32,
    /// Captures this device keeps for another device's hooks (`.atlas/pending`) or waits on (`.atlas/cache`).
    pub captures_waiting: u32,
    /// Syncthing conflict copies left for the user (sync_merge.rs `left_copies`).
    pub conflict_copies: u32,
    /// What this device's Syncthing says of the folder (syncthing_here.rs), for a Syncthing folder whose config is
    /// found here; absent otherwise.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub syncthing_here: Option<crate::syncthing_here::SyncthingHere>,
    pub level: NoticeLevel,
    /// The one line both apps show.
    pub words: String,
}

/// The state of the vault at `root` now.
pub fn status(root: &Path) -> SyncStatus {
    let mirror = crate::mirror_guard::mirror_of(root);
    let seat = Seat::of(root);
    let syncthing = Bytes::of(root) == Bytes::Syncthing;
    let live = SyncState::tracked(root).map(|s| s.seen().clone());
    let mut st = SyncStatus {
        path: root.to_string_lossy().into_owned(),
        seat,
        bytes: mirror.as_ref().map(|_| Bytes::of(root)),
        mirror,
        syncthing,
        open: live.is_some(),
        server: Reach::Unknown,
        server_why: None,
        caught_up: None,
        refused: vec![],
        refused_count: 0,
        here_only: 0,
        captures_waiting: crate::capture::waiting_here(root) as u32,
        conflict_copies: crate::sync_merge::left_copies(root, None).len() as u32,
        syncthing_here: if syncthing { crate::syncthing_here::of(root) } else { None },
        level: NoticeLevel::Info,
        words: String::new(),
    };
    if let Some(s) = live {
        (st.server, st.server_why, st.caught_up, st.refused, st.refused_count, st.here_only) = (s.reach, s.why, s.caught_up, s.refused, s.refused_count, s.here_only);
    }
    (st.level, st.words) = words(&st, now_ms());
    st
}

/// `https://notes.example.org/v/x/` → `notes.example.org`.
fn host(address: &str) -> &str {
    let rest = address.split_once("://").map_or(address, |(_, r)| r);
    rest.split('/').next().unwrap_or(rest)
}

/// "just now", "4 min ago", "2 h ago", "3 days ago".
fn ago(at: u64, now: u64) -> String {
    let s = now.saturating_sub(at) / 1000;
    match s {
        0..60 => "just now".into(),
        60..3600 => format!("{} min ago", s / 60),
        3600..86400 => format!("{} h ago", s / 3600),
        _ => format!("{} days ago", s / 86400),
    }
}

fn plural(n: u32, one: &str, many: &str) -> String {
    format!("{n} {}", if n == 1 { one } else { many })
}

/// The server's reason, short enough for the line: its first clause, at most 60 characters.
fn short(why: &str) -> String {
    let first = why.split([';', '\n']).next().unwrap_or(why).trim();
    if first.chars().count() > 60 { format!("{}…", first.chars().take(59).collect::<String>()) } else { first.to_string() }
}

/// What this device's Syncthing says, when it is news: what happened and what to do.
fn syncthing_words(here: &crate::syncthing_here::SyncthingHere) -> Option<String> {
    use crate::syncthing_here::SyncthingHere as H;
    match here {
        H::Runs => None,
        H::NotRunning => Some("Syncthing is not running on this device: changes wait here until it is started".into()),
        H::FolderPaused { label } => Some(format!("Syncthing has the folder \"{label}\" paused: resume it there, or nothing comes or goes")),
        H::DevicesPaused { names } => Some(format!("Syncthing has {} paused: resume it there, or changes do not reach it", names.join(", "))),
        H::NotShared => Some("this device's Syncthing shares no folder holding this vault, though it has a .stfolder: add the folder in Syncthing".into()),
    }
}

/// The status line, and how much it needs looking at: what carries the vault, whether its server answers, then only
/// what is worth saying (a catch-up, refused writes, writes or captures waiting, conflict copies). Every warning says
/// what happened and what to do about it.
pub fn words(s: &SyncStatus, now: u64) -> (NoticeLevel, String) {
    let mut level = NoticeLevel::Info;
    let warn = |l: &mut NoticeLevel| *l = NoticeLevel::Warning;
    let mut parts: Vec<String> = vec![];
    match (&s.seat, &s.mirror) {
        (Seat::Server, _) => parts.push(if s.syncthing { "The server's copy, shared by Syncthing".into() } else { "The server's copy".into() }),
        (_, None) => parts.push(if s.syncthing { "Shared by Syncthing, no server".into() } else { "On this device only".into() }),
        (_, Some(m)) if !s.open => parts.push(format!("Mirrored on {}; not open here, so not followed", host(m))),
        (_, Some(m)) => {
            let h = host(m);
            let why = s.server_why.as_deref().map(|w| format!(" ({})", short(w))).unwrap_or_default();
            parts.push(match s.server {
                Reach::Unknown => format!("Mirrored on {h}, not asked yet"),
                Reach::Answers => format!("{h} answers"),
                Reach::Signin => {
                    warn(&mut level);
                    format!("Sign in to {h}: its sign-in gate turned this device away, so writes stay here until you do")
                }
                Reach::Offline => {
                    warn(&mut level);
                    format!("{h} does not answer{why}: writes stay on this device and reach it when it answers again")
                }
            });
            parts.push(match s.bytes {
                Some(Bytes::Syncthing) => "Syncthing carries the files".into(),
                _ => "the mirror carries the files".into(),
            });
            match &s.caught_up {
                // a failure while the server answers is news of its own; else the line above already says why
                Some(CatchUp { at, error: Some(e), .. }) if s.server == Reach::Answers => {
                    warn(&mut level);
                    parts.push(format!("catch-up failed {} ({}): newer copies from the server may be missing here", ago(*at, now), short(e)));
                }
                Some(CatchUp { at, error: Some(_), .. }) => parts.push(format!("catch-up failed {}", ago(*at, now))),
                Some(CatchUp { at, brought: Some(n), .. }) if *n > 0 => parts.push(format!("caught up {} ({} brought)", ago(*at, now), plural(*n, "file", "files"))),
                Some(CatchUp { at, .. }) => parts.push(format!("caught up {}", ago(*at, now))),
                None => {}
            }
        }
    }
    if let Some(w) = s.syncthing_here.as_ref().and_then(syncthing_words) {
        warn(&mut level);
        parts.push(w);
    }
    if s.refused_count > 0 {
        warn(&mut level);
        let n = plural(s.refused_count, "write", "writes");
        parts.push(match s.refused.last() {
            Some(r) => {
                let what = match &r.refused {
                    Refused::Behind { newer: Newer::Here } => "the server had a newer copy, now here: open it and make the change again".to_string(),
                    Refused::Behind { newer: Newer::ServerDisk } => "the server's newer copy is still reaching its disk: save again in a minute".to_string(),
                    Refused::Behind { newer: Newer::Syncthing } => "the server has a newer copy Syncthing has not brought yet: make the change again once it arrives".to_string(),
                    Refused::Held { by } => format!("{by} was writing it: save again"),
                };
                format!("{n} not saved, the last {} ({}): {what}", r.path, ago(r.at, now))
            }
            None => format!("{n} not saved"),
        });
    }
    if s.here_only > 0 {
        parts.push(format!("{} made here only, sent when the server answers", plural(s.here_only, "write", "writes")));
    }
    if s.captures_waiting > 0 {
        parts.push(format!("{} waiting", plural(s.captures_waiting, "capture", "captures")));
    }
    if s.conflict_copies > 0 {
        warn(&mut level);
        parts.push(format!("{} to settle: open Sync conflicts", plural(s.conflict_copies, "conflict copy", "conflict copies")));
    }
    if level == NoticeLevel::Info && s.server == Reach::Answers {
        level = NoticeLevel::Success;
    }
    (level, parts.join(" · "))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn status(seat: Seat, mirror: Option<&str>, syncthing: bool) -> SyncStatus {
        SyncStatus {
            path: "/home/u/notes".into(),
            seat,
            mirror: mirror.map(str::to_string),
            syncthing,
            bytes: mirror.map(|_| if syncthing { Bytes::Syncthing } else { Bytes::Mirror }),
            open: true,
            server: Reach::Unknown,
            server_why: None,
            caught_up: None,
            refused: vec![],
            refused_count: 0,
            here_only: 0,
            captures_waiting: 0,
            conflict_copies: 0,
            syncthing_here: None,
            level: NoticeLevel::Info,
            words: String::new(),
        }
    }

    const NOW: u64 = 1_800_000_000_000;
    const MIN: u64 = 60_000;

    #[test]
    fn the_status_line_says_what_carries_the_vault_and_whether_its_server_answers() {
        assert_eq!(words(&status(Seat::LoneDevice, None, false), NOW), (NoticeLevel::Info, "On this device only".into()));
        assert_eq!(words(&status(Seat::LoneDevice, None, true), NOW).1, "Shared by Syncthing, no server");
        assert_eq!(words(&status(Seat::Server, None, true), NOW).1, "The server's copy, shared by Syncthing");

        let mut s = status(Seat::MirroredDevice, Some("https://notes.example.org/v/notes/"), true);
        assert_eq!(words(&s, NOW).1, "Mirrored on notes.example.org, not asked yet · Syncthing carries the files");
        s.server = Reach::Answers;
        assert_eq!(words(&s, NOW), (NoticeLevel::Success, "notes.example.org answers · Syncthing carries the files".into()));
        s.server = Reach::Signin;
        assert_eq!(
            words(&s, NOW),
            (NoticeLevel::Warning, "Sign in to notes.example.org: its sign-in gate turned this device away, so writes stay here until you do · Syncthing carries the files".into())
        );

        let mut m = status(Seat::MirroredDevice, Some("https://notes.example.org/v/notes/"), false);
        m.server = Reach::Offline;
        m.server_why = Some("connection refused; retried later".into());
        m.caught_up = Some(CatchUp { at: NOW - 3 * MIN, brought: None, error: Some("timed out".into()) });
        m.here_only = 2;
        assert_eq!(
            words(&m, NOW),
            (NoticeLevel::Warning, "notes.example.org does not answer (connection refused): writes stay on this device and reach it when it answers again · the mirror carries the files · catch-up failed 3 min ago · 2 writes made here only, sent when the server answers".into())
        );
        m.open = false;
        assert_eq!(words(&m, NOW).1, "Mirrored on notes.example.org; not open here, so not followed · 2 writes made here only, sent when the server answers");
    }

    #[test]
    fn the_status_line_names_what_is_left_to_look_at() {
        let mut s = status(Seat::MirroredDevice, Some("https://notes.example.org/"), false);
        s.server = Reach::Answers;
        s.caught_up = Some(CatchUp { at: NOW - 2 * 3600 * 1000, brought: Some(1), error: None });
        assert_eq!(words(&s, NOW), (NoticeLevel::Success, "notes.example.org answers · the mirror carries the files · caught up 2 h ago (1 file brought)".into()));
        s.caught_up = Some(CatchUp { at: NOW - 10_000, brought: Some(0), error: None });
        s.refused_count = 3;
        s.refused = vec![Refusal { path: "a.md".into(), refused: Refused::Held { by: "phone-1a2b".into() }, at: NOW - MIN }];
        s.captures_waiting = 1;
        s.conflict_copies = 2;
        assert_eq!(
            words(&s, NOW),
            (
                NoticeLevel::Warning,
                "notes.example.org answers · the mirror carries the files · caught up just now · 3 writes not saved, the last a.md (1 min ago): phone-1a2b was writing it: save again · 1 capture waiting · 2 conflict copies to settle: open Sync conflicts".into()
            )
        );
    }

    #[test]
    fn a_failing_server_makes_one_notice_until_it_answers_again() {
        let st = SyncState::default();
        let bus = EventBus::default();
        let mut rx = bus.subscribe();
        st.attach(bus);
        for _ in 0..5 {
            st.unreachable("notes.example.org", "connection refused", false);
        }
        st.written_here_only();
        let Ok(Event::Notify(n)) = rx.try_recv() else { panic!("one notice") };
        assert_eq!((n.id.as_deref(), n.source.as_deref(), n.level), (Some("sync:server"), Some("sync"), Some(NoticeLevel::Warning)));
        assert!(rx.try_recv().is_err(), "the same failure is told once");
        assert_eq!(st.seen().here_only, 1);

        st.answered();
        let seen = st.seen().clone(); // one guard: the mutex is not reentrant
        assert_eq!((seen.reach, seen.here_only), (Reach::Answers, 0));
        st.unreachable("notes.example.org", "302", true);
        let Ok(Event::Notify(n)) = rx.try_recv() else { panic!("news again once it had answered") };
        assert!(n.title.starts_with("Sign in to notes.example.org"));
    }

    #[test]
    fn a_refused_write_is_told_once_per_path_and_the_newest_are_kept() {
        let st = SyncState::default();
        let bus = EventBus::default();
        let mut rx = bus.subscribe();
        st.attach(bus);
        st.refused("a.md", Refused::Behind { newer: Newer::Syncthing });
        st.refused("a.md", Refused::Behind { newer: Newer::Syncthing });
        st.refused("b.md", Refused::Held { by: "phone".into() });
        let ids: Vec<_> = std::iter::from_fn(|| match rx.try_recv() {
            Ok(Event::Notify(n)) => Some(n.id.unwrap_or_default()),
            _ => None,
        })
        .collect();
        assert_eq!(ids, ["sync:refused:a.md", "sync:refused:b.md"]);
        for i in 0..10 {
            st.refused(&format!("n{i}.md"), Refused::Behind { newer: Newer::Syncthing });
        }
        let s = st.seen().clone();
        assert_eq!((s.refused_count, s.refused.len(), s.refused.last().map(|r| r.path.as_str())), (13, KEEP_REFUSED, Some("n9.md")));
    }

    #[test]
    fn a_write_refused_as_behind_says_where_the_newer_copy_is_and_what_to_do() {
        let mut s = status(Seat::MirroredDevice, Some("https://notes.example.org/"), true);
        s.server = Reach::Answers;
        s.refused_count = 1;
        let said = |s: &SyncStatus| words(s, NOW).1.split(" · ").last().unwrap().to_string();
        s.refused = vec![Refusal { path: "a.md".into(), refused: Refused::Behind { newer: Newer::Syncthing }, at: NOW }];
        assert_eq!(said(&s), "1 write not saved, the last a.md (just now): the server has a newer copy Syncthing has not brought yet: make the change again once it arrives");
        s.refused[0].refused = Refused::Behind { newer: Newer::Here };
        assert_eq!(said(&s), "1 write not saved, the last a.md (just now): the server had a newer copy, now here: open it and make the change again");
        s.refused[0].refused = Refused::Behind { newer: Newer::ServerDisk };
        assert_eq!(said(&s), "1 write not saved, the last a.md (just now): the server's newer copy is still reaching its disk: save again in a minute");
        // the writer's error and the notice: what happened, then what to do, Syncthing named as the thing to check
        let w = refusal_words(&Refused::Behind { newer: Newer::Syncthing });
        assert!(w.contains("Syncthing has not brought here yet") && w.contains("check that Syncthing runs on this device"), "{w}");
    }

    #[test]
    fn this_devices_syncthing_is_named_when_it_stops_the_files() {
        use crate::syncthing_here::SyncthingHere as H;
        let mut s = status(Seat::LoneDevice, None, true);
        s.syncthing_here = Some(H::Runs);
        assert_eq!(words(&s, NOW), (NoticeLevel::Info, "Shared by Syncthing, no server".into()), "running: nothing to say");
        s.syncthing_here = Some(H::NotRunning);
        assert_eq!(
            words(&s, NOW),
            (NoticeLevel::Warning, "Shared by Syncthing, no server · Syncthing is not running on this device: changes wait here until it is started".into())
        );
        s.syncthing_here = Some(H::FolderPaused { label: "Notes".into() });
        assert_eq!(words(&s, NOW).1, "Shared by Syncthing, no server · Syncthing has the folder \"Notes\" paused: resume it there, or nothing comes or goes");
        s.syncthing_here = Some(H::DevicesPaused { names: vec!["phone".into()] });
        assert_eq!(words(&s, NOW).1, "Shared by Syncthing, no server · Syncthing has phone paused: resume it there, or changes do not reach it");
        s.syncthing_here = Some(H::NotShared);
        assert!(words(&s, NOW).1.ends_with("add the folder in Syncthing"));
    }

    #[test]
    fn a_catch_up_failing_while_the_server_answers_is_a_warning_with_its_reason() {
        let mut s = status(Seat::MirroredDevice, Some("https://notes.example.org/"), false);
        s.server = Reach::Answers;
        s.caught_up = Some(CatchUp { at: NOW - MIN, brought: None, error: Some("500 Internal Server Error".into()) });
        assert_eq!(
            words(&s, NOW),
            (NoticeLevel::Warning, "notes.example.org answers · the mirror carries the files · catch-up failed 1 min ago (500 Internal Server Error): newer copies from the server may be missing here".into())
        );
    }
}
