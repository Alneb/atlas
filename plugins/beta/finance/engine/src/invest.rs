//! Investments (DESIGN-finance "UI: Investments"): what is held in lots, at what cost and what it is worth today;
//! the gains realised per year (the booked `Income:Gains` postings); the money-weighted return (XIRR) of all of it.
use crate::book::{HeldLot, Ledger};
use crate::model::*;
use crate::notes::Notes;
use crate::prices::Prices;
use chrono::{Datelike, NaiveDate};
use rust_decimal::prelude::ToPrimitive;
use rust_decimal::Decimal;
use std::collections::BTreeMap;

#[derive(Debug, Clone, PartialEq)]
pub struct Holding {
    pub account: Account,
    pub commodity: Commodity,
    pub name: Option<String>,
    pub note: Option<String>,
    pub units: Decimal,
    /// The lots' booked cost in the display currency; `None` when a lot's basis was never written.
    pub cost: Option<Decimal>,
    pub value: Option<Decimal>,
    /// The price used and its date (how stale it is).
    pub price: Option<(NaiveDate, Decimal)>,
    pub lots: Vec<HeldLot>,
}

impl Holding {
    pub fn gain(&self) -> Option<Decimal> {
        Some(self.value? - self.cost?)
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct Portfolio {
    pub currency: Commodity,
    pub holdings: Vec<Holding>,
    /// year → realised gain (positive = earned), from the booked gain postings.
    pub realised: BTreeMap<i32, Decimal>,
    /// The money-weighted yearly return of every flow in and out of the lots, the holdings valued today.
    pub xirr: Option<f64>,
    /// Value per kind (fund, stock…), for the allocation.
    pub allocation: BTreeMap<String, Decimal>,
}

/// The annual rate `r` with Σ flow·(1+r)^(−years) = 0, by bisection (always converges when the flows change sign).
pub fn xirr(flows: &[(NaiveDate, f64)]) -> Option<f64> {
    let first = flows.iter().map(|f| f.0).min()?;
    if !(flows.iter().any(|f| f.1 > 0.0) && flows.iter().any(|f| f.1 < 0.0)) {
        return None;
    }
    let npv = |r: f64| flows.iter().map(|(d, v)| v / (1.0 + r).powf((*d - first).num_days() as f64 / 365.25)).sum::<f64>();
    let (mut lo, mut hi) = (-0.9999, 10.0);
    let (flo, fhi) = (npv(lo), npv(hi));
    if flo.signum() == fhi.signum() {
        return None;
    }
    for _ in 0..200 {
        let mid = (lo + hi) / 2.0;
        if npv(mid).signum() == flo.signum() { lo = mid } else { hi = mid }
    }
    Some((lo + hi) / 2.0)
}

pub fn portfolio(l: &Ledger, notes: &Notes, prices: &Prices, currency: &Commodity, today: NaiveDate) -> Portfolio {
    let mut holdings = vec![];
    for ((account, commodity), lots) in &l.lots {
        let units: Decimal = lots.iter().map(|x| x.units).sum();
        if units.is_zero() || !notes.is_lotted(commodity) {
            continue;
        }
        let cost = lots.iter().map(|x| x.cost.as_ref().and_then(|c| prices.convert(c.qty, &c.commodity, currency, Some(x.date)))).sum::<Option<Decimal>>();
        let price = prices.rate_dated(commodity, currency, Some(today));
        let n = notes.commodities.get(commodity);
        holdings.push(Holding {
            account: account.clone(), commodity: commodity.clone(), name: n.and_then(|n| n.name.clone()), note: n.map(|n| n.path.to_string()),
            units, cost: cost.map(|c| c.round_dp(2)), value: price.map(|(_, p)| (p * units).round_dp(2)), price, lots: lots.clone(),
        });
    }
    let mut realised: BTreeMap<i32, Decimal> = BTreeMap::new();
    let mut flows: Vec<(NaiveDate, f64)> = vec![];
    for b in &l.txns {
        for p in b.postings.iter().filter(|p| p.account.is_under("Income:Gains")) {
            if let Some(v) = prices.convert(-p.units.qty, &p.units.commodity, currency, Some(b.txn.date)) {
                *realised.entry(b.txn.date.year()).or_default() += v;
            }
        }
        // A transaction that moves lots: the money that came in or went out of the money accounts is its flow (a
        // purchase negative, a sale positive); a traspaso between funds touches no money account and is no flow.
        if b.postings.iter().any(|p| notes.is_lotted(&p.units.commodity)) {
            let flow: Decimal = b.postings.iter()
                .filter(|p| !notes.is_lotted(&p.units.commodity) && matches!(p.account.root(), Root::Assets | Root::Liabilities))
                .filter_map(|p| prices.convert(p.units.qty, &p.units.commodity, currency, Some(b.txn.date))).sum();
            if !flow.is_zero() {
                flows.push((b.txn.date, flow.to_f64().unwrap_or(0.0)));
            }
        }
    }
    let worth: Decimal = holdings.iter().filter_map(|h| h.value).sum();
    if !worth.is_zero() {
        flows.push((today, worth.to_f64().unwrap_or(0.0)));
    }
    let mut allocation: BTreeMap<String, Decimal> = BTreeMap::new();
    for h in &holdings {
        let kind = notes.commodities.get(&h.commodity).map_or("other".to_string(), |n| format!("{:?}", n.kind).to_lowercase());
        *allocation.entry(kind).or_default() += h.value.unwrap_or_default();
    }
    holdings.sort_by_key(|h| std::cmp::Reverse(h.value));
    Portfolio { currency: currency.clone(), holdings, realised, xirr: xirr(&flows), allocation }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::load::load_texts;

    #[test]
    fn xirr_of_a_doubling_in_a_year() {
        let d = |s: &str| s.parse::<NaiveDate>().unwrap();
        let r = xirr(&[(d("2024-01-01"), -100.0), (d("2025-01-01"), 200.0)]).unwrap();
        assert!((r - 1.0).abs() < 0.01, "{r}");
        assert_eq!(xirr(&[(d("2024-01-01"), 100.0)]), None);
    }

    #[test]
    fn holdings_cost_value_and_realised_gains() {
        let j = "2024-01-10 * Buy\n  Assets:Funds  10 DVF {10 EUR}\n  Assets:Bank  -100 EUR\n\
                 2024-06-10 * Buy\n  Assets:Funds  10 DVF {12 EUR}\n  Assets:Bank  -120 EUR\n\
                 2025-03-01 * Sell\n  Assets:Funds  -10 DVF {fifo} @ 15 EUR\n  Assets:Bank  150 EUR\n  Income:Gains:Funds\n";
        let l = load_texts(&[("finance/journal/x.fin".into(), j.into()), ("finance/prices/DVF.fin".into(), "2026-01-01 price DVF 16 EUR\n".into()),
            ("finance/assets/DVF.md".into(), "---\ntype: finance-commodity\nsymbol: DVF\nname: Dunas Valor Flexible\nkind: fund\n---\n".into())]);
        assert!(!l.ledger.diags.iter().any(|d| !d.message.contains("no account note")), "{:?}", l.ledger.diags);
        let p = Prices::new(&l.ledger);
        let pf = portfolio(&l.ledger, &l.notes, &p, &Commodity::parse("EUR").unwrap(), "2026-01-10".parse().unwrap());
        let h = &pf.holdings[0];
        assert_eq!((h.units, h.cost, h.value), (Decimal::TEN, Some(Decimal::from(120)), Some(Decimal::from(160))));
        assert_eq!(h.gain(), Some(Decimal::from(40)));
        assert_eq!(pf.realised.get(&2025), Some(&Decimal::from(50)));
        assert_eq!(pf.allocation.get("fund"), Some(&Decimal::from(160)));
        assert!(pf.xirr.unwrap() > 0.2, "{:?}", pf.xirr);
    }
}
