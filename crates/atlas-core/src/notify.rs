//! Notices to the system (docs/design/DESIGN-notifications.md, "Delivery to the system"): every `Event::Notify` is a
//! toast on the open pages; this module decides whether it also becomes a system notification and hands it to the
//! platform's [`Notifier`]. The rules are the same on every device; only the notifier differs.
use crate::api::{Notice, NoticeLevel};
use crate::config::SystemNotices;
use crate::events::EventBus;
use crate::Workspace;
use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
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
/// per process, not per vault: a focused window of one vault means the person is looking at Atlas.
#[derive(Default)]
pub struct Presence {
    pages: Mutex<HashMap<u64, bool>>,
    next: AtomicU64,
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
}

impl Page {
    /// What the page reported: visible and focused, or not.
    pub fn seen(&self, looked_at: bool) {
        self.presence.pages.lock().unwrap().insert(self.id, looked_at);
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

/// The platform's notification shower. `replaces`: the handle an earlier notice of the same id got, to update it in
/// place (D-Bus `replaces_id`, Android's notification id, a Windows toast's tag).
pub trait Notifier: Send + Sync {
    fn show(&self, n: &Notice, replaces: Option<u32>) -> Result<u32, String>;
}

/// Says each notice on stderr: where no system notifier is reachable (a session without a notification server).
pub struct LogNotifier {
    next: AtomicU64,
}

impl Notifier for LogNotifier {
    fn show(&self, n: &Notice, replaces: Option<u32>) -> Result<u32, String> {
        let handle = replaces.unwrap_or_else(|| self.next.fetch_add(1, Ordering::Relaxed) as u32 + 1);
        eprintln!("atlas: notice{}: {}{}", n.source.as_deref().map(|s| format!(" ({s})")).unwrap_or_default(), n.title, n.body.as_deref().map(|b| format!(" — {b}")).unwrap_or_default());
        Ok(handle)
    }
}

/// What the desktop shell does when one of its system notifications is clicked: atlas-app brings its window forward
/// (the page then opens the notice's note). Set once, at start; a core with no window leaves it unset.
pub fn on_click(f: impl Fn() + Send + Sync + 'static) {
    let _ = CLICKED.set(Box::new(f));
}

static CLICKED: std::sync::OnceLock<Box<dyn Fn() + Send + Sync>> = std::sync::OnceLock::new();

#[cfg_attr(not(any(windows, all(target_os = "linux", not(target_os = "android")))), allow(dead_code))]
fn clicked() {
    if let Some(f) = CLICKED.get() {
        f();
    }
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

type MakeNotifier = Box<dyn Fn() -> Box<dyn Notifier> + Send + Sync>;
static SHELL_NOTIFIER: std::sync::OnceLock<MakeNotifier> = std::sync::OnceLock::new();

/// A shell that reaches the system itself gives its notifier here, before the first vault is served: the phone, whose
/// notifications are Java's (atlas-android, `notices.rs`).
pub fn set_platform(make: impl Fn() -> Box<dyn Notifier> + Send + Sync + 'static) {
    let _ = SHELL_NOTIFIER.set(Box::new(make));
}

/// The platform's notifier: the shell's own if it gave one; the desktop's notification server on Linux, toasts on
/// Windows (a click publishes `Open` for the notice's note on `bus`); elsewhere, until its step of the design is
/// built, the log.
pub fn platform(bus: &EventBus) -> Box<dyn Notifier> {
    if let Some(make) = SHELL_NOTIFIER.get() {
        return make();
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
    use super::{Notice, NoticeLevel, Notifier};
    use crate::api::Event;
    use crate::events::EventBus;
    use std::collections::HashMap;
    use std::sync::{Arc, Mutex};
    use zbus::zvariant::Value;

    const DEST: &str = "org.freedesktop.Notifications";
    const PATH: &str = "/org/freedesktop/Notifications";

    pub struct DBus {
        conn: zbus::blocking::Connection,
        /// Each notification shown, and the vault path a click on it opens.
        opens: Arc<Mutex<HashMap<u32, Option<String>>>>,
    }

    impl DBus {
        /// The session bus's notification server.
        pub fn connect(bus: EventBus) -> Result<Self, String> {
            Self::on(zbus::blocking::Connection::session().map_err(|e| e.to_string())?, bus)
        }

        /// Follows `ActionInvoked` on `conn`: a click on one of ours brings Atlas forward and opens its note.
        pub fn on(conn: zbus::blocking::Connection, bus: EventBus) -> Result<Self, String> {
            let opens: Arc<Mutex<HashMap<u32, Option<String>>>> = Arc::default();
            let rule = zbus::MatchRule::builder()
                .msg_type(zbus::message::Type::Signal)
                .interface(DEST)
                .and_then(|r| r.member("ActionInvoked"))
                .map_err(|e| e.to_string())?
                .build();
            let signals = zbus::blocking::MessageIterator::for_match_rule(rule, &conn, None).map_err(|e| e.to_string())?;
            let clicked = opens.clone();
            std::thread::Builder::new()
                .name("atlas-notify-clicks".into())
                .spawn(move || {
                    for msg in signals.flatten() {
                        let Ok((id, _action)) = msg.body().deserialize::<(u32, String)>() else { continue };
                        // the signal is broadcast: another program's notifications are not ours to answer
                        let Some(open) = clicked.lock().unwrap().get(&id).cloned() else { continue };
                        super::clicked();
                        if let Some(path) = open {
                            bus.publish(Event::Open { path, line: None });
                        }
                    }
                })
                .map_err(|e| e.to_string())?;
            Ok(Self { conn, opens })
        }
    }

    impl Notifier for DBus {
        fn show(&self, n: &Notice, replaces: Option<u32>) -> Result<u32, String> {
            let body = super::body_of(n);
            // a click (`default`: the server's own click on the body) brings Atlas forward and opens a vault path
            let open = super::opens(n);
            let actions = vec!["default", if open.is_some() { "Open" } else { "Show Atlas" }];
            let urgency: u8 = match n.level {
                Some(NoticeLevel::Failure) => 2,
                _ => 1,
            };
            let mut hints: HashMap<&str, Value> = HashMap::new();
            hints.insert("desktop-entry", Value::from("atlas"));
            hints.insert("urgency", Value::from(urgency));
            if let Some(source) = &n.source {
                hints.insert("category", Value::from(format!("atlas.{source}")));
            }
            let reply = self
                .conn
                .call_method(Some(DEST), PATH, Some(DEST), "Notify", &("Atlas", replaces.unwrap_or(0), "atlas", n.title.as_str(), body.as_str(), actions, hints, -1i32))
                .map_err(|e| e.to_string())?;
            let id: u32 = reply.body().deserialize().map_err(|e| e.to_string())?;
            self.opens.lock().unwrap().insert(id, open.map(str::to_string));
            Ok(id)
        }
    }

    #[cfg(test)]
    mod tests {
        use super::*;
        use std::io::BufRead;
        use std::time::{Duration, Instant};

        /// What the test's notification server was asked: the summary, the id replaced, the actions, the urgency.
        type Asked = Arc<Mutex<Vec<(String, u32, Vec<String>, u8)>>>;

        /// A notification server of the test's own, on a bus of its own: nothing reaches the desktop.
        struct Fake(Asked);

        #[zbus::interface(name = "org.freedesktop.Notifications")]
        impl Fake {
            #[allow(clippy::too_many_arguments)]
            fn notify(&self, _app: String, replaces: u32, _icon: String, summary: String, _body: String, actions: Vec<String>, hints: HashMap<String, zbus::zvariant::OwnedValue>, _timeout: i32) -> u32 {
                let urgency = hints.get("urgency").and_then(|v| u8::try_from(&**v).ok()).unwrap_or(0);
                self.0.lock().unwrap().push((summary, replaces, actions, urgency));
                42
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
        fn a_notice_reaches_the_notification_server_and_a_click_on_it_opens_its_note() {
            let Ok(child) = std::process::Command::new("dbus-daemon").args(["--session", "--nofork", "--print-address=1"]).stdout(std::process::Stdio::piped()).spawn() else {
                eprintln!("skipped: no dbus-daemon to run a private bus on");
                return;
            };
            let mut daemon = Daemon(child);
            let mut addr = String::new();
            std::io::BufReader::new(daemon.0.stdout.take().unwrap()).read_line(&mut addr).unwrap();
            let addr = addr.trim();

            let asked: Asked = Arc::default();
            let server = zbus::blocking::connection::Builder::address(addr).unwrap().name(DEST).unwrap().serve_at(PATH, Fake(asked.clone())).unwrap().build().unwrap();
            let bus = EventBus::default();
            let mut events = bus.subscribe();
            let client = zbus::blocking::connection::Builder::address(addr).unwrap().build().unwrap();
            let n = DBus::on(client, bus.clone()).unwrap();

            let failed = Notice::new("backup failed").level(NoticeLevel::Failure).source("schedule").open("notes/backup.md");
            assert_eq!(n.show(&failed, None), Ok(42));
            assert_eq!(n.show(&Notice::new("3 new mails"), Some(42)), Ok(42), "a later one replaces it");
            assert_eq!(
                *asked.lock().unwrap(),
                vec![
                    ("backup failed".into(), 0, vec!["default".into(), "Open".into()], 2),
                    ("3 new mails".into(), 42, vec!["default".into(), "Show Atlas".into()], 1),
                ]
            );

            // another program's notification clicked: not ours; then ours, shown again with a note to open
            n.show(&failed, Some(42)).unwrap();
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
        }
    }
}

/// Windows toasts through WinRT. An app with no MSIX package has an identity only once this user's registry names it
/// (`AppUserModelId\<id>`): done at start, needing no installer step, so a portable `atlas.exe` shows them too. The
/// click is the toast's `Activated` event, which needs the process alive; the core is, as long as a vault is served.
#[cfg(windows)]
mod toast {
    use super::{Notice, Notifier};
    use crate::api::Event;
    use crate::events::EventBus;
    use std::collections::VecDeque;
    use std::sync::atomic::{AtomicU32, Ordering};
    use std::sync::Mutex;
    use windows::core::HSTRING;
    use windows::Foundation::TypedEventHandler;
    use windows::UI::Notifications::{ToastNotification, ToastNotificationManager, ToastNotifier, ToastTemplateType};

    /// The same as the Tauri bundle's identifier, so Windows groups the toasts under one app.
    const APP_ID: &str = "dev.atlas.app";
    /// A tag or a group is at most 16 characters on older Windows (64 since 1703): a longer one is accepted when set
    /// and refused when read back (CI's Windows Server). Sources are short (`sync`, a plugin's id).
    const GROUP_MAX: usize = 16;
    /// The toasts whose clicks are still awaited: their handlers live as long as they do.
    const KEPT: usize = 32;

    /// One notifier per vault, one identity per app: a process-wide counter, or one vault's toast would replace
    /// another's with the same tag.
    static NEXT: AtomicU32 = AtomicU32::new(1);

    pub struct Toasts {
        notifier: ToastNotifier,
        bus: EventBus,
        kept: Mutex<VecDeque<ToastNotification>>,
    }

    impl Toasts {
        /// Names the app to Windows and opens its toast notifier.
        pub fn open(bus: EventBus) -> Result<Self, String> {
            register()?;
            let notifier = ToastNotificationManager::CreateToastNotifierWithId(&HSTRING::from(APP_ID)).map_err(|e| e.to_string())?;
            Ok(Self { notifier, bus, kept: Mutex::default() })
        }
    }

    impl Notifier for Toasts {
        fn show(&self, n: &Notice, replaces: Option<u32>) -> Result<u32, String> {
            let handle = replaces.unwrap_or_else(|| NEXT.fetch_add(1, Ordering::Relaxed));
            let toast = toast_of(n, handle).map_err(|e| e.to_string())?;
            let (bus, open) = (self.bus.clone(), super::opens(n).map(str::to_string));
            toast
                .Activated(&TypedEventHandler::new(move |_, _| {
                    super::clicked();
                    if let Some(path) = open.clone() {
                        bus.publish(Event::Open { path, line: None });
                    }
                    Ok(())
                }))
                .map_err(|e| e.to_string())?;
            self.notifier.Show(&toast).map_err(|e| e.to_string())?;
            let mut kept = self.kept.lock().unwrap();
            kept.push_back(toast);
            if kept.len() > KEPT {
                kept.pop_front();
            }
            Ok(handle)
        }
    }

    /// The toast of a notice. Title and body go in as text nodes, so `<` and `&` in them are text, never markup. The
    /// tag says which earlier toast it replaces; the group folds a source's burst.
    fn toast_of(n: &Notice, handle: u32) -> windows::core::Result<ToastNotification> {
        let xml = ToastNotificationManager::GetTemplateContent(ToastTemplateType::ToastText02)?;
        let lines = xml.GetElementsByTagName(&HSTRING::from("text"))?;
        for (i, line) in [n.title.clone(), super::body_of(n)].iter().enumerate() {
            lines.Item(i as u32)?.AppendChild(&xml.CreateTextNode(&HSTRING::from(line))?)?;
        }
        let toast = ToastNotification::CreateToastNotification(&xml)?;
        toast.SetTag(&HSTRING::from(handle.to_string()))?;
        let group: String = n.source.as_deref().unwrap_or("atlas").chars().take(GROUP_MAX).collect();
        toast.SetGroup(&HSTRING::from(group))?;
        Ok(toast)
    }

    /// `HKCU\Software\Classes\AppUserModelId\<id>`: the name and the icon Windows shows above a toast. Set at every
    /// start, as the icon's file may have moved; this user's own hive, so no elevation.
    fn register() -> Result<(), String> {
        use windows_sys::Win32::Foundation::ERROR_SUCCESS;
        use windows_sys::Win32::System::Registry::{RegCloseKey, RegCreateKeyExW, RegSetValueExW, HKEY, HKEY_CURRENT_USER, KEY_SET_VALUE, REG_OPTION_NON_VOLATILE, REG_SZ};
        let wide = |s: &str| s.encode_utf16().chain([0]).collect::<Vec<u16>>();
        let path = wide(&format!("Software\\Classes\\AppUserModelId\\{APP_ID}"));
        let mut key: HKEY = std::ptr::null_mut();
        // SAFETY: the strings are NUL-terminated and outlive the calls; the key is closed below
        let made = unsafe { RegCreateKeyExW(HKEY_CURRENT_USER, path.as_ptr(), 0, std::ptr::null(), REG_OPTION_NON_VOLATILE, KEY_SET_VALUE, std::ptr::null(), &mut key, std::ptr::null_mut()) };
        if made != ERROR_SUCCESS {
            return Err(format!("the registry refused the app's name (error {made})"));
        }
        let set = |name: &str, value: &str| {
            let (name, value) = (wide(name), wide(value));
            // SAFETY: the length is the value's own, in bytes, its NUL included
            let done = unsafe { RegSetValueExW(key, name.as_ptr(), 0, REG_SZ, value.as_ptr().cast(), (value.len() * 2) as u32) };
            if done == ERROR_SUCCESS { Ok(()) } else { Err(format!("the registry refused a value of the app's name (error {done})")) }
        };
        let mut named = set("DisplayName", "Atlas");
        match icon() {
            Ok(file) => named = named.and(set("IconUri", &file.to_string_lossy())),
            Err(e) => eprintln!("atlas: toasts without the icon: {e}"), // the toast still shows
        }
        // SAFETY: opened above, closed once
        unsafe { RegCloseKey(key) };
        named
    }

    /// The icon as a file: Windows reads it from a path, and the program's own is inside the exe.
    fn icon() -> Result<std::path::PathBuf, String> {
        let dir = crate::platform::dirs::atlas(crate::platform::dirs::Base::Cache);
        let file = dir.join("toast-icon.png");
        std::fs::create_dir_all(&dir).and_then(|_| std::fs::write(&file, include_bytes!("../../atlas-app/icons/128x128.png"))).map_err(|e| e.to_string())?;
        Ok(file)
    }

    #[cfg(test)]
    mod tests {
        use super::*;

        // Shows nothing: only builds the toast. CI's Windows has the real WinRT classes and must pass; Wine has none.
        #[test]
        fn a_toast_says_title_and_body_as_text_and_carries_tag_and_group() {
            let n = Notice::new("a < b & c").body("line").source("x".repeat(GROUP_MAX + 9));
            let toast = match toast_of(&n, 7) {
                Ok(t) => t,
                Err(e) if std::env::var_os("CI").is_none() => return eprintln!("skipped: no WinRT toasts here (Wine?): {e}"),
                Err(e) => panic!("{e}"),
            };
            let xml = toast.Content().unwrap().GetXml().unwrap().to_string();
            assert!(xml.contains("a &lt; b &amp; c"), "{xml}");
            assert!(xml.contains(">line<"), "{xml}");
            assert_eq!(toast.Tag().unwrap().to_string(), "7");
            assert_eq!(toast.Group().unwrap().to_string().len(), GROUP_MAX);
        }
    }
}

/// The notices handed to a notifier, remembering each id's handle so a later one replaces it.
pub struct Delivery {
    notifier: Box<dyn Notifier>,
    handles: HashMap<String, u32>,
}

impl Delivery {
    pub fn new(notifier: Box<dyn Notifier>) -> Self {
        Self { notifier, handles: HashMap::new() }
    }

    /// Applies the rules and shows it; whether it was shown. A notifier's failure is said, never fatal.
    pub fn offer(&mut self, mode: SystemNotices, n: &Notice, looked_at: bool, muted: bool) -> bool {
        if !shown(mode, n, looked_at, muted) {
            return false;
        }
        let replaces = n.id.as_ref().and_then(|id| self.handles.get(id).copied());
        match self.notifier.show(n, replaces) {
            Ok(handle) => {
                if let Some(id) = &n.id {
                    self.handles.insert(id.clone(), handle);
                }
                true
            }
            Err(e) => {
                eprintln!("atlas: system notification not shown ({}): {e}", n.title);
                false
            }
        }
    }
}

/// Follows a vault's notices for as long as it is served. Its `[notifications] system` is read per notice (notices are
/// rare; a change applies to the next). No source is muted yet: mutes live in the notifications sources' notes, read
/// here when that half is built.
pub fn spawn(ws: Workspace, bus: EventBus, presence: Arc<Presence>, notifier: Box<dyn Notifier>) -> tokio::task::JoinHandle<()> {
    let mut rx = bus.on_notice();
    tokio::spawn(async move {
        let mut delivery = Delivery::new(notifier);
        loop {
            let n = match rx.recv().await {
                Ok(n) => n,
                Err(tokio::sync::broadcast::error::RecvError::Lagged(_)) => continue,
                Err(_) => return,
            };
            let (ws, presence) = (ws.clone(), presence.clone());
            // the config read and a notifier's call (D-Bus) block: off the runtime's threads
            let offered = tokio::task::spawn_blocking(move || {
                let mode = ws.config().map(|c| c.notifications.system).unwrap_or_default();
                delivery.offer(mode, &n, presence.looked_at(), false);
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

    /// What a notifier was asked to show: each title, and the handle it was to replace.
    type Asked = Arc<Mutex<Vec<(String, Option<u32>)>>>;

    /// Records what it was asked to show.
    struct Shown(Asked);
    impl Notifier for Shown {
        fn show(&self, n: &Notice, replaces: Option<u32>) -> Result<u32, String> {
            let mut v = self.0.lock().unwrap();
            v.push((n.title.clone(), replaces));
            Ok(replaces.unwrap_or(v.len() as u32))
        }
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
    fn a_notice_with_the_same_id_replaces_the_earlier_one() {
        let seen = Arc::new(Mutex::new(vec![]));
        let mut d = Delivery::new(Box::new(Shown(seen.clone())));
        let mails = |n: u32| Notice::new(format!("{n} new mails")).id("mail:inbox");
        assert!(d.offer(SystemNotices::Always, &mails(1), false, false));
        assert!(d.offer(SystemNotices::Always, &Notice::new("other"), false, false));
        assert!(d.offer(SystemNotices::Always, &mails(3), false, false));
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
        bus.publish(crate::api::Event::Notify(Notice::new("backup failed").level(NoticeLevel::Failure)));
        until(2).await;
        task.abort();
        assert_eq!(titles(), ["nobody looks", "backup failed"]);
    }
}
