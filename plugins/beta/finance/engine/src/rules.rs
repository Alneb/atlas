//! Categorisation rules (DESIGN-finance-format "rules.md"): a ```finance-rules fence in any finance note, one rule a
//! line — `[in:|out:] pattern → Category`. The pattern is a case-insensitive regex over the payee and the bank's text;
//! `in:` / `out:` limit it to money coming in or going out. The first rule that matches wins. Imports use them for a
//! row with no history, and `categorize` moves what is still `Expenses:Unknown` to the rule's category.
use crate::model::*;
use regex::Regex;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Flow {
    Any,
    In,
    Out,
}

#[derive(Debug, Clone)]
pub struct Rule {
    pub flow: Flow,
    pub pattern: Regex,
    pub account: Account,
    pub path: String,
    pub line: usize,
}

#[derive(Debug, Clone, Default)]
pub struct Rules(pub Vec<Rule>);

impl Rules {
    /// The rules of one note's fences; a bad line is a diagnostic at its line, the rest still read.
    pub fn add(&mut self, path: &str, text: &str, diags: &mut Vec<Diagnostic>) {
        let p: std::sync::Arc<str> = path.into();
        let mut inside = false;
        for (i, raw) in text.lines().enumerate() {
            let l = raw.trim();
            if l.starts_with("```") {
                inside = !inside && l.trim_start_matches('`').trim() == "finance-rules";
                continue;
            }
            if !inside || l.is_empty() || l.starts_with('#') {
                continue;
            }
            let Some((lhs, rhs)) = l.split_once('→').or_else(|| l.split_once("->")) else {
                diags.push(Diagnostic::error(&p, i + 1, "a rule is `pattern → Category`"));
                continue;
            };
            let (flow, pat) = match lhs.trim() {
                x if x.starts_with("in:") => (Flow::In, x[3..].trim()),
                x if x.starts_with("out:") => (Flow::Out, x[4..].trim()),
                x => (Flow::Any, x),
            };
            let account = match Account::parse(rhs.trim()) {
                Ok(a) if matches!(a.root(), Root::Expenses | Root::Income) || a.root().needs_note() => a,
                Ok(a) => { diags.push(Diagnostic::error(&p, i + 1, format!("{a}: a rule files into a category or an account"))); continue }
                Err(e) => { diags.push(Diagnostic::error(&p, i + 1, e)); continue }
            };
            if pat.split('|').skip(1).any(|alt| alt.trim_start().starts_with("in:") || alt.trim_start().starts_with("out:")) {
                diags.push(Diagnostic::error(&p, i + 1, "in: / out: applies to a whole rule: put it at the start of its own line"));
                continue;
            }
            match Regex::new(&format!("(?i){pat}")) {
                Ok(pattern) => self.0.push(Rule { flow, pattern, account, path: path.into(), line: i + 1 }),
                Err(e) => diags.push(Diagnostic::error(&p, i + 1, format!("pattern: {e}"))),
            }
        }
    }

    /// The category for a payment of `qty` (seen from the money account: negative = out) described by `texts`.
    pub fn find(&self, texts: &[&str], qty: rust_decimal::Decimal) -> Option<&Rule> {
        self.0.iter().find(|r| {
            let flow_ok = match r.flow { Flow::Any => true, Flow::In => qty.is_sign_positive(), Flow::Out => qty.is_sign_negative() };
            flow_ok && texts.iter().any(|t| r.pattern.is_match(t))
        })
    }
}

/// What a transaction is described by, for the rules: the payee, the narration and the bank's own text.
pub fn texts(t: &Txn) -> Vec<&str> {
    let mut out = vec![t.payee.as_str()];
    out.extend(t.narration.as_deref());
    out.extend(t.meta.iter().filter(|(k, _)| k == "bank").map(|(_, v)| v.as_str()));
    out
}

/// The money the transaction moves on its money accounts (Assets, Liabilities), seen from them.
pub fn flow(t: &Txn) -> rust_decimal::Decimal {
    t.postings.iter().filter(|p| matches!(p.account.root(), Root::Assets | Root::Liabilities)).filter_map(|p| p.amount.as_ref()).map(|a| a.qty).sum()
}

/// Each transaction still in `Expenses:Unknown` (and waiting in Review), with what the classifier makes of it: the
/// sure ones are filed by `categorize --write`, the others asked. Accepted transactions are left as accepted.
pub fn categorize(l: &crate::book::Ledger, c: &crate::classify::Classifier) -> Vec<(usize, Option<crate::classify::Guess>)> {
    let unknown = Account::parse("Expenses:Unknown").expect("account");
    l.txns.iter().enumerate().filter(|(_, b)| b.txn.status == Status::Review && b.txn.postings.iter().any(|p| p.account == unknown))
        // A rule into Unknown itself ("leave these to me") is an answer of no category: asked, never filed.
        .map(|(i, b)| (i, c.guess_txn(&b.txn).filter(|g| g.account != unknown))).collect()
}

/// Each transaction between the user and another person whose other side still waits in a holding account, accepted
/// or not, with its guess from the card payments around it (`classify::shared`): (its index, the holding account, the
/// guess). Filing one sends it back to Review, so the user confirms every guess.
pub fn shared(l: &crate::book::Ledger, notes: &crate::notes::Notes) -> Vec<(usize, Account, crate::classify::Guess)> {
    let holding = crate::classify::holding_accounts(notes);
    l.txns.iter().enumerate().filter_map(|(i, b)| {
        let from = b.txn.postings.iter().find(|p| holding.contains(&p.account))?.account.clone();
        Some((i, from, crate::classify::shared(l, notes, &b.txn)?))
    }).collect()
}

/// The sure guesses of `categorize` as edits: Unknown → the category, the transaction left in Review.
pub fn filing(moves: &[(usize, Account)]) -> Vec<(usize, crate::edit::Edit)> {
    let unknown = Account::parse("Expenses:Unknown").expect("account");
    moves.iter().map(|(i, to)| (*i, crate::edit::Edit { recategorize: Some((unknown.clone(), to.clone())), ..Default::default() })).collect()
}

/// Everything still in Review, settled without asking: a categorised one is accepted; one in Unknown takes the classifier's best guess,
/// sure or not, and is accepted; one with no guess at all stays in Review. Each edit comes with the guess that made it.
pub fn settle(l: &crate::book::Ledger, c: &crate::classify::Classifier) -> Vec<(usize, crate::edit::Edit, Option<crate::classify::Guess>)> {
    let unknown = Account::parse("Expenses:Unknown").expect("account");
    l.txns.iter().enumerate().filter(|(_, b)| b.txn.status == Status::Review).filter_map(|(i, b)| {
        let accept = crate::edit::Edit { mark: Some(Status::Accepted), ..Default::default() };
        if !b.txn.postings.iter().any(|p| p.account == unknown) {
            return Some((i, accept, None));
        }
        let g = c.guess_txn(&b.txn).filter(|g| g.account != unknown)?;
        Some((i, crate::edit::Edit { recategorize: Some((unknown.clone(), g.account.clone())), ..accept }, Some(g)))
    }).collect()
}

/// The files with those edits made through Review's own edit (edit.rs), one transaction at a time; a transaction whose
/// lines changed since it was read is reported and skipped.
pub fn apply(l: &crate::book::Ledger, edits: &[(usize, crate::edit::Edit)], read: &dyn Fn(&str) -> Result<String, String>) -> (Vec<(String, String)>, Vec<String>) {
    let mut files: std::collections::BTreeMap<String, String> = Default::default();
    let mut problems = vec![];
    for (i, edit) in edits {
        let t = &l.txns[*i].txn;
        let path = t.span.path.to_string();
        let text = match files.get(&path) {
            Some(x) => x.clone(),
            None => match read(&path) { Ok(x) => x, Err(e) => { problems.push(e); continue } },
        };
        match crate::edit::apply(&text, t, edit) {
            Ok(x) => { files.insert(path, x); }
            Err(e) => problems.push(e),
        }
    }
    (files.into_iter().collect(), problems)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rules_are_read_and_matched_by_direction() {
        let (mut r, mut d) = (Rules::default(), vec![]);
        r.add("finance/rules.md", "# Rules\n```finance-rules\n# vending\nivs france|rm services → Expenses:Food:Snacks\nin: universite paris.saclay → Income:Scholarship:Quarmen\nout: universite paris.saclay → Expenses:Education\nbad line\nx → Nope\na|out: b → Expenses:X\n```\n", &mut d);
        assert_eq!(r.0.len(), 3);
        assert_eq!(d.len(), 3, "{d:?}");
        let dec = |s: &str| s.parse().unwrap();
        assert_eq!(r.find(&["IVS France MP"], dec("-1.5")).unwrap().account.as_str(), "Expenses:Food:Snacks");
        assert_eq!(r.find(&["UNIVERSITE PARIS-SACLAY DDFIP"], dec("1400")).unwrap().account.as_str(), "Income:Scholarship:Quarmen");
        assert_eq!(r.find(&["Universite Paris Saclay"], dec("-44")).unwrap().account.as_str(), "Expenses:Education");
        assert!(r.find(&["Mercadona"], dec("-4")).is_none());
    }

    #[test]
    fn a_friends_transfer_takes_the_bill_it_shares_and_goes_back_to_review() {
        let acct = |a: &str| (format!("finance/accounts/{a}.md"), format!("---\ntype: finance-account\naccount: {a}\n---\n"));
        let journal = "2025-02-12 * ARDECORE\n  Expenses:Food:Restaurants\n  Assets:Bank  -17.50 EUR\n\n\
            2025-02-13 * MERCADONA\n  Expenses:Food:Groceries\n  Assets:Bank  -40.00 EUR\n\n\
            2025-02-14 * Transfer from LEA GELO\n  bank: Transfer: Transfer from LEA GELO\n  Assets:Transfers\n  Assets:Bank  3.50 EUR\n\n\
            2025-02-14 * Payment from CHRIS BRAND\n  Assets:Transfers\n  Assets:Bank  11.00 EUR\n\n\
            2025-02-14 * Depot garantie\n  Assets:Transfers\n  Assets:Bank  -900.00 EUR\n";
        let files = vec![acct("Assets:Bank"), acct("Assets:Transfers"), ("finance/journal/2025.fin".to_string(), journal.to_string())];
        let l = crate::load::load_texts(&files);
        let found = shared(&l.ledger, &l.notes);
        let by = |p: &str| found.iter().find(|(i, _, _)| l.ledger.txns[*i].txn.payee.contains(p)).map(|x| &x.2);
        // 17.50 in five: a share; 11.00 fits no bill exactly, so the nearest larger one before it.
        let lea = by("LEA").unwrap();
        assert_eq!((lea.account.as_str(), lea.sure()), ("Expenses:Food:Restaurants", true), "{}", lea.reason());
        let chris = by("CHRIS").unwrap();
        assert_eq!((chris.account.as_str(), chris.sure()), ("Expenses:Food:Groceries", false), "{}", chris.reason());
        assert!(chris.reason().starts_with("after MERCADONA"), "{}", chris.reason());
        // Not a person's: no guess.
        assert!(by("Depot").is_none());
        // Filed and back in Review, both.
        let edits: Vec<_> = found.iter().map(|(i, from, g)| (*i, crate::edit::Edit { mark: Some(Status::Review), recategorize: Some((from.clone(), g.account.clone())), ..Default::default() })).collect();
        let (out, problems) = apply(&l.ledger, &edits, &|_| Ok(journal.to_string()));
        assert!(problems.is_empty(), "{problems:?}");
        assert!(out[0].1.contains("2025-02-14 ! Transfer from LEA GELO\n  bank: Transfer: Transfer from LEA GELO\n  Expenses:Food:Restaurants"), "{}", out[0].1);
        assert!(out[0].1.contains("2025-02-14 * Depot garantie"), "{}", out[0].1);
    }

    #[test]
    fn settling_accepts_the_categorised_files_the_guessed_and_leaves_the_unknowable() {
        let acct = |a: &str| (format!("finance/accounts/{a}.md"), format!("---\ntype: finance-account\naccount: {a}\n---\n"));
        let journal = "2025-02-12 * MERCADONA VALENCIA\n  Expenses:Food:Groceries\n  Assets:Bank  -40.00 EUR\n\n\
            2025-02-13 ! CINESA\n  Expenses:Leisure\n  Assets:Bank  -9.00 EUR\n\n\
            2025-02-14 ! MERCADONA VALENCIA\n  Expenses:Unknown\n  Assets:Bank  -31.00 EUR\n\n\
            2025-02-15 ! XQZW 77\n  Expenses:Unknown\n  Assets:Bank  -5.00 EUR\n";
        let files = vec![acct("Assets:Bank"), ("finance/journal/2025.fin".to_string(), journal.to_string())];
        let l = crate::load::load_texts(&files);
        let c = crate::classify::Classifier::new(&l.ledger, &l.notes);
        let found = settle(&l.ledger, &c);
        assert_eq!(found.len(), 2, "the unknowable one is left out");
        let edits: Vec<_> = found.into_iter().map(|(i, e, _)| (i, e)).collect();
        let (out, problems) = apply(&l.ledger, &edits, &|_| Ok(journal.to_string()));
        assert!(problems.is_empty(), "{problems:?}");
        let text = &out[0].1;
        assert!(text.contains("2025-02-13 * CINESA\n  Expenses:Leisure"), "{text}");
        assert!(text.contains("2025-02-14 * MERCADONA VALENCIA\n  Expenses:Food:Groceries"), "{text}");
        assert!(text.contains("2025-02-15 ! XQZW 77\n  Expenses:Unknown"), "{text}");
    }
}
