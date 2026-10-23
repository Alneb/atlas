//! The search box's language (DESIGN-mail-ui §5), Gmail's operators: `from: to: cc: subject: has:attachment
//! is:unread|read|starred|snoozed|draft label: in: account: before: after: older_than: newer_than: larger: smaller:`,
//! `"phrases"`, `-word`; `from:a,b` is either. Words go to the full-text index (the last one as a prefix, for search as you type); operators
//! become conditions on the index's rows; `in:` and `account:` say where.

use rusqlite::types::Value;
use serde::Serialize;

/// A search, parsed.
#[derive(Debug, Clone, Default, PartialEq, Serialize)]
pub struct Query {
    /// conditions on `m` (numbered ?1, ?2… within this query)
    #[serde(skip)]
    pub sql: Vec<String>,
    #[serde(skip)]
    pub args: Vec<Value>,
    /// the FTS5 query for the words, if any
    pub text: Option<String>,
    /// `in:` — a folder role (inbox, sent…) or name
    pub folder: Option<String>,
    pub account: Option<String>,
    /// what the box understood, for the chips under it: (operator, value)
    pub chips: Vec<(String, String)>,
    /// the words alone, for asking the server too (IMAP SEARCH TEXT)
    pub words: Vec<String>,
}

impl Query {
    pub fn is_empty(&self) -> bool {
        self.sql.is_empty() && self.text.is_none() && self.folder.is_none() && self.account.is_none()
    }

    /// The conditions as one, for an index [`crate::index::Scope`].
    pub fn filter(&self) -> Option<(String, Vec<Value>)> {
        (!self.sql.is_empty()).then(|| (self.sql.join(" AND "), self.args.clone()))
    }

    fn cond(&mut self, sql: &str, args: Vec<Value>) {
        // renumber this condition's ?N after the ones already taken
        let base = self.args.len();
        let s = regex::Regex::new(r"\?(\d+)").unwrap().replace_all(sql, |m: &regex::Captures| format!("?{}", m[1].parse::<usize>().unwrap() + base));
        self.sql.push(s.into_owned());
        self.args.extend(args);
    }
}

const OPS: &[&str] = &[
    "from", "to", "cc", "subject", "label", "tag", "has", "is", "kind", "category", "in", "account", "before", "older_than", "older", "after", "since",
    "newer_than", "newer", "larger", "bigger", "smaller", "list",
];

/// Splits a search into terms: `op:value`, `op:"two words"`, `"a phrase"`, `-word`, `word`.
fn terms(q: &str) -> Vec<(bool, Option<String>, String, bool)> {
    let mut out = vec![];
    let cs: Vec<char> = q.chars().collect();
    let mut i = 0;
    while i < cs.len() {
        while i < cs.len() && cs[i].is_whitespace() {
            i += 1;
        }
        if i >= cs.len() {
            break;
        }
        let neg = cs[i] == '-' && i + 1 < cs.len() && !cs[i + 1].is_whitespace();
        if neg {
            i += 1;
        }
        let mut op = None;
        let start = i;
        while i < cs.len() && (cs[i].is_alphanumeric() || cs[i] == '_') {
            i += 1;
        }
        let name: String = cs[start..i].iter().collect::<String>().to_lowercase();
        if i < cs.len() && cs[i] == ':' && i > start && OPS.contains(&name.as_str()) {
            op = Some(name);
            i += 1;
        } else {
            i = start;
        }
        let (value, quoted) = if i < cs.len() && cs[i] == '"' {
            i += 1;
            let s = i;
            while i < cs.len() && cs[i] != '"' {
                i += 1;
            }
            let v: String = cs[s..i].iter().collect();
            i += 1;
            (v, true)
        } else {
            let s = i;
            while i < cs.len() && !cs[i].is_whitespace() {
                i += 1;
            }
            (cs[s..i].iter().collect(), false)
        };
        out.push((neg, op, value, quoted));
    }
    out
}

/// "2026-10-01", "2026/10/01", "7d", "2w", "3m", "1y" → unix seconds (relative ones from `now`).
fn when(v: &str, now: i64) -> Option<i64> {
    let v = v.trim();
    if let Some(n) = v.strip_suffix(['d', 'w', 'm', 'y']).and_then(|n| n.parse::<i64>().ok()) {
        let unit = match v.chars().last()? {
            'd' => 86400,
            'w' => 7 * 86400,
            'm' => 30 * 86400,
            _ => 365 * 86400,
        };
        return Some(now - n * unit);
    }
    let d = chrono::NaiveDate::parse_from_str(&v.replace('/', "-"), "%Y-%m-%d").ok()?;
    Some(d.and_hms_opt(0, 0, 0)?.and_utc().timestamp())
}

/// "5M", "200k", "1G", "300" → bytes.
fn bytes(v: &str) -> Option<i64> {
    let v = v.trim().to_lowercase();
    let (n, mul) = match v.chars().last()? {
        'k' => (&v[..v.len() - 1], 1024),
        'm' => (&v[..v.len() - 1], 1024 * 1024),
        'g' => (&v[..v.len() - 1], 1024 * 1024 * 1024),
        _ => (v.as_str(), 1),
    };
    n.trim_end_matches('b').parse::<f64>().ok().map(|x| (x * mul as f64) as i64)
}

fn fts_word(w: &str, prefix: bool) -> String {
    let clean = w.replace('"', "");
    if prefix { format!("\"{clean}\"*") } else { format!("\"{clean}\"") }
}

pub fn parse(q: &str, now: i64) -> Query {
    let mut out = Query::default();
    let mut pos: Vec<String> = vec![];
    let mut neg: Vec<String> = vec![];
    let ts = terms(q);
    let last_plain = ts.iter().rposition(|(n, op, _, quoted)| !n && op.is_none() && !quoted);
    let ends_typing = !q.ends_with(char::is_whitespace);
    for (i, (not, op, value, quoted)) in ts.into_iter().enumerate() {
        if value.is_empty() {
            continue;
        }
        let like = |v: &str| Value::Text(format!("%{}%", v.replace(['%', '_'], "")));
        let n = if not { "NOT " } else { "" };
        match op.as_deref() {
            None => {
                let w = if quoted { fts_word(&value, false) } else { fts_word(&value, Some(i) == last_plain && ends_typing) };
                if not { neg.push(w) } else { pos.push(w) }
                if !not {
                    out.words.push(value.clone());
                }
                continue;
            }
            Some(o @ ("from" | "to" | "cc" | "subject" | "label" | "tag")) => {
                let one = match o {
                    "from" => "m.from_json LIKE ?1",
                    "to" => "(m.to_json LIKE ?1 OR m.cc_json LIKE ?1)",
                    "cc" => "m.cc_json LIKE ?1",
                    "subject" => "m.subject LIKE ?1",
                    _ => "(m.labels LIKE ?1 OR m.flags LIKE ?1)",
                };
                // `from:a@x,b@y` — any of them (a rule for several people); a subject keeps its commas
                let alts: Vec<&str> = if o == "subject" { vec![value.as_str()] } else { value.split(',').map(str::trim).filter(|v| !v.is_empty()).collect() };
                let ors: Vec<String> = (1..=alts.len()).map(|k| one.replace("?1", &format!("?{k}"))).collect();
                let sql = if ors.len() == 1 { ors[0].clone() } else { format!("({})", ors.join(" OR ")) };
                out.cond(&format!("{n}{sql}"), alts.iter().map(|v| like(v)).collect());
            }
            Some("has") => match value.to_lowercase().as_str() {
                "attachment" | "attachments" | "file" => out.cond(&format!("{n}m.has_att=1"), vec![]),
                "unsubscribe" | "list" => out.cond(&format!("{n}m.unsub IS NOT NULL"), vec![]),
                _ => continue,
            },
            Some("is") => match value.to_lowercase().as_str() {
                "unread" => out.cond(&format!("{n}m.seen=0"), vec![]),
                "read" => out.cond(&format!("{n}m.seen=1"), vec![]),
                "starred" | "flagged" | "important" => out.cond(&format!("{n}m.flagged=1"), vec![]),
                "draft" => out.cond(&format!("{n}m.draft=1"), vec![]),
                "answered" | "replied" => out.cond(&format!("{n}m.answered=1"), vec![]),
                "snoozed" => out.cond(&format!("{n}m.flags LIKE '%$atlas-snooze-%'"), vec![]),
                "person" | "newsletter" | "notification" => out.cond(&format!("{n}m.kind=?1"), vec![Value::Text(value.to_lowercase())]),
                _ => continue,
            },
            Some("list") => out.cond(&format!("{n}m.list_id LIKE ?1"), vec![like(&value)]),
            Some("kind" | "category") => out.cond(&format!("{n}m.kind=?1"), vec![Value::Text(value.to_lowercase())]),
            Some("in") => out.folder = Some(value.clone()),
            Some("account") => out.account = Some(value.clone()),
            Some("before" | "older_than" | "older") => match when(&value, now) {
                Some(t) => out.cond("m.date < ?1", vec![Value::Integer(t)]),
                None => continue,
            },
            Some("after" | "since" | "newer_than" | "newer") => match when(&value, now) {
                Some(t) => out.cond("m.date >= ?1", vec![Value::Integer(t)]),
                None => continue,
            },
            Some("larger" | "bigger") => match bytes(&value) {
                Some(b) => out.cond("m.size > ?1", vec![Value::Integer(b)]),
                None => continue,
            },
            Some("smaller") => match bytes(&value) {
                Some(b) => out.cond("m.size < ?1", vec![Value::Integer(b)]),
                None => continue,
            },
            Some(_) => continue,
        }
        out.chips.push((format!("{}{}", if not { "-" } else { "" }, op.unwrap_or_default()), value));
    }
    if !pos.is_empty() {
        let mut t = pos.join(" AND ");
        for n in &neg {
            t = format!("({t}) NOT {n}");
        }
        out.text = Some(t);
    } else if !neg.is_empty() {
        // FTS cannot start with NOT: say it as "not among the matches"
        out.cond("m.id NOT IN (SELECT rowid FROM fts WHERE fts MATCH ?1)", vec![Value::Text(neg.join(" OR "))]);
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::index::{Incoming, Index, Scope};
    use crate::parse::envelope;

    const NOW: i64 = 1_790_000_000; // 2026-09-21

    #[test]
    fn operators_words_phrases_and_negations() {
        let q = parse(r#"from:ana subject:"group meeting" has:attachment is:unread -is:starred cluster "exact phrase" -spam lat"#, NOW);
        assert_eq!(q.chips, vec![
            ("from".to_string(), "ana".to_string()),
            ("subject".into(), "group meeting".into()),
            ("has".into(), "attachment".into()),
            ("is".into(), "unread".into()),
            ("-is".into(), "starred".into()),
        ]);
        assert_eq!(q.text.as_deref(), Some(r#"("cluster" AND "exact phrase" AND "lat"*) NOT "spam""#));
        assert_eq!(q.words, vec!["cluster", "exact phrase", "lat"]);
        assert_eq!(q.sql.len(), 5);
        assert!(q.sql[4].starts_with("NOT m.flagged"));
        assert_eq!(q.args.len(), 2);
        assert_eq!(q.sql[1], "m.subject LIKE ?2", "numbered after the ones before");
    }

    #[test]
    fn dates_sizes_and_places() {
        let q = parse("in:sent account:gmail before:2026-01-01 newer_than:2w larger:5M", NOW);
        assert_eq!(q.folder.as_deref(), Some("sent"));
        assert_eq!(q.account.as_deref(), Some("gmail"));
        assert_eq!(q.args, vec![Value::Integer(1767225600), Value::Integer(NOW - 14 * 86400), Value::Integer(5 * 1024 * 1024)]);
        assert!(q.text.is_none());
    }

    #[test]
    fn a_colon_that_is_no_operator_stays_words() {
        let q = parse("meeting 10:30", NOW);
        assert_eq!(q.text.as_deref(), Some(r#""meeting" AND "10:30"*"#));
    }

    #[test]
    fn a_search_runs_on_the_index() {
        let ix = Index::memory();
        let add = |uid, raw: &str, flags: &[&str]| {
            ix.add("a", "INBOX", &[], &[Incoming { uid, flags: flags.iter().map(|s| s.to_string()).collect(), labels: vec![], gm_thread: None, size: raw.len() as i64, envelope: envelope(raw.as_bytes(), None) }]).unwrap()
        };
        add(1, "From: Ana <ana@x.example>\r\nSubject: Cluster time\r\nMessage-ID: <1@x>\r\nDate: Tue, 15 Sep 2026 10:00:00 +0000\r\n\r\n", &[]);
        add(2, "From: Bo <bo@x.example>\r\nSubject: Cluster down\r\nMessage-ID: <2@x>\r\nDate: Tue, 15 Sep 2026 11:00:00 +0000\r\n\r\n", &["\\Seen"]);
        let run = |s: &str| {
            let q = parse(s, NOW);
            ix.list(&Scope { filter: q.filter(), text: q.text.clone(), ..Default::default() }, 10, 0).into_iter().map(|c| c.subject).collect::<Vec<_>>()
        };
        assert_eq!(run("clus"), vec!["Cluster down", "Cluster time"], "the last word as a prefix");
        assert_eq!(run("cluster from:ana"), vec!["Cluster time"]);
        assert_eq!(run("cluster is:unread"), vec!["Cluster time"]);
        assert_eq!(run("cluster -down"), vec!["Cluster time"]);
        assert_eq!(run("-down"), vec!["Cluster time"]);
        assert_eq!(run("after:2026-09-15 before:2026-09-16 -from:bo"), vec!["Cluster time"]);
    }

    #[test]
    fn several_people_in_one_operator() {
        let q = parse("from:vt@uni.example,ana@uni.example is:unread", 0);
        assert_eq!(q.sql[0], "(m.from_json LIKE ?1 OR m.from_json LIKE ?2)");
        assert_eq!(q.args.len(), 2);
        assert_eq!(q.sql[1], "m.seen=0");
        let s = parse("subject:\"a, b\"", 0);
        assert_eq!(s.args.len(), 1);
    }
}
