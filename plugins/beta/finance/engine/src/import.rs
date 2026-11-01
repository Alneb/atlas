//! What every source of bank movements shares: one movement shape and its import id. The id depends only on the
//! movement (account, date, amount, normalised description), so the same payment read from Paisa's history, a
//! statement file or Enable Banking is recognised as one.
use chrono::NaiveDate;
use rust_decimal::Decimal;
use std::collections::HashMap;

/// `revolut-1a2b3c4d5e`: the account's last parts as a slug, then a hash.
pub fn import_id(account: &str, date: NaiveDate, amount: Decimal, description: &str) -> String {
    let desc: String = description.split_whitespace().collect::<Vec<_>>().join(" ").to_uppercase();
    let key = format!("{account}|{date}|{}|{desc}", amount.normalize());
    let slug: String = account.split(':').skip(1).collect::<Vec<_>>().join("-").to_lowercase().chars()
        .map(|c| if c.is_ascii_alphanumeric() { c } else { '-' }).collect();
    format!("{slug}-{:010x}", fnv1a(key.as_bytes()) & 0xff_ffff_ffff)
}

fn fnv1a(b: &[u8]) -> u64 {
    b.iter().fold(0xcbf29ce484222325u64, |h, x| (h ^ *x as u64).wrapping_mul(0x100000001b3))
}

/// Two identical movements on one day (two coffees) get `-2`, `-3`… in the order they are read.
#[derive(Default)]
pub struct Ids(HashMap<String, usize>);

impl Ids {
    pub fn next(&mut self, base: String) -> String {
        let n = self.0.entry(base.clone()).or_insert(0);
        *n += 1;
        if *n == 1 { base } else { format!("{base}-{n}") }
    }
}

/// A bank's number in any of the shapes statements use: `1,234.56`, `1.234,56`, `-336,03`, `1234.5`, `1.234.567`; a
/// currency's sign or code around it (`€12,00`, `12,00 EUR`); an accountant's negative, `(336.03)` or `336,03-`; a side
/// in words, `12.00 DR` (a debit: negative) or `12.00 CR`. Any other word is not a number (None), never dropped: a
/// sign said in a word Atlas does not know would come out wrong.
pub fn bank_number(s: &str) -> Option<Decimal> {
    let words: Vec<String> = s.split(|c: char| !c.is_alphabetic()).filter(|w| !w.is_empty()).map(str::to_uppercase).collect();
    let side = |w: &str| matches!(w, "DR" | "DB" | "DEBIT" | "CR" | "CREDIT");
    if words.iter().any(|w| !side(w) && !(w.len() == 3 && w.chars().all(|c| c.is_ascii_uppercase()))) {
        return None;
    }
    let debit = words.iter().any(|w| matches!(w.as_str(), "DR" | "DB" | "DEBIT"));
    let mut s: String = s.trim().chars().filter(|c| !c.is_whitespace() && *c != '\u{a0}').collect();
    let bracketed = s.contains('(') && s.contains(')');
    // the currency around the number, whatever its sign or code: only digits, separators and signs are the number
    s.retain(|c| c.is_ascii_digit() || matches!(c, '.' | ',' | '-' | '+'));
    let trailing = s.len() > 1 && s.ends_with('-') && !s.starts_with('-');
    if trailing {
        s.pop();
    }
    let (dot, comma) = (s.rfind('.'), s.rfind(','));
    let plain = match (dot, comma) {
        (Some(d), Some(c)) if d > c => s.replace(',', ""),
        (Some(_), Some(_)) => s.replace('.', "").replace(',', "."),
        (None, Some(c)) if s.len() - c - 1 != 3 => s.replace(',', "."),
        (None, Some(_)) => s.replace(',', ""),
        // dots alone more than once are thousands (`1.234.567`); once, the decimal point
        (Some(_), None) if s.matches('.').count() > 1 => s.replace('.', ""),
        _ => s,
    };
    let n: Decimal = plain.parse().ok()?;
    Some(if bracketed || trailing || debit { -n.abs() } else { n })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn numbers_in_every_bank_shape() {
        for (s, want) in [
            ("1,400.00", "1400.00"), ("-336,03", "-336.03"), ("1.234,56", "1234.56"), ("-206.028042", "-206.028042"), ("1,400", "1400"),
            ("€12,00", "12.00"), ("12,00 EUR", "12.00"), ("$-5.10", "-5.10"), ("CAD 1 234,56", "1234.56"),
            ("(336.03)", "-336.03"), ("336,03-", "-336.03"), ("1.234.567", "1234567"), ("+20.00", "20.00"),
            ("1,234.56 DR", "-1234.56"), ("1,234.56 CR", "1234.56"), ("eur 3,50", "3.50"),
        ] {
            assert_eq!(bank_number(s).unwrap().to_string(), want, "{s}");
        }
        // a word that is neither a currency nor a side: not read, so the import says so rather than guess the sign
        for s in ["12.00 Belastung", "R$ 5,00", "n/a"] {
            assert_eq!(bank_number(s), None, "{s}");
        }
    }

    #[test]
    fn ids_are_stable_and_numbered() {
        let d = NaiveDate::from_ymd_opt(2026, 1, 29).unwrap();
        let a = import_id("Assets:Revolut", d, Decimal::new(-410, 2), "Self2  Moissan");
        assert_eq!(a, import_id("Assets:Revolut", d, Decimal::new(-41, 1), "SELF2 MOISSAN"));
        assert!(a.starts_with("revolut-"));
        let mut ids = Ids::default();
        assert_eq!(ids.next(a.clone()), a);
        assert_eq!(ids.next(a.clone()), format!("{a}-2"));
    }
}
