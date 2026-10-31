//! The mirror's write guard (docs/design/DESIGN-mirror-v2.md §2): every change to a mirrored vault's file first takes
//! the path's lease from the server's table, and tells it the new version after. The server's core reaches the table
//! directly ([`Local`]), a desktop's core over the network ([`Remote`]); a server that does not answer lets the write
//! through (§4: the conflict watcher merges what Syncthing then makes of it).
use crate::lease::{Answer, Holder, Leases, Why};
use crate::vault_write::{ContentHash, WriteGuard, WriteKind};
use crate::{Error, Result};
use std::path::{Path, PathBuf};
use std::collections::HashMap;
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

/// A lease held by this core's writes of one path.
#[derive(Default)]
struct Held {
    writes: usize,
    shared: bool,
}

/// The guard of one mirrored vault: the lease of every path a change touches, waiting while another device holds it.
pub struct LeaseGuard<L> {
    root: PathBuf,
    link: L,
    /// how long a write waits for another device's lease (or, for a write that adds, for Syncthing) before failing
    patience: Duration,
    poll: Duration,
    /// the paths whose lease is held here (not those written with the server unreachable): how many writes hold each,
    /// and whether two ever overlapped — two writes of one note (a save and a task tick) share the lease, and it is
    /// handed back once, by the last, with the version on disk then
    granted: Mutex<HashMap<String, Held>>,
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

    /// One path's lease. A change that replaces or removes content is computed from this copy as it was when the change
    /// began (`start`), so a copy behind the last version — or one Syncthing changed while this write waited for another
    /// device's lease — fails at once (`Conflict`: the caller reads again), never written over the newer one. A change
    /// that only adds (an append, a new file) waits for Syncthing to bring the last version, then goes on top of it.
    fn take(&self, rel: &str, adds: bool, start: Option<ContentHash>) -> Result<()> {
        let until = Instant::now() + self.patience;
        loop {
            let have = self.disk(rel);
            if !adds && have != start {
                return Err(Error::Conflict { current: None });
            }
            let why = match self.link.ask(rel, have) {
                Ok(Answer::Granted) => {
                    let mut g = self.granted.lock().unwrap_or_else(|e| e.into_inner());
                    let held = g.entry(rel.to_string()).or_default();
                    held.writes += 1;
                    held.shared |= held.writes > 1;
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

    /// Hands back a lease taken for a change that did not happen: the content is what it was, so that is the version.
    fn release(&self, rel: &str) {
        if self.last_out(rel).is_some() {
            self.link.done(rel, self.disk(rel));
        }
    }

    /// One write of `rel` is over: `Some(shared)` when it was the last one holding the lease.
    fn last_out(&self, rel: &str) -> Option<bool> {
        let mut g = self.granted.lock().unwrap_or_else(|e| e.into_inner());
        let held = g.get_mut(rel)?;
        held.writes -= 1;
        (held.writes == 0).then(|| g.remove(rel).is_some_and(|h| h.shared))
    }
}

impl<L: LeaseLink> LeaseGuard<L> {
    /// A leased path written (now `version`; `None`: gone): the lease handed back and the base kept. A path written with
    /// the server unreachable holds no lease, so nothing is handed back — a second call to a server that just failed
    /// would only add its timeout to the write.
    fn finish(&self, rel: &str, version: Option<ContentHash>) {
        if let Some(shared) = self.last_out(rel) {
            // after overlapping writes, the one finishing last may not be the one that wrote last: the disk says
            self.link.done(rel, if shared { self.disk(rel) } else { version });
            self.keep_base(rel);
        }
    }
}

impl<L> LeaseGuard<L> {
    /// After a leased write the content here is the last version, which Syncthing carries to the server unopposed:
    /// the base of the next conflict, should one ever happen offline. Best effort — a lost base only means a merge asks.
    /// Nothing in `.atlas/trash/` is merged, so it keeps none.
    fn keep_base(&self, rel: &str) {
        let base = base_path(&self.root, rel);
        let now = self.root.join(rel);
        let trashed = rel.starts_with(".atlas/trash/");
        let kept = match std::fs::metadata(&now) {
            Ok(_) if trashed => Ok(()),
            Ok(m) if m.is_file() && m.len() <= BASE_MAX => crate::vault_write::cache::copy(&now, &base),
            Ok(m) if m.is_dir() => Ok(()), // a folder's bases are its files' (moved along by `move_bases`)
            _ if base.is_dir() => crate::vault_write::cache::remove_dir_all(&base),
            _ if base.exists() => crate::vault_write::cache::remove_file(&base),
            _ => Ok(()),
        };
        if let Err(e) = kept {
            eprintln!("atlas: mirror: no base kept for {rel}: {e}");
        }
    }
}

impl<L> LeaseGuard<L> {
    /// A rename takes its bases along (a folder's: every file's in it), so a moved note still merges against its base.
    fn move_bases(&self, from: &str, to: &str) {
        let (a, b) = (base_path(&self.root, from), base_path(&self.root, to));
        if to.starts_with(".atlas/trash/") {
            return; // the source keeps no base once gone (`keep_base`): the trash is never merged
        }
        if a.exists() && !b.exists() {
            if let Err(e) = crate::vault_write::cache::rename(&a, &b) {
                eprintln!("atlas: mirror: the base of {from} was not moved to {to}: {e}");
            }
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
    fn before(&self, rel: &str, kind: &WriteKind, current: Option<ContentHash>) -> Result<()> {
        let paths = leased(rel, kind);
        for (i, (path, adds)) in paths.iter().enumerate() {
            // `current` is `rel`'s; a rename's destination only adds
            if let Err(e) = self.take(path, *adds, if path == rel { current } else { None }) {
                paths[..i].iter().for_each(|(p, _)| self.release(p)); // a rename's source, taken before its destination failed
                return Err(e);
            }
        }
        Ok(())
    }

    fn after(&self, rel: &str, kind: &WriteKind, new: Option<ContentHash>) {
        match kind {
            WriteKind::Rename { to } => {
                self.move_bases(rel, to);
                self.finish(rel, None);
                self.finish(to, new);
            }
            _ => leased(rel, kind).iter().for_each(|(path, _)| self.finish(path, new)),
        }
    }

    fn abort(&self, rel: &str, kind: &WriteKind) {
        leased(rel, kind).iter().for_each(|(p, _)| self.release(p));
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
            // one client for every call: its kept connection spares each write two TCP + TLS handshakes; made (and, being
            // static, never dropped) off the async runtime, where a blocking client may not start or end
            static CLIENT: std::sync::OnceLock<std::result::Result<reqwest::blocking::Client, String>> = std::sync::OnceLock::new();
            let client = CLIENT
                .get_or_init(|| {
                    reqwest::blocking::Client::builder()
                        .redirect(reqwest::redirect::Policy::none())
                        .connect_timeout(Duration::from_secs(3))
                        .timeout(Duration::from_secs(8))
                        .build()
                        .map_err(|e| e.to_string())
                })
                .as_ref()
                .map_err(|e| Unreachable(e.clone()))?;
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
    let file = crate::platform::dirs::atlas(crate::platform::dirs::Base::State).join("device-id");
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

    /// What the funnel hands `before`: the file's hash as the change begins.
    fn now(dir: &Path, rel: &str) -> Option<ContentHash> {
        std::fs::read(dir.join(rel)).ok().map(|b| ContentHash::of(&b))
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
        desk.before("log.md", &WriteKind::Write, now(desktop.path(), "log.md")).unwrap();
        std::fs::write(desktop.path().join("log.md"), "v2\n").unwrap();
        desk.after("log.md", &WriteKind::Write, Some(ContentHash::of(b"v2\n")));
        // the server's own save, computed from v1, must not land on top of v2
        assert!(matches!(srv.before("log.md", &WriteKind::Write, now(server.path(), "log.md")), Err(Error::Conflict { .. })));
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
        desk.before("log.md", &WriteKind::Write, now(desktop.path(), "log.md")).unwrap(); // held, never handed back
        let e = srv.before("log.md", &WriteKind::Append, None).unwrap_err().to_string();
        assert!(e.contains("being written by desktop"), "{e}");
        *offline.lock().unwrap() = true;
        srv.before("log.md", &WriteKind::Write, now(server.path(), "log.md")).expect("no server: written here only");
    }

    #[test]
    fn a_rename_takes_both_paths_and_hands_the_content_to_the_new_one() {
        let (server, _desktop, leases, offline) = setup();
        let srv = LeaseGuard::new(server.path(), Shared(leases.clone(), server.path().into(), "server", offline)).quick();
        let to = WriteKind::Rename { to: "old/log.md".into() };
        srv.before("log.md", &to, now(server.path(), "log.md")).unwrap();
        srv.after("log.md", &to, Some(ContentHash::of(b"v1\n")));
        assert_eq!(leases.version("log.md"), Some(None));
        assert_eq!(leases.version("old/log.md"), Some(Some(ContentHash::of(b"v1\n"))));
    }

    #[test]
    fn a_leased_write_keeps_its_base_and_an_offline_one_does_not() {
        let (server, desktop, leases, offline) = setup();
        let desk = LeaseGuard::new(desktop.path(), Shared(leases, server.path().into(), "desktop", offline.clone())).quick();
        desk.before("log.md", &WriteKind::Write, now(desktop.path(), "log.md")).unwrap();
        std::fs::write(desktop.path().join("log.md"), "v2\n").unwrap();
        desk.after("log.md", &WriteKind::Write, Some(ContentHash::of(b"v2\n")));
        assert_eq!(std::fs::read_to_string(base_path(desktop.path(), "log.md")).unwrap(), "v2\n");
        *offline.lock().unwrap() = true;
        desk.before("log.md", &WriteKind::Write, now(desktop.path(), "log.md")).unwrap();
        std::fs::write(desktop.path().join("log.md"), "offline\n").unwrap();
        desk.after("log.md", &WriteKind::Write, Some(ContentHash::of(b"offline\n")));
        assert_eq!(std::fs::read_to_string(base_path(desktop.path(), "log.md")).unwrap(), "v2\n", "the base stays the shared version");
    }

    #[test]
    fn a_save_waiting_on_anothers_lease_never_lands_on_the_version_syncthing_brought_meanwhile() {
        let (server, desktop, leases, offline) = setup();
        let srv = LeaseGuard::new(server.path(), Shared(leases.clone(), server.path().into(), "server", offline.clone())).quick();
        let mut desk = LeaseGuard::new(desktop.path(), Shared(leases.clone(), server.path().into(), "desktop", offline.clone())).quick();
        desk.patience = Duration::from_secs(5);
        // the server holds log.md and writes v2; Syncthing brings v2 here while the desktop's save (made from v1) waits
        srv.before("log.md", &WriteKind::Write, Some(ContentHash::of(b"v1\n"))).unwrap();
        let (s, d, l) = (server.path().to_path_buf(), desktop.path().to_path_buf(), leases.clone());
        let other = std::thread::spawn(move || {
            std::thread::sleep(Duration::from_millis(50));
            std::fs::write(s.join("log.md"), "v2\n").unwrap();
            l.done("log.md", "server", Some(ContentHash::of(b"v2\n")));
            std::fs::write(d.join("log.md"), "v2\n").unwrap(); // Syncthing
        });
        let got = desk.before("log.md", &WriteKind::Write, Some(ContentHash::of(b"v1\n")));
        other.join().unwrap();
        assert!(matches!(got, Err(Error::Conflict { .. })), "a save computed from v1 must not overwrite v2: {got:?}");
    }

    #[test]
    fn a_failed_write_hands_its_lease_back_and_keeps_no_base() {
        let (server, desktop, leases, offline) = setup();
        let srv = LeaseGuard::new(server.path(), Shared(leases.clone(), server.path().into(), "server", offline.clone())).quick();
        let desk = LeaseGuard::new(desktop.path(), Shared(leases.clone(), server.path().into(), "desktop", offline.clone())).quick();
        let v1 = Some(ContentHash::of(b"v1\n"));
        desk.before("log.md", &WriteKind::Write, v1).unwrap();
        desk.abort("log.md", &WriteKind::Write); // the disk was full, say
        srv.before("log.md", &WriteKind::Write, v1).expect("free at once, not after HOLD");
        srv.after("log.md", &WriteKind::Write, v1);
        // a later offline write on the desktop is not mistaken for a leased one (no base from it)
        *offline.lock().unwrap() = true;
        desk.before("log.md", &WriteKind::Write, v1).unwrap();
        std::fs::write(desktop.path().join("log.md"), "offline\n").unwrap();
        desk.after("log.md", &WriteKind::Write, Some(ContentHash::of(b"offline\n")));
        assert!(!base_path(desktop.path(), "log.md").exists());
    }

    #[test]
    fn a_rename_whose_destination_is_held_hands_the_source_back() {
        let (server, desktop, leases, offline) = setup();
        let srv = LeaseGuard::new(server.path(), Shared(leases.clone(), server.path().into(), "server", offline.clone())).quick();
        let desk = LeaseGuard::new(desktop.path(), Shared(leases.clone(), server.path().into(), "desktop", offline.clone())).quick();
        srv.before("new.md", &WriteKind::Create, None).unwrap(); // held by the server
        let mv = WriteKind::Rename { to: "new.md".into() };
        assert!(desk.before("log.md", &mv, Some(ContentHash::of(b"v1\n"))).is_err());
        srv.before("log.md", &WriteKind::Append, None).expect("the source was handed back");
    }

    #[test]
    fn a_renamed_folder_takes_its_files_bases_along() {
        let (server, desktop, leases, offline) = setup();
        let desk = LeaseGuard::new(desktop.path(), Shared(leases, server.path().into(), "desktop", offline)).quick();
        std::fs::create_dir_all(desktop.path().join("a")).unwrap();
        std::fs::create_dir_all(server.path().join("a")).unwrap();
        std::fs::write(desktop.path().join("a/n.md"), "x\n").unwrap();
        std::fs::write(server.path().join("a/n.md"), "x\n").unwrap();
        desk.before("a/n.md", &WriteKind::Write, Some(ContentHash::of(b"x\n"))).unwrap();
        desk.after("a/n.md", &WriteKind::Write, Some(ContentHash::of(b"x\n")));
        let mv = WriteKind::Rename { to: "b".into() };
        desk.before("a", &mv, None).unwrap();
        std::fs::rename(desktop.path().join("a"), desktop.path().join("b")).unwrap();
        desk.after("a", &mv, None);
        assert_eq!(std::fs::read_to_string(base_path(desktop.path(), "b/n.md")).unwrap(), "x\n");
        assert!(!base_path(desktop.path(), "a").exists());
    }

    #[test]
    fn an_offline_write_hands_nothing_back_and_a_trashed_file_keeps_no_base() {
        /// A server that never answers, counting the calls made to it.
        struct Down(Arc<Mutex<usize>>);
        impl LeaseLink for Down {
            fn ask(&self, _: &str, _: Option<ContentHash>) -> std::result::Result<Answer<ContentHash>, Unreachable> {
                *self.0.lock().unwrap() += 1;
                Err(Unreachable("offline".into()))
            }
            fn done(&self, _: &str, _: Option<ContentHash>) {
                *self.0.lock().unwrap() += 1;
            }
        }
        let (_server, desktop, leases, offline) = setup();
        let calls = Arc::new(Mutex::new(0));
        let desk = LeaseGuard::new(desktop.path(), Down(calls.clone())).quick();
        desk.before("log.md", &WriteKind::Write, now(desktop.path(), "log.md")).unwrap();
        desk.after("log.md", &WriteKind::Write, Some(ContentHash::of(b"v2\n")));
        let mv = WriteKind::Rename { to: "b.md".into() };
        desk.before("log.md", &mv, now(desktop.path(), "log.md")).unwrap();
        desk.after("log.md", &mv, None);
        assert_eq!(*calls.lock().unwrap(), 3, "one ask per path, no `done` after an ask that failed");
        // a note moved to the trash under a lease: the trash is never merged, so no base for it
        let desk = LeaseGuard::new(desktop.path(), Shared(leases, desktop.path().into(), "desktop", offline)).quick();
        std::fs::write(desktop.path().join("log.md"), "v1\n").unwrap();
        desk.before("log.md", &WriteKind::Write, now(desktop.path(), "log.md")).unwrap();
        desk.after("log.md", &WriteKind::Write, Some(ContentHash::of(b"v1\n")));
        assert!(base_path(desktop.path(), "log.md").exists());
        let trash = WriteKind::Rename { to: ".atlas/trash/20261029-120000/log.md".into() };
        desk.before("log.md", &trash, now(desktop.path(), "log.md")).unwrap();
        std::fs::create_dir_all(desktop.path().join(".atlas/trash/20261029-120000")).unwrap();
        std::fs::rename(desktop.path().join("log.md"), desktop.path().join(".atlas/trash/20261029-120000/log.md")).unwrap();
        desk.after("log.md", &trash, Some(ContentHash::of(b"v1\n")));
        assert!(!base_path(desktop.path(), ".atlas/trash/20261029-120000/log.md").exists());
        assert!(!base_path(desktop.path(), "log.md").exists(), "nor is the source's kept");
    }

    #[test]
    fn the_answer_survives_the_wire() {
        for a in [Answer::Granted, Answer::Wait(Why::HeldBy("phone".into())), Answer::Wait(Why::Behind { last: Some(ContentHash::of(b"x")) }), Answer::Wait(Why::Behind { last: None })] {
            let text = serde_json::to_string(&AnswerBody::from(a.clone())).unwrap();
            assert_eq!(serde_json::from_str::<AnswerBody>(&text).unwrap().answer().unwrap(), a, "{text}");
        }
    }
}
