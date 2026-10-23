//! The pane's transaction editor (DESIGN-finance "Transactions"): a whole transaction written from its fields — date,
//! mark, payee, narration, tags, postings — added, put in place of the one it edits, or removed. Only that
//! transaction's lines change; its id and metadata stay, and a posting the edit leaves as it was keeps its balance
//! assertion, lot and comment (re-aligned in the canonical layout). Whether the books stay sound is the caller's check (`new_errors`).
use crate::model::*;
use crate::parse::{parse_amount, parse_date};
use crate::write;
use serde_json::Value;

/// A transaction as the editor sends it. Postings: an account and an amount, or none for the one that takes the rest.
#[derive(Debug, Clone, PartialEq)]
pub struct Draft {
    pub date: chrono::NaiveDate,
    pub status: Status,
    pub payee: String,
    pub narration: Option<String>,
    pub tags: Vec<String>,
    pub postings: Vec<(Account, Option<Amount>)>,
}

impl Draft {
    /// `{date, status: "*"|"!", payee, narration?, tags?: [..], postings: [{account, amount: "12.40 EUR" | null}]}`
    pub fn from_json(v: &Value) -> Result<Draft, String> {
        let s = |k: &str| v[k].as_str().map(str::trim).unwrap_or_default();
        let status = match s("status") {
            "!" => Status::Review,
            "*" | "" => Status::Accepted,
            x => return Err(format!("{x:?} is not a mark (* or !)")),
        };
        let postings = v["postings"].as_array().cloned().unwrap_or_default().iter().filter(|p| !p["account"].as_str().unwrap_or_default().trim().is_empty()).map(|p| {
            let account = Account::parse(p["account"].as_str().unwrap_or_default().trim())?;
            let amount = p["amount"].as_str().map(str::trim).filter(|a| !a.is_empty()).map(parse_amount).transpose()?;
            Ok((account, amount))
        }).collect::<Result<Vec<_>, String>>()?;
        let tags = v["tags"].as_array().cloned().unwrap_or_default().iter().filter_map(|t| t.as_str()).map(|t| t.trim().trim_start_matches('#').to_string())
            .filter(|t| !t.is_empty()).collect::<Vec<_>>();
        if let Some(bad) = tags.iter().find(|t| t.chars().any(char::is_whitespace)) {
            return Err(format!("a tag is one word: {bad:?}"));
        }
        let d = Draft { date: parse_date(s("date"))?, status, payee: s("payee").to_string(), narration: Some(s("narration").to_string()).filter(|n| !n.is_empty()), tags, postings };
        d.check()?;
        Ok(d)
    }

    fn check(&self) -> Result<(), String> {
        if self.payee.is_empty() {
            return Err("a transaction needs a payee (who it was with)".into());
        }
        if self.payee.contains(" | ") || self.payee.contains('^') {
            return Err("a payee cannot hold \" | \" or ^".into());
        }
        if self.postings.len() < 2 {
            return Err("a transaction moves money between two accounts at least".into());
        }
        if self.postings.iter().filter(|p| p.1.is_none()).count() > 1 {
            return Err("only one posting can be left without an amount (it takes the rest)".into());
        }
        Ok(())
    }
}

/// The text of `d`, in place of `old` when it edits one (its id, metadata and untouched posting lines kept).
pub fn render(old: Option<&Txn>, d: &Draft) -> String {
    let tags: Vec<&str> = d.tags.iter().map(String::as_str).collect();
    let id = old.and_then(|t| t.id.as_deref());
    let mut unused: Vec<&Posting> = old.map(|t| t.postings.iter().collect()).unwrap_or_default();
    let postings = d.postings.iter().map(|(account, amount)| {
        match unused.iter().position(|p| &p.account == account && &p.amount == amount) {
            Some(i) => unused.remove(i).clone(),
            None => Posting { account: account.clone(), amount: amount.clone(), lot: Lot::None, price: None, assert: None, comment: None, line: 0 },
        }
    }).collect();
    let t = Txn {
        date: d.date, status: d.status, text: write::header(&d.payee, d.narration.as_deref(), &tags, id), payee: d.payee.clone(),
        narration: d.narration.clone(), tags: d.tags.iter().cloned().collect(), id: id.map(str::to_string),
        meta: old.map(|t| t.meta.clone()).unwrap_or_default(), postings,
        span: Span { path: "".into(), first: 0, last: 0 },
    };
    write::txn(&t)
}

/// `t`'s lines as they are in `file`: what an edit or a removal checks it still replaces.
pub fn lines_of(file: &str, t: &Txn) -> Option<String> {
    let lines: Vec<&str> = file.split_inclusive('\n').collect();
    (t.span.first >= 1 && t.span.last <= lines.len()).then(|| lines[t.span.first - 1..t.span.last].concat())
}

/// `file` without `t` (and the blank line that separated it), when its lines still read as `expected`.
pub fn remove(file: &str, t: &Txn, expected: &str) -> Result<String, String> {
    let out = write::replace(file, &t.span, expected, "")?;
    // the transaction left two blank lines together (or one at the very start): keep one
    let mut lines: Vec<&str> = out.split_inclusive('\n').collect();
    let at = t.span.first - 1;
    if at < lines.len() && lines[at].trim().is_empty() && (at == 0 || lines[at - 1].trim().is_empty()) {
        lines.remove(at);
    } else if at > 0 && at == lines.len() && lines[at - 1].trim().is_empty() {
        lines.pop();
    }
    Ok(lines.concat())
}

/// The journal file a new transaction of `date` goes to.
pub fn file_for(folder: &str, date: chrono::NaiveDate) -> String {
    format!("{}/journal/{}.fin", folder.trim_end_matches('/'), chrono::Datelike::year(&date))
}

/// The errors `after` has that `before` did not, compared by message (lines move when a transaction grows).
pub fn new_errors(before: &[Diagnostic], after: &[Diagnostic]) -> Vec<String> {
    let mut old: Vec<&str> = before.iter().filter(|d| d.severity == Severity::Error).map(|d| d.message.as_str()).collect();
    after.iter().filter(|d| d.severity == Severity::Error).filter_map(|d| match old.iter().position(|m| *m == d.message) {
        Some(i) => { old.remove(i); None }
        None => Some(format!("{}:{}: {}", d.path, d.line, d.message)),
    }).collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::load::load_texts;
    use serde_json::json;

    const NOTES: &str = "---\ntype: finance-account\naccount: Assets:Bank\ncurrency: EUR\n---\n";
    const JOURNAL: &str = "2026-10-01 * Cafe | morning #work ^bank-1\n  bank: CAFE CAUS 1234\n  Expenses:Food\n  Assets:Bank                             -3.20 EUR = 96.80 EUR\n\n2026-10-02 * Shop\n  Expenses:Things                          10.00 EUR\n  Assets:Bank\n";

    fn ledger(journal: &str) -> crate::load::Loaded {
        load_texts(&[("finance/accounts/Bank.md".into(), NOTES.into()), ("finance/journal/2026.fin".into(), journal.into())])
    }

    #[test]
    fn an_edit_keeps_the_id_the_metadata_and_the_untouched_lines() {
        let l = ledger(&format!("2026-09-30 * Opening\n  Assets:Bank                             100.00 EUR\n  Equity:Opening\n\n{JOURNAL}"));
        assert!(l.ledger.diags.iter().all(|d| d.severity != Severity::Error), "{:?}", l.ledger.diags);
        let t = l.ledger.txns.iter().map(|b| &b.txn).find(|t| t.payee == "Cafe").unwrap();
        let d = Draft::from_json(&json!({ "date": "2026-10-01", "status": "*", "payee": "Café Caus", "narration": "", "tags": ["#work", "guess"],
            "postings": [{ "account": "Expenses:Food:Restaurants", "amount": null }, { "account": "Assets:Bank", "amount": "-3.20 EUR" }] })).unwrap();
        let out = render(Some(t), &d);
        assert_eq!(out, "2026-10-01 * Café Caus #work #guess ^bank-1\n  bank: CAFE CAUS 1234\n  Expenses:Food:Restaurants\n  Assets:Bank                              -3.20 EUR = 96.80 EUR\n");
    }

    #[test]
    fn a_draft_is_refused_before_it_reaches_the_file() {
        let bad = |v: Value| Draft::from_json(&v).unwrap_err();
        let base = json!({ "date": "2026-10-01", "payee": "X", "postings": [{ "account": "Expenses:A", "amount": "1 EUR" }, { "account": "Assets:Bank" }] });
        assert!(Draft::from_json(&base).is_ok());
        let mut v = base.clone(); v["payee"] = json!(""); assert!(bad(v).contains("payee"));
        let mut v = base.clone(); v["postings"] = json!([{ "account": "Expenses:A" }, { "account": "Assets:Bank" }]); assert!(bad(v).contains("only one"));
        let mut v = base.clone(); v["postings"] = json!([{ "account": "Assets:Bank", "amount": "1 EUR" }]); assert!(bad(v).contains("two accounts"));
        let mut v = base.clone(); v["date"] = json!("2026-13-01"); bad(v);
        let mut v = base.clone(); v["tags"] = json!(["two words"]); assert!(bad(v).contains("one word"));
    }

    #[test]
    fn a_removal_takes_its_lines_and_one_blank_and_an_unbalanced_edit_is_a_new_error() {
        let l = ledger(JOURNAL);
        let shop = l.ledger.txns.iter().map(|b| &b.txn).find(|t| t.payee == "Shop").unwrap();
        let cafe = l.ledger.txns.iter().map(|b| &b.txn).find(|t| t.payee == "Cafe").unwrap();
        let gone = remove(JOURNAL, shop, &lines_of(JOURNAL, shop).unwrap()).unwrap();
        assert_eq!(gone, "2026-10-01 * Cafe | morning #work ^bank-1\n  bank: CAFE CAUS 1234\n  Expenses:Food\n  Assets:Bank                             -3.20 EUR = 96.80 EUR\n");
        let first = remove(JOURNAL, cafe, &lines_of(JOURNAL, cafe).unwrap()).unwrap();
        assert!(first.starts_with("2026-10-02 * Shop\n"), "{first}");
        assert!(remove(JOURNAL, shop, "something else").is_err(), "changed since read: refused");
        // an edit that leaves the transaction unbalanced is an error the books did not have
        let d = Draft::from_json(&json!({ "date": "2026-10-02", "payee": "Shop", "postings": [{ "account": "Expenses:Things", "amount": "10.00 EUR" }, { "account": "Assets:Bank", "amount": "-9.00 EUR" }] })).unwrap();
        let edited = write::replace(JOURNAL, &shop.span, &lines_of(JOURNAL, shop).unwrap(), &render(Some(shop), &d)).unwrap();
        let after = ledger(&edited);
        let new = new_errors(&l.ledger.diags, &after.ledger.diags);
        assert!(new.iter().any(|e| e.contains("does not balance")), "{new:?}");
        assert!(new_errors(&l.ledger.diags, &l.ledger.diags).is_empty());
        assert_eq!(file_for("finance", d.date), "finance/journal/2026.fin");
    }
}
