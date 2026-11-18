//! Hooks: an address of a plugin that something outside Atlas may call without signing in — an ntfy notification's
//! button pressed on a phone with no Atlas app (DESIGN-calendar-tasks-nudges.md §3.7, the fallback), a webhook.
//!
//! The call is `POST /api/plugins/<id>/hook/<name>?t=<token>`. The token is what admits it, and it is signed, never a
//! stored secret: the core signs a **claim** — the plugin, the hook's name, the plugin's own data (which nudge, which
//! button) and an expiry — with a key only this vault's core knows (kept in the secret store, outside the vault, made
//! on first use). So a token says exactly one thing ("Done on this nudge, until tomorrow 09:00"), cannot be turned into
//! another (any change breaks its signature), and stops working by itself. The plugin asks for one with
//! `POST /api/plugins/<id>/hooks/sign` (only for itself: helper_api.rs `may`) and puts the address it gets in what it
//! sends out. A valid call goes to the plugin's tool of that name with `on = "hook"`, given `{ data, body }`; its
//! answer's `notices` / `withdraw` are said as a notice button's are (notice_actions.rs `say`).
//!
//! The gate in front of a server (Authelia…) must let `/api/plugins/*/hook/*` through: the token is the check.
use crate::secrets::Store;
use crate::{Error, Result};
use base64::engine::general_purpose::URL_SAFE_NO_PAD as B64;
use base64::Engine as _;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::sync::Mutex;

/// The `on` event of a tool that answers a hook.
pub const EVENT: &str = "hook";

/// The longest a token may live (seconds): a hook's address is for one message, not a standing door.
pub const MAX_TTL: u64 = 7 * 24 * 3600;

/// Where the signing key is kept in the vault's secret store: an owner no plugin id can be (ids never start with a dot),
/// so no plugin reads it through its secrets.
const KEY_OWNER: &str = ".core";
const KEY_NAME: &str = "hook_key";

/// What a token says: whose hook, which, the plugin's data, until when (Unix seconds).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
struct Claim {
    p: String,
    h: String,
    #[serde(default)]
    d: Value,
    e: i64,
}

/// Why a token was refused.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Refused {
    /// Not one this core signed, or changed since.
    Forged,
    /// Signed for another plugin's hook, or another hook of it.
    Elsewhere,
    /// Its time is over.
    Expired,
}

impl Refused {
    pub fn why(&self) -> &'static str {
        match self {
            Self::Forged => "not a hook token of this vault",
            Self::Elsewhere => "a token for another hook",
            Self::Expired => "this link has expired",
        }
    }
}

/// HMAC-SHA256 (RFC 2104), written out over sha2: one function, no further dependency.
fn hmac(key: &[u8], msg: &[u8]) -> [u8; 32] {
    let mut k = [0u8; 64];
    if key.len() > 64 {
        k[..32].copy_from_slice(&Sha256::digest(key));
    } else {
        k[..key.len()].copy_from_slice(key);
    }
    let pad = |b: u8| k.iter().map(|x| x ^ b).collect::<Vec<u8>>();
    let inner = Sha256::new().chain_update(pad(0x36)).chain_update(msg).finalize();
    Sha256::new().chain_update(pad(0x5c)).chain_update(inner).finalize().into()
}

/// Equal without telling, by its time, how much of a guess was right.
fn same(a: &[u8], b: &[u8]) -> bool {
    a.len() == b.len() && a.iter().zip(b).fold(0u8, |acc, (x, y)| acc | (x ^ y)) == 0
}

/// The vault's signing key: from the secret store, made (32 random bytes) the first time.
fn key(store: &Store) -> Result<Vec<u8>> {
    if let Some(k) = store.get(KEY_OWNER, KEY_NAME)?.and_then(|k| B64.decode(k).ok()).filter(|k| k.len() >= 32) {
        return Ok(k);
    }
    let mut k = vec![0u8; 32];
    getrandom::getrandom(&mut k).map_err(|e| Error::Other(anyhow::anyhow!("no randomness for the hook key: {e}")))?;
    store.set(KEY_OWNER, KEY_NAME, &B64.encode(&k))?;
    Ok(k)
}

/// A token for `plugin`'s hook `hook` carrying `data`, valid `ttl` seconds from `now` (Unix seconds).
pub fn sign(store: &Store, plugin: &str, hook: &str, data: Value, ttl: u64, now: i64) -> Result<String> {
    if ttl == 0 || ttl > MAX_TTL {
        return Err(Error::BadRequest(format!("a hook token lives from 1 s to {MAX_TTL} s (7 days), not {ttl}")));
    }
    if !valid_name(hook) {
        return Err(Error::BadRequest(format!("hook name {hook:?}: letters, digits, - and _")));
    }
    let claim = Claim { p: plugin.into(), h: hook.into(), d: data, e: now + ttl as i64 };
    let body = B64.encode(serde_json::to_vec(&claim).map_err(|e| Error::Other(e.into()))?);
    let mac = B64.encode(hmac(&key(store)?, body.as_bytes()));
    Ok(format!("{body}.{mac}"))
}

/// The data of a token for `plugin`'s hook `hook`, when it is one this vault signed and its time is not over.
pub fn verify(store: &Store, plugin: &str, hook: &str, token: &str, now: i64) -> Result<std::result::Result<Value, Refused>> {
    let Some((body, mac)) = token.split_once('.') else { return Ok(Err(Refused::Forged)) };
    let Ok(mac) = B64.decode(mac) else { return Ok(Err(Refused::Forged)) };
    // no key yet: nothing was ever signed here
    let Some(k) = store.get(KEY_OWNER, KEY_NAME)?.and_then(|k| B64.decode(k).ok()) else { return Ok(Err(Refused::Forged)) };
    if !same(&hmac(&k, body.as_bytes()), &mac) {
        return Ok(Err(Refused::Forged));
    }
    let Some(claim) = B64.decode(body).ok().and_then(|b| serde_json::from_slice::<Claim>(&b).ok()) else { return Ok(Err(Refused::Forged)) };
    if claim.p != plugin || claim.h != hook {
        return Ok(Err(Refused::Elsewhere));
    }
    if claim.e <= now {
        return Ok(Err(Refused::Expired));
    }
    Ok(Ok(claim.d))
}

fn valid_name(s: &str) -> bool {
    !s.is_empty() && s.len() <= 64 && s.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
}

/// Whether a request is a hook's call (`POST /api/plugins/<id>/hook/<name>`, within its vault): the guards let it
/// through without a sign-in, for the handler to check its token.
pub fn is_call(method: &axum::http::Method, path: &str) -> bool {
    if method != axum::http::Method::POST {
        return false;
    }
    let Some(rest) = path.strip_prefix("/api/plugins/") else { return false };
    let parts: Vec<&str> = rest.split('/').collect();
    matches!(parts.as_slice(), [id, "hook", name] if !id.is_empty() && valid_name(name))
}

/// The address this server is reached at from outside (`https://atlas.example.org`), as the last signed-in request
/// that came through a name (not a loopback address) said it: a hook's link must name the server the way the person's
/// devices reach it. One per process: every vault of a server is behind the same address. None until one came.
static ORIGIN: Mutex<Option<String>> = Mutex::new(None);

/// Remembers the address a signed-in request came to (its `X-Forwarded-Proto` / `X-Forwarded-Host`, else `Host`).
pub fn seen(h: &axum::http::HeaderMap) {
    let get = |k: &str| h.get(k).and_then(|v| v.to_str().ok()).map(|v| v.split(',').next().unwrap_or("").trim().to_string()).filter(|v| !v.is_empty());
    let Some(host) = get("x-forwarded-host").or_else(|| get("host")) else { return };
    let bare = host.trim_start_matches('[').split([']', ':']).next().unwrap_or("");
    if bare == "localhost" || bare.starts_with("127.") || bare == "::1" || bare.is_empty() || host.contains(['/', ' ', '@']) {
        return;
    }
    let scheme = get("x-forwarded-proto").filter(|s| s == "http" || s == "https").unwrap_or_else(|| "http".into());
    let origin = format!("{scheme}://{host}");
    let mut o = ORIGIN.lock().unwrap_or_else(|e| e.into_inner());
    if o.as_deref() != Some(origin.as_str()) {
        *o = Some(origin);
    }
}

pub fn origin() -> Option<String> {
    ORIGIN.lock().unwrap_or_else(|e| e.into_inner()).clone()
}

/// What `POST /api/plugins/<id>/hooks/sign` is asked.
#[derive(Debug, Deserialize)]
pub struct SignAsk {
    pub hook: String,
    #[serde(default)]
    pub data: Value,
    pub ttl_secs: u64,
}

/// Its answer: the token, the address's path within this server (the vault's prefix included), and the server's
/// address as seen from outside when known — the plugin joins them, or uses an address its settings name.
#[derive(Debug, Serialize)]
pub struct Signed {
    pub token: String,
    pub path: String,
    pub origin: Option<String>,
}

pub fn signed(store: &Store, prefix: &str, plugin: &str, ask: SignAsk, now: i64) -> Result<Signed> {
    let token = sign(store, plugin, &ask.hook, ask.data, ask.ttl_secs, now)?;
    let path = format!("{}/api/plugins/{plugin}/hook/{}?t={token}", prefix.trim_end_matches('/'), ask.hook);
    Ok(Signed { token, path, origin: origin() })
}

/// A request body as the hook's tool sees it: JSON when it is, else its text (an empty body: null).
pub fn body_of(bytes: &[u8]) -> Value {
    if bytes.is_empty() {
        return Value::Null;
    }
    serde_json::from_slice(bytes).unwrap_or_else(|_| Value::String(String::from_utf8_lossy(bytes).into_owned()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn store() -> (tempfile::TempDir, Store) {
        let d = tempfile::tempdir().unwrap();
        let s = Store::in_dir(&d.path().join("secrets"), &d.path().join("vault"));
        (d, s)
    }

    #[test]
    fn hmac_is_rfc_4231s() {
        // RFC 4231, test case 2
        let mac = hmac(b"Jefe", b"what do ya want for nothing?");
        let hex: String = mac.iter().map(|b| format!("{b:02x}")).collect();
        assert_eq!(hex, "5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843");
    }

    #[test]
    fn a_token_says_its_data_to_its_hook_only_and_only_in_time() {
        let (_d, s) = store();
        let data = json!({ "notice_id": "plan:notes/Report.md#^t3f9a", "action": "done" });
        let t = sign(&s, "plan", "press", data.clone(), 3600, 1_000).unwrap();
        assert!(!t.contains(['/', '+', '=', '&', '?']), "fit for a query without escaping: {t}");
        assert_eq!(verify(&s, "plan", "press", &t, 1_000).unwrap(), Ok(data));
        assert_eq!(verify(&s, "plan", "press", &t, 4_600).unwrap(), Err(Refused::Expired), "its hour over");
        assert_eq!(verify(&s, "plan", "other", &t, 1_000).unwrap(), Err(Refused::Elsewhere));
        assert_eq!(verify(&s, "mail", "press", &t, 1_000).unwrap(), Err(Refused::Elsewhere));
        // the data changed (Done made into another task's, or the expiry pushed): the signature no longer holds
        let (body, mac) = t.split_once('.').unwrap();
        let mut claim: Claim = serde_json::from_slice(&B64.decode(body).unwrap()).unwrap();
        claim.e += 1_000_000;
        let forged = format!("{}.{mac}", B64.encode(serde_json::to_vec(&claim).unwrap()));
        assert_eq!(verify(&s, "plan", "press", &forged, 1_000).unwrap(), Err(Refused::Forged));
        assert_eq!(verify(&s, "plan", "press", "nonsense", 1_000).unwrap(), Err(Refused::Forged));
        assert_eq!(verify(&s, "plan", "press", "", 1_000).unwrap(), Err(Refused::Forged));
    }

    #[test]
    fn another_vaults_key_signs_nothing_here_and_the_key_is_kept() {
        let ((_a, a), (_b, b)) = (store(), store());
        let t = sign(&a, "plan", "press", json!(1), 60, 0).unwrap();
        assert_eq!(verify(&b, "plan", "press", &t, 0).unwrap(), Err(Refused::Forged), "no key there at all");
        sign(&b, "plan", "press", json!(1), 60, 0).unwrap();
        assert_eq!(verify(&b, "plan", "press", &t, 0).unwrap(), Err(Refused::Forged), "another key");
        assert_eq!(verify(&a, "plan", "press", &t, 0).unwrap(), Ok(json!(1)), "the first key kept between signings");
        assert!(a.names(".core").unwrap().contains(&"hook_key".to_string()));
    }

    #[test]
    fn a_token_lives_at_most_a_week_and_names_a_plain_hook() {
        let (_d, s) = store();
        assert!(sign(&s, "plan", "press", Value::Null, 0, 0).is_err());
        assert!(sign(&s, "plan", "press", Value::Null, MAX_TTL + 1, 0).is_err());
        assert!(sign(&s, "plan", "pr/ess", Value::Null, 60, 0).is_err());
        assert!(sign(&s, "plan", "press", Value::Null, MAX_TTL, 0).is_ok());
    }

    #[test]
    fn only_a_post_to_a_hook_passes_the_gate() {
        use axum::http::Method;
        assert!(is_call(&Method::POST, "/api/plugins/plan/hook/press"));
        assert!(!is_call(&Method::GET, "/api/plugins/plan/hook/press"));
        assert!(!is_call(&Method::POST, "/api/plugins/plan/hooks/sign"), "signing is a signed-in page's or the plugin's");
        assert!(!is_call(&Method::POST, "/api/plugins/plan/hook/press/more"));
        assert!(!is_call(&Method::POST, "/api/plugins/plan/tools/press"));
        assert!(!is_call(&Method::POST, "/api/plugins//hook/press"));
    }

    #[test]
    fn the_outside_address_is_a_name_never_a_loopback_one() {
        use axum::http::{HeaderMap, HeaderValue};
        let h = |pairs: &[(&'static str, &'static str)]| HeaderMap::from_iter(pairs.iter().map(|(k, v)| (axum::http::HeaderName::from_static(k), HeaderValue::from_static(v))));
        seen(&h(&[("host", "127.0.0.1:7340")]));
        seen(&h(&[("host", "localhost")]));
        assert_eq!(origin(), None);
        seen(&h(&[("host", "10.0.0.2:7340"), ("x-forwarded-host", "atlas.example.org"), ("x-forwarded-proto", "https")]));
        assert_eq!(origin().as_deref(), Some("https://atlas.example.org"));
        seen(&h(&[("host", "[::1]:7340")]));
        assert_eq!(origin().as_deref(), Some("https://atlas.example.org"), "a loopback call changes nothing");
    }

    #[test]
    fn a_body_is_json_or_its_text() {
        assert_eq!(body_of(b""), Value::Null);
        assert_eq!(body_of(br#"{"a":1}"#), json!({ "a": 1 }));
        assert_eq!(body_of(b"done"), json!("done"));
    }
}
