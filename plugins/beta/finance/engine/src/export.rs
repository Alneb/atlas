//! One-way export to an hledger journal (DESIGN-finance-format.md, "Export to hledger"): what the engine booked is
//! written out explicitly (lot costs as `@@`, gains as amounts), so hledger reaches the same balances without lots.
use crate::book::{BookedTxn, Ledger};
use crate::model::*;
use crate::notes::Notes;
use crate::write::{amount, AMOUNT_COLUMN};
use rust_decimal::Decimal;
use std::collections::BTreeMap;
use std::fmt::Write;

pub struct Export {
    pub journal: String,
    /// What hledger cannot hold, said once.
    pub losses: Vec<String>,
}

struct Row<'a> {
    account: &'a Account,
    units: Amount,
    /// The total cost written as `@@` (unsigned), when the posting weighs in another commodity.
    cost: Option<Amount>,
    assert: Option<&'a Amount>,
    comment: Option<&'a String>,
    sale_price: Option<&'a Amount>,
}

/// One booked transaction as hledger postings. Costs are rounded to the transaction's own precision, and what rounding
/// leaves over goes into one cost, so hledger balances it exactly. A cost moves no account's balance, so the balances
/// stay the engine's.
fn rows<'a>(b: &'a BookedTxn, notes: &Notes, lots: &mut bool) -> Vec<Row<'a>> {
    let t = &b.txn;
    let mut scale: BTreeMap<&Commodity, u32> = BTreeMap::new();
    for bp in &b.postings {
        let s = scale.entry(&bp.units.commodity).or_insert(2);
        *s = (*s).max(bp.units.qty.scale());
    }
    let mut rows: Vec<Row> = b.postings.iter().map(|bp| {
        let p = &t.postings[bp.source];
        let other: Vec<&Amount> = bp.weights.iter().filter(|w| w.commodity != bp.units.commodity).collect();
        let cost = match other.as_slice() {
            [w] => {
                *lots |= !matches!(p.lot, Lot::None);
                let sc = scale.get(&w.commodity).copied().unwrap_or(2);
                Some(Amount::new(w.qty.abs().round_dp(sc), w.commodity.clone()))
            }
            _ => None,
        };
        let sale_price = match (&p.lot, &p.price) {
            (Lot::Reduce(_) | Lot::None, Some(Price::PerUnit(x))) if bp.units.qty.is_sign_negative() && notes.is_lotted(&bp.units.commodity) => Some(x),
            _ => None,
        };
        Row { account: &bp.account, units: bp.units.clone(), cost, assert: p.assert.as_ref().filter(|_| !bp.implied), comment: p.comment.as_ref(), sale_price }
    }).collect();
    let weight = |r: &Row| -> Amount {
        match &r.cost {
            Some(c) => Amount::new(if r.units.qty.is_sign_negative() { -c.qty } else { c.qty }, c.commodity.clone()),
            None => r.units.clone(),
        }
    };
    let mut sum: BTreeMap<Commodity, Decimal> = BTreeMap::new();
    for r in &rows {
        let w = weight(r);
        *sum.entry(w.commodity).or_default() += w.qty;
    }
    for (c, left) in sum.into_iter().filter(|(_, q)| !q.is_zero()) {
        if let Some(r) = rows.iter_mut().find(|r| r.cost.as_ref().is_some_and(|x| x.commodity == c)) {
            let k = r.cost.as_mut().unwrap();
            // weight = ±cost: shift the cost so the weights sum to zero.
            k.qty += if r.units.qty.is_sign_negative() { left } else { -left };
        }
    }
    rows
}

pub fn hledger(l: &Ledger, notes: &Notes) -> Export {
    let mut s = String::from("; Exported from Atlas's finance journal (one-way; DESIGN-finance-format.md \"Export to hledger\").\n\n");
    for (a, n) in &notes.accounts {
        let _ = writeln!(s, "account {a}  ; type:{}, note:{}", a.root().hledger_type(), n.path);
    }
    for (c, n) in &notes.commodities {
        if let Some(p) = n.precision {
            let _ = writeln!(s, "commodity 1.{} {c}", "0".repeat(p as usize));
        }
    }
    s.push('\n');
    for p in &l.prices {
        let _ = writeln!(s, "P {} {} {}", p.date, p.base, amount(&p.quote));
    }
    let (mut lots, mut links, mut review) = (false, false, 0usize);
    for b in &l.txns {
        let t = &b.txn;
        s.push('\n');
        let mut tags: Vec<String> = t.tags.iter().map(|x| format!("{x}:")).collect();
        if let Some(id) = &t.id {
            tags.push(format!("import:{id}"));
        }
        let head = match &t.narration {
            Some(n) => format!("{} | {n}", t.payee),
            None => t.payee.clone(),
        };
        let _ = write!(s, "{} {} {head}", t.date, t.status.mark());
        if !tags.is_empty() {
            let _ = write!(s, "  ; {}", tags.join(", "));
        }
        s.push('\n');
        review += (t.status == Status::Review) as usize;
        for (k, v) in &t.meta {
            links |= v.contains("[[");
            let _ = writeln!(s, "    ; {k}: {}", v.replace(',', ";"));
        }
        let rows = rows(b, notes, &mut lots);
        for r in rows {
            let amt = amount(&r.units);
            let mut line = format!("    {}", r.account);
            let gap = AMOUNT_COLUMN.saturating_sub(line.chars().count() + amt.chars().count()).max(2);
            line.push_str(&" ".repeat(gap));
            line.push_str(&amt);
            if let Some(c) = &r.cost {
                let _ = write!(line, " @@ {}", amount(c));
            }
            if let Some(a) = r.assert {
                let _ = write!(line, " = {}", amount(a));
            }
            if let Some(c) = r.comment {
                let _ = write!(line, "  ; {c}");
            }
            s.push_str(&line);
            s.push('\n');
            if let Some(x) = r.sale_price {
                let _ = writeln!(s, "    ; sale price: {}", amount(x));
            }
        }
    }
    let mut losses = vec![];
    if lots {
        losses.push("lots: hledger books no lots, so each lot posting carries the cost the engine booked (@@), and gains are written as amounts".into());
    }
    if links {
        losses.push("links: [[wikilinks]] in metadata became plain tag values".into());
    }
    if review > 0 {
        losses.push(format!("review: {review} transactions marked ! (to review) keep hledger's ! (pending), which hledger does not treat specially"));
    }
    Export { journal: s, losses }
}
