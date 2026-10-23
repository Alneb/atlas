//! The local cache (DESIGN-calendar §3): the calendars and subscriptions, their calendar objects as the server has
//! them, and the address book — in SQLite so the pane answers at once and offline. Only a cache: deleting it loses
//! nothing; the next sync fills it again. One file per vault: `<plugin cache>/calendar.sqlite`.
use crate::ics;
use crate::recur;
use crate::zone::Zone;
use rusqlite::{params, Connection, OptionalExtension};
use serde::Serialize;
use std::path::Path;
use std::sync::Mutex;

/// Bumped when the schema changes: an older cache is dropped and synced again.
const SCHEMA: i64 = 2; // 2: sources carry their account; CalDAV ids are `<account>/<calendar>`

/// Where a source's events come from.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Kind {
    /// a calendar on the CalDAV server
    Caldav,
    /// an ICS subscription (read-only)
    Ics,
}

impl Kind {
    fn as_str(&self) -> &'static str {
        match self {
            Kind::Caldav => "caldav",
            Kind::Ics => "ics",
        }
    }
    fn parse(s: &str) -> Kind {
        if s == "ics" { Kind::Ics } else { Kind::Caldav }
    }
}

/// A calendar the pane lists.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Source {
    /// `<account>/<calendar>` for a CalDAV calendar (unique across accounts: `calendar_id`), `sub:<name>`
    pub id: String,
    pub kind: Kind,
    /// the account card a CalDAV calendar belongs to (None: a subscription)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub account: Option<String>,
    pub url: String,
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub color: Option<String>,
    pub writable: bool,
    /// sync state: CalDAV getctag / sync-token, a subscription's ETag / Last-Modified
    #[serde(skip)]
    pub ctag: Option<String>,
    #[serde(skip)]
    pub token: Option<String>,
    /// unix seconds of the last good sync
    pub synced: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

/// A CalDAV calendar's id: `<account>/<last part of its address>` (`home/personal`), or the whole path when another
/// calendar of the account ends the same (`home/calendars/alice/personal`). Short, so Claude and Settings can name it.
pub fn calendar_id(account: &str, url: &str, siblings: &[&str]) -> String {
    let path = |u: &str| url::Url::parse(u).map(|x| x.path().trim_matches('/').to_string()).unwrap_or_else(|_| u.trim_matches('/').to_string());
    let last = |u: &str| path(u).rsplit('/').next().unwrap_or_default().to_string();
    let mine = last(url);
    let clash = siblings.iter().filter(|s| **s != url && last(s) == mine).count() > 0;
    format!("{account}/{}", if clash || mine.is_empty() { path(url) } else { mine })
}

/// A calendar object as cached.
#[derive(Debug, Clone, PartialEq)]
pub struct Object {
    pub source: String,
    pub href: String,
    pub etag: Option<String>,
    pub uid: String,
    pub ics: String,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Contact {
    pub name: String,
    pub emails: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub org: Option<String>,
}

pub struct Store {
    db: Mutex<Connection>,
}

fn err(e: rusqlite::Error) -> String {
    format!("the calendar cache: {e}")
}

impl Store {
    pub fn open(path: &Path) -> Result<Store, String> {
        if let Some(d) = path.parent() {
            let _ = std::fs::create_dir_all(d);
        }
        let c = Connection::open(path).map_err(err)?;
        Store::init(c)
    }

    pub fn memory() -> Store {
        Store::init(Connection::open_in_memory().expect("sqlite in memory")).expect("schema")
    }

    fn init(c: Connection) -> Result<Store, String> {
        c.execute_batch("PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL; PRAGMA busy_timeout=5000;").map_err(err)?;
        let v: i64 = c.query_row("PRAGMA user_version", [], |r| r.get(0)).map_err(err)?;
        if v != SCHEMA {
            c.execute_batch("DROP TABLE IF EXISTS sources; DROP TABLE IF EXISTS objects; DROP TABLE IF EXISTS contacts;")
                .map_err(err)?;
        }
        c.execute_batch(
            "CREATE TABLE IF NOT EXISTS sources (id TEXT PRIMARY KEY, kind TEXT NOT NULL, account TEXT, url TEXT NOT NULL, name TEXT NOT NULL,
               color TEXT, writable INTEGER NOT NULL, ctag TEXT, token TEXT, synced INTEGER NOT NULL DEFAULT 0, error TEXT);
             CREATE TABLE IF NOT EXISTS objects (source TEXT NOT NULL, href TEXT NOT NULL, etag TEXT, uid TEXT NOT NULL,
               ics TEXT NOT NULL, lo INTEGER NOT NULL, hi INTEGER, words TEXT NOT NULL, PRIMARY KEY (source, href));
             CREATE INDEX IF NOT EXISTS objects_uid ON objects(uid);
             CREATE INDEX IF NOT EXISTS objects_lo ON objects(source, lo);
             CREATE TABLE IF NOT EXISTS contacts (book TEXT NOT NULL, href TEXT NOT NULL, etag TEXT, name TEXT NOT NULL,
               emails TEXT NOT NULL, org TEXT, PRIMARY KEY (book, href));",
        )
        .map_err(err)?;
        c.execute_batch(&format!("PRAGMA user_version = {SCHEMA}")).map_err(err)?;
        Ok(Store { db: Mutex::new(c) })
    }

    fn db(&self) -> std::sync::MutexGuard<'_, Connection> {
        self.db.lock().unwrap_or_else(|p| p.into_inner())
    }

    // ----- sources

    /// The CalDAV calendars of one account.
    pub fn of_account(&self, account: &str) -> Vec<Source> {
        self.sources().into_iter().filter(|s| s.account.as_deref() == Some(account)).collect()
    }

    pub fn sources(&self) -> Vec<Source> {
        let db = self.db();
        let Ok(mut q) = db.prepare("SELECT id, kind, account, url, name, color, writable, ctag, token, synced, error FROM sources ORDER BY kind, account, name") else { return vec![] };
        q.query_map([], |r| {
            Ok(Source {
                id: r.get(0)?,
                kind: Kind::parse(&r.get::<_, String>(1)?),
                account: r.get(2)?,
                url: r.get(3)?,
                name: r.get(4)?,
                color: r.get(5)?,
                writable: r.get::<_, i64>(6)? != 0,
                ctag: r.get(7)?,
                token: r.get(8)?,
                synced: r.get(9)?,
                error: r.get(10)?,
            })
        })
        .map(|rows| rows.flatten().collect())
        .unwrap_or_default()
    }

    pub fn source(&self, id: &str) -> Option<Source> {
        self.sources().into_iter().find(|s| s.id == id)
    }

    /// Adds or refreshes a source's description; its sync state is kept.
    pub fn put_source(&self, s: &Source) -> Result<(), String> {
        self.db()
            .execute(
                "INSERT INTO sources (id, kind, account, url, name, color, writable) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
                 ON CONFLICT(id) DO UPDATE SET kind = ?2, account = ?3, url = ?4, name = ?5, color = ?6, writable = ?7",
                params![s.id, s.kind.as_str(), s.account, s.url, s.name, s.color, s.writable as i64],
            )
            .map(|_| ())
            .map_err(err)
    }

    pub fn set_state(&self, id: &str, ctag: Option<&str>, token: Option<&str>, synced: i64, error: Option<&str>) {
        let _ = self.db().execute(
            "UPDATE sources SET ctag = ?2, token = ?3, synced = CASE WHEN ?5 IS NULL THEN ?4 ELSE synced END, error = ?5 WHERE id = ?1",
            params![id, ctag, token, synced, error],
        );
    }

    pub fn set_error(&self, id: &str, error: Option<&str>) {
        let _ = self.db().execute("UPDATE sources SET error = ?2 WHERE id = ?1", params![id, error]);
    }

    /// A source and its events gone (a calendar removed on the server, a subscription taken out of Settings).
    pub fn remove_source(&self, id: &str) {
        let db = self.db();
        let _ = db.execute("DELETE FROM objects WHERE source = ?1", params![id]);
        let _ = db.execute("DELETE FROM sources WHERE id = ?1", params![id]);
    }

    // ----- objects

    /// Keeps one calendar object (replacing the one at that address).
    pub fn put(&self, source: &str, href: &str, etag: Option<&str>, text: &str) -> Result<(), String> {
        let cal = ics::parse(text)?.into_iter().find(|c| c.name == "VCALENDAR").ok_or("no VCALENDAR in it")?;
        let uid = cal.subs.iter().find(|c| c.name == "VEVENT").and_then(|e| e.text("UID")).unwrap_or_default();
        let (lo, hi) = recur::bounds(&cal, &Zone::UTC);
        let words = ["SUMMARY", "LOCATION", "DESCRIPTION"].map(|k| recur::texts(&cal, k)).join("\n").to_lowercase();
        self.db()
            .execute(
                "INSERT OR REPLACE INTO objects (source, href, etag, uid, ics, lo, hi, words) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
                params![source, href, etag, uid, text, lo, hi, words],
            )
            .map(|_| ())
            .map_err(err)
    }

    pub fn delete(&self, source: &str, href: &str) {
        let _ = self.db().execute("DELETE FROM objects WHERE source = ?1 AND href = ?2", params![source, href]);
    }

    /// A source's objects by address → ETag (what a sync compares with the server's listing).
    pub fn etags(&self, source: &str) -> Vec<(String, Option<String>)> {
        let db = self.db();
        let Ok(mut q) = db.prepare("SELECT href, etag FROM objects WHERE source = ?1") else { return vec![] };
        q.query_map(params![source], |r| Ok((r.get(0)?, r.get(1)?))).map(|r| r.flatten().collect()).unwrap_or_default()
    }

    /// Replaces every object of a source at once (a subscription's whole file).
    pub fn replace(&self, source: &str, objects: &[(String, String)]) -> Result<usize, String> {
        self.db().execute("DELETE FROM objects WHERE source = ?1", params![source]).map_err(err)?;
        let mut n = 0;
        for (href, text) in objects {
            match self.put(source, href, None, text) {
                Ok(()) => n += 1,
                Err(e) => eprintln!("dav: {source}: an event left out ({e})"),
            }
        }
        Ok(n)
    }

    fn rows(&self, sql: &str, p: &[&dyn rusqlite::ToSql]) -> Vec<Object> {
        let db = self.db();
        let Ok(mut q) = db.prepare(sql) else { return vec![] };
        q.query_map(p, |r| {
            Ok(Object { source: r.get(0)?, href: r.get(1)?, etag: r.get(2)?, uid: r.get(3)?, ics: r.get(4)? })
        })
        .map(|r| r.flatten().collect())
        .unwrap_or_default()
    }

    /// The objects of these sources that may have events between two instants (unix seconds).
    pub fn in_range(&self, sources: &[String], from: i64, to: i64) -> Vec<Object> {
        let mut out = Vec::new();
        for s in sources {
            out.extend(self.rows(
                "SELECT source, href, etag, uid, ics FROM objects WHERE source = ?1 AND lo < ?3 AND (hi IS NULL OR hi > ?2)",
                &[s, &from, &to],
            ));
        }
        out
    }

    pub fn by_uid(&self, uid: &str) -> Vec<Object> {
        self.rows("SELECT source, href, etag, uid, ics FROM objects WHERE uid = ?1", &[&uid])
    }

    pub fn object(&self, source: &str, href: &str) -> Option<Object> {
        self.rows("SELECT source, href, etag, uid, ics FROM objects WHERE source = ?1 AND href = ?2", &[&source, &href]).pop()
    }

    /// Objects whose title, place or description holds every word of `q`.
    pub fn search(&self, sources: &[String], q: &str, limit: usize) -> Vec<Object> {
        let words: Vec<String> = q.split_whitespace().map(|w| format!("%{}%", w.to_lowercase().replace(['%', '_'], ""))).collect();
        if words.is_empty() {
            return vec![];
        }
        let mut out: Vec<Object> = Vec::new();
        for s in sources {
            let cond = (0..words.len()).map(|i| format!("words LIKE ?{}", i + 2)).collect::<Vec<_>>().join(" AND ");
            let sql = format!("SELECT source, href, etag, uid, ics FROM objects WHERE source = ?1 AND {cond} LIMIT {limit}");
            let mut p: Vec<&dyn rusqlite::ToSql> = vec![s];
            p.extend(words.iter().map(|w| w as &dyn rusqlite::ToSql));
            out.extend(self.rows(&sql, &p));
        }
        out.truncate(limit);
        out
    }

    // ----- contacts

    pub fn put_contacts(&self, book: &str, cards: &[(String, Option<String>, Contact)]) -> Result<(), String> {
        let mut db = self.db();
        let tx = db.transaction().map_err(err)?;
        tx.execute("DELETE FROM contacts WHERE book = ?1", params![book]).map_err(err)?;
        for (href, etag, c) in cards {
            tx.execute(
                "INSERT OR REPLACE INTO contacts (book, href, etag, name, emails, org) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                params![book, href, etag, c.name, serde_json::to_string(&c.emails).unwrap_or_default(), c.org],
            )
            .map_err(err)?;
        }
        tx.commit().map_err(err)
    }

    /// Contacts whose name, address or organisation holds `q` (every one with an address when empty), by name.
    pub fn contacts(&self, q: &str, limit: usize) -> Vec<Contact> {
        let db = self.db();
        let like = format!("%{}%", q.trim().to_lowercase());
        let Ok(mut st) = db.prepare(
            "SELECT name, emails, max(org) FROM contacts WHERE emails != '[]' AND (lower(name) LIKE ?1 OR lower(emails) LIKE ?1 OR lower(coalesce(org, '')) LIKE ?1)
             GROUP BY lower(name), emails ORDER BY CASE WHEN lower(name) LIKE ?2 THEN 0 ELSE 1 END, name LIMIT ?3",
        ) else { return vec![] };
        let prefix = format!("{}%", q.trim().to_lowercase());
        st.query_map(params![like, prefix, limit as i64], |r| {
            let emails: String = r.get(1)?;
            Ok(Contact { name: r.get(0)?, emails: serde_json::from_str(&emails).unwrap_or_default(), org: r.get(2)? })
        })
        .map(|r| r.flatten().collect())
        .unwrap_or_default()
    }

    pub fn contact_count(&self) -> i64 {
        self.db().query_row("SELECT count(*) FROM contacts", [], |r| r.get(0)).optional().ok().flatten().unwrap_or(0)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const EV: &str = "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:a1\r\nSUMMARY:Thesis defence\r\nLOCATION:D3-2041\r\nDTSTART:20261104T150000Z\r\nDTEND:20261104T160000Z\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n";

    #[test]
    fn objects_are_found_by_range_uid_and_words() {
        let s = Store::memory();
        s.put_source(&Source { id: "c1".into(), kind: Kind::Caldav, account: Some("a".into()), url: "https://x.example/c1/".into(), name: "Work".into(), color: None, writable: true, ctag: None, token: None, synced: 0, error: None }).unwrap();
        s.put("c1", "a1.ics", Some("\"e1\""), EV).unwrap();
        let c = vec!["c1".to_string()];
        let t = |d: &str| chrono::DateTime::parse_from_rfc3339(d).unwrap().timestamp();
        assert_eq!(s.in_range(&c, t("2026-11-04T00:00:00Z"), t("2026-11-05T00:00:00Z")).len(), 1);
        assert!(s.in_range(&c, t("2026-11-10T00:00:00Z"), t("2026-11-11T00:00:00Z")).is_empty());
        assert_eq!(s.by_uid("a1")[0].etag.as_deref(), Some("\"e1\""));
        assert_eq!(s.search(&c, "thesis d3", 10).len(), 1);
        assert!(s.search(&c, "thesis lunch", 10).is_empty());
        assert_eq!(s.etags("c1"), vec![("a1.ics".to_string(), Some("\"e1\"".to_string()))]);
        assert_eq!(s.of_account("a").len(), 1);
        s.remove_source("c1");
        assert!(s.by_uid("a1").is_empty() && s.sources().is_empty());
    }

    #[test]
    fn calendar_ids_are_short_and_unique_within_an_account() {
        let a = "https://cal.example.org/caldav/principal/alice/personal/";
        let b = "https://cal.example.org/caldav/principal/team/personal/";
        assert_eq!(calendar_id("home", a, &[a]), "home/personal");
        assert_eq!(calendar_id("home", a, &[a, b]), "home/caldav/principal/alice/personal");
        assert_eq!(calendar_id("work", a, &[a]), "work/personal", "the account tells two servers' calendars apart");
    }

    #[test]
    fn contacts_are_searched_by_name_address_or_org() {
        let s = Store::memory();
        let c = |n: &str, e: &str| Contact { name: n.into(), emails: vec![e.into()], org: Some("Physics".into()) };
        s.put_contacts("b", &[("1".into(), None, c("Ana Ruiz", "ana@example.org")), ("2".into(), None, c("Bo Lee", "bo@example.net"))]).unwrap();
        assert_eq!(s.contacts("ana", 10)[0].name, "Ana Ruiz");
        assert_eq!(s.contacts("example.net", 10)[0].name, "Bo Lee");
        assert_eq!(s.contacts("", 10).len(), 2);
        assert_eq!(s.contacts("physics", 1).len(), 1);
        // the same card in a second address book is one contact
        s.put_contacts("b2", &[("9".into(), None, c("Ana Ruiz", "ana@example.org"))]).unwrap();
        assert_eq!(s.contacts("ana", 10).len(), 1);
    }
}
