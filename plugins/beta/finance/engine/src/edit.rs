//! Review's edits to one transaction (DESIGN-finance.md, "Review"): accept it (`!` → `*`) and move its postings from
//! one account to another (Expenses:Unknown → the chosen category), or split one posting into several (a payment that
//! was a deposit and a rent). Only that transaction's own lines change, and only
//! while they still read as the ledger the pane was drawn from; comments, layout and every other line stay as written.
use crate::model::*;

/// What Review does to one transaction. `to` must parse as an account: the type keeps a typo out of the journal.
#[derive(Debug, Clone, Default)]
pub struct Edit {
    /// The transaction's new mark: accepted (`*`), or back to Review (`!`) for a guess the user confirms.
    pub mark: Option<Status>,
    pub recategorize: Option<(Account, Account)>,
    /// The one posting to this account becomes these; at most one without an amount (it takes the rest).
    pub split: Option<(Account, Parts)>,
}

/// A split's parts; at most one `Rest`.
pub type Parts = Vec<Part>;

#[derive(Clone, Debug, PartialEq)]
pub enum Part {
    /// This account with this amount.
    Amount(Account, Amount),
    /// These units bought for a total in another commodity (`250.00 CAD @@ 157.69 EUR`): a currency exchange.
    Priced(Account, Amount, Amount),
    /// The account that takes what is left.
    Rest(Account),
}

/// `file` with `edit` applied to `t` (read from this file). An error when the lines no longer match `t`.
pub fn apply(file: &str, t: &Txn, edit: &Edit) -> Result<String, String> {
    let mut lines: Vec<String> = file.split_inclusive('\n').map(str::to_string).collect();
    let changed = |why: &str| format!("{}:{} changed since it was read ({why}): not touched", t.span.path, t.span.first);
    if t.span.first == 0 || t.span.last > lines.len() {
        return Err(changed("lines gone"));
    }
    if let Some(to) = edit.mark.filter(|m| *m != t.status) {
        let head = &mut lines[t.span.first - 1];
        let date = t.date.to_string();
        // `YYYY-MM-DD ! …`: the mark sits right after the date and one space.
        let at = date.len() + 1;
        if !head.starts_with(&date) || head.get(at..at + 1) != Some(t.status.mark().to_string().as_str()) {
            return Err(changed("header"));
        }
        head.replace_range(at..at + 1, &to.mark().to_string());
    }
    if let Some((from, to)) = &edit.recategorize {
        let mut hit = false;
        for p in t.postings.iter().filter(|p| &p.account == from) {
            let line = lines.get_mut(p.line.wrapping_sub(1)).ok_or_else(|| changed("posting"))?;
            let indent = line.len() - line.trim_start().len();
            let rest = &line[indent..];
            let ends = rest[from.as_str().len().min(rest.len())..].chars().next();
            if !rest.starts_with(from.as_str()) || !matches!(ends, None | Some(' ' | '\t' | '\n' | '\r')) {
                return Err(changed("posting"));
            }
            line.replace_range(indent..indent + from.as_str().len(), to.as_str());
            hit = true;
        }
        if !hit {
            return Err(format!("{}:{} has no posting to {from}", t.span.path, t.span.first));
        }
    }
    if let Some((from, parts)) = &edit.split {
        if parts.iter().filter(|p| matches!(p, Part::Rest(_))).count() > 1 || parts.is_empty() {
            return Err("a split has at least one part and at most one without an amount".into());
        }
        let mut of = t.postings.iter().filter(|p| &p.account == from);
        let (Some(p), None) = (of.next(), of.next()) else {
            return Err(format!("{}:{} needs exactly one posting to {from} to split", t.span.path, t.span.first));
        };
        let line = lines.get_mut(p.line.wrapping_sub(1)).ok_or_else(|| changed("posting"))?;
        let indent = line.len() - line.trim_start().len();
        if !line[indent..].starts_with(from.as_str()) {
            return Err(changed("posting"));
        }
        let pad = &line[..indent].to_string();
        *line = parts.iter().map(|part| match part {
            Part::Amount(a, q) => format!("{pad}{a}  {}\n", crate::write::amount(q)),
            Part::Priced(a, q, total) => format!("{pad}{a}  {} @@ {}\n", crate::write::amount(q), crate::write::amount(total)),
            Part::Rest(a) => format!("{pad}{a}\n"),
        }).collect();
    }
    Ok(lines.concat())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::parse::parse_file;

    const SRC: &str = "2026-01-02 * Before\n  Assets:Cash  -1 EUR\n  Expenses:Food\n\n2026-01-03 ! Mercadona | weekly  ; kept\n  bank: MERCADONA\n  Expenses:Unknown                          12.50 EUR\n  Assets:Unicaja:Cuenta  ; the bank's side\n";

    fn txn(src: &str, n: usize) -> Txn {
        let (mut j, mut d) = (Journal::default(), vec![]);
        parse_file("a.fin", src, &mut j, &mut d);
        assert!(d.is_empty(), "{d:?}");
        j.txns[n].clone()
    }

    #[test]
    fn accepts_and_recategorizes_only_its_lines() {
        let t = txn(SRC, 1);
        let to = Account::parse("Expenses:Food:Groceries").unwrap();
        let out = apply(SRC, &t, &Edit { mark: Some(Status::Accepted), recategorize: Some((Account::parse("Expenses:Unknown").unwrap(), to)), ..Default::default() }).unwrap();
        assert_eq!(out, SRC.replace("03 ! Mercadona", "03 * Mercadona").replace("Expenses:Unknown", "Expenses:Food:Groceries"));
        let again = txn(&out, 1);
        assert_eq!(again.status, Status::Accepted);
        assert_eq!(again.postings[0].account.as_str(), "Expenses:Food:Groceries");
    }

    #[test]
    fn refuses_a_changed_file() {
        let t = txn(SRC, 1);
        let moved = SRC.replace("2026-01-03 ! Mercadona", "2026-01-04 ! Mercadona");
        assert!(apply(&moved, &t, &Edit { mark: Some(Status::Accepted), ..Default::default() }).is_err());
        let other = Account::parse("Expenses:Rent").unwrap();
        assert!(apply(SRC, &t, &Edit { recategorize: Some((other.clone(), other)), ..Default::default() }).is_err());
    }

    #[test]
    fn an_exchange_takes_the_parked_posting_with_its_price() {
        let src = "2026-05-01 ! Exchanged to CAD\n  Assets:Transfers\n  Assets:Revolut  -157.69 EUR\n";
        let t = txn(src, 0);
        let q = |x: &str, c: &str| Amount::new(x.parse().unwrap(), Commodity::parse(c).unwrap());
        let edit = Edit { split: Some((Account::parse("Assets:Transfers").unwrap(), vec![Part::Priced(Account::parse("Assets:Revolut").unwrap(), q("250.00", "CAD"), q("157.69", "EUR"))])), ..Default::default() };
        let out = apply(src, &t, &edit).unwrap();
        assert_eq!(out, "2026-05-01 ! Exchanged to CAD\n  Assets:Revolut  250.00 CAD @@ 157.69 EUR\n  Assets:Revolut  -157.69 EUR\n");
        let (mut j, mut d) = (Journal::default(), vec![]);
        parse_file("a.fin", &out, &mut j, &mut d);
        assert!(d.is_empty(), "{d:?}");
    }

    #[test]
    fn splits_one_posting_into_parts() {
        let src = "2026-09-30 ! TR.INM.\n  Expenses:Unknown\n  Assets:Bank  -1480.00 EUR\n";
        let t = txn(src, 0);
        let a = |s: &str| Account::parse(s).unwrap();
        let out = apply(src, &t, &Edit { split: Some((a("Expenses:Unknown"), vec![Part::Amount(a("Assets:Deposits"), Amount::new("900.00".parse().unwrap(), Commodity::parse("EUR").unwrap())), Part::Rest(a("Expenses:Rent"))])), ..Default::default() }).unwrap();
        assert_eq!(out, "2026-09-30 ! TR.INM.\n  Assets:Deposits  900.00 EUR\n  Expenses:Rent\n  Assets:Bank  -1480.00 EUR\n");
        let (mut j, mut d) = (Journal::default(), vec![]);
        parse_file("a.fin", &out, &mut j, &mut d);
        assert!(d.is_empty(), "{d:?}");
    }
}
