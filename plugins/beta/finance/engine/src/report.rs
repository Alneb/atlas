//! Reports over a booked ledger: balances (now or at a date), an account's register, per-month sums per category.
//! Plain data; the helper turns them into JSON for the pane and blocks.
use crate::book::Ledger;
use crate::model::*;
use chrono::{Datelike, NaiveDate};
use rust_decimal::Decimal;
use std::collections::BTreeMap;

pub type Balances = BTreeMap<Account, BTreeMap<Commodity, Decimal>>;

/// Balances of every account (no subaccount roll-up), counting transactions up to `until` (inclusive).
pub fn balances(l: &Ledger, until: Option<NaiveDate>) -> Balances {
    let mut out: Balances = BTreeMap::new();
    for b in l.txns.iter().filter(|b| until.is_none_or(|u| b.txn.date <= u)) {
        for p in &b.postings {
            *out.entry(p.account.clone()).or_default().entry(p.units.commodity.clone()).or_default() += p.units.qty;
        }
    }
    for m in out.values_mut() {
        m.retain(|_, q| !q.is_zero());
    }
    out.retain(|_, m| !m.is_empty());
    out
}

#[derive(Debug, Clone)]
pub struct RegisterRow<'a> {
    pub txn: &'a Txn,
    pub account: &'a Account,
    pub amount: &'a Amount,
    /// The account's running balance in this commodity after this posting.
    pub running: Decimal,
}

/// Every posting to `prefix` (and under it), oldest first, with its running balance.
pub fn register<'a>(l: &'a Ledger, prefix: &str) -> Vec<RegisterRow<'a>> {
    let mut run: BTreeMap<&Commodity, Decimal> = BTreeMap::new();
    let mut out = vec![];
    for b in &l.txns {
        for p in b.postings.iter().filter(|p| p.account.is_under(prefix)) {
            let r = run.entry(&p.units.commodity).or_default();
            *r += p.units.qty;
            out.push(RegisterRow { txn: &b.txn, account: &p.account, amount: &p.units, running: *r });
        }
    }
    out
}

/// `YYYY-MM` → category account → commodity → sum, for accounts under `root` (Expenses or Income).
pub fn monthly(l: &Ledger, root: Root) -> BTreeMap<String, Balances> {
    let mut out: BTreeMap<String, Balances> = BTreeMap::new();
    for b in &l.txns {
        let month = format!("{:04}-{:02}", b.txn.date.year(), b.txn.date.month());
        for p in b.postings.iter().filter(|p| p.account.root() == root) {
            *out.entry(month.clone()).or_default().entry(p.account.clone()).or_default().entry(p.units.commodity.clone()).or_default() += p.units.qty;
        }
    }
    out
}

/// Net worth (Assets + Liabilities, per commodity) at the end of every month from the first transaction to `until`'s.
pub fn net_worth(l: &Ledger, until: NaiveDate) -> Vec<(String, BTreeMap<Commodity, Decimal>)> {
    let Some(first) = l.txns.first().map(|b| b.txn.date) else { return vec![] };
    let mut run: BTreeMap<Commodity, Decimal> = BTreeMap::new();
    let mut out = vec![];
    let mut txns = l.txns.iter().peekable();
    let (mut y, mut m) = (first.year(), first.month());
    while (y, m) <= (until.year(), until.month()) {
        while let Some(b) = txns.next_if(|b| (b.txn.date.year(), b.txn.date.month()) <= (y, m)) {
            for p in b.postings.iter().filter(|p| matches!(p.account.root(), Root::Assets | Root::Liabilities)) {
                *run.entry(p.units.commodity.clone()).or_default() += p.units.qty;
            }
        }
        out.push((format!("{y:04}-{m:02}"), run.iter().filter(|(_, q)| !q.is_zero()).map(|(c, q)| (c.clone(), *q)).collect()));
        (y, m) = if m == 12 { (y + 1, 1) } else { (y, m + 1) };
    }
    out
}

/// Net worth at each month's end in one currency, every commodity converted at that day's price (CAD at that month's
/// ECB rate, a fund at its price then), with each currency's share; commodities without a price are named apart.
#[derive(Debug, Clone, PartialEq)]
pub struct WealthMonth {
    pub month: String,
    pub total: Decimal,
    /// commodity → its value in the display currency that month.
    pub by: BTreeMap<Commodity, Decimal>,
    pub unpriced: Vec<Commodity>,
}

fn month_end(month: &str) -> NaiveDate {
    let (y, m): (i32, u32) = (month[..4].parse().unwrap_or(2000), month[5..].parse().unwrap_or(1));
    let next = if m == 12 { NaiveDate::from_ymd_opt(y + 1, 1, 1) } else { NaiveDate::from_ymd_opt(y, m + 1, 1) };
    next.and_then(|d| d.pred_opt()).unwrap_or_default()
}

pub fn wealth(l: &Ledger, prices: &crate::prices::Prices, to: &Commodity, until: NaiveDate) -> Vec<WealthMonth> {
    net_worth(l, until).into_iter().map(|(month, cs)| {
        let end = month_end(&month).min(until);
        let mut unpriced = vec![];
        let by: BTreeMap<Commodity, Decimal> = cs.iter().filter_map(|(c, q)| match prices.convert(*q, c, to, Some(end)) {
            Some(v) => Some((c.clone(), v.round_dp(2))),
            None => { unpriced.push(c.clone()); None }
        }).collect();
        WealthMonth { total: by.values().sum(), month, by, unpriced }
    }).collect()
}

/// Money held in a currency other than the display one: how much, what it is worth now, and what the rate's moves
/// made of it (its value now against what each amount was worth on the day it came in).
#[derive(Debug, Clone, PartialEq)]
pub struct Holding {
    pub currency: Commodity,
    pub amount: Decimal,
    pub value: Option<Decimal>,
    pub rate: Option<Decimal>,
    /// Value now − Σ each inflow and outflow at its own day's rate.
    pub fx_gain: Option<Decimal>,
    /// The rate at each month's end (a year and more of history, for the line).
    pub history: Vec<(String, Decimal)>,
}

pub fn currencies(l: &Ledger, notes: &crate::notes::Notes, prices: &crate::prices::Prices, to: &Commodity, today: NaiveDate) -> Vec<Holding> {
    let mut by: BTreeMap<Commodity, (Decimal, Option<Decimal>)> = BTreeMap::new();
    for b in &l.txns {
        for p in b.postings.iter().filter(|p| matches!(p.account.root(), Root::Assets | Root::Liabilities) && &p.units.commodity != to && !notes.is_lotted(&p.units.commodity)) {
            let e = by.entry(p.units.commodity.clone()).or_insert((Decimal::ZERO, Some(Decimal::ZERO)));
            e.0 += p.units.qty;
            e.1 = e.1.and_then(|s| Some(s + prices.convert(p.units.qty, &p.units.commodity, to, Some(b.txn.date))?));
        }
    }
    let months: Vec<String> = net_worth(l, today).into_iter().map(|(m, _)| m).collect();
    by.into_iter().map(|(c, (amount, basis))| {
        let rate = prices.rate(&c, to, Some(today));
        let value = rate.map(|r| (r * amount).round_dp(2));
        let history = months.iter().filter_map(|m| Some((m.clone(), prices.rate(&c, to, Some(month_end(m).min(today)))?))).collect();
        Holding { fx_gain: value.zip(basis).map(|(v, b)| (v - b).round_dp(2)), currency: c, amount, value, rate, history }
    }).collect()
}

#[cfg(test)]
mod wealth_tests {
    use super::*;
    use crate::load::load_texts;
    use crate::prices::Prices;

    #[test]
    fn cad_is_converted_at_each_months_rate() {
        let l = load_texts(&[("finance/prices/EUR-CAD.fin".into(), "2026-01-31 price EUR 1.50 CAD\n2026-02-28 price EUR 1.60 CAD\n".into()),
            ("finance/journal/2026.fin".into(), "2026-01-10 * Pay\n  Assets:Bank  150 CAD\n  Income:Salary\n2026-01-11 * Pay\n  Assets:Eur  100 EUR\n  Income:Salary\n".into())]);
        let p = Prices::new(&l.ledger);
        let eur = Commodity::parse("EUR").unwrap();
        let w = wealth(&l.ledger, &p, &eur, "2026-02-28".parse().unwrap());
        assert_eq!(w.iter().map(|m| m.total).collect::<Vec<_>>(), ["200".parse::<Decimal>().unwrap(), "193.75".parse().unwrap()]);
        // 150 CAD came in at 1.50 (100 EUR) and is worth 93.75 EUR at 1.60: the rate cost 6.25 EUR. January's
        // posting is before the first quote, so it is valued at none: no basis, no gain.
        let h = currencies(&l.ledger, &l.notes, &p, &eur, "2026-02-28".parse().unwrap());
        assert_eq!((h[0].amount, h[0].value), ("150".parse().unwrap(), Some("93.75".parse().unwrap())));
        assert_eq!(h[0].fx_gain, None);
    }
}
