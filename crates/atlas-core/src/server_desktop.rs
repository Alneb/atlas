//! One core for every local vault of the desktop (docs/refactor/REFACTOR-one-core.md). Each vault on the vault list is at
//! `/v/<name>/` of this core, started the first time it is asked for and kept warm after that, so a switch is a page
//! load. A vault another Atlas already serves (a second window of an older run) is not started twice: two cores on one
//! vault would run its schedules twice.
use super::{start_vault, AppState, VaultRun};
use axum::extract::{OriginalUri, Request};
use axum::http::{StatusCode, Uri};
use axum::response::{IntoResponse, Redirect, Response};
use axum::Router;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use tower::ServiceExt;

/// A vault's router and what runs for it.
pub(super) struct Started {
    router: Router,
    run: VaultRun,
}

pub(super) struct DesktopVaults {
    port: u16,
    lock: Option<Arc<crate::local_lock::LocalLock>>,
    /// The vault list (`vaults.toml`); a test names its own.
    list: PathBuf,
    /// Address names and their folders (canonical), in the order they were met; the first is the window's own.
    names: Mutex<Vec<(String, PathBuf)>>,
    /// The vaults started so far; a start holds the lock (starts are rare and must not race).
    started: tokio::sync::Mutex<HashMap<String, Arc<Started>>>,
}

/// A folder's name as an address name: letters, digits, `-` and `_` (anything else a `-`).
fn address_name(root: &Path) -> String {
    let raw = root.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
    let clean: String = raw.chars().map(|c| if c.is_ascii_alphanumeric() || c == '-' || c == '_' { c } else { '-' }).collect();
    let clean = clean.trim_matches('-').to_string();
    if clean.is_empty() { "vault".into() } else { clean }
}

fn canonical(root: &Path) -> PathBuf {
    crate::paths::real(root).unwrap_or_else(|_| root.to_path_buf())
}

impl DesktopVaults {
    pub(super) fn new(first: &Path, port: u16, lock: Option<Arc<crate::local_lock::LocalLock>>, list: PathBuf) -> Arc<Self> {
        let d = Arc::new(DesktopVaults { port, lock, list, names: Mutex::new(Vec::new()), started: Default::default() });
        d.name_for(first);
        // the window comes back to its own vault after any time in another: its note index is never dropped
        crate::links::keep_warm(&canonical(first));
        d.refresh();
        d
    }

    /// Learns the folders on the vault list (a vault added from another window shows up here too).
    fn refresh(&self) {
        for v in crate::vaults::list(&self.list) {
            if v.url.is_none() && !v.missing {
                self.name_for(Path::new(&v.path));
            }
        }
    }

    /// The address name of a local vault, given one the first time it is met (a second `Notes` is `Notes-2`).
    pub(super) fn name_for(&self, root: &Path) -> String {
        let root = canonical(root);
        let mut names = self.names.lock().unwrap_or_else(|e| e.into_inner());
        if let Some((n, _)) = names.iter().find(|(_, r)| *r == root) {
            return n.clone();
        }
        let base = address_name(&root);
        let name = (1..).map(|i| if i == 1 { base.clone() } else { format!("{base}-{i}") }).find(|n| !names.iter().any(|(m, _)| m == n)).expect("a free name");
        names.push((name.clone(), root));
        name
    }

    fn root_of(&self, name: &str) -> Option<PathBuf> {
        let find = || self.names.lock().unwrap_or_else(|e| e.into_inner()).iter().find(|(n, _)| n == name).map(|(_, r)| r.clone());
        find().or_else(|| {
            self.refresh();
            find()
        })
    }

    fn first(&self) -> String {
        self.names.lock().unwrap_or_else(|e| e.into_inner())[0].0.clone()
    }

    /// `/v/<name>/`, where the page of that vault is.
    pub(super) fn url_of(&self, root: &Path) -> String {
        format!("/v/{}/", self.name_for(root))
    }

    /// Whether the vault at `root` is started (unknown while another is starting: not warm).
    pub(super) fn warm(&self, root: &Path) -> bool {
        let name = self.name_for(root);
        self.started.try_lock().is_ok_and(|s| s.contains_key(&name))
    }

    /// The other local vaults marked "always on" ([`ahead_of`]), started one after another a while after the window's own: the
    /// first switch to one is then a page load, not a vault's start (its watcher, plugins and scheduler). Each one's note
    /// index is then built in the background at the lowest priority, so the switch's first graph, backlinks or Bases
    /// find it built too. One that will not start, or that another Atlas serves, is left for its first request to say
    /// why. A test's core starts nothing ahead.
    pub(super) async fn start_ahead(self: Arc<Self>, after: std::time::Duration) {
        if std::env::var_os("ATLAS_NO_SCHEDULE").is_some() {
            return;
        }
        tokio::time::sleep(after).await;
        self.refresh();
        let first = self.names.lock().unwrap_or_else(|e| e.into_inner())[0].1.clone(); // kept canonical
        for root in ahead_of(&crate::vaults::list(&self.list), &first) {
            self.start(&root).await;
        }
    }

    /// Starts the vault at `root` now (its watcher, plugins, scheduler) and builds its note index in the background:
    /// one marked "always on", at the app's start or the moment it is marked.
    pub(super) async fn start(self: &Arc<Self>, root: &Path) {
        let name = self.name_for(root);
        if self.router(&name).await.is_ok() {
            match crate::workspace::Workspace::open(root).and_then(|ws| Ok((ws.config()?, ws))) {
                Ok((cfg, ws)) => crate::links::warm_in_background(ws.root(), &cfg),
                Err(e) => eprintln!("atlas: note index of {} not built ahead: {e}", root.display()),
            }
        }
    }

    /// The vault's router, started now when this is its first request; else the answer that says why not (boxed: an
    /// answer is large, the router small).
    async fn router(self: &Arc<Self>, name: &str) -> Result<Router, Box<Response>> {
        let Some(root) = self.root_of(name) else { return Err(Box::new(not_here(name))) };
        let mut started = self.started.lock().await;
        if let Some(s) = started.get(name) {
            return Ok(s.router.clone());
        }
        if let Some(other) = crate::vaults::served_elsewhere(&root) {
            return Err(Box::new(elsewhere(name, &other)));
        }
        let (port, lock, prefix, me) = (self.port, self.lock.clone(), format!("/v/{name}"), Arc::downgrade(self));
        let made = tokio::task::spawn_blocking(move || {
            let (router, run, state) = start_vault(&root, port, None, lock, None, &prefix)?;
            state.desktop.set(me).ok();
            anyhow::Ok(Started { router, run })
        })
        .await;
        match made {
            Ok(Ok(s)) => {
                let router = s.router.clone();
                started.insert(name.to_string(), Arc::new(s));
                Ok(router)
            }
            Ok(Err(e)) => Err(Box::new((StatusCode::INTERNAL_SERVER_ERROR, format!("the vault {name} could not start: {e:#}")).into_response())),
            Err(e) => Err(Box::new((StatusCode::INTERNAL_SERVER_ERROR, format!("the vault {name} could not start: {e}")).into_response())),
        }
    }

    /// Every request: `/` goes to the window's own vault, `/v/<name>/…` to that vault (its prefix taken off, as `nest`
    /// does), anything else (the bridge to a server, `/capture.html`, the one-time link) to the window's own vault.
    pub(super) async fn dispatch(self: Arc<Self>, req: Request) -> Response {
        let path = req.uri().path().to_string();
        let query = req.uri().query().map(|q| format!("?{q}")).unwrap_or_default();
        if path == "/" {
            return Redirect::temporary(&format!("/v/{}/{query}", self.first())).into_response();
        }
        let (name, inner) = match path.strip_prefix("/v/") {
            Some(rest) => match rest.split_once('/') {
                Some((n, r)) => (n.to_string(), format!("/{r}")),
                None => return Redirect::temporary(&format!("/v/{rest}/{query}")).into_response(),
            },
            None => (self.first(), path.clone()),
        };
        let router = match self.router(&name).await {
            Ok(r) => r,
            Err(refused) => return *refused,
        };
        let (mut parts, body) = req.into_parts();
        let original = parts.uri.clone();
        parts.uri = match format!("{inner}{query}").parse::<Uri>() {
            Ok(u) => u,
            Err(_) => return StatusCode::BAD_REQUEST.into_response(),
        };
        parts.extensions.insert(OriginalUri(original));
        match router.oneshot(Request::from_parts(parts, body)).await {
            Ok(r) => r,
            Err(never) => match never {},
        }
    }

    /// The vault at `root` no longer served: its tasks stopped, its name forgotten (a guest closed; opened again, it starts
    /// afresh under a name of its own). Requests already inside its router finish; the watcher goes with the last of them.
    pub(super) async fn close(&self, root: &Path) {
        let root = canonical(root);
        let name = self.names.lock().unwrap_or_else(|e| e.into_inner()).iter().find(|(_, r)| *r == root).map(|(n, _)| n.clone());
        let Some(name) = name else { return };
        if let Some(s) = self.started.lock().await.remove(&name) {
            s.run.stop();
        }
        self.names.lock().unwrap_or_else(|e| e.into_inner()).retain(|(n, _)| *n != name);
    }

    /// For a clean stop: what runs for each started vault.
    pub(super) async fn runs(&self) -> Vec<Arc<Started>> {
        self.started.lock().await.values().cloned().collect()
    }

    /// The same, from code that cannot wait (None while a vault is starting).
    pub(super) fn runs_now(&self) -> Option<Vec<Arc<Started>>> {
        self.started.try_lock().ok().map(|s| s.values().cloned().collect())
    }
}

impl Started {
    pub(super) fn run(&self) -> &VaultRun {
        &self.run
    }
}

/// The vaults `start_ahead` starts: local ones on the list marked "always on" that exist and are not `first` (the window's
/// own, already started). The others start on their first request (a few tens of ms on a vault of thousands of notes,
/// docs/decisions/PERFORMANCE.md "Two vaults open") and until then cost nothing: no watcher, no threads, no scheduler.
/// The owner chooses which run in the background (each ≈ 6–9 MB and ≈ 10 ms of CPU a minute idle, measured).
fn ahead_of(list: &[crate::vaults::Vault], first: &Path) -> Vec<PathBuf> {
    list.iter().filter(|v| v.always_on && v.url.is_none() && !v.missing).map(|v| canonical(Path::new(&v.path))).filter(|root| root != first).collect()
}

fn not_here(name: &str) -> Response {
    (StatusCode::NOT_FOUND, axum::response::Html(format!("<!doctype html><meta charset=utf-8><title>Atlas</title><p>No vault called <b>{}</b> on this computer's list. <a href=\"/\">Back</a></p>", esc(name)))).into_response()
}

fn elsewhere(name: &str, other: &str) -> Response {
    let body = format!(
        "<!doctype html><meta charset=utf-8><title>Atlas</title><p><b>{}</b> is open in another Atlas window ({}), which keeps it running; close that window and come back, or use it there.</p><p><a href=\"/\">Back</a></p>",
        esc(name),
        esc(other)
    );
    (StatusCode::CONFLICT, axum::response::Html(body)).into_response()
}

fn esc(t: &str) -> String {
    t.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;").replace('"', "&quot;")
}

/// What a vault's routes need of the registry (the vault list's addresses); a weak link, so the registry, which holds
/// the routes, is not kept alive by them.
pub(super) type DesktopLink = std::sync::OnceLock<std::sync::Weak<DesktopVaults>>;

pub(super) fn of(st: &AppState) -> Option<Arc<DesktopVaults>> {
    st.desktop.get().and_then(std::sync::Weak::upgrade)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn vault(path: &Path, last_opened: i64) -> crate::vaults::Vault {
        crate::vaults::Vault { name: String::new(), path: path.to_string_lossy().into_owned(), last_opened, missing: false, url: None, mirror: None, warm: false, always_on: true }
    }

    /// Only the vaults marked "always on" start with the app, however recently the others were opened; never the
    /// window's own (already started), a missing folder or a server's vault.
    #[test]
    fn only_the_vaults_marked_always_on_start_with_the_app() {
        let dir = tempfile::tempdir().unwrap();
        let [own, on, off] = ["own", "on", "off"].map(|n| {
            std::fs::create_dir(dir.path().join(n)).unwrap();
            canonical(&dir.path().join(n))
        });
        let mut not_marked = vault(&off, 0);
        not_marked.always_on = false;
        let list = vec![vault(&own, 0), vault(&on, 0), not_marked];
        assert_eq!(ahead_of(&list, &own), vec![on.clone()], "the marked one; not the one opened lately but unmarked");
        let mut gone = vault(&on, 0);
        gone.missing = true;
        let mut remote = vault(&off, 0);
        remote.url = Some("https://notes.example.org/v/work/".into());
        assert!(ahead_of(&[gone, remote], &own).is_empty(), "a missing folder or a server's vault is never started here");
    }
}
