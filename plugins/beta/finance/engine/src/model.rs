//! The journal's types (docs/design/DESIGN-finance-format.md). Each newtype validates on construction, so an account
//! outside the five roots or a lower-case commodity cannot exist past the parser.
use chrono::NaiveDate;
use rust_decimal::Decimal;
use std::collections::BTreeSet;
use std::fmt;
use std::sync::Arc;

#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub enum Root {
    Assets,
    Liabilities,
    Equity,
    Income,
    Expenses,
}

impl Root {
    pub fn parse(s: &str) -> Option<Root> {
        Some(match s {
            "Assets" => Root::Assets,
            "Liabilities" => Root::Liabilities,
            "Equity" => Root::Equity,
            "Income" => Root::Income,
            "Expenses" => Root::Expenses,
            _ => return None,
        })
    }
    /// Real accounts (a bank, a fund) must have a note; categories need none.
    pub fn needs_note(self) -> bool {
        matches!(self, Root::Assets | Root::Liabilities)
    }
    /// hledger's account type letter.
    pub fn hledger_type(self) -> char {
        match self {
            Root::Assets => 'A',
            Root::Liabilities => 'L',
            Root::Equity => 'E',
            Root::Income => 'R',
            Root::Expenses => 'X',
        }
    }
}

/// `Root:Part:Part`; parts are non-empty, may hold single spaces, never two or a tab.
#[derive(Clone, Debug, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct Account(Arc<str>);

impl Account {
    pub fn parse(s: &str) -> Result<Account, String> {
        let root = s.split(':').next().unwrap_or("");
        if Root::parse(root).is_none() {
            return Err(format!("account {s:?} must start with Assets, Liabilities, Equity, Income or Expenses"));
        }
        if s.split(':').any(|p| p.is_empty() || p.starts_with(' ') || p.ends_with(' ')) || s.contains("  ") || s.contains('\t') {
            return Err(format!("account {s:?} has an empty part or stray spaces"));
        }
        Ok(Account(s.into()))
    }
    pub fn root(&self) -> Root {
        Root::parse(self.0.split(':').next().unwrap()).unwrap()
    }
    pub fn as_str(&self) -> &str {
        &self.0
    }
    /// This account or one under it.
    pub fn is_under(&self, prefix: &str) -> bool {
        self.0.as_ref() == prefix || self.0.starts_with(&format!("{prefix}:"))
    }
}

impl fmt::Display for Account {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        f.write_str(&self.0)
    }
}

/// `[A-Z][A-Z0-9._]{0,23}`.
#[derive(Clone, Debug, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct Commodity(Arc<str>);

impl Commodity {
    pub fn parse(s: &str) -> Result<Commodity, String> {
        let mut cs = s.chars();
        let ok = matches!(cs.next(), Some('A'..='Z'))
            && s.len() <= 24
            && cs.all(|c| c.is_ascii_uppercase() || c.is_ascii_digit() || c == '.' || c == '_');
        if ok { Ok(Commodity(s.into())) } else { Err(format!("commodity {s:?} must be capitals, digits, . or _ (like EUR, DVF)")) }
    }
    /// Three capitals: read as an ISO currency unless a commodity note says otherwise.
    pub fn looks_like_currency(&self) -> bool {
        self.0.len() == 3 && self.0.chars().all(|c| c.is_ascii_uppercase())
    }
    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl fmt::Display for Commodity {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        f.write_str(&self.0)
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Amount {
    pub qty: Decimal,
    pub commodity: Commodity,
}

impl Amount {
    pub fn new(qty: Decimal, commodity: Commodity) -> Amount {
        Amount { qty, commodity }
    }
}

impl fmt::Display for Amount {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        write!(f, "{} {}", self.qty, self.commodity)
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Status {
    /// `*`
    Accepted,
    /// `!`: imported or captured, waiting in Review.
    Review,
}

impl Status {
    pub fn mark(self) -> char {
        match self {
            Status::Accepted => '*',
            Status::Review => '!',
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Booking {
    Fifo,
    /// Average cost (Canada's ACB).
    Avg,
}

impl Booking {
    pub fn parse(s: &str) -> Option<Booking> {
        match s.to_ascii_lowercase().as_str() {
            "fifo" => Some(Booking::Fifo),
            "avg" | "average" | "acb" => Some(Booking::Avg),
            _ => None,
        }
    }
}

/// Which lots a reduction takes.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Reduce {
    /// No braces: the account's (or commodity's) booking method.
    Default,
    Method(Booking),
    Dated(NaiveDate),
}

/// The `{…}` part of a posting.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Lot {
    None,
    /// `{13.0777 EUR}`
    PerUnit(Amount),
    /// `{{2500.00 EUR}}`
    Total(Amount),
    /// `{fifo}`, `{avg}`, `{2024-08-14}` (written), or a negative lotted posting without braces.
    Reduce(Reduce),
    /// `{carry}`: the cost taken out of other lots in the same transaction.
    Carry,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Price {
    /// `@ 13.47 EUR`
    PerUnit(Amount),
    /// `@@ 2575.17 EUR`
    Total(Amount),
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Posting {
    pub account: Account,
    /// `None`: the one empty posting that takes what balances.
    pub amount: Option<Amount>,
    pub lot: Lot,
    pub price: Option<Price>,
    /// `= 3904.16 EUR`
    pub assert: Option<Amount>,
    pub comment: Option<String>,
    pub line: usize,
}

/// Where an item was read: the file and its 1-based lines (inclusive).
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Span {
    pub path: Arc<str>,
    pub first: usize,
    pub last: usize,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Txn {
    pub date: NaiveDate,
    pub status: Status,
    /// The header after the status, as written (payee, `|` narration, `#tags`, `^id`).
    pub text: String,
    pub payee: String,
    pub narration: Option<String>,
    pub tags: BTreeSet<String>,
    pub id: Option<String>,
    pub meta: Vec<(String, String)>,
    pub postings: Vec<Posting>,
    pub span: Span,
}

impl Txn {
    pub fn meta(&self, key: &str) -> Option<&str> {
        self.meta.iter().find(|(k, _)| k == key).map(|(_, v)| v.as_str())
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct PriceDirective {
    pub date: NaiveDate,
    pub base: Commodity,
    pub quote: Amount,
    pub span: Span,
}

#[derive(Clone, Debug, Default)]
pub struct Journal {
    pub txns: Vec<Txn>,
    pub prices: Vec<PriceDirective>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord)]
pub enum Severity {
    Warning,
    Error,
}

/// One finding, always tied to a place (the Settings/pane show it as path:line).
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Diagnostic {
    pub severity: Severity,
    pub path: Arc<str>,
    pub line: usize,
    pub message: String,
}

impl Diagnostic {
    pub fn error(path: &Arc<str>, line: usize, message: impl Into<String>) -> Diagnostic {
        Diagnostic { severity: Severity::Error, path: path.clone(), line, message: message.into() }
    }
    pub fn warning(path: &Arc<str>, line: usize, message: impl Into<String>) -> Diagnostic {
        Diagnostic { severity: Severity::Warning, path: path.clone(), line, message: message.into() }
    }
}

impl fmt::Display for Diagnostic {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        let kind = if self.severity == Severity::Error { "error" } else { "warning" };
        write!(f, "{}:{}: {kind}: {}", self.path, self.line, self.message)
    }
}
