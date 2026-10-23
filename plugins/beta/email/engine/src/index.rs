//! The local index (DESIGN-mail-ui §5): what the servers hold, kept in SQLite so the list, counts, conversations,
//! search and the address book answer at once. Only a cache — deleting it loses nothing; the next sync rebuilds it.
//! One file per vault: `<plugin cache>/index.sqlite`.

use crate::parse::{self, Envelope, Person};
use rusqlite::{params, params_from_iter, Connection, OptionalExtension, Transaction};
use serde::Serialize;
use std::collections::{BTreeMap, HashSet};
use std::path::Path;
use std::sync::Mutex;

/// Bumped when the schema changes: an older index is dropped and synced again (it is only a cache).
const SCHEMA: i64 = 3;

pub struct Index {
    db: Mutex<Connection>,
}

/// A folder of an account, as the sidebar and the sync need it.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Folder {
    pub account: String,
    /// what the server calls it (modified UTF-7 decoded already? no: kept raw, the server's own name)
    pub path: String,
    /// what people read: "Sent Mail", "Envoyés"
    pub label: String,
    pub role: Option<String>,
    pub delimiter: Option<String>,
    pub uidvalidity: u32,
    pub uidnext: u32,
    pub modseq: u64,
    pub unread: i64,
    pub total: i64,
}

/// One message row, as the reader and the list need it.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Msg {
    pub id: i64,
    pub account: String,
    pub folder: String,
    pub uid: u32,
    pub thread: i64,
    pub message_id: String,
    pub subject: String,
    pub from: Vec<Person>,
    pub to: Vec<Person>,
    pub cc: Vec<Person>,
    pub reply_to: Vec<Person>,
    pub date: i64,
    pub size: i64,
    pub seen: bool,
    pub flagged: bool,
    pub answered: bool,
    pub draft: bool,
    /// keywords and Gmail labels people gave it (not the system's flags)
    pub labels: Vec<String>,
    pub kind: String,
    pub has_attachments: bool,
    pub snippet: String,
    pub in_reply_to: Vec<String>,
    pub references: Vec<String>,
    pub unsubscribe: Option<serde_json::Value>,
    /// the body is in the cache: the reader opens it without the server
    pub cached: bool,
}

/// A message's flags as the server says them now: (uid, flags, Gmail labels when Gmail).
pub type FlagUpdate = (u32, Vec<String>, Option<Vec<String>>);

/// What a message is when it arrives from the server.
#[derive(Debug, Clone)]
pub struct Incoming {
    pub uid: u32,
    pub flags: Vec<String>,
    pub labels: Vec<String>,
    pub gm_thread: Option<u64>,
    pub size: i64,
    pub envelope: Envelope,
}

/// Which messages a list shows.
#[derive(Debug, Clone, Default)]
pub struct Scope {
    /// (account, folder path) pairs; empty = every folder of every account but trash and junk
    pub folders: Vec<(String, String)>,
    /// an extra SQL condition on `m` with its parameters (search, the quick filters)
    pub filter: Option<(String, Vec<rusqlite::types::Value>)>,
    /// an FTS5 query over subject, people and body
    pub text: Option<String>,
    /// one row per message instead of per conversation
    pub flat: bool,
    /// important (starred) conversations first: the inbox's pinned section
    pub pin: bool,
}

/// A conversation as the list shows it.
#[derive(Debug, Clone, Serialize)]
pub struct Conversation {
    pub thread: i64,
    /// the message the row stands for (the newest one in the scope): opens the reader there
    pub id: i64,
    pub account: String,
    pub folder: String,
    pub subject: String,
    /// the people who wrote in it, oldest first, without repeats
    pub from: Vec<Person>,
    pub count: i64,
    pub unread: i64,
    pub flagged: bool,
    pub has_attachments: bool,
    pub draft: bool,
    pub labels: Vec<String>,
    pub kind: String,
    pub date: i64,
    pub snippet: String,
    /// messages in the conversation whose body is not fetched yet (the list asks for their snippets)
    pub snippet_missing: bool,
}

/// An address the composer offers: how often and how lately mail went to and came from it.
#[derive(Debug, Clone, Serialize)]
pub struct Contact {
    pub name: String,
    pub addr: String,
    pub sent: i64,
    pub received: i64,
    pub last: i64,
}

fn json<T: Serialize>(v: &T) -> String {
    serde_json::to_string(v).unwrap_or_else(|_| "[]".into())
}
fn people(s: &str) -> Vec<Person> {
    serde_json::from_str(s).unwrap_or_default()
}
fn strings(s: &str) -> Vec<String> {
    serde_json::from_str(s).unwrap_or_default()
}

/// Keywords that are the system's, not labels people chose (Thunderbird's, Apple's, spam filters', Atlas's own).
pub fn is_label(k: &str) -> bool {
    let l = k.to_lowercase();
    !(k.starts_with('\\')
        || l.starts_with("$atlas")
        || l.starts_with("$mailflagbit")
        || matches!(l.as_str(), "$forwarded" | "$mdnsent" | "$junk" | "$notjunk" | "junk" | "nonjunk" | "notjunk" | "$phishing" | "$submitpending" | "$submitted" | "forwarded" | "$hasattachment" | "$hasnoattachment" | "$autojunk" | "$autonotjunk" | "$important" | "$label1" | "$label2" | "$label3" | "$label4" | "$label5" | "\\important" | "\\inbox" | "\\sent" | "\\draft" | "\\starred"))
}

impl Index {
    pub fn open(path: &Path) -> Result<Index, String> {
        if let Some(dir) = path.parent() {
            std::fs::create_dir_all(dir).map_err(|e| format!("cannot make {}: {e}", dir.display()))?;
        }
        let db = Connection::open(path).map_err(|e| format!("cannot open the mail index {}: {e}", path.display()))?;
        Self::setup(db)
    }

    pub fn memory() -> Index {
        Self::setup(Connection::open_in_memory().unwrap()).unwrap()
    }

    fn setup(db: Connection) -> Result<Index, String> {
        let e = |e: rusqlite::Error| format!("mail index: {e}");
        db.execute_batch("PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;").map_err(e)?;
        let v: i64 = db.query_row("PRAGMA user_version", [], |r| r.get(0)).map_err(e)?;
        if v != SCHEMA {
            db.execute_batch(
                "DROP TABLE IF EXISTS bodies; DROP TABLE IF EXISTS fts; DROP TABLE IF EXISTS msgids; DROP TABLE IF EXISTS messages;
                 DROP TABLE IF EXISTS threads; DROP TABLE IF EXISTS folders; DROP TABLE IF EXISTS contacts; DROP TABLE IF EXISTS prefs;",
            )
            .map_err(e)?;
            db.execute_batch(&format!(
                "CREATE TABLE folders (account TEXT NOT NULL, path TEXT NOT NULL, label TEXT NOT NULL, role TEXT, delimiter TEXT,
                   uidvalidity INTEGER NOT NULL DEFAULT 0, uidnext INTEGER NOT NULL DEFAULT 0, modseq INTEGER NOT NULL DEFAULT 0,
                   unread INTEGER NOT NULL DEFAULT 0, total INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (account, path));
                 CREATE TABLE threads (id INTEGER PRIMARY KEY, account TEXT NOT NULL, gm INTEGER, subject_key TEXT NOT NULL DEFAULT '', last INTEGER NOT NULL DEFAULT 0);
                 CREATE INDEX threads_gm ON threads(account, gm);
                 CREATE INDEX threads_subject ON threads(account, subject_key, last);
                 CREATE TABLE messages (id INTEGER PRIMARY KEY, account TEXT NOT NULL, folder TEXT NOT NULL, uid INTEGER NOT NULL,
                   thread INTEGER NOT NULL, msgid TEXT NOT NULL, subject TEXT NOT NULL, from_json TEXT NOT NULL, from_addr TEXT NOT NULL,
                   to_json TEXT NOT NULL, cc_json TEXT NOT NULL, reply_to_json TEXT NOT NULL, date INTEGER NOT NULL, size INTEGER NOT NULL,
                   flags TEXT NOT NULL, seen INTEGER NOT NULL, flagged INTEGER NOT NULL, answered INTEGER NOT NULL, draft INTEGER NOT NULL,
                   labels TEXT NOT NULL, kind TEXT NOT NULL, has_att INTEGER NOT NULL, snippet TEXT NOT NULL DEFAULT '',
                   in_reply_to TEXT NOT NULL, refs TEXT NOT NULL, unsub TEXT, list_id TEXT,
                   UNIQUE (account, folder, uid));
                 CREATE INDEX messages_list ON messages(account, folder, date);
                 CREATE INDEX messages_thread ON messages(thread, date);
                 CREATE INDEX messages_msgid ON messages(account, msgid);
                 CREATE INDEX messages_from ON messages(from_addr);
                 CREATE TABLE msgids (account TEXT NOT NULL, msgid TEXT NOT NULL, thread INTEGER NOT NULL, PRIMARY KEY (account, msgid));
                 CREATE INDEX msgids_thread ON msgids(thread);
                 CREATE TABLE bodies (id INTEGER PRIMARY KEY REFERENCES messages(id) ON DELETE CASCADE, raw BLOB NOT NULL, at INTEGER NOT NULL);
                 CREATE VIRTUAL TABLE fts USING fts5(subject, people, body, content='', contentless_delete=1, tokenize='unicode61 remove_diacritics 2');
                 CREATE TABLE contacts (addr TEXT PRIMARY KEY, name TEXT NOT NULL DEFAULT '', sent INTEGER NOT NULL DEFAULT 0,
                   received INTEGER NOT NULL DEFAULT 0, last INTEGER NOT NULL DEFAULT 0);
                 CREATE TABLE prefs (key TEXT PRIMARY KEY, value TEXT NOT NULL);
                 PRAGMA user_version = {SCHEMA};"
            ))
            .map_err(e)?;
        }
        Ok(Index { db: Mutex::new(db) })
    }

    fn db(&self) -> std::sync::MutexGuard<'_, Connection> {
        self.db.lock().unwrap_or_else(|e| e.into_inner())
    }

    // ----- folders

    /// The account's folders as the server listed them now: new ones added, gone ones dropped with their messages,
    /// the sync state of the others kept.
    pub fn set_folders(&self, account: &str, listed: &[(String, String, Option<String>, Option<String>)]) -> Result<(), String> {
        let mut db = self.db();
        let tx = db.transaction().map_err(err)?;
        let have: HashSet<String> = {
            let mut st = tx.prepare("SELECT path FROM folders WHERE account=?1").map_err(err)?;
            let rows = st.query_map([account], |r| r.get::<_, String>(0)).map_err(err)?;
            rows.filter_map(Result::ok).collect()
        };
        let now: HashSet<&String> = listed.iter().map(|f| &f.0).collect();
        for gone in have.iter().filter(|p| !now.contains(p)) {
            drop_folder(&tx, account, gone)?;
        }
        for (path, label, role, delim) in listed {
            tx.execute(
                "INSERT INTO folders(account, path, label, role, delimiter) VALUES (?1,?2,?3,?4,?5)
                 ON CONFLICT(account, path) DO UPDATE SET label=?3, role=?4, delimiter=?5",
                params![account, path, label, role, delim],
            )
            .map_err(err)?;
        }
        tx.commit().map_err(err)
    }

    pub fn folders(&self, account: Option<&str>) -> Vec<Folder> {
        let db = self.db();
        let sql = "SELECT account, path, label, role, delimiter, uidvalidity, uidnext, modseq, unread, total FROM folders WHERE ?1 IS NULL OR account=?1";
        let mut st = db.prepare(sql).unwrap();
        st.query_map([account], |r| {
            Ok(Folder {
                account: r.get(0)?,
                path: r.get(1)?,
                label: r.get(2)?,
                role: r.get(3)?,
                delimiter: r.get(4)?,
                uidvalidity: r.get(5)?,
                uidnext: r.get(6)?,
                modseq: r.get::<_, i64>(7)? as u64,
                unread: r.get(8)?,
                total: r.get(9)?,
            })
        })
        .unwrap()
        .filter_map(Result::ok)
        .collect()
    }

    pub fn folder(&self, account: &str, path: &str) -> Option<Folder> {
        self.folders(Some(account)).into_iter().find(|f| f.path == path)
    }

    /// The account's folder with a role (inbox, sent, drafts, archive, junk, trash, snoozed…).
    pub fn role(&self, account: &str, role: &str) -> Option<Folder> {
        self.folders(Some(account)).into_iter().find(|f| f.role.as_deref() == Some(role))
    }

    /// A folder's UIDVALIDITY changed: every uid it had means nothing now; its messages go and it is synced again.
    pub fn reset_folder(&self, account: &str, path: &str, uidvalidity: u32) -> Result<(), String> {
        let mut db = self.db();
        let tx = db.transaction().map_err(err)?;
        delete_where(&tx, "account=?1 AND folder=?2", params![account, path])?;
        tx.execute("UPDATE folders SET uidvalidity=?3, uidnext=0, modseq=0 WHERE account=?1 AND path=?2", params![account, path, uidvalidity]).map_err(err)?;
        tx.commit().map_err(err)
    }

    pub fn set_sync_state(&self, account: &str, path: &str, uidnext: u32, modseq: u64) -> Result<(), String> {
        self.db()
            .execute("UPDATE folders SET uidnext=?3, modseq=?4 WHERE account=?1 AND path=?2", params![account, path, uidnext, modseq as i64])
            .map(|_| ())
            .map_err(err)
    }

    /// Recount a folder's unread and total from the index.
    pub fn recount(&self, account: &str, path: &str) {
        let _ = self.db().execute(
            "UPDATE folders SET unread=(SELECT count(*) FROM messages WHERE account=?1 AND folder=?2 AND seen=0),
                                total=(SELECT count(*) FROM messages WHERE account=?1 AND folder=?2) WHERE account=?1 AND path=?2",
            params![account, path],
        );
    }

    // ----- messages

    /// The uids the index has for a folder.
    pub fn uids(&self, account: &str, folder: &str) -> Vec<u32> {
        let db = self.db();
        let mut st = db.prepare("SELECT uid FROM messages WHERE account=?1 AND folder=?2 AND uid>0").unwrap();
        st.query_map(params![account, folder], |r| r.get(0)).unwrap().filter_map(Result::ok).collect()
    }

    /// A row's id by its place on the server.
    pub fn id_of(&self, account: &str, folder: &str, uid: u32) -> Option<i64> {
        self.db().query_row("SELECT id FROM messages WHERE account=?1 AND folder=?2 AND uid=?3", params![account, folder, uid], |r| r.get(0)).optional().ok().flatten()
    }

    /// Every row of a folder with its flags as the server wrote them.
    pub fn flags_of_folder(&self, account: &str, folder: &str) -> Vec<(i64, String)> {
        let db = self.db();
        let mut st = db.prepare("SELECT id, flags FROM messages WHERE account=?1 AND folder=?2").unwrap();
        st.query_map(params![account, folder], |r| Ok((r.get(0)?, r.get(1)?))).unwrap().filter_map(Result::ok).collect()
    }

    /// Rows moved here whose uid the server did not say (no COPYUID) and that no sync found: dropped.
    pub fn drop_placeholders(&self, account: &str, folder: &str) -> Result<usize, String> {
        let mut db = self.db();
        let tx = db.transaction().map_err(err)?;
        let n = delete_where(&tx, "account=?1 AND folder=?2 AND uid<=0", params![account, folder])?;
        tx.commit().map_err(err)?;
        Ok(n)
    }

    /// The newest uids of a folder (whose flags a sync without CONDSTORE checks again).
    pub fn newest_uids(&self, account: &str, folder: &str, n: usize) -> Vec<u32> {
        let db = self.db();
        let mut st = db.prepare("SELECT uid FROM messages WHERE account=?1 AND folder=?2 ORDER BY uid DESC LIMIT ?3").unwrap();
        st.query_map(params![account, folder, n as i64], |r| r.get(0)).unwrap().filter_map(Result::ok).collect()
    }

    /// Messages the server has now: each one placed in its conversation; one already known only gets its flags.
    /// Returns the ids of the rows added.
    pub fn add(&self, account: &str, folder: &str, own: &[String], msgs: &[Incoming]) -> Result<Vec<i64>, String> {
        let mut db = self.db();
        let tx = db.transaction().map_err(err)?;
        let mut added = vec![];
        for m in msgs {
            let known: Option<i64> = tx
                .query_row("SELECT id FROM messages WHERE account=?1 AND folder=?2 AND uid=?3", params![account, folder, m.uid], |r| r.get(0))
                .optional()
                .map_err(err)?;
            if let Some(id) = known {
                write_flags(&tx, id, &m.flags, Some(&m.labels))?;
                continue;
            }
            // a row moved here before the server said its uid: it is this one
            let moved: Option<i64> = tx
                .query_row("SELECT id FROM messages WHERE account=?1 AND folder=?2 AND uid<=0 AND msgid=?3 LIMIT 1", params![account, folder, m.envelope.message_id], |r| r.get(0))
                .optional()
                .map_err(err)?;
            if let Some(id) = moved {
                tx.execute("UPDATE messages SET uid=?2 WHERE id=?1", params![id, m.uid]).map_err(err)?;
                write_flags(&tx, id, &m.flags, Some(&m.labels))?;
                continue;
            }
            let e = &m.envelope;
            let thread = thread_for(&tx, account, e, m.gm_thread)?;
            let f = Flags::of(&m.flags);
            tx.execute(
                "INSERT INTO messages(account, folder, uid, thread, msgid, subject, from_json, from_addr, to_json, cc_json, reply_to_json, date, size,
                   flags, seen, flagged, answered, draft, labels, kind, has_att, in_reply_to, refs, unsub, list_id)
                 VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18,?19,?20,?21,?22,?23,?24,?25)",
                params![
                    account,
                    folder,
                    m.uid,
                    thread,
                    e.message_id,
                    e.subject,
                    json(&e.from),
                    e.from.first().map(|p| p.addr.to_lowercase()).unwrap_or_default(),
                    json(&e.to),
                    json(&e.cc),
                    json(&e.reply_to),
                    e.date,
                    m.size,
                    m.flags.join(" "),
                    f.seen,
                    f.flagged,
                    f.answered,
                    f.draft,
                    json(&m.labels),
                    e.kind.as_str(),
                    e.has_attachments,
                    json(&e.in_reply_to),
                    json(&e.references),
                    e.unsubscribe.as_ref().map(json),
                    e.list_id,
                ],
            )
            .map_err(err)?;
            let id = tx.last_insert_rowid();
            tx.execute("INSERT INTO fts(rowid, subject, people, body) VALUES (?1, ?2, ?3, '')", params![id, e.subject, people_text(e)]).map_err(err)?;
            tx.execute("UPDATE threads SET last=max(last, ?2) WHERE id=?1", params![thread, e.date]).map_err(err)?;
            contacts_seen(&tx, e, own)?;
            added.push(id);
        }
        tx.commit().map_err(err)?;
        Ok(added)
    }

    /// New flags for messages of a folder, by uid (what the server says now).
    pub fn set_flags(&self, account: &str, folder: &str, flags: &[FlagUpdate]) -> Result<Vec<i64>, String> {
        let mut db = self.db();
        let tx = db.transaction().map_err(err)?;
        let mut changed = vec![];
        for (uid, f, labels) in flags {
            let row: Option<(i64, String)> = tx
                .query_row("SELECT id, flags FROM messages WHERE account=?1 AND folder=?2 AND uid=?3", params![account, folder, uid], |r| Ok((r.get(0)?, r.get(1)?)))
                .optional()
                .map_err(err)?;
            if let Some((id, was)) = row {
                if was != f.join(" ") || labels.is_some() {
                    write_flags(&tx, id, f, labels.as_ref())?;
                    changed.push(id);
                }
            }
        }
        tx.commit().map_err(err)?;
        Ok(changed)
    }

    /// One flag set or cleared on rows by id (the pane's actions, at once, before the server answers).
    pub fn flag(&self, ids: &[i64], flag: &str, on: bool) -> Result<(), String> {
        let mut db = self.db();
        let tx = db.transaction().map_err(err)?;
        for id in ids {
            let was: Option<String> = tx.query_row("SELECT flags FROM messages WHERE id=?1", [id], |r| r.get(0)).optional().map_err(err)?;
            let Some(was) = was else { continue };
            let mut f: Vec<String> = was.split_whitespace().map(String::from).filter(|x| !x.eq_ignore_ascii_case(flag)).collect();
            if on {
                f.push(flag.to_string());
            }
            write_flags(&tx, *id, &f, None)?;
        }
        tx.commit().map_err(err)
    }

    /// The Gmail labels of rows changed (elsewhere labels are keywords: [`Index::flag`]).
    pub fn set_labels(&self, ids: &[i64], add: &[String], remove: &[String]) -> Result<(), String> {
        let db = self.db();
        for id in ids {
            let was: Option<String> = db.query_row("SELECT labels FROM messages WHERE id=?1", [id], |r| r.get(0)).optional().map_err(err)?;
            let mut l = strings(&was.unwrap_or_default());
            l.retain(|x| !remove.contains(x));
            l.extend(add.iter().filter(|a| !l.contains(a)).cloned().collect::<Vec<_>>());
            l.sort();
            db.execute("UPDATE messages SET labels=?2 WHERE id=?1", params![id, json(&l)]).map_err(err)?;
        }
        Ok(())
    }

    /// Messages gone from a folder on the server.
    pub fn remove(&self, account: &str, folder: &str, uids: &[u32]) -> Result<usize, String> {
        let mut db = self.db();
        let tx = db.transaction().map_err(err)?;
        let mut n = 0;
        for u in uids {
            n += delete_where(&tx, "account=?1 AND folder=?2 AND uid=?3", params![account, folder, u])?;
        }
        tx.commit().map_err(err)?;
        Ok(n)
    }

    pub fn remove_ids(&self, ids: &[i64]) -> Result<(), String> {
        let mut db = self.db();
        let tx = db.transaction().map_err(err)?;
        for id in ids {
            delete_where(&tx, "id=?1", params![id])?;
        }
        tx.commit().map_err(err)
    }

    /// A row moved: its folder and uid follow (the uid the server gave it there, when it said: COPYUID).
    pub fn moved(&self, id: i64, folder: &str, uid: Option<u32>) -> Result<(), String> {
        let db = self.db();
        // a placeholder uid until the next sync finds it: negative, so it never meets a real one
        let uid: i64 = uid.map(i64::from).unwrap_or(-id);
        let clash: Option<i64> = db
            .query_row("SELECT id FROM messages WHERE account=(SELECT account FROM messages WHERE id=?1) AND folder=?2 AND uid=?3", params![id, folder, uid], |r| r.get(0))
            .optional()
            .map_err(err)?;
        if let Some(other) = clash.filter(|o| *o != id) {
            // the sync was quicker and added it there already: that row stands, this one goes
            drop(db);
            return self.remove_ids(&[other]).and_then(|_| self.moved(id, folder, Some(uid as u32)));
        }
        db.execute("UPDATE messages SET folder=?2, uid=?3 WHERE id=?1", params![id, folder, uid]).map(|_| ()).map_err(err)
    }

    pub fn msg(&self, id: i64) -> Option<Msg> {
        self.msgs_where("m.id=?1", vec![id.into()]).into_iter().next()
    }

    /// Every message of a conversation, oldest first; trash and junk only when asked (or when that is all it has).
    pub fn thread(&self, thread: i64, with_trash: bool) -> Vec<Msg> {
        let all = self.dedupe(self.msgs_where("m.thread=?1", vec![thread.into()]));
        if with_trash {
            return all;
        }
        let bin = self.bin_folders();
        let kept: Vec<Msg> = all.iter().filter(|m| !bin.contains(&(m.account.clone(), m.folder.clone()))).cloned().collect();
        if kept.is_empty() { all } else { kept }
    }

    /// Rows by message id in an account (to find a message again after a move, or for a reply's parent).
    pub fn by_message_id(&self, account: &str, msgid: &str) -> Vec<Msg> {
        self.msgs_where("m.account=?1 AND m.msgid=?2", vec![account.to_string().into(), msgid.to_string().into()])
    }

    fn msgs_where(&self, cond: &str, args: Vec<rusqlite::types::Value>) -> Vec<Msg> {
        let db = self.db();
        let sql = format!(
            "SELECT m.id, m.account, m.folder, m.uid, m.thread, m.msgid, m.subject, m.from_json, m.to_json, m.cc_json, m.reply_to_json, m.date, m.size,
                    m.seen, m.flagged, m.answered, m.draft, m.labels, m.kind, m.has_att, m.snippet, m.in_reply_to, m.refs, m.unsub,
                    EXISTS(SELECT 1 FROM bodies b WHERE b.id=m.id), m.flags
             FROM messages m WHERE {cond} ORDER BY m.date, m.id"
        );
        let mut st = db.prepare(&sql).unwrap();
        st.query_map(params_from_iter(args), msg_row).unwrap().filter_map(Result::ok).collect()
    }

    /// One row per message: Gmail shows a message in every label it has (its inbox and All Mail), so a conversation
    /// would count it twice. The copy outside All Mail stands for it (its folder is where actions act).
    fn dedupe(&self, msgs: Vec<Msg>) -> Vec<Msg> {
        if msgs.len() < 2 {
            return msgs;
        }
        let all: HashSet<(String, String)> = self.folders(None).into_iter().filter(|f| f.role.as_deref() == Some("all")).map(|f| (f.account, f.path)).collect();
        let mut out: Vec<Msg> = vec![];
        for m in msgs {
            match out.iter().position(|x| x.account == m.account && x.message_id == m.message_id) {
                Some(i) => {
                    if all.contains(&(out[i].account.clone(), out[i].folder.clone())) && !all.contains(&(m.account.clone(), m.folder.clone())) {
                        out[i] = m;
                    }
                }
                None => out.push(m),
            }
        }
        out
    }

    /// The trash and junk folders of every account (what conversations and lists leave out).
    pub fn bin_folders(&self) -> HashSet<(String, String)> {
        self.folders(None).into_iter().filter(|f| matches!(f.role.as_deref(), Some("trash" | "junk"))).map(|f| (f.account, f.path)).collect()
    }

    // ----- bodies

    pub fn body(&self, id: i64) -> Option<Vec<u8>> {
        self.db().query_row("SELECT raw FROM bodies WHERE id=?1", [id], |r| r.get(0)).optional().ok().flatten()
    }

    /// A body fetched: kept, and what it says goes into the row (snippet, attachments) and the search index.
    pub fn set_body(&self, id: i64, raw: &[u8]) -> Result<(), String> {
        let body = parse::body(raw);
        let text = body.as_ref().map(|b| b.text.clone()).unwrap_or_default();
        let snippet = body.as_ref().map(|b| parse::preview(b, 200)).unwrap_or_default();
        let has_att = body.as_ref().is_some_and(|b| b.attachments.iter().any(|a| !a.inline));
        let mut db = self.db();
        let tx = db.transaction().map_err(err)?;
        let row: Option<(String, String, String, String)> = tx
            .query_row("SELECT subject, from_json, to_json, cc_json FROM messages WHERE id=?1", [id], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)))
            .optional()
            .map_err(err)?;
        let Some((subject, from, to, cc)) = row else { return Ok(()) };
        tx.execute("INSERT OR REPLACE INTO bodies(id, raw, at) VALUES (?1, ?2, strftime('%s','now'))", params![id, raw]).map_err(err)?;
        tx.execute("UPDATE messages SET snippet=?2, has_att=?3 WHERE id=?1", params![id, snippet, has_att]).map_err(err)?;
        let ppl = [people(&from), people(&to), people(&cc)].concat().iter().map(|p| format!("{} {}", p.name, p.addr)).collect::<Vec<_>>().join(" ");
        tx.execute("DELETE FROM fts WHERE rowid=?1", [id]).map_err(err)?;
        tx.execute("INSERT INTO fts(rowid, subject, people, body) VALUES (?1, ?2, ?3, ?4)", params![id, subject, ppl, text]).map_err(err)?;
        tx.commit().map_err(err)
    }

    /// Conversations a message names by id (In-Reply-To, References) but Gmail's thread ids kept apart, joined — once
    /// per index (`threads_version`). → how many were folded in.
    pub fn rejoin(&self) -> usize {
        if self.pref("threads_version").is_some_and(|v| v == "2") {
            return 0;
        }
        let mut db = self.db();
        let Ok(tx) = db.transaction() else { return 0 };
        let pairs: Vec<(i64, i64)> = {
            let q = "SELECT DISTINCT m.thread, i.thread FROM messages m, json_each(m.in_reply_to) j
                     JOIN msgids i ON i.account=m.account AND i.msgid=j.value
                     JOIN threads a ON a.id=m.thread JOIN threads b ON b.id=i.thread
                     WHERE m.thread != i.thread AND (a.subject_key = b.subject_key OR a.subject_key='' OR b.subject_key='')";
            match tx.prepare(q) {
                Ok(mut st) => st.query_map([], |r| Ok((r.get(0)?, r.get(1)?))).map(|r| r.filter_map(Result::ok).collect()).unwrap_or_default(),
                Err(_) => vec![],
            }
        };
        // union-find over the pairs: each group folded into its oldest conversation
        let mut root: std::collections::HashMap<i64, i64> = std::collections::HashMap::new();
        fn find(root: &mut std::collections::HashMap<i64, i64>, x: i64) -> i64 {
            let p = *root.get(&x).unwrap_or(&x);
            if p == x { x } else { let r = find(root, p); root.insert(x, r); r }
        }
        for (a, b) in &pairs {
            let (ra, rb) = (find(&mut root, *a), find(&mut root, *b));
            if ra != rb {
                root.insert(ra.max(rb), ra.min(rb));
            }
        }
        let mut n = 0;
        let keys: Vec<i64> = root.keys().copied().collect();
        for t in keys {
            let r = find(&mut root, t);
            if r != t && join(&tx, r, &[t]).is_ok() {
                n += 1;
            }
        }
        if tx.commit().is_err() {
            return 0;
        }
        drop(db);
        self.set_pref("threads_version", "2");
        n
    }

    /// Kept bodies read again when the parser has changed (`parse::VERSION`): previews and the search's text follow
    /// it with no trip to a server. → how many were read again.
    pub fn reparse(&self) -> usize {
        let have = self.pref("parse_version").and_then(|v| v.parse::<u32>().ok()).unwrap_or(1);
        if have >= parse::VERSION {
            return 0;
        }
        let ids: Vec<i64> = {
            let db = self.db();
            let mut st = match db.prepare("SELECT id FROM bodies") { Ok(s) => s, Err(_) => return 0 };
            st.query_map([], |r| r.get(0)).map(|r| r.filter_map(Result::ok).collect()).unwrap_or_default()
        };
        let mut n = 0;
        for id in ids {
            let raw: Option<Vec<u8>> = self.db().query_row("SELECT raw FROM bodies WHERE id=?1", [id], |r| r.get(0)).optional().ok().flatten();
            if let Some(raw) = raw {
                if self.set_body(id, &raw).is_ok() {
                    n += 1;
                }
            }
        }
        self.set_pref("parse_version", &parse::VERSION.to_string());
        n
    }

    /// Ids of messages whose body is not kept, newest first, among `ids` (or the newest of the account when empty).
    pub fn missing_bodies(&self, account: &str, limit: usize) -> Vec<(i64, String, u32)> {
        let db = self.db();
        let mut st = db
            .prepare(
                "SELECT m.id, m.folder, m.uid FROM messages m WHERE m.account=?1 AND m.uid>0 AND NOT EXISTS(SELECT 1 FROM bodies b WHERE b.id=m.id)
                 AND m.folder NOT IN (SELECT path FROM folders WHERE account=?1 AND role IN ('trash','junk'))
                 ORDER BY m.date DESC LIMIT ?2",
            )
            .unwrap();
        st.query_map(params![account, limit as i64], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?))).unwrap().filter_map(Result::ok).collect()
    }

    /// Keep the body cache under `max_bytes`: the oldest messages' bodies go first.
    pub fn prune_bodies(&self, max_bytes: i64) -> Result<usize, String> {
        let db = self.db();
        let total: i64 = db.query_row("SELECT coalesce(sum(length(raw)),0) FROM bodies", [], |r| r.get(0)).map_err(err)?;
        if total <= max_bytes {
            return Ok(0);
        }
        let mut st = db.prepare("SELECT b.id, length(b.raw) FROM bodies b JOIN messages m ON m.id=b.id ORDER BY m.date").map_err(err)?;
        let rows: Vec<(i64, i64)> = st.query_map([], |r| Ok((r.get(0)?, r.get(1)?))).map_err(err)?.filter_map(Result::ok).collect();
        let (mut over, mut n) = (total - max_bytes, 0);
        for (id, len) in rows {
            if over <= 0 {
                break;
            }
            db.execute("DELETE FROM bodies WHERE id=?1", [id]).map_err(err)?;
            over -= len;
            n += 1;
        }
        Ok(n)
    }

    // ----- lists

    /// Conversations (or messages, `flat`) in a scope, newest first.
    pub fn list(&self, scope: &Scope, limit: usize, offset: usize) -> Vec<Conversation> {
        let (cond, args) = self.scope_sql(scope);
        let db = self.db();
        let group = if scope.flat { "m.id" } else { "m.thread" };
        let sql = format!(
            "WITH f AS (SELECT {group} AS k, max(m.date) AS d, max(m.id) AS newest, {pin} AS p FROM messages m WHERE {cond} GROUP BY {group} ORDER BY p DESC, d DESC, newest DESC LIMIT {limit} OFFSET {offset})
             SELECT f.k, f.newest FROM f ORDER BY f.p DESC, f.d DESC, f.newest DESC",
            pin = if scope.pin { "max(m.flagged)" } else { "0" }
        );
        let mut st = match db.prepare(&sql) {
            Ok(s) => s,
            Err(_) => return vec![],
        };
        let keys: Vec<(i64, i64)> = st.query_map(params_from_iter(args), |r| Ok((r.get(0)?, r.get(1)?))).map(|r| r.filter_map(Result::ok).collect()).unwrap_or_default();
        drop(st);
        drop(db);
        let bin = self.bin_folders();
        let in_bin = scope.folders.iter().any(|f| bin.contains(f));
        keys.into_iter()
            .filter_map(|(k, newest)| {
                let msgs = if scope.flat { self.msg(k).into_iter().collect() } else { self.dedupe(self.msgs_where("m.thread=?1", vec![k.into()])) };
                let msgs: Vec<Msg> = msgs.into_iter().filter(|m| in_bin || !bin.contains(&(m.account.clone(), m.folder.clone())) || m.id == newest).collect();
                conversation(&msgs, newest)
            })
            .collect()
    }

    /// How many conversations a scope holds, and how many of them are unread.
    pub fn count(&self, scope: &Scope) -> (i64, i64) {
        let (cond, args) = self.scope_sql(scope);
        let db = self.db();
        let group = if scope.flat { "m.id" } else { "m.thread" };
        let sql = format!("SELECT count(DISTINCT {group}), count(DISTINCT CASE WHEN m.seen=0 THEN {group} END) FROM messages m WHERE {cond}");
        db.query_row(&sql, params_from_iter(args), |r| Ok((r.get(0)?, r.get(1)?))).unwrap_or((0, 0))
    }

    fn scope_sql(&self, scope: &Scope) -> (String, Vec<rusqlite::types::Value>) {
        let mut cond = vec![];
        let mut args: Vec<rusqlite::types::Value> = vec![];
        if scope.folders.is_empty() {
            cond.push("m.folder NOT IN (SELECT path FROM folders f WHERE f.account=m.account AND f.role IN ('trash','junk'))".to_string());
        } else {
            let mut alts = vec![];
            for (a, f) in &scope.folders {
                args.push(a.clone().into());
                args.push(f.clone().into());
                alts.push(format!("(m.account=?{} AND m.folder=?{})", args.len() - 1, args.len()));
            }
            cond.push(format!("({})", alts.join(" OR ")));
        }
        if let Some((c, a)) = &scope.filter {
            // the filter numbers its parameters from 1: shift them after ours
            let base = args.len();
            let shifted = regex::Regex::new(r"\?(\d+)").unwrap().replace_all(c, |m: &regex::Captures| format!("?{}", m[1].parse::<usize>().unwrap() + base));
            cond.push(format!("({shifted})"));
            args.extend(a.iter().cloned());
        }
        if let Some(t) = scope.text.as_ref().filter(|t| !t.trim().is_empty()) {
            args.push(t.clone().into());
            cond.push(format!("m.id IN (SELECT rowid FROM fts WHERE fts MATCH ?{})", args.len()));
        }
        (cond.join(" AND "), args)
    }

    /// A card renamed: its rows follow.
    pub fn rename_account(&self, from: &str, to: &str) -> Result<(), String> {
        let mut db = self.db();
        let tx = db.transaction().map_err(err)?;
        for t in ["folders", "messages", "threads", "msgids"] {
            tx.execute(&format!("UPDATE {t} SET account=?2 WHERE account=?1"), params![from, to]).map_err(err)?;
        }
        tx.commit().map_err(err)
    }

    // ----- the address book

    /// Addresses that start with (or whose name has a word starting with) `q`, the most used first.
    pub fn contacts(&self, q: &str, limit: usize) -> Vec<Contact> {
        let db = self.db();
        let like = format!("{}%", q.to_lowercase().replace(['%', '_'], ""));
        let word = format!("% {}", like);
        let mut st = db
            .prepare(
                "SELECT name, addr, sent, received, last FROM contacts
                 WHERE addr LIKE ?1 OR lower(name) LIKE ?1 OR lower(name) LIKE ?2
                 ORDER BY (sent * 4 + received) * 1.0 / (1 + (strftime('%s','now') - last) / 2592000.0) DESC LIMIT ?3",
            )
            .unwrap();
        st.query_map(params![like, word, limit as i64], |r| Ok(Contact { name: r.get(0)?, addr: r.get(1)?, sent: r.get(2)?, received: r.get(3)?, last: r.get(4)? }))
            .unwrap()
            .filter_map(Result::ok)
            .collect()
    }

    // ----- small settings the pane keeps per vault (remote images allowed per sender)

    pub fn pref(&self, key: &str) -> Option<String> {
        self.db().query_row("SELECT value FROM prefs WHERE key=?1", [key], |r| r.get(0)).optional().ok().flatten()
    }
    pub fn set_pref(&self, key: &str, value: &str) {
        let _ = self.db().execute("INSERT OR REPLACE INTO prefs(key, value) VALUES (?1, ?2)", params![key, value]);
    }
}

fn err(e: rusqlite::Error) -> String {
    format!("mail index: {e}")
}

fn people_text(e: &Envelope) -> String {
    e.from.iter().chain(&e.to).chain(&e.cc).map(|p| format!("{} {}", p.name, p.addr)).collect::<Vec<_>>().join(" ")
}

struct Flags {
    seen: bool,
    flagged: bool,
    answered: bool,
    draft: bool,
}
impl Flags {
    fn of(f: &[String]) -> Flags {
        let has = |x: &str| f.iter().any(|y| y.eq_ignore_ascii_case(x));
        Flags { seen: has("\\Seen"), flagged: has("\\Flagged"), answered: has("\\Answered"), draft: has("\\Draft") }
    }
}

fn write_flags(tx: &Transaction, id: i64, flags: &[String], gm_labels: Option<&Vec<String>>) -> Result<(), String> {
    let f = Flags::of(flags);
    tx.execute(
        "UPDATE messages SET flags=?2, seen=?3, flagged=?4, answered=?5, draft=?6 WHERE id=?1",
        params![id, flags.join(" "), f.seen, f.flagged, f.answered, f.draft],
    )
    .map_err(err)?;
    if let Some(l) = gm_labels {
        tx.execute("UPDATE messages SET labels=?2 WHERE id=?1", params![id, json(l)]).map_err(err)?;
    }
    Ok(())
}

/// A row's labels: its Gmail labels and its keywords (the flags people chose), without the system's.
fn labels_of(gm: &str, flags: &str) -> Vec<String> {
    let mut l: Vec<String> = strings(gm).into_iter().chain(flags.split_whitespace().map(String::from)).filter(|x| is_label(x)).collect();
    l.sort();
    l.dedup();
    l
}

fn delete_where(tx: &Transaction, cond: &str, args: impl rusqlite::Params + Clone) -> Result<usize, String> {
    tx.execute(&format!("DELETE FROM fts WHERE rowid IN (SELECT id FROM messages WHERE {cond})"), args.clone()).map_err(err)?;
    tx.execute(&format!("DELETE FROM messages WHERE {cond}"), args).map_err(err)
}

fn drop_folder(tx: &Transaction, account: &str, path: &str) -> Result<(), String> {
    delete_where(tx, "account=?1 AND folder=?2", params![account, path])?;
    tx.execute("DELETE FROM folders WHERE account=?1 AND path=?2", params![account, path]).map_err(err)?;
    Ok(())
}

fn msg_row(r: &rusqlite::Row) -> rusqlite::Result<Msg> {
    Ok(Msg {
        id: r.get(0)?,
        account: r.get(1)?,
        folder: r.get(2)?,
        uid: r.get::<_, i64>(3)?.max(0) as u32,
        thread: r.get(4)?,
        message_id: r.get(5)?,
        subject: r.get(6)?,
        from: people(&r.get::<_, String>(7)?),
        to: people(&r.get::<_, String>(8)?),
        cc: people(&r.get::<_, String>(9)?),
        reply_to: people(&r.get::<_, String>(10)?),
        date: r.get(11)?,
        size: r.get(12)?,
        seen: r.get(13)?,
        flagged: r.get(14)?,
        answered: r.get(15)?,
        draft: r.get(16)?,
        labels: labels_of(&r.get::<_, String>(17)?, &r.get::<_, String>(25)?),
        kind: r.get(18)?,
        has_attachments: r.get(19)?,
        snippet: r.get(20)?,
        in_reply_to: strings(&r.get::<_, String>(21)?),
        references: strings(&r.get::<_, String>(22)?),
        unsubscribe: r.get::<_, Option<String>>(23)?.and_then(|u| serde_json::from_str(&u).ok()),
        cached: r.get(24)?,
    })
}

/// A list row from a conversation's messages (oldest first); `newest`: the message the row stands for.
fn conversation(msgs: &[Msg], newest: i64) -> Option<Conversation> {
    let last = msgs.iter().find(|m| m.id == newest).or(msgs.last())?;
    let mut from: Vec<Person> = vec![];
    for m in msgs {
        for p in m.from.iter().take(1) {
            if !from.iter().any(|q| q.addr.eq_ignore_ascii_case(&p.addr)) {
                from.push(p.clone());
            }
        }
    }
    let mut labels: Vec<String> = msgs.iter().flat_map(|m| m.labels.clone()).collect();
    labels.sort();
    labels.dedup();
    // the subject people started with, not the "Re: Re:" of the last answer
    let subject = msgs.iter().find(|m| !m.subject.is_empty()).map(|m| m.subject.clone()).unwrap_or_default();
    let snippet_from = msgs.iter().rev().find(|m| !m.draft).unwrap_or(last);
    Some(Conversation {
        thread: last.thread,
        id: last.id,
        account: last.account.clone(),
        folder: last.folder.clone(),
        subject,
        from,
        count: msgs.len() as i64,
        unread: msgs.iter().filter(|m| !m.seen).count() as i64,
        flagged: msgs.iter().any(|m| m.flagged),
        has_attachments: msgs.iter().any(|m| m.has_attachments),
        draft: msgs.iter().any(|m| m.draft),
        labels,
        kind: last.kind.clone(),
        date: msgs.iter().map(|m| m.date).max().unwrap_or(0),
        snippet: snippet_from.snippet.clone(),
        snippet_missing: snippet_from.snippet.is_empty() && !snippet_from.cached,
    })
}

/// The conversation a message belongs to (DESIGN-mail-ui, "threads"):
/// - Gmail says (X-GM-THRID): its thread, nothing else;
/// - else by message ids (its own, In-Reply-To, References): every conversation one of them is known in, merged —
///   but only those whose subject is the same once Re:/Fwd: and list tags are gone (Gmail's rule: a new subject is a
///   new conversation; it keeps one wrong References header from gluing two big conversations together);
/// - else, for a reply with no ids at all (some phones, some web forms), a recent conversation with the same subject
///   and someone in common;
/// - else a new conversation.
///
/// The conversations (and their subject keys) the given message ids are in.
fn threads_named(tx: &Transaction, account: &str, ids: &[&String]) -> Result<BTreeMap<i64, String>, String> {
    let mut found = BTreeMap::new();
    for id in ids {
        let hit: Option<(i64, String)> = tx
            .query_row("SELECT t.id, t.subject_key FROM msgids i JOIN threads t ON t.id=i.thread WHERE i.account=?1 AND i.msgid=?2", params![account, id], |r| Ok((r.get(0)?, r.get(1)?)))
            .optional()
            .map_err(err)?;
        if let Some((t, k)) = hit {
            found.insert(t, k);
        }
    }
    Ok(found)
}

/// Folds conversations into `into` (their messages, ids and latest date); a Gmail thread id they had is kept when
/// `into` has none.
fn join(tx: &Transaction, into: i64, others: &[i64]) -> Result<(), String> {
    for other in others.iter().filter(|o| **o != into) {
        tx.execute("UPDATE messages SET thread=?1 WHERE thread=?2", params![into, other]).map_err(err)?;
        tx.execute("UPDATE msgids SET thread=?1 WHERE thread=?2", params![into, other]).map_err(err)?;
        tx.execute("UPDATE threads SET last=max(last, (SELECT last FROM threads WHERE id=?2)), gm=coalesce(gm, (SELECT gm FROM threads WHERE id=?2)) WHERE id=?1", params![into, other]).map_err(err)?;
        tx.execute("DELETE FROM threads WHERE id=?1", [other]).map_err(err)?;
    }
    Ok(())
}

fn thread_for(tx: &Transaction, account: &str, e: &Envelope, gm: Option<u64>) -> Result<i64, String> {
    let key = parse::thread_subject(&e.subject);
    let mut ids: Vec<&String> = vec![&e.message_id];
    ids.extend(e.in_reply_to.iter());
    ids.extend(e.references.iter());
    let register = |tx: &Transaction, t: i64| -> Result<(), String> {
        for id in &ids {
            tx.execute("INSERT OR IGNORE INTO msgids(account, msgid, thread) VALUES (?1, ?2, ?3)", params![account, id, t]).map_err(err)?;
        }
        // its own id is its own, even when a reply that came first had registered it elsewhere
        tx.execute("UPDATE msgids SET thread=?3 WHERE account=?1 AND msgid=?2", params![account, e.message_id, t]).map_err(err)?;
        Ok(())
    };
    if let Some(g) = gm {
        let t: Option<i64> = tx.query_row("SELECT id FROM threads WHERE account=?1 AND gm=?2", params![account, g as i64], |r| r.get(0)).optional().map_err(err)?;
        let t = match t {
            Some(t) => t,
            None => {
                tx.execute("INSERT INTO threads(account, gm, subject_key, last) VALUES (?1, ?2, ?3, ?4)", params![account, g as i64, key, e.date]).map_err(err)?;
                tx.last_insert_rowid()
            }
        };
        // Gmail's thread ids can split what the ids join (a reply in a thread of its own, seen in the user's mail): a
        // conversation this message names (same subject) is joined to it
        let named = threads_named(tx, account, &ids)?;
        let others: Vec<i64> = named.iter().filter(|(o, k)| **o != t && (k.is_empty() || key.is_empty() || **k == key)).map(|(o, _)| *o).collect();
        join(tx, t, &others)?;
        register(tx, t)?;
        return Ok(t);
    }
    let found = threads_named(tx, account, &ids)?;
    let same: Vec<i64> = found.iter().filter(|(_, k)| k.is_empty() || key.is_empty() || **k == key).map(|(t, _)| *t).collect();
    let t = if let Some(&first) = same.first() {
        join(tx, first, &same[1..])?;
        first
    } else if found.is_empty() && e.in_reply_to.is_empty() && e.references.is_empty() && parse::is_reply_subject(&e.subject) && !key.is_empty() {
        // someone in common: the new sender wrote or was written to there, or one of its senders wrote to this one
        // (never "the user is on both": every mail to the user would match)
        let sender: Vec<String> = e.from.iter().map(|p| p.addr.to_lowercase()).collect();
        let recipients: Vec<String> = e.to.iter().chain(&e.cc).map(|p| p.addr.to_lowercase()).collect();
        let month = 60 * 86400;
        let mut st = tx.prepare("SELECT id FROM threads WHERE account=?1 AND subject_key=?2 AND last > ?3 ORDER BY last DESC LIMIT 5").map_err(err)?;
        let cands: Vec<i64> = st.query_map(params![account, key, e.date - month], |r| r.get(0)).map_err(err)?.filter_map(Result::ok).collect();
        drop(st);
        let mut pick = None;
        for c in cands {
            let mut st = tx.prepare("SELECT from_json, to_json, cc_json FROM messages WHERE thread=?1").map_err(err)?;
            let rows: Vec<(Vec<Person>, Vec<Person>)> = st
                .query_map([c], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?, r.get::<_, String>(2)?)))
                .map_err(err)?
                .filter_map(Result::ok)
                .map(|(f, t, cc)| (people(&f), [people(&t), people(&cc)].concat()))
                .collect();
            let lower = |v: &[Person]| v.iter().map(|p| p.addr.to_lowercase()).collect::<Vec<_>>();
            let common = rows.iter().any(|(from, to)| {
                let (from, to) = (lower(from), lower(to));
                sender.iter().any(|s| from.contains(s) || to.contains(s)) || from.iter().any(|f| recipients.contains(f) && !sender.is_empty() && to.iter().any(|t| sender.contains(t)))
            });
            if common {
                pick = Some(c);
                break;
            }
        }
        match pick {
            Some(c) => c,
            None => new_thread(tx, account, &key, e.date)?,
        }
    } else {
        new_thread(tx, account, &key, e.date)?
    };
    register(tx, t)?;
    Ok(t)
}

fn new_thread(tx: &Transaction, account: &str, key: &str, date: i64) -> Result<i64, String> {
    tx.execute("INSERT INTO threads(account, subject_key, last) VALUES (?1, ?2, ?3)", params![account, key, date]).map_err(err)?;
    Ok(tx.last_insert_rowid())
}

/// The address book learns from every message: whom the user wrote to (sent) and who wrote to them (received).
fn contacts_seen(tx: &Transaction, e: &Envelope, own: &[String]) -> Result<(), String> {
    let mine = e.from.iter().any(|p| own.contains(&p.addr.to_lowercase()));
    let touch = |p: &Person, sent: bool| -> Result<(), String> {
        let a = p.addr.to_lowercase();
        if own.contains(&a) || !a.contains('@') || parse_noreply(&a) {
            return Ok(());
        }
        tx.execute(
            "INSERT INTO contacts(addr, name, sent, received, last) VALUES (?1, ?2, ?3, ?4, ?5)
             ON CONFLICT(addr) DO UPDATE SET name=CASE WHEN ?2<>'' THEN ?2 ELSE name END, sent=sent+?3, received=received+?4, last=max(last, ?5)",
            params![a, p.name, sent as i64, (!sent) as i64, e.date],
        )
        .map_err(err)?;
        Ok(())
    };
    if mine {
        for p in e.to.iter().chain(&e.cc) {
            touch(p, true)?;
        }
    } else {
        for p in &e.from {
            touch(p, false)?;
        }
    }
    Ok(())
}

fn parse_noreply(a: &str) -> bool {
    let local = a.split('@').next().unwrap_or("");
    local.contains("noreply") || local.contains("no-reply") || local.contains("donotreply") || local.contains("do-not-reply") || local.starts_with("notification")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::parse::envelope;

    fn inc(uid: u32, raw: &str, flags: &[&str]) -> Incoming {
        Incoming { uid, flags: flags.iter().map(|s| s.to_string()).collect(), labels: vec![], gm_thread: None, size: raw.len() as i64, envelope: envelope(raw.as_bytes(), None) }
    }
    fn mail(id: &str, subject: &str, irt: &str, refs: &str, from: &str, date: &str) -> String {
        format!("From: {from}\r\nTo: me@x.example\r\nSubject: {subject}\r\nMessage-ID: <{id}>\r\nIn-Reply-To: {irt}\r\nReferences: {refs}\r\nDate: {date}\r\n\r\nbody of {id}\r\n")
    }
    fn setup() -> Index {
        let ix = Index::memory();
        ix.set_folders("a", &[("INBOX".into(), "Inbox".into(), Some("inbox".into()), Some("/".into())), ("Sent".into(), "Sent".into(), Some("sent".into()), None), ("Trash".into(), "Trash".into(), Some("trash".into()), None)]).unwrap();
        ix
    }
    const OWN: &[String] = &[];

    #[test]
    fn replies_join_their_conversation_in_any_order_and_across_folders() {
        let ix = setup();
        // the reply arrives before its parent; my answer sits in Sent
        ix.add("a", "INBOX", OWN, &[inc(2, &mail("b@x", "Re: Plan", "<a@x>", "<a@x>", "Ana <ana@x.example>", "Tue, 15 Sep 2026 11:00:00 +0000"), &["\\Seen"])]).unwrap();
        ix.add("a", "INBOX", OWN, &[inc(1, &mail("a@x", "Plan", "", "", "Bo <bo@x.example>", "Tue, 15 Sep 2026 10:00:00 +0000"), &[])]).unwrap();
        ix.add("a", "Sent", OWN, &[inc(7, &mail("c@x", "RE: Plan", "<b@x>", "<a@x> <b@x>", "me@x.example", "Tue, 15 Sep 2026 12:00:00 +0000"), &["\\Seen"])]).unwrap();
        let inbox = ix.list(&Scope { folders: vec![("a".into(), "INBOX".into())], ..Default::default() }, 50, 0);
        assert_eq!(inbox.len(), 1, "one conversation");
        let c = &inbox[0];
        assert_eq!((c.count, c.unread), (3, 1));
        assert_eq!(c.subject, "Plan", "the subject it started with");
        assert_eq!(c.from.iter().map(|p| p.short()).collect::<Vec<_>>(), vec!["Bo", "Ana", "me"]);
        assert_eq!(ix.thread(c.thread, false).iter().map(|m| m.uid).collect::<Vec<_>>(), vec![1, 2, 7]);
    }

    #[test]
    fn a_new_subject_is_a_new_conversation_even_with_references() {
        let ix = setup();
        ix.add("a", "INBOX", OWN, &[inc(1, &mail("a@x", "Seminar", "", "", "ana@x.example", "Tue, 15 Sep 2026 10:00:00 +0000"), &[])]).unwrap();
        ix.add("a", "INBOX", OWN, &[inc(2, &mail("b@x", "Totally different: budget", "<a@x>", "<a@x>", "ana@x.example", "Tue, 15 Sep 2026 11:00:00 +0000"), &[])]).unwrap();
        assert_eq!(ix.list(&Scope::default(), 50, 0).len(), 2);
    }

    #[test]
    fn a_reply_without_ids_joins_by_subject_only_with_someone_in_common() {
        let ix = setup();
        ix.add("a", "INBOX", OWN, &[inc(1, &mail("a@x", "Dinner", "", "", "ana@x.example", "Tue, 15 Sep 2026 10:00:00 +0000"), &[])]).unwrap();
        ix.add("a", "INBOX", OWN, &[inc(2, &mail("b@x", "Re: Dinner", "", "", "ana@x.example", "Wed, 16 Sep 2026 10:00:00 +0000"), &[])]).unwrap();
        ix.add("a", "INBOX", OWN, &[inc(3, &mail("c@x", "Re: Dinner", "", "", "stranger@y.example", "Wed, 16 Sep 2026 11:00:00 +0000"), &[])]).unwrap();
        let rows = ix.list(&Scope::default(), 50, 0);
        assert_eq!(rows.len(), 2, "{rows:?}");
        assert_eq!(rows.iter().map(|c| c.count).max(), Some(2));
    }

    #[test]
    fn gmail_thread_ids_win() {
        let ix = setup();
        let mut a = inc(1, &mail("a@x", "One", "", "", "ana@x.example", "Tue, 15 Sep 2026 10:00:00 +0000"), &[]);
        a.gm_thread = Some(99);
        let mut b = inc(2, &mail("b@x", "Two", "", "", "bo@x.example", "Tue, 15 Sep 2026 11:00:00 +0000"), &[]);
        b.gm_thread = Some(99);
        b.labels = vec!["\\Inbox".into(), "Work/Physics".into()];
        ix.add("a", "INBOX", OWN, &[a, b]).unwrap();
        let rows = ix.list(&Scope::default(), 50, 0);
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].labels, vec!["Work/Physics"]);
    }

    #[test]
    fn a_reply_gmail_put_in_a_thread_of_its_own_joins_the_one_it_answers() {
        // seen in Gmail: "Re : Research and Internship" (French spacing) named the first mail in In-Reply-To, yet
        // carried another X-GM-THRID; then the account's own answer came in the first thread
        let ix = setup();
        let mut a = inc(1, &mail("first@x", "Research and Internship", "", "", "me@example.org", "Wed, 08 Oct 2025 15:30:00 +0000"), &[]);
        a.gm_thread = Some(496);
        let mut b = inc(2, &mail("reply@x", "Re : Research and Internship", "first@x", "first@x", "fc@uni.example", "Fri, 10 Oct 2025 20:05:00 +0000"), &[]);
        b.gm_thread = Some(878);
        let mut c = inc(3, &mail("again@x", "Re: Re : Research and Internship", "reply@x", "first@x reply@x", "me@example.org", "Fri, 10 Oct 2025 20:55:00 +0000"), &[]);
        c.gm_thread = Some(496);
        ix.add("a", "INBOX", OWN, &[a, b, c]).unwrap();
        let rows = ix.list(&Scope::default(), 50, 0);
        assert_eq!(rows.len(), 1, "{rows:?}");
        assert_eq!(rows[0].count, 3);
        // and a later message of either Gmail thread lands there too
        let mut d = inc(4, &mail("late@x", "Re: Research and Internship", "again@x", "again@x", "fc@uni.example", "Sat, 11 Oct 2025 09:00:00 +0000"), &[]);
        d.gm_thread = Some(878);
        ix.add("a", "INBOX", OWN, &[d]).unwrap();
        assert_eq!(ix.list(&Scope::default(), 50, 0).len(), 1);
    }

    #[test]
    fn a_gmail_message_in_its_inbox_and_all_mail_counts_once() {
        let ix = setup();
        ix.set_folders("a", &[("INBOX".into(), "Inbox".into(), Some("inbox".into()), None), ("[Gmail]/All Mail".into(), "All Mail".into(), Some("all".into()), None)]).unwrap();
        let raw = mail("a@x", "Hi", "", "", "ana@x.example", "Tue, 15 Sep 2026 10:00:00 +0000");
        let mut a = inc(1, &raw, &[]);
        a.gm_thread = Some(5);
        let mut b = inc(9, &raw, &[]);
        b.gm_thread = Some(5);
        ix.add("a", "[Gmail]/All Mail", OWN, &[b]).unwrap();
        ix.add("a", "INBOX", OWN, &[a]).unwrap();
        let rows = ix.list(&Scope::default(), 10, 0);
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].count, 1);
        let t = ix.thread(rows[0].thread, false);
        assert_eq!((t.len(), t[0].folder.as_str()), (1, "INBOX"), "the inbox copy stands for it");
    }

    #[test]
    fn flags_moves_trash_and_counts() {
        let ix = setup();
        let ids = ix.add("a", "INBOX", OWN, &[inc(1, &mail("a@x", "Hi", "", "", "ana@x.example", "Tue, 15 Sep 2026 10:00:00 +0000"), &["$Work"])]).unwrap();
        let scope = Scope { folders: vec![("a".into(), "INBOX".into())], ..Default::default() };
        assert_eq!(ix.count(&scope), (1, 1));
        assert_eq!(ix.msg(ids[0]).unwrap().labels, vec!["$Work"]);
        ix.flag(&ids, "\\Seen", true).unwrap();
        assert_eq!(ix.count(&scope), (1, 0));
        assert_eq!(ix.msg(ids[0]).unwrap().labels, vec!["$Work"], "a keyword survives a flag change");
        ix.moved(ids[0], "Trash", Some(40)).unwrap();
        assert_eq!(ix.count(&scope), (0, 0));
        assert!(ix.list(&Scope::default(), 50, 0).is_empty(), "trash is out of the everything-list");
        let trash = Scope { folders: vec![("a".into(), "Trash".into())], ..Default::default() };
        assert_eq!(ix.list(&trash, 50, 0)[0].id, ids[0]);
        assert_eq!(ix.remove("a", "Trash", &[40]).unwrap(), 1);
        assert!(ix.msg(ids[0]).is_none());
    }

    #[test]
    fn bodies_feed_snippets_and_full_text_search() {
        let ix = setup();
        let raw = mail("a@x", "Cluster time", "", "", "Ana <ana@x.example>", "Tue, 15 Sep 2026 10:00:00 +0000");
        let ids = ix.add("a", "INBOX", OWN, &[inc(1, &raw, &[])]).unwrap();
        let s = |t: &str| Scope { text: Some(t.into()), ..Default::default() };
        assert_eq!(ix.list(&s("cluster"), 10, 0).len(), 1);
        assert_eq!(ix.list(&s("ana"), 10, 0).len(), 1);
        assert!(ix.list(&s("body"), 10, 0).is_empty(), "the body is not known yet");
        assert!(ix.list(&Scope::default(), 1, 0)[0].snippet_missing);
        ix.set_body(ids[0], raw.as_bytes()).unwrap();
        assert_eq!(ix.list(&s("body"), 10, 0).len(), 1);
        assert_eq!(ix.list(&Scope::default(), 1, 0)[0].snippet, "body of a@x");
        assert!(ix.msg(ids[0]).unwrap().cached);
        assert_eq!(ix.prune_bodies(0).unwrap(), 1);
        assert!(!ix.msg(ids[0]).unwrap().cached);
    }

    #[test]
    fn the_address_book_learns_who_i_write_to() {
        let ix = setup();
        let own = vec!["me@x.example".to_string()];
        ix.add("a", "Sent", &own, &[inc(1, "From: me@x.example\r\nTo: Ana Lopez <ana@x.example>\r\nSubject: s\r\nDate: Tue, 15 Sep 2026 10:00:00 +0000\r\n\r\n", &[])]).unwrap();
        ix.add("a", "INBOX", &own, &[inc(2, "From: Bo <bo@x.example>\r\nTo: me@x.example\r\nSubject: s\r\nDate: Tue, 15 Sep 2026 10:00:00 +0000\r\n\r\n", &[])]).unwrap();
        ix.add("a", "INBOX", &own, &[inc(3, "From: noreply@bank.org\r\nTo: me@x.example\r\nSubject: s\r\n\r\n", &[])]).unwrap();
        assert_eq!(ix.contacts("lop", 5).iter().map(|c| c.addr.as_str()).collect::<Vec<_>>(), vec!["ana@x.example"]);
        let all: Vec<String> = ix.contacts("", 5).into_iter().map(|c| c.addr).collect();
        assert_eq!(all, vec!["ana@x.example", "bo@x.example"], "written-to first; no machines");
    }

    #[test]
    fn a_folder_reset_and_a_vanished_folder_take_their_messages() {
        let ix = setup();
        ix.add("a", "INBOX", OWN, &[inc(1, &mail("a@x", "Hi", "", "", "ana@x.example", "Tue, 15 Sep 2026 10:00:00 +0000"), &[])]).unwrap();
        ix.reset_folder("a", "INBOX", 77).unwrap();
        assert!(ix.uids("a", "INBOX").is_empty());
        assert_eq!(ix.folder("a", "INBOX").unwrap().uidvalidity, 77);
        ix.add("a", "Sent", OWN, &[inc(1, &mail("b@x", "Hi", "", "", "me@x.example", "Tue, 15 Sep 2026 10:00:00 +0000"), &[])]).unwrap();
        ix.set_folders("a", &[("INBOX".into(), "Inbox".into(), Some("inbox".into()), None)]).unwrap();
        assert!(ix.uids("a", "Sent").is_empty());
        assert_eq!(ix.folders(Some("a")).len(), 1);
    }
}
