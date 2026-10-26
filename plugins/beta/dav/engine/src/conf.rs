//! The plugin's settings and app password as a call brings them (or asked of Atlas over the pipe), read into what
//! the engine needs: the accounts (cards, each with its app password), the subscriptions, the calendars hidden and
//! their colours, the default calendar.
use crate::caldav::Account;
use crate::zone::{self, Zone};
use atlas_plugin::Atlas;
use serde_json::{json, Value};
use std::path::PathBuf;
use url::Url;
use std::sync::atomic::{AtomicBool, Ordering};

/// Serving Atlas (events and calls back are possible) rather than run from a shell.
pub static SERVING: AtomicBool = AtomicBool::new(false);

pub fn serving() -> bool {
    SERVING.load(Ordering::Relaxed)
}

/// The plugin's settings: given with a tool's call; a page's call passes its own; else asked of Atlas.
pub fn settings(p: &Value) -> Value {
    if p["settings"].is_object() {
        return p["settings"].clone();
    }
    if serving() {
        let id = std::env::var("ATLAS_PLUGIN_ID").unwrap_or_else(|_| "dav".into());
        if let Ok(Value::Array(all)) = Atlas::new().get("/api/plugins") {
            if let Some(me) = all.iter().find(|x| x["id"] == id.as_str()) {
                return me["settings"].clone();
            }
        }
    }
    json!({})
}

pub fn text(s: &Value, key: &str) -> String {
    s[key].as_str().unwrap_or_default().trim().to_string()
}

/// One CalDAV account (a card of Settings → Calendar → Accounts): its name, the server and user, the app password
/// (`accounts.<name>.password` in Atlas's secret store), and a colour for its calendars that have none.
#[derive(Debug, Clone)]
pub struct Card {
    pub name: String,
    pub account: Account,
    pub color: Option<String>,
    /// made from the 0.1 flat settings (url / user / `password`), not saved as a card yet
    pub legacy: bool,
}

impl Card {
    /// Server address and user name filled in (the password is asked only when needed).
    pub fn filled(&self) -> bool {
        !(self.account.url.is_empty() || self.account.user.is_empty())
    }
}

/// A secret of this plugin: handed over with the call (`secrets`), else asked of Atlas over the pipe.
pub fn secret(p: &Value, name: &str) -> Option<String> {
    if let Some(v) = p["secrets"][name].as_str().filter(|s| !s.is_empty()) {
        return Some(v.to_string());
    }
    if serving() {
        if let Ok(Some(v)) = Atlas::new().secret(name) {
            return Some(v).filter(|v| !v.is_empty());
        }
    }
    None
}

/// A card's secret key in the store.
pub fn password_key(card: &str) -> String {
    format!("accounts.{card}.password")
}

/// A name for the account the 0.1 settings described, from its server: `cal.example.org` → `example`.
pub fn legacy_name(url: &str) -> String {
    let host = Url::parse(if url.contains("://") { url.to_string() } else { format!("https://{url}") }.as_str())
        .ok()
        .and_then(|u| u.host_str().map(str::to_string))
        .unwrap_or_default();
    let skip = ["cal", "caldav", "dav", "calendar", "calendars", "www", "cloud", "nextcloud"];
    let labels: Vec<&str> = host.split('.').filter(|l| !l.is_empty()).collect();
    let body = if labels.len() > 1 { &labels[..labels.len() - 1] } else { &labels[..] };
    let pick = body.iter().rev().find(|l| !skip.contains(l) && l.parse::<u8>().is_err()).copied().unwrap_or("calendar");
    let clean: String = pick.chars().filter(|c| c.is_ascii_alphanumeric() || "._@-".contains(*c)).collect();
    if clean.is_empty() { "calendar".into() } else { clean }
}

/// The 0.1 flat settings as a card (`{name, url, user}`), when they are there and no card is.
pub fn legacy_card(s: &Value) -> Option<Value> {
    let has_cards = s["accounts"].as_array().is_some_and(|a| !a.is_empty());
    let (url, user) = (text(s, "url"), text(s, "user"));
    (!has_cards && !url.is_empty() && !user.is_empty()).then(|| json!({ "name": legacy_name(&url), "url": url, "user": user }))
}

/// Every account the settings describe, in their order (the first is the main one), without their passwords;
/// unnamed cards are skipped.
pub fn cards(s: &Value) -> Vec<Card> {
    let legacy = legacy_card(s);
    let list: Vec<Value> = match &legacy {
        Some(c) => vec![c.clone()],
        None => s["accounts"].as_array().cloned().unwrap_or_default(),
    };
    list.iter()
        .filter(|c| !text(c, "name").is_empty())
        .map(|c| Card {
            name: text(c, "name"),
            account: Account { url: text(c, "url"), user: text(c, "user"), password: String::new() },
            color: Some(text(c, "color")).filter(|x| x.starts_with('#')),
            legacy: legacy.is_some(),
        })
        .collect()
}

/// The accounts with their app passwords: each card's secret; the 0.1 `password` until the migration moved it.
pub fn accounts(s: &Value, p: &Value) -> Vec<Card> {
    cards(s)
        .into_iter()
        .map(|mut c| {
            c.account.password = secret(p, &password_key(&c.name)).or_else(|| if c.legacy { secret(p, "password") } else { None }).unwrap_or_default();
            c
        })
        .collect()
}

/// The card a call names (Settings' Test sends an unsaved `record`), its password typed there or kept.
pub fn card_of(record: &Value, p: &Value) -> Option<Card> {
    let name = text(record, "name");
    let typed = text(record, "password");
    let password = if typed.is_empty() { secret(p, &password_key(&name)).unwrap_or_default() } else { typed };
    Some(Card { account: Account { url: text(record, "url"), user: text(record, "user"), password }, color: None, legacy: false, name }).filter(|c| c.filled())
}

/// Some account has its server address and user name (no secret asked).
pub fn filled(s: &Value) -> bool {
    let full = |c: &Value| ["name", "url", "user"].iter().all(|k| !text(c, k).is_empty());
    legacy_card(s).is_some() || s["accounts"].as_array().is_some_and(|a| a.iter().any(full))
}

/// The default calendar for new events (`calendar`): a calendar id, its name or address; empty: the first writable.
pub fn default_calendar(s: &Value) -> String {
    text(s, "calendar")
}

/// The zone the call names (`tz`, from the page), else the machine's.
pub fn user_zone(p: &Value) -> Zone {
    zone::user_zone(p["tz"].as_str())
}

pub fn vault_root() -> PathBuf {
    std::env::var_os("ATLAS_ROOT").map(PathBuf::from).unwrap_or_else(|| std::env::current_dir().unwrap_or_default())
}

pub fn cache_dir() -> PathBuf {
    std::env::var_os("ATLAS_PLUGIN_CACHE").map(PathBuf::from).unwrap_or_else(|| vault_root().join(".atlas/cache/plugins/dav"))
}

/// An ICS subscription card (Settings → Calendar → Subscriptions).
#[derive(Debug, Clone, PartialEq)]
pub struct Sub {
    pub name: String,
    pub url: String,
    pub color: Option<String>,
    /// minutes between fetches
    pub refresh: i64,
}

impl Sub {
    pub fn id(&self) -> String {
        format!("sub:{}", self.name)
    }

    pub fn of(card: &Value) -> Option<Sub> {
        let name = card["name"].as_str()?.trim().to_string();
        let url = card["url"].as_str()?.trim().to_string();
        if name.is_empty() || url.is_empty() {
            return None;
        }
        Some(Sub {
            name,
            url,
            color: card["color"].as_str().map(str::trim).filter(|c| !c.is_empty()).map(str::to_string),
            refresh: card["refresh"].as_i64().or_else(|| card["refresh"].as_f64().map(|f| f as i64)).unwrap_or(60).max(5),
        })
    }
}

pub fn subscriptions(s: &Value) -> Vec<Sub> {
    s["subscriptions"].as_array().map(|a| a.iter().filter_map(Sub::of).collect()).unwrap_or_default()
}

/// Calendars hidden in the pane (by name or address).
pub fn hidden(s: &Value) -> Vec<String> {
    s["hidden"].as_array().map(|a| a.iter().filter_map(|x| x.as_str().map(str::to_string)).collect()).unwrap_or_default()
}

/// A calendar's colour chosen in the pane (`colors`: "Name: #hex" lines), by name or address.
pub fn color_for(s: &Value, name: &str, id: &str) -> Option<String> {
    s["colors"].as_array()?.iter().filter_map(|x| x.as_str()).find_map(|line| {
        let (k, v) = line.rsplit_once(':')?;
        let k = k.trim();
        (k == name || k == id).then(|| v.trim().to_string()).filter(|v| v.starts_with('#'))
    })
}

/// Minutes between CalDAV syncs.
/// The ntfy server calendars push their changes through (push.rs): the Calendar's own setting, else the one the
/// Notifications plugin already uses (one ntfy for the vault); neither: no push, the regular check only.
pub fn push_server(s: &Value) -> String {
    let own = text(s, "push_server");
    let t = if own.is_empty() && serving() { notifications_server() } else { own };
    let t = t.trim_end_matches('/');
    if t.is_empty() || t.contains("://") { t.to_string() } else { format!("https://{t}") }
}

/// The Notifications plugin's ntfy server, when it is installed and on in this vault.
fn notifications_server() -> String {
    match Atlas::new().get("/api/plugins") {
        Ok(Value::Array(all)) => all.iter().find(|x| x["id"] == "notifications").map(|n| text(&n["settings"], "server")).unwrap_or_default(),
        _ => String::new(),
    }
}

pub fn refresh_minutes(s: &Value) -> i64 {
    s["refresh"].as_i64().unwrap_or(5).max(1)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_old_single_account_becomes_a_card_named_after_its_server() {
        assert_eq!(legacy_name("https://cal.example.org/caldav/"), "example");
        assert_eq!(legacy_name("dav.example.org/remote.php/dav"), "example");
        assert_eq!(legacy_name("http://127.0.0.1:48099/"), "calendar");
        let old = json!({ "url": "https://cal.example.org/caldav/", "user": "alice", "calendar": "Personal" });
        let p = json!({ "secrets": { "password": "tok" } });
        let cards = accounts(&old, &p);
        assert_eq!(cards.len(), 1);
        assert_eq!((cards[0].name.as_str(), cards[0].account.user.as_str(), cards[0].account.password.as_str(), cards[0].legacy), ("example", "alice", "tok", true), "the old secret still works before the move");
        // once moved, the card's own secret
        let p2 = json!({ "secrets": { "password": "old", "accounts.example.password": "new" } });
        assert_eq!(accounts(&old, &p2)[0].account.password, "new");
    }

    #[test]
    fn cards_are_the_accounts_and_the_old_keys_are_ignored_beside_them() {
        let s = json!({
            "url": "https://left.over/", "user": "x",
            "accounts": [
                { "name": "example", "url": "https://cal.example.org/caldav/", "user": "alice", "color": "#7c5cff" },
                { "name": "", "url": "https://nameless/" },
                { "name": "work", "url": "https://cloud.example.org/remote.php/dav/", "user": "a.r" },
            ],
        });
        let p = json!({ "secrets": { "accounts.example.password": "a", "accounts.work.password": "b", "password": "never" } });
        let got: Vec<(String, String, Option<String>)> = accounts(&s, &p).into_iter().map(|c| (c.name, c.account.password, c.color)).collect();
        assert_eq!(got, [("example".into(), "a".into(), Some("#7c5cff".into())), ("work".into(), "b".into(), None)]);
        assert!(legacy_card(&s).is_none(), "cards are there: nothing to migrate");
        assert!(filled(&s));
        assert!(!filled(&json!({ "accounts": [{ "name": "a", "url": "https://x/" }] })), "no user name");
    }

    #[test]
    fn an_unsaved_card_is_tested_with_its_typed_or_kept_password() {
        let p = json!({ "secrets": { "accounts.work.password": "kept" } });
        let typed = card_of(&json!({ "name": "work", "url": "https://x/", "user": "u", "password": "typed" }), &p).unwrap();
        assert_eq!(typed.account.password, "typed");
        assert_eq!(card_of(&json!({ "name": "work", "url": "https://x/", "user": "u" }), &p).unwrap().account.password, "kept");
        assert!(card_of(&json!({ "name": "work", "url": "https://x/" }), &p).is_none(), "no user: nothing to test");
    }
}
