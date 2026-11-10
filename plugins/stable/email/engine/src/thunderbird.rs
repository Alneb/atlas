//! Thunderbird on this computer (the usual profile folder, the flatpak's, the snap's): its accounts as cards ready to
//! add (passwords are not read — Thunderbird keeps them encrypted), and the mail it keeps locally for an account that
//! the server no longer has (a POP account's), put on the server when the user asks: the index and every device then
//! have it like any other mail.

use crate::account::Account;
use crate::mail::Mail;
use crate::parse;
use regex::Regex;
use serde_json::{json, Value};
use std::collections::{BTreeMap, HashSet};
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

/// Thunderbird's socketType / try_ssl: 0 none, 1 STARTTLS when offered, 2 STARTTLS, 3 TLS from the start.
fn tls_of(v: &str) -> &'static str {
    match v {
        "0" => "none",
        "1" | "2" => "starttls",
        _ => "ssl",
    }
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
            let security = tls_of(&g("socketType"));
            // Thunderbird writes no port when it is the default: left out, the card's own default follows the
            // security (993 or 143); a POP account's port is not IMAP's
            let port: Option<u16> = if typ == "pop3" { None } else { g("port").parse().ok() };
            found.push(json!({ "profile": label, "name": g("name"), "user": user, "imap_host": host, "imap_port": port, "security": security, "was": typ, "auth": if outlook { "outlook" } else if oauth { "oauth2 (not supported yet)" } else { "password" } }));
        }
        // SMTP servers, matched to an account by user name
        for (key, host) in &prefs {
            let Some(s) = key.strip_prefix("mail.smtpserver.").and_then(|k| k.strip_suffix(".hostname")) else { continue };
            let user = prefs.get(&format!("mail.smtpserver.{s}.username")).cloned().unwrap_or_default();
            // no port written: Thunderbird's default for its security (465 for TLS from the start, else 587)
            let tls = prefs.get(&format!("mail.smtpserver.{s}.try_ssl")).map(|t| tls_of(t));
            let port: u16 = prefs.get(&format!("mail.smtpserver.{s}.port")).and_then(|p| p.parse().ok()).unwrap_or(if tls == Some("ssl") { 465 } else { 587 });
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

/// Thunderbird's own `X-Mozilla-Status` bits that matter here: read, starred, and deleted (a message deleted in
/// Thunderbird stays in the mbox until the folder is compacted).
const MOZ_READ: u32 = 0x1;
const MOZ_FLAGGED: u32 = 0x4;
const MOZ_DELETED: u32 = 0x8;

fn mozilla_status(raw: &[u8]) -> u32 {
    String::from_utf8_lossy(&raw[..raw.len().min(16384)])
        .lines()
        .take_while(|l| !l.trim().is_empty())
        .find_map(|l| l.strip_prefix("X-Mozilla-Status:").map(|v| u32::from_str_radix(v.trim(), 16).unwrap_or(0)))
        .unwrap_or(0)
}

/// The server folder a Thunderbird folder goes to: its role, so the old Inbox lands in the Inbox, Sent in Sent.
fn role_of(label: &str) -> &'static str {
    match label {
        "Inbox" => "inbox",
        "Sent" => "sent",
        "Drafts" => "drafts",
        "Archives" => "archive",
        "Junk" => "junk",
        "Trash" => "trash",
        _ => "templates",
    }
}

/// One local message the server lacks.
#[derive(Debug)]
pub struct Upload {
    pub label: String,
    pub flags: Vec<&'static str>,
    pub date: i64,
    pub raw: Vec<u8>,
}

/// From Thunderbird's folders (label, its messages), the messages to put on the server: not deleted in Thunderbird,
/// whose Message-ID the account does not have yet (`known`; a message without one is named by its bytes, so a second
/// run finds it too), each once; line ends made CRLF, as IMAP wants.
pub fn plan(folders: Vec<(String, Vec<Vec<u8>>)>, known: &HashSet<String>) -> Vec<Upload> {
    let mut seen = known.clone();
    let mut out = vec![];
    for (label, msgs) in folders {
        for raw in msgs {
            let status = mozilla_status(&raw);
            if status & MOZ_DELETED != 0 {
                continue;
            }
            let e = parse::envelope(&raw, None);
            if !seen.insert(e.message_id.clone()) {
                continue;
            }
            let mut flags = vec![];
            if status & MOZ_READ != 0 || label != "Inbox" {
                flags.push("\\Seen");
            }
            if status & MOZ_FLAGGED != 0 {
                flags.push("\\Flagged");
            }
            out.push(Upload { label: label.clone(), flags, date: e.date, raw: crlf(&raw) });
        }
    }
    out
}

fn crlf(raw: &[u8]) -> Vec<u8> {
    let mut out = Vec::with_capacity(raw.len() + raw.len() / 40);
    for (i, b) in raw.iter().enumerate() {
        if *b == b'\n' && (i == 0 || raw[i - 1] != b'\r') {
            out.push(b'\r');
        }
        out.push(*b);
    }
    out
}

/// The mail Thunderbird keeps on this computer only (a POP account's) put on the account's server, where the index
/// and every device find it: counted by folder (`dry`), or uploaded into the folders of the same role, then synced.
/// What the server already has (by Message-ID) is skipped, so running it again adds nothing twice.
pub async fn upload(m: &Mail, acc: &Account, dry: bool) -> Result<Value, String> {
    let folders = local_folders(&acc.user);
    if folders.is_empty() {
        return Ok(json!({ "missing": {}, "uploaded": 0, "failed": [], "note": format!("Thunderbird keeps no local folders for {} on this computer", acc.user) }));
    }
    let known = m.index.msgids(&acc.name);
    let todo = plan(folders.iter().map(|(l, f)| (l.clone(), mbox(f))).collect(), &known);
    let mut missing: BTreeMap<String, usize> = BTreeMap::new();
    for u in &todo {
        *missing.entry(u.label.clone()).or_default() += 1;
    }
    if dry || todo.is_empty() {
        return Ok(json!({ "missing": missing, "uploaded": 0, "failed": [], "dry": dry }));
    }
    let mut targets: BTreeMap<String, String> = BTreeMap::new();
    for label in missing.keys() {
        let role = role_of(label);
        let path = match role {
            "inbox" => m.index.role(&acc.name, "inbox").map(|f| f.path).unwrap_or_else(|| "INBOX".into()),
            _ => crate::ops::folder_for(m, acc, role).await?,
        };
        targets.insert(label.clone(), path);
    }
    let mut c = m.conn(acc).await?;
    let (mut uploaded, mut failed) = (0usize, vec![]);
    for u in &todo {
        let to = &targets[&u.label];
        match c.append_at(to, &u.flags, (u.date > 0).then_some(u.date), &u.raw).await {
            Ok(_) => uploaded += 1,
            Err(e) => {
                failed.push(format!("{}: {e}", u.label));
                if crate::imap::connection_lost(&e) {
                    break;
                }
            }
        }
    }
    m.give_back(c);
    let paths: Vec<String> = targets.into_values().collect();
    let _ = crate::sync::account(m, acc, Some(&paths)).await;
    Ok(json!({ "missing": missing, "uploaded": uploaded, "failed": failed, "dry": false }))
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
    fn only_what_the_server_lacks_goes_up_once_with_its_state() {
        let msg = |id: &str, status: &str| format!("X-Mozilla-Status: {status}\nMessage-ID: <{id}>\nDate: Mon, 12 Oct 2026 10:00:00 +0000\nSubject: s\n\nbody\n").into_bytes();
        let known: HashSet<String> = ["have@x".to_string()].into();
        let folders = vec![
            ("Inbox".to_string(), vec![msg("have@x", "0001"), msg("new@x", "0000"), msg("read@x", "0005"), msg("gone@x", "0009"), msg("new@x", "0000")]),
            ("Sent".to_string(), vec![msg("sent@x", "0000")]),
        ];
        let p = plan(folders, &known);
        let got: Vec<(&str, Vec<&str>)> = p.iter().map(|u| (u.label.as_str(), u.flags.clone())).collect();
        assert_eq!(got, [("Inbox", vec![]), ("Inbox", vec!["\\Seen", "\\Flagged"]), ("Sent", vec!["\\Seen"])]);
        assert!(p[0].raw.windows(2).any(|w| w == b"\r\n") && !p[0].raw.windows(2).any(|w| w[1] == b'\n' && w[0] != b'\r'));
        assert_eq!(p[0].date, 1_791_799_200);
        assert_eq!(role_of("Sent"), "sent");
    }

    #[test]
    fn thunderbirds_security_values() {
        assert_eq!([tls_of("0"), tls_of("1"), tls_of("2"), tls_of("3"), tls_of("")], ["none", "starttls", "starttls", "ssl", "ssl"]);
    }

    #[test]
    fn card_names_from_addresses() {
        assert_eq!(short("me@univ.ca", ""), "univ");
        assert_eq!(short("", "imap.gmail.com"), "gmail");
    }
}
