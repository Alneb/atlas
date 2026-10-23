//! Booking: the journal in date order → balances, lots and the checks of DESIGN-finance-format.md ("Checks"). Every
//! transaction is booked even when one of its checks fails, so one typo never hides the rest of the ledger.
use crate::model::*;
use crate::notes::Notes;
use chrono::NaiveDate;
use rust_decimal::Decimal;
use std::collections::{BTreeMap, HashSet};

/// Units held at one cost. `cost` is `None` for a holding whose basis was never written (a gift, an old opening).
#[derive(Clone, Debug, PartialEq)]
pub struct HeldLot {
    pub date: NaiveDate,
    pub units: Decimal,
    pub cost: Option<Amount>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct BookedPosting {
    /// Index in the transaction's `postings` (several booked postings share one when the empty posting fills two
    /// commodities).
    pub source: usize,
    pub account: Account,
    pub units: Amount,
    /// What it contributes to balancing: the cost for lots, the converted amount with a price, else the units.
    pub weights: Vec<Amount>,
    /// Filled in by balancing (the empty posting).
    pub implied: bool,
}

#[derive(Clone, Debug)]
pub struct BookedTxn {
    pub txn: Txn,
    pub postings: Vec<BookedPosting>,
}

#[derive(Debug, Default)]
pub struct Ledger {
    pub txns: Vec<BookedTxn>,
    pub prices: Vec<PriceDirective>,
    pub balances: BTreeMap<(Account, Commodity), Decimal>,
    pub lots: BTreeMap<(Account, Commodity), Vec<HeldLot>>,
    pub diags: Vec<Diagnostic>,
    /// Category accounts the first time they are used: a new category is shown, never silent.
    pub first_use: Vec<(Account, Span)>,
}

pub fn book(journal: Journal, notes: &Notes) -> Ledger {
    let Journal { mut txns, mut prices } = journal;
    txns.sort_by_key(|t| t.date); // stable: same date keeps (path, line) order
    prices.sort_by_key(|p| p.date);
    let mut l = Ledger { prices, ..Default::default() };
    let mut ids = HashSet::new();
    let mut seen = HashSet::new();
    for t in txns {
        if let Some(id) = &t.id {
            if !ids.insert(id.clone()) {
                l.diags.push(Diagnostic::error(&t.span.path, t.span.first, format!("^{id} is used by two transactions")));
            }
        }
        if t.postings.is_empty() {
            l.diags.push(Diagnostic::error(&t.span.path, t.span.first, "a transaction without postings"));
        }
        check_accounts(&t, notes, &mut l, &mut seen);
        let postings = book_txn(&t, notes, &mut l);
        l.txns.push(BookedTxn { txn: t, postings });
    }
    l
}

fn check_accounts(t: &Txn, notes: &Notes, l: &mut Ledger, seen: &mut HashSet<Account>) {
    for p in &t.postings {
        let at = |m: String| Diagnostic::error(&t.span.path, p.line, m);
        match notes.accounts.get(&p.account) {
            None if p.account.root().needs_note() => {
                l.diags.push(at(format!("{} has no account note (a typo, or add finance/accounts/….md with `account: {}`)", p.account, p.account)));
            }
            Some(n) => {
                if let (Some(cur), Some(a)) = (&n.currency, &p.amount) {
                    if &a.commodity != cur && !n.currencies.contains(&a.commodity) {
                        l.diags.push(at(format!("{} holds only {cur} (its note's `currency`, and `currencies`), not {}", p.account, a.commodity)));
                    }
                }
                if n.opened.is_some_and(|o| t.date < o) || n.closed.is_some_and(|c| t.date > c) {
                    l.diags.push(at(format!("{} is not open on {} (its note: opened/closed)", p.account, t.date)));
                }
            }
            None => {}
        }
        if !p.account.root().needs_note() && seen.insert(p.account.clone()) {
            l.first_use.push((p.account.clone(), t.span.clone()));
        }
    }
}

fn tolerance(scale: u32) -> Decimal {
    Decimal::new(5, scale + 1)
}

fn book_txn(t: &Txn, notes: &Notes, l: &mut Ledger) -> Vec<BookedPosting> {
    let path = &t.span.path;
    let mut out: Vec<BookedPosting> = vec![];
    let mut empty: Vec<usize> = vec![];
    let mut carry: Vec<usize> = vec![];
    let mut taken: Vec<Amount> = vec![]; // cost removed by reductions (positive), for {carry}
    let mut scale: BTreeMap<Commodity, u32> = BTreeMap::new();
    let mut note_scale = |a: &Amount| {
        let s = scale.entry(a.commodity.clone()).or_insert(0);
        *s = (*s).max(a.qty.scale());
    };

    for (i, p) in t.postings.iter().enumerate() {
        let Some(a) = &p.amount else {
            empty.push(i);
            continue;
        };
        note_scale(a);
        let key = (p.account.clone(), a.commodity.clone());
        let lotted = notes.is_lotted(&a.commodity);
        let new_lot = |cost: Option<Amount>, l: &mut Ledger| {
            l.lots.entry(key.clone()).or_default().push(HeldLot { date: t.date, units: a.qty, cost });
        };
        let weights = match (&p.lot, &p.price) {
            (Lot::PerUnit(c), _) => {
                note_scale(c);
                let cost = Amount::new(a.qty * c.qty, c.commodity.clone());
                new_lot(Some(cost.clone()), l);
                vec![cost]
            }
            (Lot::Total(c), _) => {
                note_scale(c);
                new_lot(Some(c.clone()), l);
                vec![c.clone()]
            }
            (Lot::Carry, _) => {
                carry.push(i); // booked below, once the reductions' cost is known
                continue;
            }
            (Lot::Reduce(r), _) => reduce(t, p, a, r, notes, l, &mut taken),
            (Lot::None, _) if lotted && a.qty.is_sign_negative() => reduce(t, p, a, &Reduce::Default, notes, l, &mut taken),
            (Lot::None, Some(price)) => {
                let w = convert(a, price);
                note_scale(match price { Price::PerUnit(x) | Price::Total(x) => x });
                if lotted {
                    new_lot(Some(w.clone()), l);
                }
                vec![w]
            }
            (Lot::None, None) => {
                if lotted {
                    l.diags.push(Diagnostic::warning(path, p.line, format!("{a} has no cost: its basis is unknown, so its gains will be too (write {{cost}})")));
                    new_lot(None, l);
                }
                vec![a.clone()]
            }
        };
        out.push(BookedPosting { source: i, account: p.account.clone(), units: a.clone(), weights, implied: false });
    }

    // {carry}: the lot takes the cost the reductions removed.
    match (carry.as_slice(), taken.len()) {
        ([], _) => {}
        ([i], 1) => {
            let p = &t.postings[*i];
            let a = p.amount.clone().unwrap();
            let cost = taken[0].clone();
            l.lots.entry((p.account.clone(), a.commodity.clone())).or_default().push(HeldLot { date: t.date, units: a.qty, cost: Some(cost.clone()) });
            out.push(BookedPosting { source: *i, account: p.account.clone(), units: a, weights: vec![cost], implied: false });
        }
        ([i], 0) => l.diags.push(Diagnostic::error(path, t.postings[*i].line, "{carry} needs a reduction ({fifo}…) in the same transaction to carry the cost from")),
        ([i], _) => l.diags.push(Diagnostic::error(path, t.postings[*i].line, "{carry} cannot carry costs in two commodities")),
        _ => l.diags.push(Diagnostic::error(path, t.span.first, "at most one {carry} per transaction")),
    }

    // Balance per commodity; the one empty posting takes the rest.
    let mut sum: BTreeMap<Commodity, Decimal> = BTreeMap::new();
    for w in out.iter().flat_map(|b| &b.weights) {
        *sum.entry(w.commodity.clone()).or_default() += w.qty;
    }
    match empty.as_slice() {
        [] => {
            for (c, s) in &sum {
                let sc = scale.get(c).copied().unwrap_or(2);
                if s.abs() > tolerance(sc) {
                    l.diags.push(Diagnostic::error(path, t.span.first, format!("does not balance: {} {c} left over", s.round_dp(sc.max(2)))));
                }
            }
        }
        [i] => {
            let p = &t.postings[*i];
            for (c, s) in &sum {
                let sc = notes.commodities.get(c).and_then(|n| n.precision).or(scale.get(c).copied()).unwrap_or(2);
                let q = (-*s).round_dp(sc);
                if q.is_zero() {
                    continue;
                }
                let a = Amount::new(q, c.clone());
                out.push(BookedPosting { source: *i, account: p.account.clone(), units: a.clone(), weights: vec![a], implied: true });
            }
        }
        _ => l.diags.push(Diagnostic::error(path, t.span.first, "more than one posting without an amount")),
    }

    // Balances and assertions, in the order the postings are written.
    out.sort_by_key(|b| b.source);
    for b in &out {
        *l.balances.entry((b.account.clone(), b.units.commodity.clone())).or_default() += b.units.qty;
        let p = &t.postings[b.source];
        if let (Some(want), false) = (&p.assert, b.implied) {
            let have = l.balances.get(&(p.account.clone(), want.commodity.clone())).copied().unwrap_or_default();
            if (have - want.qty).abs() > tolerance(want.qty.scale()) {
                l.diags.push(Diagnostic::error(path, p.line, format!(
                    "{} is {} {} here, the line says {want} (off by {})",
                    p.account, have, want.commodity, (want.qty - have).round_dp(want.qty.scale().max(2))
                )));
            }
        }
    }
    out
}

fn convert(a: &Amount, price: &Price) -> Amount {
    match price {
        Price::PerUnit(p) => Amount::new(a.qty * p.qty, p.commodity.clone()),
        Price::Total(p) => Amount::new(if a.qty.is_sign_negative() { -p.qty } else { p.qty }, p.commodity.clone()),
    }
}

/// Takes `-a.qty` units from the account's lots; returns the weights (minus the cost taken; a lot without a basis
/// weighs its own units).
fn reduce(t: &Txn, p: &Posting, a: &Amount, r: &Reduce, notes: &Notes, l: &mut Ledger, taken: &mut Vec<Amount>) -> Vec<Amount> {
    let path = &t.span.path;
    let key = (p.account.clone(), a.commodity.clone());
    let lots = l.lots.entry(key).or_default();
    let method = match r {
        Reduce::Default => Reduce::Method(notes.booking(&p.account, &a.commodity)),
        r => r.clone(),
    };
    if method == Reduce::Method(Booking::Avg) && lots.len() > 1 {
        let same = lots.iter().all(|x| x.cost.as_ref().map(|c| &c.commodity) == lots[0].cost.as_ref().map(|c| &c.commodity));
        if same {
            let units = lots.iter().map(|x| x.units).sum();
            let cost = lots[0].cost.as_ref().map(|c| Amount::new(lots.iter().map(|x| x.cost.as_ref().unwrap().qty).sum(), c.commodity.clone()));
            *lots = vec![HeldLot { date: lots[0].date, units, cost }];
        } else {
            l.diags.push(Diagnostic::warning(path, p.line, "avg booking over lots in different cost currencies: taken oldest first"));
        }
    }
    let mut want = -a.qty;
    let mut weights: BTreeMap<Commodity, Decimal> = BTreeMap::new();
    for lot in lots.iter_mut() {
        if want.is_zero() {
            break;
        }
        if let Reduce::Dated(d) = method {
            if lot.date != d {
                continue;
            }
        }
        let take = want.min(lot.units);
        if take <= Decimal::ZERO {
            continue;
        }
        match &mut lot.cost {
            Some(c) => {
                let part = if take == lot.units { c.qty } else { c.qty * take / lot.units };
                c.qty -= part;
                *weights.entry(c.commodity.clone()).or_default() += part;
            }
            None => *weights.entry(a.commodity.clone()).or_default() += take,
        }
        lot.units -= take;
        want -= take;
    }
    lots.retain(|x| !x.units.is_zero());
    if !want.is_zero() {
        let what = match method { Reduce::Dated(d) => format!("lots of {d}"), _ => "lots".into() };
        l.diags.push(Diagnostic::error(path, p.line, format!("takes {} {} but the {what} in {} hold {} less", -a.qty, a.commodity, p.account, want)));
        *weights.entry(a.commodity.clone()).or_default() += want;
    }
    for (c, q) in &weights {
        if c != &a.commodity {
            taken.push(Amount::new(*q, c.clone()));
        }
    }
    weights.into_iter().map(|(c, q)| Amount::new(-q, c)).collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::parse::parse_file;

    fn ledger(text: &str) -> Ledger {
        let mut notes = Notes::default();
        let mut d = vec![];
        for a in ["Assets:Bank", "Assets:Funds", "Assets:Cash"] {
            notes.add("n.md", &format!("---\ntype: finance-account\naccount: {a}\n---\n"), &mut d);
        }
        let mut j = Journal::default();
        parse_file("t.fin", text, &mut j, &mut d);
        assert!(d.is_empty(), "{d:?}");
        book(j, &notes)
    }

    fn bal(l: &Ledger, a: &str, c: &str) -> String {
        l.balances.get(&(Account::parse(a).unwrap(), Commodity::parse(c).unwrap())).map(|d| d.normalize().to_string()).unwrap_or("0".into())
    }

    #[test]
    fn fifo_sale_computes_the_gain() {
        // The user's Dunas Valor Equilibrado: two purchases, one sale; Paisa recorded a 39.72 EUR gain.
        let l = ledger("2024-08-08 * Suscripcion\n  Assets:Funds  82.985142 DVE {{1000.00 EUR}}\n  Assets:Bank  -1000.00 EUR\n2024-09-13 * Suscripcion\n  Assets:Funds  123.0429 DVE {{1500.00 EUR}}\n  Assets:Bank  -1500.00 EUR\n2025-04-09 * Reembolso\n  Assets:Funds  -206.028042 DVE {fifo} @ 12.3268 EUR\n  Assets:Bank  2539.72 EUR\n  Income:Gains\n");
        assert!(l.diags.is_empty(), "{:?}", l.diags);
        assert_eq!(bal(&l, "Income:Gains", "EUR"), "-39.72");
        assert_eq!(bal(&l, "Assets:Funds", "DVE"), "0");
        assert!(l.lots.values().all(|v| v.is_empty()));
    }

    #[test]
    fn partial_fifo_and_avg_differ() {
        let buys = "2024-01-01 * A\n  Assets:Funds  10 X {10 EUR}\n  Assets:Bank\n2024-02-01 * B\n  Assets:Funds  10 X {20 EUR}\n  Assets:Bank\n";
        let fifo = ledger(&format!("{buys}2024-03-01 * S\n  Assets:Funds  -10 X {{fifo}}\n  Assets:Bank  250 EUR\n  Income:Gains\n"));
        assert_eq!(bal(&fifo, "Income:Gains", "EUR"), "-150");
        let avg = ledger(&format!("{buys}2024-03-01 * S\n  Assets:Funds  -10 X {{avg}}\n  Assets:Bank  250 EUR\n  Income:Gains\n"));
        assert_eq!(bal(&avg, "Income:Gains", "EUR"), "-100");
        let dated = ledger(&format!("{buys}2024-03-01 * S\n  Assets:Funds  -10 X {{2024-02-01}}\n  Assets:Bank  250 EUR\n  Income:Gains\n"));
        assert_eq!(bal(&dated, "Income:Gains", "EUR"), "-50");
    }

    #[test]
    fn traspaso_carries_the_basis() {
        let l = ledger("2024-01-01 * Buy\n  Assets:Funds  10 X {10 EUR}\n  Assets:Bank\n2024-06-01 * Traspaso\n  Assets:Funds  -10 X {fifo} @ 15 EUR\n  Assets:Funds  30 Y {carry}\n2025-01-01 * Sell Y\n  Assets:Funds  -30 Y\n  Assets:Bank  160 EUR\n  Income:Gains\n");
        assert!(l.diags.is_empty(), "{:?}", l.diags);
        assert_eq!(bal(&l, "Income:Gains", "EUR"), "-60");
        assert_eq!(bal(&l, "Assets:Funds", "Y"), "0");
        assert_eq!(l.txns[1].postings.len(), 2);
    }

    #[test]
    fn checks_report_with_lines() {
        let l = ledger("2024-01-01 * Off\n  Assets:Bank  10.00 EUR\n  Expenses:X  -9.99 EUR\n2024-01-02 * Assert\n  Assets:Bank  1.00 EUR = 12.00 EUR\n  Expenses:Y\n2024-01-03 * Typo ^a\n  Assets:Bnak  1 EUR\n  Expenses:Y\n2024-01-04 * Dup ^a\n  Assets:Funds  -1 X\n  Assets:Bank  1 EUR\n");
        let got: Vec<_> = l.diags.iter().map(|d| (d.line, d.message.split(' ').take(4).collect::<Vec<_>>().join(" "))).collect();
        assert_eq!(got, vec![
            (1, "does not balance: 0.01".into()),
            (5, "Assets:Bank is 11.00 EUR".into()),
            (8, "Assets:Bnak has no account".into()),
            (10, "^a is used by".into()),
            (11, "takes 1 X but".into()),
            (10, "does not balance: 1".into()),
            (10, "does not balance: -1".into()),
        ]);
    }

    #[test]
    fn currency_exchange_with_a_price() {
        let l = ledger("2026-09-01 * Wise\n  Assets:Bank  -100.00 EUR\n  Assets:Cash  148.20 CAD @@ 100.00 EUR\n");
        assert!(l.diags.is_empty(), "{:?}", l.diags);
        assert_eq!(bal(&l, "Assets:Cash", "CAD"), "148.2");
    }
}
