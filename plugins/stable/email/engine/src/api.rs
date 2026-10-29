//! The helper's methods: what the pane (ui/), the blocks and Claude's tools call. Each takes the call's params (with
//! `settings` and `secrets`) and answers JSON; a rotated Outlook token rides back on any answer as `_secrets`.

use crate::compose;
use crate::index::{Conversation, Msg, Scope};
use crate::mail::Mail;
use crate::ops;
use crate::parse::{self, Person};
use crate::render;
use crate::search;
use crate::send::{self, Compose};
use crate::sync;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::{Arc, Condvar, LazyLock, Mutex};
use std::time::Duration;

pub type Method = fn(&Arc<Mail>, &Value) -> Result<Value, String>;

/// Every method by name.
pub fn table() -> Vec<(&'static str, Method)> {
    vec![
        ("watch", watch),
        ("accounts", accounts),
        ("folders", folders),
        ("sync", sync_now),
        ("list", list),
        ("count", count),
        ("thread", thread),
        ("snippets", snippets),
        ("mark", mark),
        ("move", move_),
        ("archive", archive),
        ("trash", trash),
        ("spam", spam),
        ("not_spam", not_spam),
        ("snooze", snooze),
        ("unsnooze", unsnooze),
        ("delete", delete),
        ("undo", undo),
        ("label", label),
        ("attachment", attachment),
        ("contacts", contacts),
        ("compose_for", compose_for),
        ("send", send_),
        ("save_draft", save_draft),
        ("open_draft", open_draft),
        ("discard_draft", discard_draft),
        ("save_note", save_note),
        ("rules", rules),
        ("set_rules", set_rules),
        ("templates", templates),
        ("unsubscribe", unsubscribe),
        ("allow_remote", allow_remote),
        ("folder_create", folder_create),
        ("folder_rename", folder_rename),
        ("folder_delete", folder_delete),
        ("search_server", search_server),
        ("unread_count", unread_count),
        ("signin_start", signin_start),
        ("signin_finish", signin_finish),
        ("signin_reopen", signin_reopen),
        ("account_status", account_status),
        ("test_account", test_account),
        ("rename_account", rename_account),
        ("thunderbird", thunderbird),
        ("thunderbird_mail", thunderbird_mail),
        ("agent_list", agent_list),
        ("agent_get", agent_get),
        ("agent_attachment", agent_attachment),
        ("agent_send", agent_send),
        ("set_importance", set_importance),
        ("agent_accounts", agent_accounts),
        ("consent_answer", consent_answer),
        ("preview", preview),
        ("find", find),
        ("answer_invite", answer_invite),
        ("agenda", agenda),
        ("agent_rules", agent_rules),
        ("agent_add_rule", agent_add_rule),
        ("agent_remove_rule", agent_remove_rule),
        ("invite_status", invite_status),
    ]
}

/// Runs a method: remembers the call's settings, then answers (the rotated secrets added).
pub fn call(m: &Arc<Mail>, f: Method, p: &Value) -> Result<Value, String> {
    m.remember(p);
    let mut out = f(m, p)?;
    let rotated = crate::oauth::take_rotated();
    if !rotated.is_empty() {
        if !out.is_object() {
            out = json!({ "result": out });
        }
        out["_secrets"] = json!(rotated);
    }
    Ok(out)
}

fn ids(p: &Value) -> Vec<i64> {
    match p.get("ids") {
        Some(Value::Array(a)) => a.iter().filter_map(Value::as_i64).collect(),
        _ => p.get("id").and_then(Value::as_i64).into_iter().collect(),
    }
}

/// The messages an action is for: the ids, and with `conversation: true` (the default) their whole conversations.
fn targets(m: &Mail, p: &Value) -> Vec<i64> {
    let ids = ids(p);
    if p.get("conversation").and_then(Value::as_bool).unwrap_or(true) { ops::expand_threads(m, &ids) } else { ids }
}

fn s<'a>(p: &'a Value, k: &str) -> &'a str {
    p.get(k).and_then(Value::as_str).unwrap_or("")
}

// ----- accounts and folders

fn watch(m: &Arc<Mail>, _p: &Value) -> Result<Value, String> {
    sync::watch(m);
    accounts(m, &json!({}))
}

fn accounts(m: &Arc<Mail>, _p: &Value) -> Result<Value, String> {
    let list: Vec<Value> = m
        .accounts()
        .into_iter()
        .zip(crate::account::cards(&m.params()))
        .map(|(a, card)| match a {
            Ok(a) => {
                let inbox = m.index.role(&a.name, "inbox");
                json!({
                    "name": a.name, "user": a.user, "from": a.from, "main": a.main, "own": a.own(),
                    "identities": std::iter::once(a.from.clone()).chain(a.aliases.clone()).collect::<Vec<_>>(),
                    "outlook": matches!(a.auth, crate::account::Auth::Outlook { .. }),
                    "unread": inbox.as_ref().map(|f| f.unread).unwrap_or(0),
                    "status": m.status(&a.name), "syncing": m.is_syncing(&a.name),
                    "signature": a.signature,
                })
            }
            Err(e) => json!({ "name": card["name"], "error": e }),
        })
        .collect();
    Ok(json!({ "accounts": list, "own": m.own() }))
}

fn folders(m: &Arc<Mail>, p: &Value) -> Result<Value, String> {
    let acc = Some(s(p, "account")).filter(|a| !a.is_empty());
    Ok(json!({ "folders": m.index.folders(acc) }))
}

fn sync_now(m: &Arc<Mail>, p: &Value) -> Result<Value, String> {
    let only: Vec<String> = p.get("folders").and_then(Value::as_array).map(|a| a.iter().filter_map(|x| x.as_str().map(String::from)).collect()).unwrap_or_default();
    let mut reports = serde_json::Map::new();
    let targets: Vec<_> = if s(p, "account").is_empty() { m.accounts().into_iter().flatten().collect() } else { vec![m.account(Some(s(p, "account")))?] };
    for acc in targets {
        let r = m.rt.block_on(sync::account(m, &acc, if only.is_empty() { None } else { Some(&only) }));
        reports.insert(acc.name.clone(), match r {
            Ok(rep) => json!(rep),
            Err(e) => json!({ "error": e }),
        });
    }
    Ok(Value::Object(reports))
}

fn unread_count(m: &Arc<Mail>, _p: &Value) -> Result<Value, String> {
    let n: i64 = m.accounts().into_iter().flatten().filter_map(|a| m.index.role(&a.name, "inbox")).map(|f| f.unread).sum();
    Ok(json!({ "unread": n }))
}

// ----- lists

/// Where a list looks: a folder, a role in one or every account, or a view (starred, snoozed…), plus a search.
fn scope_of(m: &Mail, p: &Value) -> Scope {
    let now = chrono::Utc::now().timestamp();
    let q = search::parse(s(p, "query"), now);
    let account = q.account.clone().or_else(|| Some(s(p, "account").to_string()).filter(|a| !a.is_empty()));
    let accounts: Vec<String> = match &account {
        Some(a) => vec![a.clone()],
        None => m.accounts().into_iter().flatten().map(|a| a.name).collect(),
    };
    let by_role = |role: &str| -> Vec<(String, String)> { accounts.iter().filter_map(|a| m.index.role(a, role).map(|f| (a.clone(), f.path))).collect() };
    let mut extra: Vec<String> = vec![];
    let mut args: Vec<rusqlite::types::Value> = vec![];
    let folders = if let Some(f) = &q.folder {
        let role = match f.to_lowercase().as_str() {
            "inbox" => Some("inbox"),
            "sent" => Some("sent"),
            "drafts" | "draft" => Some("drafts"),
            "trash" | "bin" => Some("trash"),
            "spam" | "junk" => Some("junk"),
            "archive" => Some("archive"),
            "snoozed" => Some("snoozed"),
            "unimportant" | "not-important" | "notimportant" => Some("unimportant"),
            "anywhere" | "all" => None,
            _ => Some(""),
        };
        match role {
            Some("") => accounts.iter().flat_map(|a| m.index.folders(Some(a)).into_iter().filter(|x| x.label.eq_ignore_ascii_case(f) || x.path.eq_ignore_ascii_case(f)).map(|x| (x.account, x.path))).collect(),
            Some(r) => by_role(r),
            None => vec![],
        }
    } else if !q.is_empty() && s(p, "folder").is_empty() {
        // a search looks through all mail (Gmail's way), not only the folder on screen; `in:` narrows it
        vec![]
    } else {
        match s(p, "view") {
            "inbox" => by_role("inbox"),
            "starred" => {
                extra.push("m.flagged=1".into());
                vec![]
            }
            "snoozed" => by_role("snoozed"),
            "sent" => by_role("sent"),
            "drafts" => by_role("drafts"),
            "scheduled" => {
                extra.push(format!("m.flags LIKE '%{}%'", send::SEND_LATER));
                by_role("drafts")
            }
            "attachments" => {
                extra.push("m.has_att=1".into());
                vec![]
            }
            "all" | "" if !s(p, "folder").is_empty() => vec![(account.clone().unwrap_or_default(), s(p, "folder").to_string())],
            "" | "all" => {
                if q.is_empty() && account.is_some() {
                    by_role("inbox")
                } else {
                    vec![]
                }
            }
            role => by_role(role),
        }
    };
    match s(p, "quick") {
        "unread" => extra.push("m.seen=0".into()),
        "starred" => extra.push("m.flagged=1".into()),
        "attachments" => extra.push("m.has_att=1".into()),
        "mentions" => {
            // mail where the user is on To (not only Cc or a list)
            let own = m.own();
            let alts: Vec<String> = own
                .iter()
                .map(|o| {
                    args.push(format!("%{o}%").into());
                    format!("lower(m.to_json) LIKE ?{}", args.len())
                })
                .collect();
            if !alts.is_empty() {
                extra.push(format!("({})", alts.join(" OR ")));
            }
        }
        _ => {}
    }
    if let Some(k) = Some(s(p, "kind")).filter(|k| !k.is_empty()) {
        args.push(k.to_string().into());
        extra.push(format!("m.kind=?{}", args.len()));
    }
    // a view of a role no account has (no Snoozed folder yet): nothing, not everything
    // (every view but the ones over all mail names folders; `in:` a folder no account has finds nothing too)
    let role_view = match &q.folder {
        Some(f) => !matches!(f.to_lowercase().as_str(), "anywhere" | "all"),
        None => !matches!(s(p, "view"), "" | "all" | "starred" | "attachments") && (q.is_empty() || !s(p, "folder").is_empty()),
    };
    if role_view && folders.is_empty() {
        extra.push("0".into());
    }
    // the search's own conditions come after ours: renumbered
    if let Some((c, a)) = q.filter() {
        let base = args.len();
        let shifted = regex::Regex::new(r"\?(\d+)").unwrap().replace_all(&c, |x: &regex::Captures| format!("?{}", x[1].parse::<usize>().unwrap() + base)).into_owned();
        extra.push(shifted);
        args.extend(a);
    }
    if folders.is_empty() && account.is_some() {
        args.push(account.clone().unwrap().into());
        extra.push(format!("m.account=?{}", args.len()));
    }
    Scope { folders, filter: (!extra.is_empty()).then(|| (extra.join(" AND "), args)), text: q.text, flat: p.get("flat").and_then(Value::as_bool).unwrap_or(false), pin: p.get("pin").and_then(Value::as_bool).unwrap_or(false) }
}

fn row(c: &Conversation, m: &Mail) -> Value {
    let mut v = json!(c);
    v["saved"] = json!(crate::notes::saved(m, c.thread));
    v["folder_role"] = json!(m.index.folder(&c.account, &c.folder).and_then(|f| f.role));
    v
}

fn list(m: &Arc<Mail>, p: &Value) -> Result<Value, String> {
    let scope = scope_of(m, p);
    let limit = p.get("limit").and_then(Value::as_u64).unwrap_or(100) as usize;
    let offset = p.get("offset").and_then(Value::as_u64).unwrap_or(0) as usize;
    let rows: Vec<Value> = m.index.list(&scope, limit, offset).iter().map(|c| row(c, m)).collect();
    let (total, unread) = m.index.count(&scope);
    let q = search::parse(s(p, "query"), chrono::Utc::now().timestamp());
    Ok(json!({ "rows": rows, "total": total, "unread": unread, "chips": q.chips, "words": q.words }))
}

/// Counts for the sidebar and the split tabs: per view, and per kind in the inbox.
fn count(m: &Arc<Mail>, p: &Value) -> Result<Value, String> {
    let mut out = serde_json::Map::new();
    for view in ["inbox", "starred", "snoozed", "drafts", "scheduled", "unimportant"] {
        let mut q = p.clone();
        q["view"] = json!(view);
        let (t, u) = m.index.count(&scope_of(m, &q));
        out.insert(view.into(), json!({ "total": t, "unread": u }));
    }
    for kind in ["person", "newsletter", "notification"] {
        let mut q = p.clone();
        q["view"] = json!("inbox");
        q["kind"] = json!(kind);
        let (t, u) = m.index.count(&scope_of(m, &q));
        out.insert(kind.into(), json!({ "total": t, "unread": u }));
    }
    Ok(Value::Object(out))
}

/// Snippets for rows shown whose bodies are not fetched yet (the list asks for the ones on screen).
fn snippets(m: &Arc<Mail>, p: &Value) -> Result<Value, String> {
    let ids = ids(p);
    let mut out = serde_json::Map::new();
    for id in ids.into_iter().take(40) {
        if m.rt.block_on(sync::body(m, id)).is_ok() {
            if let Some(x) = m.index.msg(id) {
                out.insert(id.to_string(), json!({ "snippet": x.snippet, "has_attachments": x.has_attachments }));
            }
        }
    }
    Ok(Value::Object(out))
}

// ----- reading

fn remote_allowed(m: &Mail, x: &Msg) -> bool {
    m.setting_bool("remote_images", false) || x.from.iter().any(|f| m.index.pref(&format!("remote:{}", f.addr.to_lowercase())).is_some() || m.index.pref(&format!("remote:@{}", f.addr.rsplit('@').next().unwrap_or("").to_lowercase())).is_some())
}

fn rendered(m: &Mail, x: &Msg, raw: &[u8]) -> Value {
    let Some(b) = parse::body(raw) else { return json!({ "html": "<p>This message cannot be read.</p>", "plain": true, "remote": 0, "attachments": [] }) };
    let images = parse::inline_images(raw);
    let r = render::render(&b, &images);
    let forwarded: Vec<Value> = b
        .forwarded
        .iter()
        .map(|(e, fb)| json!({ "from": e.from, "to": e.to, "subject": e.subject, "date": e.date, "html": render::render(fb, &[]).html, "plain": fb.html.is_none() }))
        .collect();
    json!({
        "html": r.html, "plain": r.plain, "remote": r.remote, "remote_allowed": remote_allowed(m, x),
        "attachments": b.attachments.iter().filter(|a| !a.inline).collect::<Vec<_>>(),
        "invite": b.invite.as_ref().map(|i| invite_json(m, x, i)), "forwarded": forwarded, "text": b.text,
    })
}

/// The invitation for the card, with the user's answer: theirs in it, else the one given from here.
fn invite_json(m: &Mail, x: &Msg, i: &crate::ical::Invite) -> Value {
    let own = m.account(Some(&x.account)).map(|a| a.own()).unwrap_or_default();
    let answer = m.index.pref(&format!("invite:{}", i.uid)).or_else(|| crate::ical::my_answer(i, &own));
    let mut v = serde_json::to_value(i).unwrap_or_default();
    v["answer"] = json!(answer);
    v["mine"] = json!(own.iter().any(|o| o.eq_ignore_ascii_case(&i.organizer_addr)));
    v
}

/// Accept / Maybe / Decline from the reader: `{ id, partstat }`.
fn answer_invite(m: &Arc<Mail>, p: &Value) -> Result<Value, String> {
    let id = p.get("id").and_then(Value::as_i64).ok_or("which message?")?;
    m.rt.block_on(crate::send::answer_invite(m, id, s(p, "partstat")))
}

/// Whether the invitation is in the calendar and what overlaps it (the Calendar plugin's `invite_status`); null
/// when that plugin is not there.
fn invite_status(m: &Arc<Mail>, p: &Value) -> Result<Value, String> {
    let id = p.get("id").and_then(Value::as_i64).ok_or("which message?")?;
    let raw = m.rt.block_on(sync::body(m, id))?;
    let Some(inv) = parse::body(&raw).and_then(|b| b.invite) else { return Ok(Value::Null) };
    Ok(m.core_post("/api/plugins/dav/tools/invite_status", &json!({ "ics": inv.ics })).unwrap_or(Value::Null))
}

/// A conversation with every message's body (fetched when not kept). `read: true` marks it read, as opening does.
fn thread(m: &Arc<Mail>, p: &Value) -> Result<Value, String> {
    let id = p.get("id").and_then(Value::as_i64).ok_or("which message?")?;
    let x = m.index.msg(id).ok_or("that message is gone: the list is out of date")?;
    let with_trash = m.index.folder(&x.account, &x.folder).and_then(|f| f.role).is_some_and(|r| r == "trash" || r == "junk");
    let msgs = m.index.thread(x.thread, with_trash);
    let mut out = vec![];
    let mut errors = vec![];
    for mm in &msgs {
        let mut v = json!(mm);
        match m.rt.block_on(sync::body(m, mm.id)) {
            Ok(raw) => v["body"] = rendered(m, mm, &raw),
            Err(e) => {
                v["error"] = json!(e);
                errors.push(e);
            }
        }
        v["folder_role"] = json!(m.index.folder(&mm.account, &mm.folder).and_then(|f| f.role));
        v["folder_label"] = json!(m.index.folder(&mm.account, &mm.folder).map(|f| f.label));
        out.push(v);
    }
    if p.get("read").and_then(Value::as_bool).unwrap_or(false) && m.setting_bool("mark_read", true) {
        let unread: Vec<i64> = msgs.iter().filter(|x| !x.seen).map(|x| x.id).collect();
        if !unread.is_empty() {
            let m2 = m.clone();
            // marked behind: the reader opens without waiting for the server
            m.rt.spawn(async move { ops::flag(&m2, &unread, "\\Seen", true).await });
        }
    }
    Ok(json!({ "thread": x.thread, "subject": msgs.first().map(|f| f.subject.clone()).unwrap_or_default(), "messages": out, "saved": crate::notes::saved(m, x.thread) }))
}

// ----- triage

fn mark(m: &Arc<Mail>, p: &Value) -> Result<Value, String> {
    let ids = targets(m, p);
    let (flag, on) = if let Some(r) = p.get("read").and_then(Value::as_bool) {
        ("\\Seen".to_string(), r)
    } else if let Some(st) = p.get("starred").and_then(Value::as_bool) {
        ("\\Flagged".to_string(), st)
    } else {
        (s(p, "flag").to_string(), p.get("on").and_then(Value::as_bool).unwrap_or(true))
    };
    if flag.is_empty() {
        return Err("mark what? read, starred or flag".into());
    }
    // starring a conversation stars its newest message only (as Gmail): unstarring clears them all
    let ids = if flag == "\\Flagged" && on && p.get("conversation").and_then(Value::as_bool).unwrap_or(true) {
        ids.iter().filter_map(|i| m.index.msg(*i)).max_by_key(|x| x.date).map(|x| vec![x.id]).unwrap_or_default()
    } else {
        ids
    };
    m.rt.block_on(ops::flag(m, &ids, &flag, on))?;
    Ok(json!({ "ids": ids }))
}

fn moved(r: Vec<ops::Moved>) -> Value {
    json!({ "moved": r })
}

fn move_(m: &Arc<Mail>, p: &Value) -> Result<Value, String> {
    let ids = targets(m, p);
    match (s(p, "role"), s(p, "to")) {
        ("", "") => Err("move where?".into()),
        ("", to) => Ok(moved(m.rt.block_on(ops::move_to(m, &ids, to))?)),
        (role, _) => Ok(moved(m.rt.block_on(ops::move_role(m, &ids, role))?)),
    }
}

fn archive(m: &Arc<Mail>, p: &Value) -> Result<Value, String> {
    Ok(moved(m.rt.block_on(ops::move_role(m, &targets(m, p), "archive"))?))
}
fn trash(m: &Arc<Mail>, p: &Value) -> Result<Value, String> {
    Ok(moved(m.rt.block_on(ops::trash(m, &targets(m, p)))?))
}
fn spam(m: &Arc<Mail>, p: &Value) -> Result<Value, String> {
    let ids = targets(m, p);
    let _ = m.rt.block_on(ops::flag(m, &ids, "$Junk", true));
    Ok(moved(m.rt.block_on(ops::move_role(m, &ids, "junk"))?))
}
fn not_spam(m: &Arc<Mail>, p: &Value) -> Result<Value, String> {
    let ids = targets(m, p);
    let _ = m.rt.block_on(ops::flag(m, &ids, "$Junk", false));
    let _ = m.rt.block_on(ops::flag(m, &ids, "$NotJunk", true));
    Ok(moved(m.rt.block_on(ops::move_role(m, &ids, "inbox"))?))
}
fn snooze(m: &Arc<Mail>, p: &Value) -> Result<Value, String> {
    let until = p.get("until").and_then(Value::as_i64).ok_or("snooze until when?")?;
    Ok(moved(m.rt.block_on(ops::snooze(m, &targets(m, p), until))?))
}
fn unsnooze(m: &Arc<Mail>, p: &Value) -> Result<Value, String> {
    let ids = targets(m, p);
    for id in &ids {
        if let Some(x) = m.index.msg(*id) {
            for l in x.labels.iter().chain(m.index.flags_of_folder(&x.account, &x.folder).iter().filter(|(i, _)| i == id).flat_map(|(_, f)| f.split_whitespace().map(String::from).collect::<Vec<_>>()).collect::<Vec<_>>().iter()) {
                if l.starts_with("$atlas-snooze-") {
                    let _ = m.rt.block_on(ops::flag(m, &[*id], l, false));
                }
            }
        }
    }
    Ok(moved(m.rt.block_on(ops::move_role(m, &ids, "inbox"))?))
}
fn delete(m: &Arc<Mail>, p: &Value) -> Result<Value, String> {
    m.rt.block_on(ops::delete_forever(m, &targets(m, p)))?;
    Ok(json!({ "deleted": true }))
}
fn undo(m: &Arc<Mail>, p: &Value) -> Result<Value, String> {
    let moves: Vec<ops::Moved> = p.get("moved").and_then(Value::as_array).map(|a| a.iter().filter_map(|v| Some(ops::Moved { id: v["id"].as_i64()?, from: v["from"].as_str()?.into(), to: v["to"].as_str()?.into() })).collect()).unwrap_or_default();
    m.rt.block_on(ops::undo_moves(m, &moves))?;
    // a snooze is undone: its keyword goes
    for mv in &moves {
        if let Some(x) = m.index.msg(mv.id) {
            for (i, f) in m.index.flags_of_folder(&x.account, &x.folder) {
                if i == mv.id {
                    for k in f.split_whitespace().filter(|k| k.starts_with("$atlas-snooze-")) {
                        let _ = m.rt.block_on(ops::flag(m, &[mv.id], k, false));
                    }
                }
            }
        }
    }
    Ok(json!({ "undone": moves.len() }))
}
fn label(m: &Arc<Mail>, p: &Value) -> Result<Value, String> {
    let list = |k: &str| p.get(k).and_then(Value::as_array).map(|a| a.iter().filter_map(|x| x.as_str().map(String::from)).collect::<Vec<_>>()).unwrap_or_default();
    m.rt.block_on(ops::label(m, &targets(m, p), &list("add"), &list("remove")))?;
    Ok(json!({ "ok": true }))
}

/// One attachment: written to the plugin's cache (to open in Atlas), or into a vault folder (`to`) → its vault path.
fn attachment(m: &Arc<Mail>, p: &Value) -> Result<Value, String> {
    let id = p.get("id").and_then(Value::as_i64).ok_or("which message?")?;
    let part = p.get("part").and_then(Value::as_u64).ok_or("which file?")? as u32;
    let raw = m.rt.block_on(sync::body(m, id))?;
    let (bytes, name, mime) = parse::part_bytes(&raw, part).ok_or("that file is no longer in the message")?;
    let name = if name == "attachment" { s(p, "name").to_string() } else { name };
    let safe: String = name.chars().map(|c| if "/\\:*?\"<>|".contains(c) { ' ' } else { c }).collect::<String>().trim().to_string();
    let (dir, rel_base) = match Some(s(p, "to")).filter(|t| !t.is_empty()) {
        Some(to) => {
            if to.split('/').any(|x| x == "..") {
                return Err("that folder is outside the vault".into());
            }
            (m.root.join(to), to.trim_matches('/').to_string())
        }
        None => {
            let d = m.cache.join("files").join(format!("{id}-{part}"));
            let rel = d.strip_prefix(&m.root).map(|r| r.to_string_lossy().into_owned()).unwrap_or_else(|_| d.to_string_lossy().into_owned());
            (d, rel)
        }
    };
    let mut fname = if safe.is_empty() { "attachment".to_string() } else { safe };
    if !s(p, "to").is_empty() {
        let mut n = 2;
        let (stem, ext) = match fname.rfind('.') {
            Some(i) if i > 0 => (fname[..i].to_string(), fname[i..].to_string()),
            _ => (fname.clone(), String::new()),
        };
        while dir.join(&fname).exists() {
            fname = format!("{stem} {n}{ext}");
            n += 1;
        }
    }
    atlas_plugin::write_file(dir.join(&fname), &bytes).map_err(|e| e.to_string())?; // the cache's straight to disk
    Ok(json!({ "path": format!("{rel_base}/{fname}"), "mime": mime, "size": bytes.len() }))
}

/// The address book: people from the mail (ranked by how much and how lately), then the Calendar plugin's CardDAV
/// contacts not already there, when that plugin is there.
fn contacts(m: &Arc<Mail>, p: &Value) -> Result<Value, String> {
    let limit = p.get("limit").and_then(Value::as_u64).unwrap_or(8) as usize;
    let mut out: Vec<Value> = m.index.contacts(s(p, "q"), limit).into_iter().map(|c| json!(c)).collect();
    if out.len() < limit && s(p, "q").len() >= 2 {
        let have: Vec<String> = out.iter().filter_map(|c| c["addr"].as_str().map(str::to_lowercase)).collect();
        if let Ok(Value::Array(dav)) = m.core_post("/api/plugins/dav/tools/contacts", &json!({ "q": s(p, "q"), "limit": limit })).map(|v| v.get("contacts").cloned().unwrap_or(v)) {
            for c in dav {
                for e in c["emails"].as_array().into_iter().flatten().filter_map(Value::as_str) {
                    if out.len() < limit && !have.contains(&e.to_lowercase()) {
                        out.push(json!({ "name": c["name"], "addr": e.to_lowercase(), "sent": 0, "received": 0, "last": 0, "book": true }));
                    }
                }
            }
        }
    }
    Ok(json!({ "contacts": out }))
}

/// Today's and the coming days' events (the Calendar plugin's `agenda`), for the Home card; null without that plugin.
fn agenda(m: &Arc<Mail>, p: &Value) -> Result<Value, String> {
    Ok(m.core_post("/api/plugins/dav/tools/agenda", &json!({ "days": p.get("days").cloned().unwrap_or(json!(1)) })).unwrap_or(Value::Null))
}

// ----- writing

/// What the composer starts with for a reply / reply all / forward of a message: people, subject, files to carry.
fn compose_for(m: &Arc<Mail>, p: &Value) -> Result<Value, String> {
    let id = p.get("id").and_then(Value::as_i64).ok_or("which message?")?;
    let x = m.index.msg(id).ok_or("that message is gone")?;
    let acc = m.account(Some(&x.account))?;
    let mode = s(p, "mode");
    let forward = mode == "forward";
    let list = |ps: &[Person]| ps.iter().map(Person::display).collect::<Vec<_>>().join(", ");
    // the identity the mail was sent to answers it
    let mine: Vec<String> = acc.own();
    let ident = std::iter::once(acc.from.clone()).chain(acc.aliases.clone()).find(|i| x.to.iter().chain(&x.cc).any(|p| p.addr.eq_ignore_ascii_case(&parse::bare(i)))).unwrap_or_else(|| acc.from.clone());
    let (to, cc) = if forward { (vec![], vec![]) } else { compose::reply_people(&x.from, &x.reply_to, &x.to, &x.cc, mode == "all", &mine) };
    let mut files = vec![];
    if forward {
        if let Ok(raw) = m.rt.block_on(sync::body(m, id)) {
            if let Some(b) = parse::body(&raw) {
                files = b.attachments.iter().filter(|a| !a.inline).map(|a| json!({ "name": a.name, "mime": a.mime, "size": a.size, "from": [id, a.part] })).collect();
            }
        }
    }
    Ok(json!({
        "account": x.account, "from": ident, "to": list(&to), "cc": list(&cc), "subject": compose::reply_subject(&x.subject, forward),
        "reply_to": if forward { Value::Null } else { json!(id) }, "forward": if forward { json!(id) } else { Value::Null }, "files": files,
    }))
}

fn compose_of(p: &Value) -> Result<Compose, String> {
    serde_json::from_value(p.clone()).map_err(|e| format!("the message is not complete: {e}"))
}

/// The composer's text as the recipients will see it (the same Markdown → HTML as sending).
fn preview(_m: &Arc<Mail>, p: &Value) -> Result<Value, String> {
    Ok(json!({ "html": compose::markdown(s(p, "body")) }))
}

/// A message's index id by its Message-ID (a saved note's Reply finds the message it answers).
fn find(m: &Arc<Mail>, p: &Value) -> Result<Value, String> {
    let mid = s(p, "message_id").trim().trim_matches(['<', '>']).to_string();
    let accounts: Vec<String> = match s(p, "account") {
        "" => m.accounts().into_iter().flatten().map(|a| a.name).collect(),
        a => vec![a.to_string()],
    };
    let id = accounts.iter().find_map(|a| m.index.by_message_id(a, &mid).into_iter().next()).map(|x| x.id);
    Ok(json!({ "id": id }))
}

fn send_(m: &Arc<Mail>, p: &Value) -> Result<Value, String> {
    let c = compose_of(p)?;
    if c.send_at.is_some_and(|t| t > chrono::Utc::now().timestamp() + 30) {
        let mut r = m.rt.block_on(send::save_draft(m, &c))?;
        r["scheduled"] = json!(c.send_at);
        return Ok(r);
    }
    m.rt.block_on(send::send(m, &c))
}
fn save_draft(m: &Arc<Mail>, p: &Value) -> Result<Value, String> {
    m.rt.block_on(send::save_draft(m, &compose_of(p)?))
}
fn open_draft(m: &Arc<Mail>, p: &Value) -> Result<Value, String> {
    m.rt.block_on(send::open_draft(m, p.get("id").and_then(Value::as_i64).ok_or("which draft?")?))
}
fn discard_draft(m: &Arc<Mail>, p: &Value) -> Result<Value, String> {
    m.rt.block_on(ops::delete_forever(m, &ids(p)))?;
    Ok(json!({ "discarded": true }))
}

fn save_note(m: &Arc<Mail>, p: &Value) -> Result<Value, String> {
    let thread = match p.get("thread").and_then(Value::as_i64) {
        Some(t) => t,
        None => m.index.msg(p.get("id").and_then(Value::as_i64).ok_or("which conversation?")?).ok_or("that message is gone")?.thread,
    };
    Ok(json!({ "path": m.rt.block_on(crate::notes::save(m, thread))? }))
}

fn rules(m: &Arc<Mail>, _p: &Value) -> Result<Value, String> {
    let path = crate::rules::path(m);
    Ok(json!({ "rules": crate::rules::load(m), "path": path.strip_prefix(&m.root).unwrap_or(&path).to_string_lossy() }))
}
fn set_rules(m: &Arc<Mail>, p: &Value) -> Result<Value, String> {
    let rules: Vec<crate::rules::Rule> = serde_json::from_value(p.get("rules").cloned().unwrap_or(json!([]))).map_err(|e| e.to_string())?;
    Ok(json!({ "path": crate::rules::save(m, &rules)? }))
}

/// The templates: notes in `<mail folder>/templates/` (title = name; `subject:`, `to:`, `cc:` properties; the body).
fn templates(m: &Arc<Mail>, _p: &Value) -> Result<Value, String> {
    let dir = m.root.join(crate::rules::folder(m)).join("templates");
    let mut out = vec![];
    if let Ok(rd) = std::fs::read_dir(&dir) {
        for e in rd.flatten() {
            let p = e.path();
            if p.extension().is_none_or(|x| x != "md") {
                continue;
            }
            let text = std::fs::read_to_string(&p).unwrap_or_default();
            let (props, body) = front(&text);
            out.push(json!({ "name": p.file_stem().unwrap().to_string_lossy(), "subject": props.get("subject"), "to": props.get("to"), "cc": props.get("cc"), "body": body.trim(), "path": p.strip_prefix(&m.root).unwrap_or(&p).to_string_lossy() }));
        }
    }
    out.sort_by(|a, b| a["name"].as_str().cmp(&b["name"].as_str()));
    Ok(json!({ "templates": out, "folder": dir.strip_prefix(&m.root).unwrap_or(&dir).to_string_lossy() }))
}

fn front(text: &str) -> (HashMap<String, String>, String) {
    let mut props = HashMap::new();
    if let (Some(yaml), body) = atlas_text::frontmatter::split(text) {
        for line in yaml.lines() {
            if let Some((k, v)) = line.split_once(':') {
                props.insert(k.trim().to_string(), v.trim().trim_matches('"').to_string());
            }
        }
        return (props, body.trim_start_matches(['\r', '\n']).to_string());
    }
    (props, text.to_string())
}

/// Leave a mailing list: one click (RFC 8058) through the core; a mail to its address; or the page to open.
fn unsubscribe(m: &Arc<Mail>, p: &Value) -> Result<Value, String> {
    let id = p.get("id").and_then(Value::as_i64).ok_or("which message?")?;
    let x = m.index.msg(id).ok_or("that message is gone")?;
    let u = x.unsubscribe.ok_or("this mail names no way to unsubscribe")?;
    if u["one_click"].as_bool() == Some(true) {
        if let Some(url) = u["url"].as_str() {
            let req = json!({ "url": url, "method": "POST", "headers": { "content-type": "application/x-www-form-urlencoded" }, "body": "List-Unsubscribe=One-Click", "timeout_secs": 30 });
            let r = atlas_plugin::Atlas::new().post("/api/plugins/email/fetch", &req).map_err(|e| e.to_string())?;
            if r["ok"].as_bool() == Some(true) {
                return Ok(json!({ "done": "one-click" }));
            }
        }
    }
    if let Some(mailto) = u["mailto"].as_str() {
        let (addr, query) = mailto.trim_start_matches("mailto:").split_once('?').unwrap_or((mailto.trim_start_matches("mailto:"), ""));
        let q = crate::oauth::query_of(&format!("?{query}"));
        let c = Compose { account: x.account.clone(), to: addr.to_string(), subject: q.get("subject").cloned().unwrap_or_else(|| "unsubscribe".into()), body: q.get("body").cloned().unwrap_or_else(|| "unsubscribe".into()), no_quote: true, ..Default::default() };
        m.rt.block_on(send::send(m, &c))?;
        return Ok(json!({ "done": "mail", "to": addr }));
    }
    Ok(json!({ "open": u["url"] }))
}

/// Remote pictures always shown for a sender (an address, or "@domain").
fn allow_remote(m: &Arc<Mail>, p: &Value) -> Result<Value, String> {
    let who = s(p, "sender").to_lowercase();
    if who.is_empty() {
        return Err("for whom?".into());
    }
    m.index.set_pref(&format!("remote:{who}"), "1");
    Ok(json!({ "allowed": who }))
}

// ----- folders

fn folder_create(m: &Arc<Mail>, p: &Value) -> Result<Value, String> {
    let acc = m.account(Some(s(p, "account")))?;
    let name = s(p, "name").trim();
    if name.is_empty() {
        return Err("a folder needs a name".into());
    }
    let parent = s(p, "parent");
    let delim = m.index.role(&acc.name, "inbox").and_then(|f| f.delimiter).unwrap_or_else(|| "/".into());
    let path = if parent.is_empty() { crate::imap::mutf7_encode(name) } else { format!("{parent}{delim}{}", crate::imap::mutf7_encode(name)) };
    m.rt.block_on(async {
        let mut c = m.conn(&acc).await?;
        c.create(&path).await?;
        let list = c.folders().await?;
        m.give_back(c);
        m.index.set_folders(&acc.name, &list)
    })?;
    Ok(json!({ "path": path }))
}

fn folder_rename(m: &Arc<Mail>, p: &Value) -> Result<Value, String> {
    let acc = m.account(Some(s(p, "account")))?;
    let (from, name) = (s(p, "path"), s(p, "name").trim());
    let delim = m.index.folder(&acc.name, from).and_then(|f| f.delimiter).unwrap_or_else(|| "/".into());
    let to = match from.rfind(delim.as_str()) {
        Some(i) => format!("{}{delim}{}", &from[..i], crate::imap::mutf7_encode(name)),
        None => crate::imap::mutf7_encode(name),
    };
    m.rt.block_on(async {
        let mut c = m.conn(&acc).await?;
        c.rename_folder(from, &to).await?;
        let list = c.folders().await?;
        m.give_back(c);
        m.index.set_folders(&acc.name, &list)
    })?;
    let _ = m.rt.block_on(sync::account(m, &acc, Some(std::slice::from_ref(&to))));
    Ok(json!({ "path": to }))
}

fn folder_delete(m: &Arc<Mail>, p: &Value) -> Result<Value, String> {
    let acc = m.account(Some(s(p, "account")))?;
    let path = s(p, "path");
    if m.index.folder(&acc.name, path).and_then(|f| f.role).is_some_and(|r| r != "unimportant" && r != "snoozed") {
        return Err("that folder belongs to the account (inbox, sent, trash…): it stays".into());
    }
    m.rt.block_on(async {
        let mut c = m.conn(&acc).await?;
        c.delete_folder(path).await?;
        let list = c.folders().await?;
        m.give_back(c);
        m.index.set_folders(&acc.name, &list)
    })?;
    Ok(json!({ "deleted": path }))
}

/// The servers searched too (past what the index holds: bodies never fetched): every hit's header is added to the
/// index, so the list shows it.
fn search_server(m: &Arc<Mail>, p: &Value) -> Result<Value, String> {
    let q = search::parse(s(p, "query"), chrono::Utc::now().timestamp());
    let words: Vec<String> = q.words.iter().filter(|w| w.is_ascii() && !w.contains('"')).cloned().collect();
    if words.is_empty() {
        return Ok(json!({ "added": 0 }));
    }
    let crit = words.iter().map(|w| format!("TEXT \"{w}\"")).collect::<Vec<_>>().join(" ");
    let accounts: Vec<_> = match &q.account {
        Some(a) => vec![m.account(Some(a))?],
        None if !s(p, "account").is_empty() => vec![m.account(Some(s(p, "account")))?],
        None => m.accounts().into_iter().flatten().collect(),
    };
    let mut added = 0;
    for acc in accounts {
        let own = acc.own();
        let r: Result<usize, String> = m.rt.block_on(async {
            let mut c = m.conn(&acc).await?;
            let mut n = 0;
            for f in m.index.folders(Some(&acc.name)).into_iter().filter(|f| !matches!(f.role.as_deref(), Some("other" | "view" | "all"))) {
                if c.select(&f.path, false).await.is_err() {
                    continue;
                }
                let hits = c.search(&crit).await.unwrap_or_default();
                let have: std::collections::HashSet<u32> = m.index.uids(&acc.name, &f.path).into_iter().collect();
                let new: Vec<u32> = hits.into_iter().filter(|u| !have.contains(u)).collect();
                for chunk in new.chunks(200) {
                    let msgs = c.headers(chunk).await?;
                    n += m.index.add(&acc.name, &f.path, &own, &msgs)?.len();
                }
            }
            m.give_back(c);
            Ok(n)
        });
        added += r.unwrap_or(0);
    }
    Ok(json!({ "added": added }))
}

// ----- accounts: sign-in, rename, Thunderbird

fn signin_start(m: &Arc<Mail>, p: &Value) -> Result<Value, String> {
    let card = match p.get("record") {
        Some(r) if r.is_object() => r.clone(),
        _ => {
            let name = s(p, "account");
            crate::account::cards(&m.params()).into_iter().find(|c| name.is_empty() || c["name"] == name).ok_or("no such account")?
        }
    };
    crate::oauth::start(&card, &*m.post)
}

/// Settings → Accounts: each card's state in a few words (`account = { status = … }` in plugin.toml).
fn account_status(m: &Arc<Mail>, _: &Value) -> Result<Value, String> {
    let mut out = serde_json::Map::new();
    for (a, card) in m.accounts().into_iter().zip(crate::account::cards(&m.params())) {
        let name = card["name"].as_str().unwrap_or_default().to_string();
        let (state, text) = match a {
            Err(e) => ("error", e),
            Ok(a) if m.is_syncing(&a.name) => ("busy", "checking for mail…".to_string()),
            Ok(a) => {
                let st = m.status(&a.name);
                let unread = m.index.role(&a.name, "inbox").map(|f| f.unread).unwrap_or(0);
                match st["state"].as_str() {
                    Some("error") => ("error", st["error"].as_str().unwrap_or("the server refused").to_string()),
                    Some("idle") if st["errors"].as_array().is_some_and(|e| !e.is_empty()) => ("warn", format!("{} folder(s) failed", st["errors"].as_array().map_or(0, Vec::len))),
                    Some("idle") => ("ok", if unread > 0 { format!("connected · {unread} unread") } else { "connected".into() }),
                    _ => ("warn", "not checked yet".into()),
                }
            }
        };
        out.insert(name, json!({ "state": state, "text": text }));
    }
    Ok(Value::Object(out))
}

/// Settings → Accounts' Test: signs in to the IMAP server with the card as typed (a typed password, else the kept one).
fn test_account(m: &Arc<Mail>, p: &Value) -> Result<Value, String> {
    let mut card = p.get("record").cloned().unwrap_or(Value::Null);
    let name = card["name"].as_str().unwrap_or("test").trim().to_string();
    let mut params = m.params();
    if let Some(pw) = card.get("password").and_then(Value::as_str).filter(|x| !x.is_empty()) {
        params["secrets"][format!("accounts.{name}.password")] = json!(pw);
    }
    if let Some(o) = card.as_object_mut() {
        o.remove("password");
    }
    params["settings"]["accounts"] = json!([card]);
    let acc = match crate::account::pick(&params) {
        Ok(a) => a,
        Err(e) => return Ok(json!({ "ok": false, "text": e })),
    };
    let host = acc.imap.host.clone();
    let r = m.rt.block_on(async {
        let token = m.token(&acc).await?;
        let c = crate::imap::Imap::connect(&acc, token).await?;
        c.logout().await;
        Ok::<_, String>(())
    });
    Ok(match r {
        Ok(()) => json!({ "ok": true, "text": format!("signed in to {host}") }),
        Err(e) => json!({ "ok": false, "text": e }),
    })
}

/// "Open the Microsoft page again": the user's browser, never a window of Atlas (only Microsoft's pages).
fn signin_reopen(_: &Arc<Mail>, p: &Value) -> Result<Value, String> {
    let url = s(p, "url");
    let microsoft = ["https://login.microsoftonline.com/", "https://microsoft.com/", "https://www.microsoft.com/"].iter().any(|h| url.starts_with(h));
    if !microsoft {
        return Err("not a Microsoft sign-in page".into());
    }
    Ok(json!({ "opened": crate::oauth::open_browser(url) }))
}

fn signin_finish(m: &Arc<Mail>, p: &Value) -> Result<Value, String> {
    let wait = p.get("wait").and_then(Value::as_u64).unwrap_or(600);
    let r = crate::oauth::finish(Some(s(p, "redirect")).filter(|x| !x.is_empty()), wait, &*m.post)?;
    // the next calls use the new sign-in: kept connections and loops start over
    for a in m.accounts().into_iter().flatten() {
        m.drop_conns(&a.name);
    }
    Ok(r)
}

/// A card renamed in Settings: the index's rows and the saved notes' folder follow.
fn rename_account(m: &Arc<Mail>, p: &Value) -> Result<Value, String> {
    let (from, to) = (s(p, "from"), s(p, "to"));
    m.index.rename_account(from, to)?;
    m.drop_conns(from);
    m.watching.lock().unwrap().remove(from);
    let base = m.root.join(crate::rules::folder(m));
    let (a, b) = (base.join(crate::notes::note_name(from)), base.join(crate::notes::note_name(to)));
    let moved = a.is_dir() && !b.exists() && atlas_plugin::move_path(&a, &b).is_ok();
    Ok(json!({ "moved": moved }))
}

fn thunderbird(m: &Arc<Mail>, _p: &Value) -> Result<Value, String> {
    let taken: Vec<String> = crate::account::cards(&m.params()).iter().filter_map(|c| c["name"].as_str().map(String::from)).collect();
    Ok(crate::thunderbird::accounts(&taken))
}

fn thunderbird_mail(m: &Arc<Mail>, p: &Value) -> Result<Value, String> {
    let acc = m.account(Some(s(p, "account")))?;
    crate::thunderbird::import(m, &acc.name, &acc.user, p.get("dry").and_then(Value::as_bool).unwrap_or(true))
}

// ----- Claude's tools, with the user's permission (the card's `claude`: ask, always, never)

struct Ask {
    allow: Option<String>,
}
static ASKS: LazyLock<(Mutex<HashMap<String, Ask>>, Condvar)> = LazyLock::new(|| (Mutex::new(HashMap::new()), Condvar::new()));
const ASK_SECONDS: u64 = 120;

fn consent(m: &Mail, account: &str, what: &str) -> Result<crate::account::Account, String> {
    let acc = m.account(Some(account))?;
    match acc.claude {
        crate::account::Consent::Always => return Ok(acc),
        crate::account::Consent::Never => return Err(format!("the user does not let Claude read {} (its card in Email's settings: Claude may read = never)", acc.name)),
        crate::account::Consent::Ask => {}
    }
    let id = format!("{:x}", rand::random::<u64>());
    let (lock, cv) = &*ASKS;
    lock.lock().unwrap().insert(id.clone(), Ask { allow: None });
    m.event("consent", json!({ "id": id, "account": acc.name, "user": acc.user, "what": what }));
    let (mut g, timeout) = cv.wait_timeout_while(lock.lock().unwrap(), Duration::from_secs(ASK_SECONDS), |a| a.get(&id).is_some_and(|x| x.allow.is_none())).unwrap();
    let allow = g.remove(&id).and_then(|a| a.allow).unwrap_or_default();
    if timeout.timed_out() && allow.is_empty() {
        return Err(format!("no answer in Atlas within {ASK_SECONDS} s (the question was closed, or no Atlas window is open) — the user can allow it on {}'s card", acc.name));
    }
    if allow != "once" && allow != "always" {
        return Err(format!("the user said no to Claude reading {}", acc.name));
    }
    Ok(acc)
}

fn consent_answer(_m: &Arc<Mail>, p: &Value) -> Result<Value, String> {
    let (lock, cv) = &*ASKS;
    let mut g = lock.lock().unwrap();
    let ok = match g.get_mut(s(p, "id")) {
        Some(a) => {
            a.allow = Some(s(p, "allow").to_string()).filter(|x| !x.is_empty()).or(Some("no".into()));
            true
        }
        None => false,
    };
    cv.notify_all();
    Ok(json!({ "ok": ok }))
}

fn iso(t: i64) -> String {
    chrono::DateTime::from_timestamp(t, 0).map(|d| d.to_rfc3339()).unwrap_or_default()
}

fn agent_list(m: &Arc<Mail>, p: &Value) -> Result<Value, String> {
    let limit = p.get("limit").and_then(Value::as_u64).unwrap_or(20).min(100) as usize;
    let unseen = p.get("unseen").and_then(Value::as_bool).unwrap_or(false);
    let acc = consent(m, s(p, "account"), &format!("the senders and subjects of the newest {limit} messages{}", if unseen { " (unread)" } else { "" }))?;
    let folder = Some(s(p, "folder")).filter(|f| !f.is_empty()).map(String::from).or_else(|| m.index.role(&acc.name, "inbox").map(|f| f.path)).unwrap_or_else(|| "INBOX".into());
    let _ = m.rt.block_on(sync::account(m, &acc, Some(std::slice::from_ref(&folder))));
    let filter = unseen.then(|| ("m.seen=0".to_string(), vec![]));
    let rows = m.index.list(&Scope { folders: vec![(acc.name.clone(), folder.clone())], filter, text: None, flat: true, pin: false }, limit, 0);
    let list = |ps: &[Person]| ps.iter().map(Person::display).collect::<Vec<_>>().join(", ");
    let out: Vec<Value> = rows
        .iter()
        .filter_map(|c| m.index.msg(c.id))
        .map(|x| json!({ "uid": x.uid.to_string(), "id": x.id, "from": list(&x.from), "to": list(&x.to), "subject": x.subject, "date": iso(x.date), "seen": x.seen, "flagged": x.flagged, "message_id": format!("<{}>", x.message_id), "folder": folder, "kind": x.kind }))
        .collect();
    Ok(json!({ "messages": out, "account": acc.name }))
}

fn find_msg(m: &Mail, acc: &str, p: &Value) -> Result<Msg, String> {
    if let Some(id) = p.get("id").and_then(Value::as_i64) {
        return m.index.msg(id).ok_or_else(|| "no such message".into());
    }
    if let Some(mid) = Some(s(p, "message_id")).filter(|x| !x.is_empty()) {
        return m.index.by_message_id(acc, mid.trim_matches(['<', '>'])).into_iter().next().ok_or_else(|| format!("no message {mid}"));
    }
    let uid: u32 = s(p, "uid").parse().or_else(|_| p.get("uid").and_then(Value::as_u64).map(|u| u as u32).ok_or(())).map_err(|_| "which message? a uid from email_inbox")?;
    let folder = Some(s(p, "folder")).filter(|f| !f.is_empty()).map(String::from).or_else(|| m.index.role(acc, "inbox").map(|f| f.path)).unwrap_or_else(|| "INBOX".into());
    m.index.id_of(acc, &folder, uid).and_then(|id| m.index.msg(id)).ok_or_else(|| format!("no message {uid} in {folder}"))
}

fn agent_get(m: &Arc<Mail>, p: &Value) -> Result<Value, String> {
    let acc = consent(m, s(p, "account"), &format!("one message in full (uid {})", p.get("uid").map(|u| u.to_string()).unwrap_or_default()))?;
    let x = find_msg(m, &acc.name, p)?;
    let raw = m.rt.block_on(sync::body(m, x.id))?;
    let b = parse::body(&raw).ok_or("cannot read the message")?;
    let list = |ps: &[Person]| ps.iter().map(Person::display).collect::<Vec<_>>().join(", ");
    Ok(json!({
        "uid": x.uid.to_string(), "from": list(&x.from), "to": list(&x.to), "cc": list(&x.cc), "subject": x.subject, "date": iso(x.date),
        "message_id": format!("<{}>", x.message_id), "text": b.text, "attachments": b.attachments.iter().filter(|a| !a.inline).map(|a| json!({ "name": a.name, "type": a.mime, "size": a.size, "part": a.part })).collect::<Vec<_>>(),
        "invite": b.invite,
    }))
}

/// Text an agent is given as it is (larger ones are cut and said so); anything else is a file it reads itself.
const AGENT_TEXT_MAX: usize = 200_000;

/// Whether an attachment is text an agent reads inline: text/*, and the textual application types.
fn texty(mime: &str, name: &str) -> bool {
    let mime = mime.to_ascii_lowercase();
    mime.starts_with("text/")
        || ["application/json", "application/xml", "application/csv", "application/x-tex", "application/ics", "application/x-yaml", "application/yaml"].contains(&mime.as_str())
        || mime.ends_with("+json")
        || mime.ends_with("+xml")
        || (mime == "application/octet-stream" && [".txt", ".md", ".csv", ".tsv", ".json", ".tex", ".bib", ".ics", ".vcf", ".yaml", ".yml", ".toml", ".log", ".py", ".rs", ".js", ".ts"].iter().any(|e| name.to_ascii_lowercase().ends_with(e)))
}

/// An agent's `email_attachment`: one attachment of a message (by its `part` from email_read, else its `name`). Text
/// comes back as `text`; anything else (a PDF, a picture, an office file) is written to the plugin's cache and its
/// `path` (absolute) given, for the agent to open with its own reader. Read-only, asked first like email_read.
fn agent_attachment(m: &Arc<Mail>, p: &Value) -> Result<Value, String> {
    let want = p.get("part").and_then(Value::as_u64).map(|n| n.to_string()).unwrap_or_else(|| s(p, "name").to_string());
    let acc = consent(m, s(p, "account"), &format!("an attachment ({want}) of the message uid {}", p.get("uid").map(|u| u.to_string()).unwrap_or_default()))?;
    let x = find_msg(m, &acc.name, p)?;
    let raw = m.rt.block_on(sync::body(m, x.id))?;
    let b = parse::body(&raw).ok_or("cannot read the message")?;
    let files: Vec<&parse::Attachment> = b.attachments.iter().filter(|a| !a.inline).collect();
    let a = match p.get("part").and_then(Value::as_u64) {
        Some(n) => files.iter().find(|a| u64::from(a.part) == n),
        None => files.iter().find(|a| a.name == s(p, "name")).or_else(|| files.iter().find(|a| a.name.eq_ignore_ascii_case(s(p, "name")))),
    }
    .ok_or_else(|| format!("no such attachment; it has: {}", if files.is_empty() { "none".to_string() } else { files.iter().map(|a| format!("{} (part {})", a.name, a.part)).collect::<Vec<_>>().join(", ") }))?;
    let (bytes, _, mime) = parse::part_bytes(&raw, a.part).ok_or("that file is no longer in the message")?;
    if texty(&mime, &a.name) {
        let text = String::from_utf8_lossy(&bytes);
        let cut = text.len() > AGENT_TEXT_MAX;
        let mut end = AGENT_TEXT_MAX.min(text.len());
        while !text.is_char_boundary(end) {
            end -= 1;
        }
        return Ok(json!({ "name": a.name, "type": mime, "size": bytes.len(), "text": &text[..end], "truncated": cut }));
    }
    let saved = attachment(m, &json!({ "id": x.id, "part": a.part, "name": a.name }))?;
    let rel = saved["path"].as_str().unwrap_or_default();
    let abs = if std::path::Path::new(rel).is_absolute() { std::path::PathBuf::from(rel) } else { m.root.join(rel) };
    Ok(json!({ "name": a.name, "type": mime, "size": bytes.len(), "path": abs.to_string_lossy(), "vault_path": rel, "note": "not text: read the file at path (a PDF, a picture or an office file) with your own file reader" }))
}

/// Claude's `email_send`: only when the user asked for this exact mail (the tool's description says so).
fn agent_send(m: &Arc<Mail>, p: &Value) -> Result<Value, String> {
    let acc = m.account(Some(s(p, "account")))?;
    let reply_to = Some(s(p, "in_reply_to")).filter(|x| !x.is_empty()).and_then(|mid| m.index.by_message_id(&acc.name, mid.trim_matches(['<', '>'])).into_iter().next()).map(|x| x.id);
    let files = p.get("files").and_then(Value::as_array).map(|a| a.iter().filter_map(Value::as_str).map(|f| send::FileIn { name: f.rsplit('/').next().unwrap_or(f).to_string(), path: Some(f.to_string()), ..Default::default() }).collect()).unwrap_or_default();
    let c = Compose { account: acc.name.clone(), to: s(p, "to").into(), cc: s(p, "cc").into(), subject: s(p, "subject").into(), body: s(p, "text").into(), reply_to, no_quote: reply_to.is_none(), files, ..Default::default() };
    m.rt.block_on(send::send(m, &c))
}

/// The importance mark (the pane's i / n, Claude's `email_mark`): `ops::importance`.
fn set_importance(m: &Arc<Mail>, p: &Value) -> Result<Value, String> {
    let acc = m.account(Some(s(p, "account")))?;
    let x = find_msg(m, &acc.name, p)?;
    let clear = p.get("clear").and_then(Value::as_bool).unwrap_or(false);
    let important = p.get("important").and_then(Value::as_bool).unwrap_or(false);
    let to = if clear { ops::Importance::Clear } else if important { ops::Importance::Important } else { ops::Importance::NotImportant };
    m.rt.block_on(ops::importance(m, &[x.id], to))?;
    let y = m.index.msg(x.id).ok_or("the message is gone")?;
    Ok(json!({ "important": if clear { Value::Null } else { json!(important) }, "flagged": y.flagged, "folder": y.folder, "uid": y.uid.to_string(), "message_id": format!("<{}>", y.message_id) }))
}

fn agent_accounts(m: &Arc<Mail>, _p: &Value) -> Result<Value, String> {
    let list: Vec<Value> = m.accounts().into_iter().flatten().map(|a| json!({ "name": a.name, "user": a.user, "main": a.main })).collect();
    Ok(json!({ "accounts": list }))
}

/// Claude's `email_rules`.
fn agent_rules(m: &Arc<Mail>, p: &Value) -> Result<Value, String> {
    rules(m, p)
}

/// Claude's `email_add_rule`: `{ when, actions, apply_now? }`.
fn agent_add_rule(m: &Arc<Mail>, p: &Value) -> Result<Value, String> {
    let actions: Vec<String> = match p.get("actions") {
        Some(Value::Array(a)) => a.iter().filter_map(Value::as_str).map(str::to_string).collect(),
        Some(Value::String(s)) => s.split(',').map(|a| a.trim().to_string()).filter(|a| !a.is_empty()).collect(),
        _ => vec![],
    };
    if actions.is_empty() {
        return Err("what should the rule do? actions, e.g. [\"important\"]".into());
    }
    let rule = crate::rules::Rule { when: s(p, "when").trim().to_string(), actions };
    let path = crate::rules::add(m, rule.clone())?;
    let mut applied = 0;
    if p.get("apply_now").and_then(Value::as_bool).unwrap_or(false) {
        for acc in m.accounts().into_iter().flatten() {
            let Some(inbox) = m.index.role(&acc.name, "inbox") else { continue };
            let ids: Vec<i64> = m.index.newest_uids(&acc.name, &inbox.path, 500).into_iter().filter_map(|u| m.index.id_of(&acc.name, &inbox.path, u)).collect();
            let hit = crate::rules::matching(m, &acc, &rule, &ids);
            if !hit.is_empty() {
                applied += hit.len();
                m.rt.block_on(crate::rules::act(m, &acc, &rule, &hit));
            }
        }
    }
    m.event("rules", json!({ "path": path }));
    Ok(json!({ "path": path, "rule": format!("{} => {}", rule.when, rule.actions.join(", ")), "applied_now": applied }))
}

/// Claude's `email_remove_rule`.
fn agent_remove_rule(m: &Arc<Mail>, p: &Value) -> Result<Value, String> {
    let removed = crate::rules::remove(m, s(p, "when"))?;
    if removed {
        m.event("rules", json!({}));
    }
    Ok(json!({ "removed": removed }))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::sync::tests_support::harness;

    fn call_(m: &Arc<Mail>, name: &str, p: Value) -> Value {
        let f = table().into_iter().find(|(n, _)| *n == name).unwrap().1;
        call(m, f, &p).unwrap()
    }

    #[test]
    fn the_pane_lists_reads_searches_and_counts() {
        let (m, _s, _e, _d) = harness(true);
        call_(&m, "sync", json!({}));
        let inbox = call_(&m, "list", json!({ "account": "fake", "view": "inbox" }));
        assert_eq!(inbox["total"], 3);
        assert_eq!(inbox["unread"], 2);
        let unified = call_(&m, "list", json!({ "view": "inbox" }));
        assert_eq!(unified["total"], 3);
        let first = &inbox["rows"][1];
        let t = call_(&m, "thread", json!({ "id": first["id"], "read": true }));
        assert_eq!(t["messages"][0]["body"]["attachments"][0]["name"], "notes.txt");
        assert!(t["messages"][0]["body"]["html"].as_str().unwrap().contains("Here is the draft"));
        let hits = call_(&m, "list", json!({ "query": "from:grace draft" }));
        assert_eq!(hits["total"], 1);
        assert_eq!(hits["chips"][0], json!(["from", "grace"]));
        let lect = call_(&m, "list", json!({ "query": "in:\"Lectures été\"" }));
        assert_eq!(lect["total"], 2);
        let html = call_(&m, "list", json!({ "query": "newsletter" }));
        let tid = html["rows"][0]["id"].clone();
        let t = call_(&m, "thread", json!({ "id": tid }));
        let b = &t["messages"][0]["body"];
        assert_eq!(b["remote"], 1);
        assert!(b["html"].as_str().unwrap().contains("data:image/png;base64,"));
        assert!(!b["html"].as_str().unwrap().contains("<script"));
        assert_eq!(t["messages"][0]["unsubscribe"]["one_click"], true);
        let c = call_(&m, "count", json!({}));
        assert_eq!(c["inbox"]["total"], 3);
        assert_eq!(c["newsletter"]["total"], 0);
        let cs = call_(&m, "contacts", json!({ "q": "gr" }));
        assert_eq!(cs["contacts"][0]["addr"], "grace@example.org");
    }

    #[test]
    fn replies_are_prepared_for_the_composer() {
        let (m, _s, _e, _d) = harness(true);
        call_(&m, "sync", json!({}));
        let id = m.index.id_of("fake", "INBOX", 2).unwrap();
        let r = call_(&m, "compose_for", json!({ "id": id, "mode": "reply" }));
        assert_eq!(r["to"], "Grace Hopper <grace@example.org>");
        assert_eq!(r["subject"], "Re: Draft of the DCA section");
        let f = call_(&m, "compose_for", json!({ "id": id, "mode": "forward" }));
        assert_eq!(f["subject"], "Fwd: Draft of the DCA section");
        assert_eq!(f["files"][0]["name"], "notes.txt");
    }

    #[test]
    fn claude_asks_first_and_never_marks_read() {
        let (m, _s, events, _d) = harness(true);
        call_(&m, "sync", json!({}));
        let m2 = m.clone();
        let asker = std::thread::spawn(move || {
            let f = table().into_iter().find(|(n, _)| *n == "agent_list").unwrap().1;
            call(&m2, f, &json!({ "limit": 5 }))
        });
        let id = loop {
            if let Some((_, d)) = events.lock().unwrap().iter().find(|(n, _)| n == "consent") {
                break d["id"].as_str().unwrap().to_string();
            }
            std::thread::sleep(Duration::from_millis(20));
        };
        call_(&m, "consent_answer", json!({ "id": id, "allow": "once" }));
        let r = asker.join().unwrap().unwrap();
        assert_eq!(r["messages"].as_array().unwrap().len(), 3);
        // a no
        let m3 = m.clone();
        let asker = std::thread::spawn(move || {
            let f = table().into_iter().find(|(n, _)| *n == "agent_get").unwrap().1;
            call(&m3, f, &json!({ "uid": "2" }))
        });
        let id = loop {
            let ev = events.lock().unwrap();
            let ids: Vec<String> = ev.iter().filter(|(n, _)| n == "consent").map(|(_, d)| d["id"].as_str().unwrap().to_string()).collect();
            if ids.len() == 2 {
                break ids[1].clone();
            }
            drop(ev);
            std::thread::sleep(Duration::from_millis(20));
        };
        call_(&m, "consent_answer", json!({ "id": id, "allow": "" }));
        assert!(asker.join().unwrap().unwrap_err().contains("said no"));
        assert_eq!(m.index.role("fake", "inbox").unwrap().unread, 2, "nothing marked read");
    }

    #[test]
    fn an_agent_reads_an_attachment_as_text_or_gets_its_file() {
        let (m, _s, events, _d) = harness(true);
        call_(&m, "sync", json!({}));
        let ask = |p: Value| {
            let m2 = m.clone();
            let before = events.lock().unwrap().iter().filter(|(n, _)| n == "consent").count();
            let t = std::thread::spawn(move || {
                let f = table().into_iter().find(|(n, _)| *n == "agent_attachment").unwrap().1;
                call(&m2, f, &p)
            });
            let id = loop {
                let ev = events.lock().unwrap();
                let ids: Vec<String> = ev.iter().filter(|(n, _)| n == "consent").map(|(_, d)| d["id"].as_str().unwrap().to_string()).collect();
                if ids.len() > before {
                    break ids[before].clone();
                }
                drop(ev);
                std::thread::sleep(Duration::from_millis(20));
            };
            call_(&m, "consent_answer", json!({ "id": id, "allow": "once" }));
            t.join().unwrap()
        };
        let r = ask(json!({ "uid": "2", "name": "notes.txt" })).unwrap();
        assert_eq!(r["name"], "notes.txt");
        assert!(!r["text"].as_str().unwrap().is_empty(), "a text attachment comes back as its text: {r}");
        assert!(r.get("path").is_none());
        let e = ask(json!({ "uid": "2", "name": "nothing.pdf" })).unwrap_err();
        assert!(e.contains("notes.txt"), "a wrong name lists what there is: {e}");
        assert!(!texty("application/pdf", "a.pdf") && texty("text/csv", "a.csv") && texty("application/octet-stream", "x.bib"));
    }

    #[test]
    fn a_view_of_a_folder_no_account_has_is_empty_not_everything() {
        let (m, _s, _e, _d) = harness(true);
        let acc = m.account(None).unwrap();
        m.rt.block_on(crate::sync::account(&m, &acc, None)).unwrap();
        let c = call_(&m, "count", json!({}));
        assert_eq!(c["unimportant"]["total"], 0, "no Not important folder yet");
        assert!(c["inbox"]["total"].as_u64().unwrap() > 0);
        let l = call_(&m, "list", json!({ "query": "in:unimportant" }));
        assert_eq!(l["rows"].as_array().unwrap().len(), 0);
    }

    #[test]
    fn the_address_book_adds_the_calendars_contacts_and_the_agenda_passes_through() {
        let (m, _s, _e, _d) = harness(true);
        let acc = m.account(None).unwrap();
        m.rt.block_on(crate::sync::account(&m, &acc, None)).unwrap();
        m.set_core(Arc::new(|path: &str, body: &Value| match path {
            "/api/plugins/dav/tools/contacts" => Ok(json!([{ "name": "Véronique T", "emails": ["VT@uni.example", "grace@example.org"] }, { "name": "q", "emails": [body["q"]] }])),
            "/api/plugins/dav/tools/agenda" => Ok(json!({ "events": [{ "time": "10:00", "line": "10:00 Group meeting" }] })),
            _ => Err("no".into()),
        }));
        let c = call_(&m, "contacts", json!({ "q": "gr", "limit": 8 }));
        let addrs: Vec<&str> = c["contacts"].as_array().unwrap().iter().map(|x| x["addr"].as_str().unwrap()).collect();
        assert!(addrs.contains(&"vt@uni.example"), "{addrs:?}");
        assert_eq!(addrs.iter().filter(|a| **a == "grace@example.org").count(), 1, "one entry per address: {addrs:?}");
        assert_eq!(call_(&m, "agenda", json!({}))["events"][0]["time"], "10:00");
        m.set_core(Arc::new(|_: &str, _: &Value| Err("no Calendar plugin".into())));
        assert!(call_(&m, "agenda", json!({})).is_null());
    }
}
