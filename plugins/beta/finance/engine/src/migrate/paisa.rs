//! The user's Paisa journal (hledger syntax, `~/.sync/paisa/main.ledger`) → the finance folder: year journals,
//! account and fund notes, an editable mapping and a report (DESIGN-finance.md, "History harmonisation").
//!
//! What it fixes on the way, each listed in the report:
//! - **Account names:** case duplicates merge (`expenses:Unknown` with `Expenses:Unknown`). Names go through the mapping
//!   (defaults below, overridden by `paisa-mapping.md`).
//! - **Running balances:** each bank row's running balance (`(3,904.16 EUR)` in Paisa's comment) becomes an assertion.
//!   Same-day rows are ordered so the balances chain. Where the chain breaks, a `!` "missing" transaction carries the
//!   difference, so the gap shows up in Review instead of silently.
//! - **Revolut fees:** fees become their own posting.
//! - **Funds:** a fund purchase becomes a lot at its cost. A sale books FIFO and the engine computes the gain, which is
//!   compared with the one Paisa recorded.
use crate::import::{bank_number, import_id, Ids};
use crate::load::load_texts;
use crate::model::*;
use crate::parse::parse_date;
use crate::write;
use rust_decimal::Decimal;
use std::collections::{BTreeMap, BTreeSet, HashMap};
use std::fmt::Write as _;

/// The migration's defaults (data/paisa.toml): the mapping, the funds' names and ISINs, each account's presets.
#[derive(serde::Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Defaults {
    pub mapping: BTreeMap<String, String>,
    pub funds: BTreeMap<String, Fund>,
    pub importers: BTreeMap<String, Vec<String>>,
}

#[derive(serde::Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Fund {
    pub name: String,
    pub isin: String,
}

pub fn defaults() -> Defaults {
    toml::from_str(include_str!("../../../data/paisa.toml")).expect("data/paisa.toml is checked by its test")
}

/// A migrated transaction and, when it came from a bank row, that account and row.
type Row = (Txn, Option<(Account, BankRow)>);

#[derive(Debug)]
struct PTxn {
    date: chrono::NaiveDate,
    desc: String,
    comments: Vec<String>,
    postings: Vec<(String, Option<(Decimal, String)>)>,
    line: usize,
}

/// The bank row Paisa kept as a comment: amount, running balance, fee.
#[derive(Debug, Clone, Copy)]
struct BankRow {
    balance: Decimal,
    fee: Decimal,
}

pub struct Migration {
    /// (vault path, text): the files to write, none of which may exist yet.
    pub files: Vec<(String, String)>,
    pub report: String,
    pub errors: usize,
}

fn parse_paisa(text: &str) -> (Vec<PTxn>, Vec<String>) {
    let (mut out, mut problems, mut pending): (Vec<PTxn>, Vec<String>, Vec<String>) = (vec![], vec![], vec![]);
    let mut in_txn = false;
    for (i, raw) in text.lines().enumerate() {
        let line = raw.trim_end();
        if line.trim().is_empty() {
            pending.clear();
            in_txn = false;
        } else if line.starts_with(';') {
            pending.push(line.to_string());
        } else if line.starts_with(|c: char| c.is_ascii_digit()) {
            let (d, desc) = line.split_once(' ').unwrap_or((line, ""));
            match parse_date(&d.replace('/', "-")) {
                Ok(date) => {
                    out.push(PTxn { date, desc: desc.trim().to_string(), comments: std::mem::take(&mut pending), postings: vec![], line: i + 1 });
                    in_txn = true;
                }
                Err(e) => problems.push(format!("line {}: {e}", i + 1)),
            }
        } else if in_txn && line.starts_with([' ', '\t']) {
            let body = line.trim();
            let (acct, amt) = match body.find("  ").into_iter().chain(body.find('\t')).min() {
                Some(k) => (body[..k].trim(), body[k..].trim()),
                None => (body, ""),
            };
            let amount = if amt.is_empty() {
                None
            } else {
                let (n, c) = amt.rsplit_once(' ').unwrap_or((amt, "EUR"));
                match bank_number(n) {
                    Some(q) => Some((q, c.trim().to_string())),
                    None => {
                        problems.push(format!("line {}: {amt:?} is not an amount", i + 1));
                        None
                    }
                }
            };
            out.last_mut().unwrap().postings.push((acct.to_string(), amount));
        }
    }
    (out, problems)
}

/// `;\t-4.10 EUR (75.40 EUR) fee 0.00 EUR` / `;\t2,539.72 EUR (9,004.77 EUR) N-905 O-7241`.
fn bank_row(comments: &[String]) -> Option<BankRow> {
    for c in comments {
        let body = c.trim_start_matches(';').trim();
        if body.starts_with('(') {
            continue; // the first line, `(234) 2026-01-31 …`
        }
        let Some((_, rest)) = body.split_once('(') else { continue };
        let Some((bal, after)) = rest.split_once(')') else { continue };
        let Some((n, _cur)) = bal.trim().rsplit_once(' ') else { continue };
        let Some(balance) = bank_number(n) else { continue };
        let fee = after.split_once("fee ").and_then(|(_, f)| f.split_whitespace().next()).and_then(bank_number).unwrap_or_default();
        return Some(BankRow { balance, fee });
    }
    None
}

/// The date the bank booked a row, which its running balance follows, and the value date when it differs.
/// Unicaja: `(429) ED-10/04/2025) VD-07/04/2025 C: …` (Paisa dated it by VD). Revolut: `(234) <started> (<completed>) C: …`
/// (Paisa dated it by the start).
fn booked_date(comments: &[String]) -> Option<(chrono::NaiveDate, chrono::NaiveDate)> {
    let first = comments.first()?.trim_start_matches(';').trim();
    let dmy = |s: &str| chrono::NaiveDate::parse_from_str(s, "%d/%m/%Y").ok();
    if let (Some(e), Some(v)) = (first.find("ED-"), first.find("VD-")) {
        let ed = dmy(first.get(e + 3..e + 13)?)?;
        let vd = dmy(first.get(v + 3..v + 13)?)?;
        return Some((ed, vd));
    }
    let open = first.find(") ")? + 2;
    let started = parse_date(first.get(open..open + 10)?).ok()?;
    let p = first[open..].find('(')? + open + 1;
    let completed = parse_date(first.get(p..p + 10)?).ok()?;
    Some((completed, started))
}

/// Case and shape fixes every name gets before the mapping: a valid root, each part capitalised.
fn normalise(raw: &str) -> String {
    let parts: Vec<String> = raw.split(':').map(|p| {
        let mut cs = p.trim().chars();
        cs.next().map(|f| f.to_uppercase().collect::<String>() + cs.as_str()).unwrap_or_default()
    }).collect();
    if Root::parse(&parts[0]).is_none() {
        return format!("Expenses:{}", parts.join(":"));
    }
    parts.join(":")
}

/// `From → To` lines in the mapping note's fence (`->` also read).
pub fn read_mapping(note: &str) -> Vec<(String, String)> {
    note.lines().filter_map(|l| {
        let (a, b) = l.split_once('→').or_else(|| l.split_once("->"))?;
        let (a, b) = (a.trim().trim_start_matches('-').trim(), b.split(';').next().unwrap_or("").trim());
        (Account::parse(a).is_ok() && Account::parse(b).is_ok()).then(|| (a.to_string(), b.to_string()))
    }).collect()
}

pub fn migrate(text: &str, mapping_note: Option<&str>, today: chrono::NaiveDate) -> Migration {
    let (ptxns, mut problems) = parse_paisa(text);
    let d = defaults();
    let mut mapping: HashMap<String, String> = d.mapping.clone().into_iter().collect();
    if let Some(n) = mapping_note {
        mapping.extend(read_mapping(n));
    }
    let mut used_map: BTreeMap<(String, String), usize> = BTreeMap::new();
    let mut map = |raw: &str| -> Account {
        let n = normalise(raw);
        let to = mapping.get(&n).cloned().unwrap_or_else(|| n.clone());
        *used_map.entry((raw.to_string(), to.clone())).or_default() += 1;
        Account::parse(&to).unwrap_or_else(|_| Account::parse("Expenses:Unknown").unwrap())
    };
    let span = Span { path: "".into(), first: 0, last: 0 };
    let eur = Commodity::parse("EUR").unwrap();

    // Paisa's file is newest first per import; reversed, then a stable sort by date keeps each day's rows in the bank's order.
    // A bank row seen twice is a hand-made copy:
    // only the first, in the file's order, is the bank's.
    let mut seen_rows = BTreeSet::new();
    let copies: BTreeSet<usize> = ptxns.iter().filter(|p| bank_row(&p.comments).is_some() && !seen_rows.insert(p.comments.join("\n"))).map(|p| p.line).collect();
    let mut txns: Vec<Row> = vec![];
    for p in ptxns.iter().rev() {
        let mut postings = vec![];
        let mut fund_units: Option<Decimal> = None;
        let mut recorded_gain = None;
        for (raw, amt) in &p.postings {
            let account = map(raw);
            let amount = match amt {
                Some((q, c)) => match Commodity::parse(c) {
                    Ok(c) => Some(Amount::new(*q, c)),
                    Err(e) => { problems.push(format!("line {}: {e}", p.line)); None }
                },
                None => None,
            };
            if let Some(a) = &amount {
                if a.commodity != eur {
                    fund_units = Some(a.qty);
                }
            }
            postings.push(Posting { account, amount, lot: Lot::None, price: None, assert: None, comment: None, line: 0 });
        }
        // Funds: a purchase is a lot at its cost; a sale books FIFO and the gain is left to the engine.
        if let Some(units) = fund_units {
            let cash: Decimal = postings.iter().filter_map(|x| x.amount.as_ref()).filter(|a| a.commodity == eur && !x_is_gain(&postings, a)).map(|a| a.qty).sum();
            let gain_ix = postings.iter().position(|x| x.account.is_under("Income:Gains"));
            for x in postings.iter_mut() {
                let Some(a) = x.amount.clone() else { continue };
                if a.commodity == eur {
                    continue;
                }
                if units.is_sign_positive() {
                    x.lot = Lot::Total(Amount::new(-cash, eur.clone()));
                } else {
                    x.lot = Lot::Reduce(Reduce::Method(Booking::Fifo));
                    x.price = Some(Price::Total(Amount::new(cash, eur.clone())));
                }
            }
            if units.is_sign_positive() {
                // The cash posting carried the cost; with the lot holding it, the transaction balances as before.
            } else if let Some(g) = gain_ix {
                recorded_gain = postings[g].amount.take().map(|a| a.qty);
                for x in postings.iter_mut().filter(|x| x.amount.is_none() && !x.account.is_under("Income:Gains")) {
                    // Paisa's own empty posting (if any) would now be a second one: it took nothing in a fund txn.
                    x.amount = Some(Amount::new(Decimal::ZERO, eur.clone()));
                }
            }
        }
        // The bank row: its running balance becomes an assertion, its fee a posting.
        let row = bank_row(&p.comments).filter(|_| !copies.contains(&p.line));
        let bank = postings.iter().position(|x| x.account.root() == Root::Assets && x.amount.as_ref().is_some_and(|a| a.commodity == eur)).zip(row);
        let mut bank_info = None;
        if let Some((i, r)) = bank {
            if !r.fee.is_zero() {
                let acct = postings[i].account.clone();
                postings.push(Posting { account: acct, amount: Some(Amount::new(-r.fee, eur.clone())), lot: Lot::None, price: None, assert: None, comment: Some("fee".into()), line: 0 });
                postings.push(Posting { account: Account::parse("Expenses:Bank:Fees").unwrap(), amount: Some(Amount::new(r.fee, eur.clone())), lot: Lot::None, price: None, assert: None, comment: None, line: 0 });
            }
            let last = postings.iter().rposition(|x| x.account == postings[i].account).unwrap();
            postings[last].assert = Some(Amount::new(r.balance, eur.clone()));
            bank_info = Some((postings[i].account.clone(), r));
        }
        // Paisa sometimes predicted the bank account itself as the other side: the row would move nothing.
        if let Some((bank_acct, _)) = &bank_info {
            for x in postings.iter_mut().filter(|x| x.amount.is_none() && &x.account == bank_acct) {
                x.account = Account::parse("Expenses:Unknown").unwrap();
            }
        }
        let unknown = postings.iter().any(|x| x.account.as_str().ends_with(":Unknown"));
        let mut meta = vec![];
        if let Some(first) = p.comments.first() {
            meta.push(("bank".to_string(), first.trim_start_matches(';').trim().to_string()));
        }
        if let Some(g) = recorded_gain {
            meta.push(("paisa-gain".to_string(), format!("{g} EUR")));
        }
        let payee = p.desc.replace(" | ", " / ");
        let mut date = p.date;
        if row.is_some() {
            if let Some((booked, value)) = booked_date(&p.comments) {
                date = booked;
                if value != booked {
                    meta.push(("value-date".to_string(), value.to_string()));
                }
            }
        }
        let t = Txn {
            date,
            status: if unknown { Status::Review } else { Status::Accepted },
            text: payee.clone(),
            payee,
            narration: None,
            tags: BTreeSet::new(),
            id: None,
            meta,
            postings,
            span: span.clone(),
        };
        txns.push((t, bank_info));
    }
    txns.sort_by_key(|t| t.0.date);
    chain_days(&mut txns);

    // Walk in order: running balance per account; a break in the bank's chain gets a visible transaction.
    let mut running: HashMap<Account, Decimal> = HashMap::new();
    let mut asserted: BTreeSet<Account> = BTreeSet::new();
    let mut first_pos: HashMap<Account, usize> = HashMap::new();
    let mut out: Vec<Txn> = vec![];
    let mut gaps = vec![];
    for (t, bank) in txns {
        if let Some((acct, _)) = &bank {
            let before = running.get(acct).copied().unwrap_or_default();
            let mut r = before;
            let mut want = None;
            for (i, a, q) in eur_moves(&t, &eur) {
                if &a == acct {
                    r += q;
                    if let Some(w) = &t.postings[i].assert {
                        want = Some((w.qty, r));
                    }
                }
            }
            if let Some((w, got)) = want {
                let diff = w - got;
                if !diff.is_zero() {
                    let opening = !asserted.contains(acct);
                    let (payee, status, other) = if opening {
                        ("Opening balance (from the bank's running balance)", Status::Accepted, "Equity:Opening")
                    } else {
                        ("Missing from the Paisa import", Status::Review, "Expenses:Unknown")
                    };
                    gaps.push(format!("{} {acct}: {diff} EUR{}", t.date, if opening { " (opening)" } else { "" }));
                    let narration = format!("the bank's running balance before {:?} is {diff} EUR away from the rows", t.payee);
                    let at = if opening { first_pos.get(acct).copied().unwrap_or(out.len()) } else { out.len() };
                    let date = out.get(at).map(|o| o.date).unwrap_or(t.date);
                    out.insert(at, Txn {
                        date,
                        status,
                        text: write::header(payee, Some(&narration), &[], None),
                        payee: payee.into(),
                        narration: Some(narration),
                        tags: BTreeSet::new(),
                        id: None,
                        meta: vec![],
                        postings: vec![
                            Posting { account: acct.clone(), amount: Some(Amount::new(diff, eur.clone())), lot: Lot::None, price: None, assert: None, comment: None, line: 0 },
                            Posting { account: Account::parse(other).unwrap(), amount: None, lot: Lot::None, price: None, assert: None, comment: None, line: 0 },
                        ],
                        span: span.clone(),
                    });
                    *running.entry(acct.clone()).or_default() += diff;
                    if opening {
                        first_pos.values_mut().filter(|p| **p >= at).for_each(|p| *p += 1);
                    }
                }
                asserted.insert(acct.clone());
            }
        }
        for (_, acct, q) in eur_moves(&t, &eur) {
            *running.entry(acct).or_default() += q;
        }
        for x in &t.postings {
            first_pos.entry(x.account.clone()).or_insert(out.len());
        }
        out.push(t);
    }

    // Import ids from the movement itself (matching later statement imports), and the header text.
    let mut ids = Ids::default();
    for t in out.iter_mut() {
        if let Some(bank) = t.postings.iter().find(|x| x.assert.is_some()) {
            let amt = t.postings.iter().filter(|x| x.account == bank.account && x.comment.is_none()).filter_map(|x| x.amount.as_ref()).map(|a| a.qty).sum();
            let id = ids.next(import_id(bank.account.as_str(), t.date, amt, &t.payee));
            t.text = write::header(&t.payee, t.narration.as_deref(), &[], Some(&id));
            t.id = Some(id);
        }
    }

    let mut files = journal_files(&out, today);
    files.extend(account_notes(&out));
    files.extend(fund_notes(&out));
    files.push(("finance/migration/paisa-mapping.md".into(), mapping_file(&used_map)));

    // Checked before anything is written: the same engine reads what would be written.
    let loaded = load_texts(&files);
    let errors = loaded.ledger.diags.iter().filter(|d| d.severity == Severity::Error).count();
    let report = report(&loaded, &problems, &gaps, ptxns.len(), today);
    files.push(("finance/migration/paisa-report.md".into(), report.clone()));
    Migration { files, report, errors }
}

/// What a transaction moves in EUR, per posting in the order written, the empty posting included (it takes the
/// rest, as the engine books it). Lot transactions are left to the engine: their empty posting is the gain.
fn eur_moves(t: &Txn, eur: &Commodity) -> Vec<(usize, Account, Decimal)> {
    let lots = t.postings.iter().any(|x| x.lot != Lot::None);
    let rest: Decimal = t.postings.iter().filter_map(|x| x.amount.as_ref()).filter(|a| &a.commodity == eur).map(|a| a.qty).sum();
    t.postings.iter().enumerate().filter_map(|(i, x)| match &x.amount {
        Some(a) if &a.commodity == eur => Some((i, x.account.clone(), a.qty)),
        None if !lots => Some((i, x.account.clone(), -rest)),
        _ => None,
    }).collect()
}

fn x_is_gain(postings: &[Posting], a: &Amount) -> bool {
    postings.iter().any(|x| x.account.is_under("Income:Gains") && x.amount.as_ref() == Some(a))
}

/// Same-day rows of one bank account in the order their running balances chain (Paisa kept a day's rows in any
/// order): row B follows row A when B's balance before it equals A's balance after.
fn chain_days(txns: &mut [Row]) {
    let mut last: HashMap<Account, Decimal> = HashMap::new(); // the balance the previous day ended on
    let mut i = 0;
    while i < txns.len() {
        let day = txns[i].0.date;
        let end = txns[i..].iter().position(|t| t.0.date != day).map(|k| i + k).unwrap_or(txns.len());
        let accounts: BTreeSet<Account> = txns[i..end].iter().filter_map(|t| t.1.as_ref().map(|b| b.0.clone())).collect();
        for acct in accounts {
            let idx: Vec<usize> = (i..end).filter(|k| txns[*k].1.as_ref().is_some_and(|b| b.0 == acct)).collect();
            let after = |k: usize| txns[k].1.as_ref().unwrap().1.balance;
            let before = |k: usize| after(k) - txns[k].0.postings.iter().filter(|x| x.account == acct).filter_map(|x| x.amount.as_ref()).map(|a| a.qty).sum::<Decimal>();
            let mut left = idx.clone();
            let mut order = vec![];
            while !left.is_empty() {
                // A start: the row that begins at yesterday's balance, else one no other row leads into, else the first.
                let s = left.iter().position(|&k| last.get(&acct) == Some(&before(k)))
                    .or_else(|| left.iter().position(|&k| !left.iter().any(|&o| o != k && after(o) == before(k))))
                    .unwrap_or(0);
                let mut k = left.remove(s);
                order.push(k);
                while let Some(n) = left.iter().position(|&o| before(o) == after(k)) {
                    k = left.remove(n);
                    order.push(k);
                }
                last.insert(acct.clone(), after(k));
            }
            let rows: Vec<_> = order.iter().map(|k| txns[*k].clone()).collect();
            for (slot, row) in idx.iter().zip(rows) {
                txns[*slot] = row;
            }
        }
        i = end;
    }
}

fn journal_files(txns: &[Txn], today: chrono::NaiveDate) -> Vec<(String, String)> {
    let mut by_year: BTreeMap<i32, String> = BTreeMap::new();
    for t in txns {
        use chrono::Datelike;
        let f = by_year.entry(t.date.year()).or_insert_with(|| format!("; Migrated from Paisa (~/.sync/paisa/main.ledger) on {today} by the finance plugin: finance/migration/paisa-report.md\n"));
        *f = write::append(f, t);
    }
    by_year.into_iter().map(|(y, s)| (format!("finance/journal/{y}.fin"), s)).collect()
}

fn account_notes(txns: &[Txn]) -> Vec<(String, String)> {
    let mut first: BTreeMap<Account, chrono::NaiveDate> = BTreeMap::new();
    let mut commodities: BTreeMap<Account, BTreeSet<String>> = BTreeMap::new();
    for t in txns {
        for x in &t.postings {
            if x.account.root().needs_note() {
                first.entry(x.account.clone()).or_insert(t.date);
                if let Some(a) = &x.amount {
                    let c = if x.lot == Lot::None { a.commodity.to_string() } else { format!("lot:{}", a.commodity) };
                    commodities.entry(x.account.clone()).or_default().insert(c);
                }
            }
        }
    }
    first.into_iter().map(|(a, opened)| {
        let parts: Vec<&str> = a.as_str().split(':').skip(1).collect();
        let name = parts.join(" ");
        let institution = ["Unicaja", "Revolut", "Desjardins", "Openbank"].into_iter().find(|i| a.as_str().contains(i));
        let cs = commodities.get(&a).cloned().unwrap_or_default();
        let mut s = format!("---\ntype: finance-account\naccount: {a}\n");
        if let Some(i) = institution {
            let _ = writeln!(s, "institution: \"[[{i}]]\"");
        }
        if cs.len() == 1 && !cs.iter().next().unwrap().starts_with("lot:") {
            let _ = writeln!(s, "currency: {}", cs.iter().next().unwrap());
        } else {
            s.push_str("booking: fifo\n");
        }
        let _ = writeln!(s, "opened: {opened}");
        let _ = writeln!(s, "aliases: [{}]", parts.iter().map(|p| p.to_lowercase()).collect::<Vec<_>>().join(", "));
        if let Some(presets) = defaults().importers.get(a.as_str()) {
            let _ = writeln!(s, "import: [{}]", presets.join(", "));
        }
        let _ = write!(s, "---\n\n# {name}\n\nMade by the Paisa migration. Its ledger account is `{a}`.\n");
        (format!("finance/accounts/{name}.md"), s)
    }).collect()
}

fn fund_notes(txns: &[Txn]) -> Vec<(String, String)> {
    // A fund's code may look like a currency (DVE): what marks it is the lot the migration gave it.
    let syms: BTreeSet<Commodity> = txns.iter().flat_map(|t| &t.postings).filter(|x| x.lot != Lot::None).filter_map(|x| x.amount.as_ref()).map(|a| a.commodity.clone()).collect();
    syms.into_iter().map(|c| {
        let d = defaults();
        let known = d.funds.get(c.as_str());
        let name = known.map_or(c.as_str(), |k| k.name.as_str());
        let isin = known.map(|k| format!("isin: {}\n", k.isin)).unwrap_or_default();
        (format!("finance/assets/{name}.md"), format!("---\ntype: finance-commodity\nsymbol: {c}\nname: {name}\nkind: fund\n{isin}booking: fifo\nprecision: 6\n---\n\n# {name}\n\nA fund held at Unicaja, made by the Paisa migration.\n"))
    }).collect()
}

fn mapping_file(used: &BTreeMap<(String, String), usize>) -> String {
    let mut s = String::from("---\ntype: finance-mapping\n---\n\n# Paisa → finance: account mapping\n\nEdit a line and run the migration again; every Paisa name (left) becomes the account on the right. Names are first capitalised (so `expenses:Unknown` and `Expenses:Unknown` are one).\n\n```finance-mapping\n");
    let mut seen = BTreeSet::new();
    for ((from, to), n) in used {
        if seen.insert((from, to)) {
            let _ = writeln!(s, "{from} → {to}    ; {n} postings");
        }
    }
    s.push_str("```\n");
    s
}

fn report(l: &crate::load::Loaded, problems: &[String], gaps: &[String], read: usize, today: chrono::NaiveDate) -> String {
    let led = &l.ledger;
    let errors: Vec<_> = led.diags.iter().filter(|d| d.severity == Severity::Error).collect();
    let warnings: Vec<_> = led.diags.iter().filter(|d| d.severity == Severity::Warning).collect();
    let review = led.txns.iter().filter(|b| b.txn.status == Status::Review).count();
    let asserts = led.txns.iter().flat_map(|b| &b.txn.postings).filter(|p| p.assert.is_some()).count();
    let mut s = format!("---\ntype: finance-report\ndate: {today}\n---\n\n# The Paisa migration\n\n");
    let _ = writeln!(s, "- **Read:** {read} Paisa transactions.");
    let _ = writeln!(s, "- **Written:** {} transactions, {review} of them to review (`!`).", led.txns.len());
    let _ = writeln!(s, "- **Bank balance assertions:** {asserts}.");
    let _ = writeln!(s, "- **Engine check:** {} errors, {} warnings.\n", errors.len(), warnings.len());
    let _ = writeln!(s, "## Gaps in the bank's running balance ({})\n", gaps.len());
    s.push_str("Each is a `!` transaction in the journal: a row Paisa skipped or never imported. It shows up in Review.\n\n");
    for g in gaps {
        let _ = writeln!(s, "- {g}");
    }
    s.push_str("\n## Fund gains: recorded by Paisa vs computed (FIFO)\n\n| date | sale | Paisa | computed |\n|---|---|---|---|\n");
    for b in &led.txns {
        if let Some(rec) = b.txn.meta("paisa-gain") {
            let computed: Vec<String> = b.postings.iter().filter(|p| p.implied).map(|p| write::amount(&p.units)).collect();
            let _ = writeln!(s, "| {} | {} | {rec} | {} |", b.txn.date, b.txn.payee, computed.join(", "));
        }
    }
    if !problems.is_empty() {
        let _ = writeln!(s, "\n## Lines not read ({})\n", problems.len());
        for p in problems {
            let _ = writeln!(s, "- {p}");
        }
    }
    let _ = writeln!(s, "\n## Engine findings ({})\n", led.diags.len());
    for d in led.diags.iter().take(200) {
        let _ = writeln!(s, "- {d}");
    }
    s
}

#[cfg(test)]
mod tests {
    #[test]
    fn the_defaults_read() {
        let d = super::defaults();
        assert_eq!(d.funds["DVF"].isin, "ES0175316019");
        assert!(d.mapping.contains_key("Assets:Funds"));
    }

    use super::*;

    const SAMPLE: &str = "\
; (2) 2026-01-31 15:14:58 (2026-01-31 15:14:58) C: Coffee (Card Payment)
;\t-4.00 EUR (6.00 EUR) fee 0.50 EUR
2026/01/31 Coffee
    expenses:Unknown
    Assets:Checking:Revolut                    -4.00 EUR

; (1) 2026-01-31 01:24:30 (2026-01-31 01:24:30) C: Topup (Topup)
;\t10.50 EUR (10.50 EUR) fee 0.00 EUR
2026/01/31 Topup
    Expenses:Transfers
    Assets:Checking:Revolut                    10.50 EUR

; (M) 09/04/2025 C: SUSCRIPCI DUNAS VALOR EQUILIBR
2024/08/08 SUSCRIPCI DUNAS VALOR EQUILIBR
    Assets:funds                           82.985142 DVE
    Assets:Checking:unicaja                 -1000.00 EUR

; (427) ED-12/04/2025) VD-11/04/2025 C: REEMBOLSO
;\t1,039.72 EUR (5,039.72 EUR) N-905 O-7241
2025/04/09 REEMBOLSO DUNAS VALOR EQUILIBR
    Assets:funds                         -82.985142 DVE
    Income:CapitalGains:funds\t\t\t\t  -39.72 EUR
    Assets:Checking:unicaja                 1,039.72 EUR
";

    #[test]
    fn migrates_chains_and_books_funds() {
        let m = migrate(SAMPLE, None, chrono::NaiveDate::from_ymd_opt(2026, 10, 21).unwrap());
        assert_eq!(m.errors, 0, "{}", m.report);
        let j2026 = &m.files.iter().find(|f| f.0 == "finance/journal/2026.fin").unwrap().1;
        // Same day, file newest-first: the topup comes first so the balances chain; the fee became a posting.
        assert!(j2026.find("Topup").unwrap() < j2026.find("Coffee").unwrap(), "{j2026}");
        assert!(j2026.contains("Expenses:Bank:Fees"), "{j2026}");
        assert!(j2026.contains("! Coffee"), "{j2026}");
        assert!(j2026.contains("Assets:Transfers"), "{j2026}");
        // Unicaja's first balance (5039.72 after +1039.72, from 0 - 1000) needs an opening of 5000.
        assert!(m.report.contains("Assets:Unicaja:Cuenta: 5000.00 EUR (opening)"), "{}", m.report);
        assert!(m.report.contains("| -39.72 EUR | -39.72 EUR |"), "{}", m.report);
        assert!(m.files.iter().any(|f| f.0 == "finance/assets/Dunas Valor Equilibrado.md"));
        assert!(m.files.iter().any(|f| f.0 == "finance/accounts/Unicaja Cuenta.md"));
    }

    // From the real ledger: a Cash opening written under a copy of the bank row's comment became a second bank row.
    #[test]
    fn a_copied_bank_row_is_not_the_bank() {
        let text = "\
; (2) ED-14/01/2026) VD-14/01/2026 C: CASH OUT
;\t230.00 EUR (1,230.00 EUR) N-2 O-7241
2026/01/14 CASH OUT
    Assets:Checking:Cash
    Assets:Checking:unicaja                   230.00 EUR

; (2) ED-14/01/2026) VD-14/01/2026 C: CASH OUT
;\t230.00 EUR (1,230.00 EUR) N-2 O-7241
2026/01/14 Cash Opening balance
    Equity:OpeningBalance
    Assets:Checking:Cash                   230.00 EUR
";
        let m = migrate(text, None, chrono::NaiveDate::from_ymd_opt(2026, 10, 21).unwrap());
        assert_eq!(m.errors, 0, "{}", m.report);
        assert!(m.report.contains("Assets:Unicaja:Cuenta: 1000.00 EUR (opening)"), "{}", m.report);
        assert!(!m.report.contains("Assets:Cash: "), "Cash got a bank opening: {}", m.report);
    }

    #[test]
    fn the_mapping_note_overrides() {
        let m = read_mapping("```finance-mapping\nExpenses:Transfers → Expenses:Gifts    ; 3 postings\nnot a line\n```");
        assert_eq!(m, vec![("Expenses:Transfers".to_string(), "Expenses:Gifts".to_string())]);
    }
}
