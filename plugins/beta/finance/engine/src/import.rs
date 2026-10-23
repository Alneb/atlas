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

/// A bank's number in any of the shapes statements use: `1,234.56`, `1.234,56`, `-336,03`, `1234.5`.
pub fn bank_number(s: &str) -> Option<Decimal> {
    let s: String = s.trim().chars().filter(|c| !c.is_whitespace() && *c != '\u{a0}').collect();
    let (dot, comma) = (s.rfind('.'), s.rfind(','));
    let plain = match (dot, comma) {
        (Some(d), Some(c)) if d > c => s.replace(',', ""),
        (Some(_), Some(_)) => s.replace('.', "").replace(',', "."),
        (None, Some(c)) if s.len() - c - 1 != 3 => s.replace(',', "."),
        (None, Some(_)) => s.replace(',', ""),
        _ => s,
    };
    plain.parse().ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn numbers_in_every_bank_shape() {
        for (s, want) in [("1,400.00", "1400.00"), ("-336,03", "-336.03"), ("1.234,56", "1234.56"), ("-206.028042", "-206.028042"), ("1,400", "1400")] {
            assert_eq!(bank_number(s).unwrap().to_string(), want, "{s}");
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
