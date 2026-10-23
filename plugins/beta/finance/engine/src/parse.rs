//! Text → `Journal` (docs/design/DESIGN-finance-format.md, "Lexical rules", "Transactions", "Directives"). A bad line
//! is reported and skipped; the rest of the file still reads.
use crate::model::*;
use chrono::NaiveDate;
use rust_decimal::Decimal;
use std::collections::BTreeSet;
use std::str::FromStr;
use std::sync::Arc;

pub fn parse_date(s: &str) -> Result<NaiveDate, String> {
    let ok = s.len() == 10 && s.as_bytes()[4] == b'-' && s.as_bytes()[7] == b'-';
    let d = if ok { NaiveDate::parse_from_str(s, "%Y-%m-%d").ok() } else { None };
    d.ok_or_else(|| format!("{s:?} is not a date (YYYY-MM-DD)"))
}

/// `-1234.56`, `1_234.56`; never `1,234.56` (an importer converts a bank's format before writing).
pub fn parse_number(s: &str) -> Result<Decimal, String> {
    let bad = || format!("{s:?} is not a number (write -1234.56; _ may group digits)");
    let body = s.strip_prefix('-').or_else(|| s.strip_prefix('+')).unwrap_or(s);
    let ok = !body.is_empty()
        && body.chars().all(|c| c.is_ascii_digit() || c == '.' || c == '_')
        && body.matches('.').count() <= 1
        && body.chars().next().is_some_and(|c| c.is_ascii_digit())
        && !body.ends_with('.');
    if !ok {
        return Err(bad());
    }
    Decimal::from_str(s.replace('_', "").trim_start_matches('+')).map_err(|_| bad())
}

/// `23.40 EUR`.
pub fn parse_amount(s: &str) -> Result<Amount, String> {
    let mut it = s.split_whitespace();
    let (Some(n), Some(c), None) = (it.next(), it.next(), it.next()) else {
        return Err(format!("{s:?} is not an amount (a number then a commodity: 23.40 EUR)"));
    };
    Ok(Amount::new(parse_number(n)?, Commodity::parse(c)?))
}

pub fn parse_file(path: &str, text: &str, out: &mut Journal, diags: &mut Vec<Diagnostic>) {
    let path: Arc<str> = path.into();
    let mut cur: Option<Txn> = None;
    let flush = |cur: &mut Option<Txn>, out: &mut Journal| {
        if let Some(t) = cur.take() {
            out.txns.push(t);
        }
    };
    for (i, raw) in text.lines().enumerate() {
        let n = i + 1;
        let line = raw.trim_end();
        if line.trim().is_empty() || line.trim_start().starts_with(';') {
            continue;
        }
        let indented = line.starts_with(' ') || line.starts_with('\t');
        if !indented {
            flush(&mut cur, out);
            match parse_top(&path, n, line) {
                Ok(Top::Txn(t)) => cur = Some(t),
                Ok(Top::Price(p)) => out.prices.push(p),
                Err(e) => diags.push(Diagnostic::error(&path, n, e)),
            }
            continue;
        }
        let Some(t) = cur.as_mut() else {
            diags.push(Diagnostic::error(&path, n, "an indented line outside any transaction"));
            continue;
        };
        t.span.last = n;
        let body = line.trim();
        if let Some((k, v)) = meta_line(body) {
            if t.postings.is_empty() {
                t.meta.push((k, v));
            } else {
                diags.push(Diagnostic::error(&path, n, "metadata (key: value) must come before the postings"));
            }
            continue;
        }
        match parse_posting(body, n) {
            Ok(p) => t.postings.push(p),
            Err(e) => diags.push(Diagnostic::error(&path, n, e)),
        }
    }
    flush(&mut cur, out);
}

enum Top {
    Txn(Txn),
    Price(PriceDirective),
}

fn parse_top(path: &Arc<str>, n: usize, line: &str) -> Result<Top, String> {
    let line = strip_comment(line);
    let (date, rest) = line.split_once(' ').ok_or_else(|| format!("{line:?} is neither a transaction nor a directive"))?;
    let date = parse_date(date)?;
    let rest = rest.trim_start();
    let span = Span { path: path.clone(), first: n, last: n };
    if let Some(p) = rest.strip_prefix("price ") {
        let (base, quote) = p.trim().split_once(char::is_whitespace).ok_or("price needs a commodity and an amount")?;
        return Ok(Top::Price(PriceDirective { date, base: Commodity::parse(base)?, quote: parse_amount(quote.trim())?, span }));
    }
    let mut cs = rest.chars();
    let status = match cs.next() {
        Some('*') => Status::Accepted,
        Some('!') => Status::Review,
        _ => return Err("a transaction needs its status after the date: * (accepted) or ! (to review)".into()),
    };
    let text = cs.as_str().trim().to_string();
    let (head, narration) = match text.split_once(" | ") {
        Some((a, b)) => (a, Some(b)),
        None => (text.as_str(), None),
    };
    let mut tags = BTreeSet::new();
    let mut id = None;
    for w in text.split_whitespace() {
        if let Some(t) = w.strip_prefix('#').filter(|t| !t.is_empty() && t.chars().all(|c| c.is_alphanumeric() || "_/-".contains(c))) {
            tags.insert(t.to_string());
        } else if let Some(t) = w.strip_prefix('^').filter(|t| !t.is_empty()) {
            if id.replace(t.to_string()).is_some() {
                return Err("a transaction has at most one ^import-id".into());
            }
        }
    }
    let clean = |s: &str| s.split_whitespace().filter(|w| !w.starts_with('^') && !(w.starts_with('#') && w.len() > 1)).collect::<Vec<_>>().join(" ");
    Ok(Top::Txn(Txn {
        date,
        status,
        payee: clean(head),
        narration: narration.map(clean).filter(|s| !s.is_empty()),
        text,
        tags,
        id,
        meta: vec![],
        postings: vec![],
        span,
    }))
}

/// `key: value` with a lower-case key: never an account, which starts with a capital root.
fn meta_line(body: &str) -> Option<(String, String)> {
    let (k, v) = body.split_once(':')?;
    let key_ok = k.chars().next().is_some_and(|c| c.is_ascii_lowercase())
        && k.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '_' || c == '-');
    (key_ok && (v.is_empty() || v.starts_with(' '))).then(|| {
        let v = v.split(" ;").next().unwrap_or("").trim();
        (k.to_string(), v.to_string())
    })
}

fn strip_comment(s: &str) -> &str {
    s.split(';').next().unwrap_or("").trim_end()
}

pub fn parse_posting(body: &str, line: usize) -> Result<Posting, String> {
    let (main, comment) = match body.split_once(';') {
        Some((a, b)) => (a.trim_end(), Some(b.trim().to_string()).filter(|c| !c.is_empty())),
        None => (body, None),
    };
    let cut = main.find("  ").into_iter().chain(main.find('\t')).min();
    let (acct, mut rest) = match cut {
        Some(i) => (&main[..i], main[i..].trim()),
        None => (main, ""),
    };
    let account = Account::parse(acct.trim())?;
    let mut p = Posting { account, amount: None, lot: Lot::None, price: None, assert: None, comment, line };
    // The amount: everything up to the first {, @ or =.
    let end = rest.find(['{', '@', '=']).unwrap_or(rest.len());
    let amt = rest[..end].trim();
    if !amt.is_empty() {
        p.amount = Some(parse_amount(amt)?);
    }
    rest = rest[end..].trim_start();
    if let Some(r) = rest.strip_prefix("{{") {
        let (inner, after) = r.split_once("}}").ok_or("{{ without }}")?;
        p.lot = Lot::Total(parse_amount(inner.trim())?);
        rest = after.trim_start();
    } else if let Some(r) = rest.strip_prefix('{') {
        let (inner, after) = r.split_once('}').ok_or("{ without }")?;
        p.lot = parse_lot(inner.trim())?;
        rest = after.trim_start();
    }
    if let Some(r) = rest.strip_prefix("@@") {
        let end = r.find('=').unwrap_or(r.len());
        p.price = Some(Price::Total(parse_amount(r[..end].trim())?));
        rest = r[end..].trim_start();
    } else if let Some(r) = rest.strip_prefix('@') {
        let end = r.find('=').unwrap_or(r.len());
        p.price = Some(Price::PerUnit(parse_amount(r[..end].trim())?));
        rest = r[end..].trim_start();
    }
    if let Some(r) = rest.strip_prefix('=') {
        p.assert = Some(parse_amount(r.trim())?);
        rest = "";
    }
    if !rest.is_empty() {
        return Err(format!("{rest:?} after the amount is not a cost, price or balance"));
    }
    if p.amount.is_none() && (p.lot != Lot::None || p.price.is_some() || p.assert.is_some()) {
        return Err("a cost, price or balance needs an amount (only the empty posting may have none)".into());
    }
    validate_lot(&p)?;
    Ok(p)
}

fn parse_lot(inner: &str) -> Result<Lot, String> {
    Ok(match inner.to_ascii_lowercase().as_str() {
        "carry" => Lot::Carry,
        m if Booking::parse(m).is_some() => Lot::Reduce(Reduce::Method(Booking::parse(m).unwrap())),
        _ if inner.len() == 10 && parse_date(inner).is_ok() => Lot::Reduce(Reduce::Dated(parse_date(inner)?)),
        _ => Lot::PerUnit(parse_amount(inner).map_err(|_| format!("{{{inner}}} is not a cost, fifo, avg, carry or a lot's date"))?),
    })
}

fn validate_lot(p: &Posting) -> Result<(), String> {
    let Some(a) = &p.amount else { return Ok(()) };
    let pos = a.qty.is_sign_positive() && !a.qty.is_zero();
    match &p.lot {
        Lot::PerUnit(c) | Lot::Total(c) if !pos || c.qty.is_sign_negative() => Err("a new lot {cost} needs positive units and a positive cost".into()),
        Lot::Carry if !pos => Err("{carry} opens a lot: it needs positive units".into()),
        Lot::Reduce(_) if pos => Err("{fifo}/{avg}/{date} takes from lots: it needs negative units".into()),
        _ => Ok(()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn one(text: &str) -> (Journal, Vec<Diagnostic>) {
        let (mut j, mut d) = (Journal::default(), vec![]);
        parse_file("t.fin", text, &mut j, &mut d);
        (j, d)
    }

    #[test]
    fn a_transaction_with_everything() {
        let (j, d) = one("2026-10-21 * Mercadona | weekly shop #food ^unicaja:1\n  receipt: [[ticket.jpg]]\n  Expenses:Food:Eating Out   23.40 EUR\n  Assets:Unicaja:Cuenta  -23.40 EUR = 3904.16 EUR ; bank\n");
        assert!(d.is_empty(), "{d:?}");
        let t = &j.txns[0];
        assert_eq!((t.payee.as_str(), t.narration.as_deref()), ("Mercadona", Some("weekly shop")));
        assert_eq!(t.id.as_deref(), Some("unicaja:1"));
        assert!(t.tags.contains("food"));
        assert_eq!(t.meta("receipt"), Some("[[ticket.jpg]]"));
        assert_eq!(t.postings[0].account.as_str(), "Expenses:Food:Eating Out");
        assert_eq!(t.postings[1].assert.as_ref().unwrap().to_string(), "3904.16 EUR");
        assert_eq!(t.postings[1].comment.as_deref(), Some("bank"));
        assert_eq!((t.span.first, t.span.last), (1, 4));
    }

    #[test]
    fn lots_prices_and_the_empty_posting() {
        let (j, d) = one("2025-04-09 * Reembolso\n  Assets:Funds  -191.165888 DVF {fifo} @ 13.4710 EUR\n  Assets:Bank  2575.17 EUR\n  Income:Gains\n2024-08-14 * Compra\n  Assets:Funds  191.165888 DVF {{2500 EUR}}\n  Assets:Bank\n2026-01-01 price DVF 13.5 EUR\n");
        assert!(d.is_empty(), "{d:?}");
        assert_eq!(j.txns[0].postings[0].lot, Lot::Reduce(Reduce::Method(Booking::Fifo)));
        assert!(matches!(j.txns[0].postings[0].price, Some(Price::PerUnit(_))));
        assert!(j.txns[0].postings[2].amount.is_none());
        assert!(matches!(j.txns[1].postings[0].lot, Lot::Total(_)));
        assert_eq!(j.prices[0].quote.to_string(), "13.5 EUR");
    }

    #[test]
    fn strictness_reports_and_keeps_reading() {
        let (j, d) = one("2026/10/21 * Old date\n  Assets:A  1 EUR\n2026-10-21 Mercadona\n2026-10-21 * Ok\n  assets:lower  1 EUR\n  Expenses:X  1,234.56 EUR\n  Expenses:Y  -1 eur\n  Assets:A  5 DVF {fifo}\n2026-10-22 * Fine\n  Expenses:Z  1 EUR\n  Assets:Cash\n");
        let msgs: Vec<_> = d.iter().map(|d| d.line).collect();
        assert_eq!(msgs, vec![1, 2, 3, 5, 6, 7, 8], "{d:#?}");
        assert_eq!(j.txns.last().unwrap().payee, "Fine");
        assert_eq!(j.txns.last().unwrap().postings.len(), 2);
    }

    #[test]
    fn metadata_never_swallows_a_posting() {
        assert!(meta_line("receipt: [[x]]").is_some());
        assert!(meta_line("Assets:Cash  1 EUR").is_none());
        assert!(meta_line("Expenses:Food: x").is_none());
    }
}
