//! Sending, drafts and sending later (DESIGN-mail-ui §3 "Composer"). The page holds a message a few seconds before
//! calling `send` (its Undo); drafts live in the server's Drafts (saved by themselves while typing), so they follow
//! the user to every client; a message to send later is a draft carrying `X-Atlas-Send-At` and the keyword
//! `$atlas-send-later`, sent by whichever Atlas engine runs when its time comes (the server's, through the mirror).

use crate::account::{Account, Auth};
use crate::compose::{self, Draft, File, Quote};
use crate::mail::Mail;
use crate::parse::{self, Person};
use base64::Engine;
use serde::Deserialize;
use serde_json::{json, Value};

pub const SEND_LATER: &str = "$atlas-send-later";
/// What Outlook and Gmail take in one message, attachments included.
const SEND_LIMIT: usize = 25 * 1024 * 1024;

#[derive(Debug, Clone, Default, Deserialize)]
pub struct FileIn {
    pub name: String,
    #[serde(default)]
    pub mime: String,
    /// the bytes, base64 (a file dropped on the composer)
    #[serde(default)]
    pub data: Option<String>,
    /// a vault file
    #[serde(default)]
    pub path: Option<String>,
    /// a part of the message forwarded (its index row id and part number)
    #[serde(default)]
    pub from: Option<(i64, u32)>,
}

/// What the composer sends to the engine.
#[derive(Debug, Clone, Default, Deserialize)]
pub struct Compose {
    #[serde(default)]
    pub account: String,
    /// an identity: one of the account's addresses ("Name <addr>"); empty = the card's From
    #[serde(default)]
    pub from: String,
    #[serde(default)]
    pub to: String,
    #[serde(default)]
    pub cc: String,
    #[serde(default)]
    pub bcc: String,
    #[serde(default)]
    pub subject: String,
    #[serde(default)]
    pub body: String,
    /// the message answered (index id): threads the reply and quotes it
    #[serde(default)]
    pub reply_to: Option<i64>,
    /// the message forwarded (index id)
    #[serde(default)]
    pub forward: Option<i64>,
    #[serde(default)]
    pub files: Vec<FileIn>,
    /// the draft this replaces (index id), dropped once this is saved or sent
    #[serde(default)]
    pub draft: Option<i64>,
    #[serde(default)]
    pub send_at: Option<i64>,
    /// leave the quoted message out
    #[serde(default)]
    pub no_quote: bool,
}

fn vault_file(m: &Mail, rel: &str) -> Result<Vec<u8>, String> {
    let rel = rel.trim_start_matches('/');
    if rel.split('/').any(|p| p == "..") {
        return Err(format!("{rel} is outside the vault"));
    }
    std::fs::read(m.root.join(rel)).map_err(|e| format!("cannot read {rel}: {e}"))
}

/// The composer's message as a [`Draft`]: the account's identity and signature, the quote of what it answers, the
/// files read (dropped, from the vault, or the forwarded message's own).
pub async fn draft_of(m: &Mail, c: &Compose) -> Result<(Account, Draft), String> {
    let acc = m.account(Some(&c.account))?;
    let from = if c.from.trim().is_empty() { compose::people(&acc.from).into_iter().next() } else { compose::people(&c.from).into_iter().next() }
        .unwrap_or(Person { name: String::new(), addr: acc.user.clone() });
    let mut d = Draft {
        from,
        to: compose::people(&c.to),
        cc: compose::people(&c.cc),
        bcc: compose::people(&c.bcc),
        subject: c.subject.clone(),
        body: c.body.clone(),
        signature: acc.signature.clone(),
        send_at: c.send_at,
        ..Default::default()
    };
    let parent = c.reply_to.or(c.forward);
    if let Some(pid) = parent {
        let p = m.index.msg(pid).ok_or("the message answered is gone from the index: open it again")?;
        if c.reply_to.is_some() {
            d.in_reply_to = Some(p.message_id.clone());
            d.references = p.references.clone();
        }
        if !c.no_quote {
            let raw = crate::sync::body(m, pid).await?;
            let b = parse::body(&raw).ok_or("cannot read the message answered")?;
            let images = parse::inline_images(&raw);
            let html = b.html.as_ref().map(|_| crate::render::render(&b, &images).html);
            d.quote = Some(Quote { from: p.from.first().cloned().unwrap_or_default(), to: p.to.clone(), cc: p.cc.clone(), subject: p.subject.clone(), date: p.date, html, text: b.text.clone(), forward: c.forward.is_some() });
        }
    }
    let mut total = 0;
    for f in &c.files {
        let bytes = if let Some(data) = &f.data {
            base64::engine::general_purpose::STANDARD.decode(data.trim()).map_err(|e| format!("{}: not base64: {e}", f.name))?
        } else if let Some(path) = &f.path {
            vault_file(m, path)?
        } else if let Some((id, part)) = f.from {
            let raw = crate::sync::body(m, id).await?;
            parse::part_bytes(&raw, part).map(|x| x.0).ok_or_else(|| format!("{} is no longer in the message", f.name))?
        } else {
            return Err(format!("{}: no data", f.name));
        };
        total += bytes.len();
        d.files.push(File { name: f.name.clone(), mime: f.mime.clone(), bytes });
    }
    if total > SEND_LIMIT {
        return Err(format!("the files make {} MB: mail servers take about 25 MB; share a link instead", total / (1024 * 1024)));
    }
    Ok((acc, d))
}

/// Whether the server files sent mail in Sent by itself (Gmail, Outlook): then no copy is appended.
fn files_sent(acc: &Account) -> bool {
    matches!(acc.auth, Auth::Outlook { .. }) || acc.smtp.host.contains("gmail") || acc.smtp.host.contains("google") || acc.smtp.host.contains("office365") || acc.smtp.host.contains("outlook")
}

/// Sends a message now → { message_id, refused, sent_copy }.
pub async fn send(m: &Mail, c: &Compose) -> Result<Value, String> {
    let (acc, d) = draft_of(m, c).await?;
    let (raw, id, rcpt) = compose::build(&d)?;
    let out = deliver(m, &acc, &d.from.addr, &rcpt, &raw).await?;
    if let Some(pid) = c.reply_to {
        let _ = crate::ops::flag(m, &[pid], "\\Answered", true).await;
    }
    if let Some(did) = c.draft {
        let _ = crate::ops::delete_forever(m, &[did]).await;
    }
    Ok(json!({ "message_id": id, "refused": out.0, "sent_copy": out.1 }))
}

/// SMTP, then the copy in Sent (unless the server files it) → (refused recipients, whether a copy was kept).
async fn deliver(m: &Mail, acc: &Account, from: &str, rcpt: &[String], raw: &[u8]) -> Result<(Vec<Value>, bool), String> {
    let token = m.token(acc).await?;
    let sent = crate::smtp::send(acc, token, from, rcpt, &compose::without_bcc(raw)).await?;
    let refused: Vec<Value> = sent.refused.iter().map(|(a, why)| json!({ "address": a, "why": why })).collect();
    let mut copy = false;
    if !files_sent(acc) {
        let to = crate::ops::folder_for(m, acc, "sent").await?;
        let mut c = m.conn(acc).await?;
        if c.append(&to, &["\\Seen"], &compose::without_bcc(raw)).await.is_ok() {
            copy = true;
        }
        m.give_back(c);
    }
    let sent_path = m.index.role(&acc.name, "sent").map(|f| f.path);
    let _ = crate::sync::account(m, acc, Some(&sent_path.into_iter().collect::<Vec<_>>())).await;
    Ok((refused, copy))
}

/// Answers an invitation (the reader's Accept / Maybe / Decline): an iTIP REPLY to the organiser from the address
/// it was sent to, then — unless declined — the event filed in the Calendar plugin's calendar (`dav_import_invite`),
/// when that plugin is there. → { sent, calendar: {…} | null, calendar_error? }
pub async fn answer_invite(m: &Mail, id: i64, partstat: &str) -> Result<Value, String> {
    let partstat = match partstat.to_uppercase().as_str() {
        p @ ("ACCEPTED" | "TENTATIVE" | "DECLINED") => p.to_string(),
        other => return Err(format!("not an answer: {other}")),
    };
    let x = m.index.msg(id).ok_or("that message is gone")?;
    let raw = crate::sync::body(m, id).await?;
    let inv = parse::body(&raw).and_then(|b| b.invite).ok_or("this message carries no invitation")?;
    if inv.organizer_addr.is_empty() {
        return Err("the invitation names no organiser to answer".into());
    }
    let acc = m.account(Some(&x.account))?;
    let own = acc.own();
    let ident = compose::people(&acc.from).into_iter().next().unwrap_or_else(|| Person { name: String::new(), addr: acc.user.clone() });
    // the address the invitation was for, else the account's own
    let me = inv.attendees.iter().map(|a| a.addr.clone()).find(|a| own.iter().any(|o| o.eq_ignore_ascii_case(a))).unwrap_or_else(|| ident.addr.clone());
    let ics = crate::ical::reply(&inv, &me, &ident.name, &partstat);
    let verb = match partstat.as_str() { "ACCEPTED" => "Accepted", "TENTATIVE" => "Tentative", _ => "Declined" };
    let said = match partstat.as_str() { "ACCEPTED" => "accepted", "TENTATIVE" => "tentatively accepted", _ => "declined" };
    let who = if ident.name.is_empty() { me.clone() } else { ident.name.clone() };
    use mail_builder::headers::{address::Address, content_type::ContentType};
    use mail_builder::mime::MimePart;
    let from = Address::new_address((!ident.name.is_empty()).then(|| ident.name.clone()), me.clone());
    let to = Address::new_address((!inv.organizer.is_empty() && inv.organizer != inv.organizer_addr).then(|| inv.organizer.clone()), inv.organizer_addr.clone());
    let msgid = compose::message_id(&me);
    let mut b = mail_builder::MessageBuilder::new()
        .from(from)
        .to(to)
        .subject(format!("{verb}: {}", inv.summary))
        .message_id(msgid.clone())
        .date(chrono::Utc::now().timestamp())
        .body(MimePart::new(
            "multipart/alternative",
            vec![
                MimePart::new("text/plain", format!("{who} has {said} this invitation.\n")),
                MimePart::new(ContentType::new("text/calendar").attribute("method", "REPLY").attribute("charset", "utf-8"), ics),
            ],
        ));
    if !x.message_id.is_empty() {
        b = b.in_reply_to(x.message_id.clone()).references(x.message_id.clone());
    }
    let out = b.write_to_vec().map_err(|e| format!("cannot build the answer: {e}"))?;
    deliver(m, &acc, &me, std::slice::from_ref(&inv.organizer_addr), &out).await?;
    m.index.set_pref(&format!("invite:{}", inv.uid), &partstat);
    let _ = crate::ops::flag(m, &[id], "\\Answered", true).await;
    if partstat == "DECLINED" {
        return Ok(json!({ "sent": true, "calendar": null }));
    }
    let args = json!({ "ics": inv.ics, "source": x.message_id, "partstat": partstat, "attendee": me });
    match m.core_post("/api/plugins/dav/tools/import_invite", &args) {
        Ok(v) => Ok(json!({ "sent": true, "calendar": v })),
        Err(e) => Ok(json!({ "sent": true, "calendar": null, "calendar_error": e })),
    }
}

/// Saves the composer's message in Drafts (replacing the draft it was) → { id } of the new draft's row.
pub async fn save_draft(m: &Mail, c: &Compose) -> Result<Value, String> {
    let (acc, d) = draft_of(m, c).await?;
    let (raw, msgid, _) = compose::build(&d)?;
    let drafts = crate::ops::folder_for(m, &acc, "drafts").await?;
    let mut flags = vec!["\\Draft", "\\Seen"];
    if d.send_at.is_some() {
        flags.push(SEND_LATER);
    }
    let mut conn = m.conn(&acc).await?;
    let uid = conn.append(&drafts, &flags, &raw).await;
    m.give_back(conn);
    uid?;
    if let Some(old) = c.draft {
        let _ = crate::ops::delete_forever(m, &[old]).await;
    }
    crate::sync::account(m, &acc, Some(std::slice::from_ref(&drafts))).await?;
    let id = m.index.by_message_id(&acc.name, &msgid).into_iter().find(|x| x.folder == drafts).map(|x| x.id);
    if let Some(id) = id {
        let _ = m.index.set_body(id, &raw);
    }
    Ok(json!({ "id": id, "message_id": msgid }))
}

/// What a draft says, for the composer to open it again (its body as the user wrote it, its people, its files).
pub async fn open_draft(m: &Mail, id: i64) -> Result<Value, String> {
    let x = m.index.msg(id).ok_or("that draft is gone")?;
    let raw = crate::sync::body(m, id).await?;
    let b = parse::body(&raw).ok_or("cannot read the draft")?;
    // the text part is what the user typed, followed by the signature and the quote: keep what they typed
    let typed = b.text.split("\n\n-- \n").next().unwrap_or(&b.text);
    let typed = typed.split("\n\nOn ").next().unwrap_or(typed).split("\n\n---------- Forwarded message").next().unwrap_or(typed);
    let parsed = parse::parser().parse(&raw[..]);
    let send_at = parsed.as_ref().and_then(|p| p.header_raw("X-Atlas-Send-At").and_then(|v| v.trim().parse::<i64>().ok()));
    let bcc: Vec<String> = parsed.as_ref().and_then(|p| p.bcc()).map(|b| b.iter().filter_map(|a| a.address().map(String::from)).collect()).unwrap_or_default();
    let parent = x.in_reply_to.first().and_then(|irt| m.index.by_message_id(&x.account, irt).into_iter().next()).map(|p| p.id);
    let list = |ps: &[Person]| ps.iter().map(Person::display).collect::<Vec<_>>().join(", ");
    Ok(json!({
        "account": x.account, "to": list(&x.to), "cc": list(&x.cc), "bcc": bcc.join(", "),
        "subject": x.subject, "body": typed.trim_end(), "reply_to": parent, "draft": id, "send_at": send_at,
        "files": b.attachments.iter().filter(|a| !a.inline).map(|a| json!({ "name": a.name, "mime": a.mime, "size": a.size, "from": [id, a.part] })).collect::<Vec<_>>(),
    }))
}

/// Drafts whose time has come (X-Atlas-Send-At ≤ now): sent, then taken out of Drafts.
pub async fn send_due(m: &Mail, acc: &Account) -> Result<usize, String> {
    let Some(drafts) = m.index.role(&acc.name, "drafts") else { return Ok(0) };
    let now = chrono::Utc::now().timestamp();
    let mut n = 0;
    for (id, flags) in m.index.flags_of_folder(&acc.name, &drafts.path) {
        if !flags.split_whitespace().any(|f| f.eq_ignore_ascii_case(SEND_LATER)) {
            continue;
        }
        let raw = crate::sync::body(m, id).await?;
        let Some(p) = parse::parser().parse(&raw[..]) else { continue };
        let Some(at) = p.header_raw("X-Atlas-Send-At").and_then(|v| v.trim().parse::<i64>().ok()) else { continue };
        if at > now {
            continue;
        }
        let e = parse::envelope(&raw, None);
        let mut rcpt: Vec<String> = e.to.iter().chain(&e.cc).map(|x| x.addr.clone()).collect();
        if let Some(b) = p.bcc() {
            rcpt.extend(b.iter().filter_map(|a| a.address().map(String::from)));
        }
        let from = e.from.first().map(|x| x.addr.clone()).unwrap_or_else(|| acc.user.clone());
        // the message as it goes out: no longer a draft, dated now
        let out = fresh_date(&raw);
        match deliver(m, acc, &from, &rcpt, &out).await {
            Ok(_) => {
                crate::ops::delete_forever(m, &[id]).await?;
                if let Some(irt) = e.in_reply_to.first() {
                    let parents: Vec<i64> = m.index.by_message_id(&acc.name, irt).iter().map(|x| x.id).collect();
                    let _ = crate::ops::flag(m, &parents, "\\Answered", true).await;
                }
                m.event("sent", json!({ "account": acc.name, "subject": e.subject, "later": true }));
                n += 1;
            }
            Err(err) => m.event("status", json!({ "account": acc.name, "state": "error", "error": format!("sending “{}” later failed: {err}", e.subject) })),
        }
    }
    Ok(n)
}

/// The Date header set to now (a message sent later is dated when it leaves).
fn fresh_date(raw: &[u8]) -> Vec<u8> {
    let Some(end) = raw.windows(4).position(|w| w == b"\r\n\r\n") else { return raw.to_vec() };
    let head = String::from_utf8_lossy(&raw[..end]).to_string();
    let now = chrono::Utc::now().to_rfc2822();
    let mut found = false;
    let lines: Vec<String> = head
        .split("\r\n")
        .map(|l| {
            if l.to_lowercase().starts_with("date:") {
                found = true;
                format!("Date: {now}")
            } else {
                l.to_string()
            }
        })
        .collect();
    let mut head = lines.join("\r\n");
    if !found {
        head = format!("Date: {now}\r\n{head}");
    }
    let mut v = head.into_bytes();
    v.extend_from_slice(&raw[end..]);
    v
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::sync::tests_support::harness;
    use std::sync::{Arc, Mutex};

    #[test]
    fn a_reply_is_sent_threaded_kept_in_sent_and_its_parent_marked_answered() {
        let (m, s, _e, d) = harness(true);
        let acc = m.account(None).unwrap();
        m.rt.block_on(crate::sync::account(&m, &acc, None)).unwrap();
        let parent = m.index.id_of("fake", "INBOX", 2).unwrap();
        let c = Compose { account: "fake".into(), to: "Grace Hopper <grace@example.org>, refuse@example.org".into(), bcc: "boss@example.org".into(), subject: "Re: Draft of the DCA section".into(), body: "Thanks, *looks good*.".into(), reply_to: Some(parent), ..Default::default() };
        let r = m.rt.block_on(send(&m, &c)).unwrap();
        assert_eq!(r["refused"][0]["address"], "refuse@example.org");
        assert_eq!(r["sent_copy"], true);
        let sent = std::fs::read_to_string(d.path().join("server/sent/1.eml")).unwrap();
        assert!(sent.contains("In-Reply-To: <seed-2@example.org>"), "{sent}");
        assert!(!sent.to_lowercase().contains("bcc:"), "Bcc never leaves");
        assert!(sent.contains("> Here is the draft, see the attached notes."));
        let st = s.store.lock().unwrap();
        assert_eq!(st.folders["Sent"].msgs.len(), 1);
        assert!(st.folders["INBOX"].msgs[1].flags.contains("\\Answered"));
        drop(st);
        // the reply is in the conversation, from Sent
        let x = m.index.msg(parent).unwrap();
        assert_eq!(m.index.thread(x.thread, false).len(), 2);
    }

    #[test]
    fn drafts_are_saved_replaced_and_reopened_and_a_late_one_is_sent_when_due() {
        let (m, s, _e, _d) = harness(true);
        let acc = m.account(None).unwrap();
        m.rt.block_on(crate::sync::account(&m, &acc, None)).unwrap();
        let mut c = Compose { account: "fake".into(), to: "ana@example.org".into(), subject: "Plan".into(), body: "first".into(), files: vec![FileIn { name: "a.txt".into(), data: Some("aGk=".into()), ..Default::default() }], ..Default::default() };
        let first = m.rt.block_on(save_draft(&m, &c)).unwrap();
        c.body = "second version".into();
        c.draft = first["id"].as_i64();
        let second = m.rt.block_on(save_draft(&m, &c)).unwrap();
        assert_eq!(s.store.lock().unwrap().folders["Drafts"].msgs.len(), 1, "the new draft replaced the old");
        let opened = m.rt.block_on(open_draft(&m, second["id"].as_i64().unwrap())).unwrap();
        assert_eq!(opened["body"], "second version");
        assert_eq!(opened["to"], "ana@example.org");
        assert_eq!(opened["files"][0]["name"], "a.txt");
        c.draft = second["id"].as_i64();
        c.send_at = Some(chrono::Utc::now().timestamp() - 1);
        m.rt.block_on(save_draft(&m, &c)).unwrap();
        assert_eq!(m.rt.block_on(send_due(&m, &acc)).unwrap(), 1);
        let st = s.store.lock().unwrap();
        assert!(st.folders["Drafts"].msgs.is_empty());
        assert_eq!(st.sent, 1);
        assert!(!String::from_utf8_lossy(&st.folders["Sent"].msgs[0].raw).contains("X-Atlas-Send-At"));
    }

    #[test]
    fn a_forward_carries_the_original_files() {
        let (m, _s, _e, d) = harness(true);
        let acc = m.account(None).unwrap();
        m.rt.block_on(crate::sync::account(&m, &acc, None)).unwrap();
        let orig = m.index.id_of("fake", "INBOX", 2).unwrap();
        let raw = m.rt.block_on(crate::sync::body(&m, orig)).unwrap();
        let part = parse::body(&raw).unwrap().attachments[0].part;
        let c = Compose { account: "fake".into(), to: "x@example.org".into(), subject: "Fwd: Draft".into(), body: "FYI".into(), forward: Some(orig), files: vec![FileIn { name: "notes.txt".into(), from: Some((orig, part)), ..Default::default() }], ..Default::default() };
        m.rt.block_on(send(&m, &c)).unwrap();
        let sent = std::fs::read_to_string(d.path().join("server/sent/1.eml")).unwrap();
        assert!(sent.contains("---------- Forwarded message ----------"));
        assert!(sent.contains("filename=\"notes.txt\"") || sent.contains("filename=notes.txt"), "{sent}");
    }

    #[test]
    fn an_invitation_is_answered_to_its_organiser_and_filed_in_the_calendar() {
        let (m, s, _e, d) = harness(true);
        let acc = m.account(None).unwrap();
        let ics = "BEGIN:VCALENDAR\r\nMETHOD:REQUEST\r\nBEGIN:VEVENT\r\nUID:meet-1@uni.example\r\nSEQUENCE:1\r\nSUMMARY:Group meeting\r\nDTSTART;TZID=America/Toronto:20261027T090000\r\nDTEND;TZID=America/Toronto:20261027T100000\r\nORGANIZER;CN=Ana:mailto:ana@uni.example\r\nATTENDEE;PARTSTAT=NEEDS-ACTION;CN=Me:mailto:me@example.org\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n";
        let raw = format!("From: Ana <ana@uni.example>\r\nTo: me@example.org\r\nSubject: Invitation: Group meeting\r\nMessage-ID: <inv-1@uni.example>\r\nDate: Tue, 20 Oct 2026 10:00:00 +0000\r\nContent-Type: text/calendar; method=REQUEST; charset=utf-8\r\n\r\n{ics}");
        s.store.lock().unwrap().add("INBOX", raw.into_bytes(), &[]);
        m.rt.block_on(crate::sync::account(&m, &acc, None)).unwrap();
        let id = m.index.by_message_id("fake", "inv-1@uni.example").into_iter().next().unwrap().id;
        let filed = Arc::new(Mutex::new(Value::Null));
        let f = filed.clone();
        m.set_core(Arc::new(move |path: &str, body: &Value| {
            *f.lock().unwrap() = json!({ "path": path, "body": body });
            Ok(json!({ "uid": "meet-1@uni.example", "status": "added" }))
        }));
        let r = m.rt.block_on(answer_invite(&m, id, "accepted")).unwrap();
        assert_eq!(r["calendar"]["status"], "added");
        let sent = std::fs::read_to_string(d.path().join("server/sent/1.eml")).unwrap();
        assert!(sent.contains("Subject: Accepted: Group meeting"), "{sent}");
        assert!(sent.contains("method=REPLY") || sent.contains("method=\"REPLY\""), "{sent}");
        assert!(sent.contains("PARTSTAT=ACCEPTED"), "{sent}");
        assert!(sent.contains("In-Reply-To: <inv-1@uni.example>"), "{sent}");
        let call = filed.lock().unwrap().clone();
        assert_eq!(call["path"], "/api/plugins/dav/tools/import_invite");
        assert_eq!(call["body"]["source"], "inv-1@uni.example");
        assert_eq!(call["body"]["attendee"], "me@example.org");
        assert_eq!(m.index.pref("invite:meet-1@uni.example").as_deref(), Some("ACCEPTED"));
        // declining sends the answer and files nothing
        *filed.lock().unwrap() = Value::Null;
        let r = m.rt.block_on(answer_invite(&m, id, "DECLINED")).unwrap();
        assert!(r["calendar"].is_null());
        assert!(filed.lock().unwrap().is_null());
    }
}
