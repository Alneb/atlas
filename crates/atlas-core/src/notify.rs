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

/// Says each notice on stderr: the notifier until a platform's is built, and a headless core's.
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

/// The platform's notifier. Each platform's own comes in its step of the design; until then every one logs.
pub fn platform() -> Box<dyn Notifier> {
    Box::new(LogNotifier { next: AtomicU64::new(0) })
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
            let mode = ws.config().map(|c| c.notifications.system).unwrap_or_default();
            delivery.offer(mode, &n, presence.looked_at(), false);
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
