//! WebDAV Push (bitfireAT's draft, as RustiCal and DAVx5 speak it): a calendar that offers the Web Push transport is
//! subscribed with an ntfy topic as its push resource, and one stream from ntfy for all the topics says which calendar
//! changed, so its account syncs at once. Atlas can't be reached from the server; ntfy can (a UnifiedPush
//! distributor: anyone may publish to an `up…` topic, only the user reads it). The message is encrypted to the
//! subscription's key and never read: its arrival is the signal. The regular sync stays, as the draft asks.
use crate::caldav::{Client, DavError};
use crate::store::{PushRow, Store};
use crate::xml::{self, PUSH};
use chrono::{Duration, Utc};
use std::io::BufRead;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Mutex, OnceLock};
use url::Url;

/// How long a subscription is asked for; renewed a day before it ends.
const DAYS: i64 = 7;
/// A calendar that offers no push is asked again after this long.
const ASK_AGAIN: i64 = 86_400;

/// RFC 4648 base64url without padding (Web Push's keys).
fn b64url(bytes: &[u8]) -> String {
    const A: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    let mut out = String::with_capacity(bytes.len() * 4 / 3 + 3);
    for c in bytes.chunks(3) {
        let n = (u32::from(c[0]) << 16) | (u32::from(*c.get(1).unwrap_or(&0)) << 8) | u32::from(*c.get(2).unwrap_or(&0));
        for i in 0..=c.len() {
            out.push(A[((n >> (18 - 6 * i)) & 63) as usize] as char);
        }
    }
    out
}

fn random(n: usize) -> Result<Vec<u8>, String> {
    let mut b = vec![0u8; n];
    getrandom::getrandom(&mut b).map_err(|e| format!("no randomness: {e}"))?;
    Ok(b)
}

/// An ntfy topic for one calendar: `up` + 12 letters and digits (UnifiedPush's shape, which ntfy lets anyone publish to).
pub fn new_topic() -> Result<String, String> {
    const A: &[u8] = b"abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    Ok(format!("up{}", random(12)?.iter().map(|b| A[*b as usize % A.len()] as char).collect::<String>()))
}

/// A subscription's keys: the P-256 public key the server encrypts to and the auth secret (both base64url), and the
/// private key, kept so a message could be read one day.
pub struct Keys {
    pub public: String,
    pub auth: String,
    pub private: String,
}

pub fn new_keys() -> Result<Keys, String> {
    let secret = loop {
        if let Ok(k) = p256::SecretKey::from_slice(&random(32)?) {
            break k;
        }
    };
    let public = p256::elliptic_curve::sec1::ToEncodedPoint::to_encoded_point(&secret.public_key(), false);
    Ok(Keys { public: b64url(public.as_bytes()), auth: b64url(&random(16)?), private: b64url(&secret.to_bytes()) })
}

/// Does the collection offer Web Push (`P:transports` naming `P:web-push`)?
pub fn offers(client: &Client, coll: &Url) -> Result<bool, DavError> {
    let (_, rs) = client.propfind(coll, "0", "<p:transports/><p:topic/>")?;
    Ok(rs.first().and_then(|r| r.prop(PUSH, "transports")).is_some_and(|t| t.find(PUSH, "web-push").is_some()))
}

/// The push register request's body (the draft's `push-register`): changes to the calendar's events, until `until`.
/// No `property-update` trigger: RustiCal refuses one given only a depth (400 "Missing field").
pub fn register_body(resource: &str, keys: &Keys, until: chrono::DateTime<Utc>) -> String {
    format!(
        r#"<?xml version="1.0" encoding="utf-8"?><p:push-register xmlns:d="DAV:" xmlns:p="{PUSH}"><p:subscription><p:web-push-subscription><p:push-resource>{}</p:push-resource><p:content-encoding>aes128gcm</p:content-encoding><p:subscription-public-key type="p256dh">{}</p:subscription-public-key><p:auth-secret>{}</p:auth-secret></p:web-push-subscription></p:subscription><p:trigger><p:content-update><d:depth>1</d:depth></p:content-update></p:trigger><p:expires>{}</p:expires></p:push-register>"#,
        xml::escape(resource),
        keys.public,
        keys.auth,
        until.format("%a, %d %b %Y %H:%M:%S GMT")
    )
}

/// Subscribes the collection: the subscription's address (to remove it by), or the server's refusal.
pub fn register(client: &Client, coll: &Url, resource: &str, keys: &Keys) -> Result<String, DavError> {
    let body = register_body(resource, keys, Utc::now() + Duration::days(DAYS));
    let r = client.send("POST", coll, None, Some(("application/xml; charset=utf-8", body)), &[])?;
    if !matches!(r.status, 200 | 201 | 204) {
        return Err(DavError::Status { what: format!("push-register {}", coll.path()), code: r.status, body: r.body.chars().take(200).collect() });
    }
    Ok(r.location.and_then(|l| coll.join(&l).ok()).map(|u| u.to_string()).unwrap_or_default())
}

/// Removes a subscription (push switched off); a server that forgot it already is fine.
pub fn unregister(client: &Client, location: &str) {
    if let Ok(u) = Url::parse(location) {
        let _ = client.send("DELETE", &u, None, None, &[]);
    }
}

/// The address the server pushes to for `topic` on ntfy `server` (`?up=1`: a UnifiedPush message, kept as it came).
pub fn resource(server: &str, topic: &str) -> String {
    format!("{}/{topic}?up=1", server.trim_end_matches('/'))
}

/// One round (with the regular sync): every calendar of `calendars` (source id, its account's client, its address)
/// subscribed or renewed when due, the ones gone or with push off unsubscribed. Answers the topics to listen to,
/// each with its calendar's source id. Problems are said and skipped: the regular sync goes on regardless.
pub fn keep(store: &Store, server: &str, calendars: &[(String, &Client, Url)]) -> Vec<(String, String)> {
    let now = Utc::now().timestamp();
    for row in store.push_rows() {
        let wanted = !server.is_empty() && calendars.iter().any(|(id, ..)| *id == row.source);
        if !wanted {
            if let Some((_, c, _)) = calendars.iter().find(|(id, ..)| *id == row.source) {
                unregister(c, &row.location);
            }
            store.push_remove(&row.source);
        }
    }
    if server.is_empty() {
        return Vec::new();
    }
    for (id, client, url) in calendars {
        let row = store.push_row(id);
        if row.as_ref().is_some_and(|r| r.expires > now + if r.topic.is_empty() { 0 } else { 86_400 }) {
            continue;
        }
        let done = (|| -> Result<PushRow, String> {
            if !offers(client, url).map_err(|e| e.to_string())? {
                return Ok(PushRow { source: id.clone(), topic: String::new(), location: String::new(), expires: now + ASK_AGAIN, key: String::new() });
            }
            let topic = row.as_ref().map(|r| r.topic.clone()).filter(|t| !t.is_empty()).map_or_else(new_topic, Ok)?;
            let keys = new_keys()?;
            let location = register(client, url, &resource(server, &topic), &keys).map_err(|e| e.to_string())?;
            Ok(PushRow { source: id.clone(), topic, location, expires: now + DAYS * 86_400, key: keys.private })
        })();
        match done {
            Ok(r) => store.push_put(&r),
            Err(e) => eprintln!("dav: push for {id}: {e} (the regular check goes on)"),
        }
    }
    store.push_rows().into_iter().filter(|r| !r.topic.is_empty()).map(|r| (r.topic, r.source)).collect()
}

/// The stream that runs: its server and topics, and a number that ends it when they change.
struct Listening {
    on: Mutex<(String, Vec<String>)>,
    generation: AtomicU64,
}

fn listening() -> &'static Listening {
    static L: OnceLock<Listening> = OnceLock::new();
    L.get_or_init(|| Listening { on: Mutex::new((String::new(), Vec::new())), generation: AtomicU64::new(0) })
}

/// How the stream signs in to ntfy: a user and password, an access token, or nothing (topics anyone may read).
#[derive(Clone, Debug, PartialEq)]
pub enum Login {
    Password { user: String, password: String },
    Token(String),
    None,
}

impl Login {
    /// The user and password when a user is named, else the token when there is one.
    pub fn of(user: &str, password: &str, token: &str) -> Login {
        match (user.trim(), token.trim()) {
            (u, _) if !u.is_empty() => Login::Password { user: u.to_string(), password: password.to_string() },
            (_, t) if !t.is_empty() => Login::Token(t.to_string()),
            _ => Login::None,
        }
    }

    fn sign(&self, req: reqwest::blocking::RequestBuilder) -> reqwest::blocking::RequestBuilder {
        match self {
            Login::Password { user, password } => req.basic_auth(user, Some(password)),
            Login::Token(t) => req.bearer_auth(t),
            Login::None => req,
        }
    }
}

/// Keeps one stream from ntfy open for `topics` (a new one when they change; none when empty), calling `got` with
/// the topic of each message. ntfy's keepalive (under a minute) lets an outdated stream notice it should end.
pub fn listen(server: &str, login: Login, topics: Vec<String>, got: impl Fn(&str) + Send + Sync + 'static) {
    let l = listening();
    let mut on = l.on.lock().unwrap_or_else(|p| p.into_inner());
    let mut sorted = topics.clone();
    sorted.sort();
    if on.0 == server && on.1 == sorted {
        return;
    }
    *on = (server.to_string(), sorted);
    let generation = l.generation.fetch_add(1, Ordering::SeqCst) + 1;
    if topics.is_empty() || server.is_empty() {
        return;
    }
    let server = server.trim_end_matches('/').to_string();
    std::thread::spawn(move || {
        let current = || listening().generation.load(Ordering::SeqCst) == generation;
        let mut wait = 5;
        while current() {
            match stream(&server, &login, &topics, &current, &got) {
                Ok(()) => wait = 5,
                Err(e) => {
                    eprintln!("dav: push: {e}; again in {wait} s");
                    std::thread::sleep(std::time::Duration::from_secs(wait));
                    wait = (wait * 2).min(300);
                }
            }
        }
    });
}

/// One connection to ntfy's JSON stream (`/<t1>,<t2>/json`): each `message` event's topic to `got`, until the stream
/// ends or `current` says a newer one took over.
pub fn stream(server: &str, login: &Login, topics: &[String], current: &dyn Fn() -> bool, got: &dyn Fn(&str)) -> Result<(), String> {
    let http = reqwest::blocking::Client::builder().timeout(None).build().map_err(|e| e.to_string())?;
    let r = login.sign(http.get(format!("{server}/{}/json", topics.join(","))))
        .send().map_err(|e| format!("{server}: {e}"))?;
    if !r.status().is_success() {
        return Err(format!("{server} answered {} (may this sign-in read up… topics?)", r.status()));
    }
    for line in std::io::BufReader::new(r).lines() {
        if !current() {
            return Ok(());
        }
        let line = line.map_err(|e| e.to_string())?;
        let Ok(v) = serde_json::from_str::<serde_json::Value>(&line) else { continue };
        if v["event"] == "message" {
            if let Some(t) = v["topic"].as_str() {
                got(t);
            }
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn keys_and_topics_have_web_pushs_shapes() {
        let k = new_keys().unwrap();
        assert_eq!(k.public.len(), 87, "65 bytes, uncompressed (0x04…), base64url");
        assert!(k.public.starts_with('B'), "0x04 first");
        assert_eq!(k.auth.len(), 22);
        let t = new_topic().unwrap();
        assert!(t.starts_with("up") && t.len() == 14 && t.chars().all(|c| c.is_ascii_alphanumeric()), "{t}");
        assert_ne!(t, new_topic().unwrap());
        assert_eq!(resource("https://ntfy.example.org/", &t), format!("https://ntfy.example.org/{t}?up=1"));
    }

    #[test]
    fn the_register_body_names_the_resource_and_keys() {
        let k = Keys { public: "PUB".into(), auth: "AUTH".into(), private: String::new() };
        let b = register_body("https://ntfy.example.org/up123?up=1", &k, chrono::DateTime::from_timestamp(1_800_000_000, 0).unwrap());
        let root = xml::parse(&b).unwrap();
        assert!(root.is(PUSH, "push-register"));
        assert_eq!(root.find(PUSH, "push-resource").unwrap().trimmed(), "https://ntfy.example.org/up123?up=1");
        assert_eq!(root.find(PUSH, "subscription-public-key").unwrap().attr("type"), Some("p256dh"));
        assert_eq!(root.find(PUSH, "auth-secret").unwrap().trimmed(), "AUTH");
        assert_eq!(root.find(PUSH, "expires").unwrap().trimmed(), "Fri, 15 Jan 2027 08:00:00 GMT");
    }

    #[test]
    fn a_stream_hands_on_each_messages_topic() {
        use std::io::{Read, Write};
        let l = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let port = l.local_addr().unwrap().port();
        let server = std::thread::spawn(move || {
            let (mut s, _) = l.accept().unwrap();
            let mut buf = [0u8; 2048];
            let n = s.read(&mut buf).unwrap();
            let lines = concat!(
                "{\"event\":\"open\",\"topic\":\"upAAA,upBBB\"}\n",
                "{\"event\":\"keepalive\",\"topic\":\"upAAA,upBBB\"}\n",
                "{\"event\":\"message\",\"topic\":\"upBBB\",\"message\":\"x\"}\n"
            );
            s.write_all(format!("HTTP/1.1 200 OK\r\nContent-Type: application/x-ndjson\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{lines}", lines.len()).as_bytes()).unwrap();
            String::from_utf8_lossy(&buf[..n]).into_owned()
        });
        let got = Mutex::new(Vec::new());
        stream(&format!("http://127.0.0.1:{port}"), &Login::of("me", "pw", "tk_x"), &["upAAA".into(), "upBBB".into()], &|| true, &|t| got.lock().unwrap().push(t.to_string())).unwrap();
        assert_eq!(*got.lock().unwrap(), ["upBBB"]);
        let asked = server.join().unwrap();
        assert!(asked.starts_with("GET /upAAA,upBBB/json "), "{asked}");
        assert!(asked.to_ascii_lowercase().contains("authorization: basic bwu6chc="), "the user and password over the token: {asked}");
        assert_eq!(Login::of("", "", "tk"), Login::Token("tk".into()));
        assert_eq!(Login::of(" ", "", ""), Login::None);
    }
}
