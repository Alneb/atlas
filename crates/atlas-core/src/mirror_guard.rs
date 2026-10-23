//! The mirror's write guard (docs/design/DESIGN-mirror-v2.md §2): every change to a mirrored vault's file first takes
//! the path's lease from the server's table, and tells it the new version after. The server's core reaches the table
//! directly ([`Local`]), a desktop's core over the network ([`Remote`]); a server that does not answer lets the write
//! through (§4: the conflict watcher merges what Syncthing then makes of it).
use crate::lease::{Answer, Holder, Leases, Why};
use crate::vault_write::{ContentHash, WriteGuard, WriteKind};
use crate::{Error, Result};
use std::path::{Path, PathBuf};
use std::collections::HashSet;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

/// How long a one-off write holds its lease: plenty for one write, short enough that a vanished device frees it soon.
pub const HOLD: Duration = Duration::from_secs(30);

/// The server could not be asked (no network, signed out, an old server without `/api/lease`).
#[derive(Debug)]
pub struct Unreachable(pub String);

/// Where the leases are kept.
pub trait LeaseLink: Send + Sync {
    fn ask(&self, path: &str, have: Option<ContentHash>) -> std::result::Result<Answer<ContentHash>, Unreachable>;
    fn done(&self, path: &str, version: Option<ContentHash>);
}

/// The guard of one mirrored vault: the lease of every path a change touches, waiting while another device holds it.
pub struct LeaseGuard<L> {
    root: PathBuf,
    link: L,
    /// how long a write waits for another device's lease (or, for a write that adds, for Syncthing) before failing
    patience: Duration,
    poll: Duration,
    /// the paths whose lease this write holds (not those written with the server unreachable)
    granted: Mutex<HashSet<String>>,
}

/// Where the base of a path is kept: the last version both copies had, what a conflict copy is merged against (§4).
pub fn base_path(root: &Path, rel: &str) -> PathBuf {
    root.join(".atlas/cache/sync-base").join(rel)
}

/// Bases are kept for text-sized files only: the three-way merge is for notes, not for PDFs.
const BASE_MAX: u64 = 2 * 1024 * 1024;

impl<L: LeaseLink> LeaseGuard<L> {
    pub fn new(root: &Path, link: L) -> Self {
        Self { root: root.to_path_buf(), link, patience: Duration::from_secs(20), poll: Duration::from_millis(250), granted: Mutex::default() }
    }

    #[cfg(test)]
    fn quick(mut self) -> Self {
        self.patience = Duration::from_millis(300);
        self.poll = Duration::from_millis(10);
        self
    }

    fn disk(&self, rel: &str) -> Option<ContentHash> {
        std::fs::read(self.root.join(rel)).ok().map(|b| ContentHash::of(&b))
    }

    /// One path's lease. A change that replaces or removes content is computed from this copy, so a copy behind the last
    /// version fails at once (`Conflict`: the caller reads again) — never written over the newer one. A change that only
    /// adds (an append, a new file) waits for Syncthing to bring the last version, then goes on top of it.
    fn take(&self, rel: &str, adds: bool) -> Result<()> {
        let until = Instant::now() + self.patience;
        loop {
            let why = match self.link.ask(rel, self.disk(rel)) {
                Ok(Answer::Granted) => {
                    self.granted.lock().unwrap_or_else(|e| e.into_inner()).insert(rel.to_string());
                    return Ok(());
                }
                Err(Unreachable(e)) => {
                    eprintln!("atlas: mirror: no lease for {rel} ({e}); written here only");
                    return Ok(());
                }
                Ok(Answer::Wait(why)) => why,
            };
            match &why {
                Why::Behind { .. } if !adds => return Err(Error::Conflict { current: None }),
                _ if Instant::now() >= until => {
                    return Err(Error::Other(anyhow::anyhow!(match why {
                        Why::HeldBy(h) => format!("{rel} is being written by {h}; try again in a moment"),
                        Why::Behind { .. } => format!("{rel}: Syncthing has not brought the server's newer copy yet"),
                    })))
                }
                _ => std::thread::sleep(self.poll),
            }
        }
    }
}

impl<L> LeaseGuard<L> {
    /// After a leased write the content here is the last version, which Syncthing carries to the server unopposed:
    /// the base of the next conflict, should one ever happen offline. Best effort — a lost base only means a merge asks.
    fn keep_base(&self, rel: &str) {
        if !self.granted.lock().unwrap_or_else(|e| e.into_inner()).remove(rel) {
            return;
        }
        let base = base_path(&self.root, rel);
        let now = self.root.join(rel);
        let kept = match std::fs::metadata(&now) {
            Ok(m) if m.is_file() && m.len() <= BASE_MAX => crate::vault_write::cache::copy(&now, &base),
            _ if base.exists() => crate::vault_write::cache::remove_file(&base),
            _ => Ok(()),
        };
        if let Err(e) = kept {
            eprintln!("atlas: mirror: no base kept for {rel}: {e}");
        }
    }
}

/// The paths a change needs the lease of, and whether it only adds to them. Folders have no content to lease: their
/// files' own changes are what Syncthing compares.
fn leased(rel: &str, kind: &WriteKind) -> Vec<(String, bool)> {
    if rel.starts_with(".atlas/cache/") {
        return vec![]; // per device, never synced
    }
    match kind {
        WriteKind::Write | WriteKind::Remove => vec![(rel.to_string(), false)],
        WriteKind::Append | WriteKind::Create => vec![(rel.to_string(), true)],
        WriteKind::Rename { to } => vec![(rel.to_string(), false), (to.clone(), true)],
        WriteKind::Mkdir | WriteKind::RemoveDir => vec![],
    }
}

impl<L: LeaseLink> WriteGuard for LeaseGuard<L> {
    fn before(&self, rel: &str, kind: &WriteKind, _current: Option<ContentHash>) -> Result<()> {
        // `_current` is not enough: a wait re-reads the disk, which Syncthing changes meanwhile
        for (path, adds) in leased(rel, kind) {
            self.take(&path, adds)?;
        }
        Ok(())
    }

    fn after(&self, rel: &str, kind: &WriteKind, new: Option<ContentHash>) {
        match kind {
            WriteKind::Rename { to } => {
                self.link.done(rel, None);
                self.link.done(to, new);
                self.keep_base(rel);
                self.keep_base(to);
            }
            _ => {
                for (path, _) in leased(rel, kind) {
                    self.link.done(&path, new);
                    self.keep_base(&path);
                }
            }
        }
    }
}

/// The server's own core: its table, no network. Its disk is the reference for a path never asked about.
pub struct Local {
    pub leases: Arc<Leases<ContentHash>>,
    pub root: PathBuf,
    pub holder: Holder,
}

impl LeaseLink for Local {
    fn ask(&self, path: &str, have: Option<ContentHash>) -> std::result::Result<Answer<ContentHash>, Unreachable> {
        let disk = || std::fs::read(self.root.join(path)).ok().map(|b| ContentHash::of(&b));
        Ok(self.leases.ask(path, &self.holder, have, disk, HOLD, Instant::now()))
    }
    fn done(&self, path: &str, version: Option<ContentHash>) {
        self.leases.done(path, &self.holder, version);
    }
}

/// The wire format of `POST <mirror>api/lease` (server.rs).
#[derive(serde::Serialize, serde::Deserialize)]
pub struct AskBody {
    pub path: String,
    pub holder: Holder,
    pub have: Option<ContentHash>,
}

#[derive(serde::Serialize, serde::Deserialize)]
pub struct DoneBody {
    pub path: String,
    pub holder: Holder,
    pub version: Option<ContentHash>,
}

/// The answer on the wire: `{"granted":true}`, `{"held_by":"phone"}`, `{"behind":true,"last":"<hex>"|null}`.
#[derive(serde::Serialize, serde::Deserialize, Default)]
pub struct AnswerBody {
    #[serde(default)]
    pub granted: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub held_by: Option<Holder>,
    #[serde(default)]
    pub behind: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub last: Option<ContentHash>,
}

impl From<Answer<ContentHash>> for AnswerBody {
    fn from(a: Answer<ContentHash>) -> Self {
        match a {
            Answer::Granted => Self { granted: true, ..Self::default() },
            Answer::Wait(Why::HeldBy(h)) => Self { held_by: Some(h), ..Self::default() },
            Answer::Wait(Why::Behind { last }) => Self { behind: true, last, ..Self::default() },
        }
    }
}

impl AnswerBody {
    fn answer(self) -> std::result::Result<Answer<ContentHash>, Unreachable> {
        match (self.granted, self.held_by, self.behind) {
            (true, None, false) => Ok(Answer::Granted),
            (false, Some(h), false) => Ok(Answer::Wait(Why::HeldBy(h))),
            (false, None, true) => Ok(Answer::Wait(Why::Behind { last: self.last })),
            _ => Err(Unreachable("the server's lease answer makes no sense".into())),
        }
    }
}

/// A desktop's (or the phone's) core: the server's table at `mirror` (a server vault's address, `https://host/v/notes/`),
/// signed in with the gate's cookies the bridge keeps for that host.
pub struct Remote {
    pub mirror: String,
    pub holder: Holder,
    pub store: crate::secrets::Store,
}

impl Remote {
    /// One blocking call. Run on its own thread: the guard is called from inside the core's async runtime, where a
    /// blocking client may not start its own.
    fn post<B: serde::Serialize + Send + 'static>(&self, what: &str, body: B) -> std::result::Result<String, Unreachable> {
        let url = reqwest::Url::parse(&format!("{}api/lease/{what}", self.mirror)).map_err(|e| Unreachable(e.to_string()))?;
        let cookie = crate::service_signin::cookie_header(&self.store, &url).ok().flatten();
        std::thread::spawn(move || {
            let client = reqwest::blocking::Client::builder()
                .redirect(reqwest::redirect::Policy::none())
                .connect_timeout(Duration::from_secs(3))
                .timeout(Duration::from_secs(8))
                .build()
                .map_err(|e| Unreachable(e.to_string()))?;
            let mut req = client.post(url).header("x-atlas", "1").json(&body);
            if let Some(c) = cookie {
                req = req.header("cookie", c);
            }
            let res = req.send().map_err(|e| Unreachable(e.to_string()))?;
            // a redirect is the gate's sign-in page: signed out counts as not answering (the write stays here)
            if !res.status().is_success() {
                return Err(Unreachable(format!("lease: {}", res.status())));
            }
            res.text().map_err(|e| Unreachable(e.to_string()))
        })
        .join()
        .unwrap_or_else(|_| Err(Unreachable("the lease call panicked".into())))
    }
}

impl LeaseLink for Remote {
    fn ask(&self, path: &str, have: Option<ContentHash>) -> std::result::Result<Answer<ContentHash>, Unreachable> {
        let text = self.post("ask", AskBody { path: path.into(), holder: self.holder.clone(), have })?;
        serde_json::from_str::<AnswerBody>(&text).map_err(|e| Unreachable(e.to_string()))?.answer()
    }
    fn done(&self, path: &str, version: Option<ContentHash>) {
        if let Err(Unreachable(e)) = self.post("done", DoneBody { path: path.into(), holder: self.holder.clone(), version }) {
            eprintln!("atlas: mirror: could not hand back the lease of {path} ({e}); it runs out by itself");
        }
    }
}

/// The server's own core in its table.
pub const SERVER: &str = "server";

/// A server's vault: its own writes take the lease in `leases` (asked of it by the devices mirroring it).
pub fn install_on_server(ws: &crate::Workspace, leases: Arc<Leases<ContentHash>>) {
    let link = Local { leases, root: ws.root().to_path_buf(), holder: SERVER.into() };
    ws.set_write_guard(Arc::new(LeaseGuard::new(ws.root(), link)));
    eprintln!("atlas: mirror: {} is mirrored by a device; its writes take leases", ws.root().display());
}

/// The server copy of the local vault at `root` (the vault list's `mirror = …`), ending in `/`.
pub fn mirror_of(root: &Path) -> Option<String> {
    let root = root.to_string_lossy();
    let mut m = crate::vaults::list(&crate::vaults::list_file()).into_iter().find(|v| v.path == root).and_then(|v| v.mirror)?;
    if !m.ends_with('/') {
        m.push('/');
    }
    Some(m)
}

/// A local vault: when the vault list says it has a copy on a server (`mirror = …`), every write asks that server first;
/// otherwise no guard.
pub fn install_for_mirror(ws: &crate::Workspace) {
    match mirror_of(ws.root()) {
        Some(mirror) => {
            let link = Remote { mirror, holder: device_id(), store: crate::secrets::Store::for_vault(ws.root()) };
            ws.set_write_guard(Arc::new(LeaseGuard::new(ws.root(), link)));
        }
        None => ws.clear_write_guard(),
    }
}

/// This device's name in the lease table: stable across restarts (`~/.local/state/atlas/device-id`), made once.
pub fn device_id() -> Holder {
    let state = std::env::var_os("XDG_STATE_HOME")
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from(std::env::var_os("HOME").unwrap_or_default()).join(".local/state"));
    let file = state.join("atlas/device-id");
    if let Ok(id) = std::fs::read_to_string(&file) {
        if !id.trim().is_empty() {
            return id.trim().to_string();
        }
    }
    let host = std::fs::read_to_string("/etc/hostname").map(|h| h.trim().to_string()).unwrap_or_default();
    let mut tag = [0u8; 4];
    let _ = getrandom::getrandom(&mut tag);
    let id = format!("{}-{}", if host.is_empty() { "device" } else { &host }, ContentHash::of(&tag).to_hex().get(..8).unwrap_or("0"));
    if let Err(e) = crate::vault_write::outside::write(&file, id.as_bytes()) {
        eprintln!("atlas: mirror: could not keep the device id in {}: {e}", file.display());
    }
    id
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Mutex;

    /// Two devices on one table: the server's `Local`, and a "desktop" whose own disk is a second folder.
    struct Shared(Arc<Leases<ContentHash>>, PathBuf, &'static str, Arc<Mutex<bool>>);
    impl LeaseLink for Shared {
        fn ask(&self, path: &str, have: Option<ContentHash>) -> std::result::Result<Answer<ContentHash>, Unreachable> {
            if *self.3.lock().unwrap() {
                return Err(Unreachable("offline".into()));
            }
            let disk = || std::fs::read(self.1.join(path)).ok().map(|b| ContentHash::of(&b));
            Ok(self.0.ask(path, self.2, have, disk, HOLD, Instant::now()))
        }
        fn done(&self, path: &str, v: Option<ContentHash>) {
            self.0.done(path, self.2, v);
        }
    }

    fn setup() -> (tempfile::TempDir, tempfile::TempDir, Arc<Leases<ContentHash>>, Arc<Mutex<bool>>) {
        let (server, desktop) = (tempfile::tempdir().unwrap(), tempfile::tempdir().unwrap());
        for d in [&server, &desktop] {
            std::fs::write(d.path().join("log.md"), "v1\n").unwrap();
        }
        (server, desktop, Arc::default(), Arc::default())
    }

    #[test]
    fn a_copy_behind_the_last_version_is_refused_and_an_append_waits_for_it() {
        let (server, desktop, leases, offline) = setup();
        let srv = LeaseGuard::new(server.path(), Shared(leases.clone(), server.path().into(), "server", offline.clone())).quick();
        let desk = LeaseGuard::new(desktop.path(), Shared(leases.clone(), server.path().into(), "desktop", offline.clone())).quick();
        // the desktop writes v2; the server's copy is still v1 (Syncthing has not carried it)
        desk.before("log.md", &WriteKind::Write, None).unwrap();
        std::fs::write(desktop.path().join("log.md"), "v2\n").unwrap();
        desk.after("log.md", &WriteKind::Write, Some(ContentHash::of(b"v2\n")));
        // the server's own save, computed from v1, must not land on top of v2
        assert!(matches!(srv.before("log.md", &WriteKind::Write, None), Err(Error::Conflict { .. })));
        // an append waits; Syncthing brings v2 meanwhile, and it goes on top
        let p = server.path().join("log.md");
        let syncthing = std::thread::spawn(move || {
            std::thread::sleep(Duration::from_millis(60));
            std::fs::write(p, "v2\n").unwrap();
        });
        srv.before("log.md", &WriteKind::Append, None).unwrap();
        syncthing.join().unwrap();
    }

    #[test]
    fn a_held_path_waits_then_fails_and_an_unreachable_server_lets_the_write_through() {
        let (server, desktop, leases, offline) = setup();
        let srv = LeaseGuard::new(server.path(), Shared(leases.clone(), server.path().into(), "server", offline.clone())).quick();
        let desk = LeaseGuard::new(desktop.path(), Shared(leases.clone(), server.path().into(), "desktop", offline.clone())).quick();
        desk.before("log.md", &WriteKind::Write, None).unwrap(); // held, never handed back
        let e = srv.before("log.md", &WriteKind::Append, None).unwrap_err().to_string();
        assert!(e.contains("being written by desktop"), "{e}");
        *offline.lock().unwrap() = true;
        srv.before("log.md", &WriteKind::Write, None).expect("no server: written here only");
    }

    #[test]
    fn a_rename_takes_both_paths_and_hands_the_content_to_the_new_one() {
        let (server, _desktop, leases, offline) = setup();
        let srv = LeaseGuard::new(server.path(), Shared(leases.clone(), server.path().into(), "server", offline)).quick();
        let to = WriteKind::Rename { to: "old/log.md".into() };
        srv.before("log.md", &to, None).unwrap();
        srv.after("log.md", &to, Some(ContentHash::of(b"v1\n")));
        assert_eq!(leases.version("log.md"), Some(None));
        assert_eq!(leases.version("old/log.md"), Some(Some(ContentHash::of(b"v1\n"))));
    }

    #[test]
    fn a_leased_write_keeps_its_base_and_an_offline_one_does_not() {
        let (server, desktop, leases, offline) = setup();
        let desk = LeaseGuard::new(desktop.path(), Shared(leases, server.path().into(), "desktop", offline.clone())).quick();
        desk.before("log.md", &WriteKind::Write, None).unwrap();
        std::fs::write(desktop.path().join("log.md"), "v2\n").unwrap();
        desk.after("log.md", &WriteKind::Write, Some(ContentHash::of(b"v2\n")));
        assert_eq!(std::fs::read_to_string(base_path(desktop.path(), "log.md")).unwrap(), "v2\n");
        *offline.lock().unwrap() = true;
        desk.before("log.md", &WriteKind::Write, None).unwrap();
        std::fs::write(desktop.path().join("log.md"), "offline\n").unwrap();
        desk.after("log.md", &WriteKind::Write, Some(ContentHash::of(b"offline\n")));
        assert_eq!(std::fs::read_to_string(base_path(desktop.path(), "log.md")).unwrap(), "v2\n", "the base stays the shared version");
    }

    #[test]
    fn the_answer_survives_the_wire() {
        for a in [Answer::Granted, Answer::Wait(Why::HeldBy("phone".into())), Answer::Wait(Why::Behind { last: Some(ContentHash::of(b"x")) }), Answer::Wait(Why::Behind { last: None })] {
            let text = serde_json::to_string(&AnswerBody::from(a.clone())).unwrap();
            assert_eq!(serde_json::from_str::<AnswerBody>(&text).unwrap().answer().unwrap(), a, "{text}");
        }
    }
}
