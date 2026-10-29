//! Outlook / Microsoft 365 sign-in (OAuth2, as Thunderbird does): the access token IMAP and SMTP sign in with, renewed
//! from the refresh token kept in Atlas's secret store; and the three ways to get that refresh token (the card's
//! `flow`): automatic, window (Atlas's sign-in
//! window, ending on https://localhost) and code (a device code typed at microsoft.com/devicelogin).
//! HTTPS goes through the core's fetch (the manifest's `net`), so the engine carries no HTTP client.

use crate::account::{Account, Auth};
use base64::Engine;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::net::TcpListener;
use std::sync::{Arc, Condvar, LazyLock, Mutex};
use std::time::{Duration, Instant};

pub const SCOPES: &str = "https://outlook.office.com/IMAP.AccessAsUser.All https://outlook.office.com/SMTP.Send offline_access";
const WINDOW_REDIRECT: &str = "https://localhost";

/// How a form is POSTed to Microsoft (the core's fetch in the helper; a stand-in in tests).
pub type Post = dyn Fn(&str, &[(&str, &str)]) -> Result<Value, String> + Send + Sync;

/// The core's fetch: `POST /api/plugins/email/fetch`.
pub fn core_post(url: &str, form: &[(&str, &str)]) -> Result<Value, String> {
    let body = form.iter().map(|(k, v)| format!("{}={}", enc(k), enc(v))).collect::<Vec<_>>().join("&");
    let req = json!({ "url": url, "method": "POST", "headers": { "content-type": "application/x-www-form-urlencoded", "accept": "application/json" }, "body": body, "timeout_secs": 30 });
    let a = atlas_plugin::Atlas::new().post("/api/plugins/email/fetch", &req).map_err(|e| format!("cannot reach Microsoft: {e}"))?;
    let text = a["text"].as_str().unwrap_or("{}");
    Ok(serde_json::from_str(text).unwrap_or(json!({ "error": "no_json", "error_description": text })))
}

fn enc(s: &str) -> String {
    s.bytes()
        .map(|b| match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => (b as char).to_string(),
            _ => format!("%{b:02X}"),
        })
        .collect()
}

fn dec(s: &str) -> String {
    let b = s.as_bytes();
    let mut out = vec![];
    let mut i = 0;
    while i < b.len() {
        match b[i] {
            b'+' => out.push(b' '),
            b'%' if i + 2 < b.len() => {
                match u8::from_str_radix(std::str::from_utf8(&b[i + 1..i + 3]).unwrap_or("zz"), 16) {
                    Ok(v) => {
                        out.push(v);
                        i += 2;
                    }
                    Err(_) => out.push(b'%'),
                }
            }
            c => out.push(c),
        }
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

/// The query of an address as pairs.
pub fn query_of(url: &str) -> HashMap<String, String> {
    let q = url.split_once('?').map(|(_, q)| q).unwrap_or("");
    let q = q.split('#').next().unwrap_or("");
    q.split('&').filter_map(|kv| kv.split_once('=')).map(|(k, v)| (dec(k), dec(v))).collect()
}

const REFUSALS: &[(&[&str], &str)] = &[
    (&["AADSTS65001", "AADSTS90094", "AADSTS90095", "AADSTS65004"], "your organisation must approve this mail app first (admin consent): ask IT to allow it, or put an Application ID they approve on the card"),
    (&["AADSTS700016", "AADSTS650057"], "this Application ID is not available in your organisation: put one your IT approves on the card"),
    (&["AADSTS53003", "AADSTS530003"], "your organisation's access rules (Conditional Access) block this sign-in from this device or app"),
    (&["AADSTS50020", "AADSTS50034", "AADSTS50126"], "Microsoft does not know that account with that password: check the address on the card"),
    (&["AADSTS50011"], "the return address is not allowed for this Application ID"),
    (&["AADSTS70008", "AADSTS700082", "invalid_grant"], "the sign-in has expired or was revoked: sign in again"),
    (&["access_denied"], "the sign-in was cancelled"),
];

/// Why Microsoft said no, said plainly (a token answer and a return address both carry `error` and `error_description`).
pub fn refused(answer: &Value) -> String {
    let desc = answer["error_description"].as_str().unwrap_or("");
    let err = answer["error"].as_str().unwrap_or("");
    let first = desc.lines().next().filter(|l| !l.is_empty()).unwrap_or(err);
    for (codes, plain) in REFUSALS {
        if codes.iter().any(|c| desc.contains(c) || err == *c) {
            return format!("{plain} ({first})");
        }
    }
    if first.is_empty() { "no answer".into() } else { first.to_string() }
}

/// Where the browser's return lands: the query of the address it came back to.
type Answer = Arc<(Mutex<Option<HashMap<String, String>>>, Condvar)>;

struct Cached {
    token: String,
    until: Instant,
}
static TOKENS: LazyLock<Mutex<HashMap<String, Cached>>> = LazyLock::new(Default::default);
/// Refresh tokens Microsoft rotated: handed back to the core with the next answer (`_secrets`), and kept here so the
/// background sync uses the new one before the core stores it.
static ROTATED: LazyLock<Mutex<HashMap<String, String>>> = LazyLock::new(Default::default);

/// The rotated refresh tokens, without handing them back yet.
pub fn rotated_peek() -> HashMap<String, String> {
    ROTATED.lock().unwrap().clone()
}

/// Secrets to hand back with the next answer, once.
pub fn take_rotated() -> HashMap<String, String> {
    std::mem::take(&mut *ROTATED.lock().unwrap())
}

/// The access token for an account (None for a password account). Cached until a minute before it ends.
pub fn access_token(acc: &Account, post: &Post) -> Result<Option<String>, String> {
    let Auth::Outlook { tenant, client_id, refresh } = &acc.auth else { return Ok(None) };
    let key = format!("accounts.{}.oauth_refresh", acc.name);
    let refresh = ROTATED.lock().unwrap().get(&key).cloned().or_else(|| refresh.clone());
    let refresh = refresh.ok_or_else(|| "not signed in to Outlook: run “Email: sign in to Outlook…” (or the card's Sign in button)".to_string())?;
    if let Some(c) = TOKENS.lock().unwrap().get(&refresh) {
        if Instant::now() + Duration::from_secs(60) < c.until {
            return Ok(Some(c.token.clone()));
        }
    }
    let url = format!("https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token");
    let j = post(&url, &[("client_id", client_id), ("grant_type", "refresh_token"), ("refresh_token", &refresh), ("scope", SCOPES)])?;
    let token = j["access_token"].as_str().ok_or_else(|| format!("Outlook refused the sign-in ({}): sign in again", refused(&j)))?.to_string();
    let until = Instant::now() + Duration::from_secs(j["expires_in"].as_u64().unwrap_or(3600));
    if let Some(new) = j["refresh_token"].as_str().filter(|n| *n != refresh) {
        ROTATED.lock().unwrap().insert(key.clone(), new.to_string());
        let _ = atlas_plugin::Atlas::new().set_secret(&key, new);
        TOKENS.lock().unwrap().insert(new.to_string(), Cached { token: token.clone(), until });
    }
    TOKENS.lock().unwrap().insert(refresh, Cached { token: token.clone(), until });
    Ok(Some(token))
}

/// A sign-in under way (one at a time, as in Thunderbird).
enum Pending {
    Automatic { account: String, tenant: String, client: String, verifier: String, redirect: String, answer: Answer },
    Window { account: String, tenant: String, client: String, verifier: String },
    Code { account: String, tenant: String, client: String, device_code: String, interval: u64, until: Instant },
}
static PENDING: LazyLock<Mutex<Option<Pending>>> = LazyLock::new(Default::default);

fn pkce() -> (String, String) {
    use rand::RngCore;
    use sha2::{Digest, Sha256};
    let mut b = [0u8; 40];
    rand::thread_rng().fill_bytes(&mut b);
    let verifier = base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(b);
    let challenge = base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()));
    (verifier, challenge)
}

fn authorize_url(tenant: &str, client: &str, redirect: &str, user: &str, challenge: &str, more: &[(&str, &str)]) -> String {
    let mut q = vec![
        ("client_id", client),
        ("response_type", "code"),
        ("redirect_uri", redirect),
        ("response_mode", "query"),
        ("scope", SCOPES),
        ("code_challenge", challenge),
        ("code_challenge_method", "S256"),
        ("login_hint", user),
    ];
    q.extend_from_slice(more);
    format!("https://login.microsoftonline.com/{tenant}/oauth2/v2.0/authorize?{}", q.iter().map(|(k, v)| format!("{k}={}", enc(v))).collect::<Vec<_>>().join("&"))
}

/// The user's own browser, opened by the helper (a page's window.open needs a click in WebKitGTK).
pub fn open_browser(url: &str) -> bool {
    if std::env::var_os("ATLAS_NO_BROWSER").is_some() {
        return false;
    }
    std::process::Command::new("xdg-open").arg(url).stdin(std::process::Stdio::null()).stdout(std::process::Stdio::null()).stderr(std::process::Stdio::null()).spawn().is_ok()
}

/// Starts the sign-in of an Outlook card, by its flow → what the page shows (a URL to open, a code to type).
pub fn start(card: &Value, post: &Post) -> Result<Value, String> {
    let s = |k: &str| card.get(k).and_then(Value::as_str).unwrap_or("").trim().to_string();
    let account = s("name");
    if s("auth") != "outlook" {
        return Err(format!("{account} signs in with a password: set its Sign-in to outlook first"));
    }
    let tenant = Some(s("tenant")).filter(|t| !t.is_empty()).unwrap_or_else(|| "common".into());
    let client = Some(s("client_id")).filter(|t| !t.is_empty()).unwrap_or_else(|| crate::account::THUNDERBIRD_CLIENT.into());
    let user = s("user");
    *PENDING.lock().unwrap() = None;
    match s("flow").as_str() {
        "code" => {
            let j = post(&format!("https://login.microsoftonline.com/{tenant}/oauth2/v2.0/devicecode"), &[("client_id", &client), ("scope", SCOPES)])?;
            let device_code = j["device_code"].as_str().ok_or_else(|| format!("Microsoft refused: {}", refused(&j)))?.to_string();
            let url = j["verification_uri"].as_str().unwrap_or("https://microsoft.com/devicelogin").to_string();
            *PENDING.lock().unwrap() = Some(Pending::Code {
                account,
                tenant,
                client,
                device_code,
                interval: j["interval"].as_u64().unwrap_or(5),
                until: Instant::now() + Duration::from_secs(j["expires_in"].as_u64().unwrap_or(900)),
            });
            Ok(json!({ "flow": "code", "code": j["user_code"], "url": url, "message": j["message"], "opened": open_browser(&url) }))
        }
        "window" => {
            let (verifier, challenge) = pkce();
            let url = authorize_url(&tenant, &client, WINDOW_REDIRECT, &user, &challenge, &[("prompt", "select_account")]);
            *PENDING.lock().unwrap() = Some(Pending::Window { account, tenant, client, verifier });
            Ok(json!({ "flow": "window", "redirect": WINDOW_REDIRECT, "url": url }))
        }
        _ => {
            let (verifier, challenge) = pkce();
            let state = format!("{:x}", rand::random::<u128>());
            let (port, answer) = catch(&state)?;
            let redirect = format!("http://localhost:{port}");
            let url = authorize_url(&tenant, &client, &redirect, &user, &challenge, &[("state", &state)]);
            *PENDING.lock().unwrap() = Some(Pending::Automatic { account, tenant, client, verifier, redirect, answer });
            Ok(json!({ "flow": "automatic", "url": url, "opened": open_browser(&url) }))
        }
    }
}

/// A one-answer web server on a free loopback port: the browser's return from Microsoft, checked by its state.
fn catch(state: &str) -> Result<(u16, Answer), String> {
    let l4 = TcpListener::bind(("127.0.0.1", 0)).map_err(|e| format!("cannot listen on localhost: {e}"))?;
    let port = l4.local_addr().map_err(|e| e.to_string())?.port();
    let mut listeners = vec![l4];
    if let Ok(l6) = TcpListener::bind(("::1", port)) {
        listeners.push(l6); // "localhost" may resolve to ::1 first
    }
    let answer: Answer = Arc::new((Mutex::new(None), Condvar::new()));
    for l in listeners {
        let (answer, state) = (answer.clone(), state.to_string());
        std::thread::spawn(move || {
            for conn in l.incoming() {
                let Ok(mut c) = conn else { continue };
                let _ = c.set_read_timeout(Some(Duration::from_secs(10)));
                let mut buf = [0u8; 8192];
                let n = c.read(&mut buf).unwrap_or(0);
                let req = String::from_utf8_lossy(&buf[..n]);
                let path = req.split_whitespace().nth(1).unwrap_or("/");
                let q = query_of(path);
                if q.get("state").map(String::as_str) != Some(state.as_str()) || !(q.contains_key("code") || q.contains_key("error")) {
                    let _ = c.write_all(b"HTTP/1.1 404 Not Found\r\ncontent-length: 0\r\nconnection: close\r\n\r\n");
                    continue;
                }
                let text = if q.contains_key("code") {
                    "Signed in. You can close this tab and go back to Atlas.".to_string()
                } else {
                    format!("Not signed in: {}", crate::parse::escape(&refused(&json!({ "error": q.get("error"), "error_description": q.get("error_description") }))))
                };
                let body = format!("<!doctype html><meta charset=utf-8><title>Atlas</title><body style='font:16px sans-serif;padding:3em'><h2>{text}</h2>");
                let _ = c.write_all(format!("HTTP/1.1 200 OK\r\ncontent-type: text/html; charset=utf-8\r\ncontent-length: {}\r\nconnection: close\r\n\r\n{body}", body.len()).as_bytes());
                let (m, cv) = &*answer;
                *m.lock().unwrap() = Some(q);
                cv.notify_all();
                return;
            }
        });
    }
    Ok((port, answer))
}

/// Waits for the sign-in `start` began to end → the refresh token's secret (`_secrets`). `redirect`: the address the
/// window flow ended on (caught by the app, or pasted). `wait`: seconds to wait for the browser.
pub fn finish(redirect: Option<&str>, wait: u64, post: &Post) -> Result<Value, String> {
    let pending = PENDING.lock().unwrap().take().ok_or("start the sign-in first")?;
    let redeem = |account: &str, tenant: &str, client: &str, code: &str, redirect: &str, verifier: &str| -> Result<Value, String> {
        let j = post(
            &format!("https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token"),
            &[("client_id", client), ("grant_type", "authorization_code"), ("code", code), ("redirect_uri", redirect), ("code_verifier", verifier), ("scope", SCOPES)],
        )?;
        let rt = j["refresh_token"].as_str().ok_or_else(|| format!("sign-in failed: {}", refused(&j)))?;
        Ok(json!({ "signed_in": true, "_secrets": { format!("accounts.{account}.oauth_refresh"): rt } }))
    };
    match pending {
        Pending::Automatic { account, tenant, client, verifier, redirect, answer } => {
            let (m, cv) = &*answer;
            let (q, _) = cv.wait_timeout_while(m.lock().unwrap(), Duration::from_secs(wait), |a| a.is_none()).unwrap();
            let q = q.clone().ok_or("no answer from the browser in time: start the sign-in again")?;
            match q.get("code") {
                Some(code) => redeem(&account, &tenant, &client, code, &redirect, &verifier),
                None => Err(format!("Outlook said no: {}", refused(&json!({ "error": q.get("error"), "error_description": q.get("error_description") })))),
            }
        }
        Pending::Window { account, tenant, client, verifier } => {
            let q = query_of(redirect.unwrap_or(""));
            match q.get("code") {
                Some(code) => redeem(&account, &tenant, &client, code, WINDOW_REDIRECT, &verifier),
                None if q.contains_key("error") => Err(format!("Outlook said no: {}", refused(&json!({ "error": q.get("error"), "error_description": q.get("error_description") })))),
                None => Err("no code in that address: paste the whole address the sign-in ended on".into()),
            }
        }
        Pending::Code { account, tenant, client, device_code, interval, until } => {
            while Instant::now() < until {
                std::thread::sleep(Duration::from_secs(interval));
                let j = post(
                    &format!("https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token"),
                    &[("client_id", &client), ("grant_type", "urn:ietf:params:oauth:grant-type:device_code"), ("device_code", &device_code)],
                )?;
                if let Some(rt) = j["refresh_token"].as_str() {
                    return Ok(json!({ "signed_in": true, "_secrets": { format!("accounts.{account}.oauth_refresh"): rt } }));
                }
                if !matches!(j["error"].as_str(), Some("authorization_pending" | "slow_down")) {
                    return Err(format!("sign-in failed: {}", refused(&j)));
                }
            }
            Err("the code expired before it was entered".into())
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn refusals_are_said_plainly() {
        let j = json!({ "error": "invalid_client", "error_description": "AADSTS65001: The user or administrator has not consented.\r\nTrace ID: x" });
        assert!(refused(&j).starts_with("your organisation must approve"));
        assert!(refused(&j).ends_with("(AADSTS65001: The user or administrator has not consented.)"));
        assert_eq!(refused(&json!({ "error": "access_denied" })), "the sign-in was cancelled (access_denied)");
        assert_eq!(refused(&json!({})), "no answer");
    }

    #[test]
    fn return_addresses_are_read() {
        let q = query_of("https://localhost/?code=0.AX%2Fy+z&state=s1#frag");
        assert_eq!(q["code"], "0.AX/y z");
        assert_eq!(q["state"], "s1");
    }

    #[test]
    fn the_automatic_flow_catches_the_browser_and_redeems_the_code() {
        std::env::set_var("ATLAS_NO_BROWSER", "1");
        let card = json!({ "name": "udes", "auth": "outlook", "user": "me@u.ca" });
        let post = |url: &str, form: &[(&str, &str)]| -> Result<Value, String> {
            assert!(url.ends_with("/common/oauth2/v2.0/token"));
            let f: HashMap<_, _> = form.iter().cloned().collect();
            assert_eq!(f["code"], "C0DE");
            assert!(f["redirect_uri"].starts_with("http://localhost:"));
            assert!(f["code_verifier"].len() > 40);
            Ok(json!({ "refresh_token": "RT", "access_token": "AT" }))
        };
        let started = start(&card, &post).unwrap();
        let url = started["url"].as_str().unwrap().to_string();
        let q = query_of(&url);
        assert_eq!(q["login_hint"], "me@u.ca");
        assert_eq!(q["code_challenge_method"], "S256");
        let port: u16 = q["redirect_uri"].rsplit(':').next().unwrap().parse().unwrap();
        let state = q["state"].clone();
        std::thread::spawn(move || {
            let mut wrong = std::net::TcpStream::connect(("127.0.0.1", port)).unwrap();
            wrong.write_all(b"GET /?state=nope&code=X HTTP/1.1\r\n\r\n").unwrap();
            let mut s = String::new();
            let _ = wrong.read_to_string(&mut s);
            assert!(s.starts_with("HTTP/1.1 404"), "another state is not ours");
            let mut c = std::net::TcpStream::connect(("127.0.0.1", port)).unwrap();
            c.write_all(format!("GET /?code=C0DE&state={state} HTTP/1.1\r\n\r\n").as_bytes()).unwrap();
            let mut s = String::new();
            let _ = c.read_to_string(&mut s);
            assert!(s.contains("Signed in"));
        });
        let done = finish(None, 10, &post).unwrap();
        assert_eq!(done, json!({ "signed_in": true, "_secrets": { "accounts.udes.oauth_refresh": "RT" } }));
    }

    #[test]
    fn tokens_are_cached_and_a_password_account_needs_none() {
        let acc = crate::account::pick(&json!({ "settings": { "accounts": [{ "name": "o", "auth": "outlook", "user": "u@x" }] }, "secrets": { "accounts.o.oauth_refresh": "R1" } })).unwrap();
        static CALLS: std::sync::atomic::AtomicUsize = std::sync::atomic::AtomicUsize::new(0);
        let calls = &CALLS;
        let post = |_: &str, _: &[(&str, &str)]| -> Result<Value, String> {
            calls.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
            Ok(json!({ "access_token": "A1", "expires_in": 3600 }))
        };
        assert_eq!(access_token(&acc, &post).unwrap().as_deref(), Some("A1"));
        assert_eq!(access_token(&acc, &post).unwrap().as_deref(), Some("A1"));
        assert_eq!(calls.load(std::sync::atomic::Ordering::SeqCst), 1);
        let pw = crate::account::pick(&json!({ "settings": { "accounts": [{ "name": "p", "user": "u@x", "imap_host": "h" }] } })).unwrap();
        assert_eq!(access_token(&pw, &post).unwrap(), None);
    }
}
