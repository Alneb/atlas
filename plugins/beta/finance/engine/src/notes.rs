//! The notes that carry the journal's metadata (DESIGN-finance-format.md, "Directives"): one per real account
//! (`type: finance-account`), per non-currency commodity (`finance-commodity`), per category with a target
//! (`finance-category`). Read from their frontmatter; anything else in the vault is ignored.
use crate::model::*;
use crate::parse::{parse_amount, parse_date};
use chrono::NaiveDate;
use serde_yaml::Value;
use std::collections::BTreeMap;
use std::sync::Arc;

#[derive(Clone, Debug, PartialEq)]
pub struct AccountNote {
    pub path: Arc<str>,
    pub account: Account,
    pub currency: Option<Commodity>,
    /// Other currencies it holds besides `currency` (`currencies: [CAD]`: a Revolut pocket).
    pub currencies: Vec<Commodity>,
    pub opened: Option<NaiveDate>,
    pub closed: Option<NaiveDate>,
    pub aliases: Vec<String>,
    pub booking: Option<Booking>,
    /// The importer presets its statements are read with (`import: [norma43, unicaja-account-xls]`).
    pub import: Vec<String>,
    /// The numbers a statement names it by (`iban`, `ccc`, `card`, each one or a list), digits only.
    pub numbers: Vec<String>,
    /// What a statement may name it by verbatim: those numbers as written and `bank-uid` (Enable Banking's id for an
    /// account with no IBAN, e.g. a Revolut pocket in another currency).
    pub ids: Vec<String>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum CommodityKind {
    Currency,
    Fund,
    Stock,
    Etf,
    Crypto,
    Other,
}

#[derive(Clone, Debug, PartialEq)]
pub struct CommodityNote {
    pub path: Arc<str>,
    pub symbol: Commodity,
    pub name: Option<String>,
    pub kind: CommodityKind,
    pub booking: Option<Booking>,
    pub precision: Option<u32>,
    pub isin: Option<String>,
    /// Where its price is read (pricefeed.rs): `ft`, `none`, or a page's URL with the regexes that find it.
    pub price_source: Option<String>,
    /// Its symbol on Yahoo (`GC=F`, `VWCE.DE`).
    pub ticker: Option<String>,
    pub price_find: Option<String>,
    pub price_date_find: Option<String>,
    pub price_date_format: Option<String>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct CategoryNote {
    pub path: Arc<str>,
    pub account: Account,
    pub target: Option<Amount>,
}

/// A statement's companion note (`type: finance-statement`), written by the import: the bank's balances, checked
/// against the ledger on every load, and the original's checksum, so the same file is never read twice.
#[derive(Clone, Debug, PartialEq)]
pub struct StatementNote {
    pub path: Arc<str>,
    pub account: Account,
    pub sha256: Option<String>,
    pub from: Option<NaiveDate>,
    pub to: Option<NaiveDate>,
    pub opening: Option<Amount>,
    pub closing: Option<Amount>,
}

/// A bank connection (`type: finance-source`, `finance/sources/<bank>.md`), written by the connect and the sync: which
/// bank, until when the consent holds, the linked accounts (Enable Banking's ids and the IBANs), and the last day read.
/// The session's id is kept here too: it is worth nothing without the application's key (a secret of the plugin).
#[derive(Clone, Debug, PartialEq)]
pub struct SourceNote {
    pub path: Arc<str>,
    pub bank: String,
    pub country: String,
    pub session: Option<String>,
    pub until: Option<NaiveDate>,
    pub synced: Option<NaiveDate>,
    /// (uid, iban, the bank's name for it)
    pub accounts: Vec<(String, String, String)>,
    pub error: Option<String>,
}

#[derive(Clone, Debug, Default)]
pub struct Notes {
    pub sources: Vec<SourceNote>,
    pub statements: Vec<StatementNote>,
    pub accounts: BTreeMap<Account, AccountNote>,
    pub commodities: BTreeMap<Commodity, CommodityNote>,
    pub categories: BTreeMap<Account, CategoryNote>,
    /// The ```finance-rules fences of every note (rules.rs).
    pub rules: crate::rules::Rules,
    /// The vault's own data files over the plugin's (`prices.toml`, `vocabulary.toml` at the folder's top), by name.
    pub data: BTreeMap<String, String>,
}

/// The data files a vault may put at the finance folder's top to extend the plugin's `data/`.
pub const DATA_FILES: [&str; 5] = ["prices.toml", "vocabulary.toml", "capture.toml", "enable-banking.toml", "banks.toml"];

impl Notes {
    /// Does this commodity keep lots? A noted non-currency, or anything that is not three capitals.
    pub fn is_lotted(&self, c: &Commodity) -> bool {
        match self.commodities.get(c) {
            Some(n) => n.kind != CommodityKind::Currency,
            None => !c.looks_like_currency(),
        }
    }

    pub fn booking(&self, account: &Account, c: &Commodity) -> Booking {
        self.accounts.get(account).and_then(|a| a.booking)
            .or_else(|| self.commodities.get(c).and_then(|n| n.booking))
            .unwrap_or(Booking::Fifo)
    }

    /// Reads one note; `Ok(false)` when it is not a finance note.
    pub fn add(&mut self, path: &str, text: &str, diags: &mut Vec<Diagnostic>) -> bool {
        let path: Arc<str> = path.into();
        let Some(fm) = frontmatter(text) else { return false };
        let Ok(v) = serde_yaml::from_str::<Value>(fm) else { return false };
        let s = |k: &str| v.get(k).and_then(scalar);
        let kind = s("type");
        let err = |diags: &mut Vec<Diagnostic>, m: String| diags.push(Diagnostic::error(&path, 1, m));
        let date = |k: &str, diags: &mut Vec<Diagnostic>| match s(k) {
            Some(d) if !d.is_empty() => parse_date(&d).map_err(|e| err(diags, format!("{k}: {e}"))).ok(),
            _ => None,
        };
        let booking = |diags: &mut Vec<Diagnostic>| s("booking").and_then(|b| {
            Booking::parse(&b).or_else(|| { err(diags, format!("booking: {b:?} is not fifo or avg")); None })
        });
        match kind.as_deref() {
            Some("finance-account") => {
                let Some(account) = s("account").and_then(|a| Account::parse(&a).map_err(|e| err(diags, e)).ok()) else {
                    err(diags, "a finance-account note needs `account: Assets:…`".into());
                    return true;
                };
                let note = AccountNote {
                    path: path.clone(),
                    currency: s("currency").and_then(|c| Commodity::parse(&c).map_err(|e| err(diags, e)).ok()),
                    currencies: list(v.get("currencies")).iter().filter_map(|c| Commodity::parse(c).map_err(|e| err(diags, e)).ok()).collect(),
                    opened: date("opened", diags),
                    closed: date("closed", diags),
                    aliases: list(v.get("aliases")),
                    booking: booking(diags),
                    import: list(v.get("import")),
                    numbers: ["iban", "ccc", "card"].iter().flat_map(|k| one_or_many(v.get(*k))).map(|n| n.chars().filter(char::is_ascii_digit).collect::<String>()).filter(|n| !n.is_empty()).collect(),
                    ids: ["iban", "ccc", "card", "bank-uid"].iter().flat_map(|k| one_or_many(v.get(*k))).filter(|n| !n.trim().is_empty()).collect(),
                    account: account.clone(),
                };
                if let Some(old) = self.accounts.insert(account.clone(), note) {
                    err(diags, format!("{account} has two notes (also {})", old.path));
                }
            }
            Some("finance-commodity") => {
                let Some(symbol) = s("symbol").and_then(|c| Commodity::parse(&c).map_err(|e| err(diags, e)).ok()) else {
                    err(diags, "a finance-commodity note needs `symbol: DVF`".into());
                    return true;
                };
                let kind = match s("kind").as_deref().unwrap_or("other") {
                    "currency" => CommodityKind::Currency,
                    "fund" => CommodityKind::Fund,
                    "stock" => CommodityKind::Stock,
                    "etf" => CommodityKind::Etf,
                    "crypto" => CommodityKind::Crypto,
                    _ => CommodityKind::Other,
                };
                let note = CommodityNote {
                    path: path.clone(),
                    name: s("name"),
                    kind,
                    booking: booking(diags),
                    precision: s("precision").and_then(|p| p.parse().ok()),
                    isin: s("isin"),
                    price_source: s("price_source"),
                    ticker: s("ticker"),
                    price_find: s("price_find"),
                    price_date_find: s("price_date_find"),
                    price_date_format: s("price_date_format"),
                    symbol: symbol.clone(),
                };
                self.commodities.insert(symbol, note);
            }
            Some("finance-category") => {
                let Some(account) = s("account").and_then(|a| Account::parse(&a).map_err(|e| err(diags, e)).ok()) else {
                    err(diags, "a finance-category note needs `account: Expenses:…`".into());
                    return true;
                };
                let target = s("target").and_then(|t| parse_amount(&t).map_err(|e| err(diags, format!("target: {e}"))).ok());
                self.categories.insert(account.clone(), CategoryNote { path: path.clone(), account, target });
            }
            Some("finance-source") => {
                let accounts = match v.get("accounts") {
                    Some(Value::Sequence(xs)) => xs.iter().filter_map(|x| Some((x.get("uid").and_then(scalar)?, x.get("iban").and_then(scalar).unwrap_or_default(), x.get("name").and_then(scalar).unwrap_or_default()))).collect(),
                    _ => vec![],
                };
                let note = SourceNote {
                    path: path.clone(), bank: s("bank").unwrap_or_default(), country: s("country").unwrap_or_default(), session: s("session").filter(|x| !x.is_empty()),
                    until: date("until", diags), synced: date("synced", diags), accounts, error: s("error").filter(|e| !e.is_empty()),
                };
                self.sources.push(note);
            }
            Some("finance-statement") => {
                let Some(account) = s("account").and_then(|a| Account::parse(&a).map_err(|e| err(diags, e)).ok()) else {
                    err(diags, "a finance-statement note needs `account: Assets:…`".into());
                    return true;
                };
                let amount = |k: &str, diags: &mut Vec<Diagnostic>| s(k).filter(|x| !x.is_empty()).and_then(|t| parse_amount(&t).map_err(|e| err(diags, format!("{k}: {e}"))).ok());
                let note = StatementNote {
                    path: path.clone(),
                    sha256: s("sha256"),
                    from: date("from", diags),
                    to: date("to", diags),
                    opening: amount("opening", diags),
                    closing: amount("closing", diags),
                    account,
                };
                self.statements.push(note);
            }
            _ => return false,
        }
        true
    }
}

pub fn frontmatter(text: &str) -> Option<&str> {
    atlas_text::frontmatter::split(text).0
}

/// A top-level property's values (one or a list), as `set_property` finds it.
pub fn property_list(text: &str, key: &str) -> Vec<String> {
    frontmatter(text).and_then(|fm| serde_yaml::from_str::<Value>(fm).ok()).map_or_else(Vec::new, |v| one_or_many(v.get(key)))
}

/// The note with one top-level property set to `value` (its line replaced, or added at the frontmatter's end), or
/// removed with `None`; every other line kept as written.
pub fn set_property(text: &str, key: &str, value: Option<&str>) -> String {
    let line = value.map(|v| format!("{key}: {v}"));
    let Some(fm) = frontmatter(text) else {
        return match line { Some(l) => format!("---\n{l}\n---\n{text}"), None => text.to_string() };
    };
    let start = text.find(fm).unwrap_or(0);
    let mut lines: Vec<String> = fm.lines().map(str::to_string).collect();
    match (lines.iter().position(|l| l.split_once(':').is_some_and(|(k, _)| k == key)), line) {
        (Some(i), Some(l)) => lines[i] = l,
        (Some(i), None) => { lines.remove(i); }
        (None, Some(l)) => lines.push(l),
        (None, None) => {}
    }
    format!("{}{}\n{}", &text[..start], lines.join("\n"), &text[start + fm.len()..])
}

fn scalar(v: &Value) -> Option<String> {
    match v {
        Value::String(s) => Some(s.clone()),
        Value::Number(n) => Some(n.to_string()),
        Value::Bool(b) => Some(b.to_string()),
        _ => None,
    }
}

/// A property that is one value or a list of them (`iban: ES12…` or `iban: [ES12…, LT34…]`).
fn one_or_many(v: Option<&Value>) -> Vec<String> {
    v.and_then(scalar).map_or_else(|| list(v), |s| vec![s])
}

fn list(v: Option<&Value>) -> Vec<String> {
    match v {
        Some(Value::Sequence(xs)) => xs.iter().filter_map(scalar).collect(),
        Some(v) => scalar(v).map(|s| s.split(',').map(|x| x.trim().to_string()).filter(|x| !x.is_empty()).collect()).unwrap_or_default(),
        None => vec![],
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_property_is_set_and_removed_in_place() {
        let t = "---\ntype: finance-category\naccount: Expenses:Food\n---\n\n# Food\n";
        let with = set_property(t, "target", Some("250 EUR"));
        assert_eq!(with, "---\ntype: finance-category\naccount: Expenses:Food\ntarget: 250 EUR\n---\n\n# Food\n");
        assert_eq!(set_property(&with, "target", Some("300 EUR")).matches("target").count(), 1);
        assert_eq!(set_property(&with, "target", None), t);
    }

    #[test]
    fn one_account_is_found_by_any_of_its_ibans_or_bank_uids() {
        // Revolut through Enable Banking: a EUR pocket with an IBAN, a CAD one known only by its uid — one ledger account
        let (mut n, mut d) = (Notes::default(), vec![]);
        n.add("r.md", "---\ntype: finance-account\naccount: Assets:Revolut\niban: [LT12 3250 0000 1111 2222, LT99 3250 0000 3333 4444]\nbank-uid: [\"9f1c-cad\"]\n---\n", &mut d);
        n.add("u.md", "---\ntype: finance-account\naccount: Assets:Unicaja:Cuenta\niban: ES27 2103 7241 2500 1004 3663\n---\n", &mut d);
        assert!(d.is_empty(), "{d:?}");
        let named = |h: &str| crate::statement::account_named(h, &Default::default(), &n, None).unwrap().map(|a| a.as_str().to_string());
        assert_eq!(named("LT993250000033334444").as_deref(), Some("Assets:Revolut"), "the second IBAN of a list");
        assert_eq!(named("LT12 3250 0000 1111 2222").as_deref(), Some("Assets:Revolut"));
        assert_eq!(named("9f1c-cad").as_deref(), Some("Assets:Revolut"), "a uid, verbatim");
        assert_eq!(named("ES2721037241250010043663").as_deref(), Some("Assets:Unicaja:Cuenta"));
        assert_eq!(named("unknown-uid"), None);
        assert_eq!(property_list("---\nbank-uid: [a, b]\n---\n", "bank-uid"), ["a", "b"]);
        // one IBAN, an account per currency
        let mut two = Notes::default();
        two.add("e.md", "---\ntype: finance-account\naccount: Assets:Revolut:EUR\ncurrency: EUR\niban: LT12 3250 0000 1111 2222\n---\n", &mut d);
        two.add("c.md", "---\ntype: finance-account\naccount: Assets:Revolut:CAD\ncurrency: CAD\niban: LT12 3250 0000 1111 2222\n---\n", &mut d);
        let cad = Commodity::parse("CAD").unwrap();
        let pick = |c: Option<&Commodity>| crate::statement::account_named("LT123250000011112222", &Default::default(), &two, c).unwrap().map(|a| a.as_str().to_string());
        assert_eq!(pick(Some(&cad)).as_deref(), Some("Assets:Revolut:CAD"));
        assert_eq!(pick(None), None, "without a currency the two are not guessed between");
        assert_eq!(property_list("---\nbank-uid: a\n---\n", "bank-uid"), ["a"]);
    }

    #[test]
    fn reads_an_account_and_a_fund() {
        let (mut n, mut d) = (Notes::default(), vec![]);
        assert!(n.add("a.md", "---\ntype: finance-account\naccount: Assets:Revolut\ncurrency: EUR\nopened: 2024-01-08\naliases: [revo, revolut]\n---\nbody", &mut d));
        assert!(n.add("f.md", "---\ntype: finance-commodity\nsymbol: DVF\nkind: fund\nbooking: fifo\n---\n", &mut d));
        assert!(!n.add("x.md", "---\ntype: note\n---\n", &mut d));
        assert!(d.is_empty(), "{d:?}");
        let a = &n.accounts[&Account::parse("Assets:Revolut").unwrap()];
        assert_eq!(a.aliases, vec!["revo", "revolut"]);
        assert!(n.is_lotted(&Commodity::parse("DVF").unwrap()));
        assert!(!n.is_lotted(&Commodity::parse("CAD").unwrap()));
        assert!(n.is_lotted(&Commodity::parse("AAPL").unwrap()));
    }
}
