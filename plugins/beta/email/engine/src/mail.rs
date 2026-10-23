//! The engine's state: the index, the accounts the last call described, logged-in IMAP connections kept between
//! calls (at most two idle per account, checked with NOOP before reuse), the async runtime the network runs on, and
//! the events the page listens to (`atlas.helper.on`).

use crate::account::{self, Account};
use crate::imap::Imap;
use crate::index::Index;
use crate::oauth;
use serde_json::{json, Value};
use std::collections::{HashMap, HashSet};
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

/// Where events go: the helper's stdout in the plugin, a list in tests.
pub type Emit = dyn Fn(&str, Value) + Send + Sync;
/// A POST to Atlas's API (`/api/…`, another plugin's tool among them): over the helper's pipe; a stand-in in tests.
pub type Core = dyn Fn(&str, &Value) -> Result<Value, String> + Send + Sync;

pub struct Mail {
    pub index: Index,
    pub rt: tokio::runtime::Runtime,
    /// how forms are POSTed to Microsoft (the core's fetch; a stand-in in tests)
    pub post: Arc<oauth::Post>,
    pub emit: Box<Emit>,
    core: Mutex<Arc<Core>>,
    /// the plugin's cache folder (attachments opened, the index)
    pub cache: PathBuf,
    /// the vault (saved notes)
    pub root: PathBuf,
    /// the last call's settings and secrets: what background work uses
    params: Mutex<Value>,
    pool: Mutex<HashMap<String, Vec<(Imap, Instant)>>>,
    /// accounts being synced now (a second sync of one waits for nothing: it is skipped)
    syncing: Mutex<HashSet<String>>,
    /// accounts whose IDLE / polling loop runs
    pub watching: Mutex<HashSet<String>>,
    /// how many syncs each account has had (every tenth also checks every flag)
    pub rounds: Mutex<HashMap<String, u64>>,
    /// each account's last status event (syncing, idle, offline, error): what the sidebar shows
    statuses: Mutex<HashMap<String, Value>>,
}

const POOL_MAX: usize = 2;
const POOL_AGE: Duration = Duration::from_secs(600);

impl Mail {
    pub fn new(index: Index, cache: PathBuf, root: PathBuf, post: Arc<oauth::Post>, emit: Box<Emit>) -> Arc<Mail> {
        let rt = tokio::runtime::Builder::new_multi_thread().worker_threads(4).enable_all().thread_name("email-net").build().expect("runtime");
        Arc::new(Mail {
            index,
            rt,
            post,
            emit,
            core: Mutex::new(Arc::new(|path: &str, body: &Value| atlas_plugin::Atlas::new().post(path, body).map_err(|e| e.to_string()))),
            cache,
            root,
            params: Mutex::new(json!({})),
            pool: Mutex::new(HashMap::new()),
            syncing: Mutex::new(HashSet::new()),
            watching: Mutex::new(HashSet::new()),
            rounds: Mutex::new(HashMap::new()),
            statuses: Mutex::new(HashMap::new()),
        })
    }

    /// Keep what a call carried (settings, secrets) for the background work; a call without settings keeps the last.
    pub fn remember(&self, params: &Value) {
        if params.get("settings").is_some() {
            let was = account::all(&self.params());
            let now = account::all(params);
            for a in was.iter().flatten() {
                if !now.iter().flatten().any(|b| b == a) {
                    self.drop_conns(&a.name);
                }
            }
            let mut p = self.params.lock().unwrap();
            p["settings"] = params["settings"].clone();
            if let Some(s) = params.get("secrets").filter(|s| s.as_object().is_some_and(|o| !o.is_empty())) {
                p["secrets"] = s.clone();
            }
        }
    }

    pub fn params(&self) -> Value {
        self.params.lock().unwrap().clone()
    }

    pub fn setting(&self, key: &str) -> Value {
        self.params.lock().unwrap().pointer(&format!("/settings/{key}")).cloned().unwrap_or(Value::Null)
    }

    pub fn setting_u64(&self, key: &str, default: u64) -> u64 {
        match self.setting(key) {
            Value::Number(n) => n.as_u64().unwrap_or(default),
            Value::String(s) => s.trim().parse().unwrap_or(default),
            _ => default,
        }
    }

    pub fn setting_bool(&self, key: &str, default: bool) -> bool {
        self.setting(key).as_bool().unwrap_or(default)
    }

    /// Every account the settings describe (the ones that cannot be used carry why).
    pub fn accounts(&self) -> Vec<Result<Account, String>> {
        let mut p = self.params();
        // a rotated Outlook refresh token wins over the one the call carried
        for (k, v) in oauth::rotated_peek() {
            p["secrets"][k] = json!(v);
        }
        account::all(&p)
    }

    pub fn account(&self, name: Option<&str>) -> Result<Account, String> {
        let mut p = self.params();
        if let Some(n) = name.filter(|n| !n.is_empty()) {
            p["account"] = json!(n);
        }
        for (k, v) in oauth::rotated_peek() {
            p["secrets"][k] = json!(v);
        }
        account::pick(&p)
    }

    pub fn event(&self, name: &str, data: Value) {
        if name == "status" {
            if let Some(a) = data["account"].as_str() {
                self.statuses.lock().unwrap().insert(a.to_string(), data.clone());
            }
        }
        (self.emit)(name, data)
    }

    pub fn status(&self, account: &str) -> Value {
        self.statuses.lock().unwrap().get(account).cloned().unwrap_or(Value::Null)
    }

    /// A logged-in connection to an account's IMAP server: a kept one that still answers, else a new one.
    pub async fn conn(&self, acc: &Account) -> Result<Imap, String> {
        loop {
            let kept = {
                let mut pool = self.pool.lock().unwrap();
                let list = pool.entry(acc.name.clone()).or_default();
                list.retain(|(_, at)| at.elapsed() < POOL_AGE);
                list.pop()
            };
            match kept {
                Some((mut c, _)) => {
                    if c.noop().await {
                        return Ok(c);
                    }
                }
                None => break,
            }
        }
        let token = self.token(acc).await?;
        Imap::connect(acc, token).await
    }

    /// Hand a connection back for the next call (or close it when enough are kept).
    pub fn give_back(&self, c: Imap) {
        let mut pool = self.pool.lock().unwrap();
        let list = pool.entry(c.account.clone()).or_default();
        if list.len() < POOL_MAX {
            list.push((c, Instant::now()));
        } else {
            drop(pool);
            self.rt.spawn(c.logout());
        }
    }

    /// Forget an account's kept connections (its settings changed, or the server broke one).
    pub fn drop_conns(&self, account: &str) {
        let gone = self.pool.lock().unwrap().remove(account).unwrap_or_default();
        for (c, _) in gone {
            self.rt.spawn(c.logout());
        }
    }

    /// Outlook's access token (renewed through the core when needed); None for a password account.
    pub async fn token(&self, acc: &Account) -> Result<Option<String>, String> {
        if matches!(acc.auth, account::Auth::Password(_)) {
            return Ok(None);
        }
        // the core's fetch blocks on the helper's pipe: off the async workers
        let (acc2, post) = (acc.clone(), self.post.clone());
        tokio::task::spawn_blocking(move || oauth::access_token(&acc2, &*post)).await.map_err(|e| e.to_string())?
    }

    /// Marks an account as syncing; false when it already is (the caller then skips).
    pub fn begin_sync(&self, account: &str) -> bool {
        self.syncing.lock().unwrap().insert(account.to_string())
    }
    pub fn end_sync(&self, account: &str) {
        self.syncing.lock().unwrap().remove(account);
    }
    pub fn is_syncing(&self, account: &str) -> bool {
        self.syncing.lock().unwrap().contains(account)
    }

    /// POSTs to Atlas's API (the Calendar plugin's tools: `/api/plugins/dav/tools/<name>`).
    pub fn core_post(&self, path: &str, body: &Value) -> Result<Value, String> {
        let f = self.core.lock().unwrap().clone();
        f(path, body)
    }

    pub fn set_core(&self, f: Arc<Core>) {
        *self.core.lock().unwrap() = f;
    }

    /// The own addresses of every account (the address book leaves them out; "me" in lists).
    pub fn own(&self) -> Vec<String> {
        let mut v: Vec<String> = self.accounts().into_iter().flatten().flat_map(|a| a.own()).collect();
        v.sort();
        v.dedup();
        v
    }
}
