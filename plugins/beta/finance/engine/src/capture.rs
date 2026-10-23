//! Natural-language capture (DESIGN-finance "Capture: natural language with a live helper"): "12,40 café con Ana
//! revolut ayer", "30 cad groceries desjardins", "+1500 salary unicaja" → a `!` transaction. The words it knows (days,
//! weekdays, months, currencies, income and filler words) are data (`data/capture.toml`, a vault's
//! `finance/capture.toml` adding to it); the account comes from the account notes' aliases, the category from a
//! category's own name in the text, else the classifier (rules → history → vocabulary).
use crate::book::Ledger;
use crate::classify::{words, Classifier};
use crate::model::*;
use crate::notes::Notes;
use chrono::{Datelike, Duration, NaiveDate};
use regex::Regex;
use rust_decimal::Decimal;
use serde::Deserialize;
use std::collections::BTreeMap;

#[derive(Debug, Default, Deserialize)]
#[serde(deny_unknown_fields)]
struct Lists {
    #[serde(default)]
    income: Vec<String>,
    #[serde(default)]
    filler: Vec<String>,
}

#[derive(Debug, Default, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Vocabulary {
    #[serde(default)]
    days: BTreeMap<String, i64>,
    #[serde(default)]
    weekdays: BTreeMap<String, u32>,
    #[serde(default)]
    months: BTreeMap<String, u32>,
    #[serde(default)]
    currencies: BTreeMap<String, String>,
    #[serde(default)]
    words: Lists,
}

const BUILT_IN: &str = include_str!("../../data/capture.toml");

impl Vocabulary {
    /// The plugin's words with the vault's added (its entries win on the same key).
    pub fn load(vault: Option<&str>) -> Result<Vocabulary, String> {
        let mut v: Vocabulary = toml::from_str(BUILT_IN).map_err(|e| format!("data/capture.toml: {e}"))?;
        if let Some(t) = vault {
            let o: Vocabulary = toml::from_str(t).map_err(|e| format!("finance/capture.toml: {e}"))?;
            v.days.extend(o.days);
            v.weekdays.extend(o.weekdays);
            v.months.extend(o.months);
            v.currencies.extend(o.currencies);
            v.words.income.extend(o.words.income);
            v.words.filler.extend(o.words.filler);
        }
        Ok(v)
    }
}

/// What a capture says.
#[derive(Debug, Clone, PartialEq)]
pub struct Captured {
    pub date: NaiveDate,
    /// Positive: what the category receives (a payment), negative for income.
    pub amount: Amount,
    pub account: Account,
    pub category: Account,
    pub payee: String,
    /// Why this category (the classifier's reason, or "named").
    pub why: String,
    /// Sure of the category (named, a rule, a confident guess).
    pub sure: bool,
    pub income: bool,
}

impl Captured {
    /// The helper's line: "→ payment 12.40 EUR · Food · Cafe · Revolut · 20 Oct".
    pub fn hint(&self) -> String {
        let kind = if self.income { "income" } else { "payment" };
        let label = |a: &Account| a.as_str().split(':').skip(1).collect::<Vec<_>>().join(" · ");
        let cat = if self.category.is_under("Expenses:Unknown") { "no category yet".to_string() } else { format!("{}{}", label(&self.category), if self.sure { "" } else { "?" }) };
        format!("→ {kind} {} · {cat} · {} · {}", crate::write::amount(&Amount::new(self.amount.qty.abs(), self.amount.commodity.clone())), label(&self.account), self.date.format("%-d %b"))
    }

    /// The transaction, for the journal: `!` (Review accepts it), the capture's words as its narration, linked back.
    pub fn txn(&self, text: &str, link: Option<&str>) -> String {
        let mut s = format!("{} ! {} | {}\n", self.date, self.payee, text.replace(';', ","));
        if let Some(l) = link {
            s += &format!("  capture: [[{l}]]\n");
        }
        s += &format!("  {}  {}\n  {}\n", self.category, crate::write::amount(&self.amount), self.account);
        s
    }
}

/// Reads a capture; `None` when it does not look like money (an amount with a currency, a known account, or a
/// leading +): a plain thought is left alone.
pub fn read(text: &str, l: &Ledger, notes: &Notes, voc: &Vocabulary, default_account: &Account, today: NaiveDate) -> Option<Captured> {
    let fold = |s: &str| words(s).join(" ");
    let amount_re = Regex::new(r"(?i)(?P<sign>[+-])?\s*(?P<pre>€|\$|£|ca\$)?\s*(?P<n>\d+(?:[.,]\d{1,2})?)(?:\s*(?P<post>€|\$|£|[a-z]{3,6}\b))?").ok()?;
    let mut rest = text.to_string();
    let mut found = None;
    for c in amount_re.captures_iter(text) {
        let whole = c.get(0)?;
        // A day number in a date ("20 oct", "20/10") is not the amount: take the first number not followed by a month or a slash.
        let after = &text[whole.end()..];
        let next_word = c.name("post").map(|m| m.as_str().to_lowercase()).unwrap_or_else(|| words(after).into_iter().next().unwrap_or_default());
        let cur_word = |m: Option<regex::Match>| m.map(|m| m.as_str().to_lowercase()).and_then(|w| voc.currencies.get(&w).cloned());
        let cur = cur_word(c.name("pre")).or_else(|| cur_word(c.name("post")));
        if after.starts_with('/') || cur.is_none() && voc.months.contains_key(next_word.as_str()) {
            continue;
        }
        // A word after the number that is not a currency stays in the text ("30 groceries").
        let end = if cur.is_some() || c.name("post").is_none() { whole.end() } else { c.name("n")?.end() };
        found = Some((c.name("sign").map(|m| m.as_str() == "+").unwrap_or(false), c.name("n")?.as_str().replace(',', "."), cur));
        rest.replace_range(whole.start()..end, " ");
        break;
    }
    let (plus, n, cur) = found?;
    let qty: Decimal = n.parse().ok()?;
    let ws: Vec<String> = tokens(&rest);
    // The date: a day word, a weekday, "20 oct", "20/10", or an ISO date; else today.
    let mut date = today;
    let mut used: Vec<String> = vec![];
    if let Some(m) = Regex::new(r"\b(\d{4})-(\d{2})-(\d{2})\b").ok()?.captures(&rest) {
        if let Some(d) = NaiveDate::from_ymd_opt(m[1].parse().ok()?, m[2].parse().ok()?, m[3].parse().ok()?) {
            date = d;
            rest = rest.replace(&m[0], " ");
        }
    } else if let Some(m) = Regex::new(r"\b(\d{1,2})/(\d{1,2})\b").ok()?.captures(&rest) {
        if let Some(d) = past(today, m[2].parse().ok()?, m[1].parse().ok()?) {
            date = d;
            rest = rest.replace(&m[0], " ");
        }
    }
    // Day words may be several once folded ("aujourd'hui" → "aujourd hui", "avant-hier" → "avant hier").
    let folded_rest = format!(" {} ", ws.join(" "));
    for (k, back) in voc.days.iter().map(|(k, b)| (fold(k), *b)) {
        if !k.is_empty() && folded_rest.contains(&format!(" {k} ")) {
            date = today - Duration::days(back);
            used.extend(k.split(' ').map(str::to_string));
        }
    }
    for (i, w) in ws.iter().enumerate() {
        if let Some(wd) = voc.weekdays.get(w) {
            let back = (today.weekday().num_days_from_monday() + 7 - wd) % 7;
            date = today - Duration::days(back as i64);
            used.push(w.clone());
        } else if let Some(mo) = voc.months.get(w) {
            if let Some(day) = i.checked_sub(1).and_then(|j| ws[j].parse::<u32>().ok()).or_else(|| text_day_before(&rest, w)) {
                if let Some(d) = past(today, *mo, day) {
                    date = d;
                    used.push(w.clone());
                    used.push(day.to_string());
                }
            }
        }
    }
    // The account: the note whose aliases (or name parts) the text names most; on a tie the busiest.
    let mut best: Option<(usize, usize, &Account)> = None;
    for n in notes.accounts.values().filter(|n| n.closed.is_none()) {
        let mut names: Vec<String> = n.aliases.iter().map(|a| fold(a)).collect();
        names.extend(n.account.as_str().split(':').skip(1).map(fold));
        let hits = names.iter().filter(|a| !a.is_empty() && (ws.contains(a) || fold(&rest).contains(a.as_str()) && a.contains(' '))).count();
        if hits == 0 {
            continue;
        }
        let busy = l.txns.iter().rev().take(500).filter(|b| b.postings.iter().any(|p| p.account == n.account)).count();
        if best.is_none_or(|(h, b, _)| (hits, busy) > (h, b)) {
            best = Some((hits, busy, &n.account));
        }
    }
    let account_named = best.is_some();
    if cur.is_none() && !account_named && !plus {
        return None;
    }
    let account = best.map(|b| b.2.clone()).unwrap_or_else(|| default_account.clone());
    if let Some(n) = notes.accounts.get(&account) {
        let mut names: Vec<String> = n.aliases.iter().map(|a| fold(a)).collect();
        names.extend(n.account.as_str().split(':').skip(1).map(fold));
        used.extend(names);
    }
    let commodity = cur.map(|c| Commodity::parse(&c)).transpose().ok()?
        .or_else(|| notes.accounts.get(&account).and_then(|n| n.currency.clone()))
        .unwrap_or_else(|| Commodity::parse("EUR").expect("EUR"));
    let income = plus || ws.iter().any(|w| voc.words.income.contains(w));
    let currency_words: Vec<String> = voc.currencies.keys().cloned().collect();
    let left: Vec<&String> = ws.iter().filter(|w| !used.contains(w) && !voc.words.filler.contains(w) && !currency_words.contains(w) && w.parse::<u32>().is_err()).collect();
    let payee = {
        let raw = left.iter().map(|s| s.as_str()).collect::<Vec<_>>().join(" ");
        let mut c = raw.chars();
        c.next().map(|f| f.to_uppercase().collect::<String>() + c.as_str()).unwrap_or_else(|| "Capture".into())
    };
    let flow = if income { qty } else { -qty };
    let root = if income { "Income" } else { "Expenses" };
    // A category named in the text ("groceries" → Expenses:Food:Groceries): the ledger's own, by its last part.
    let named = left.iter().find_map(|w| {
        let mut known: Vec<&Account> = l.txns.iter().flat_map(|b| &b.postings).map(|p| &p.account)
            .filter(|a| a.as_str().starts_with(root) && !a.is_under("Expenses:Unknown") && a.as_str().rsplit(':').next().map(fold).as_deref() == Some(w.as_str())).collect();
        known.sort_by_key(|a| a.as_str().len());
        known.first().map(|a| (*a).clone())
    });
    let (category, why, sure) = match named {
        Some(a) => (a, "named".to_string(), true),
        None => match Classifier::new(l, notes).guess(&[&payee], flow) {
            Some(g) if g.sure() => (g.account.clone(), g.reason(), true),
            Some(g) => (g.account.clone(), g.reason(), false),
            None => (Account::parse(&format!("{root}:Unknown")).ok()?, "nothing like it yet".into(), false),
        },
    };
    let category = if category.root().needs_note() || matches!(category.root(), Root::Expenses | Root::Income) { category } else { Account::parse("Expenses:Unknown").ok()? };
    Some(Captured { date, amount: Amount::new(if income { -qty } else { qty }, commodity), account, category, payee, why, sure, income })
}

/// Words and numbers, folded as `words` folds them (which drops numbers: a payee's digits are noise, a date's not).
fn tokens(s: &str) -> Vec<String> {
    s.split(|c: char| !c.is_alphanumeric()).filter(|w| !w.is_empty()).flat_map(|w| if w.chars().all(|c| c.is_ascii_digit()) { vec![w.to_string()] } else { words(w) }).collect()
}

/// "le 5 mai" → the 5 written before the month with words between ("5 de mayo").
fn text_day_before(text: &str, month: &str) -> Option<u32> {
    let ws = tokens(text);
    let i = ws.iter().position(|w| w == month)?;
    ws[..i].iter().rev().take(2).find_map(|w| w.parse().ok())
}

/// The latest date with this month and day on or before today (a capture is about the past).
fn past(today: NaiveDate, month: u32, day: u32) -> Option<NaiveDate> {
    let this = NaiveDate::from_ymd_opt(today.year(), month, day)?;
    if this <= today { Some(this) } else { NaiveDate::from_ymd_opt(today.year() - 1, month, day) }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::load::load_texts;

    fn vault() -> crate::load::Loaded {
        let acct = |n: &str, a: &str, c: &str, al: &str| (format!("finance/accounts/{n}.md"), format!("---\ntype: finance-account\naccount: {a}\ncurrency: {c}\naliases: [{al}]\n---\n"));
        let mut j = String::new();
        for i in 1..=6 {
            j += &format!("2026-09-{i:02} * Cafe Celia\n  Expenses:Food:Snacks  2.40 EUR\n  Assets:Revolut\n");
        }
        j += "2026-09-10 * Mercadona\n  Expenses:Food:Groceries  30 EUR\n  Assets:Unicaja\n2026-09-11 * Pay\n  Income:Salary  -100 CAD\n  Assets:Desjardins\n";
        load_texts(&[("finance/journal/2026.fin".into(), j), acct("Revolut", "Assets:Revolut", "EUR", "revolut, revo"), acct("Unicaja", "Assets:Unicaja", "EUR", "unicaja"),
            acct("Desjardins", "Assets:Desjardins", "CAD", "desjardins"), acct("Cash", "Assets:Cash", "EUR", "cash, efectivo")])
    }

    #[test]
    fn phrases_in_three_languages() {
        let l = vault();
        let voc = Vocabulary::load(None).unwrap();
        let cash = Account::parse("Assets:Cash").unwrap();
        let today: NaiveDate = "2026-10-21".parse().unwrap(); // a Wednesday
        let r = |t: &str| read(t, &l.ledger, &l.notes, &voc, &cash, today);
        let c = r("12,40 café con Ana revolut ayer").unwrap();
        assert_eq!((c.date.to_string(), c.amount.qty.to_string(), c.account.as_str(), c.payee.as_str()), ("2026-10-20".into(), "12.40".into(), "Assets:Revolut", "Cafe ana"));
        assert_eq!(c.category.as_str(), "Expenses:Food:Snacks", "{c:?}");
        let c = r("30 cad groceries desjardins").unwrap();
        assert_eq!((c.amount.commodity.as_str(), c.account.as_str(), c.category.as_str(), c.why.as_str()), ("CAD", "Assets:Desjardins", "Expenses:Food:Groceries", "named"));
        let c = r("+1500 salary unicaja").unwrap();
        assert!(c.income);
        assert_eq!((c.amount.qty.to_string(), c.category.as_str()), ("-1500".into(), "Income:Salary"));
        let c = r("8€ boulangerie hier").unwrap();
        assert_eq!((c.account.as_str(), c.date.to_string(), c.amount.commodity.as_str()), ("Assets:Cash", "2026-10-20".into(), "EUR"));
        let c = r("25 eur cena viernes efectivo").unwrap();
        assert_eq!((c.date.to_string(), c.account.as_str()), ("2026-10-16".into(), "Assets:Cash"));
        let c = r("45,50 € dentista 3 de marzo unicaja").unwrap();
        assert_eq!((c.date.to_string(), c.amount.qty.to_string()), ("2026-03-03".into(), "45.50".into()));
        let c = r("20 oct 14 eur mercadona").unwrap();
        assert_eq!((c.date.to_string(), c.amount.qty.to_string(), c.category.as_str()), ("2026-10-20".into(), "14".into(), "Expenses:Food:Groceries"));
        // A plain thought is not money.
        assert!(r("call Ana about the 3 papers").is_none());
        assert!(r("buy 2 notebooks").is_none());
        assert!(r("12,40 café revolut ayer").unwrap().hint().starts_with("→ payment 12.40 EUR · Food · Snacks · Revolut · 20 Oct"));
    }

    #[test]
    fn the_transaction_parses_and_balances() {
        let l = vault();
        let voc = Vocabulary::load(None).unwrap();
        let c = read("12,40 café revolut ayer", &l.ledger, &l.notes, &voc, &Account::parse("Assets:Cash").unwrap(), "2026-10-21".parse().unwrap()).unwrap();
        let text = c.txn("12,40 café revolut ayer; with Ana", Some("daily/2026-10-21"));
        let (mut j, mut d) = (Journal::default(), vec![]);
        crate::parse::parse_file("x.fin", &text, &mut j, &mut d);
        assert!(d.is_empty(), "{d:?}\n{text}");
        assert_eq!(j.txns[0].status, Status::Review);
        assert_eq!(j.txns[0].meta("capture"), Some("[[daily/2026-10-21]]"));
    }
}
