//! What the pane does to mail (DESIGN-mail-ui §5): read / unread, star, labels, move, archive, delete, spam, snooze.
//! Optimistic: the index changes first (the list answers at once), then the server; a server that refuses puts the
//! index back and says why. Every move answers what Undo needs: where each message was, and where it is now.

use crate::account::Account;
use crate::index::Msg;
use crate::mail::Mail;
use serde::Serialize;
use std::collections::BTreeMap;

/// Messages grouped by (account, folder): one connection and one command per group.
fn groups(m: &Mail, ids: &[i64]) -> BTreeMap<(String, String), Vec<Msg>> {
    let mut g: BTreeMap<(String, String), Vec<Msg>> = BTreeMap::new();
    for id in ids {
        if let Some(x) = m.index.msg(*id) {
            g.entry((x.account.clone(), x.folder.clone())).or_default().push(x);
        }
    }
    g
}

/// A whole conversation's message ids (the pane acts on conversations; the thread's trash stays out).
pub fn expand_threads(m: &Mail, ids: &[i64]) -> Vec<i64> {
    let mut out = vec![];
    for id in ids {
        match m.index.msg(*id) {
            Some(x) => {
                for t in m.index.thread(x.thread, false) {
                    if !out.contains(&t.id) {
                        out.push(t.id);
                    }
                }
            }
            None => out.push(*id),
        }
    }
    out
}

/// Sets or clears a flag (\Seen, \Flagged, a keyword) on messages.
pub async fn flag(m: &Mail, ids: &[i64], flag: &str, on: bool) -> Result<(), String> {
    let before: Vec<(i64, bool)> = ids.iter().filter_map(|id| m.index.msg(*id)).map(|x| (x.id, has_flag(&x, flag))).collect();
    m.index.flag(ids, flag, on)?;
    for ((account, folder), msgs) in groups(m, ids) {
        let r = async {
            let acc = m.account(Some(&account))?;
            let mut c = m.conn(&acc).await?;
            let uids: Vec<u32> = msgs.iter().filter(|x| x.uid > 0).map(|x| x.uid).collect();
            let r = async {
                c.ensure(&folder, true).await?;
                c.store(&uids, on, &[flag]).await
            }
            .await;
            match r {
                Ok(()) => {
                    m.give_back(c);
                    Ok(())
                }
                Err(e) => {
                    m.rt.spawn(c.logout());
                    Err(e)
                }
            }
        }
        .await;
        if let Err(e) = r {
            for (id, was) in &before {
                let _ = m.index.flag(&[*id], flag, *was);
            }
            return Err(e);
        }
    }
    m.event("changed", serde_json::json!({}));
    Ok(())
}

fn has_flag(x: &Msg, flag: &str) -> bool {
    match flag.to_lowercase().as_str() {
        "\\seen" => x.seen,
        "\\flagged" => x.flagged,
        "\\answered" => x.answered,
        "\\draft" => x.draft,
        _ => x.labels.iter().any(|l| l.eq_ignore_ascii_case(flag)),
    }
}

/// Where a message was before a move, and where it is now: what Undo moves back.
#[derive(Debug, Clone, Serialize)]
pub struct Moved {
    pub id: i64,
    pub from: String,
    pub to: String,
}

/// The folder a role names in an account; one the account lacks is made (Archive, Snoozed, Not important).
pub async fn folder_for(m: &Mail, acc: &Account, role: &str) -> Result<String, String> {
    if let Some(f) = m.index.role(&acc.name, role) {
        return Ok(f.path);
    }
    // Gmail archives into All Mail
    if role == "archive" {
        if let Some(f) = m.index.role(&acc.name, "all") {
            return Ok(f.path);
        }
    }
    let name = match role {
        "archive" => "Archive",
        "snoozed" => "Snoozed",
        "unimportant" => "Not important",
        "trash" => "Trash",
        "junk" => "Junk",
        "inbox" => "INBOX",
        other => return Err(format!("this account has no {other} folder")),
    };
    let delim = m.index.role(&acc.name, "inbox").and_then(|f| f.delimiter).unwrap_or_else(|| "/".into());
    let mut c = m.conn(acc).await?;
    // some servers only allow folders under INBOX: try the top first, then there
    let path = match c.create(name).await {
        Ok(()) => name.to_string(),
        Err(_) => {
            let under = format!("INBOX{delim}{name}");
            c.create(&under).await.or_else(|e| if e.contains("ALREADYEXISTS") || e.to_lowercase().contains("exist") { Ok(()) } else { Err(e) })?;
            under
        }
    };
    let folders = c.folders().await?;
    m.give_back(c);
    let mut listed = folders;
    for f in &mut listed {
        if f.0 == path && f.2.is_none() {
            f.2 = Some(role.to_string());
        }
    }
    m.index.set_folders(&acc.name, &listed)?;
    Ok(path)
}

/// Moves messages to a folder (a server path) of their own account. Messages already there stay.
pub async fn move_to(m: &Mail, ids: &[i64], to: &str) -> Result<Vec<Moved>, String> {
    let mut done = vec![];
    for ((account, folder), msgs) in groups(m, ids) {
        if folder == to {
            continue;
        }
        let acc = m.account(Some(&account))?;
        let mut c = m.conn(&acc).await?;
        let uids: Vec<u32> = msgs.iter().filter(|x| x.uid > 0).map(|x| x.uid).collect();
        // at once in the index, so the list answers before the server
        for x in &msgs {
            m.index.moved(x.id, to, None)?;
        }
        let r = async {
            c.ensure(&folder, true).await?;
            c.move_to(&uids, to).await
        }
        .await;
        match r {
            Ok(map) => {
                m.give_back(c);
                for x in &msgs {
                    let new = map.iter().find(|(old, _)| *old == x.uid).map(|(_, n)| *n);
                    if new.is_some() {
                        m.index.moved(x.id, to, new)?;
                    }
                    done.push(Moved { id: x.id, from: folder.clone(), to: to.to_string() });
                }
                m.index.recount(&account, &folder);
                m.index.recount(&account, to);
            }
            Err(e) => {
                m.rt.spawn(c.logout());
                for x in &msgs {
                    let _ = m.index.moved(x.id, &folder, Some(x.uid));
                }
                return Err(e);
            }
        }
    }
    // a message moved without COPYUID has no uid there yet: the next sync of that folder finds it
    let unknown: Vec<(String, String)> = done.iter().filter_map(|d| m.index.msg(d.id)).filter(|x| x.uid == 0).map(|x| (x.account, x.folder)).collect();
    for (account, folder) in unknown {
        if let (Ok(acc), Some(f)) = (m.account(Some(&account)), m.index.folder(&account, &folder)) {
            if let Ok(mut c) = m.conn(&acc).await {
                if crate::sync::folder(m, &mut c, &acc, &f, &acc.own(), false).await.is_ok() {
                    m.give_back(c);
                }
            }
        }
    }
    m.event("changed", serde_json::json!({}));
    Ok(done)
}

/// Moves messages to the folder a role names in each one's account (archive, trash, junk, inbox, snoozed…).
pub async fn move_role(m: &Mail, ids: &[i64], role: &str) -> Result<Vec<Moved>, String> {
    let mut by_acc: BTreeMap<String, Vec<i64>> = BTreeMap::new();
    for id in ids {
        if let Some(x) = m.index.msg(*id) {
            by_acc.entry(x.account).or_default().push(*id);
        }
    }
    let mut done = vec![];
    for (account, ids) in by_acc {
        let acc = m.account(Some(&account))?;
        let to = folder_for(m, &acc, role).await?;
        done.extend(move_to(m, &ids, &to).await?);
    }
    Ok(done)
}

/// Trash: to the account's Trash; what is in the trash already is deleted for good.
pub async fn trash(m: &Mail, ids: &[i64]) -> Result<Vec<Moved>, String> {
    let (bin, keep): (Vec<i64>, Vec<i64>) = ids.iter().partition(|id| m.index.msg(**id).is_some_and(|x| m.index.folder(&x.account, &x.folder).and_then(|f| f.role).as_deref() == Some("trash")));
    if !bin.is_empty() {
        delete_forever(m, &bin).await?;
    }
    move_role(m, &keep, "trash").await
}

/// Deleted for good (no Undo: the pane asks first).
pub async fn delete_forever(m: &Mail, ids: &[i64]) -> Result<(), String> {
    for ((account, folder), msgs) in groups(m, ids) {
        let acc = m.account(Some(&account))?;
        let mut c = m.conn(&acc).await?;
        let uids: Vec<u32> = msgs.iter().map(|x| x.uid).filter(|u| *u > 0).collect();
        c.ensure(&folder, true).await?;
        c.expunge(&uids).await?;
        m.give_back(c);
        m.index.remove_ids(&msgs.iter().map(|x| x.id).collect::<Vec<_>>())?;
        m.index.recount(&account, &folder);
    }
    m.event("changed", serde_json::json!({}));
    Ok(())
}

/// Undo a move: each message back where it was.
pub async fn undo_moves(m: &Mail, moved: &[Moved]) -> Result<(), String> {
    let mut by: BTreeMap<String, Vec<i64>> = BTreeMap::new();
    for mv in moved {
        by.entry(mv.from.clone()).or_default().push(mv.id);
    }
    for (from, ids) in by {
        move_to(m, &ids, &from).await?;
    }
    Ok(())
}

/// The keyword a snoozed message carries: when it comes back (unix seconds).
pub fn snooze_keyword(until: i64) -> String {
    format!("$atlas-snooze-{until}")
}

fn snoozed_until(x: &Msg, flags: &str) -> Option<i64> {
    let _ = x;
    flags.split_whitespace().find_map(|f| f.strip_prefix("$atlas-snooze-").and_then(|t| t.parse().ok()))
}

/// Snooze: out of the inbox into Snoozed until `until`, when it comes back unread (`wake_snoozed`).
pub async fn snooze(m: &Mail, ids: &[i64], until: i64) -> Result<Vec<Moved>, String> {
    flag(m, ids, &snooze_keyword(until), true).await?;
    move_role(m, ids, "snoozed").await
}

/// Snoozed mail whose time has come: back to the inbox, unread, its snooze keyword gone.
pub async fn wake_snoozed(m: &Mail, acc: &Account) -> Result<usize, String> {
    let Some(f) = m.index.role(&acc.name, "snoozed") else { return Ok(0) };
    let now = chrono::Utc::now().timestamp();
    let rows = m.index.flags_of_folder(&acc.name, &f.path);
    let due: Vec<(i64, String)> = rows
        .into_iter()
        .filter_map(|(id, flags)| {
            let x = m.index.msg(id)?;
            let t = snoozed_until(&x, &flags)?;
            (t <= now).then(|| (id, snooze_keyword(t)))
        })
        .collect();
    if due.is_empty() {
        return Ok(0);
    }
    for (id, kw) in &due {
        flag(m, &[*id], kw, false).await?;
    }
    let ids: Vec<i64> = due.iter().map(|d| d.0).collect();
    flag(m, &ids, "\\Seen", false).await?;
    move_role(m, &ids, "inbox").await?;
    m.event("woke", serde_json::json!({ "account": acc.name, "ids": ids }));
    Ok(ids.len())
}

/// Labels added or taken off: Gmail's labels where the account is Gmail, IMAP keywords elsewhere.
pub async fn label(m: &Mail, ids: &[i64], add: &[String], remove: &[String]) -> Result<(), String> {
    for ((account, folder), msgs) in groups(m, ids) {
        let acc = m.account(Some(&account))?;
        let mut c = m.conn(&acc).await?;
        let uids: Vec<u32> = msgs.iter().map(|x| x.uid).filter(|u| *u > 0).collect();
        let msg_ids: Vec<i64> = msgs.iter().map(|x| x.id).collect();
        c.ensure(&folder, true).await?;
        if c.gmail() {
            c.store_labels(&uids, true, add).await?;
            c.store_labels(&uids, false, remove).await?;
            m.index.set_labels(&msg_ids, add, remove)?;
        } else {
            let kw = |l: &String| keyword(l);
            let a: Vec<String> = add.iter().map(kw).collect();
            let r: Vec<String> = remove.iter().map(kw).collect();
            c.store(&uids, true, &a.iter().map(String::as_str).collect::<Vec<_>>()).await?;
            c.store(&uids, false, &r.iter().map(String::as_str).collect::<Vec<_>>()).await?;
            for k in &a {
                m.index.flag(&msg_ids, k, true)?;
            }
            for k in &r {
                m.index.flag(&msg_ids, k, false)?;
            }
        }
        m.give_back(c);
    }
    m.event("changed", serde_json::json!({}));
    Ok(())
}

/// A label as an IMAP keyword (an atom: no spaces, parentheses, quotes or brackets).
pub fn keyword(l: &str) -> String {
    l.chars().map(|c| if c.is_ascii_graphic() && !"(){%*\"\\]".contains(c) { c } else { '_' }).collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::sync::tests_support::harness;

    fn inbox_ids(m: &Mail) -> Vec<i64> {
        let mut v: Vec<i64> = m.index.uids("fake", "INBOX").iter().map(|u| m.index.id_of("fake", "INBOX", *u).unwrap()).collect();
        v.sort();
        v
    }

    #[test]
    fn read_star_archive_undo_trash_and_delete_reach_the_server() {
        let (m, s, _e, _d) = harness(true);
        let acc = m.account(None).unwrap();
        m.rt.block_on(crate::sync::account(&m, &acc, None)).unwrap();
        let ids = inbox_ids(&m);
        let unread = ids[1];
        m.rt.block_on(flag(&m, &[unread], "\\Seen", true)).unwrap();
        m.rt.block_on(flag(&m, &[unread], "\\Flagged", true)).unwrap();
        let state = || s.store.lock().unwrap().folders.iter().map(|(k, f)| (k.clone(), f.msgs.iter().map(|x| (x.uid, x.flags.iter().cloned().collect::<Vec<_>>())).collect::<Vec<_>>())).collect::<BTreeMap<_, _>>();
        assert_eq!(state()["INBOX"][1].1, vec!["\\Flagged", "\\Seen"]);
        let moved = m.rt.block_on(move_role(&m, &[unread], "archive")).unwrap();
        assert_eq!(moved[0].from, "INBOX");
        assert_eq!(state()["Archive"].len(), 2);
        let x = m.index.msg(unread).unwrap();
        assert_eq!((x.folder.as_str(), x.uid), ("Archive", 2), "the uid the server gave it (COPYUID)");
        m.rt.block_on(undo_moves(&m, &moved)).unwrap();
        assert_eq!(state()["INBOX"].len(), 3);
        assert_eq!(m.index.msg(unread).unwrap().folder, "INBOX");
        m.rt.block_on(trash(&m, &[unread])).unwrap();
        assert_eq!(state()["Trash"].len(), 1);
        m.rt.block_on(trash(&m, &[unread])).unwrap();
        assert_eq!(state()["Trash"].len(), 0, "trash of the trash deletes");
        assert!(m.index.msg(unread).is_none());
    }

    #[test]
    fn moves_work_without_the_move_command() {
        let (m, s, _e, _d) = harness(false);
        let acc = m.account(None).unwrap();
        m.rt.block_on(crate::sync::account(&m, &acc, None)).unwrap();
        let id = inbox_ids(&m)[0];
        m.rt.block_on(move_role(&m, &[id], "archive")).unwrap();
        let st = s.store.lock().unwrap();
        assert_eq!(st.folders["INBOX"].msgs.len(), 2);
        assert_eq!(st.folders["Archive"].msgs.len(), 2);
    }

    #[test]
    fn snooze_makes_its_folder_and_wakes_unread_in_the_inbox() {
        let (m, s, _e, _d) = harness(true);
        let acc = m.account(None).unwrap();
        m.rt.block_on(crate::sync::account(&m, &acc, None)).unwrap();
        let id = inbox_ids(&m)[0];
        let past = chrono::Utc::now().timestamp() - 5;
        m.rt.block_on(snooze(&m, &[id], past)).unwrap();
        assert!(s.store.lock().unwrap().folders.contains_key("Snoozed"));
        assert_eq!(m.index.msg(id).unwrap().folder, "Snoozed");
        assert_eq!(m.rt.block_on(wake_snoozed(&m, &acc)).unwrap(), 1);
        let x = m.index.msg(id).unwrap();
        assert_eq!(x.folder, "INBOX");
        assert!(!x.seen);
        let st = s.store.lock().unwrap();
        assert!(st.folders["INBOX"].msgs.iter().all(|x| !x.flags.iter().any(|f| f.starts_with("$atlas-snooze"))));
    }

    #[test]
    fn labels_are_keywords_outside_gmail() {
        let (m, s, _e, _d) = harness(true);
        let acc = m.account(None).unwrap();
        m.rt.block_on(crate::sync::account(&m, &acc, None)).unwrap();
        let id = inbox_ids(&m)[0];
        m.rt.block_on(label(&m, &[id], &["Work Stuff".into()], &[])).unwrap();
        assert_eq!(m.index.msg(id).unwrap().labels, vec!["Work_Stuff"]);
        assert!(s.store.lock().unwrap().folders["INBOX"].msgs.iter().any(|x| x.flags.contains("Work_Stuff")));
    }
}

/// The importance mark (DESIGN-mail-ui §7): important = starred (the server's \Flagged: Gmail's star, Outlook's flag)
/// and, with `save_important` (on by default), saved as a note at once; not important = unstarred and moved to "Not
/// important"; cleared = unstarred, back in the inbox.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Importance {
    Important,
    NotImportant,
    Clear,
}

pub async fn importance(m: &Mail, ids: &[i64], to: Importance) -> Result<(), String> {
    let away: Vec<i64> = ids.iter().copied().filter(|id| m.index.msg(*id).and_then(|x| m.index.folder(&x.account, &x.folder)).and_then(|f| f.role).as_deref() == Some("unimportant")).collect();
    match to {
        Importance::Important | Importance::Clear => {
            flag(m, ids, "\\Flagged", to == Importance::Important).await?;
            if !away.is_empty() {
                move_role(m, &away, "inbox").await?;
            }
            if to == Importance::Important {
                save_important(m, ids).await;
            }
        }
        Importance::NotImportant => {
            flag(m, ids, "\\Flagged", false).await?;
            let here: Vec<i64> = ids.iter().copied().filter(|i| !away.contains(i)).collect();
            if !here.is_empty() {
                move_role(m, &here, "unimportant").await?;
            }
        }
    }
    Ok(())
}

/// Important mail is kept in the vault at once: each conversation as its note, with its files — where the Calendar plugin finds its invitations.
pub async fn save_important(m: &Mail, ids: &[i64]) {
    if !m.setting_bool("save_important", true) {
        return;
    }
    let mut threads: Vec<i64> = ids.iter().filter_map(|i| m.index.msg(*i)).map(|x| x.thread).collect();
    threads.sort();
    threads.dedup();
    for t in threads {
        if let Err(e) = crate::notes::save(m, t).await {
            m.event("status", serde_json::json!({ "state": "error", "error": format!("could not keep an important conversation: {e}") }));
        }
    }
}
