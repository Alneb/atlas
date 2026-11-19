//! Notices to the system (docs/design/DESIGN-notifications.md, "Delivery to the system"): every `Event::Notify` is a
//! toast on the open pages; this module decides whether it also becomes a system notification and hands it to the
//! platform's [`Notifier`]. The rules are the same on every device; only the notifier differs.
use crate::api::{Notice, NoticeLevel};
use crate::config::{NotificationsConfig, SystemNotices};
use crate::events::{EventBus, ToSystem};
use crate::Workspace;
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, AtomicI64, AtomicU64, Ordering};
use std::sync::{Arc, LazyLock, Mutex};

/// Whether a notice goes to the system. `looked_at`: a page of this core is visible and focused; `muted`: its source
/// is switched off (the person's own word, over everything).
pub fn shown(mode: SystemNotices, n: &Notice, looked_at: bool, muted: bool) -> bool {
    let failure = n.level == Some(NoticeLevel::Failure);
    !muted
        && match mode {
            SystemNotices::Off => false,
            SystemNotices::Failures => failure,
            SystemNotices::Away => failure || !looked_at,
            SystemNotices::Always => true,
        }
}

/// The pages of this process and whether each is looked at, as they report it on their event socket (`seen`). Kept
/// per process, not per vault: a focused window of one vault means the person is looking at Atlas. With them, when the
/// person last used this device (`active_at`): a page coming into focus, and the system's idle state sampled once a
/// minute (`watch`, platform/idle.rs) — the presence the planner of nudges weighs (DESIGN-calendar-tasks-nudges §3.2).
#[derive(Default)]
pub struct Presence {
    pages: Mutex<HashMap<u64, bool>>,
    next: AtomicU64,
    /// ms since the epoch; 0 while unknown
    active: AtomicI64,
}

/// One page's place in [`Presence`]; gone with its socket.
pub struct Page {
    presence: Arc<Presence>,
    id: u64,
}

impl Presence {
    /// The process's own, shared by every vault it serves.
    pub fn global() -> Arc<Presence> {
        static ONE: LazyLock<Arc<Presence>> = LazyLock::new(Arc::default);
        ONE.clone()
    }

    /// A page connected: not looked at until it says so.
    pub fn join(self: &Arc<Self>) -> Page {
        let id = self.next.fetch_add(1, Ordering::Relaxed);
        self.pages.lock().unwrap().insert(id, false);
        Page { presence: self.clone(), id }
    }

    pub fn looked_at(&self) -> bool {
        self.pages.lock().unwrap().values().any(|&v| v)
    }

    /// The pages of one vault (the global one counts every vault's): whether a window shows it at all, for the work
    /// that can slow down while none does (the mirror's catch-up, DESIGN-server-role.md "Two vaults").
    pub fn of_vault(root: &std::path::Path) -> Arc<Presence> {
        static BY_VAULT: LazyLock<Mutex<HashMap<std::path::PathBuf, Arc<Presence>>>> = LazyLock::new(Default::default);
        BY_VAULT.lock().unwrap_or_else(|e| e.into_inner()).entry(root.to_path_buf()).or_default().clone()
    }

    /// Whether any page is connected, looked at or not (a window in the background still shows the vault).
    pub fn connected(&self) -> bool {
        !self.pages.lock().unwrap().is_empty()
    }

    /// When the person last used this device (ms since the epoch), as far as it is known.
    pub fn active_at(&self) -> Option<i64> {
        Some(self.active.load(Ordering::Relaxed)).filter(|&t| t > 0)
    }

    fn active_by(&self, t: i64) {
        self.active.fetch_max(t, Ordering::Relaxed);
    }

    /// One sample of the system's idle state at `now`: in use is now; idle since a moment is that moment; idle since
    /// an unknown moment keeps the last; no answer leaves it to the pages (a page looked at is in use).
    pub fn sampled(&self, idle: Option<crate::platform::idle::Idle>, now: i64) {
        use crate::platform::idle::Idle;
        match idle {
            Some(Idle::No) => self.active_by(now),
            Some(Idle::Since(Some(t))) => self.active_by(t.min(now)),
            Some(Idle::Since(None)) => {}
            None if self.looked_at() => self.active_by(now),
            None => {}
        }
    }

    /// Samples the system's idle state now and once a minute, for the life of the process (once per process).
    pub fn watch(self: &Arc<Self>) {
        static STARTED: AtomicBool = AtomicBool::new(false);
        if STARTED.swap(true, Ordering::Relaxed) {
            return;
        }
        let me = self.clone();
        let spawned = std::thread::Builder::new().name("presence".into()).spawn(move || loop {
            me.sampled(crate::platform::idle::idle(), chrono::Utc::now().timestamp_millis());
            std::thread::sleep(std::time::Duration::from_secs(60));
        });
        if let Err(e) = spawned {
            eprintln!("atlas: presence: not watched: {e}");
        }
    }
}

impl Page {
    /// What the page reported: visible and focused, or not.
    pub fn seen(&self, looked_at: bool) {
        self.presence.pages.lock().unwrap().insert(self.id, looked_at);
        if looked_at {
            self.presence.active_by(chrono::Utc::now().timestamp_millis());
        }
    }
}

impl Drop for Page {
    fn drop(&mut self) {
        self.presence.pages.lock().unwrap().remove(&self.id);
    }
}

/// What a page sends on its event socket: `{"seen": true}` when it is visible and focused, `false` when not.
#[derive(serde::Deserialize)]
pub struct Seen {
    pub seen: bool,
}

/// How long a system notification stays on screen before the system puts it away (into its history, where it has one).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Stay {
    For(std::time::Duration),
    /// Until the person closes it.
    UntilDismissed,
}

/// A failure is read later and slower than a passing word: it stays this many times as long.
const FAILURE_STAYS: u32 = 3;

/// A notice's stay, from `[notifications] system_seconds` (0: until dismissed).
pub fn stay_of(seconds: u32, n: &Notice) -> Stay {
    match seconds {
        0 => Stay::UntilDismissed,
        s if n.level == Some(NoticeLevel::Failure) => Stay::For(std::time::Duration::from_secs((s * FAILURE_STAYS).into())),
        s => Stay::For(std::time::Duration::from_secs(s.into())),
    }
}

/// The platform's notification shower. `replaces`: the handle an earlier notice of the same id got, to update it in
/// place (D-Bus `replaces_id`, Android's notification id, a Windows toast's tag). `stay`: how long it shows, where the
/// platform lets a program say (D-Bus; Android and Windows keep their own rules). The notice's `actions` are its
/// buttons; a press is said on the bus (`EventBus::chose`), the notifier having kept what it needs to name the notice.
/// `withdraw`: the notification shown under `handle` is taken away (D-Bus `CloseNotification`, Android's `cancel`,
/// a toast's `RemoveGroupedTagWithId`).
pub trait Notifier: Send + Sync {
    fn show(&self, n: &Notice, replaces: Option<u32>, stay: Stay) -> Result<u32, String>;
    fn withdraw(&self, handle: u32) -> Result<(), String>;
}

/// Says each notice on stderr: where no system notifier is reachable (a session without a notification server).
pub struct LogNotifier {
    next: AtomicU64,
}

impl Notifier for LogNotifier {
    fn show(&self, n: &Notice, replaces: Option<u32>, _stay: Stay) -> Result<u32, String> {
        let handle = replaces.unwrap_or_else(|| self.next.fetch_add(1, Ordering::Relaxed) as u32 + 1);
        eprintln!("atlas: notice{}: {}{}", n.source.as_deref().map(|s| format!(" ({s})")).unwrap_or_default(), n.title, n.body.as_deref().map(|b| format!(" — {b}")).unwrap_or_default());
        Ok(handle)
    }

    fn withdraw(&self, handle: u32) -> Result<(), String> {
        eprintln!("atlas: notice {handle} withdrawn");
        Ok(())
    }
}

/// A click on one of Atlas's system notifications, or its Open button: the desktop shell brings its window forward
/// (shell.rs; rebuilt with `open` if it was asleep), and a live page opens the note from the `Open` event.
pub fn open_notice(bus: &EventBus, open: Option<String>) {
    crate::shell::show(crate::shell::Show { vault: None, open: open.clone() });
    if let Some(path) = open {
        bus.publish(crate::api::Event::Open { path, line: None });
    }
}

/// Do not disturb (the tray's check mark): no system notification from this process while on, failures included.
/// The notices still reach the pages and the tray. Not saved: a moment's choice.
static QUIET: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);

pub fn set_quiet(on: bool) {
    QUIET.store(on, Ordering::Relaxed);
}

pub fn quiet() -> bool {
    QUIET.load(Ordering::Relaxed)
}

/// What the desktop shell's tray hears (notify.rs `on_notice`).
pub enum Heard<'a> {
    /// A notice, and whether a page was looked at when it came.
    Notice(&'a Notice, bool),
    /// `Event::Withdraw`: the notices of this id or about this subject are no longer news.
    Withdrawn(&'a str),
}

type NoticeHook = Box<dyn Fn(Heard<'_>) + Send + Sync>;
static OBSERVER: std::sync::OnceLock<NoticeHook> = std::sync::OnceLock::new();

/// The desktop shell's tray hears every notice of every vault this process serves, whether a page was looked at
/// when it came (the tray gathers the unseen ones), and every withdrawal (it drops them again). Set once.
pub fn on_notice(f: impl Fn(Heard<'_>) + Send + Sync + 'static) {
    let _ = OBSERVER.set(Box::new(f));
}

/// A notice that came while no page of its vault was looked at; its id and subject say which withdrawal takes it away.
#[derive(Debug, Clone, Default, PartialEq, serde::Serialize)]
pub struct Unseen {
    pub title: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub body: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub open: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub subject: Option<String>,
}

/// How many unseen notices a vault keeps (every one is counted).
const UNSEEN_KEPT: usize = 64;

/// Unseen notices, newest first (not looked at when they came; a repeated id replaces; a withdrawal drops). One per
/// vault is what an agent reads (`GET /api/notices`), fed by [`spawn`] and emptied when a page of the vault is looked
/// at; the desktop tray keeps one for the whole process (atlas-app tray.rs).
#[derive(Debug, Clone, Default, PartialEq, serde::Serialize)]
pub struct UnseenList {
    pub items: Vec<Unseen>,
    /// Unseen notices counted, also those beyond the kept ones.
    pub count: usize,
}

impl UnseenList {
    pub fn add(&mut self, n: &Notice) {
        let before = self.items.len();
        if n.id.is_some() {
            self.items.retain(|w| w.id != n.id);
        }
        if self.items.len() == before {
            self.count += 1;
        }
        let u = Unseen { title: n.title.clone(), body: n.body.clone(), source: n.source.clone(), open: opens(n).map(str::to_string), id: n.id.clone(), subject: n.subject.clone() };
        self.items.insert(0, u);
        self.items.truncate(UNSEEN_KEPT);
    }

    /// `Event::Withdraw`: the notices of this id or about this subject dropped and no longer counted; whether any was.
    pub fn withdraw(&mut self, id: &str) -> bool {
        let before = self.items.len();
        self.items.retain(|w| w.id.as_deref() != Some(id) && w.subject.as_deref() != Some(id));
        let gone = before - self.items.len();
        self.count = self.count.saturating_sub(gone);
        gone > 0
    }

    pub fn clear(&mut self) {
        self.items.clear();
        self.count = 0;
    }
}

/// `POST /api/notices/withdraw`: a notice's id or subject.
#[derive(Debug, serde::Deserialize)]
pub struct Withdrawal {
    pub id: String,
}

/// The unseen notices of the vault at `root`, shared by its notice loop and its server.
pub fn unseen_of(root: &std::path::Path) -> Arc<Mutex<UnseenList>> {
    static BY_VAULT: LazyLock<Mutex<HashMap<std::path::PathBuf, Arc<Mutex<UnseenList>>>>> = LazyLock::new(Default::default);
    BY_VAULT.lock().unwrap_or_else(|e| e.into_inner()).entry(root.to_path_buf()).or_default().clone()
}

/// The body's length a notification shows comfortably.
const BODY_MAX: usize = 240;

/// What every notifier shows as the body.
pub fn body_of(n: &Notice) -> String {
    n.body.as_deref().unwrap_or("").chars().take(BODY_MAX).collect()
}

/// What a click on the notice opens: a vault path. An address is not opened.
pub fn opens(n: &Notice) -> Option<&str> {
    n.open.as_deref().filter(|o| !o.contains("://"))
}

type MakeNotifier = Box<dyn Fn(&EventBus) -> Box<dyn Notifier> + Send + Sync>;
static SHELL_NOTIFIER: std::sync::OnceLock<MakeNotifier> = std::sync::OnceLock::new();

/// A shell that reaches the system itself gives its notifier here, before the first vault is served: the phone, whose
/// notifications are Java's (atlas-android, `notices.rs`). It is made per vault, with that vault's bus (where a press
/// on a button is said).
pub fn set_platform(make: impl Fn(&EventBus) -> Box<dyn Notifier> + Send + Sync + 'static) {
    let _ = SHELL_NOTIFIER.set(Box::new(make));
}

/// The platform's notifier: the shell's own if it gave one; the desktop's notification server on Linux, toasts on
/// Windows (a click publishes `Open` for the notice's note on `bus`, a button is said there); elsewhere (macOS: no
/// notifier yet, DESIGN-calendar-tasks-nudges.md §7) the log. `ATLAS_NO_NOTIFY` (any value): the log only — a test's or a probe's core never reaches the desktop.
pub fn platform(bus: &EventBus) -> Box<dyn Notifier> {
    if std::env::var_os("ATLAS_NO_NOTIFY").is_some() {
        return Box::new(LogNotifier { next: AtomicU64::new(0) });
    }
    if let Some(make) = SHELL_NOTIFIER.get() {
        return make(bus);
    }
    #[cfg(all(target_os = "linux", not(target_os = "android")))]
    match linux::DBus::connect(bus.clone()) {
        Ok(n) => return Box::new(n),
        Err(e) => eprintln!("atlas: no system notifications (the session's notification server: {e}); notices go to the log"),
    }
    #[cfg(windows)]
    match toast::Toasts::open(bus.clone()) {
        Ok(n) => return Box::new(n),
        Err(e) => eprintln!("atlas: no system notifications (Windows toasts: {e}); notices go to the log"),
    }
    let _ = bus;
    Box::new(LogNotifier { next: AtomicU64::new(0) })
}

/// `org.freedesktop.Notifications` over the session bus (zbus, pure Rust: nothing to install, nothing to link).
#[cfg(all(target_os = "linux", not(target_os = "android")))]
mod linux {
    use super::{Notice, NoticeLevel, Notifier, Stay};
    use crate::api::NoticeAction;
    use crate::events::{Chosen, EventBus};
    use std::collections::HashMap;
    use std::sync::{Arc, Mutex};
    use zbus::zvariant::Value;

    const DEST: &str = "org.freedesktop.Notifications";
    const PATH: &str = "/org/freedesktop/Notifications";

    /// What a notification shown needs when it is clicked or a button of it pressed: the notice's open, source, id.
    #[derive(Clone)]
    struct Kept {
        open: Option<String>,
        source: Option<String>,
        id: Option<String>,
    }

    /// The server's key for a click on the body itself.
    const DEFAULT: &str = "default";

    pub struct DBus {
        conn: zbus::blocking::Connection,
        /// Each notification shown, and what a click on it or a press of its buttons needs.
        shown: Arc<Mutex<HashMap<u32, Kept>>>,
        /// the server reads bodies as markup (`body-markup`, Plasma and GNOME do): `&`, `<`, `>` are escaped, or
        /// `Prof <prof@uni.example>` would lose its address as an unknown tag
        markup: bool,
    }

    /// Whether the server says it reads a body as markup.
    fn reads_markup(conn: &zbus::blocking::Connection) -> bool {
        conn.call_method(Some(DEST), PATH, Some(DEST), "GetCapabilities", &())
            .ok()
            .and_then(|r| r.body().deserialize::<Vec<String>>().ok())
            .is_some_and(|caps| caps.iter().any(|c| c == "body-markup"))
    }

    /// Text as a markup body shows it as written.
    pub(super) fn as_markup_text(s: &str) -> String {
        s.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;")
    }

    impl DBus {
        /// The session bus's notification server.
        pub fn connect(bus: EventBus) -> Result<Self, String> {
            Self::on(zbus::blocking::Connection::session().map_err(|e| e.to_string())?, bus)
        }

        /// Follows `ActionInvoked` and `NotificationClosed` on `conn`: a click on one of ours brings Atlas forward and
        /// opens its note; a press of one of its buttons is said on the bus, and so is its dismissal by the person
        /// (`NoticeAction::DISMISSED`).
        pub fn on(conn: zbus::blocking::Connection, bus: EventBus) -> Result<Self, String> {
            let shown: Arc<Mutex<HashMap<u32, Kept>>> = Arc::default();
            // both members on one stream: a press arrives before the close that follows it, which is then no dismissal
            let rule = zbus::MatchRule::builder().msg_type(zbus::message::Type::Signal).interface(DEST).map_err(|e| e.to_string())?.build();
            let signals = zbus::blocking::MessageIterator::for_match_rule(rule, &conn, None).map_err(|e| e.to_string())?;
            let clicked = shown.clone();
            std::thread::Builder::new()
                .name("atlas-notify-clicks".into())
                .spawn(move || {
                    for msg in signals.flatten() {
                        let member = msg.header().member().map(|m| m.to_string()).unwrap_or_default();
                        let said = match member.as_str() {
                            "ActionInvoked" => msg.body().deserialize::<(u32, String)>().ok().map(|(id, a)| (id, Some(a))),
                            // reason 2: dismissed by the person (1 expired, 3 closed by us, 4 anything else)
                            "NotificationClosed" => msg.body().deserialize::<(u32, u32)>().ok().map(|(id, why)| (id, (why == 2).then(|| NoticeAction::DISMISSED.to_string()))),
                            _ => None,
                        };
                        let Some((id, action)) = said else { continue };
                        // the signal is broadcast: another program's notifications are not ours to answer; once
                        // answered (pressed, closed) one is forgotten
                        let Some(kept) = clicked.lock().unwrap().remove(&id) else { continue };
                        match action {
                            Some(a) if a == DEFAULT => super::open_notice(&bus, kept.open),
                            Some(action) => bus.chose(Chosen { action, source: kept.source, notice: kept.id, open: kept.open }),
                            None => {}
                        }
                    }
                })
                .map_err(|e| e.to_string())?;
            let markup = reads_markup(&conn);
            Ok(Self { conn, shown, markup })
        }
    }

    impl Notifier for DBus {
        fn show(&self, n: &Notice, replaces: Option<u32>, stay: Stay) -> Result<u32, String> {
            let body = if self.markup { as_markup_text(&super::body_of(n)) } else { super::body_of(n) };
            // a click (`default`: the server's own click on the body) brings Atlas forward and opens a vault path
            let open = super::opens(n);
            // the spec's flat list: key, label, key, label…; the notice's own buttons after the click
            let mut actions = vec![DEFAULT, if open.is_some() { "Open" } else { "Show Atlas" }];
            for a in &n.actions {
                actions.extend([a.id.as_str(), a.label.as_str()]);
            }
            // "critical" is what a server never puts away by itself (and shows over do-not-disturb): only for a failure
            // the person asked to keep until dismissed. With a stay, a failure is a normal one that shows longer.
            let urgency: u8 = if stay == Stay::UntilDismissed && n.level == Some(NoticeLevel::Failure) { 2 } else { 1 };
            // the spec's expire_timeout, in milliseconds: 0 never expires (-1, the server's own choice, is not used:
            // servers differ, and some keep such a notification with actions for good)
            let expire: i32 = match stay {
                Stay::For(d) => i32::try_from(d.as_millis()).unwrap_or(i32::MAX),
                Stay::UntilDismissed => 0,
            };
            let mut hints: HashMap<&str, Value> = HashMap::new();
            hints.insert("desktop-entry", Value::from("atlas"));
            hints.insert("urgency", Value::from(urgency));
            if let Some(source) = &n.source {
                hints.insert("category", Value::from(format!("atlas.{source}")));
            }
            let reply = self
                .conn
                .call_method(Some(DEST), PATH, Some(DEST), "Notify", &("Atlas", replaces.unwrap_or(0), "atlas", n.title.as_str(), body.as_str(), actions, hints, expire))
                .map_err(|e| e.to_string())?;
            let id: u32 = reply.body().deserialize().map_err(|e| e.to_string())?;
            let mut shown = self.shown.lock().unwrap();
            shown.insert(id, Kept { open: open.map(str::to_string), source: n.source.clone(), id: n.id.clone() });
            // the server numbers its notifications upwards: only the last few hundred can still be clicked
            if shown.len() > 512 {
                shown.retain(|&k, _| k <= id && k > id.saturating_sub(256)); // (a restarted server counts from 1 again)
            }
            Ok(id)
        }

        fn withdraw(&self, handle: u32) -> Result<(), String> {
            self.shown.lock().unwrap().remove(&handle);
            // a notification already closed (by the person, by the server) is no error: the server says nothing
            self.conn.call_method(Some(DEST), PATH, Some(DEST), "CloseNotification", &(handle,)).map(drop).map_err(|e| e.to_string())
        }
    }

    #[cfg(test)]
    mod tests {
        use super::*;
        use crate::api::{Event, NoticeAction};
        use std::io::BufRead;
        use std::time::{Duration, Instant};

        /// What the test's notification server was asked: the summary, the id replaced, the actions, the urgency and
        /// the expire_timeout.
        type Asked = Arc<Mutex<Vec<(String, u32, Vec<String>, u8, i32)>>>;

        /// A notification server of the test's own, on a bus of its own: nothing reaches the desktop. The second list:
        /// the notifications closed.
        struct Fake(Asked, Arc<Mutex<Vec<u32>>>);

        #[zbus::interface(name = "org.freedesktop.Notifications")]
        impl Fake {
            #[allow(clippy::too_many_arguments)]
            fn notify(&self, _app: String, replaces: u32, _icon: String, summary: String, _body: String, actions: Vec<String>, hints: HashMap<String, zbus::zvariant::OwnedValue>, timeout: i32) -> u32 {
                let urgency = hints.get("urgency").and_then(|v| u8::try_from(&**v).ok()).unwrap_or(0);
                self.0.lock().unwrap().push((summary, replaces, actions, urgency, timeout));
                42
            }

            fn close_notification(&self, id: u32) {
                self.1.lock().unwrap().push(id);
            }
        }

        /// Kills the private bus with the test.
        struct Daemon(std::process::Child);
        impl Drop for Daemon {
            fn drop(&mut self) {
                let _ = self.0.kill();
                let _ = self.0.wait();
            }
        }

        #[test]
        fn a_markup_body_shows_its_text_as_written() {
            assert_eq!(super::as_markup_text("Prof <prof@uni.example> & co"), "Prof &lt;prof@uni.example&gt; &amp; co");
        }

        #[test]
        fn a_notice_reaches_the_notification_server_and_a_click_on_it_opens_its_note() {
            let Ok(child) = std::process::Command::new("dbus-daemon").args(["--session", "--nofork", "--print-address=1"]).stdout(std::process::Stdio::piped()).spawn() else {
                eprintln!("skipped: no dbus-daemon to run a private bus on");
                return;
            };
            let mut daemon = Daemon(child);
            let mut addr = String::new();
            std::io::BufReader::new(daemon.0.stdout.take().unwrap()).read_line(&mut addr).unwrap();
            let addr = addr.trim();

            let (asked, closed): (Asked, Arc<Mutex<Vec<u32>>>) = Default::default();
            let server = zbus::blocking::connection::Builder::address(addr).unwrap().name(DEST).unwrap().serve_at(PATH, Fake(asked.clone(), closed.clone())).unwrap().build().unwrap();
            let bus = EventBus::default();
            let mut events = bus.subscribe();
            let client = zbus::blocking::connection::Builder::address(addr).unwrap().build().unwrap();
            let n = DBus::on(client, bus.clone()).unwrap();

            let failed = Notice::new("backup failed").level(NoticeLevel::Failure).source("schedule").open("notes/backup.md");
            let secs = |s| Stay::For(Duration::from_secs(s));
            assert_eq!(n.show(&failed, None, secs(30)), Ok(42));
            assert_eq!(n.show(&Notice::new("3 new mails"), Some(42), secs(10)), Ok(42), "a later one replaces it");
            assert_eq!(n.show(&failed, Some(42), Stay::UntilDismissed), Ok(42));
            assert_eq!(n.show(&Notice::new("kept"), Some(42), Stay::UntilDismissed), Ok(42));
            assert_eq!(
                *asked.lock().unwrap(),
                vec![
                    // each says how long it stays; only a failure kept until dismissed is critical
                    ("backup failed".into(), 0, vec!["default".into(), "Open".into()], 1, 30_000),
                    ("3 new mails".into(), 42, vec!["default".into(), "Show Atlas".into()], 1, 10_000),
                    ("backup failed".into(), 42, vec!["default".into(), "Open".into()], 2, 0),
                    ("kept".into(), 42, vec!["default".into(), "Show Atlas".into()], 1, 0),
                ]
            );

            // another program's notification clicked: not ours; then ours, shown again with a note to open
            n.show(&failed, Some(42), secs(30)).unwrap();
            for id in [7u32, 42] {
                server.emit_signal(None::<zbus::names::BusName>, PATH, DEST, "ActionInvoked", &(id, "default")).unwrap();
            }
            let until = Instant::now() + Duration::from_secs(5);
            let opened = loop {
                match events.try_recv() {
                    Ok(Event::Open { path, .. }) => break path,
                    Ok(_) => {}
                    Err(_) if Instant::now() < until => std::thread::sleep(Duration::from_millis(20)),
                    Err(e) => panic!("no Open after the click: {e}"),
                }
            };
            assert_eq!(opened, "notes/backup.md");
            assert!(events.try_recv().is_err(), "the other program's click opened nothing");

            // its buttons after the click's; a press is said on the bus with the notice it was on
            let mut chosen = bus.on_chosen();
            let reminder = Notice::new("Seminar").source("dav").id("dav:s1").open("notes/Seminar.md").action(NoticeAction::new(NoticeAction::OPEN, "Open")).action(NoticeAction::snooze(10));
            n.show(&reminder, None, secs(30)).unwrap();
            let keys = asked.lock().unwrap().last().unwrap().2.clone();
            assert_eq!(keys, ["default", "Open", "atlas:open", "Open", "atlas:snooze:10", "Snooze 10 min"]);
            server.emit_signal(None::<zbus::names::BusName>, PATH, DEST, "ActionInvoked", &(42u32, "atlas:snooze:10")).unwrap();
            let until = Instant::now() + Duration::from_secs(5);
            let pressed = loop {
                match chosen.try_recv() {
                    Ok(c) => break c,
                    Err(_) if Instant::now() < until => std::thread::sleep(Duration::from_millis(20)),
                    Err(e) => panic!("no press heard: {e}"),
                }
            };
            assert_eq!(pressed, Chosen { action: "atlas:snooze:10".into(), source: Some("dav".into()), notice: Some("dav:s1".into()), open: Some("notes/Seminar.md".into()) });
            let next = |chosen: &mut tokio::sync::broadcast::Receiver<Chosen>| {
                let until = Instant::now() + Duration::from_secs(5);
                loop {
                    match chosen.try_recv() {
                        Ok(c) => return Some(c),
                        Err(_) if Instant::now() < until => std::thread::sleep(Duration::from_millis(20)),
                        Err(_) => return None,
                    }
                }
            };

            // dismissals: the close after a press is none; expired (1) or closed by us (3) is none; closed by the
            // person (2) is said as atlas:dismissed with its notice
            // each close heard before the next show of the same id (the listener runs on its own thread): a barrier —
            // signals are handled in order, so once a marker notice's close is heard, the one before it was too
            let forgotten = |n: &DBus| {
                n.shown.lock().unwrap().insert(99, Kept { open: None, source: None, id: None });
                server.emit_signal(None::<zbus::names::BusName>, PATH, DEST, "NotificationClosed", &(99u32, 3u32)).unwrap();
                let until = Instant::now() + Duration::from_secs(5);
                while n.shown.lock().unwrap().contains_key(&99) && Instant::now() < until {
                    std::thread::sleep(Duration::from_millis(10));
                }
            };
            server.emit_signal(None::<zbus::names::BusName>, PATH, DEST, "NotificationClosed", &(42u32, 2u32)).unwrap();
            forgotten(&n);
            n.show(&reminder, None, secs(30)).unwrap();
            server.emit_signal(None::<zbus::names::BusName>, PATH, DEST, "NotificationClosed", &(42u32, 1u32)).unwrap();
            forgotten(&n);
            n.show(&reminder, None, secs(30)).unwrap();
            server.emit_signal(None::<zbus::names::BusName>, PATH, DEST, "NotificationClosed", &(42u32, 2u32)).unwrap();
            server.emit_signal(None::<zbus::names::BusName>, PATH, DEST, "NotificationClosed", &(42u32, 2u32)).unwrap();
            let dismissed = next(&mut chosen).expect("a dismissal heard");
            assert_eq!(dismissed, Chosen { action: NoticeAction::DISMISSED.into(), source: Some("dav".into()), notice: Some("dav:s1".into()), open: Some("notes/Seminar.md".into()) });
            assert_eq!(next(&mut chosen), None, "said once: the second close was of one already answered");

            n.withdraw(42).unwrap();
            assert_eq!(*closed.lock().unwrap(), [42], "withdrawn: closed on the server");
        }
    }
}

/// Windows toasts through WinRT, their XML, buttons and withdrawal (notify/toast.rs; the WinRT half on Windows only).
mod toast;

/// The notices handed to a notifier, remembering each one's handle by its id (a later one replaces it) and its
/// subject (a withdrawal by either takes it away).
pub struct Delivery {
    notifier: Box<dyn Notifier>,
    held: Vec<Held>,
}

/// A system notification shown for a notice that has an id or a subject.
struct Held {
    id: Option<String>,
    subject: Option<String>,
    handle: u32,
}

/// How many shown notifications are remembered: the oldest beyond it is forgotten (long closed by then).
const HELD_MAX: usize = 256;

impl Delivery {
    pub fn new(notifier: Box<dyn Notifier>) -> Self {
        Self { notifier, held: Vec::new() }
    }

    /// Applies the rules and shows it; whether it was shown. A notifier's failure is said, never fatal.
    pub fn offer(&mut self, cfg: &NotificationsConfig, n: &Notice, looked_at: bool, muted: bool) -> bool {
        if !shown(cfg.system, n, looked_at, muted) {
            return false;
        }
        let replaces = n.id.as_ref().and_then(|id| self.held.iter().find(|h| h.id.as_ref() == Some(id)).map(|h| h.handle));
        match self.notifier.show(n, replaces, stay_of(cfg.system_seconds, n)) {
            Ok(handle) => {
                if n.id.is_some() || n.subject.is_some() {
                    self.held.retain(|h| h.handle != handle);
                    self.held.push(Held { id: n.id.clone(), subject: n.subject.clone(), handle });
                    if self.held.len() > HELD_MAX {
                        self.held.remove(0);
                    }
                }
                true
            }
            Err(e) => {
                eprintln!("atlas: system notification not shown ({}): {e}", n.title);
                false
            }
        }
    }

    /// Takes away the system notifications shown for the notices of this id or about this subject; whether any was.
    pub fn withdraw(&mut self, id: &str) -> bool {
        let (gone, kept): (Vec<Held>, Vec<Held>) = std::mem::take(&mut self.held).into_iter().partition(|h| h.id.as_deref() == Some(id) || h.subject.as_deref() == Some(id));
        self.held = kept;
        for h in &gone {
            if let Err(e) = self.notifier.withdraw(h.handle) {
                eprintln!("atlas: system notification not withdrawn ({id}): {e}");
            }
        }
        !gone.is_empty()
    }
}

/// Follows a vault's notices for as long as it is served. Its `[notifications] system` is read per notice (notices are
/// rare; a change applies to the next). No source is muted yet: mutes live in the notifications sources' notes, read
/// here when that half is built.
pub fn spawn(ws: Workspace, bus: EventBus, presence: Arc<Presence>, notifier: Box<dyn Notifier>) -> tokio::task::JoinHandle<()> {
    let mut rx = bus.on_notice();
    crate::notice_relay::attach(ws.root(), bus.clone()); // the other devices' notices are published here
    tokio::spawn(async move {
        let mut delivery = Delivery::new(notifier);
        loop {
            let said = match rx.recv().await {
                Ok(s) => s,
                Err(tokio::sync::broadcast::error::RecvError::Lagged(_)) => continue,
                Err(_) => return,
            };
            let (ws, presence) = (ws.clone(), presence.clone());
            // the config read and a notifier's call (D-Bus) block: off the runtime's threads
            let offered = tokio::task::spawn_blocking(move || {
                match said {
                    ToSystem::Show(n) => {
                        let cfg = ws.config().map(|c| c.notifications).unwrap_or_default();
                        // to the other devices, unless its source is kept to this one (Settings → Notifications)
                        if !n.source.as_ref().is_some_and(|src| cfg.this_device_only.iter().any(|x| x == src)) {
                            crate::notice_relay::raised(ws.root(), crate::notice_relay::Item::Show(n.clone()));
                        }
                        let looked_at = presence.looked_at();
                        if let Some(f) = OBSERVER.get() {
                            f(Heard::Notice(&n, looked_at));
                        }
                        if !looked_at {
                            unseen_of(ws.root()).lock().unwrap_or_else(|e| e.into_inner()).add(&n);
                        }
                        delivery.offer(&cfg, &n, looked_at, quiet());
                    }
                    ToSystem::Withdraw(id) => {
                        crate::notice_relay::raised(ws.root(), crate::notice_relay::Item::Withdraw(id.clone()));
                        if let Some(f) = OBSERVER.get() {
                            f(Heard::Withdrawn(&id));
                        }
                        unseen_of(ws.root()).lock().unwrap_or_else(|e| e.into_inner()).withdraw(&id);
                        delivery.withdraw(&id);
                    }
                }
                delivery
            });
            match offered.await {
                Ok(d) => delivery = d,
                Err(_) => return, // the runtime is ending
            }
        }
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn each_vault_knows_whether_a_page_shows_it() {
        let (a, b) = (std::path::Path::new("/vaults/a-presence-test"), std::path::Path::new("/vaults/b-presence-test"));
        assert!(!Presence::of_vault(a).connected());
        let page = Presence::of_vault(a).join();
        assert!(Presence::of_vault(a).connected(), "the same table for the same vault");
        assert!(!Presence::of_vault(b).connected(), "another vault's page is not this one's");
        page.seen(false);
        assert!(Presence::of_vault(a).connected(), "in the background, still shown");
        drop(page);
        assert!(!Presence::of_vault(a).connected(), "closed: gone");
    }

    /// What a notifier was asked to show: each title, and the handle it was to replace.
    type Asked = Arc<Mutex<Vec<(String, Option<u32>)>>>;

    /// Records what it was asked to show; withdrawals are said as `withdrawn <handle>`, and each notice's buttons as
    /// `buttons <ids>`.
    struct Shown(Asked);
    impl Notifier for Shown {
        fn show(&self, n: &Notice, replaces: Option<u32>, _stay: Stay) -> Result<u32, String> {
            let mut v = self.0.lock().unwrap();
            v.push((n.title.clone(), replaces));
            let handle = replaces.unwrap_or(v.len() as u32);
            if !n.actions.is_empty() {
                v.push((format!("buttons {}", n.actions.iter().map(|a| a.id.as_str()).collect::<Vec<_>>().join(" ")), None));
            }
            Ok(handle)
        }
        fn withdraw(&self, handle: u32) -> Result<(), String> {
            self.0.lock().unwrap().push((format!("withdrawn {handle}"), None));
            Ok(())
        }
    }

    #[test]
    fn a_notices_buttons_reach_the_notifier_and_a_withdrawal_takes_its_id_away() {
        use crate::api::NoticeAction;
        let seen = Arc::new(Mutex::new(vec![]));
        let mut d = Delivery::new(Box::new(Shown(seen.clone())));
        let always = NotificationsConfig { system: SystemNotices::Always, ..Default::default() };
        let task = Notice::new("Send the report").id("plan:t1").action(NoticeAction::new("done", "Done")).action(NoticeAction::snooze(10));
        assert!(d.offer(&always, &task, false, false));
        assert!(d.offer(&always, &Notice::new("other").id("mail:inbox"), false, false));
        assert!(!d.withdraw("plan:nope"), "an id never shown: nothing to take away");
        assert!(d.withdraw("plan:t1"));
        assert!(!d.withdraw("plan:t1"), "once");
        assert!(d.offer(&always, &task, false, false), "shown again after: a new one, replacing nothing");
        let seen = seen.lock().unwrap().iter().map(|(t, r)| format!("{t}{}", r.map(|r| format!(" ↺{r}")).unwrap_or_default())).collect::<Vec<_>>();
        assert_eq!(seen, ["Send the report", "buttons done atlas:snooze:10", "other", "withdrawn 1", "Send the report", "buttons done atlas:snooze:10"]);
    }

    #[test]
    fn a_withdrawal_by_subject_takes_away_every_notification_about_it() {
        let seen = Arc::new(Mutex::new(vec![]));
        let mut d = Delivery::new(Box::new(Shown(seen.clone())));
        let always = NotificationsConfig { system: SystemNotices::Always, ..Default::default() };
        let task = "notes/Report.md#^t3f9a";
        assert!(d.offer(&always, &Notice::new("Due today").id("deadline:1").subject(task), false, false));
        assert!(d.offer(&always, &Notice::new("Time to start").subject(task), false, false));
        assert!(d.offer(&always, &Notice::new("other").subject("notes/Other.md#^x"), false, false));
        assert!(d.withdraw(task));
        assert!(!d.withdraw(task), "once");
        assert!(!d.withdraw("deadline:1"), "its id went with it");
        let seen = seen.lock().unwrap().iter().map(|(t, _)| t.clone()).collect::<Vec<_>>();
        assert_eq!(seen, ["Due today", "Time to start", "other", "withdrawn 1", "withdrawn 2"]);
    }

    #[test]
    fn the_unseen_list_replaces_a_repeated_id_and_drops_what_is_withdrawn_by_id_or_subject() {
        let mut l = UnseenList::default();
        l.add(&Notice::new("2 new mails").id("mail:inbox"));
        l.add(&Notice::new("Due today").id("deadline:t1").subject("notes/R.md#^t1").open("notes/R.md"));
        l.add(&Notice::new("Time to start").subject("notes/R.md#^t1"));
        l.add(&Notice::new("3 new mails").id("mail:inbox").open("https://mail.example.org"));
        assert_eq!((l.items.len(), l.count, l.items[0].title.as_str()), (3, 3, "3 new mails"), "the mail notice replaced, first");
        assert_eq!((l.items[0].open.as_deref(), l.items[1].open.as_deref()), (None, None), "an address is not a vault path to open");
        assert_eq!(l.items[2].open.as_deref(), Some("notes/R.md"));
        assert!(l.withdraw("notes/R.md#^t1"), "by subject: both of the task's");
        assert_eq!((l.items.len(), l.count), (1, 1));
        assert!(!l.withdraw("deadline:t1"));
        assert!(l.withdraw("mail:inbox"), "by id");
        assert_eq!(l, UnseenList::default());
        for i in 0..UNSEEN_KEPT + 2 {
            l.add(&Notice::new(format!("n{i}")));
        }
        assert_eq!((l.items.len(), l.count), (UNSEEN_KEPT, UNSEEN_KEPT + 2), "kept newest, all counted");
        l.clear();
        assert_eq!(l, UnseenList::default());
    }

    #[test]
    fn a_withdraw_event_reaches_the_system_channel_and_others_do_not() {
        let bus = EventBus::default();
        let mut rx = bus.on_notice();
        bus.publish(crate::api::Event::Fs { paths: vec![] });
        bus.publish(crate::api::Event::Notify(Notice::new("a").id("x")));
        bus.publish(crate::api::Event::Withdraw { id: "x".into() });
        assert_eq!(rx.try_recv().unwrap(), ToSystem::Show(Notice::new("a").id("x")));
        assert_eq!(rx.try_recv().unwrap(), ToSystem::Withdraw("x".into()));
        assert!(rx.try_recv().is_err());
    }

    #[test]
    fn a_notice_reaches_the_system_only_when_nobody_looks_unless_it_is_a_failure_and_never_when_muted() {
        let info = Notice::new("Filed as notes/x.md");
        let failure = Notice::new("backup failed (scheduled)").level(NoticeLevel::Failure);
        let away = SystemNotices::Away;
        assert!(!shown(away, &info, true, false), "looked at: the toast is enough");
        assert!(shown(away, &info, false, false), "hidden: shown");
        assert!(shown(away, &failure, true, false), "a failure always");
        assert!(!shown(away, &failure, false, true), "muted never, even a failure");
        assert!(!shown(SystemNotices::Off, &failure, false, false));
        assert!(!shown(SystemNotices::Failures, &info, false, false) && shown(SystemNotices::Failures, &failure, true, false));
        assert!(shown(SystemNotices::Always, &info, true, false));
    }

    #[test]
    fn a_notice_stays_for_the_seconds_set_a_failure_longer_and_zero_keeps_it() {
        let (info, failure) = (Notice::new("3 new mails"), Notice::new("backup failed").level(NoticeLevel::Failure));
        let secs = |s| Stay::For(std::time::Duration::from_secs(s));
        assert_eq!(stay_of(NotificationsConfig::default().system_seconds, &info), secs(10), "a lifetime by default");
        assert_eq!((stay_of(8, &info), stay_of(8, &failure)), (secs(8), secs(24)));
        assert_eq!((stay_of(0, &info), stay_of(0, &failure)), (Stay::UntilDismissed, Stay::UntilDismissed));
    }

    #[test]
    fn a_notice_with_the_same_id_replaces_the_earlier_one() {
        let seen = Arc::new(Mutex::new(vec![]));
        let mut d = Delivery::new(Box::new(Shown(seen.clone())));
        let always = NotificationsConfig { system: SystemNotices::Always, ..Default::default() };
        let mails = |n: u32| Notice::new(format!("{n} new mails")).id("mail:inbox");
        assert!(d.offer(&always, &mails(1), false, false));
        assert!(d.offer(&always, &Notice::new("other"), false, false));
        assert!(d.offer(&always, &mails(3), false, false));
        assert_eq!(*seen.lock().unwrap(), vec![("1 new mails".into(), None), ("other".into(), None), ("3 new mails".into(), Some(1))]);
    }

    #[test]
    fn every_notifier_shows_the_same_body_and_opens_only_vault_paths() {
        let long = Notice::new("t").body("x".repeat(BODY_MAX + 9)).open("https://example.org/a");
        assert_eq!(body_of(&long).chars().count(), BODY_MAX);
        assert_eq!(opens(&long), None);
        assert_eq!(opens(&Notice::new("t").open("notes/a.md")), Some("notes/a.md"));
    }

    #[test]
    fn a_page_counts_as_looked_at_only_while_it_says_so_and_while_connected() {
        let p = Arc::new(Presence::default());
        let (a, b) = (p.join(), p.join());
        assert!(!p.looked_at(), "a page that has said nothing is not looked at");
        a.seen(true);
        assert!(p.looked_at());
        a.seen(false);
        b.seen(true);
        assert!(p.looked_at());
        drop(b);
        assert!(!p.looked_at(), "a closed page counts no more");
    }

    #[test]
    fn the_last_use_is_the_latest_of_the_systems_samples_and_a_page_in_focus() {
        use crate::platform::idle::Idle;
        let p = Arc::new(Presence::default());
        assert_eq!(p.active_at(), None, "unknown until something says");
        p.sampled(None, 1_000);
        assert_eq!(p.active_at(), None, "no system answer and no page looked at: still unknown");
        p.sampled(Some(Idle::No), 2_000);
        assert_eq!(p.active_at(), Some(2_000));
        p.sampled(Some(Idle::Since(Some(1_500))), 9_000);
        assert_eq!(p.active_at(), Some(2_000), "an idle time before the last use moves nothing back");
        p.sampled(Some(Idle::Since(Some(5_000))), 9_000);
        assert_eq!(p.active_at(), Some(5_000), "idle since 5 s: used until then");
        p.sampled(Some(Idle::Since(None)), 60_000);
        assert_eq!(p.active_at(), Some(5_000), "locked since a moment unsaid: the last use stands");
        let page = p.join();
        page.seen(true);
        assert!(p.active_at().unwrap() > 60_000, "a page coming into focus is a use, now");
        let t = p.active_at().unwrap();
        p.sampled(None, t + 60_000);
        assert_eq!(p.active_at(), Some(t + 60_000), "no system answer: a page looked at is in use");
    }

    #[tokio::test]
    async fn the_vaults_notices_are_followed_and_its_setting_applies() {
        let dir = tempfile::tempdir().unwrap();
        let ws = Workspace::open(dir.path()).unwrap();
        let (bus, presence, seen) = (EventBus::default(), Arc::new(Presence::default()), Arc::new(Mutex::new(vec![])));
        let task = spawn(ws.clone(), bus.clone(), presence.clone(), Box::new(Shown(seen.clone())));
        let titles = || seen.lock().unwrap().iter().map(|(t, _)| t.clone()).collect::<Vec<String>>();
        let until = |n: usize| async move {
            let t0 = std::time::Instant::now();
            while titles().len() < n && t0.elapsed() < std::time::Duration::from_secs(5) {
                tokio::time::sleep(std::time::Duration::from_millis(20)).await;
            }
        };
        bus.publish(crate::api::Event::Notify(Notice::new("nobody looks")));
        until(1).await;
        std::fs::create_dir_all(dir.path().join(".atlas")).unwrap();
        std::fs::write(dir.path().join(".atlas/config.toml"), "[notifications]\nsystem = \"failures\"\n").unwrap();
        bus.publish(crate::api::Event::Notify(Notice::new("filed")));
        bus.publish(crate::api::Event::Notify(Notice::new("backup failed").level(NoticeLevel::Failure).id("backup")));
        until(2).await;
        bus.publish(crate::api::Event::Withdraw { id: "backup".into() });
        until(3).await;
        task.abort();
        assert_eq!(titles(), ["nobody looks", "backup failed", "withdrawn 2"]);
    }
}
