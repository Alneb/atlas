//! Server mode's sign-in (docs/design/DESIGN-server-and-android.md, docs/guides/SERVER.md). Off on the desktop: there the core
//! listens on 127.0.0.1 only and nothing here runs. With `atlas serve --listen`, every request is either the owner
//! (a session from the sign-in page, a trusted proxy's `Remote-User`) or a device (a bearer token with a scope), or
//! it meets the sign-in page / a 401.
//!
//! Kept outside the vault (the vault is synced to other machines and the phone): the settings and the password's
//! Argon2id hash in `~/.config/atlas/server.toml`, the sessions and tokens — only their SHA-256 — in
//! `~/.local/state/atlas/server.json`.
use argon2::password_hash::{PasswordHash, PasswordHasher, PasswordVerifier, SaltString};
use argon2::Argon2;
use axum::http::{header, HeaderMap};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::net::{IpAddr, SocketAddr};
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

pub const SESSION_COOKIE: &str = "atlas_session";
/// The header `atlas mcp` marks its requests with (`x-atlas-client: mcp`), so a server can turn agents away.
pub const CLIENT_HEADER: &str = "x-atlas-client";
/// A session unused this long is gone.
const SESSION_IDLE: Duration = Duration::from_secs(30 * 24 * 3600);
/// The longest wait after wrong passwords (each one doubles it, from 1 s).
const MAX_WAIT: Duration = Duration::from_secs(300);
/// How often a session's or token's "last used" is written down (not on every request).
const TOUCH_EVERY: Duration = Duration::from_secs(600);

/// Who may sign in, set per server.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize, ts_rs::TS)]
#[serde(rename_all = "lowercase")]
#[ts(export)]
pub enum AuthMode {
    /// The owner's password, on Atlas's own sign-in page.
    #[default]
    Password,
    /// Only a trusted reverse proxy (Authelia's forward-auth) saying who it is.
    Proxy,
    /// The proxy's word when there is one, the sign-in page otherwise.
    Both,
}

/// Who counts as the trusted proxy: one address, a network (`10.88.0.0/16`), or `*` — any peer, for a container only
/// the proxy can reach (a container network).
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ProxyRule {
    Any,
    Net(IpAddr, u8),
}

impl ProxyRule {
    pub fn matches(&self, ip: IpAddr) -> bool {
        match (self, ip) {
            (ProxyRule::Any, _) => true,
            (ProxyRule::Net(IpAddr::V4(n), bits), IpAddr::V4(a)) => {
                let mask = u32::MAX.checked_shl(32 - u32::from(*bits)).unwrap_or(0);
                u32::from(*n) & mask == u32::from(a) & mask
            }
            (ProxyRule::Net(IpAddr::V6(n), bits), IpAddr::V6(a)) => {
                let mask = u128::MAX.checked_shl(128 - u32::from(*bits)).unwrap_or(0);
                u128::from(*n) & mask == u128::from(a) & mask
            }
            _ => false,
        }
    }
}

impl std::str::FromStr for ProxyRule {
    type Err = String;
    fn from_str(s: &str) -> Result<Self, String> {
        let s = s.trim();
        if s == "*" {
            return Ok(ProxyRule::Any);
        }
        let bad = || format!("“{s}” is not an address, a network (10.88.0.0/16) or *");
        let (ip, bits) = s.split_once('/').map_or((s, None), |(a, b)| (a, Some(b)));
        let ip: IpAddr = ip.parse().map_err(|_| bad())?;
        let max = if ip.is_ipv4() { 32 } else { 128 };
        let bits = bits.map_or(Ok(max), |b| b.parse::<u8>().ok().filter(|b| *b <= max).ok_or_else(bad))?;
        Ok(ProxyRule::Net(ip, bits))
    }
}

impl std::fmt::Display for ProxyRule {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ProxyRule::Any => f.write_str("*"),
            ProxyRule::Net(ip, bits) if (ip.is_ipv4() && *bits == 32) || (ip.is_ipv6() && *bits == 128) => write!(f, "{ip}"),
            ProxyRule::Net(ip, bits) => write!(f, "{ip}/{bits}"),
        }
    }
}

impl Serialize for ProxyRule {
    fn serialize<S: serde::Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        s.collect_str(self)
    }
}

impl<'de> Deserialize<'de> for ProxyRule {
    fn deserialize<D: serde::Deserializer<'de>>(d: D) -> Result<Self, D::Error> {
        String::deserialize(d)?.parse().map_err(serde::de::Error::custom)
    }
}

/// `~/.config/atlas/server.toml`.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct ServerSettings {
    pub auth: AuthMode,
    /// The reverse proxies whose `X-Forwarded-*` and `remote_user_header` are believed. Nobody else's are.
    pub trusted_proxies: Vec<ProxyRule>,
    /// The header a trusted proxy names the signed-in user with (Authelia: `Remote-User`).
    pub remote_user_header: Option<String>,
    /// Allow the password over plain HTTP from another machine (a LAN or VPN one trusts). Off: only HTTPS (through a
    /// trusted proxy) or this machine itself.
    pub allow_plain_http: bool,
    /// Argon2id, PHC string. Set with `atlas server password`.
    pub password_hash: Option<String>,
    /// AI agents through `atlas mcp` on this server. Off by default; the desktop is not affected.
    pub mcp: bool,
}

impl ServerSettings {
    pub fn remote_user_header(&self) -> &str {
        self.remote_user_header.as_deref().unwrap_or("Remote-User")
    }
}

/// What a device token may do.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, ts_rs::TS)]
#[serde(rename_all = "lowercase")]
#[ts(export)]
pub enum Scope {
    /// Add captures and read what completions need (the phone).
    Capture,
    /// Everything the owner can.
    Full,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Token {
    pub name: String,
    /// SHA-256 of the token, hex.
    pub hash: String,
    pub scope: Scope,
    pub created: u64,
    pub last_used: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct Session {
    hash: String,
    created: u64,
    last_used: u64,
    /// The browser's User-Agent, to tell sessions apart in a list.
    agent: String,
}

#[derive(Debug, Default, Serialize, Deserialize)]
struct Stored {
    #[serde(default)]
    sessions: Vec<Session>,
    #[serde(default)]
    tokens: Vec<Token>,
}

/// Who a request comes from.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Who {
    /// Signed in on the sign-in page.
    Session,
    /// A trusted proxy said so (the name it gave).
    Proxy(String),
    /// A device token.
    Device { name: String, scope: Scope },
}

impl Who {
    pub fn may(&self, path: &str) -> bool {
        match self {
            Who::Device { scope: Scope::Capture, .. } => CAPTURE_PATHS.contains(&path),
            _ => true,
        }
    }
}

/// All a `capture` token reaches: writing a capture and its attachments (never overwriting), and the names its completions offer.
/// Where a client may put its device token instead of `Authorization` (left to the sign-in in front).
pub const TOKEN_HEADER: &str = "x-atlas-token";

pub const CAPTURE_PATHS: &[&str] = &["/api/capture", "/api/attach", "/api/workspace", "/api/link-targets", "/api/tasks/suggest", "/api/tags", "/api/auth/me"];

/// Why a sign-in did not happen.
#[derive(Debug, PartialEq, Eq)]
pub enum Refused {
    Wrong,
    /// Too many wrong passwords from there: try again after this long.
    Wait(Duration),
    /// No password has been set (`atlas server password`), or this server takes only the proxy's word.
    NoPassword,
    /// A password over plain HTTP from another machine, which `allow_plain_http` does not allow.
    PlainHttp,
}

pub struct Auth {
    /// Changed from Settings → Server: the password at once, the rest when the server starts again.
    settings: std::sync::RwLock<ServerSettings>,
    settings_file: PathBuf,
    state_file: PathBuf,
    stored: Mutex<Stored>,
    failures: Mutex<HashMap<IpAddr, (u32, SystemTime)>>,
    /// This run's local key ([`LocalKeyFile`]) and its hash: the `atlas` CLI on this machine, as the owner.
    local: Mutex<Option<(String, LocalKeyFile)>>,
}

/// Where a server-mode core leaves the key the `atlas` CLI of this machine signs in with: the user's runtime
/// folder (memory, owner-only, never synced — unlike the vault), named by the port.
pub fn local_key_file(port: u16) -> PathBuf {
    crate::platform::dirs::atlas(crate::platform::dirs::Base::Runtime).join(format!("server-{port}.key"))
}

/// A run's key in [`local_key_file`], the one writer of it (a locked desktop core and a server-mode core alike). Removed
/// when the run ends, unless a later run on that port has written its own; writing one prunes the files of runs that
/// ended without removing theirs (nothing listens on their port any more).
pub struct LocalKeyFile {
    path: PathBuf,
    key: String,
}

impl LocalKeyFile {
    pub fn write(port: u16, key: String) -> anyhow::Result<Self> {
        let path = local_key_file(port);
        prune_dead_keys(port);
        write_private(&path, key.as_bytes())?;
        Ok(LocalKeyFile { path, key })
    }

    pub fn key(&self) -> &str {
        &self.key
    }

    /// A key with no file behind it, for unit tests of what holds one.
    #[cfg(test)]
    pub(crate) fn unwritten(key: &str) -> Self {
        LocalKeyFile { path: PathBuf::new(), key: key.into() }
    }
}

impl Drop for LocalKeyFile {
    fn drop(&mut self) {
        if std::fs::read_to_string(&self.path).is_ok_and(|k| k == self.key) {
            let _ = crate::vault_write::outside::remove_file(&self.path);
        }
    }
}

/// Every other `server-<port>.key` whose port no longer answers on this machine: its run is over. The CLI reaches a
/// core through 127.0.0.1 only, so a key no loopback port answers for can serve nobody.
fn prune_dead_keys(own: u16) {
    let Some(dir) = local_key_file(own).parent().map(Path::to_path_buf) else { return };
    let Ok(entries) = std::fs::read_dir(&dir) else { return };
    for e in entries.flatten() {
        let name = e.file_name();
        let port = name.to_str().and_then(|n| n.strip_prefix("server-")?.strip_suffix(".key")?.parse::<u16>().ok());
        let Some(port) = port.filter(|p| *p != own) else { continue };
        let alive = ["127.0.0.1", "[::1]"].iter().any(|h| {
            let addr = format!("{h}:{port}").parse().expect("a loopback address");
            std::net::TcpStream::connect_timeout(&addr, Duration::from_millis(200)).is_ok()
        });
        if !alive {
            let _ = crate::vault_write::outside::remove_file(&e.path());
        }
    }
}

/// The key the core on `port` left for this machine's user (a locked or server-mode core), if any.
pub fn local_key(port: u16) -> Option<String> {
    std::fs::read_to_string(local_key_file(port)).ok().map(|k| k.trim().to_string()).filter(|k| !k.is_empty())
}

/// `authorization: Bearer <key>\r\n` for a raw request to the local core at `host` (`127.0.0.1:<port>`), or "".
pub fn local_key_header(host: &str) -> String {
    let port = host.rsplit_once(':').and_then(|(_, p)| p.split('/').next()?.parse().ok());
    port.and_then(local_key).map(|k| format!("authorization: Bearer {k}\r\n")).unwrap_or_default()
}

fn now_secs(t: SystemTime) -> u64 {
    t.duration_since(UNIX_EPOCH).map_or(0, |d| d.as_secs())
}

pub(crate) fn sha256(s: &str) -> String {
    Sha256::digest(s.as_bytes()).iter().map(|b| format!("{b:02x}")).collect()
}

/// The operating system's randomness (it never fails on Linux once booted; if it did, no weak key is made).
fn random_bytes(n: usize) -> Vec<u8> {
    let mut b = vec![0u8; n];
    getrandom::getrandom(&mut b).expect("the system's random source");
    b
}

pub(crate) fn random_hex(bytes: usize) -> String {
    random_bytes(bytes).iter().map(|x| format!("{x:02x}")).collect()
}

/// Where the settings live: `server.toml` in Atlas's config folder (`ATLAS_SERVER_CONFIG` names another, for tests).
pub fn settings_file() -> PathBuf {
    std::env::var_os("ATLAS_SERVER_CONFIG").map(PathBuf::from).unwrap_or_else(|| crate::platform::dirs::atlas(crate::platform::dirs::Base::Config).join("server.toml"))
}

/// Where sessions and tokens live: `server.json` in Atlas's state folder (`ATLAS_SERVER_STATE` names another).
pub fn state_file() -> PathBuf {
    std::env::var_os("ATLAS_SERVER_STATE").map(PathBuf::from).unwrap_or_else(|| crate::platform::dirs::atlas(crate::platform::dirs::Base::State).join("server.json"))
}

pub fn load_settings() -> anyhow::Result<ServerSettings> {
    load_settings_from(&settings_file())
}

fn load_settings_from(file: &std::path::Path) -> anyhow::Result<ServerSettings> {
    match std::fs::read_to_string(file) {
        Ok(t) => Ok(toml::from_str(&t).map_err(|e| anyhow::anyhow!("{}: {e}", file.display()))?),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(ServerSettings::default()),
        Err(e) => Err(e.into()),
    }
}

/// Write the settings, readable by this user only (the password's hash is in them).
fn save_settings_to(file: &std::path::Path, s: &ServerSettings) -> anyhow::Result<()> {
    write_private(file, toml::to_string_pretty(s)?.as_bytes())
}

/// Atlas's own server settings and keys, outside every vault (~/.config/atlas).
pub(crate) fn write_private(path: &std::path::Path, data: &[u8]) -> anyhow::Result<()> {
    Ok(crate::vault_write::outside::write_private(path, data)?)
}

pub fn hash_password(password: &str) -> anyhow::Result<String> {
    let salt = SaltString::encode_b64(&random_bytes(16)).map_err(|e| anyhow::anyhow!("{e}"))?;
    Ok(Argon2::default().hash_password(password.as_bytes(), &salt).map_err(|e| anyhow::anyhow!("{e}"))?.to_string())
}

fn password_ok(hash: &str, password: &str) -> bool {
    PasswordHash::new(hash).is_ok_and(|h| Argon2::default().verify_password(password.as_bytes(), &h).is_ok())
}

/// The wait after `n` wrong passwords in a row: 1 s, 2 s, 4 s … up to [`MAX_WAIT`].
fn wait_after(n: u32) -> Duration {
    Duration::from_secs(1u64 << n.saturating_sub(1).min(16)).min(MAX_WAIT)
}

impl Auth {
    /// Settings from their file; sessions and tokens from theirs.
    pub fn load() -> anyhow::Result<Self> {
        Ok(Self::with_files(load_settings()?, settings_file(), state_file()))
    }

    /// For tests and tools: the settings file beside the state file.
    pub fn new(settings: ServerSettings, state_file: PathBuf) -> Self {
        Self::with_files(settings, state_file.with_file_name("server.toml"), state_file)
    }

    fn with_files(settings: ServerSettings, settings_file: PathBuf, state_file: PathBuf) -> Self {
        let stored = std::fs::read_to_string(&state_file).ok().and_then(|t| serde_json::from_str(&t).ok()).unwrap_or_default();
        Auth { settings: std::sync::RwLock::new(settings), settings_file, state_file, stored: Mutex::new(stored), failures: Mutex::default(), local: Mutex::default() }
    }

    /// A new local key for this run, written to [`local_key_file`] (owner-only).
    pub fn make_local_key(&self, port: u16) -> anyhow::Result<()> {
        let file = LocalKeyFile::write(port, format!("atl_{}", random_hex(32)))?;
        *self.local.lock().unwrap() = Some((sha256(file.key()), file));
        Ok(())
    }

    pub fn settings(&self) -> ServerSettings {
        self.settings.read().unwrap().clone()
    }

    /// The sign-in options (not the password): written to server.toml; a running server uses them once restarted
    /// (switching the mode under a signed-in browser could lock it out mid-session).
    pub fn set_options(&self, new: ServerSettings) -> anyhow::Result<()> {
        let file = load_settings_from(&self.settings_file)?;
        save_settings_to(&self.settings_file, &ServerSettings { password_hash: file.password_hash, ..new })
    }

    /// A new password, at once and in server.toml. `current` must match the old one when there is one.
    pub fn set_password(&self, current: Option<&str>, new: &str) -> anyhow::Result<()> {
        if new.chars().count() < 10 {
            anyhow::bail!("at least 10 characters");
        }
        let old = self.settings.read().unwrap().password_hash.clone();
        if let Some(old) = old {
            if !password_ok(&old, current.unwrap_or("")) {
                anyhow::bail!("the current password is not right");
            }
        }
        let hash = hash_password(new)?;
        let mut file = load_settings_from(&self.settings_file)?;
        file.password_hash = Some(hash.clone());
        save_settings_to(&self.settings_file, &file)?;
        self.settings.write().unwrap().password_hash = Some(hash);
        Ok(())
    }

    pub fn tokens(&self) -> Vec<Token> {
        self.stored.lock().unwrap().tokens.clone()
    }

    pub fn session_count(&self) -> usize {
        self.stored.lock().unwrap().sessions.len()
    }

    /// A device token named `name` → the token, to show once (a name already used is refused: names are how one
    /// revokes).
    pub fn add_token(&self, name: &str, scope: Scope) -> anyhow::Result<String> {
        let name = name.trim();
        if name.is_empty() {
            anyhow::bail!("a token needs a name (the device it is for)");
        }
        let mut st = self.stored.lock().unwrap();
        if st.tokens.iter().any(|t| t.name == name) {
            anyhow::bail!("a token named “{name}” exists: revoke it first, or pick another name");
        }
        let (token, rec) = new_token(name, scope);
        st.tokens.push(rec);
        self.save(&st);
        Ok(token)
    }

    pub fn revoke_token(&self, name: &str) -> bool {
        let mut st = self.stored.lock().unwrap();
        let before = st.tokens.len();
        st.tokens.retain(|t| t.name != name);
        let gone = st.tokens.len() != before;
        self.save(&st);
        gone
    }

    /// Every browser signed out (device tokens stay) → how many sessions ended.
    pub fn sign_out_everywhere(&self) -> usize {
        let mut st = self.stored.lock().unwrap();
        let n = st.sessions.len();
        st.sessions.clear();
        self.save(&st);
        n
    }

    /// What is wrong with serving this way, said before the server starts (None: ready).
    pub fn not_ready(&self) -> Option<String> {
        let s = self.settings();
        let proxy = matches!(s.auth, AuthMode::Proxy | AuthMode::Both);
        if proxy && s.trusted_proxies.is_empty() {
            return Some(format!("auth = \"{:?}\" needs trusted_proxies (the proxy's address) in {}", s.auth, settings_file().display()).to_lowercase());
        }
        if s.auth != AuthMode::Proxy && s.password_hash.is_none() {
            return Some("no password yet: run `atlas server password` first".into());
        }
        None
    }

    fn save(&self, stored: &Stored) {
        if let Err(e) = serde_json::to_vec_pretty(stored).map_err(anyhow::Error::from).and_then(|b| write_private(&self.state_file, &b)) {
            eprintln!("atlas: could not keep the sessions in {}: {e}", self.state_file.display());
        }
    }

    fn trusted(&self, peer: IpAddr) -> bool {
        self.settings.read().unwrap().trusted_proxies.iter().any(|r| r.matches(peer))
    }

    /// The address a request really comes from: a trusted proxy's `X-Forwarded-For` (its last entry, the one the proxy
    /// added), else the connection's own.
    pub fn client_ip(&self, peer: SocketAddr, h: &HeaderMap) -> IpAddr {
        if self.trusted(peer.ip()) {
            if let Some(ip) = h.get("x-forwarded-for").and_then(|v| v.to_str().ok()).and_then(|v| v.rsplit(',').next()).and_then(|v| v.trim().parse().ok()) {
                return ip;
            }
        }
        peer.ip()
    }

    /// Did the request reach us over HTTPS (a trusted proxy says so)?
    pub fn https(&self, peer: SocketAddr, h: &HeaderMap) -> bool {
        self.trusted(peer.ip()) && h.get("x-forwarded-proto").is_some_and(|v| v.as_bytes().eq_ignore_ascii_case(b"https"))
    }

    /// Who sent this request, if anyone known.
    pub fn identify(&self, peer: SocketAddr, h: &HeaderMap) -> Option<Who> {
        self.identify_at(peer, h, SystemTime::now())
    }

    fn identify_at(&self, peer: SocketAddr, h: &HeaderMap, now: SystemTime) -> Option<Who> {
        let set = self.settings();
        if matches!(set.auth, AuthMode::Proxy | AuthMode::Both) && self.trusted(peer.ip()) {
            if let Some(user) = h.get(set.remote_user_header()).and_then(|v| v.to_str().ok()).map(str::trim).filter(|u| !u.is_empty()) {
                return Some(Who::Proxy(user.to_string()));
            }
        }
        let t = now_secs(now);
        // Atlas's own token: `Authorization: Bearer atl_…`, or `x-atlas-token` when `Authorization` carries the sign-in in
        // front's token (an OIDC access token for Authelia, Authentik…: not ours, so it is passed over, not refused)
        let bearer = h.get(header::AUTHORIZATION).and_then(|v| v.to_str().ok()).and_then(|v| v.strip_prefix("Bearer ")).filter(|t| t.trim().starts_with("atl_"));
        let own = h.get(TOKEN_HEADER).and_then(|v| v.to_str().ok());
        if let Some(token) = bearer.or(own) {
            let hash = sha256(token.trim());
            if self.local.lock().unwrap().as_ref().is_some_and(|(h, _)| *h == hash) {
                return Some(Who::Device { name: "this machine".into(), scope: Scope::Full });
            }
            let mut st = self.stored.lock().unwrap();
            let found = st.tokens.iter_mut().find(|k| k.hash == hash)?;
            let who = Who::Device { name: found.name.clone(), scope: found.scope };
            if found.last_used.is_none_or(|u| t.saturating_sub(u) > TOUCH_EVERY.as_secs()) {
                found.last_used = Some(t);
                self.save(&st);
            }
            return Some(who); // a token that is not ours: no fall-through to the cookie
        }
        if set.auth == AuthMode::Proxy {
            return None;
        }
        let cookie = cookie(h, SESSION_COOKIE)?;
        let hash = sha256(&cookie);
        let mut st = self.stored.lock().unwrap();
        let s = st.sessions.iter_mut().find(|s| s.hash == hash)?;
        if t.saturating_sub(s.last_used) > SESSION_IDLE.as_secs() {
            st.sessions.retain(|s| s.hash != hash);
            self.save(&st);
            return None;
        }
        if t.saturating_sub(s.last_used) > TOUCH_EVERY.as_secs() {
            s.last_used = t;
            self.save(&st);
        }
        Some(Who::Session)
    }

    /// The sign-in page's form: the password → a new session's cookie value.
    pub fn sign_in(&self, peer: SocketAddr, h: &HeaderMap, password: &str) -> Result<String, Refused> {
        self.sign_in_at(peer, h, password, SystemTime::now())
    }

    fn sign_in_at(&self, peer: SocketAddr, h: &HeaderMap, password: &str, now: SystemTime) -> Result<String, Refused> {
        let set = self.settings();
        let Some(hash) = set.password_hash.as_deref().filter(|_| set.auth != AuthMode::Proxy) else { return Err(Refused::NoPassword) };
        if !self.https(peer, h) && !peer.ip().is_loopback() && !set.allow_plain_http {
            return Err(Refused::PlainHttp);
        }
        let ip = self.client_ip(peer, h);
        if let Some((_, until)) = self.failures.lock().unwrap().get(&ip).filter(|(_, until)| *until > now) {
            return Err(Refused::Wait(until.duration_since(now).unwrap_or_default()));
        }
        if !password_ok(hash, password) {
            let mut f = self.failures.lock().unwrap();
            let n = f.get(&ip).map_or(0, |(n, _)| *n) + 1;
            f.insert(ip, (n, now + wait_after(n)));
            eprintln!("atlas: wrong password from {ip} ({n} in a row)");
            return Err(Refused::Wrong);
        }
        self.failures.lock().unwrap().remove(&ip);
        let token = random_hex(32);
        let t = now_secs(now);
        let agent = h.get(header::USER_AGENT).and_then(|v| v.to_str().ok()).unwrap_or("").chars().take(200).collect();
        let mut st = self.stored.lock().unwrap();
        st.sessions.retain(|s| t.saturating_sub(s.last_used) <= SESSION_IDLE.as_secs());
        st.sessions.push(Session { hash: sha256(&token), created: t, last_used: t, agent });
        self.save(&st);
        eprintln!("atlas: signed in from {ip}");
        Ok(token)
    }

    /// The cookie's session ends (signing out).
    pub fn sign_out(&self, h: &HeaderMap) {
        if let Some(c) = cookie(h, SESSION_COOKIE) {
            let hash = sha256(&c);
            let mut st = self.stored.lock().unwrap();
            st.sessions.retain(|s| s.hash != hash);
            self.save(&st);
        }
    }

    /// The `Set-Cookie` value for a session (`Secure` when the request came over HTTPS).
    pub fn session_cookie(&self, token: &str, secure: bool) -> String {
        format!("{SESSION_COOKIE}={token}; Path=/; HttpOnly; SameSite=Strict; Max-Age={}{}", SESSION_IDLE.as_secs(), if secure { "; Secure" } else { "" })
    }
}

/// A new device token → (the token, shown once; its record, kept). The token starts with `atl_` so it can be
/// recognised (and found by secret scanners) wherever it is pasted.
pub fn new_token(name: &str, scope: Scope) -> (String, Token) {
    let token = format!("atl_{}", random_hex(32));
    let rec = Token { name: name.to_string(), hash: sha256(&token), scope, created: now_secs(SystemTime::now()), last_used: None };
    (token, rec)
}

/// A cookie's value from the request.
pub fn cookie(h: &HeaderMap, name: &str) -> Option<String> {
    h.get_all(header::COOKIE).iter().filter_map(|v| v.to_str().ok()).flat_map(|v| v.split(';')).find_map(|kv| {
        let (k, v) = kv.trim().split_once('=')?;
        (k == name && !v.is_empty()).then(|| v.to_string())
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::http::HeaderValue;

    const LAN: &str = "192.168.1.20:5000";
    const PROXY: &str = "10.0.0.2:4000";

    #[test]
    fn a_runs_key_file_goes_with_the_run_and_takes_dead_runs_files_along() {
        let port_of = |l: &std::net::TcpListener| l.local_addr().unwrap().port();
        let (live, ours) = (std::net::TcpListener::bind("127.0.0.1:0").unwrap(), std::net::TcpListener::bind("127.0.0.1:0").unwrap());
        let dead = port_of(&std::net::TcpListener::bind("127.0.0.1:0").unwrap()); // closed again at once
        for p in [port_of(&live), dead] {
            write_private(&local_key_file(p), b"atl_other").unwrap();
        }
        let file = LocalKeyFile::write(port_of(&ours), "atl_ours".into()).unwrap();
        assert_eq!(local_key(port_of(&ours)).as_deref(), Some("atl_ours"));
        assert!(local_key_file(port_of(&live)).exists(), "a run still listening keeps its key");
        assert!(!local_key_file(dead).exists(), "a run that is over loses its key");
        // a later run on the port wrote its own: ours ending leaves it
        write_private(&local_key_file(port_of(&ours)), b"atl_later").unwrap();
        drop(file);
        assert_eq!(local_key(port_of(&ours)).as_deref(), Some("atl_later"));
        let again = LocalKeyFile::write(port_of(&ours), "atl_ours".into()).unwrap();
        drop(again);
        assert!(!local_key_file(port_of(&ours)).exists(), "the run's own key goes with it");
        std::fs::remove_file(local_key_file(port_of(&live))).unwrap();
    }

    fn auth(mode: AuthMode, dir: &tempfile::TempDir) -> Auth {
        let settings = ServerSettings {
            auth: mode,
            trusted_proxies: vec!["10.0.0.2".parse().unwrap()],
            password_hash: Some(hash_password("correct horse").unwrap()),
            ..Default::default()
        };
        Auth::new(settings, dir.path().join("server.json"))
    }
    fn headers(pairs: &[(&str, &str)]) -> HeaderMap {
        let mut h = HeaderMap::new();
        for (k, v) in pairs {
            h.append(axum::http::HeaderName::from_bytes(k.as_bytes()).unwrap(), HeaderValue::from_str(v).unwrap());
        }
        h
    }
    fn at(s: &str) -> SocketAddr {
        s.parse().unwrap()
    }
    const HTTPS: &[(&str, &str)] = &[("x-forwarded-proto", "https"), ("x-forwarded-for", "203.0.113.9")];

    #[test]
    fn a_password_gives_a_session_that_signs_the_browser_in_until_signed_out() {
        let dir = tempfile::tempdir().unwrap();
        let a = auth(AuthMode::Password, &dir);
        let t0 = SystemTime::now();
        assert_eq!(a.sign_in_at(at(PROXY), &headers(HTTPS), "wrong", t0), Err(Refused::Wrong));
        let token = a.sign_in_at(at(PROXY), &headers(HTTPS), "correct horse", t0 + Duration::from_secs(2)).unwrap();
        let c = headers(&[("cookie", &format!("theme=dark; {SESSION_COOKIE}={token}"))]);
        assert_eq!(a.identify_at(at(LAN), &c, t0), Some(Who::Session));
        // only the hash is kept, and the file is the owner's alone
        let file = std::fs::read_to_string(dir.path().join("server.json")).unwrap();
        assert!(!file.contains(&token) && file.contains(&sha256(&token)));
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            assert_eq!(std::fs::metadata(dir.path().join("server.json")).unwrap().permissions().mode() & 0o777, 0o600);
        }
        // another server (a restart) reads it back
        assert_eq!(Auth::new(a.settings(), dir.path().join("server.json")).identify_at(at(LAN), &c, t0), Some(Who::Session));
        // unused for 31 days: gone
        assert_eq!(a.identify_at(at(LAN), &c, t0 + Duration::from_secs(31 * 24 * 3600)), None);
        let token = a.sign_in_at(at(PROXY), &headers(HTTPS), "correct horse", t0 + Duration::from_secs(4)).unwrap();
        let c = headers(&[("cookie", &format!("{SESSION_COOKIE}={token}"))]);
        a.sign_out(&c);
        assert_eq!(a.identify_at(at(LAN), &c, t0), None);
        assert_eq!(a.identify_at(at(LAN), &headers(&[("cookie", &format!("{SESSION_COOKIE}=forged"))]), t0), None);
    }

    #[test]
    fn wrong_passwords_make_that_address_wait_longer_each_time() {
        let dir = tempfile::tempdir().unwrap();
        let a = auth(AuthMode::Password, &dir);
        let t0 = SystemTime::now();
        let h = headers(HTTPS);
        assert_eq!(a.sign_in_at(at(PROXY), &h, "a", t0), Err(Refused::Wrong));
        // within the second: refused before the password is even looked at, the right one included
        assert!(matches!(a.sign_in_at(at(PROXY), &h, "correct horse", t0 + Duration::from_millis(500)), Err(Refused::Wait(_))));
        assert_eq!(a.sign_in_at(at(PROXY), &h, "b", t0 + Duration::from_secs(1)), Err(Refused::Wrong));
        assert_eq!(a.sign_in_at(at(PROXY), &h, "c", t0 + Duration::from_secs(1)), Err(Refused::Wait(Duration::from_secs(2))));
        // another address behind the same proxy is not held up
        let other = headers(&[("x-forwarded-proto", "https"), ("x-forwarded-for", "198.51.100.7")]);
        assert!(a.sign_in_at(at(PROXY), &other, "correct horse", t0 + Duration::from_secs(1)).is_ok());
        assert_eq!((wait_after(1), wait_after(4), wait_after(30)), (Duration::from_secs(1), Duration::from_secs(8), MAX_WAIT));
    }

    #[test]
    fn the_password_travels_only_over_https_or_from_this_machine_unless_allowed() {
        let dir = tempfile::tempdir().unwrap();
        let a = auth(AuthMode::Password, &dir);
        assert_eq!(a.sign_in_at(at(LAN), &HeaderMap::new(), "correct horse", SystemTime::now()), Err(Refused::PlainHttp));
        // a LAN machine cannot claim HTTPS: only a trusted proxy's word counts
        assert_eq!(a.sign_in_at(at(LAN), &headers(HTTPS), "correct horse", SystemTime::now()), Err(Refused::PlainHttp));
        assert!(a.sign_in_at(at("127.0.0.1:9"), &HeaderMap::new(), "correct horse", SystemTime::now()).is_ok());
        let open = Auth::new(ServerSettings { allow_plain_http: true, ..a.settings() }, dir.path().join("s2.json"));
        assert!(open.sign_in_at(at(LAN), &HeaderMap::new(), "correct horse", SystemTime::now()).is_ok());
        assert!(a.session_cookie("x", true).ends_with("; Secure") && !a.session_cookie("x", false).contains("Secure"));
    }

    #[test]
    fn a_proxy_is_believed_only_from_its_address_and_only_in_its_modes() {
        let dir = tempfile::tempdir().unwrap();
        let user = headers(&[("remote-user", "alice")]);
        for (mode, from, who) in [
            (AuthMode::Proxy, PROXY, Some(Who::Proxy("alice".into()))),
            (AuthMode::Both, PROXY, Some(Who::Proxy("alice".into()))),
            (AuthMode::Password, PROXY, None), // the password mode ignores the header
            (AuthMode::Both, LAN, None),       // anyone else can send the header too: not believed
        ] {
            assert_eq!(auth(mode, &dir).identify(at(from), &user), who, "{mode:?} from {from}");
        }
        // proxy-only: no password sign-in, and the forwarded address is believed only from the proxy
        let p = auth(AuthMode::Proxy, &dir);
        assert_eq!(p.sign_in(at(PROXY), &headers(HTTPS), "correct horse"), Err(Refused::NoPassword));
        assert_eq!(p.client_ip(at(LAN), &headers(HTTPS)), "192.168.1.20".parse::<IpAddr>().unwrap());
        assert_eq!(p.client_ip(at(PROXY), &headers(&[("x-forwarded-for", "1.2.3.4, 203.0.113.9")])), "203.0.113.9".parse::<IpAddr>().unwrap());
        assert!(p.not_ready().is_none());
        let bare = Auth::new(ServerSettings { auth: AuthMode::Proxy, ..Default::default() }, dir.path().join("s3.json"));
        assert!(bare.not_ready().unwrap().contains("trusted_proxies"));
        let nopw = Auth::new(ServerSettings::default(), dir.path().join("s4.json"));
        assert!(nopw.not_ready().unwrap().contains("atlas server password"));
    }

    #[test]
    fn the_password_changes_at_once_and_the_options_on_restart() {
        let dir = tempfile::tempdir().unwrap();
        let a = auth(AuthMode::Password, &dir);
        assert!(a.set_password(Some("wrong"), "a new long password").unwrap_err().to_string().contains("current password"));
        assert!(a.set_password(Some("correct horse"), "short").unwrap_err().to_string().contains("10 characters"));
        a.set_password(Some("correct horse"), "a new long password").unwrap();
        let h = headers(HTTPS);
        assert_eq!(a.sign_in(at(PROXY), &h, "correct horse"), Err(Refused::Wrong));
        let h2 = headers(&[("x-forwarded-proto", "https"), ("x-forwarded-for", "198.51.100.8")]);
        assert!(a.sign_in(at(PROXY), &h2, "a new long password").is_ok());
        a.set_options(ServerSettings { auth: AuthMode::Both, trusted_proxies: vec!["10.0.0.9".parse().unwrap()], ..Default::default() }).unwrap();
        // in the file, the hash kept; in this running server, not yet
        let file = Auth::new(ServerSettings::default(), dir.path().join("x.json"));
        let saved = load_settings_from(&dir.path().join("server.toml")).unwrap();
        assert!(saved.auth == AuthMode::Both && saved.password_hash.is_some() && file.settings().auth == AuthMode::Password);
        assert_eq!(a.settings().auth, AuthMode::Password);
        assert_eq!(a.session_count(), 1);
        assert_eq!(a.sign_out_everywhere(), 1);
    }

    #[test]
    fn a_proxy_rule_is_an_address_a_network_or_anyone() {
        let r = |s: &str| s.parse::<ProxyRule>().unwrap();
        let ip = |s: &str| s.parse::<IpAddr>().unwrap();
        assert!(r("10.88.0.0/16").matches(ip("10.88.1.48")) && !r("10.88.0.0/16").matches(ip("10.90.0.1")));
        assert!(r("10.0.0.2").matches(ip("10.0.0.2")) && !r("10.0.0.2").matches(ip("10.0.0.3")));
        assert!(r("*").matches(ip("203.0.113.1")) && r("::1").matches(ip("::1")) && !r("10.0.0.0/8").matches(ip("::1")));
        assert!("10.0.0.0/33".parse::<ProxyRule>().is_err() && "proxy".parse::<ProxyRule>().is_err());
        // as written in server.toml, and back
        let s: ServerSettings = toml::from_str("auth = \"proxy\"\ntrusted_proxies = [\"*\", \"10.88.0.0/16\", \"10.0.0.2\"]\n").unwrap();
        assert_eq!(toml::to_string(&s).unwrap().lines().find(|l| l.starts_with("trusted")).unwrap(), r#"trusted_proxies = ["*", "10.88.0.0/16", "10.0.0.2"]"#);
    }

    #[test]
    fn a_device_token_works_in_every_mode_within_its_scope() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("server.json");
        let d = Auth::new(ServerSettings::default(), file.clone());
        let phone = d.add_token("phone", Scope::Capture).unwrap();
        let laptop = d.add_token("laptop", Scope::Full).unwrap();
        assert!(phone.starts_with("atl_") && d.add_token("phone", Scope::Full).is_err() && d.add_token(" ", Scope::Full).is_err());
        for mode in [AuthMode::Password, AuthMode::Proxy, AuthMode::Both] {
            let a = Auth::new(ServerSettings { auth: mode, ..Default::default() }, file.clone());
            let who = a.identify(at(LAN), &headers(&[("authorization", &format!("Bearer {phone}"))])).unwrap();
            assert_eq!(who, Who::Device { name: "phone".into(), scope: Scope::Capture });
            assert!(who.may("/api/capture") && !who.may("/api/file") && !who.may("/api/pty"));
            let full = a.identify(at(LAN), &headers(&[("authorization", &format!("Bearer {laptop}"))])).unwrap();
            assert!(full.may("/api/file") && full.may("/api/pty"));
            assert_eq!(a.identify(at(LAN), &headers(&[("authorization", "Bearer atl_madeup")])), None);
        }
        assert!(d.revoke_token("phone") && !d.revoke_token("phone"));
        let a = Auth::new(ServerSettings::default(), file);
        assert_eq!(a.identify(at(LAN), &headers(&[("authorization", &format!("Bearer {phone}"))])), None);
    }
}
