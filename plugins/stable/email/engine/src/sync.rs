//! Keeping the index in step with the servers (DESIGN-mail-ui §5, REFACTOR-email-rust "Sync"):
//! - a folder: its UIDVALIDITY checked (a change means every uid is new: the folder is read again), the uids the
//!   server has compared with the index's (gone ones removed, new ones' headers fetched newest first, in batches),
//!   flags brought up to date (CONDSTORE: only what changed since the last MODSEQ; without it the newest 500, and all
//!   of them every tenth round). A folder whose UIDNEXT, MODSEQ and count did not move is not asked anything more;
//! - an account: its folder list, then the inbox, sent, drafts and archive before the rest; then the bodies of the
//!   newest messages (snippets, search, reading offline), the cache kept under its size;
//! - live: one connection per account IDLEs on the inbox (a new message syncs it at once), and every account is synced
//!   whole every few minutes (`check_every`). Without IDLE the inbox is polled every two minutes.

use crate::account::Account;
use crate::imap::Imap;
use crate::index::Folder;
use crate::mail::Mail;
use serde_json::json;
use std::collections::HashSet;
use std::sync::Arc;
use std::time::Duration;

/// What a sync of an account did.
#[derive(Debug, Default, Clone, serde::Serialize)]
pub struct Report {
    pub folders: usize,
    pub added: usize,
    pub removed: usize,
    pub flagged: usize,
    /// new unread mail in the inbox (after the first sync of the account): what a notice tells
    pub new: Vec<i64>,
    pub errors: Vec<String>,
}

const BATCH: usize = 250;
const FLAG_WINDOW: usize = 500;

/// The order folders are synced in: what people look at first.
fn rank(role: Option<&str>) -> u8 {
    match role {
        Some("inbox") => 0,
        Some("sent") => 1,
        Some("drafts") => 2,
        Some("archive") => 3,
        Some("snoozed" | "unimportant") => 4,
        None => 5,
        Some("junk" | "trash") => 6,
        Some("all") => 7,
        _ => 8,
    }
}

/// Folders that hold no mail of their own to index: Exchange's other stores, Gmail's views.
fn indexed(role: Option<&str>) -> bool {
    !matches!(role, Some("other" | "view"))
}

/// Syncs an account: every folder, or only `only` (paths). Skipped when a sync of it runs already.
pub async fn account(m: &Mail, acc: &Account, only: Option<&[String]>) -> Result<Report, String> {
    if !m.begin_sync(&acc.name) {
        return Ok(Report::default());
    }
    m.event("status", json!({ "account": acc.name, "state": "syncing" }));
    let mut r = account_inner(m, acc, only).await;
    // servers hang up on idle or busy connections: a sync only asks what changed, so a new connection just goes on
    if r.as_ref().is_err_and(|e| crate::imap::connection_lost(e)) {
        m.drop_conns(&acc.name);
        r = account_inner(m, acc, only).await;
    }
    m.end_sync(&acc.name);
    match &r {
        Ok(rep) => {
            m.event("status", json!({ "account": acc.name, "state": "idle", "errors": rep.errors }));
            if rep.added + rep.removed + rep.flagged > 0 {
                m.event("changed", json!({ "account": acc.name }));
            }
            if !rep.new.is_empty() {
                let msgs: Vec<_> = rep.new.iter().filter_map(|id| m.index.msg(*id)).take(10).map(|x| json!({ "id": x.id, "thread": x.thread, "from": x.from, "subject": x.subject, "account": x.account })).collect();
                m.event("new", json!({ "account": acc.name, "messages": msgs, "count": rep.new.len() }));
            }
        }
        Err(e) => m.event("status", json!({ "account": acc.name, "state": "error", "error": e })),
    }
    r
}

async fn account_inner(m: &Mail, acc: &Account, only: Option<&[String]>) -> Result<Report, String> {
    let mut c = m.conn(acc).await?;
    let first = m.index.folders(Some(&acc.name)).is_empty();
    let round = {
        let mut r = m.rounds.lock().unwrap();
        let n = r.entry(acc.name.clone()).or_insert(0);
        *n += 1;
        *n
    };
    let mut rep = Report::default();
    if only.is_none() || first {
        match c.folders().await {
            Ok(list) => m.index.set_folders(&acc.name, &list)?,
            Err(e) => {
                m.rt.spawn(c.logout());
                return Err(e);
            }
        }
    }
    let mut folders: Vec<Folder> = m.index.folders(Some(&acc.name)).into_iter().filter(|f| indexed(f.role.as_deref())).collect();
    if let Some(only) = only {
        folders.retain(|f| only.contains(&f.path));
    }
    folders.sort_by_key(|f| (rank(f.role.as_deref()), f.label.to_lowercase()));
    let own = acc.own();
    // what arrived or was starred since the last round: saved conversations grow, important ones are kept
    let mut follow: Vec<i64> = vec![];
    for f in &folders {
        match folder(m, &mut c, acc, f, &own, round % 10 == 0).await {
            Ok((added, removed, flagged)) => {
                rep.folders += 1;
                rep.removed += removed;
                rep.flagged += flagged.len();
                if f.role.as_deref() == Some("inbox") && !first {
                    rep.new.extend(added.iter().filter(|id| m.index.msg(**id).is_some_and(|x| !x.seen)));
                }
                rep.added += added.len();
                if !added.is_empty() && f.role.as_deref() == Some("inbox") {
                    crate::rules::apply(m, acc, &added).await;
                }
                if !first && !matches!(f.role.as_deref(), Some("trash" | "junk")) {
                    follow.extend(added.iter().chain(&flagged));
                }
            }
            Err(e) if crate::imap::connection_lost(&e) => {
                m.rt.spawn(c.logout());
                return Err(e);
            }
            Err(e) => rep.errors.push(format!("{}: {e}", f.label)),
        }
    }
    let prefetch = m.setting_u64("prefetch", 300) as usize;
    if prefetch > 0 {
        if let Err(e) = bodies(m, &mut c, acc, prefetch).await {
            rep.errors.push(e);
        }
    }
    m.give_back(c);
    crate::notes::follow(m, &follow).await;
    let cap = m.setting_u64("cache_mb", 2048) as i64 * 1024 * 1024;
    let _ = m.index.prune_bodies(cap);
    Ok(rep)
}

/// Syncs one folder → (ids added, how many removed, ids whose flags changed).
pub async fn folder(m: &Mail, c: &mut Imap, acc: &Account, f: &Folder, own: &[String], all_flags: bool) -> Result<(Vec<i64>, usize, Vec<i64>), String> {
    let (validity, next, modseq, exists) = c.select(&f.path, false).await?;
    if f.uidvalidity != validity {
        m.index.reset_folder(&acc.name, &f.path, validity)?;
    }
    let reset = f.uidvalidity != validity;
    let known = m.index.uids(&acc.name, &f.path);
    let still = !reset && next == f.uidnext && known.len() == exists as usize && (modseq == 0 || modseq == f.modseq) && !all_flags;
    if still && modseq != 0 {
        return Ok((vec![], 0, vec![]));
    }
    let mut removed = 0;
    let mut added = vec![];
    if !still {
        let server: Vec<u32> = if exists == 0 { vec![] } else { c.all_uids().await? };
        let on_server: HashSet<u32> = server.iter().copied().collect();
        let have: HashSet<u32> = known.iter().copied().collect();
        let gone: Vec<u32> = known.iter().copied().filter(|u| !on_server.contains(u)).collect();
        if !gone.is_empty() {
            removed = m.index.remove(&acc.name, &f.path, &gone)?;
        }
        let mut new: Vec<u32> = server.into_iter().filter(|u| !have.contains(u)).collect();
        let placeholders = !new.is_empty();
        new.sort_unstable_by(|a, b| b.cmp(a));
        let total = new.len();
        for (i, chunk) in new.chunks(BATCH).enumerate() {
            let msgs = c.headers(chunk).await?;
            added.extend(m.index.add(&acc.name, &f.path, own, &msgs)?);
            if total > BATCH {
                m.event("progress", json!({ "account": acc.name, "folder": f.label, "done": ((i + 1) * BATCH).min(total), "total": total }));
                // the first pages show while the rest arrives
                m.event("changed", json!({ "account": acc.name, "folder": f.path }));
            }
        }
        if placeholders {
            m.index.drop_placeholders(&acc.name, &f.path)?;
        }
    }
    let condstore = c.has("CONDSTORE") && f.modseq > 0 && !reset && !all_flags;
    let (flags, top) = if condstore {
        c.flags(&[], Some(f.modseq)).await?
    } else {
        let window: Vec<u32> = if all_flags { m.index.uids(&acc.name, &f.path) } else { m.index.newest_uids(&acc.name, &f.path, FLAG_WINDOW) };
        let mut out = vec![];
        for chunk in window.chunks(2000) {
            out.extend(c.flags(chunk, None).await?.0);
        }
        (out, 0)
    };
    let changed = m.index.set_flags(&acc.name, &f.path, &flags)?;
    m.index.set_sync_state(&acc.name, &f.path, next, top.max(modseq))?;
    m.index.recount(&acc.name, &f.path);
    Ok((added, removed, changed))
}

/// Fetches the bodies of the account's newest messages that have none yet (up to `n`).
pub async fn bodies(m: &Mail, c: &mut Imap, acc: &Account, n: usize) -> Result<(), String> {
    let missing = m.index.missing_bodies(&acc.name, n);
    if missing.is_empty() {
        return Ok(());
    }
    let mut by: std::collections::BTreeMap<String, Vec<(i64, u32)>> = Default::default();
    for (id, folder, uid) in missing {
        by.entry(folder).or_default().push((id, uid));
    }
    let mut done = vec![];
    for (folder, items) in by {
        c.ensure(&folder, false).await?;
        for chunk in items.chunks(25) {
            let uids: Vec<u32> = chunk.iter().map(|x| x.1).collect();
            for (uid, raw) in c.bodies(&uids).await? {
                if let Some((id, _)) = chunk.iter().find(|x| x.1 == uid) {
                    m.index.set_body(*id, &raw)?;
                    done.push(*id);
                }
            }
        }
    }
    if !done.is_empty() {
        m.event("bodies", json!({ "account": acc.name, "ids": done }));
    }
    Ok(())
}

/// The body of one message: from the cache, else fetched (and kept).
pub async fn body(m: &Mail, id: i64) -> Result<Vec<u8>, String> {
    if let Some(b) = m.index.body(id) {
        return Ok(b);
    }
    let msg = m.index.msg(id).ok_or("that message is gone")?;
    let acc = m.account(Some(&msg.account))?;
    let mut c = m.conn(&acc).await?;
    let r = async {
        c.ensure(&msg.folder, false).await?;
        c.body(msg.uid).await
    }
    .await;
    match r {
        Ok(Some(raw)) => {
            m.give_back(c);
            m.index.set_body(id, &raw)?;
            Ok(raw)
        }
        Ok(None) => {
            m.give_back(c);
            Err("the server no longer has that message: it was moved or deleted elsewhere".into())
        }
        Err(e) => {
            m.rt.spawn(c.logout());
            Err(e)
        }
    }
}

/// Starts the live loops of every account not watched yet: IDLE on the inbox and the full sync every few minutes.
pub fn watch(m: &Arc<Mail>) {
    for acc in m.accounts().into_iter().flatten() {
        if !m.watching.lock().unwrap().insert(acc.name.clone()) {
            continue;
        }
        let (m1, m2, name) = (m.clone(), m.clone(), acc.name.clone());
        m.rt.spawn(async move { idle_loop(m1, name).await });
        let name = acc.name.clone();
        m.rt.spawn(async move { periodic(m2, name).await });
    }
    let m3 = m.clone();
    if m.watching.lock().unwrap().insert("\u{0}timers".into()) {
        m.rt.spawn(async move { timers(m3).await });
    }
}

async fn periodic(m: Arc<Mail>, name: String) {
    loop {
        if let Ok(acc) = m.account(Some(&name)) {
            let _ = account(&m, &acc, None).await;
        } else {
            m.watching.lock().unwrap().remove(&name);
            return; // the account is gone from the settings
        }
        let every = m.setting_u64("check_every", 5).max(1);
        tokio::time::sleep(Duration::from_secs(every * 60)).await;
    }
}

/// IDLE on the inbox: the server says when something arrives, the inbox is synced at once. Reconnects with a growing
/// pause after an error (a laptop asleep, a server restart).
async fn idle_loop(m: Arc<Mail>, name: String) {
    let mut pause = 5;
    loop {
        let Ok(acc) = m.account(Some(&name)) else { return };
        let r: Result<(), String> = async {
            let token = m.token(&acc).await?;
            let mut c = Imap::connect(&acc, token).await?;
            let inbox = m.index.role(&acc.name, "inbox").map(|f| f.path).unwrap_or_else(|| "INBOX".into());
            if !c.has("IDLE") {
                c.logout().await;
                tokio::time::sleep(Duration::from_secs(120)).await;
                let _ = account(&m, &acc, Some(&[inbox])).await;
                return Ok(());
            }
            c.select(&inbox, false).await?;
            let (caps, account_name) = (c.caps.clone(), c.account.clone());
            let mut idle = c.s.idle();
            idle.init().await.map_err(|e| format!("IDLE: {e}"))?;
            let (wait, _stop) = idle.wait_with_timeout(Duration::from_secs(25 * 60));
            let got = wait.await.map_err(|e| format!("IDLE: {e}"))?;
            let s = idle.done().await.map_err(|e| format!("IDLE: {e}"))?;
            let c = Imap { s, caps, account: account_name, selected: None };
            c.logout().await;
            if matches!(got, async_imap::extensions::idle::IdleResponse::NewData(_)) {
                // a moment for the server to finish delivering a burst
                tokio::time::sleep(Duration::from_millis(300)).await;
                account(&m, &acc, Some(&[inbox])).await.map(|_| ())?;
            }
            Ok(())
        }
        .await;
        match r {
            Ok(()) => pause = 5,
            Err(e) => {
                m.event("status", json!({ "account": name, "state": "offline", "error": e }));
                tokio::time::sleep(Duration::from_secs(pause)).await;
                pause = (pause * 2).min(300);
            }
        }
    }
}

/// Once a minute: snoozed mail whose time has come goes back to the inbox; scheduled mail whose time has come is sent.
async fn timers(m: Arc<Mail>) {
    loop {
        tokio::time::sleep(Duration::from_secs(60)).await;
        for acc in m.accounts().into_iter().flatten() {
            let _ = crate::ops::wake_snoozed(&m, &acc).await;
            let _ = crate::send::send_due(&m, &acc).await;
        }
    }
}

#[cfg(test)]
pub mod tests_support {
    use super::*;
    use crate::index::Index;
    use serde_json::Value;
    use std::sync::Mutex;

    pub type Events = Arc<Mutex<Vec<(String, Value)>>>;

    /// An engine on an in-memory index, signed in to a fresh stand-in server (fake.rs).
    pub fn harness(moves: bool) -> (Arc<Mail>, Arc<crate::fake::Server>, Events, tempfile::TempDir) {
        let dir = tempfile::tempdir().unwrap();
        let server = crate::fake::start(Some(dir.path().join("server")), moves);
        let events = Arc::new(Mutex::new(vec![]));
        let ev = events.clone();
        let m = Mail::new(
            Index::memory(),
            dir.path().join("cache"),
            dir.path().join("vault"),
            Arc::new(|_: &str, _: &[(&str, &str)]| Err("no network in tests".to_string())),
            Box::new(move |n: &str, d: Value| ev.lock().unwrap().push((n.to_string(), d))),
        );
        m.set_core(Arc::new(|path: &str, _: &Value| Err(format!("no Atlas in tests: {path}"))));
        m.remember(&json!({
            "settings": { "accounts": [{ "name": "fake", "user": crate::fake::USER, "from": "Me <me@example.org>", "imap_host": "127.0.0.1", "imap_port": server.imap_port, "smtp_host": "127.0.0.1", "smtp_port": server.smtp_port, "security": "none" }] },
            "secrets": { "accounts.fake.password": crate::fake::PASSWORD }
        }));
        (m, server, events, dir)
    }
}

#[cfg(test)]
mod tests {
    use super::tests_support::harness;
    use super::*;
    use crate::index::Scope;

    #[test]
    fn a_first_sync_indexes_every_mail_folder_with_roles_and_bodies() {
        let (m, _s, events, _d) = harness(true);
        let acc = m.account(None).unwrap();
        let rep = m.rt.block_on(account(&m, &acc, None)).unwrap();
        assert!(rep.errors.is_empty(), "{:?}", rep.errors);
        assert_eq!(rep.added, 6);
        assert!(rep.new.is_empty(), "the first sync announces nothing");
        let roles: Vec<(String, Option<String>)> = m.index.folders(Some("fake")).into_iter().map(|f| (f.label, f.role)).collect();
        assert!(roles.contains(&("Lectures été".into(), None)), "{roles:?}");
        assert!(roles.contains(&("Calendar".into(), Some("other".into()))));
        assert!(roles.contains(&("Sent".into(), Some("sent".into()))));
        let inbox = m.index.role("fake", "inbox").unwrap();
        assert_eq!((inbox.total, inbox.unread), (3, 2));
        let rows = m.index.list(&Scope { folders: vec![("fake".into(), "INBOX".into())], ..Default::default() }, 50, 0);
        assert_eq!(rows.iter().map(|r| r.subject.as_str()).collect::<Vec<_>>(), vec!["Séminaire jeudi", "Draft of the DCA section", "Cluster time on iq"]);
        assert_eq!(rows[0].snippet, "Le séminaire est jeudi à 14 h.", "bodies prefetched");
        assert!(rows[1].has_attachments);
        assert!(events.lock().unwrap().iter().any(|(n, _)| n == "changed"));
    }

    #[test]
    fn a_connection_the_server_drops_is_opened_again_and_the_sync_goes_on() {
        let (m, s, _events, _d) = harness(true);
        let acc = m.account(None).unwrap();
        s.hang_up_on_list.store(1, std::sync::atomic::Ordering::SeqCst);
        let rep = m.rt.block_on(account(&m, &acc, None)).unwrap();
        assert_eq!(rep.added, 6);
        // dropped again on the second try: said plainly, not retried for ever
        s.hang_up_on_list.store(2, std::sync::atomic::Ordering::SeqCst);
        let e = m.rt.block_on(account(&m, &acc, None)).unwrap_err();
        assert!(crate::imap::connection_lost(&e), "{e}");
    }

    #[test]
    fn a_later_sync_brings_new_mail_flags_changed_elsewhere_and_deletions() {
        let (m, s, events, _d) = harness(true);
        let acc = m.account(None).unwrap();
        m.rt.block_on(account(&m, &acc, None)).unwrap();
        {
            let mut st = s.store.lock().unwrap();
            st.add("INBOX", b"From: New <new@example.org>\r\nSubject: Fresh\r\nMessage-ID: <fresh@x>\r\nDate: Tue, 20 Oct 2026 10:00:00 +0000\r\n\r\nhello\r\n".to_vec(), &[]);
            st.modseq += 1;
            let ms = st.modseq;
            let inbox = st.folders.get_mut("INBOX").unwrap();
            inbox.msgs[1].flags.insert("\\Seen".into()); // read in another client
            inbox.msgs[1].modseq = ms;
            inbox.msgs.remove(0); // deleted in another client
        }
        let rep = m.rt.block_on(account(&m, &acc, None)).unwrap();
        assert_eq!((rep.added, rep.removed), (1, 1), "{rep:?}");
        assert_eq!(rep.new.len(), 1);
        assert_eq!(rep.flagged, 1);
        let inbox = m.index.role("fake", "inbox").unwrap();
        assert_eq!((inbox.total, inbox.unread), (3, 2));
        let ev = events.lock().unwrap();
        let new = ev.iter().find(|(n, _)| n == "new").expect("a notice of new mail");
        assert_eq!(new.1["messages"][0]["subject"], "Fresh");
    }

    #[test]
    fn a_uidvalidity_change_reads_the_folder_again() {
        let (m, s, _e, _d) = harness(true);
        let acc = m.account(None).unwrap();
        m.rt.block_on(account(&m, &acc, None)).unwrap();
        s.store.lock().unwrap().folders.get_mut("INBOX").unwrap().uidvalidity = 2;
        m.rt.block_on(account(&m, &acc, None)).unwrap();
        assert_eq!(m.index.role("fake", "inbox").unwrap().uidvalidity, 2);
        assert_eq!(m.index.uids("fake", "INBOX").len(), 3);
    }

    #[test]
    fn a_wrong_password_says_what_to_fix() {
        let (m, _s, events, _d) = harness(true);
        let mut p = m.params();
        p["secrets"]["accounts.fake.password"] = json!("nope");
        m.remember(&p);
        let acc = m.account(None).unwrap();
        let e = m.rt.block_on(account(&m, &acc, None)).unwrap_err();
        assert!(e.contains("refused the user name or password"), "{e}");
        assert!(events.lock().unwrap().iter().any(|(n, d)| n == "status" && d["state"] == "error"));
    }

    #[test]
    fn idle_hears_new_mail_and_syncs_the_inbox() {
        let (m, s, events, _d) = harness(true);
        let acc = m.account(None).unwrap();
        m.rt.block_on(account(&m, &acc, None)).unwrap();
        let m2 = m.clone();
        m.rt.spawn(async move { idle_loop(m2, "fake".into()).await });
        std::thread::sleep(Duration::from_millis(500));
        {
            let mut st = s.store.lock().unwrap();
            st.add("INBOX", b"From: Push <push@example.org>\r\nSubject: Pushed\r\nMessage-ID: <push@x>\r\nDate: Tue, 20 Oct 2026 11:00:00 +0000\r\n\r\nhi\r\n".to_vec(), &[]);
        }
        s.changed.notify_all();
        let deadline = std::time::Instant::now() + Duration::from_secs(10);
        while std::time::Instant::now() < deadline {
            if events.lock().unwrap().iter().any(|(n, d)| n == "new" && d["messages"][0]["subject"] == "Pushed") {
                return;
            }
            std::thread::sleep(Duration::from_millis(100));
        }
        panic!("IDLE did not bring the new mail: {:?}", events.lock().unwrap());
    }
}
