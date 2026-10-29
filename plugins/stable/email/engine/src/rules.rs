//! Rules (DESIGN-mail-ui §7): a note, `<mail folder>/rules.md`, holds one `email-rules` block, a rule a line:
//!
//! ```email-rules
//! # the search box's language, then what to do
//! from:newsletter@shop.example => move Newsletters, read
//! subject:invoice has:attachment => label Bills, save
//! list:physics-l => archive
//! ```
//!
//! A rule runs on new mail in an inbox, after each sync (the engine's, so on the server too). Actions: `move <folder>`,
//! `archive`, `trash`, `spam`, `read`, `star`, `important` (starred and kept as a note), `not-important`, `label <name>`,
//! `save` (the conversation as a note), `notify` (a notice
//! even for a person the split inbox would file away), `stop` (no later rule sees it).

use crate::account::Account;
use crate::index::Scope;
use crate::mail::Mail;
use crate::search;
use serde::{Deserialize, Serialize};
use serde_json::json;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Rule {
    pub when: String,
    pub actions: Vec<String>,
}

pub const FENCE: &str = "email-rules";

/// The rules a note's text holds (the first `email-rules` block); lines that are no rule are skipped.
pub fn parse(text: &str) -> Vec<Rule> {
    block(text)
        .map(|(_, body, _)| {
            body.lines()
                .filter_map(|l| {
                    let l = l.trim();
                    if l.is_empty() || l.starts_with('#') || l.starts_with("//") {
                        return None;
                    }
                    let (when, then) = l.split_once("=>").or_else(|| l.split_once("->"))?;
                    let actions: Vec<String> = then.split(',').map(|a| a.trim().to_string()).filter(|a| !a.is_empty()).collect();
                    (!when.trim().is_empty() && !actions.is_empty()).then(|| Rule { when: when.trim().to_string(), actions })
                })
                .collect()
        })
        .unwrap_or_default()
}

/// The block's place: (text before, its body, text after).
fn block(text: &str) -> Option<(String, String, String)> {
    let start = text.find(&format!("```{FENCE}"))?;
    let body_start = text[start..].find('\n').map(|i| start + i + 1)?;
    let end = text[body_start..].find("\n```").map(|i| body_start + i)?;
    let after = text[end + 1..].find('\n').map(|i| end + 1 + i + 1).unwrap_or(text.len());
    Some((text[..start].to_string(), text[body_start..end].to_string(), text[after..].to_string()))
}

/// The note's text with these rules in its block (the rest of the note as it was; a block added when none).
pub fn write(text: &str, rules: &[Rule]) -> String {
    let lines: String = rules.iter().map(|r| format!("{} => {}\n", r.when.trim(), r.actions.join(", "))).collect();
    let new_block = format!("```{FENCE}\n{lines}```\n");
    match block(text) {
        Some((before, _, after)) => format!("{before}{new_block}{after}"),
        None if text.trim().is_empty() => format!(
            "# Mail rules\n\nEach line: a search (the Email pane's search box language), `=>`, then what to do: move <folder>, archive, trash, spam, read, star, important, not-important, label <name>, save, notify, stop. They run on new mail in the inbox.\n\n{new_block}"
        ),
        None => format!("{}\n\n{new_block}", text.trim_end()),
    }
}

pub fn path(m: &Mail) -> std::path::PathBuf {
    m.root.join(folder(m)).join("rules.md")
}

/// The vault folder mail notes, rules and templates live in (`keep_folder`, default `mail`).
pub fn folder(m: &Mail) -> String {
    m.setting("keep_folder").as_str().map(str::trim).filter(|s| !s.is_empty()).unwrap_or("mail").trim_matches('/').to_string()
}

pub fn load(m: &Mail) -> Vec<Rule> {
    std::fs::read_to_string(path(m)).map(|t| parse(&t)).unwrap_or_default()
}

pub fn save(m: &Mail, rules: &[Rule]) -> Result<String, String> {
    let p = path(m);
    let was = std::fs::read_to_string(&p).unwrap_or_default();
    atlas_plugin::write_file(&p, write(&was, rules).as_bytes()).map_err(|e| e.to_string())?;
    Ok(p.strip_prefix(&m.root).unwrap_or(&p).to_string_lossy().into_owned())
}

/// Which of `ids` a rule's search matches.
pub fn matching(m: &Mail, acc: &Account, rule: &Rule, ids: &[i64]) -> Vec<i64> {
    if ids.is_empty() {
        return vec![];
    }
    let q = search::parse(&rule.when, chrono::Utc::now().timestamp());
    if q.account.as_deref().is_some_and(|a| a != acc.name) {
        return vec![];
    }
    let list = ids.iter().map(|i| i.to_string()).collect::<Vec<_>>().join(",");
    let (mut cond, args) = q.filter().unwrap_or_else(|| ("1=1".into(), vec![]));
    cond = format!("({cond}) AND m.id IN ({list})");
    m.index.list(&Scope { folders: vec![], filter: Some((cond, args)), text: q.text.clone(), flat: true, pin: false }, ids.len(), 0).into_iter().map(|c| c.id).collect()
}

/// Runs the rules on new inbox mail of an account; what each did goes to the page as an event.
pub async fn apply(m: &Mail, acc: &Account, ids: &[i64]) {
    let mut left: Vec<i64> = ids.to_vec();
    for rule in load(m) {
        let hit = matching(m, acc, &rule, &left);
        if hit.is_empty() {
            continue;
        }
        if act(m, acc, &rule, &hit).await {
            left.retain(|i| !hit.contains(i));
        }
    }
}

/// Does a rule's actions on the messages it matched → whether it said `stop`.
pub async fn act(m: &Mail, acc: &Account, rule: &Rule, hit: &[i64]) -> bool {
    let mut stop = false;
    for a in &rule.actions {
        let (verb, arg) = a.split_once(' ').map(|(v, r)| (v.to_lowercase(), r.trim().to_string())).unwrap_or((a.to_lowercase(), String::new()));
        let r = match verb.as_str() {
            "read" => crate::ops::flag(m, hit, "\\Seen", true).await,
            "star" | "flag" => crate::ops::flag(m, hit, "\\Flagged", true).await,
            "important" => crate::ops::importance(m, hit, crate::ops::Importance::Important).await,
            "not-important" | "unimportant" => crate::ops::importance(m, hit, crate::ops::Importance::NotImportant).await,
            "label" | "tag" => crate::ops::label(m, hit, std::slice::from_ref(&arg), &[]).await,
            "archive" => crate::ops::move_role(m, hit, "archive").await.map(|_| ()),
            "trash" | "delete" => crate::ops::move_role(m, hit, "trash").await.map(|_| ()),
            "spam" | "junk" => crate::ops::move_role(m, hit, "junk").await.map(|_| ()),
            "move" => match m.index.folders(Some(&acc.name)).into_iter().find(|f| f.label.eq_ignore_ascii_case(&arg) || f.path == arg) {
                Some(f) => crate::ops::move_to(m, hit, &f.path).await.map(|_| ()),
                None => Err(format!("no folder {arg}")),
            },
            "save" | "note" => {
                let mut r = Ok(());
                for id in hit {
                    if let Some(x) = m.index.msg(*id) {
                        if let Err(e) = crate::notes::save(m, x.thread).await {
                            r = Err(e);
                        }
                    }
                }
                r
            }
            "notify" => {
                m.event("notify", json!({ "account": acc.name, "ids": hit, "rule": rule.when }));
                Ok(())
            }
            "stop" => {
                stop = true;
                Ok(())
            }
            other => Err(format!("unknown action {other}")),
        };
        if let Err(e) = r {
            m.event("status", json!({ "account": acc.name, "state": "error", "error": format!("rule “{}”: {e}", rule.when) }));
        }
    }
    m.event("rule", json!({ "account": acc.name, "rule": rule.when, "count": hit.len() }));
    stop
}

/// Actions a rule may name (Claude's `email_add_rule` is checked against them).
pub const ACTIONS: &[&str] = &["move", "archive", "trash", "delete", "spam", "junk", "read", "star", "flag", "important", "not-important", "unimportant", "label", "tag", "save", "note", "notify", "stop"];

/// Adds a rule, or replaces the one with the same search → the rules note's vault path.
pub fn add(m: &Mail, rule: Rule) -> Result<String, String> {
    if search::parse(&rule.when, 0).is_empty() {
        return Err(format!("“{}” matches every message: name who or what", rule.when));
    }
    for a in &rule.actions {
        let verb = a.split_whitespace().next().unwrap_or("").to_lowercase();
        if !ACTIONS.contains(&verb.as_str()) {
            return Err(format!("unknown action “{a}”: one of {}", ACTIONS.join(", ")));
        }
    }
    let mut rules = load(m);
    match rules.iter_mut().find(|r| r.when.trim() == rule.when.trim()) {
        Some(r) => *r = rule,
        None => rules.push(rule),
    }
    save(m, &rules)
}

/// Removes the rule whose search is `when` → whether there was one.
pub fn remove(m: &Mail, when: &str) -> Result<bool, String> {
    let mut rules = load(m);
    let n = rules.len();
    rules.retain(|r| r.when.trim() != when.trim());
    if rules.len() == n {
        return Ok(false);
    }
    save(m, &rules)?;
    Ok(true)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::sync::tests_support::harness;

    #[test]
    fn rules_read_and_write_inside_their_note() {
        let note = "# My rules\n\nSome words.\n\n```email-rules\n# comment\nfrom:shop => move Newsletters, read\nnonsense line\nsubject:\"a b\" -> label X\n```\n\nAfter.\n";
        let rules = parse(note);
        assert_eq!(rules, vec![
            Rule { when: "from:shop".into(), actions: vec!["move Newsletters".into(), "read".into()] },
            Rule { when: "subject:\"a b\"".into(), actions: vec!["label X".into()] },
        ]);
        let again = write(note, &rules[..1]);
        assert_eq!(again, "# My rules\n\nSome words.\n\n```email-rules\nfrom:shop => move Newsletters, read\n```\n\nAfter.\n");
        assert!(write("", &rules).starts_with("# Mail rules\n"));
    }

    #[test]
    fn new_mail_meets_the_rules() {
        let (m, s, events, d) = harness(true);
        let acc = m.account(None).unwrap();
        m.rt.block_on(crate::sync::account(&m, &acc, None)).unwrap();
        std::fs::create_dir_all(d.path().join("vault/mail")).unwrap();
        std::fs::write(d.path().join("vault/mail/rules.md"), "```email-rules\nfrom:promo@shop.example => archive, read, stop\nsubject:promo => star\nfrom:boss => star\n```\n").unwrap();
        s.store.lock().unwrap().add("INBOX", b"From: Shop <promo@shop.example>\r\nSubject: Big promo\r\nMessage-ID: <p@x>\r\nDate: Tue, 20 Oct 2026 10:00:00 +0000\r\n\r\nbuy\r\n".to_vec(), &[]);
        s.store.lock().unwrap().add("INBOX", b"From: Boss <boss@uni.example>\r\nSubject: Now\r\nMessage-ID: <b@x>\r\nDate: Tue, 20 Oct 2026 10:01:00 +0000\r\n\r\ncome\r\n".to_vec(), &[]);
        m.rt.block_on(crate::sync::account(&m, &acc, None)).unwrap();
        let st = s.store.lock().unwrap();
        let promo = st.folders["Archive"].msgs.iter().find(|x| String::from_utf8_lossy(&x.raw).contains("Big promo")).expect("archived");
        assert!(promo.flags.contains("\\Seen"));
        assert!(!promo.flags.contains("\\Flagged"), "stop: the later rule did not see it");
        let boss = st.folders["INBOX"].msgs.iter().find(|x| String::from_utf8_lossy(&x.raw).contains("boss@")).unwrap();
        assert!(boss.flags.contains("\\Flagged"));
        assert_eq!(events.lock().unwrap().iter().filter(|(n, _)| n == "rule").count(), 2);
    }

    #[test]
    fn an_important_person_is_starred_kept_as_a_note_and_the_note_grows() {
        let (m, s, _events, d) = harness(true);
        let acc = m.account(None).unwrap();
        m.rt.block_on(crate::sync::account(&m, &acc, None)).unwrap();
        // Claude's email_add_rule
        add(&m, Rule { when: "from:vt@uni.example,ana@uni.example".into(), actions: vec!["important".into()] }).unwrap();
        assert!(add(&m, Rule { when: "".into(), actions: vec!["important".into()] }).is_err(), "a rule for every message is refused");
        assert!(add(&m, Rule { when: "from:x".into(), actions: vec!["explode".into()] }).is_err());
        s.store.lock().unwrap().add("INBOX", b"From: V Tremblay <vt@uni.example>\r\nSubject: Thesis plan\r\nMessage-ID: <t1@uni.example>\r\nDate: Tue, 20 Oct 2026 10:00:00 +0000\r\n\r\nSee the plan.\r\n".to_vec(), &[]);
        s.store.lock().unwrap().add("INBOX", b"From: Shop <promo@shop.example>\r\nSubject: Sale\r\nMessage-ID: <s1@shop.example>\r\nDate: Tue, 20 Oct 2026 10:01:00 +0000\r\n\r\nbuy\r\n".to_vec(), &[]);
        m.rt.block_on(crate::sync::account(&m, &acc, None)).unwrap();
        let st = s.store.lock().unwrap();
        let t = st.folders["INBOX"].msgs.iter().find(|x| String::from_utf8_lossy(&x.raw).contains("Thesis plan")).unwrap();
        assert!(t.flags.contains("\\Flagged"));
        let sale = st.folders["INBOX"].msgs.iter().find(|x| String::from_utf8_lossy(&x.raw).contains("Sale")).unwrap();
        assert!(!sale.flags.contains("\\Flagged"));
        drop(st);
        let x = m.index.by_message_id("fake", "t1@uni.example").into_iter().next().unwrap();
        let note = crate::notes::saved(&m, x.thread).expect("kept as a note at once");
        let text = std::fs::read_to_string(d.path().join("vault").join(&note)).unwrap();
        assert!(text.contains("See the plan."), "{text}");
        // her reply arrives: the kept conversation grows by itself
        s.store.lock().unwrap().add("INBOX", b"From: V Tremblay <vt@uni.example>\r\nSubject: Re: Thesis plan\r\nMessage-ID: <t2@uni.example>\r\nIn-Reply-To: <t1@uni.example>\r\nReferences: <t1@uni.example>\r\nDate: Wed, 21 Oct 2026 10:00:00 +0000\r\n\r\nAlso chapter two.\r\n".to_vec(), &[]);
        m.rt.block_on(crate::sync::account(&m, &acc, None)).unwrap();
        let text = std::fs::read_to_string(d.path().join("vault").join(&note)).unwrap();
        assert!(text.contains("Also chapter two."), "{text}");
        assert!(remove(&m, "from:vt@uni.example,ana@uni.example").unwrap());
        assert!(load(&m).is_empty());
    }
}
