//! Outlook / Microsoft 365 and Gmail sign-in (OAuth2, as Thunderbird does): the access token IMAP and SMTP sign in
//! with, renewed from the refresh token kept in Atlas's secret store; and the ways to get that refresh token (the
//! card's `flow`): automatic (the person's browser, caught on a loopback port), window (Atlas's sign-in window, ending
//! on https://localhost) and, for Microsoft only, code (a device code typed at microsoft.com/devicelogin; Google's
//! device flow does not grant mail). The two providers differ only in an [`Idp`]: endpoints, scopes, the application.
//! HTTPS goes through the core's fetch (the manifest's `net`), so the engine carries no HTTP client.

use crate::account::{Account, Auth};
use crate::trouble::Fail;
use base64::Engine;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::net::TcpListener;
use std::sync::{Arc, Condvar, LazyLock, Mutex};
use std::time::{Duration, Instant};

pub const SCOPES: &str = "https://outlook.office.com/IMAP.AccessAsUser.All https://outlook.office.com/SMTP.Send offline_access";
/// Exchange Web Services, for the Calendar plugin's Exchange accounts: granted on the same sign-in (Thunderbird's
/// application has it), so the refresh token IMAP uses is redeemed for it with no second sign-in.
pub const EWS_SCOPES: &str = "https://outlook.office.com/EWS.AccessAsUser.All offline_access";
const WINDOW_REDIRECT: &str = "https://localhost";
/// Gmail over IMAP/SMTP, and Google Calendar over CalDAV on the same sign-in (the Calendar plugin's token).
pub const GOOGLE_SCOPES: &str = "https://mail.google.com/ https://www.googleapis.com/auth/calendar";

/// Where an account signs in: its provider's endpoints, the application it signs in as, what it asks for.
#[derive(Debug, Clone, PartialEq)]
pub struct Idp {
    /// The provider's name, for what the person reads.
    pub name: &'static str,
    token_url: String,
    authorize_url: String,
    client: String,
    /// Google's installed applications send their (public) secret; Microsoft's public clients have none.
    secret: Option<String>,
    /// What a sign-in asks for (mail; Google's also the calendar).
    scopes: &'static str,
    /// Microsoft names the scope again on each renewal (one refresh token, a token per scope); Google renews the
    /// whole grant.
    scope_on_renewal: bool,
    /// Microsoft's device-code endpoint (the `code` flow); Google's does not grant mail.
    device_url: Option<String>,
    /// Extra query of the authorization address: Google's offline access, so a refresh token comes back.
    authorize_extra: &'static [(&'static str, &'static str)],
}

impl Idp {
    fn microsoft(tenant: &str, client: &str) -> Idp {
        let base = format!("https://login.microsoftonline.com/{tenant}/oauth2/v2.0");
        Idp {
            name: "Outlook",
            token_url: format!("{base}/token"),
            authorize_url: format!("{base}/authorize"),
            client: client.into(),
            secret: None,
            scopes: SCOPES,
            scope_on_renewal: true,
            device_url: Some(format!("{base}/devicecode")),
            authorize_extra: &[("response_mode", "query")],
        }
    }
    fn google(client: &str, secret: &str) -> Idp {
        Idp {
            name: "Gmail",
            token_url: "https://oauth2.googleapis.com/token".into(),
            authorize_url: "https://accounts.google.com/o/oauth2/v2/auth".into(),
            client: client.into(),
            secret: Some(secret.to_string()).filter(|s| !s.is_empty()),
            scopes: GOOGLE_SCOPES,
            scope_on_renewal: false,
            device_url: None,
            authorize_extra: &[("access_type", "offline"), ("prompt", "consent")],
        }
    }
    /// An account's provider (None: a password account).
    pub fn of(auth: &Auth) -> Option<Idp> {
        match auth {
            Auth::Password(_) => None,
            Auth::Outlook { tenant, client_id, .. } => Some(Idp::microsoft(tenant, client_id)),
            Auth::Google { client_id, client_secret, .. } => Some(Idp::google(client_id, client_secret)),
        }
    }
    /// A card's provider, as `account.rs` reads it (its own application, else Thunderbird's).
    fn of_card(card: &Value) -> Result<Idp, String> {
        let s = |k: &str| card.get(k).and_then(Value::as_str).unwrap_or("").trim().to_string();
        match s("auth").as_str() {
            "outlook" => {
                let tenant = Some(s("tenant")).filter(|t| !t.is_empty()).unwrap_or_else(|| "common".into());
                let client = Some(s("client_id")).filter(|t| !t.is_empty()).unwrap_or_else(|| crate::account::THUNDERBIRD_CLIENT.into());
                Ok(Idp::microsoft(&tenant, &client))
            }
            "google" => Ok(match Some(s("client_id")).filter(|t| !t.is_empty()) {
                Some(own) => Idp::google(&own, &s("client_secret")),
                None => Idp::google(crate::account::THUNDERBIRD_GOOGLE_CLIENT, crate::account::THUNDERBIRD_GOOGLE_SECRET),
            }),
            _ => Err(format!("{} signs in with a password: set its Sign-in to outlook or google first", s("name"))),
        }
    }
    /// The form that redeems `grant` at the token endpoint, with the application's id (and secret).
    fn form<'a>(&'a self, grant: &[(&'a str, &'a str)]) -> Vec<(&'a str, &'a str)> {
        let mut f = vec![("client_id", self.client.as_str())];
        if let Some(sec) = &self.secret {
            f.push(("client_secret", sec.as_str()));
        }
        f.extend_from_slice(grant);
        f
    }
}

/// How a form is POSTed to the provider (the core's fetch in the helper; a stand-in in tests).
pub type Post = dyn Fn(&str, &[(&str, &str)]) -> Result<Value, String> + Send + Sync;

/// The core's fetch: `POST /api/plugins/email/fetch`.
pub fn core_post(url: &str, form: &[(&str, &str)]) -> Result<Value, String> {
    let body = form.iter().map(|(k, v)| format!("{}={}", enc(k), enc(v))).collect::<Vec<_>>().join("&");
    let req = json!({ "url": url, "method": "POST", "headers": { "content-type": "application/x-www-form-urlencoded", "accept": "application/json" }, "body": body, "timeout_secs": 30 });
    let a = atlas_plugin::Atlas::new().post("/api/plugins/email/fetch", &req).map_err(|e| format!("cannot reach the sign-in: {e}"))?;
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
    // Google's
    (&["disallowed_useragent"], "Google refuses a sign-in inside an app's window: set the card's Sign-in flow to automatic (your own browser)"),
    (&["admin_policy_enforced", "org_internal"], "your Google Workspace administrator does not allow this mail app: ask them, or put a Google Cloud client of your own on the card"),
    (&["invalid_client", "unauthorized_client"], "Google does not accept this application: put a Google Cloud client of your own on the card (README.md)"),
];

/// Why the provider said no, said plainly (a token answer and a return address both carry `error` and `error_description`).
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

/// The access token IMAP and SMTP sign in with (None for a password account).
pub fn access_token(acc: &Account, post: &Post) -> Result<Option<String>, Fail> {
    access_token_for(acc, SCOPES, post)
}

/// An access token for `scopes` from the account's refresh token (None for a password account). Cached per refresh
/// token and scopes until a minute before it ends.
pub fn access_token_for(acc: &Account, scopes: &str, post: &Post) -> Result<Option<String>, Fail> {
    let Some(idp) = Idp::of(&acc.auth) else { return Ok(None) };
    let key = refresh_key(acc);
    let refresh = current_refresh(acc).ok_or_else(|| Fail::sign_in(format!("not signed in to {}: use the card's Sign in button", idp.name)))?;
    let cache = |r: &str| format!("{scopes}\n{r}");
    if let Some(c) = TOKENS.lock().unwrap().get(&cache(&refresh)) {
        if Instant::now() + Duration::from_secs(60) < c.until {
            return Ok(Some(c.token.clone()));
        }
    }
    let mut grant = vec![("grant_type", "refresh_token"), ("refresh_token", refresh.as_str())];
    if idp.scope_on_renewal {
        grant.push(("scope", scopes));
    }
    let j = post(&idp.token_url, &idp.form(&grant)).map_err(|e| Fail::connection(format!("cannot reach {}'s sign-in: {e}", idp.name)))?;
    let token = j["access_token"].as_str().ok_or_else(|| renewal_refused(&idp, &j))?.to_string();
    let until = Instant::now() + Duration::from_secs(j["expires_in"].as_u64().unwrap_or(3600));
    if let Some(new) = j["refresh_token"].as_str().filter(|n| *n != refresh) {
        ROTATED.lock().unwrap().insert(key.clone(), new.to_string());
        let _ = atlas_plugin::Atlas::new().set_secret(&key, new);
        TOKENS.lock().unwrap().insert(cache(new), Cached { token: token.clone(), until });
    }
    TOKENS.lock().unwrap().insert(cache(&refresh), Cached { token: token.clone(), until });
    Ok(Some(token))
}

fn refresh_key(acc: &Account) -> String {
    format!("accounts.{}.oauth_refresh", acc.name)
}

/// The account's refresh token: the one Microsoft rotated last, else the stored one.
fn current_refresh(acc: &Account) -> Option<String> {
    let (Auth::Outlook { refresh, .. } | Auth::Google { refresh, .. }) = &acc.auth else { return None };
    ROTATED.lock().unwrap().get(&refresh_key(acc)).cloned().or_else(|| refresh.clone())
}

/// Drops the account's cached access tokens (every scope): a server refused one, the next is renewed fresh.
pub fn forget(acc: &Account) {
    if let Some(r) = current_refresh(acc) {
        let tail = format!("\n{r}");
        TOKENS.lock().unwrap().retain(|k, _| !k.ends_with(&tail));
    }
}

/// A renewal Microsoft did not grant: its own trouble (down, or an answer that is no JSON: a proxy, a captive portal)
/// is the connection's; anything else is about the sign-in itself (expired, revoked, blocked by the organisation).
fn renewal_refused(idp: &Idp, answer: &Value) -> Fail {
    match answer["error"].as_str() {
        Some("temporarily_unavailable" | "server_error" | "no_json") => Fail::connection(format!("{}'s sign-in is not answering ({})", idp.name, refused(answer))),
        _ => Fail::sign_in(format!("{} refused the sign-in ({}): sign in again", idp.name, refused(answer))),
    }
}

/// A sign-in under way (one at a time, as in Thunderbird).
enum Pending {
    Automatic { account: String, idp: Idp, verifier: String, redirect: String, answer: Answer },
    Window { account: String, idp: Idp, verifier: String },
    Code { account: String, idp: Idp, device_code: String, interval: u64, until: Instant },
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

fn authorize_url(idp: &Idp, redirect: &str, user: &str, challenge: &str, more: &[(&str, &str)]) -> String {
    let mut q = vec![
        ("client_id", idp.client.as_str()),
        ("response_type", "code"),
        ("redirect_uri", redirect),
        ("scope", idp.scopes),
        ("code_challenge", challenge),
        ("code_challenge_method", "S256"),
        ("login_hint", user),
    ];
    q.extend_from_slice(idp.authorize_extra);
    // a `prompt` asked for here joins the provider's own (Google's consent: `consent select_account`)
    let mut prompt = q.iter().find(|(k, _)| *k == "prompt").map(|(_, v)| v.to_string());
    for (k, v) in more {
        if *k == "prompt" {
            prompt = Some(prompt.map_or(v.to_string(), |p| format!("{p} {v}")));
        } else {
            q.push((k, v));
        }
    }
    q.retain(|(k, _)| *k != "prompt");
    let prompt = prompt.unwrap_or_default();
    if !prompt.is_empty() {
        q.push(("prompt", &prompt));
    }
    format!("{}?{}", idp.authorize_url, q.iter().map(|(k, v)| format!("{k}={}", enc(v))).collect::<Vec<_>>().join("&"))
}

/// The user's own browser, opened by the helper (a page's window.open needs a click in WebKitGTK).
pub fn open_browser(url: &str) -> bool {
    if std::env::var_os("ATLAS_NO_BROWSER").is_some() {
        return false;
    }
    std::process::Command::new("xdg-open").arg(url).stdin(std::process::Stdio::null()).stdout(std::process::Stdio::null()).stderr(std::process::Stdio::null()).spawn().is_ok()
}

/// Starts the sign-in of an Outlook or Gmail card, by its flow → what the page shows (a URL to open, a code to type).
pub fn start(card: &Value, post: &Post) -> Result<Value, String> {
    let s = |k: &str| card.get(k).and_then(Value::as_str).unwrap_or("").trim().to_string();
    let account = s("name");
    let idp = Idp::of_card(card)?;
    let user = s("user");
    *PENDING.lock().unwrap() = None;
    match s("flow").as_str() {
        "code" => {
            let device = idp.device_url.clone().ok_or_else(|| format!("{} has no code sign-in for mail: choose the automatic or window flow on the card", idp.name))?;
            let j = post(&device, &idp.form(&[("scope", idp.scopes)]))?;
            let device_code = j["device_code"].as_str().ok_or_else(|| format!("Microsoft refused: {}", refused(&j)))?.to_string();
            let url = j["verification_uri"].as_str().unwrap_or("https://microsoft.com/devicelogin").to_string();
            *PENDING.lock().unwrap() = Some(Pending::Code {
                account,
                idp,
                device_code,
                interval: j["interval"].as_u64().unwrap_or(5),
                until: Instant::now() + Duration::from_secs(j["expires_in"].as_u64().unwrap_or(900)),
            });
            Ok(json!({ "flow": "code", "code": j["user_code"], "url": url, "message": j["message"], "opened": open_browser(&url) }))
        }
        "window" => {
            let (verifier, challenge) = pkce();
            let url = authorize_url(&idp, WINDOW_REDIRECT, &user, &challenge, &[("prompt", "select_account")]);
            *PENDING.lock().unwrap() = Some(Pending::Window { account, idp, verifier });
            Ok(json!({ "flow": "window", "redirect": WINDOW_REDIRECT, "url": url }))
        }
        _ => {
            let (verifier, challenge) = pkce();
            let state = format!("{:x}", rand::random::<u128>());
            let (port, answer) = catch(&state)?;
            let redirect = format!("http://localhost:{port}");
            let url = authorize_url(&idp, &redirect, &user, &challenge, &[("state", &state)]);
            *PENDING.lock().unwrap() = Some(Pending::Automatic { account, idp, verifier, redirect, answer });
            Ok(json!({ "flow": "automatic", "url": url, "opened": open_browser(&url) }))
        }
    }
}

/// A one-answer web server on a free loopback port: the browser's return from the provider, checked by its state.
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
    let redeem = |account: &str, idp: &Idp, code: &str, redirect: &str, verifier: &str| -> Result<Value, String> {
        let mut grant = vec![("grant_type", "authorization_code"), ("code", code), ("redirect_uri", redirect), ("code_verifier", verifier)];
        if idp.scope_on_renewal {
            grant.push(("scope", idp.scopes));
        }
        let j = post(&idp.token_url, &idp.form(&grant))?;
        let rt = j["refresh_token"].as_str().ok_or_else(|| format!("sign-in failed: {}", refused(&j)))?;
        Ok(json!({ "signed_in": true, "_secrets": { format!("accounts.{account}.oauth_refresh"): rt } }))
    };
    match pending {
        Pending::Automatic { account, idp, verifier, redirect, answer } => {
            let (m, cv) = &*answer;
            let (q, _) = cv.wait_timeout_while(m.lock().unwrap(), Duration::from_secs(wait), |a| a.is_none()).unwrap();
            let q = q.clone().ok_or("no answer from the browser in time: start the sign-in again")?;
            match q.get("code") {
                Some(code) => redeem(&account, &idp, code, &redirect, &verifier),
                None => Err(format!("{} said no: {}", idp.name, refused(&json!({ "error": q.get("error"), "error_description": q.get("error_description") })))),
            }
        }
        Pending::Window { account, idp, verifier } => {
            let q = query_of(redirect.unwrap_or(""));
            match q.get("code") {
                Some(code) => redeem(&account, &idp, code, WINDOW_REDIRECT, &verifier),
                None if q.contains_key("error") => Err(format!("{} said no: {}", idp.name, refused(&json!({ "error": q.get("error"), "error_description": q.get("error_description") })))),
                None => Err("no code in that address: paste the whole address the sign-in ended on".into()),
            }
        }
        Pending::Code { account, idp, device_code, interval, until } => {
            while Instant::now() < until {
                std::thread::sleep(Duration::from_secs(interval));
                let j = post(&idp.token_url, &idp.form(&[("grant_type", "urn:ietf:params:oauth:grant-type:device_code"), ("device_code", &device_code)]))?;
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

    /// Gmail: Google's endpoints, Thunderbird's Google application with its public secret, offline access asked so a
    /// refresh token comes back; the renewal names no scope (the grant holds mail and the calendar). No code flow.
    #[test]
    fn gmail_signs_in_at_google_and_renews_the_whole_grant() {
        use crate::account::{THUNDERBIRD_GOOGLE_CLIENT, THUNDERBIRD_GOOGLE_SECRET};
        let card = json!({ "name": "g", "auth": "google", "user": "me@gmail.example", "flow": "window" });
        let never = |_: &str, _: &[(&str, &str)]| -> Result<Value, String> { panic!("no call before the return") };
        let started = start(&card, &never).unwrap();
        let url = started["url"].as_str().unwrap();
        assert!(url.starts_with("https://accounts.google.com/o/oauth2/v2/auth?"), "{url}");
        let q = query_of(url);
        assert_eq!((q["client_id"].as_str(), q["access_type"].as_str(), q["prompt"].as_str()), (THUNDERBIRD_GOOGLE_CLIENT, "offline", "consent select_account"));
        assert_eq!(q["scope"], GOOGLE_SCOPES);
        let redeem = |url: &str, form: &[(&str, &str)]| -> Result<Value, String> {
            assert_eq!(url, "https://oauth2.googleapis.com/token");
            let f: HashMap<_, _> = form.iter().cloned().collect();
            assert_eq!((f["client_secret"], f["code"], f["redirect_uri"]), (THUNDERBIRD_GOOGLE_SECRET, "G0", "https://localhost"));
            assert!(!f.contains_key("scope"));
            Ok(json!({ "refresh_token": "GRT" }))
        };
        let done = finish(Some("https://localhost/?code=G0&scope=x"), 1, &redeem).unwrap();
        assert_eq!(done["_secrets"]["accounts.g.oauth_refresh"], "GRT");
        let acc = crate::account::pick(&json!({ "settings": { "accounts": [card] }, "secrets": { "accounts.g.oauth_refresh": "GRT" } })).unwrap();
        let renew = |url: &str, form: &[(&str, &str)]| -> Result<Value, String> {
            let f: HashMap<_, _> = form.iter().cloned().collect();
            assert_eq!((url, f["grant_type"], f["refresh_token"]), ("https://oauth2.googleapis.com/token", "refresh_token", "GRT"));
            assert!(!f.contains_key("scope") && f.contains_key("client_secret"));
            Ok(json!({ "access_token": "GA", "expires_in": 3600 }))
        };
        assert_eq!(access_token(&acc, &renew).unwrap().as_deref(), Some("GA"));
        let code = start(&json!({ "name": "g", "auth": "google", "user": "me@gmail.example", "flow": "code" }), &never).unwrap_err();
        assert!(code.contains("no code sign-in"), "{code}");
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
        // another scope (the Calendar's Exchange) is its own token, from the same refresh token
        assert_eq!(access_token_for(&acc, EWS_SCOPES, &post).unwrap().as_deref(), Some("A1"));
        assert_eq!(calls.load(std::sync::atomic::Ordering::SeqCst), 2);
        // a token a server refused is forgotten: the next one is renewed
        forget(&acc);
        assert_eq!(access_token(&acc, &post).unwrap().as_deref(), Some("A1"));
        assert_eq!(calls.load(std::sync::atomic::Ordering::SeqCst), 3);
        let pw = crate::account::pick(&json!({ "settings": { "accounts": [{ "name": "p", "user": "u@x", "imap_host": "h" }] } })).unwrap();
        assert_eq!(access_token(&pw, &post).unwrap(), None);
    }

    #[test]
    fn a_renewal_that_fails_says_whether_to_sign_in_again_or_wait() {
        use crate::trouble::Trouble;
        let acc = |name: &str, refresh: Option<&str>| {
            let mut p = json!({ "settings": { "accounts": [{ "name": name, "auth": "outlook", "user": "u@x" }] }, "secrets": {} });
            if let Some(r) = refresh {
                p["secrets"][format!("accounts.{name}.oauth_refresh")] = json!(r);
            }
            crate::account::pick(&p).unwrap()
        };
        let never = |_: &str, _: &[(&str, &str)]| -> Result<Value, String> { panic!("nothing to renew with") };
        assert_eq!(access_token(&acc("t-none", None), &never).unwrap_err().trouble, Trouble::SignIn);
        let expired = |_: &str, _: &[(&str, &str)]| -> Result<Value, String> { Ok(json!({ "error": "invalid_grant", "error_description": "AADSTS70008: The refresh token has expired." })) };
        let e = access_token(&acc("t-expired", Some("old")), &expired).unwrap_err();
        assert_eq!(e.trouble, Trouble::SignIn, "{e}");
        assert!(e.text.contains("expired"), "{e}");
        let offline = |_: &str, _: &[(&str, &str)]| -> Result<Value, String> { Err("no route to host".into()) };
        assert_eq!(access_token(&acc("t-offline", Some("r2")), &offline).unwrap_err().trouble, Trouble::Connection);
        let down = |_: &str, _: &[(&str, &str)]| -> Result<Value, String> { Ok(json!({ "error": "temporarily_unavailable" })) };
        assert_eq!(access_token(&acc("t-down", Some("r3")), &down).unwrap_err().trouble, Trouble::Connection);
    }
}
