//! "Save as note": a conversation written as
//! a note in the existing thread-note shape (DESIGN-mail-notes.md), so the notes kept by the old plugin and these read
//! alike and the note view draws both. `<mail folder>/<account>/<folder>/<first date> <subject>.md`:
//! properties (type: email-thread, subject, message_id, account, folder, messages, unread, first, last, participants),
//! then a section per message — `## <date> · <from>`, a `<!-- mail {…} -->` marker with every header a reply needs
//! (uid included, which the old regrouped notes lacked), the body as it came in one HTML block, its files below.
//! Saving again adds the messages the note does not have yet.

use crate::index::Msg;
use crate::mail::Mail;
use crate::parse::{self, Person};
use regex::Regex;
use serde_json::{json, Value};
use std::path::{Path, PathBuf};
use std::sync::LazyLock;

static MARK: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"(?m)^<!-- mail (\{.*\}) -->$").unwrap());
static UNSAFE: LazyLock<Regex> = LazyLock::new(|| Regex::new(r#"[\\/:*?"<>|#^\[\]]"#).unwrap());
static REMOTE_SRC: LazyLock<Regex> = LazyLock::new(|| Regex::new(r#"(?i)\s(src|srcset|background)\s*=\s*("[^"]*"|'[^']*')"#).unwrap());
static REMOTE_URL: LazyLock<Regex> = LazyLock::new(|| Regex::new(r#"(?i)url\(\s*["']?\s*(?:https?:)?//[^)]*\)"#).unwrap());
static STYLE: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"(?is)<style\b.*?</style\s*>").unwrap());

/// A subject as a file name: no character a vault or a link refuses, one line, at most 70 characters.
pub fn note_name(text: &str) -> String {
    let s = UNSAFE.replace_all(text, " ");
    let s: String = s.split_whitespace().collect::<Vec<_>>().join(" ");
    let s: String = s.chars().take(70).collect::<String>().trim().to_string();
    if s.is_empty() { "Mail".into() } else { s }
}

fn iso(t: i64) -> String {
    chrono::DateTime::from_timestamp(t, 0).map(|d| d.with_timezone(&chrono::Local).format("%Y-%m-%dT%H:%M:%S%:z").to_string()).unwrap_or_default()
}

fn yaml(v: &Value) -> String {
    serde_json::to_string(v).unwrap_or_default()
}

/// A message's HTML as one raw-HTML block for a note: no `<style>` (it would restyle the app), no blank lines (they
/// would end the block), remote pictures kept as `data-remote` (blocked, as in the pane) unless allowed, cid:
/// pictures pointing at the files saved beside the note.
pub fn html_block(clean: &str, saved: &[(String, String)], remote: bool) -> String {
    let mut s = STYLE.replace_all(clean, "").into_owned();
    for (cid, path) in saved {
        s = s.replace(&format!("cid:{cid}"), &path.replace(' ', "%20"));
    }
    let blocked = if remote {
        0
    } else {
        let mut n = 0;
        s = REMOTE_SRC
            .replace_all(&s, |c: &regex::Captures| {
                let v = &c[2];
                if v.contains("://") || v.trim_matches(['"', '\'']).starts_with("//") {
                    n += 1;
                    format!(" data-remote-{}={}", c[1].to_lowercase(), v)
                } else {
                    c[0].to_string()
                }
            })
            .into_owned();
        s = REMOTE_URL.replace_all(&s, "none").into_owned();
        n
    };
    let lines: Vec<&str> = s.lines().map(str::trim).filter(|l| !l.is_empty()).collect();
    let banner = if blocked > 0 { format!("<p class=\"email-remote\">{blocked} remote image{} blocked — “Email: show remote images” shows them in this mail.</p>\n", if blocked == 1 { "" } else { "s" }) } else { String::new() };
    format!("<div class=\"email-html\">\n{banner}{}\n</div>", lines.join("\n"))
}

/// The files of a message saved beside its note (`<note> files/`), names never overwriting → (cid, vault path) of
/// inline pictures, and the vault paths of the listed files.
fn save_files(root: &Path, dir_rel: &str, raw: &[u8], body: &parse::Body) -> (Vec<(String, String)>, Vec<String>) {
    let mut inline = vec![];
    let mut listed = vec![];
    for a in &body.attachments {
        let Some((bytes, _, _)) = parse::part_bytes(raw, a.part) else { continue };
        let dir = root.join(dir_rel);
        if std::fs::create_dir_all(&dir).is_err() {
            continue;
        }
        let name = free_name(&dir, &note_file(&a.name));
        if std::fs::write(dir.join(&name), &bytes).is_err() {
            continue;
        }
        let rel = format!("{dir_rel}/{name}");
        match (&a.cid, a.inline) {
            (Some(cid), true) => inline.push((cid.clone(), rel)),
            _ => listed.push(rel),
        }
    }
    (inline, listed)
}

fn note_file(name: &str) -> String {
    let n = name.replace(['/', '\\', ':', '*', '?', '"', '<', '>', '|'], " ");
    if n.trim().is_empty() { "attachment".into() } else { n.trim().to_string() }
}

fn free_name(dir: &Path, name: &str) -> String {
    if !dir.join(name).exists() {
        return name.to_string();
    }
    let (stem, ext) = match name.rfind('.') {
        Some(i) if i > 0 => (&name[..i], &name[i..]),
        _ => (name, ""),
    };
    (2..).map(|n| format!("{stem} {n}{ext}")).find(|n| !dir.join(n).exists()).unwrap()
}

fn people(ps: &[Person]) -> String {
    ps.iter().map(Person::display).collect::<Vec<_>>().join(", ")
}

/// One message as a section of the conversation note.
fn section(m: &Mail, x: &Msg, folder_label: &str, files_dir: &str, raw: &[u8]) -> Result<String, String> {
    let body = parse::body(raw).ok_or("cannot read the message")?;
    let (inline, listed) = save_files(&m.root, files_dir, raw, &body);
    let remote = m.setting_bool("remote_images", false);
    let text = match &body.html {
        Some(_) => html_block(&crate::render::render(&body, &[]).html, &inline, remote),
        None => body.text.trim_end().to_string(),
    };
    let from = x.from.first().map(Person::display).unwrap_or_else(|| "(no sender)".into());
    let mut head = json!({ "message_id": format!("<{}>", x.message_id), "uid": x.uid.to_string(), "date": iso(x.date), "from": from, "folder": folder_label, "seen": x.seen });
    for (k, v) in [("to", people(&x.to)), ("cc", people(&x.cc)), ("reply_to", people(&x.reply_to)), ("in_reply_to", x.in_reply_to.iter().map(|i| format!("<{i}>")).collect::<Vec<_>>().join(" ")), ("references", x.references.iter().map(|i| format!("<{i}>")).collect::<Vec<_>>().join(" "))] {
        if !v.is_empty() {
            head[k] = json!(v);
        }
    }
    if x.flagged {
        head["important"] = json!(true);
    }
    let when = iso(x.date).get(..16).unwrap_or("").replace('T', " ");
    let files: String = listed.iter().map(|p| format!("- ![[{p}]]\n")).collect();
    Ok(format!("## {when} · {from}\n<!-- mail {} -->\n\n{text}\n{}", serde_json::to_string(&head).unwrap(), if files.is_empty() { String::new() } else { format!("\n{files}") }))
}

/// The note's properties from its sections' markers: messages, unread, first, last, participants.
fn props(text: &str) -> Vec<(&'static str, Value)> {
    let marks: Vec<Value> = MARK.captures_iter(text).filter_map(|c| serde_json::from_str(&c[1]).ok()).collect();
    let mut dates: Vec<String> = marks.iter().filter_map(|x| x["date"].as_str().map(String::from)).collect();
    dates.sort();
    let mut who: Vec<String> = vec![];
    for x in &marks {
        if let Some(f) = x["from"].as_str() {
            if !who.contains(&f.to_string()) {
                who.push(f.to_string());
            }
        }
    }
    vec![
        ("messages", json!(marks.len())),
        ("unread", json!(marks.iter().filter(|x| !x["seen"].as_bool().unwrap_or(false)).count())),
        ("first", json!(dates.first().cloned().unwrap_or_default())),
        ("last", json!(dates.last().cloned().unwrap_or_default())),
        ("participants", json!(who)),
    ]
}

/// The note's frontmatter with these properties set, the others kept.
fn with_props(text: &str, set: &[(&str, Value)]) -> String {
    let Some(end) = text[4..].find("\n---\n").map(|i| i + 4) else { return text.to_string() };
    let mut head: Vec<String> = text[4..end].lines().map(String::from).collect();
    for (k, v) in set {
        let line = format!("{k}: {}", yaml(v));
        match head.iter().position(|l| l.starts_with(&format!("{k}: "))) {
            Some(i) => head[i] = line,
            None => head.push(line),
        }
    }
    format!("---\n{}{}", head.join("\n"), &text[end..])
}

/// The note that already holds one of these message ids, in the account's mail folder.
fn existing(dir: &Path, ids: &[String]) -> Option<PathBuf> {
    let mut stack = vec![dir.to_path_buf()];
    while let Some(d) = stack.pop() {
        let Ok(rd) = std::fs::read_dir(&d) else { continue };
        for e in rd.flatten() {
            let p = e.path();
            if p.is_dir() {
                if !p.to_string_lossy().ends_with(" files") {
                    stack.push(p);
                }
            } else if p.extension().is_some_and(|x| x == "md") {
                if let Ok(t) = std::fs::read_to_string(&p) {
                    if ids.iter().any(|i| t.contains(&format!("\"message_id\":\"<{i}>\"")) || t.contains(&format!("\"message_id\": \"<{i}>\"")) || t.contains(&format!("message_id: \"<{i}>\""))) {
                        return Some(p);
                    }
                }
            }
        }
    }
    None
}

/// Saves a conversation as a note (or adds what is new to the note it has) → the note's vault path.
pub async fn save(m: &Mail, thread: i64) -> Result<String, String> {
    let msgs = m.index.thread(thread, false);
    if msgs.is_empty() {
        return Err("that conversation is gone".into());
    }
    let mut items = vec![];
    for x in msgs {
        let raw = crate::sync::body(m, x.id).await?;
        let label = m.index.folder(&x.account, &x.folder).map(|f| f.label).unwrap_or_else(|| x.folder.clone());
        items.push((x, raw, label));
    }
    let rel = write(m, &[], items)?;
    m.index.set_pref(&format!("note:{thread}"), &rel);
    Ok(rel)
}

/// Writes messages (oldest first) into the note of their conversation: the one that holds any of their ids or
/// `also` (a reply's references), else a new note named after the first → the note's vault path.
pub fn write(m: &Mail, also: &[String], items: Vec<(Msg, Vec<u8>, String)>) -> Result<String, String> {
    let (first, _, first_label) = items.first().ok_or("nothing to save")?.clone();
    let base = crate::rules::folder(m);
    let account_dir = format!("{base}/{}", note_name(&first.account));
    let mut ids: Vec<String> = items.iter().map(|(x, _, _)| x.message_id.clone()).collect();
    ids.extend(also.iter().cloned());
    let found = existing(&m.root.join(&account_dir), &ids);
    let (path, mut text) = match &found {
        Some(p) => (p.clone(), std::fs::read_to_string(p).map_err(|e| e.to_string())?),
        None => {
            let dir = m.root.join(&account_dir).join(note_name(&first_label));
            std::fs::create_dir_all(&dir).map_err(|e| format!("cannot make {}: {e}", dir.display()))?;
            let subject = Regex::new(r"(?i)^\s*((re|fwd?|tr|aw|sv|rv)\s*:\s*)+").unwrap().replace(&first.subject, "").to_string();
            let subject = if subject.is_empty() { "(no subject)".to_string() } else { subject };
            let stem = format!("{} {}", iso(first.date).get(..10).unwrap_or(""), note_name(&subject));
            let name = free_name(&dir, &format!("{stem}.md"));
            let head = format!(
                "---\ntype: email-thread\nsubject: {}\nmessage_id: {}\naccount: {}\nfolder: {}\n---\n# {subject}\n",
                yaml(&json!(subject)),
                yaml(&json!(format!("<{}>", first.message_id))),
                yaml(&json!(first.account)),
                yaml(&json!(first_label))
            );
            (dir.join(name), head)
        }
    };
    let stem = path.file_stem().unwrap().to_string_lossy().to_string();
    let dir_rel = path.parent().unwrap().strip_prefix(&m.root).unwrap_or(Path::new("")).to_string_lossy().to_string();
    let files_dir = format!("{dir_rel}/{stem} files");
    let mut added = 0;
    for (x, raw, label) in &items {
        if text.contains(&format!("\"message_id\":\"<{}>\"", x.message_id)) {
            continue;
        }
        let part = section(m, x, label, &files_dir, raw)?;
        text = format!("{}\n\n{part}", text.trim_end());
        added += 1;
    }
    let rel = path.strip_prefix(&m.root).unwrap_or(&path).to_string_lossy().into_owned();
    if added == 0 && found.is_some() {
        return Ok(rel);
    }
    let text = with_props(&text, &props(&text));
    std::fs::write(&path, text).map_err(|e| format!("cannot write {}: {e}", path.display()))?;
    Ok(rel)
}

/// Every message id the notes under `dir` hold (a thread's markers, a single note's property), without brackets.
pub fn ids_in_notes(dir: &Path) -> std::collections::HashSet<String> {
    let re = Regex::new(r#"(?m)"message_id":\s*"<([^>]+)>"|^message_id:\s*"<([^>]+)>""#).unwrap();
    let mut out = std::collections::HashSet::new();
    let mut stack = vec![dir.to_path_buf()];
    while let Some(d) = stack.pop() {
        let Ok(rd) = std::fs::read_dir(&d) else { continue };
        for e in rd.flatten() {
            let p = e.path();
            if p.is_dir() {
                stack.push(p);
            } else if p.extension().is_some_and(|x| x == "md") {
                if let Ok(t) = std::fs::read_to_string(&p) {
                    out.extend(re.captures_iter(&t).filter_map(|c| c.get(1).or(c.get(2)).map(|x| x.as_str().to_string())));
                }
            }
        }
    }
    out
}

/// The note a conversation was saved as, if any.
/// New or newly starred messages: a conversation already kept as a note is saved again (its new messages added); a
/// starred one is kept (`ops::save_important`). Rules ran first, so a rule's `important` is not done twice.
pub async fn follow(m: &Mail, ids: &[i64]) {
    let mut grow: Vec<i64> = vec![];
    let mut starred: Vec<i64> = vec![];
    for id in ids {
        let Some(x) = m.index.msg(*id) else { continue };
        if saved(m, x.thread).is_some() {
            grow.push(x.thread);
        } else if x.flagged {
            starred.push(*id);
        }
    }
    grow.sort();
    grow.dedup();
    for t in grow {
        if let Err(e) = save(m, t).await {
            m.event("status", serde_json::json!({ "state": "error", "error": format!("could not add to a kept conversation: {e}") }));
        }
    }
    crate::ops::save_important(m, &starred).await;
}

pub fn saved(m: &Mail, thread: i64) -> Option<String> {
    m.index.pref(&format!("note:{thread}")).filter(|p| m.root.join(p).exists())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::sync::tests_support::harness;

    #[test]
    fn a_conversation_becomes_a_thread_note_with_its_files_and_grows() {
        let (m, s, _e, d) = harness(true);
        let acc = m.account(None).unwrap();
        m.rt.block_on(crate::sync::account(&m, &acc, None)).unwrap();
        let id = m.index.id_of("fake", "INBOX", 2).unwrap();
        let thread = m.index.msg(id).unwrap().thread;
        let rel = m.rt.block_on(save(&m, thread)).unwrap();
        assert_eq!(rel, "mail/fake/Inbox/2026-10-13 Draft of the DCA section.md");
        let text = std::fs::read_to_string(d.path().join("vault").join(&rel)).unwrap();
        assert!(text.starts_with("---\ntype: email-thread\nsubject: \"Draft of the DCA section\"\nmessage_id: \"<seed-2@example.org>\"\naccount: \"fake\"\nfolder: \"Inbox\"\nmessages: 1\nunread: 1\n"), "{text}");
        assert!(text.contains("\"uid\":\"2\""), "the uid is kept");
        assert!(text.contains("- ![[mail/fake/Inbox/2026-10-13 Draft of the DCA section files/notes.txt]]"), "{text}");
        assert!(d.path().join("vault/mail/fake/Inbox/2026-10-13 Draft of the DCA section files/notes.txt").exists());
        assert_eq!(saved(&m, thread).as_deref(), Some(rel.as_str()));
        // a reply arrives; saving again adds it to the same note
        s.store.lock().unwrap().add("INBOX", b"From: Grace Hopper <grace@example.org>\r\nSubject: Re: Draft of the DCA section\r\nMessage-ID: <r@x>\r\nIn-Reply-To: <seed-2@example.org>\r\nDate: Wed, 14 Oct 2026 10:00:00 +0000\r\n\r\nOne more thing.\r\n".to_vec(), &["\\Seen"]);
        m.rt.block_on(crate::sync::account(&m, &acc, None)).unwrap();
        assert_eq!(m.rt.block_on(save(&m, thread)).unwrap(), rel);
        let text = std::fs::read_to_string(d.path().join("vault").join(&rel)).unwrap();
        assert!(text.contains("messages: 2\n"), "{text}");
        assert!(text.contains("One more thing."));
    }

    #[test]
    fn html_in_a_note_is_one_block_without_style_and_remote_pictures() {
        let h = html_block("<style>p{}</style>\n<p>a</p>\n\n   <img src=\"https://t/p.gif\">\n<img src=\"cid:logo@x\">", &[("logo@x".into(), "mail/a b/x.png".into())], false);
        assert_eq!(h, "<div class=\"email-html\">\n<p class=\"email-remote\">1 remote image blocked — “Email: show remote images” shows them in this mail.</p>\n<p>a</p>\n<img data-remote-src=\"https://t/p.gif\">\n<img src=\"mail/a%20b/x.png\">\n</div>");
    }
}
