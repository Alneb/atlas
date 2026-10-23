//! The price feature (DESIGN-finance "Prices and FX"; prices never in the transaction journal): FX from the ECB's
//! data API, fund and stock prices from a ticker's history or a page (data/prices.toml, or the commodity's note), written
//! sparse into `prices/<BASE>-<QUOTE>.fin` — one quote per month (its last), the quote of each day a transaction
//! needs one, and the latest. The fetching itself is the caller's (the core's fetch, or curl on the command line).
use crate::book::Ledger;
use crate::model::*;
use crate::notes::{CommodityKind, Notes};
use chrono::{Datelike, NaiveDate};
use regex::Regex;
use serde::Deserialize;
use rust_decimal::Decimal;
use std::collections::{BTreeMap, BTreeSet};

/// Where a commodity's price is read: a page and the regexes that find the price (group `price`, optionally
/// `currency`) and its date (group `date`, read with `date_format`).
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Source {
    pub url: String,
    pub price: String,
    #[serde(default)]
    pub date: Option<String>,
    #[serde(default = "iso")]
    pub date_format: String,
}

fn iso() -> String {
    "%Y-%m-%d".into()
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Fx {
    pub base: String,
    pub url: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct History {
    pub url: String,
}

/// A unit wealth can be measured in without a note of its own.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Measure {
    pub symbol: String,
    pub name: String,
    pub ticker: String,
}

/// The price sources (data/prices.toml, with the vault's finance/prices.toml on top).
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Config {
    pub fx: Fx,
    pub history: History,
    pub default_page: String,
    pub pages: BTreeMap<String, Source>,
    #[serde(default)]
    pub measure: Vec<Measure>,
}

const BUILT_IN: &str = include_str!("../../data/prices.toml");

impl Config {
    /// The built-in sources with a vault's file over them: its tables replace by name, its pages by name, its
    /// measures by symbol. A broken vault file is an error naming it; the built-in one is checked by a test.
    pub fn load(vault: Option<&str>) -> Result<Config, String> {
        let mut base: toml::Table = BUILT_IN.parse().map_err(|e| format!("data/prices.toml: {e}"))?;
        if let Some(text) = vault {
            let over: toml::Table = text.parse().map_err(|e| format!("finance/prices.toml: {e}"))?;
            for (k, v) in over {
                match (k.as_str(), base.get_mut(&k), v) {
                    ("pages", Some(toml::Value::Table(mine)), toml::Value::Table(theirs)) => mine.extend(theirs),
                    ("measure", Some(toml::Value::Array(mine)), toml::Value::Array(theirs)) => {
                        let sym = |v: &toml::Value| v.get("symbol").and_then(|s| s.as_str()).map(str::to_string);
                        mine.retain(|m| !theirs.iter().any(|t| sym(t) == sym(m)));
                        mine.extend(theirs);
                    }
                    (_, _, v) => { base.insert(k, v); }
                }
            }
        }
        toml::Value::Table(base).try_into().map_err(|e| format!("prices.toml: {e}"))
    }

    pub fn base(&self) -> Commodity {
        Commodity::parse(&self.fx.base).unwrap_or_else(|_| Commodity::parse("EUR").expect("EUR"))
    }

    pub fn measure(&self, c: &str) -> Option<&Measure> {
        self.measure.iter().find(|m| m.symbol == c)
    }
}

/// How a commodity's prices are fetched.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Feed {
    /// Daily history by ticker, in the currency the source names.
    Ticker(String),
    /// A page read with regexes: only today's quote.
    Page(Source),
}

/// What a commodity is priced from: its note's `price_source` (`ticker`, `none`, a page's name, or a URL with
/// `price_find` and optionally `price_date_find` / `price_date_format`); else its `ticker`; else the default page
/// for a fund or ETF with an ISIN; else a measure of the config.
pub fn feed_of(cfg: &Config, notes: &Notes, c: &Commodity) -> Option<Feed> {
    let measure = || cfg.measure(c.as_str()).map(|m| Feed::Ticker(m.ticker.clone()));
    let Some(n) = notes.commodities.get(c) else { return measure() };
    let ticker = n.ticker.clone();
    match n.price_source.as_deref() {
        Some("none") => None,
        Some("ticker" | "yahoo") => ticker.map(Feed::Ticker).or_else(measure),
        Some(url) if url.starts_with("http") => Some(Feed::Page(Source {
            url: url.into(),
            price: n.price_find.clone().unwrap_or_else(|| r"(?P<price>[0-9]+[.,][0-9]+)".into()),
            date: n.price_date_find.clone(),
            date_format: n.price_date_format.clone().unwrap_or_else(iso),
        })),
        Some(name) => cfg.pages.get(name).cloned().map(Feed::Page),
        None if ticker.is_some() => ticker.map(Feed::Ticker),
        None if matches!(n.kind, CommodityKind::Fund | CommodityKind::Etf) && n.isin.is_some() => cfg.pages.get(&cfg.default_page).cloned().map(Feed::Page),
        None => measure(),
    }
}

pub fn history_url(cfg: &Config, ticker: &str, since: NaiveDate, today: NaiveDate) -> String {
    let t = |d: NaiveDate| d.and_hms_opt(0, 0, 0).map_or(0, |x| x.and_utc().timestamp());
    let q: String = ticker.bytes().map(|b| if b.is_ascii_alphanumeric() || b"-._".contains(&b) { (b as char).to_string() } else { format!("%{b:02X}") }).collect();
    cfg.history.url.replace("{ticker}", &q).replace("{from}", &t(since).to_string()).replace("{to}", &(t(today) + 86400).to_string())
}

pub fn yahoo_json(text: &str) -> Result<(Commodity, Vec<(NaiveDate, Decimal)>), String> {
    let v: serde_json::Value = serde_json::from_str(text).map_err(|e| format!("Yahoo's answer is not JSON: {e}"))?;
    let r = &v["chart"]["result"][0];
    if r.is_null() {
        return Err(format!("Yahoo: {}", v["chart"]["error"]["description"].as_str().unwrap_or("no such ticker")));
    }
    let cur = Commodity::parse(r["meta"]["currency"].as_str().unwrap_or_default()).map_err(|e| format!("Yahoo's currency: {e}"))?;
    let times = r["timestamp"].as_array().cloned().unwrap_or_default();
    let closes = r["indicators"]["quote"][0]["close"].as_array().cloned().unwrap_or_default();
    let quotes = times.iter().zip(&closes).filter_map(|(t, c)| {
        let day = chrono::DateTime::from_timestamp(t.as_i64()?, 0)?.date_naive();
        Some((day, Decimal::try_from(c.as_f64()?).ok()?.round_dp(6)))
    }).collect();
    Ok((cur, quotes))
}

pub fn url(s: &Source, c: &Commodity, notes: &Notes, currency: &Commodity) -> String {
    let n = notes.commodities.get(c);
    s.url.replace("{isin}", n.and_then(|n| n.isin.as_deref()).unwrap_or_default()).replace("{symbol}", c.as_str()).replace("{currency}", currency.as_str())
}

fn number(s: &str) -> Option<Decimal> {
    // "1.234,56" and "1,234.56": the last separator is the decimal one.
    let last = s.rfind([',', '.']);
    let clean: String = s.char_indices().filter_map(|(i, ch)| match ch {
        ',' | '.' if Some(i) == last => Some('.'),
        ',' | '.' => None,
        _ => Some(ch),
    }).collect();
    clean.parse().ok()
}

/// A quote read from a page: (date, price, currency named on the page).
pub fn scrape(s: &Source, page: &str, today: NaiveDate) -> Result<(NaiveDate, Decimal, Option<String>), String> {
    let re = Regex::new(&s.price).map_err(|e| format!("price_find: {e}"))?;
    let caps = re.captures(page).ok_or("the page has no price where the source looks (has it changed?)")?;
    let price = caps.name("price").and_then(|m| number(m.as_str())).ok_or("the price_find regex needs a group (?P<price>…)")?;
    let date = match &s.date {
        Some(d) => {
            let re = Regex::new(d).map_err(|e| format!("price_date_find: {e}"))?;
            re.captures(page).and_then(|c| c.name("date").map(|m| m.as_str().to_string()))
                .and_then(|d| NaiveDate::parse_from_str(&d, &s.date_format).ok()).unwrap_or(today)
        }
        None => today,
    };
    Ok((date, price, caps.name("currency").map(|m| m.as_str().to_string())))
}

/// The FX source's daily rates for the base → `quote` (the ECB's csvdata by default).
pub fn fx_url(cfg: &Config, quote: &Commodity, since: NaiveDate) -> String {
    cfg.fx.url.replace("{quote}", quote.as_str()).replace("{since}", &since.to_string())
}

pub fn fx_csv(text: &str) -> Result<Vec<(NaiveDate, Decimal)>, String> {
    let mut lines = text.lines();
    let head: Vec<&str> = lines.next().ok_or("the ECB answered nothing")?.split(',').collect();
    let col = |n: &str| head.iter().position(|h| *h == n).ok_or(format!("the ECB's answer has no {n} column"));
    let (d, v) = (col("TIME_PERIOD")?, col("OBS_VALUE")?);
    Ok(lines.filter_map(|l| {
        let f: Vec<&str> = l.split(',').collect();
        Some((f.get(d)?.parse().ok()?, f.get(v)?.parse().ok()?))
    }).collect())
}

/// The currencies to follow against `base`: every other currency the ledger holds or spends, with its first day.
pub fn currencies(l: &Ledger, notes: &Notes, base: &Commodity) -> BTreeMap<Commodity, NaiveDate> {
    let mut out = BTreeMap::new();
    for b in &l.txns {
        for p in &b.postings {
            let c = &p.units.commodity;
            if c != base && !notes.is_lotted(c) {
                out.entry(c.clone()).or_insert(b.txn.date);
            }
        }
    }
    out
}

/// The days a transaction in `c` happened (each needs that day's rate).
pub fn used_on(l: &Ledger, c: &Commodity) -> BTreeSet<NaiveDate> {
    l.txns.iter().filter(|b| b.postings.iter().any(|p| &p.units.commodity == c)).map(|b| b.txn.date).collect()
}

/// The file for a pair, its quotes kept sparse: of `quotes` (existing and new together), the last of each month,
/// the one in force on each of `needed`, and the latest.
pub fn write_pair(base: &Commodity, quote: &Commodity, quotes: &BTreeMap<NaiveDate, Decimal>, needed: &BTreeSet<NaiveDate>) -> String {
    let mut keep: BTreeSet<NaiveDate> = BTreeSet::new();
    let mut by_month: BTreeMap<(i32, u32), NaiveDate> = BTreeMap::new();
    for d in quotes.keys() {
        by_month.insert((d.year(), d.month()), *d);
    }
    keep.extend(by_month.values());
    for n in needed {
        if let Some((d, _)) = quotes.range(..=*n).next_back() {
            keep.insert(*d);
        }
    }
    let mut out = format!("; {base} in {quote}, written by the finance plugin's price feature: one quote per month, the day of each transaction\n; that needs one, and the latest. Daily quotes are not kept (DESIGN-finance \"Prices and FX\").\n");
    for d in keep {
        out += &format!("{d} price {base} {} {quote}\n", quotes[&d].normalize());
    }
    out
}

/// The quotes a pair file already has (the file is the feature's; what it read before is kept).
pub fn read_pair(text: &str, base: &Commodity, quote: &Commodity) -> BTreeMap<NaiveDate, Decimal> {
    let (mut j, mut d) = (Journal::default(), vec![]);
    crate::parse::parse_file("prices", text, &mut j, &mut d);
    j.prices.into_iter().filter(|p| &p.base == base && &p.quote.commodity == quote).map(|p| (p.date, p.quote.qty)).collect()
}

pub fn pair_path(folder: &str, base: &Commodity, quote: &Commodity) -> String {
    format!("{folder}/prices/{base}-{quote}.fin")
}

/// What a price update did: the files it would write (only changed ones), what it read, and what failed.
#[derive(Debug, Default)]
pub struct Update {
    pub files: Vec<(String, String)>,
    pub log: Vec<String>,
    pub errors: Vec<String>,
}

/// What an update is for: the finance folder, the units wealth is measured in, and the day.
#[derive(Debug, Clone, Copy)]
pub struct Want<'a> {
    pub folder: &'a str,
    pub measures: &'a [Commodity],
    pub today: NaiveDate,
}

/// Fetches what the ledger and the measures need: FX against EUR from the ECB for every currency used or measured
/// in; for every lotted commodity and every measure that is not a currency, its feed's prices. Each pair's file
/// keeps what it had (sparse) plus what came; one failure is reported and the rest carry on.
pub fn update(cfg: &Config, l: &Ledger, notes: &Notes, want: &Want, read: &dyn Fn(&str) -> Option<String>, fetch: &mut dyn FnMut(&str) -> Result<String, String>) -> Update {
    let Want { folder, measures, today } = *want;
    let mut out = Update::default();
    let start = l.txns.first().map_or(today, |b| b.txn.date);
    let eur = cfg.base();
    let is_measure_asset = |c: &Commodity| notes.is_lotted(c) || cfg.measure(c.as_str()).is_some() || notes.commodities.get(c).is_some_and(|n| n.ticker.is_some());
    let mut fx = currencies(l, notes, &eur);
    for m in measures.iter().filter(|m| **m != eur && !is_measure_asset(m)) {
        fx.entry(m.clone()).or_insert(start);
    }
    let mut assets: BTreeMap<Commodity, NaiveDate> = BTreeMap::new();
    for b in &l.txns {
        for p in b.postings.iter().filter(|p| notes.is_lotted(&p.units.commodity)) {
            assets.entry(p.units.commodity.clone()).or_insert(b.txn.date);
        }
    }
    for m in measures.iter().filter(|m| is_measure_asset(m)) {
        assets.entry(m.clone()).or_insert(start);
    }
    let put = |out: &mut Update, base: &Commodity, quote: &Commodity, new: Vec<(NaiveDate, Decimal)>| {
        let path = pair_path(folder, base, quote);
        let old = read(&path).unwrap_or_default();
        let mut q = read_pair(&old, base, quote);
        let n = new.len();
        q.extend(new);
        let text = write_pair(base, quote, &q, &used_on(l, if base == &eur { quote } else { base }));
        out.log.push(format!("{base} in {quote}: {n} quotes read, {} kept in {path}", text.lines().filter(|l| !l.starts_with(';')).count()));
        if text != old {
            out.files.push((path, text));
        }
    };
    for (c, since) in &fx {
        match fetch(&fx_url(cfg, c, *since)).and_then(|t| fx_csv(&t)) {
            Ok(q) if !q.is_empty() => put(&mut out, &eur, c, q),
            Ok(_) => out.errors.push(format!("{c}: the FX source has no rates for it (is it a currency it follows?)")),
            Err(e) => out.errors.push(format!("{c}: the FX source: {e}")),
        }
    }
    for (c, since) in &assets {
        match feed_of(cfg, notes, c) {
            None => out.log.push(format!("{c}: no price source (its note can name one: price_source, ticker); its lots' costs are its prices")),
            Some(Feed::Ticker(t)) => match fetch(&history_url(cfg, &t, *since, today)).and_then(|x| yahoo_json(&x)) {
                Ok((cur, q)) => put(&mut out, c, &cur, q),
                Err(e) => out.errors.push(format!("{c} ({t}): {e}")),
            },
            Some(Feed::Page(s)) => {
                // Asked in the currency its lots were bought in (a page may name another: that one is kept).
                let cur = l.lots.iter().filter(|((_, x), _)| x == c).flat_map(|(_, v)| v).find_map(|h| h.cost.as_ref().map(|a| a.commodity.clone())).unwrap_or_else(|| eur.clone());
                match fetch(&url(&s, c, notes, &cur)).and_then(|page| scrape(&s, &page, today)) {
                    Ok((d, p, named)) => {
                        let quote = named.and_then(|n| Commodity::parse(&n).ok()).unwrap_or(cur);
                        put(&mut out, c, &quote, vec![(d, p)]);
                    }
                    Err(e) => out.errors.push(format!("{c}: {e}")),
                }
            }
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn c(s: &str) -> Commodity {
        Commodity::parse(s).unwrap()
    }
    fn d(s: &str) -> NaiveDate {
        s.parse().unwrap()
    }

    #[test]
    fn ecb_and_ft_answers_are_read() {
        let csv = "KEY,FREQ,CURRENCY,CURRENCY_DENOM,EXR_TYPE,EXR_SUFFIX,TIME_PERIOD,OBS_VALUE,OBS_STATUS\nEXR.D.CAD.EUR.SP00.A,D,CAD,EUR,SP00,A,2026-10-01,1.6095,A\nEXR.D.CAD.EUR.SP00.A,D,CAD,EUR,SP00,A,2026-10-02,1.5984,A\n";
        assert_eq!(fx_csv(csv).unwrap(), vec![(d("2026-10-01"), "1.6095".parse().unwrap()), (d("2026-10-02"), "1.5984".parse().unwrap())]);
        // The tearsheet's shape (markets.ft.com, 2026-10-21).
        let page = r#"<span class="mod-ui-data-list__label">Price (EUR)</span><span class="mod-ui-data-list__value">14.99</span> … <div class="mod-disclaimer">Data delayed at least 15 minutes, as of Oct 20 2026.</div>"#;
        let ft = &Config::load(None).unwrap().pages["ft"];
        assert_eq!(scrape(ft, page, d("2026-10-21")).unwrap(), (d("2026-10-20"), "14.99".parse().unwrap(), Some("EUR".into())));
        assert!(scrape(ft, "<html>moved</html>", d("2026-10-21")).unwrap_err().contains("changed"));
        assert_eq!(number("1.234,56"), Some("1234.56".parse().unwrap()));
    }

    #[test]
    fn yahoo_answers_are_read() {
        let j = r#"{"chart":{"result":[{"meta":{"currency":"USD","symbol":"GC=F"},"timestamp":[1792540800,1792627200],"indicators":{"quote":[{"close":[4100.5,null]}]}}],"error":null}}"#;
        let (cur, q) = yahoo_json(j).unwrap();
        assert_eq!((cur.as_str(), q.len(), q[0].1), ("USD", 1, "4100.5".parse().unwrap()));
        assert!(yahoo_json(r#"{"chart":{"result":null,"error":{"description":"No data found, symbol may be delisted"}}}"#).unwrap_err().contains("delisted"));
        assert!(history_url(&Config::load(None).unwrap(), "^GSPC", d("2024-01-01"), d("2024-02-01")).contains("chart/%5EGSPC?period1=1704067200"));
    }

    #[test]
    fn an_update_fetches_fx_and_measures() {
        let l = crate::load::load_texts(&[("finance/journal/2026.fin".into(), "2026-09-10 * Pay\n  Assets:Bank  150 CAD\n  Income:Salary\n".into())]);
        let mut asked = vec![];
        let u = update(&Config::load(None).unwrap(), &l.ledger, &l.notes, &Want { folder: "finance", measures: &[c("USD"), c("XAU")], today: d("2026-10-01") }, &|_| None, &mut |u| {
            asked.push(u.to_string());
            Ok(if u.contains("ecb") { "TIME_PERIOD,OBS_VALUE\n2026-09-10,1.5\n".into() } else { r#"{"chart":{"result":[{"meta":{"currency":"USD"},"timestamp":[1757462400],"indicators":{"quote":[{"close":[3600]}]}}]}}"#.into() })
        });
        assert!(u.errors.is_empty(), "{:?}", u.errors);
        assert_eq!(u.files.iter().map(|f| f.0.as_str()).collect::<Vec<_>>(), ["finance/prices/EUR-CAD.fin", "finance/prices/EUR-USD.fin", "finance/prices/XAU-USD.fin"]);
        assert!(asked[2].contains("GC%3DF"), "{asked:?}");
    }

    #[test]
    fn a_vault_file_replaces_by_name_and_symbol() {
        let c = Config::load(Some("default_page = \"mine\"\n[pages.mine]\nurl = \"https://x/{isin}\"\nprice = \"(?P<price>\\\\d+)\"\n[[measure]]\nsymbol = \"XAU\"\nname = \"Gold\"\nticker = \"XAUUSD=X\"\n")).unwrap();
        assert_eq!((c.default_page.as_str(), c.pages.len()), ("mine", 2));
        assert_eq!(c.measure("XAU").unwrap().ticker, "XAUUSD=X");
        assert!(c.measure("BTC").is_some());
        assert!(Config::load(Some("[fx]\nbase = 3")).unwrap_err().contains("prices.toml"));
    }

    #[test]
    fn a_pair_file_stays_sparse() {
        let mut q = BTreeMap::new();
        for day in 1..=30 {
            q.insert(NaiveDate::from_ymd_opt(2026, 9, day).unwrap(), Decimal::from(day));
        }
        q.insert(d("2026-10-02"), Decimal::from(99));
        let needed: BTreeSet<_> = [d("2026-09-14")].into();
        let text = write_pair(&c("EUR"), &c("CAD"), &q, &needed);
        let lines: Vec<&str> = text.lines().filter(|l| !l.starts_with(';')).collect();
        assert_eq!(lines, ["2026-09-14 price EUR 14 CAD", "2026-09-30 price EUR 30 CAD", "2026-10-02 price EUR 99 CAD"]);
        assert_eq!(read_pair(&text, &c("EUR"), &c("CAD")).len(), 3);
    }
}
