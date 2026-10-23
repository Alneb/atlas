//! A column's summary under a Bases table (Obsidian's `summaries`), worked out over the values of the rows shown.

use super::dates;
use super::value::Val;
use crate::api::SummaryKind;
use chrono::NaiveDateTime;

/// The summary as shown; None when the column holds nothing it applies to (no numbers for a Sum, no dates for a
/// Range…), which Obsidian shows as an empty footer too.
pub fn summarize(kind: SummaryKind, vals: &[Val]) -> Option<String> {
    use SummaryKind as K;
    match kind {
        K::Empty => Some(vals.iter().filter(|v| v.is_empty()).count().to_string()),
        K::Filled => Some(vals.iter().filter(|v| !v.is_empty()).count().to_string()),
        K::Checked => Some(vals.iter().filter(|v| matches!(v, Val::Bool(true))).count().to_string()),
        K::Unchecked => Some(vals.iter().filter(|v| !matches!(v, Val::Bool(true))).count().to_string()),
        K::Unique => {
            let mut seen: Vec<&Val> = Vec::new();
            for v in vals.iter().filter(|v| !v.is_empty()) {
                if !seen.iter().any(|s| s.eq_val(v)) {
                    seen.push(v);
                }
            }
            Some(seen.len().to_string())
        }
        K::Earliest | K::Latest => {
            let ds = dates_of(vals);
            let d = if kind == K::Earliest { ds.iter().min() } else { ds.iter().max() };
            d.map(|d| date_text(*d))
        }
        K::Average | K::Median | K::Min | K::Max | K::Sum | K::Range | K::Stddev => {
            let mut ns = numbers(vals);
            // a date column's Range is a span of time, as in Obsidian
            if ns.is_empty() && kind == K::Range {
                let ds = dates_of(vals);
                let (a, b) = (ds.iter().min()?, ds.iter().max()?);
                let days = (b.date() - a.date()).num_days();
                return Some(if days == 1 { "1 day".into() } else { format!("{days} days") });
            }
            if ns.is_empty() {
                return None;
            }
            ns.sort_by(f64::total_cmp);
            let n = ns.len() as f64;
            let sum: f64 = ns.iter().sum();
            let mean = sum / n;
            Some(num_text(match kind {
                K::Sum => sum,
                K::Average => mean,
                K::Min => ns[0],
                K::Max => ns[ns.len() - 1],
                K::Range => ns[ns.len() - 1] - ns[0],
                K::Median => {
                    let m = ns.len() / 2;
                    if ns.len() % 2 == 1 { ns[m] } else { (ns[m - 1] + ns[m]) / 2.0 }
                }
                _ => (ns.iter().map(|x| (x - mean).powi(2)).sum::<f64>() / n).sqrt(),
            }))
        }
    }
}

/// Numbers only: written numbers and numeric text — not booleans or list lengths, which `as_num` would count.
fn numbers(vals: &[Val]) -> Vec<f64> {
    vals.iter()
        .filter_map(|v| match v {
            Val::Num(n) => Some(*n),
            Val::Str(s) => s.trim().parse().ok(),
            _ => None,
        })
        .filter(|n: &f64| n.is_finite())
        .collect()
}

fn dates_of(vals: &[Val]) -> Vec<NaiveDateTime> {
    vals.iter()
        .filter_map(|v| match v {
            Val::Date(d) => Some(*d),
            Val::Str(s) => dates::parse(s),
            _ => None,
        })
        .collect()
}

fn date_text(d: NaiveDateTime) -> String {
    d.format(if d.time() == chrono::NaiveTime::MIN { "%Y-%m-%d" } else { "%Y-%m-%d %H:%M" }).to_string()
}

/// At most two decimals, none when whole.
fn num_text(x: f64) -> String {
    let r = (x * 100.0).round() / 100.0;
    if r.fract() == 0.0 { format!("{r:.0}") } else { format!("{r}") }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn numbers_dates_and_counts() {
        let n = [Val::Num(1.0), Val::Num(4.0), Val::Str("7".into()), Val::Null, Val::Bool(true)];
        assert_eq!(summarize(SummaryKind::Sum, &n).as_deref(), Some("12"));
        assert_eq!(summarize(SummaryKind::Average, &n).as_deref(), Some("4"));
        assert_eq!(summarize(SummaryKind::Median, &n[..2]).as_deref(), Some("2.5"));
        assert_eq!(summarize(SummaryKind::Range, &n).as_deref(), Some("6"));
        assert_eq!(summarize(SummaryKind::Stddev, &n).as_deref(), Some("2.45"));
        assert_eq!(summarize(SummaryKind::Empty, &n).as_deref(), Some("1"));
        assert_eq!(summarize(SummaryKind::Checked, &n).as_deref(), Some("1"));
        assert_eq!(summarize(SummaryKind::Sum, &[Val::Str("x".into())]), None, "nothing to add up");
        let d = [Val::Str("2025-03-10".into()), Val::Str("2025-03-01".into()), Val::Str("2025-03-01".into())];
        assert_eq!(summarize(SummaryKind::Earliest, &d).as_deref(), Some("2025-03-01"));
        assert_eq!(summarize(SummaryKind::Latest, &d).as_deref(), Some("2025-03-10"));
        assert_eq!(summarize(SummaryKind::Range, &d).as_deref(), Some("9 days"));
        assert_eq!(summarize(SummaryKind::Unique, &d).as_deref(), Some("2"));
    }
}
