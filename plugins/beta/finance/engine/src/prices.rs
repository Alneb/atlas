//! Prices (DESIGN-finance-format "Prices"): the `price` directives of `prices/*.fin` plus what each transaction implies
//! (an `@` price, else a lot's cost). A lookup for a date takes the latest price on or before it: the pair direct,
//! inverted, or through one third commodity (CAD → EUR → DVF).
use crate::book::Ledger;
use crate::model::*;
use chrono::NaiveDate;
use rust_decimal::Decimal;
use std::collections::BTreeMap;

#[derive(Debug, Default)]
pub struct Prices {
    /// (base, quote) → dated prices of one base unit in quote, sorted by date (a later entry of a day wins).
    pairs: BTreeMap<(Commodity, Commodity), Vec<(NaiveDate, Decimal)>>,
}

/// The per-unit price a posting states: its `@`, else its lot's cost.
pub fn implied(p: &Posting) -> Option<Amount> {
    let a = p.amount.as_ref().filter(|a| !a.qty.is_zero())?;
    let per = |total: &Amount| Amount::new(total.qty / a.qty.abs(), total.commodity.clone());
    let price = match (&p.price, &p.lot) {
        (Some(Price::PerUnit(x)), _) | (None, Lot::PerUnit(x)) => x.clone(),
        (Some(Price::Total(x)), _) | (None, Lot::Total(x)) => per(x),
        _ => return None,
    };
    (price.commodity != a.commodity && price.qty > Decimal::ZERO).then_some(price)
}

impl Prices {
    pub fn new(l: &Ledger) -> Prices {
        let mut out = Prices::default();
        for b in &l.txns {
            for p in &b.txn.postings {
                if let (Some(a), Some(x)) = (&p.amount, implied(p)) {
                    out.add(b.txn.date, &a.commodity, &x);
                }
            }
        }
        // Directives last: on the same day the written quote wins over the one a transaction implies.
        for d in &l.prices {
            out.add(d.date, &d.base, &d.quote);
        }
        for v in out.pairs.values_mut() {
            v.sort_by_key(|(d, _)| *d); // stable: the order added within a day is kept
        }
        out
    }

    pub fn add(&mut self, date: NaiveDate, base: &Commodity, quote: &Amount) {
        if quote.qty > Decimal::ZERO && *base != quote.commodity {
            self.pairs.entry((base.clone(), quote.commodity.clone())).or_default().push((date, quote.qty));
        }
    }

    /// The latest price of `base` in `quote` on or before `date` (any date with `None`), with its date.
    fn direct(&self, base: &Commodity, quote: &Commodity, date: Option<NaiveDate>) -> Option<(NaiveDate, Decimal)> {
        let v = self.pairs.get(&(base.clone(), quote.clone()))?;
        let n = date.map_or(v.len(), |d| v.partition_point(|(x, _)| *x <= d));
        n.checked_sub(1).map(|i| v[i])
    }

    /// One unit of `base` in `quote`: direct or inverted, whichever is the more recent; else along the shortest chain
    /// of pairs (CAD → EUR → USD → XAU).
    pub fn rate(&self, base: &Commodity, quote: &Commodity, date: Option<NaiveDate>) -> Option<Decimal> {
        self.rate_dated(base, quote, date).map(|(_, r)| r)
    }

    /// The rate and the date of the oldest quote it rests on (how stale it is).
    pub fn rate_dated(&self, base: &Commodity, quote: &Commodity, date: Option<NaiveDate>) -> Option<(NaiveDate, Decimal)> {
        if base == quote {
            return Some((date.unwrap_or_default(), Decimal::ONE));
        }
        // Breadth first over the pairs priced by `date`: the fewest conversions, each one's own latest quote.
        let mut seen: BTreeMap<&Commodity, (NaiveDate, Decimal)> = BTreeMap::new();
        let mut frontier = vec![(base, (NaiveDate::MAX, Decimal::ONE))];
        seen.insert(base, (NaiveDate::MAX, Decimal::ONE));
        while !frontier.is_empty() {
            let mut next = vec![];
            for (from, (d0, r0)) in frontier {
                for to in self.neighbours(from) {
                    if seen.contains_key(to) {
                        continue;
                    }
                    if let Some((d, r)) = self.one_hop(from, to, date) {
                        let step = (d0.min(d), r0 * r);
                        if to == quote {
                            return Some(step);
                        }
                        seen.insert(to, step);
                        next.push((to, step));
                    }
                }
            }
            frontier = next;
        }
        None
    }

    fn neighbours<'a>(&'a self, c: &'a Commodity) -> impl Iterator<Item = &'a Commodity> + 'a {
        self.pairs.keys().filter_map(move |(a, b)| if a == c { Some(b) } else if b == c { Some(a) } else { None })
    }

    fn one_hop(&self, base: &Commodity, quote: &Commodity, date: Option<NaiveDate>) -> Option<(NaiveDate, Decimal)> {
        let there = self.direct(base, quote, date);
        let back = self.direct(quote, base, date).filter(|(_, q)| !q.is_zero()).map(|(d, q)| (d, Decimal::ONE / q));
        match (there, back) {
            (Some(a), Some(b)) => Some(if b.0 > a.0 { b } else { a }),
            (a, b) => a.or(b),
        }
    }

    /// `qty` of `from` in `to` at `date`.
    pub fn convert(&self, qty: Decimal, from: &Commodity, to: &Commodity, date: Option<NaiveDate>) -> Option<Decimal> {
        self.rate(from, to, date).map(|r| qty * r)
    }

    /// The sum of several commodities in `to`; the ones without a price come back apart.
    pub fn value(&self, cs: &BTreeMap<Commodity, Decimal>, to: &Commodity, date: Option<NaiveDate>) -> (Decimal, Vec<Commodity>) {
        let mut missing = vec![];
        let total = cs.iter().map(|(c, q)| self.convert(*q, c, to, date).unwrap_or_else(|| { missing.push(c.clone()); Decimal::ZERO })).sum();
        (total, missing)
    }

    /// Every pair with its latest quote, for the pane's list of what the prices are.
    pub fn latest(&self) -> impl Iterator<Item = (&Commodity, &Commodity, NaiveDate, Decimal)> {
        self.pairs.iter().filter_map(|((b, q), v)| v.last().map(|(d, p)| (b, q, *d, *p)))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::load::load_texts;

    fn d(s: &str) -> NaiveDate {
        s.parse().unwrap()
    }
    fn c(s: &str) -> Commodity {
        Commodity::parse(s).unwrap()
    }

    #[test]
    fn directives_inversion_and_one_hop() {
        let l = load_texts(&[("finance/prices/CAD.fin".into(), "2026-01-01 price EUR 1.50 CAD\n2026-02-01 price EUR 1.60 CAD\n".into()),
            ("finance/journal/2026.fin".into(), "2026-01-10 * Buy\n  Assets:Funds  10 DVF {13 EUR}\n  Assets:Bank\n".into())]);
        let p = Prices::new(&l.ledger);
        assert_eq!(p.rate(&c("EUR"), &c("CAD"), Some(d("2026-01-15"))), Some("1.50".parse().unwrap()));
        assert_eq!(p.rate(&c("EUR"), &c("CAD"), None), Some("1.60".parse().unwrap()));
        assert_eq!(p.rate(&c("CAD"), &c("EUR"), Some(d("2026-02-02"))), Some(Decimal::ONE / Decimal::from_str_exact("1.60").unwrap()));
        assert_eq!(p.rate(&c("EUR"), &c("CAD"), Some(d("2025-12-31"))), None, "nothing before the first quote");
        // DVF in CAD: the lot's cost (13 EUR) then EUR → CAD.
        assert_eq!(p.rate(&c("DVF"), &c("CAD"), Some(d("2026-01-20"))), Some("19.5".parse().unwrap()));
        let l = load_texts(&[("finance/prices/x.fin".into(), "2026-01-01 price EUR 1.5 CAD\n2026-01-01 price EUR 1.2 USD\n2026-01-01 price XAU 3000 USD\n".into())]);
        let p = Prices::new(&l.ledger);
        assert_eq!(p.rate(&c("CAD"), &c("XAU"), None).map(|r| r.round_dp(8)), Some((Decimal::ONE / Decimal::from(3750)).round_dp(8)), "CAD → EUR → USD → XAU");
    }

    #[test]
    fn a_sale_price_is_a_price() {
        let l = load_texts(&[("finance/journal/2026.fin".into(), "2026-01-10 * Buy\n  Assets:Funds  10 X {{100 EUR}}\n  Assets:Bank\n2026-03-01 * Sell\n  Assets:Funds  -10 X {fifo} @@ 150 EUR\n  Assets:Bank  150 EUR\n  Income:Gains\n".into())]);
        let p = Prices::new(&l.ledger);
        assert_eq!(p.rate(&c("X"), &c("EUR"), Some(d("2026-02-01"))), Some(Decimal::TEN));
        assert_eq!(p.rate(&c("X"), &c("EUR"), Some(d("2026-03-01"))), Some(Decimal::from(15)));
    }
}
