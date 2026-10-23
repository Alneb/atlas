//! What the extracted fields mean, the same for every preset and format: dates, signs, implied decimals, the
//! description and bank text from templates, skips and rules, fund operations, balances.
use super::extract::{loose, Extracted, Fields};
use super::preset::{Preset, When};
use super::{bank_date, Move, Row, Statement};
use crate::import::bank_number;
use crate::model::Commodity;
use chrono::NaiveDate;
use rust_decimal::Decimal;

/// `{field}` or `{field:from:to}` (characters) filled from `f`; `None` when a field it names is empty.
pub fn render(template: &str, f: &Fields) -> (String, bool) {
    let (mut out, mut full, mut rest) = (String::new(), true, template);
    while let Some(open) = rest.find('{') {
        out.push_str(&rest[..open]);
        let Some(close) = rest[open..].find('}') else { break };
        let inner = &rest[open + 1..open + close];
        let mut parts = inner.split(':');
        let name = parts.next().unwrap_or_default();
        let v = f.get(name).map(String::as_str).unwrap_or_default();
        let (a, b) = (parts.next().and_then(|x| x.parse().ok()), parts.next().and_then(|x| x.parse().ok()));
        let v: String = match (a, b) {
            (Some(a), Some(b)) => v.chars().skip(a).take(usize::saturating_sub(b, a)).collect(),
            (Some(a), None) => v.chars().skip(a).collect(),
            _ => v.to_string(),
        };
        full &= !v.trim().is_empty();
        out.push_str(v.trim());
        rest = &rest[open + close + 1..];
    }
    out.push_str(rest);
    (out.split_whitespace().collect::<Vec<_>>().join(" "), full)
}

pub fn matches(when: &When, f: &Fields) -> bool {
    when.iter().all(|(k, want)| {
        let raw = f.get(k).map(|s| s.trim()).unwrap_or_default();
        if let Some(ord) = compare(raw, want) {
            return ord;
        }
        let have = loose(raw);
        match want.as_str() {
            "*" => !have.is_empty(),
            "" => have.is_empty(),
            w => match w.strip_prefix('!') {
                Some(not) => have != loose(not),
                None => have == loose(w),
            },
        }
    })
}

/// `<=2026-02-06`, `>100`: an ordered comparison, as numbers when both are, else as text (ISO dates order so).
fn compare(have: &str, want: &str) -> Option<bool> {
    let (op, v) = ["<=", ">=", "<", ">"].iter().find_map(|op| want.strip_prefix(op).map(|v| (*op, v.trim())))?;
    let ord = match (have.parse::<f64>(), v.parse::<f64>()) {
        (Ok(a), Ok(b)) => a.partial_cmp(&b)?,
        _ if have.is_empty() => return Some(false),
        _ => have.cmp(v),
    };
    Some(match op {
        "<=" => ord.is_le(),
        ">=" => ord.is_ge(),
        "<" => ord.is_lt(),
        _ => ord.is_gt(),
    })
}

struct Reader<'a> {
    p: &'a Preset,
}

impl Reader<'_> {
    /// A number field: implied decimals for digits-only text, the bank's separators otherwise, `x_sign` applied.
    fn number(&self, f: &Fields, name: &str) -> Result<Option<Decimal>, String> {
        let Some(s) = f.get(name).map(|s| s.trim()).filter(|s| !s.is_empty() && *s != "-") else { return Ok(None) };
        let n = match self.p.decimals {
            Some(d) if s.chars().all(|c| c.is_ascii_digit()) => {
                Decimal::try_from_i128_with_scale(s.parse::<i128>().map_err(|e| format!("{name} {s:?}: {e}"))?, d).map_err(|e| e.to_string())?
            }
            _ => bank_number(s.trim_end_matches(['€', '$']).trim()).ok_or_else(|| format!("{name}: {s:?} is not a number"))?,
        };
        let negative = self.p.negative_sign.as_ref().is_some_and(|neg| f.get(&format!("{name}_sign")).is_some_and(|v| v.trim() == neg));
        Ok(Some(if negative { -n } else { n }))
    }

    fn date(&self, f: &Fields, name: &str) -> Result<Option<NaiveDate>, String> {
        match f.get(name).map(|s| s.trim()).filter(|s| !s.is_empty()) {
            None => Ok(None),
            Some(s) => bank_date(s, &self.p.dates).map(Some).ok_or_else(|| format!("{name}: {s:?} is not a date")),
        }
    }

    fn currency(&self, f: &Fields) -> Option<String> {
        let c = f.get("currency").map(|s| s.trim().to_string()).filter(|s| !s.is_empty());
        c.map(|c| self.p.currency_codes.get(&c).cloned().unwrap_or(c)).or_else(|| self.p.currency.clone())
    }
}

fn derive(templates: &std::collections::BTreeMap<String, String>, f: &mut Fields) {
    for (k, t) in templates {
        let (v, full) = render(t, f);
        if full {
            f.insert(k.clone(), v);
        }
    }
}

/// A file's statements: one, or one per currency when the file names none and its rows name several (a Revolut CSV
/// with every pocket). The file's opening and closing balances belong to the first.
pub fn statements(p: &Preset, source: &str, e: Extracted) -> Result<Vec<Statement>, String> {
    let r = Reader { p };
    let mut st = e.statement.clone();
    derive(&p.derive_statement, &mut st);
    let mut currencies: Vec<String> = vec![];
    if r.currency(&st).is_none() {
        for raw in &e.rows {
            let mut f = st.clone();
            f.extend(raw.clone());
            derive(&p.derive, &mut f);
            if let Some(c) = r.currency(&f).filter(|c| !currencies.contains(c)) {
                currencies.push(c);
            }
        }
    }
    if currencies.len() < 2 {
        return Ok(vec![statement(p, source, e, None)?]);
    }
    currencies.into_iter().enumerate().map(|(i, c)| {
        let mut e = e.clone();
        if i > 0 {
            e.statement.retain(|k, _| k != "opening" && k != "closing");
        }
        statement(p, source, e, Some(c))
    }).collect()
}

fn statement(p: &Preset, source: &str, e: Extracted, only: Option<String>) -> Result<Statement, String> {
    let r = Reader { p };
    let mut st = e.statement;
    derive(&p.derive_statement, &mut st);
    // A statement in one currency: the one asked for, the file's, else its first row's, else the preset's.
    let first_row = e.rows.first().map(|x| { let mut f = st.clone(); f.extend(x.clone()); f }).unwrap_or_default();
    let currency = only.or_else(|| r.currency(&st)).or_else(|| r.currency(&first_row)).ok_or("the file names no currency and the preset gives none (`currency = \"EUR\"`)")?;
    let currency = Commodity::parse(&currency)?;
    let mut out = Statement {
        preset: p.id.clone(),
        bank: p.bank.clone(),
        order: p.order,
        source: source.to_string(),
        holder: st.get("account").or(st.get("number")).map(|n| n.trim().to_string()).filter(|n| !n.is_empty()),
        currency: currency.clone(),
        from: r.date(&st, "from")?,
        to: r.date(&st, "to")?,
        opening: r.number(&st, "opening")?,
        closing: r.number(&st, "closing")?,
        rows: vec![],
        skipped: vec![],
        accounts: p.accounts.clone(),
        categories: p.categories.clone(),
    };
    let mut running = out.opening;
    let mut keys: Vec<Vec<String>> = vec![];
    for (i, raw) in e.rows.into_iter().enumerate() {
        let mut f = st.clone();
        f.extend(raw);
        derive(&p.derive, &mut f);
        let line = |f: &Fields| render("{booked} {description} {amount}", f).0;
        if let Some(s) = p.skip.iter().find(|s| matches(&s.when, &f)) {
            out.skipped.push(format!("{}: {}", line(&f), s.why));
            continue;
        }
        let hits: Vec<_> = p.rules.iter().filter(|x| matches(&x.when, &f)).collect();
        for rule in hits {
            let set: Vec<(String, String)> = rule.set.iter().map(|(k, t)| (k.clone(), render(t, &f).0)).collect();
            f.extend(set);
        }
        let at = || format!("row {}", i + 1);
        let booked = r.date(&f, "booked").map_err(|e| format!("{}: {e}", at()))?.ok_or_else(|| format!("{}: no booked date", at()))?;
        if r.currency(&f).is_some_and(|c| c != currency.as_str()) {
            out.skipped.push(format!("{}: in {}, the statement is in {currency}", line(&f), r.currency(&f).unwrap_or_default()));
            continue;
        }
        let balance = r.number(&f, "balance").map_err(|e| format!("{}: {e}", at()))?;
        let kind = match &p.funds {
            Some(funds) => {
                let word = f.get("kind").cloned().unwrap_or_default();
                let Some(op) = funds.ops.iter().find(|(k, _)| loose(k) == loose(&word)).map(|(_, op)| *op) else {
                    out.skipped.push(format!("{}: the operation {word:?} is not one the preset knows ({})", line(&f), funds.ops.keys().cloned().collect::<Vec<_>>().join(", ")));
                    continue;
                };
                let need = |n: &str| r.number(&f, n).map_err(|e| format!("{}: {e}", at()))?.ok_or_else(|| format!("{}: no {n}", at()));
                Move::Fund { fund: f.get("fund").cloned().unwrap_or_default(), isin: f.get("isin").cloned().filter(|s| !s.is_empty()), units: need("units")?.abs(), total: need("total")?.abs(), op }
            }
            None => {
                let amount = if p.amount_from_balance {
                    let (Some(b), Some(prev)) = (balance, running) else { return Err(format!("{}: an amount from balances needs the opening balance and each row's", at())) };
                    b - prev
                } else if let Some(a) = r.number(&f, "amount").map_err(|e| format!("{}: {e}", at()))? {
                    a
                } else {
                    let credit = r.number(&f, "credit").map_err(|e| format!("{}: {e}", at()))?.unwrap_or_default();
                    let debit = r.number(&f, "debit").map_err(|e| format!("{}: {e}", at()))?.unwrap_or_default();
                    credit - debit.abs()
                };
                let fee = r.number(&f, "fee").map_err(|e| format!("{}: {e}", at()))?.unwrap_or_default();
                Move::Cash { amount, fee }
            }
        };
        // A statement without each row's balance still has its opening one: the rows, in the file's order, give it.
        let balance = match (&kind, balance) {
            (_, Some(b)) => Some(b),
            (Move::Cash { amount, fee }, None) => running.map(|r| r + amount - fee),
            _ => None,
        };
        running = balance.or(running);
        let description = p.description.iter().map(|t| render(t, &f)).find(|(_, full)| *full).map(|(d, _)| d).unwrap_or_default();
        let bank = p.bank_text.as_ref().map(|t| render(t, &f).0).filter(|b| !b.is_empty()).unwrap_or_else(|| description.clone());
        keys.push(p.sort.iter().map(|k| f.get(k).cloned().unwrap_or_default()).collect());
        out.rows.push(Row {
            booked,
            value: r.date(&f, "value").ok().flatten().filter(|v| *v != booked),
            description,
            bank,
            note: f.get("note").cloned().filter(|n| !n.trim().is_empty()),
            category: f.get("category").filter(|c| !c.trim().is_empty()).map(|c| (c.trim().to_string(), f.get("group").filter(|g| !g.trim().is_empty()).cloned())),
            transfer: f.get("transfer").cloned().filter(|t| !t.trim().is_empty()),
            balance,
            kind,
        });
    }
    // The bank's order within a day is kept; across days, by date.
    let mut order: Vec<usize> = (0..out.rows.len()).collect();
    order.sort_by(|&a, &b| out.rows[a].booked.cmp(&out.rows[b].booked).then_with(|| natural(&keys[a], &keys[b])));
    let rows = std::mem::take(&mut out.rows);
    let mut slots: Vec<Option<Row>> = rows.into_iter().map(Some).collect();
    out.rows = order.into_iter().map(|i| slots[i].take().unwrap()).collect();
    out.from = out.from.or_else(|| out.rows.first().map(|r| r.booked));
    out.to = out.to.or_else(|| out.rows.last().map(|r| r.booked));
    Ok(out)
}

/// Sort keys compared as numbers when both are (`468` before `1323`), as text otherwise.
fn natural(a: &[String], b: &[String]) -> std::cmp::Ordering {
    a.iter().zip(b).map(|(x, y)| match (x.parse::<f64>(), y.parse::<f64>()) {
        (Ok(p), Ok(q)) => p.partial_cmp(&q).unwrap_or(std::cmp::Ordering::Equal),
        _ => x.cmp(y),
    }).find(|o| o.is_ne()).unwrap_or(std::cmp::Ordering::Equal)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn f(kv: &[(&str, &str)]) -> Fields {
        kv.iter().map(|(k, v)| (k.to_string(), v.to_string())).collect()
    }

    #[test]
    fn templates_fill_slice_and_report_gaps() {
        let x = f(&[("a", "2026-10-20 16:43:13"), ("b", " MAXI ")]);
        assert_eq!(render("{a:0:10}", &x), ("2026-10-20".into(), true));
        assert_eq!(render("{a:11}", &x).0, "16:43:13");
        assert_eq!(render("{b} {c}", &x), ("MAXI".into(), false));
    }

    #[test]
    fn conditions() {
        let x = f(&[("state", "Completed"), ("kind", "Recarga tarjeta prepago")]);
        assert!(matches(&[("state".to_string(), "COMPLETED".to_string())].into(), &x));
        assert!(!matches(&[("state".to_string(), "!completed".to_string())].into(), &x));
        assert!(matches(&[("note".to_string(), "".to_string())].into(), &x));
        assert!(matches(&[("kind".to_string(), "*".to_string())].into(), &x));
        let d = f(&[("booked", "2026-02-06"), ("amount", "-12.5")]);
        assert!(matches(&[("booked".to_string(), "<=2026-02-06".to_string())].into(), &d));
        assert!(!matches(&[("booked".to_string(), ">2026-02-06".to_string())].into(), &d));
        assert!(matches(&[("amount".to_string(), "<-10".to_string())].into(), &d));
    }
}
