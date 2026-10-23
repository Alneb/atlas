//! The canonical writer (DESIGN-finance-format.md, "Writing"): new transactions are appended in one layout, an
//! existing one is replaced only by its own lines, after checking they still read as expected. Never a whole-file
//! rewrite.
use crate::model::*;

/// Amounts end at this column.
pub const AMOUNT_COLUMN: usize = 52;

pub fn amount(a: &Amount) -> String {
    format!("{} {}", a.qty, a.commodity)
}

pub fn posting(p: &Posting) -> String {
    let mut s = format!("  {}", p.account);
    if let Some(a) = &p.amount {
        let amt = amount(a);
        let gap = AMOUNT_COLUMN.saturating_sub(s.chars().count() + amt.chars().count()).max(2);
        s.push_str(&" ".repeat(gap));
        s.push_str(&amt);
        match &p.lot {
            Lot::None => {}
            Lot::PerUnit(c) => s.push_str(&format!(" {{{}}}", amount(c))),
            Lot::Total(c) => s.push_str(&format!(" {{{{{}}}}}", amount(c))),
            Lot::Carry => s.push_str(" {carry}"),
            Lot::Reduce(Reduce::Default) => {}
            Lot::Reduce(Reduce::Method(Booking::Fifo)) => s.push_str(" {fifo}"),
            Lot::Reduce(Reduce::Method(Booking::Avg)) => s.push_str(" {avg}"),
            Lot::Reduce(Reduce::Dated(d)) => s.push_str(&format!(" {{{d}}}")),
        }
        match &p.price {
            Some(Price::PerUnit(x)) => s.push_str(&format!(" @ {}", amount(x))),
            Some(Price::Total(x)) => s.push_str(&format!(" @@ {}", amount(x))),
            None => {}
        }
        if let Some(b) = &p.assert {
            s.push_str(&format!(" = {}", amount(b)));
        }
    }
    if let Some(c) = &p.comment {
        s.push_str(&format!("  ; {c}"));
    }
    s
}

pub fn txn(t: &Txn) -> String {
    let mut s = format!("{} {} {}\n", t.date, t.status.mark(), t.text);
    for (k, v) in &t.meta {
        s.push_str(&format!("  {k}: {v}\n"));
    }
    for p in &t.postings {
        s.push_str(&posting(p));
        s.push('\n');
    }
    s
}

/// The header text from its parts (payee, narration, tags, id), as `parse` reads it back.
pub fn header(payee: &str, narration: Option<&str>, tags: &[&str], id: Option<&str>) -> String {
    let mut s = payee.trim().to_string();
    if let Some(n) = narration.filter(|n| !n.trim().is_empty()) {
        s.push_str(&format!(" | {}", n.trim()));
    }
    for t in tags {
        s.push_str(&format!(" #{t}"));
    }
    if let Some(id) = id {
        s.push_str(&format!(" ^{id}"));
    }
    s
}

/// `file` with `t` appended after one blank line.
pub fn append(file: &str, t: &Txn) -> String {
    let mut s = file.trim_end_matches('\n').to_string();
    if !s.is_empty() {
        s.push_str("\n\n");
    }
    s.push_str(&txn(t));
    s
}

/// Replaces lines `span.first..=span.last` with `new` (ending in a newline), when those lines still equal `expected`.
pub fn replace(file: &str, span: &Span, expected: &str, new: &str) -> Result<String, String> {
    let lines: Vec<&str> = file.split_inclusive('\n').collect();
    if span.first == 0 || span.last > lines.len() || span.first > span.last {
        return Err(format!("{}:{} is no longer in the file", span.path, span.first));
    }
    let old: String = lines[span.first - 1..span.last].concat();
    if old.trim_end() != expected.trim_end() {
        return Err(format!("{}:{} changed since it was read: not touched", span.path, span.first));
    }
    let mut out: String = lines[..span.first - 1].concat();
    out.push_str(new);
    out.push_str(&lines[span.last..].concat());
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::parse::parse_file;

    #[test]
    fn written_text_reads_back_the_same() {
        let src = "2025-04-09 ! Unicaja | Reembolso #fondos ^u:1\n  bank: REEMBOLSO DUNAS\n  Assets:Funds:Dunas                  -191.165888 DVF {fifo} @ 13.4710 EUR\n  Assets:Unicaja:Cuenta                       2575.17 EUR = 6479.33 EUR\n  Income:Gains:Funds  ; computed\n";
        let (mut j, mut d) = (Journal::default(), vec![]);
        parse_file("a.fin", src, &mut j, &mut d);
        assert!(d.is_empty(), "{d:?}");
        let out = txn(&j.txns[0]);
        let (mut j2, mut d2) = (Journal::default(), vec![]);
        parse_file("a.fin", &out, &mut j2, &mut d2);
        assert!(d2.is_empty(), "{d2:?}");
        let strip = |mut t: Txn| { t.span.last = 0; t.postings.iter_mut().for_each(|p| p.line = 0); t };
        assert_eq!(strip(j.txns[0].clone()), strip(j2.txns[0].clone()));
        let amount_line = out.lines().nth(3).unwrap();
        assert_eq!(amount_line.find(" = ").unwrap(), AMOUNT_COLUMN, "{out}");
    }

    #[test]
    fn replace_refuses_a_changed_file() {
        let span = Span { path: "a".into(), first: 2, last: 3 };
        let f = "x\n2026-01-01 * A\n  Assets:B  1 EUR\ny\n";
        assert_eq!(replace(f, &span, "2026-01-01 * A\n  Assets:B  1 EUR", "NEW\n").unwrap(), "x\nNEW\ny\n");
        assert!(replace(f, &span, "2026-01-01 * B", "NEW\n").is_err());
    }
}
