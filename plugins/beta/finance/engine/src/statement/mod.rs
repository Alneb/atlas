//! Statement files → movements (DESIGN-finance-import.md). A preset (`preset`) describes a bank's export as data;
//! `extract` reads the fields it places from the file's format, `map` gives them their meaning, `plan` turns the
//! statements into new `!` transactions against the ledger. Which preset reads a file is told by its content, never
//! its name: banks rename their exports.
pub mod batch;
pub mod extract;
pub mod map;
pub mod pdf;
pub mod plan;
pub mod preset;
#[cfg(test)]
mod files_tests;

use crate::model::*;
use crate::notes::Notes;
use chrono::NaiveDate;
use preset::Preset;
use rust_decimal::Decimal;
use serde::Deserialize;
use std::collections::BTreeMap;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum FundOp {
    Buy,
    Sell,
}

#[derive(Clone, Debug, PartialEq)]
pub enum Move {
    /// Money in (+) or out (−) of the account; `fee` is charged on top (the account moves `amount − fee`).
    Cash { amount: Decimal, fee: Decimal },
    /// Units of a fund bought or sold for `total` in the statement's currency.
    Fund { fund: String, isin: Option<String>, units: Decimal, total: Decimal, op: FundOp },
}

#[derive(Clone, Debug, PartialEq)]
pub struct Row {
    pub booked: NaiveDate,
    pub value: Option<NaiveDate>,
    /// What the bank calls it: the import id and the payee come from it.
    pub description: String,
    /// Everything the bank said about it, kept as the transaction's `bank:`.
    pub bank: String,
    /// The holder's own words on it (the label typed when topping up a prepaid card).
    pub note: Option<String>,
    /// What the file says the other side is: a category (and its group), or another account of the user's.
    pub category: Option<(String, Option<String>)>,
    pub transfer: Option<String>,
    /// The account's balance after this row, when the statement gives it.
    pub balance: Option<Decimal>,
    pub kind: Move,
}

#[derive(Clone, Debug)]
pub struct Statement {
    /// The preset that read it: its `id`, the bank folder its file is kept in, its place in a batch.
    pub preset: String,
    pub bank: String,
    pub order: u32,
    /// The file it was read from (its name).
    pub source: String,
    /// The account as the statement names it: its number (matched by digits) or its name (matched to an alias).
    pub holder: Option<String>,
    pub currency: Commodity,
    pub from: Option<NaiveDate>,
    pub to: Option<NaiveDate>,
    /// The balance before `from` and after `to`, when the statement says.
    pub opening: Option<Decimal>,
    pub closing: Option<Decimal>,
    pub rows: Vec<Row>,
    /// Lines read but not taken as movements (pending, reverted, an operation not understood), each with why.
    pub skipped: Vec<String>,
    /// The preset's name maps (`accounts`, `categories`).
    pub accounts: BTreeMap<String, String>,
    pub categories: BTreeMap<String, String>,
}

/// The presets whose `detect` the file passes, best first.
pub fn detect<'a>(presets: &'a [Preset], bytes: &[u8], pdf_text: &dyn Fn(&[u8]) -> Result<String, String>) -> Vec<&'a Preset> {
    let mut hits: Vec<(usize, usize, &Preset)> = presets.iter().enumerate().filter_map(|(i, p)| {
        let text = extract::first_text(p, bytes, pdf_text)?;
        let d = &p.detect;
        let first = text.lines().next().unwrap_or("");
        let ok = d.contains.iter().all(|c| text.contains(c.as_str()))
            && d.first_line.as_ref().is_none_or(|r| regex::Regex::new(r).is_ok_and(|r| r.is_match(first)));
        let said = d.contains.len() + d.first_line.is_some() as usize;
        (ok && said > 0).then_some((said, i, p))
    }).collect();
    // The most conditions met; on a tie the later preset, a vault's that extends a built-in.
    hits.sort_by_key(|(n, i, _)| (std::cmp::Reverse(*n), std::cmp::Reverse(*i)));
    hits.into_iter().map(|(_, _, p)| p).collect()
}

/// The statements in one file, read by the first preset that recognises it.
pub fn read(name: &str, bytes: &[u8], presets: &[Preset], pdf_text: &dyn Fn(&[u8]) -> Result<String, String>) -> Result<Vec<Statement>, String> {
    let Some(p) = detect(presets, bytes, pdf_text).into_iter().next() else {
        return Err(format!("{name}: no preset recognises this file (presets: {}); a new one goes in finance/importers/", presets.iter().map(|p| p.id.as_str()).collect::<Vec<_>>().join(", ")));
    };
    let pieces = extract::extract(p, bytes, pdf_text).map_err(|e| format!("{name} ({}): {e}", p.id))?;
    let mut out = vec![];
    for e in pieces {
        out.extend(map::statements(p, name, e).map_err(|e| format!("{name} ({}): {e}", p.id))?);
    }
    Ok(out)
}

/// The account a name or number denotes: the preset's `accounts` map, else the one note that lists it verbatim (an
/// IBAN, a `bank-uid`), else the one whose number (`iban`, `ccc`, `card`) ends like it, else the one whose alias or
/// last account part it is. Two notes that both fit are told apart by `currency` when given (a bank's pockets: one
/// IBAN or one preset, an account per currency).
pub fn account_named(h: &str, accounts: &BTreeMap<String, String>, notes: &Notes, currency: Option<&Commodity>) -> Result<Option<Account>, String> {
    if let Some((k, a)) = accounts.iter().find(|(k, _)| extract::loose(k) == extract::loose(h)) {
        return Account::parse(a).map(Some).map_err(|e| format!("the preset maps {k} to {a}: {e}"));
    }
    let digits: String = h.chars().filter(char::is_ascii_digit).collect();
    let by_number = |n: &crate::notes::AccountNote| digits.len() >= 4 && n.numbers.iter().any(|x| x.len() >= 4 && (x.ends_with(&digits) || digits.ends_with(x.as_str())));
    let by_name = |n: &crate::notes::AccountNote| {
        let h = extract::loose(h);
        n.aliases.iter().any(|a| extract::loose(a) == h) || extract::loose(n.account.as_str().rsplit(':').next().unwrap_or_default()) == h
    };
    let by_id = |n: &crate::notes::AccountNote| n.ids.iter().any(|x| extract::loose(x) == extract::loose(h));
    for test in [&by_id as &dyn Fn(&crate::notes::AccountNote) -> bool, &by_number, &by_name] {
        if let [one] = by_currency(notes.accounts.values().filter(|n| test(n)).collect(), currency)[..] {
            return Ok(Some(one.account.clone()));
        }
    }
    Ok(None)
}

/// Several fitting notes narrowed to the one(s) holding `currency` (its `currency`, or one of its `currencies`).
fn by_currency<'a>(hits: Vec<&'a crate::notes::AccountNote>, currency: Option<&Commodity>) -> Vec<&'a crate::notes::AccountNote> {
    match currency {
        Some(c) if hits.len() > 1 => hits.into_iter().filter(|n| n.currency.as_ref() == Some(c) || n.currencies.contains(c)).collect(),
        _ => hits,
    }
}

/// The account a statement is for: the one its holder names, else the one note whose `import:` lists its preset.
pub fn account_for(st: &Statement, notes: &Notes) -> Result<Account, String> {
    if let Some(a) = st.holder.as_deref().map(|h| account_named(h, &st.accounts, notes, Some(&st.currency))).transpose().map_err(|e| format!("{}: {e}", st.source))?.flatten() {
        return Ok(a);
    }
    let by_preset = by_currency(notes.accounts.values().filter(|n| n.import.contains(&st.preset)).collect(), Some(&st.currency));
    let printed = st.holder.as_ref().map(|h| format!(" (the file names it {h:?})")).unwrap_or_default();
    match by_preset[..] {
        [one] => Ok(one.account.clone()),
        [] => Err(format!("{}: which account is it{printed}? Add `import: [{}]`, or the number it prints (`iban:`, `card:`), to that account's note, or map it in the preset's `accounts`", st.source, st.preset)),
        _ => Err(format!("{}: {} account notes import `{}`; add the number it prints{printed} to the right one", st.source, by_preset.len(), st.preset)),
    }
}

/// What a statement is called, in its bank's folder: its account and its dates (`Unicaja Cuenta 2024-09-23 to
/// 2026-10-21`); its archived original and its note share the name.
pub fn title(st: &Statement, account: &Account) -> String {
    let name = account.as_str().split(':').skip(1).collect::<Vec<_>>().join(" ");
    let d = |x: Option<NaiveDate>| x.map_or("?".to_string(), |d| d.to_string());
    format!("{name} {} to {}", d(st.from), d(st.to))
}

/// Every statement note's balances against the ledger: the bank's word on a day the ledger must agree with.
pub fn check_notes(ledger: &crate::book::Ledger, notes: &Notes) -> Vec<Diagnostic> {
    let balance = |a: &Account, c: &Commodity, before: &dyn Fn(NaiveDate) -> bool| -> Decimal {
        ledger.txns.iter().filter(|b| before(b.txn.date)).flat_map(|b| &b.postings).filter(|p| &p.account == a && &p.units.commodity == c).map(|p| p.units.qty).sum()
    };
    let mut out = vec![];
    for n in &notes.statements {
        let checks = [("opening", n.from, n.opening.as_ref(), true), ("closing", n.to, n.closing.as_ref(), false)];
        for (what, date, bank, before) in checks {
            let (Some(d), Some(bank)) = (date, bank) else { continue };
            let ledger_q = balance(&n.account, &bank.commodity, &|x| if before { x < d } else { x <= d });
            if ledger_q != bank.qty {
                let when = if before { format!("before {d}") } else { format!("after {d}") };
                out.push(Diagnostic::error(&n.path, 1, format!("{}: the bank's {what} balance {when} is {} {}, the ledger's {} ({} apart)",
                    n.account, bank.qty, bank.commodity, ledger_q, (ledger_q - bank.qty).abs())));
            }
        }
    }
    out
}

/// A date in the preset's shapes, then the usual bank shapes; a spreadsheet's day number (`46316`) too.
pub fn bank_date(s: &str, first: &[String]) -> Option<NaiveDate> {
    let s = s.trim();
    // A spreadsheet's day number (days since 1899-12-30) before any shape: `%y%m%d` would read `46023` as 2046.
    if s.len() <= 8 && s.split('.').next().is_some_and(|i| i.len() == 5 && i.chars().all(|c| c.is_ascii_digit())) {
        let serial: f64 = s.parse().ok()?;
        return NaiveDate::from_ymd_opt(1899, 12, 30)?.checked_add_days(chrono::Days::new(serial as u64));
    }
    let usual = ["%d/%m/%Y", "%d-%m-%Y", "%d-%m-%y", "%d/%m/%y", "%Y-%m-%d", "%y%m%d", "%d %b %Y", "%B %d %Y"];
    for f in first.iter().map(String::as_str).chain(usual) {
        // `%Y` also reads `25` as the year 25: a two-digit year is `%y`'s.
        if let Some(d) = NaiveDate::parse_from_str(s, f).ok().filter(|d| chrono::Datelike::year(d) >= 1900) {
            return Some(d);
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn dates_in_every_bank_shape() {
        let d = NaiveDate::from_ymd_opt(2025, 4, 9).unwrap();
        for s in ["09/04/2025", "09-04-25", "250409", "2025-04-09", "9 APR 2025", "April 9 2025", "45756", "45756.0"] {
            assert_eq!(bank_date(s, &[]), Some(d), "{s}");
        }
    }
}
