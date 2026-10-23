//! The budget as "your normal month" (DESIGN-finance "Budget", no envelopes): this month per category against its
//! usual month, a target pinned on a category's note in its place, the savings rate per month, and the recurring
//! payments found in the history. Every amount is in the display currency, converted at the price of its day.
use crate::book::Ledger;
use crate::model::*;
use crate::notes::Notes;
use crate::prices::Prices;
use chrono::{Datelike, NaiveDate};
use rust_decimal::Decimal;
use std::collections::{BTreeMap, BTreeSet};

/// The category that holds what nobody has categorised yet: it mixes spending with income and transfers, so it is
/// reported apart and left out of the totals.
pub const UNKNOWN: &str = "Expenses:Unknown";

#[derive(Debug, Clone, PartialEq)]
pub struct Line {
    /// The category at its top two levels (Expenses:Food); a deeper note's target counts here.
    pub account: String,
    pub spent: Decimal,
    /// The usual month (`usual`).
    pub usual: Decimal,
    /// Pinned on a category note (`target:`), in the display currency.
    pub target: Option<Decimal>,
    pub target_note: Option<String>,
    /// The months before this one, oldest first (what `usual` came from).
    pub history: Vec<Decimal>,
}

impl Line {
    /// What this month is held against: the pinned target, else the usual month.
    pub fn budget(&self) -> Decimal {
        self.target.unwrap_or(self.usual)
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct MonthTotals {
    pub month: String,
    pub income: Decimal,
    pub spent: Decimal,
    /// Uncategorised money out (positive postings to Unknown) and in (negative ones, as a positive sum).
    pub unknown_out: Decimal,
    pub unknown_in: Decimal,
}

impl MonthTotals {
    /// (income − spending) / income over the categorised; none in a month without income.
    pub fn rate(&self) -> Option<Decimal> {
        (self.income > Decimal::ZERO).then(|| (self.income - self.spent) / self.income)
    }
    /// The same counting the uncategorised as what it most likely is (in = income, out = spending).
    pub fn rate_all(&self) -> Option<Decimal> {
        let inc = self.income + self.unknown_in;
        (inc > Decimal::ZERO).then(|| (inc - self.spent - self.unknown_out) / inc)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Period {
    Weekly,
    Monthly,
    Quarterly,
    Yearly,
}

impl Period {
    fn of(days: i64) -> Option<Period> {
        match days {
            6..=8 => Some(Period::Weekly),
            26..=35 => Some(Period::Monthly),
            84..=98 => Some(Period::Quarterly),
            350..=380 => Some(Period::Yearly),
            _ => None,
        }
    }
    pub fn word(self) -> &'static str {
        match self {
            Period::Weekly => "weekly",
            Period::Monthly => "monthly",
            Period::Quarterly => "quarterly",
            Period::Yearly => "yearly",
        }
    }
    fn per_month(self) -> Decimal {
        match self {
            Period::Weekly => Decimal::new(4345, 3), // 52.14 / 12
            Period::Monthly => Decimal::ONE,
            Period::Quarterly => Decimal::ONE / Decimal::from(3),
            Period::Yearly => Decimal::ONE / Decimal::from(12),
        }
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct Recurring {
    pub payee: String,
    pub account: String,
    pub period: Period,
    /// The usual amount (median), positive for a payment, negative for income.
    pub amount: Decimal,
    pub per_month: Decimal,
    pub count: usize,
    pub last: NaiveDate,
    pub next: NaiveDate,
    /// The last one's place in the journal.
    pub path: String,
    pub line: usize,
}

#[derive(Debug, Clone, PartialEq)]
pub struct Budget {
    pub currency: Commodity,
    pub month: String,
    /// How far into `month` today is (1 for a month already over), for "on pace".
    pub elapsed: Decimal,
    pub lines: Vec<Line>,
    pub months: Vec<MonthTotals>,
    pub recurring: Vec<Recurring>,
    /// Commodities spent without a price into the display currency (left out, named so it is never silent).
    pub unpriced: Vec<String>,
}

fn ym(d: NaiveDate) -> String {
    format!("{:04}-{:02}", d.year(), d.month())
}

fn top(a: &Account) -> String {
    a.as_str().split(':').take(2).collect::<Vec<_>>().join(":")
}

fn median(xs: &[Decimal]) -> Decimal {
    let mut s = xs.to_vec();
    s.sort();
    let m = s.len() / 2;
    match s.len() {
        0 => Decimal::ZERO,
        n if n % 2 == 1 => s[m],
        _ => (s[m - 1] + s[m]) / Decimal::TWO,
    }
}

/// A category's usual month from its past months (0 where it had none). Spent in at least half of them (food): the
/// median, so one odd month (a trip) does not move it. Spent in fewer (a yearly bill): the mean, its real cost per
/// month, where a median of 0 would flag it as over every time it comes.
pub fn usual(xs: &[Decimal]) -> Decimal {
    if xs.is_empty() {
        return Decimal::ZERO;
    }
    let spent = xs.iter().filter(|x| x.abs() >= Decimal::new(5, 3)).count();
    if spent * 2 < xs.len() {
        xs.iter().sum::<Decimal>() / Decimal::from(xs.len())
    } else {
        median(xs)
    }
}

fn months_back(month: &str, n: usize) -> Vec<String> {
    let (y, m): (i32, u32) = (month[..4].parse().unwrap_or(2000), month[5..].parse().unwrap_or(1));
    (1..=n as i32).rev().map(|k| {
        let t = y * 12 + m as i32 - 1 - k;
        format!("{:04}-{:02}", t.div_euclid(12), t.rem_euclid(12) + 1)
    }).collect()
}

/// The payee as the same counterparty every time: case, digits and punctuation dropped ("Spotify P2A4B" = "SPOTIFY").
fn payee_key(p: &str) -> String {
    p.split(|c: char| !c.is_alphanumeric()).filter(|w| !w.is_empty() && !w.chars().any(|c| c.is_ascii_digit()))
        .take(3).map(str::to_lowercase).collect::<Vec<_>>().join(" ")
}

pub fn budget(l: &Ledger, notes: &Notes, prices: &Prices, currency: &Commodity, baseline: usize, today: NaiveDate) -> Budget {
    let mut unpriced = BTreeSet::new();
    let mut conv = |q: Decimal, c: &Commodity, d: NaiveDate| prices.convert(q, c, currency, Some(d)).unwrap_or_else(|| { unpriced.insert(c.to_string()); Decimal::ZERO });
    // month → category → spent (Expenses positive), month → income (positive), month → unknown.
    let mut spent: BTreeMap<String, BTreeMap<String, Decimal>> = BTreeMap::new();
    let mut totals: BTreeMap<String, MonthTotals> = BTreeMap::new();
    for b in l.txns.iter().filter(|b| b.txn.date <= today) {
        let m = ym(b.txn.date);
        for p in &b.postings {
            let root = p.account.root();
            if !matches!(root, Root::Expenses | Root::Income) {
                continue;
            }
            let v = conv(p.units.qty, &p.units.commodity, b.txn.date);
            let t = totals.entry(m.clone()).or_insert_with(|| MonthTotals { month: m.clone(), income: Decimal::ZERO, spent: Decimal::ZERO, unknown_out: Decimal::ZERO, unknown_in: Decimal::ZERO });
            match root {
                Root::Income if !p.account.is_under("Income:Gains") => t.income -= v,
                Root::Income => {}
                _ if p.account.is_under(UNKNOWN) && v > Decimal::ZERO => t.unknown_out += v,
                _ if p.account.is_under(UNKNOWN) => t.unknown_in -= v,
                _ => {
                    t.spent += v;
                    *spent.entry(m.clone()).or_default().entry(top(&p.account)).or_default() += v;
                }
            }
        }
    }
    let month = totals.keys().next_back().cloned().unwrap_or_else(|| ym(today));
    let elapsed = if month == ym(today) {
        let days = NaiveDate::from_ymd_opt(today.year() + (today.month() / 12) as i32, today.month() % 12 + 1, 1).map_or(30, |n| (n - today.with_day(1).unwrap_or(today)).num_days());
        Decimal::from(today.day()) / Decimal::from(days)
    } else {
        Decimal::ONE
    };
    let past = months_back(&month, baseline);
    let empty = BTreeMap::new();
    let now = spent.get(&month).unwrap_or(&empty);
    let mut names: BTreeSet<String> = now.keys().cloned().collect();
    names.extend(past.iter().filter_map(|m| spent.get(m)).flat_map(|c| c.keys().cloned()));
    let targets: BTreeMap<String, (Decimal, String)> = notes.categories.values().filter_map(|n| {
        let t = n.target.as_ref()?;
        Some((top(&n.account), (prices.convert(t.qty, &t.commodity, currency, Some(today))?, n.path.to_string())))
    }).fold(BTreeMap::new(), |mut acc, (k, (q, path))| {
        let e = acc.entry(k).or_insert((Decimal::ZERO, path));
        e.0 += q;
        acc
    });
    names.extend(targets.keys().cloned());
    let mut lines: Vec<Line> = names.into_iter().map(|account| {
        let history: Vec<Decimal> = past.iter().map(|m| spent.get(m).and_then(|c| c.get(&account)).copied().unwrap_or_default()).collect();
        let (target, target_note) = targets.get(&account).map_or((None, None), |(q, p)| (Some(*q), Some(p.clone())));
        Line { spent: now.get(&account).copied().unwrap_or_default(), usual: usual(&history), target, target_note, history, account }
    }).filter(|l| !l.spent.is_zero() || l.usual.abs() >= Decimal::new(5, 3) || l.target.is_some()).collect();
    // The most over its budget first; then the biggest budgets (what matters most), the small ones last.
    let over = |l: &Line| (l.spent - l.budget()).max(Decimal::ZERO);
    lines.sort_by(|a, b| over(b).cmp(&over(a)).then_with(|| b.budget().max(b.spent).cmp(&a.budget().max(a.spent))).then_with(|| a.account.cmp(&b.account)));
    let months = totals.into_values().rev().take(13).collect();
    Budget { currency: currency.clone(), month, elapsed, lines, months, recurring: recurring(l, prices, currency, today), unpriced: unpriced.into_iter().collect() }
}

/// Payments (and income) that come back on a regular period at a similar amount: at least three of them, the gaps
/// mostly within a quarter of the usual gap and the amounts mostly within a fifth of the usual amount. Only the ones
/// still running (the last is less than one and a half periods old) are listed.
pub fn recurring(l: &Ledger, prices: &Prices, currency: &Commodity, today: NaiveDate) -> Vec<Recurring> {
    struct Seen<'a> { date: NaiveDate, amount: Decimal, account: &'a Account, payee: &'a str, path: &'a str, line: usize }
    let mut groups: BTreeMap<String, Vec<Seen>> = BTreeMap::new();
    for b in l.txns.iter().filter(|b| b.txn.date <= today) {
        let key = payee_key(&b.txn.payee);
        if key.is_empty() {
            continue;
        }
        for p in b.postings.iter().filter(|p| matches!(p.account.root(), Root::Expenses | Root::Income) && !p.account.is_under("Income:Gains")) {
            let Some(v) = prices.convert(p.units.qty, &p.units.commodity, currency, Some(b.txn.date)) else { continue };
            groups.entry(key.clone()).or_default().push(Seen { date: b.txn.date, amount: v, account: &p.account, payee: &b.txn.payee, path: &b.txn.span.path, line: b.txn.span.first });
        }
    }
    let mostly = |n: usize, of: usize| n * 10 >= of * 7;
    let mut out = vec![];
    for seen in groups.values() {
        // Several on one day (a split, a refund) count once: the day's sum.
        let mut days: Vec<(NaiveDate, Decimal)> = vec![];
        for s in seen {
            match days.last_mut() {
                Some((d, a)) if *d == s.date => *a += s.amount,
                _ => days.push((s.date, s.amount)),
            }
        }
        if days.len() < 3 {
            continue;
        }
        let gaps: Vec<Decimal> = days.windows(2).map(|w| Decimal::from((w[1].0 - w[0].0).num_days())).collect();
        let gap = median(&gaps);
        let Some(period) = Period::of(gap.try_into().unwrap_or(0i64)) else { continue };
        let near = |x: Decimal, m: Decimal, f: Decimal| (x - m).abs() <= m.abs() * f;
        if !mostly(gaps.iter().filter(|g| near(**g, gap, Decimal::new(25, 2))).count(), gaps.len()) {
            continue;
        }
        let amounts: Vec<Decimal> = days.iter().map(|d| d.1).collect();
        let amount = median(&amounts);
        if amount.is_zero() || !mostly(amounts.iter().filter(|a| near(**a, amount, Decimal::new(2, 1))).count(), amounts.len()) {
            continue;
        }
        let gap_days: i64 = gap.round().try_into().unwrap_or(30);
        let last = days.last().unwrap().0;
        if (today - last).num_days() * 2 > gap_days * 3 {
            continue;
        }
        let s = seen.last().unwrap();
        out.push(Recurring {
            payee: s.payee.to_string(), account: top(s.account), period, amount: amount.round_dp(2), per_month: (amount * period.per_month()).round_dp(2),
            count: days.len(), last, next: last + chrono::Duration::days(gap_days), path: s.path.to_string(), line: s.line,
        });
    }
    out.sort_by_key(|r| std::cmp::Reverse(r.per_month.abs()));
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::load::load_texts;

    fn dec(s: &str) -> Decimal {
        s.parse().unwrap()
    }

    #[test]
    fn usual_takes_the_median_or_the_mean() {
        assert_eq!(usual(&[dec("100"), dec("110"), dec("400"), dec("105")]), dec("107.5"), "one trip does not move it");
        assert_eq!(usual(&[dec("0"), dec("0"), dec("0"), dec("0"), dec("0"), dec("120")]), dec("20"), "a yearly bill: its cost per month");
        assert_eq!(usual(&[]), Decimal::ZERO);
    }

    fn journal() -> String {
        let mut j = String::new();
        for m in 1..=7 {
            j += &format!("2026-{m:02}-03 * Spotify AB{m}\n  Expenses:Subscriptions  10.99 EUR\n  Assets:Bank\n");
            j += &format!("2026-{m:02}-05 * Mercadona\n  Expenses:Food:Groceries  {} EUR\n  Assets:Bank\n", 200 + m * 10);
            j += &format!("2026-{m:02}-01 * University\n  Income:Salary  -2000 EUR\n  Assets:Bank\n");
        }
        j += "2026-07-10 * Somewhere\n  Expenses:Unknown  55 EUR\n  Assets:Bank\n";
        j
    }

    #[test]
    fn this_month_against_the_usual_one_and_a_pinned_target() {
        let l = load_texts(&[("finance/journal/2026.fin".into(), journal()),
            ("finance/categories/Food.md".into(), "---\ntype: finance-category\naccount: Expenses:Food\ntarget: 250 EUR\n---\n".into())]);
        let p = Prices::new(&l.ledger);
        let b = budget(&l.ledger, &l.notes, &p, &Commodity::parse("EUR").unwrap(), 6, "2026-07-20".parse().unwrap());
        assert_eq!(b.month, "2026-07");
        let food = b.lines.iter().find(|l| l.account == "Expenses:Food").unwrap();
        assert_eq!((food.spent, food.usual, food.target), (dec("270"), dec("235"), Some(dec("250"))));
        assert_eq!(b.lines[0].account, "Expenses:Food", "the most over its budget first");
        let july = &b.months[0];
        assert_eq!((july.income, july.spent, july.unknown_out, july.unknown_in), (dec("2000"), dec("280.99"), dec("55"), Decimal::ZERO));
        assert_eq!(july.rate_all().unwrap().round_dp(4), dec("0.8320"));
        assert_eq!(july.rate().unwrap().round_dp(4), dec("0.8595"));
        assert_eq!(b.elapsed.round_dp(3), dec("0.645"));
    }

    #[test]
    fn recurring_finds_the_subscription_and_the_salary() {
        let l = load_texts(&[("finance/journal/2026.fin".into(), journal())]);
        let p = Prices::new(&l.ledger);
        let r = recurring(&l.ledger, &p, &Commodity::parse("EUR").unwrap(), "2026-07-20".parse().unwrap());
        let names: Vec<_> = r.iter().map(|r| (r.payee.as_str(), r.period)).collect();
        assert!(names.contains(&("Spotify AB7", Period::Monthly)), "{names:?}");
        assert!(names.contains(&("University", Period::Monthly)));
        let s = r.iter().find(|r| r.payee.starts_with("Spotify")).unwrap();
        assert_eq!((s.amount, s.next), (dec("10.99"), "2026-08-02".parse().unwrap()));
        // Groceries rise 10 a month: within a fifth, so they recur too. Gone quiet for months, nothing is listed.
        assert!(recurring(&l.ledger, &p, &Commodity::parse("EUR").unwrap(), "2026-12-20".parse().unwrap()).is_empty());
    }
}
