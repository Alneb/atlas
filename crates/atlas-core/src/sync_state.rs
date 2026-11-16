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
    Behind,
    /// Another device held the path's lease for longer than the write could wait.
    Held { by: String },
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
        let notice = match &refused {
            Refused::Behind => Notice::new(format!("{path} was not saved: this copy was behind"))
                .body("The server had a newer version of it. The newer version is brought here; look at it and make the change again."),
            Refused::Held { by } => Notice::new(format!("{path} was not saved: {by} is writing it"))
                .body(format!("{by} held the note longer than this write could wait. Try again in a moment.")),
        };
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

/// The status line, and how much it needs looking at: what carries the vault, whether its server answers, then only
/// what is worth saying (a catch-up, refused writes, writes or captures waiting, conflict copies).
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
            parts.push(match s.server {
                Reach::Unknown => format!("Mirrored on {h}, not asked yet"),
                Reach::Answers => format!("{h} answers"),
                Reach::Signin => {
                    warn(&mut level);
                    format!("Sign in to {h}: writes stay here meanwhile")
                }
                Reach::Offline => {
                    warn(&mut level);
                    format!("{h} does not answer: writes stay here")
                }
            });
            parts.push(match s.bytes {
                Some(Bytes::Syncthing) => "Syncthing carries the files".into(),
                _ => "the mirror carries the files".into(),
            });
            match &s.caught_up {
                Some(CatchUp { at, error: Some(_), .. }) => parts.push(format!("catch-up failed {}", ago(*at, now))),
                Some(CatchUp { at, brought: Some(n), .. }) if *n > 0 => parts.push(format!("caught up {} ({} brought)", ago(*at, now), plural(*n, "file", "files"))),
                Some(CatchUp { at, .. }) => parts.push(format!("caught up {}", ago(*at, now))),
                None => {}
            }
        }
    }
    if s.refused_count > 0 {
        warn(&mut level);
        let last = s.refused.last().map(|r| match &r.refused {
            Refused::Behind => format!(", the last as behind ({})", ago(r.at, now)),
            Refused::Held { by } => format!(", the last held by {by} ({})", ago(r.at, now)),
        });
        parts.push(format!("{} refused{}", plural(s.refused_count, "write", "writes"), last.unwrap_or_default()));
    }
    if s.here_only > 0 {
        parts.push(format!("{} made here only", plural(s.here_only, "write", "writes")));
    }
    if s.captures_waiting > 0 {
        parts.push(format!("{} waiting", plural(s.captures_waiting, "capture", "captures")));
    }
    if s.conflict_copies > 0 {
        warn(&mut level);
        parts.push(format!("{} to settle", plural(s.conflict_copies, "conflict copy", "conflict copies")));
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
        assert_eq!(words(&s, NOW), (NoticeLevel::Warning, "Sign in to notes.example.org: writes stay here meanwhile · Syncthing carries the files".into()));

        let mut m = status(Seat::MirroredDevice, Some("https://notes.example.org/v/notes/"), false);
        m.server = Reach::Offline;
        m.caught_up = Some(CatchUp { at: NOW - 3 * MIN, brought: None, error: Some("timed out".into()) });
        m.here_only = 2;
        assert_eq!(
            words(&m, NOW),
            (NoticeLevel::Warning, "notes.example.org does not answer: writes stay here · the mirror carries the files · catch-up failed 3 min ago · 2 writes made here only".into())
        );
        m.open = false;
        assert_eq!(words(&m, NOW).1, "Mirrored on notes.example.org; not open here, so not followed · 2 writes made here only");
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
                "notes.example.org answers · the mirror carries the files · caught up just now · 3 writes refused, the last held by phone-1a2b (1 min ago) · 1 capture waiting · 2 conflict copies to settle".into()
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
        st.refused("a.md", Refused::Behind);
        st.refused("a.md", Refused::Behind);
        st.refused("b.md", Refused::Held { by: "phone".into() });
        let ids: Vec<_> = std::iter::from_fn(|| match rx.try_recv() {
            Ok(Event::Notify(n)) => Some(n.id.unwrap_or_default()),
            _ => None,
        })
        .collect();
        assert_eq!(ids, ["sync:refused:a.md", "sync:refused:b.md"]);
        for i in 0..10 {
            st.refused(&format!("n{i}.md"), Refused::Behind);
        }
        let s = st.seen().clone();
        assert_eq!((s.refused_count, s.refused.len(), s.refused.last().map(|r| r.path.as_str())), (13, KEEP_REFUSED, Some("n9.md")));
    }
}
