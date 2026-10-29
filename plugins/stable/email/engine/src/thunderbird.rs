//! Thunderbird on this computer (the usual profile folder, the flatpak's, the snap's): its accounts as cards ready to
//! add (passwords are not read — Thunderbird keeps them encrypted), and the mail it keeps locally for an account that
//! the server no longer has (a POP account's), written as notes only when the user asks.

use crate::index::Msg;
use crate::mail::Mail;
use crate::parse;
use regex::Regex;
use serde_json::{json, Value};
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

fn roots() -> Vec<PathBuf> {
    let home = std::env::var_os("HOME").map(PathBuf::from).unwrap_or_default();
    ["/.thunderbird", "/.var/app/org.mozilla.Thunderbird/.thunderbird", "/snap/thunderbird/common/.thunderbird"].iter().map(|r| PathBuf::from(format!("{}{r}", home.display()))).collect()
}

/// Every profile's prefs.js as key → value (strings unquoted; numbers and booleans as written).
fn profiles() -> Vec<(String, PathBuf, BTreeMap<String, String>)> {
    let re = Regex::new(r#"user_pref\("([^"]+)",\s*(?:"((?:[^"\\]|\\.)*)"|([^)]*?))\);"#).unwrap();
    let mut out = vec![];
    for root in roots() {
        let Ok(rd) = std::fs::read_dir(&root) else { continue };
        let mut profs: Vec<_> = rd.flatten().map(|e| e.path()).filter(|p| p.join("prefs.js").is_file()).collect();
        profs.sort();
        for prof in profs {
            let text = std::fs::read_to_string(prof.join("prefs.js")).unwrap_or_default();
            let prefs = re.captures_iter(&text).map(|c| (c[1].to_string(), c.get(2).or(c.get(3)).map(|v| v.as_str().trim().to_string()).unwrap_or_default())).collect();
            let label = format!("{}/{}", if root.to_string_lossy().contains("var/app") { "flatpak" } else { "thunderbird" }, prof.file_name().unwrap().to_string_lossy());
            out.push((label, prof, prefs));
        }
    }
    out
}

/// A short card name from an address: "me@uni.example" → "uni".
fn short(user: &str, host: &str) -> String {
    let dom = user.split('@').nth(1).unwrap_or(host);
    let parts: Vec<&str> = dom.split('.').collect();
    let pick = if parts.len() >= 2 { parts[parts.len() - 2] } else { dom };
    let s: String = pick.chars().filter(|c| c.is_ascii_alphanumeric() || "._-".contains(*c)).collect();
    if s.is_empty() { "mail".into() } else { s }
}

/// Thunderbird's accounts → { accounts: [{ profile, name, user, imap_host, …, record }] }; `taken`: card names in use.
pub fn accounts(taken: &[String]) -> Value {
    let mut out: Vec<Value> = vec![];
    let mut names: Vec<String> = taken.to_vec();
    for (label, _, prefs) in profiles() {
        let mut found: Vec<Value> = vec![];
        for (key, typ) in &prefs {
            let Some(srv) = key.strip_prefix("mail.server.").and_then(|k| k.strip_suffix(".type")) else { continue };
            if typ != "imap" && typ != "pop3" {
                continue;
            }
            let g = |k: &str| prefs.get(&format!("mail.server.{srv}.{k}")).cloned().unwrap_or_default();
            let mut host = g("hostname");
            if typ == "pop3" {
                // read over IMAP (this plugin speaks IMAP): pop.x → imap.x; Microsoft's is the same server
                if let Some(rest) = host.strip_prefix("pop.") {
                    host = format!("imap.{rest}");
                }
            }
            let oauth = g("authMethod") == "10";
            let outlook = oauth && (host.contains("office365") || host.contains("outlook"));
            let user = g("userName");
            let security = match g("socketType").as_str() {
                "2" => "starttls",
                "0" => "none",
                _ => "ssl",
            };
            let port: u16 = if typ == "pop3" { 993 } else { g("port").parse().unwrap_or(993) };
            found.push(json!({ "profile": label, "name": g("name"), "user": user, "imap_host": host, "imap_port": port, "security": security, "was": typ, "auth": if outlook { "outlook" } else if oauth { "oauth2 (not supported yet)" } else { "password" } }));
        }
        // SMTP servers, matched to an account by user name
        for (key, host) in &prefs {
            let Some(s) = key.strip_prefix("mail.smtpserver.").and_then(|k| k.strip_suffix(".hostname")) else { continue };
            let user = prefs.get(&format!("mail.smtpserver.{s}.username")).cloned().unwrap_or_default();
            let port: u16 = prefs.get(&format!("mail.smtpserver.{s}.port")).and_then(|p| p.parse().ok()).unwrap_or(587);
            if let Some(acc) = found.iter_mut().find(|a| a["user"] == user.as_str() && a.get("smtp_host").is_none()) {
                acc["smtp_host"] = json!(host);
                acc["smtp_port"] = json!(port);
            }
        }
        out.extend(found);
    }
    for acc in &mut out {
        let base = short(acc["user"].as_str().unwrap_or(""), acc["imap_host"].as_str().unwrap_or(""));
        let name = (1..).map(|n| if n == 1 { base.clone() } else { format!("{base}{n}") }).find(|n| !names.contains(n)).unwrap();
        names.push(name.clone());
        let mut card = json!({ "name": name, "user": acc["user"], "auth": if acc["auth"] == "outlook" { "outlook" } else { "password" } });
        if acc["auth"] != "outlook" {
            for k in ["imap_host", "imap_port", "security", "smtp_host", "smtp_port"] {
                if !acc[k].is_null() {
                    card[k] = acc[k].clone();
                }
            }
        }
        acc["record"] = card;
    }
    json!({ "accounts": out })
}

const LABELS: &[(&str, &str)] = &[("inbox", "Inbox"), ("sent", "Sent"), ("drafts", "Drafts"), ("archives", "Archives"), ("templates", "Templates"), ("junk", "Junk"), ("trash", "Trash")];

/// The mbox files Thunderbird keeps for an account (by its user name): (label, file).
fn local_folders(user: &str) -> Vec<(String, PathBuf)> {
    let mut out = vec![];
    for (_, prof, prefs) in profiles() {
        for (key, name) in &prefs {
            let Some(srv) = key.strip_prefix("mail.server.").and_then(|k| k.strip_suffix(".userName")) else { continue };
            if !name.eq_ignore_ascii_case(user) {
                continue;
            }
            let rel = prefs.get(&format!("mail.server.{srv}.directory-rel")).cloned().unwrap_or_default();
            let Some(rel) = rel.strip_prefix("[ProfD]") else { continue };
            let dir = prof.join(rel);
            let Ok(rd) = std::fs::read_dir(&dir) else { continue };
            for e in rd.flatten() {
                let f = e.file_name().to_string_lossy().to_string();
                if let Some((_, label)) = LABELS.iter().find(|(k, _)| *k == f.to_lowercase()) {
                    if e.path().is_file() {
                        out.push((label.to_string(), e.path()));
                    }
                }
            }
        }
    }
    out
}

/// The messages of an mbox file (">From " unescaped).
pub fn mbox(path: &Path) -> Vec<Vec<u8>> {
    let Ok(data) = std::fs::read(path) else { return vec![] };
    let mut out = vec![];
    let mut cur: Vec<u8> = vec![];
    let mut started = false;
    for line in data.split_inclusive(|b| *b == b'\n') {
        if line.starts_with(b"From ") {
            if started && !cur.is_empty() {
                out.push(std::mem::take(&mut cur));
            }
            started = true;
            continue;
        }
        if !started {
            continue;
        }
        if line.starts_with(b">From ") {
            cur.extend_from_slice(&line[1..]);
        } else {
            cur.extend_from_slice(line);
        }
    }
    if !cur.is_empty() {
        out.push(cur);
    }
    out
}

/// Local Thunderbird mail of an account that no note has (by Message-ID): counted (`dry`), or written as notes.
pub fn import(m: &Mail, account: &str, user: &str, dry: bool) -> Result<Value, String> {
    let folders = local_folders(user);
    if folders.is_empty() {
        return Ok(json!({ "missing": {}, "saved": [], "note": format!("Thunderbird keeps no local folders for {user} on this computer") }));
    }
    let account_dir = m.root.join(crate::rules::folder(m)).join(crate::notes::note_name(account));
    let have = crate::notes::ids_in_notes(&account_dir);
    let mut missing: BTreeMap<String, usize> = BTreeMap::new();
    let mut saved = vec![];
    let mut failed = vec![];
    for (label, file) in folders {
        for raw in mbox(&file) {
            let e = parse::envelope(&raw, None);
            if have.contains(&e.message_id) {
                continue;
            }
            *missing.entry(label.clone()).or_default() += 1;
            if dry {
                continue;
            }
            let x = Msg {
                id: 0,
                account: account.to_string(),
                folder: label.clone(),
                uid: 0,
                thread: 0,
                message_id: e.message_id.clone(),
                subject: e.subject.clone(),
                from: e.from.clone(),
                to: e.to.clone(),
                cc: e.cc.clone(),
                reply_to: e.reply_to.clone(),
                date: e.date,
                size: raw.len() as i64,
                seen: true,
                flagged: false,
                answered: false,
                draft: false,
                labels: vec![],
                kind: e.kind.as_str().into(),
                has_attachments: e.has_attachments,
                snippet: String::new(),
                in_reply_to: e.in_reply_to.clone(),
                references: e.references.clone(),
                unsubscribe: None,
                cached: true,
            };
            let refs: Vec<String> = e.in_reply_to.iter().chain(&e.references).cloned().collect();
            match crate::notes::write(m, &refs, vec![(x, raw, label.clone())]) {
                Ok(p) => saved.push(p),
                Err(err) => failed.push(format!("{label}: {}: {err}", e.message_id)),
            }
        }
    }
    Ok(json!({ "missing": missing, "saved": saved, "failed": failed, "dry": dry }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn mbox_files_split_and_unescape() {
        let d = tempfile::tempdir().unwrap();
        let p = d.path().join("Inbox");
        std::fs::write(&p, "From - Mon Oct 12 2026\nSubject: one\n\n>From the start\nbody\n\nFrom - Tue\nSubject: two\n\nx\n").unwrap();
        let v = mbox(&p);
        assert_eq!(v.len(), 2);
        assert_eq!(String::from_utf8_lossy(&v[0]), "Subject: one\n\nFrom the start\nbody\n\n");
    }

    #[test]
    fn card_names_from_addresses() {
        assert_eq!(short("me@univ.ca", ""), "univ");
        assert_eq!(short("", "imap.gmail.com"), "gmail");
    }
}
