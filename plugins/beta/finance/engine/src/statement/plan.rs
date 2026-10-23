//! Statements → the transactions they add (DESIGN-finance-import.md, "Planning"). A row is already in the ledger
//! when its import id is, or when a posting on its account moves the same amount within a few days (the same payment
//! read before from Paisa, Actual or another file, whatever the bank called it then). Every other row becomes a `!`
//! transaction, categorised from the ledger's history, with the bank's balance at the day's end as an assertion.
use super::{account_for, FundOp, Move, Row, Statement};
use crate::book::Ledger;
use crate::import::{import_id, Ids};
use crate::model::*;
use crate::notes::Notes;
use crate::parse::parse_file;
use chrono::NaiveDate;
use rust_decimal::Decimal;
use std::collections::{BTreeMap, HashMap, HashSet};

/// How far apart the same movement's dates may be in two sources (booked vs started, a weekend).
const DAYS: i64 = 3;
/// The last pass's window, for a movement that settles late (a fund subscription charged a week after its date):
/// taken only when no more postings fit than rows wait for them, so a recurring small amount is never matched this far.
const LATE_DAYS: i64 = 10;

#[derive(Debug)]
pub struct Planned {
    pub statement: Statement,
    pub account: Account,
    /// The statement's note (and archived file) name, which its transactions link.
    pub note: String,
    /// New transactions as the journal's text, in date order.
    pub new: Vec<(NaiveDate, String)>,
    pub known: usize,
    pub ignored: usize,
    /// Rows that became the other side of a transfer another statement's row made.
    pub paired: usize,
    /// The statement's balances against the ledger with the new transactions.
    pub checks: Vec<Check>,
    /// Rows that could not be made into a transaction, with why.
    pub problems: Vec<String>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct Check {
    pub what: &'static str,
    pub date: NaiveDate,
    pub bank: Decimal,
    pub ledger: Decimal,
}

/// One posting on a real account: what a row is matched against.
#[derive(Debug, Clone)]
struct Seen {
    account: Account,
    commodity: Commodity,
    date: NaiveDate,
    qty: Decimal,
    /// The statements whose rows it already stands for: each statement matches a posting once, but overlapping
    /// statements (two downloads of the same months) all match it.
    taken: Vec<usize>,
    /// The draft it belongs to, when made by this batch.
    draft: Option<usize>,
    /// The ledger transaction (its index) this posting is in, when that one is still to review with its other side
    /// unknown: a row from another account's file may then be that other side, and complete it.
    fixable: Option<usize>,
    /// A row's own posting on the statement's account (not a counterpart), with the preset that read it: another
    /// statement of that preset matches it only on the same date. Two downloads from one bank print the same dates; a
    /// neighbouring month's same coffee is another coffee. Another source (Actual's feed) may date it otherwise.
    own: Option<String>,
}

/// A new transaction before it is text: a later row (a card's top-up) may still add its note.
#[derive(Debug)]
struct Draft {
    date: NaiveDate,
    payee: String,
    narration: Option<String>,
    id: String,
    meta: Vec<(String, String)>,
    /// The counter posting first (when there is one), then the fee, then the statement account's.
    postings: Vec<String>,
    plan: usize,
    /// What it moves on the statement's account, and whether its other side is still unknown.
    own: Account,
    commodity: Commodity,
    qty: Decimal,
    /// The bank's fee, a posting of its own: an exchange's price leaves it out.
    fee: Decimal,
    unknown: bool,
    text: String,
    /// Folded into another draft (a transfer's other side).
    merged: bool,
}

/// Two new rows that are one movement between the user's own accounts: one account loses what another gains, within
/// DAYS, neither's other side known. A same-day pair is taken as one; a pair days apart needs the text to say so
/// (a transfer word, or the other account's name). The outflow's transaction takes the inflow's posting.
/// Does a bank's text say it moves money to or from `other` (a transfer word, or that account's name)?
/// The transfer words (vocabulary.toml), folded as the texts are.
fn transfer_words(notes: &Notes) -> Vec<String> {
    crate::classify::transfer_words(notes).iter().map(|w| super::extract::loose(w)).collect()
}

fn says_transfer(text: &str, other: &Account, notes: &Notes, words: &[String]) -> bool {
    let t = super::extract::loose(text);
    let mut names: Vec<String> = notes.accounts.get(other).map(|x| x.aliases.clone()).unwrap_or_default();
    names.extend(other.as_str().split(':').skip(1).map(str::to_string));
    words.iter().any(|w| t.contains(w.as_str())) || names.iter().map(|x| super::extract::loose(x)).filter(|x| x.len() >= 4).any(|n| t.contains(n.as_str()))
}

fn pair_transfers(drafts: &mut [Draft], notes: &Notes) {
    let words = transfer_words(notes);
    let says = |text: &str, other: &Account| says_transfer(text, other, notes, &words);
    let mut pairs: Vec<(i64, usize, usize)> = vec![];
    for (i, a) in drafts.iter().enumerate().filter(|(_, d)| d.unknown && d.qty < Decimal::ZERO) {
        for (j, b) in drafts.iter().enumerate().filter(|(_, d)| d.unknown && d.qty > Decimal::ZERO) {
            let gap = (b.date - a.date).num_days().abs();
            if a.own != b.own && a.commodity == b.commodity && a.qty == -b.qty && gap <= DAYS && (gap == 0 || says(&a.text, &b.own) || says(&b.text, &a.own)) {
                pairs.push((gap, i, j));
            }
        }
    }
    pairs.sort();
    for (gap, i, j) in pairs {
        if drafts[i].merged || drafts[j].merged || !drafts[i].unknown || !drafts[j].unknown {
            continue;
        }
        let b = &mut drafts[j];
        b.merged = true;
        // Its balance is the bank's at its own date: on another date it would not hold.
        let mut lines: Vec<String> = b.postings[1..].iter().map(|l| if gap == 0 { l.clone() } else { l.split(" = ").next().unwrap_or(l).to_string() }).collect();
        let (bank, note, payee) = (b.meta.iter().find(|m| m.0 == "bank").map(|m| m.1.clone()), b.narration.clone(), b.payee.clone());
        let a = &mut drafts[i];
        a.postings.remove(0);
        a.postings.append(&mut lines);
        a.unknown = false;
        a.narration.get_or_insert(note.unwrap_or(payee));
        if let Some(bank) = bank {
            a.meta.insert(1, ("bank-to".into(), bank));
        }
    }
}

/// Two new rows of one account that are one currency exchange (both pockets of a Revolut file): one commodity leaves
/// what another arrives for, a day apart at most, both saying so, both other sides parked in a holding account. The
/// outflow's transaction takes the inflow's postings: its units priced at what left (the outflow's fee apart), and its
/// fee as postings of their own.
fn pair_exchanges(drafts: &mut [Draft], holding: &[Account], words: &[String]) {
    let parked = |d: &Draft| d.postings.first().is_some_and(|l| holding.iter().any(|h| h.as_str() == l));
    let fits = |d: &Draft| !d.merged && parked(d) && says_exchange(&d.text, words);
    let mut pairs: Vec<(i64, usize, usize)> = vec![];
    for (i, a) in drafts.iter().enumerate().filter(|(_, d)| d.qty < Decimal::ZERO && fits(d)) {
        for (j, b) in drafts.iter().enumerate().filter(|(_, d)| d.qty > Decimal::ZERO && fits(d)) {
            let gap = (b.date - a.date).num_days().abs();
            if a.own == b.own && a.commodity != b.commodity && gap <= 1 {
                pairs.push((gap, i, j));
            }
        }
    }
    pairs.sort();
    for (gap, i, j) in pairs {
        if drafts[i].merged || drafts[j].merged {
            continue;
        }
        let price = amount(-(drafts[i].qty + drafts[i].fee), &drafts[i].commodity);
        let b = &mut drafts[j];
        b.merged = true;
        // Its balance holds at its own date only.
        let assert = b.postings.last().and_then(|l| l.split_once(" = ")).map(|x| format!(" = {}", x.1)).filter(|_| gap == 0).unwrap_or_default();
        let units = line(&b.own, &amount(b.qty + b.fee, &b.commodity));
        let mut lines = if b.fee.is_zero() {
            vec![format!("{units} @@ {price}{assert}")]
        } else {
            // The fee's own posting is already among its lines; the account gives it back after the units arrive.
            let fee = b.postings[1..b.postings.len() - 1].to_vec();
            [vec![format!("{units} @@ {price}")], fee, vec![format!("{}{assert}", line(&b.own, &amount(-b.fee, &b.commodity)))]].concat()
        };
        let (bank, note) = (b.meta.iter().find(|m| m.0 == "bank").map(|m| m.1.clone()), b.narration.clone());
        let a = &mut drafts[i];
        a.postings.remove(0);
        a.postings.append(&mut lines);
        a.unknown = false;
        if let Some(n) = note {
            a.narration.get_or_insert(n);
        }
        // Both pockets' text is usually the same ("Exchanged to CAD"): said once.
        if let Some(bank) = bank.filter(|b| !a.meta.iter().any(|m| m.0 == "bank" && &m.1 == b)) {
            a.meta.insert(1, ("bank-to".into(), bank));
        }
    }
}

/// The payee a bank's text names, its reference numbers dropped (`BOLT.EU/O/2609160503` → `BOLT.EU`,
/// `AUCHAN 1076M` → `AUCHAN`). Shape-based: a word with four digits or more is a reference.
pub fn payee(desc: &str) -> String {
    // A bank's type prefix (`/TXT/`, `/Txt/`) is no part of the name.
    let desc = match desc.strip_prefix('/').and_then(|r| r.split_once('/')) {
        Some((tag, rest)) if tag.len() <= 4 && tag.chars().all(char::is_alphabetic) => rest.trim(),
        _ => desc,
    };
    let cut = desc.find(['*', '/']).filter(|&i| desc[..i].trim().chars().count() >= 3).map_or(desc, |i| &desc[..i]);
    let words: Vec<String> = cut.split_whitespace().filter_map(|w| {
        if w.chars().filter(char::is_ascii_digit).count() < 4 {
            return Some(w.to_string());
        }
        // `RYANAIR0000000Z53ZYJ`: a name glued to its reference keeps the name.
        let lead: String = w.chars().take_while(|c| c.is_alphabetic() || *c == '.').collect();
        (lead.chars().count() >= 3).then_some(lead)
    }).collect();
    let p = words.join(" ");
    if p.is_empty() { desc.split_whitespace().collect::<Vec<_>>().join(" ") } else { p }
}

fn key(payee_text: &str) -> String {
    super::extract::loose(&payee(payee_text))
}

/// The ids in `ignored.md`'s ```finance-ignored fence: rows never to import again.
pub fn ignored(text: &str) -> HashSet<String> {
    let Some(start) = text.find("```finance-ignored") else { return HashSet::new() };
    text[start..].lines().skip(1).take_while(|l| !l.starts_with("```"))
        .filter_map(|l| l.split(';').next().map(str::trim).filter(|s| !s.is_empty()).map(|s| s.trim_start_matches('^').to_string())).collect()
}

/// What history says a payee's movements are: the other account most used with it, the latest on a tie.
/// (the statement's account, or any; the payee's key) → each other account: how often, and last when.
type Uses = HashMap<(Option<Account>, String), BTreeMap<Account, (usize, NaiveDate)>>;

struct History(Uses);

impl History {
    fn of(ledger: &Ledger) -> History {
        let mut h: Uses = HashMap::new();
        for b in ledger.txns.iter().filter(|b| b.txn.status == Status::Accepted) {
            let t = &b.txn;
            let real: Vec<&Account> = t.postings.iter().map(|p| &p.account).filter(|a| a.root().needs_note()).collect();
            let others = |own: &Account| -> Vec<Account> {
                let mut o: Vec<Account> = t.postings.iter().map(|p| p.account.clone())
                    .filter(|a| a != own && !a.is_under("Expenses:Unknown") && !a.is_under("Expenses:Bank:Fees") && !a.is_under("Income:Gains")).collect();
                o.dedup();
                o
            };
            for own in real {
                if let [one] = &others(own)[..] {
                    let k = key(&t.payee);
                    for scope in [Some(own.clone()), None] {
                        let e = h.entry((scope, k.clone())).or_default().entry(one.clone()).or_insert((0, t.date));
                        e.0 += 1;
                        e.1 = e.1.max(t.date);
                    }
                }
            }
        }
        History(h)
    }

    fn counter(&self, account: &Account, desc: &str) -> Option<Account> {
        let k = key(desc);
        let pick = |m: &BTreeMap<Account, (usize, NaiveDate)>| m.iter().max_by_key(|(_, (n, d))| (*n, *d)).map(|(a, _)| a.clone());
        self.0.get(&(Some(account.clone()), k.clone())).and_then(pick).or_else(|| self.0.get(&(None, k)).and_then(pick)).filter(|a| a != account)
    }
}

/// The commodity a fund row names: by ISIN, else the note whose name the bank's (truncated) words begin.
fn fund_commodity(notes: &Notes, name: &str, isin: Option<&str>) -> Option<Commodity> {
    if let Some(c) = isin.and_then(|i| notes.commodities.values().find(|n| n.isin.as_deref() == Some(i))) {
        return Some(c.symbol.clone());
    }
    let words = |s: &str| super::extract::loose(s).split(' ').filter(|w| w.chars().all(char::is_alphanumeric) && !w.is_empty()).map(str::to_string).collect::<Vec<_>>();
    let bank: Vec<String> = words(name).into_iter().filter(|w| w != "eur" && w != "r").collect();
    let mut hits = notes.commodities.values().filter(|n| {
        let mine = words(n.name.as_deref().unwrap_or(n.symbol.as_str()));
        !bank.is_empty() && bank.len() <= mine.len() && bank.iter().zip(&mine).all(|(b, m)| m.starts_with(b.as_str()))
    });
    match (hits.next(), hits.next()) {
        (Some(one), None) => Some(one.symbol.clone()),
        _ => None,
    }
}

/// The account a fund's cash comes from and goes to: the real account its earlier operations used most.
fn fund_cash(ledger: &Ledger, fund: &Account) -> Option<Account> {
    let mut n: BTreeMap<Account, usize> = BTreeMap::new();
    for b in ledger.txns.iter().filter(|b| b.txn.postings.iter().any(|p| &p.account == fund)) {
        for p in b.txn.postings.iter().filter(|p| &p.account != fund && p.account.root().needs_note()) {
            *n.entry(p.account.clone()).or_default() += 1;
        }
    }
    n.into_iter().max_by_key(|(_, c)| *c).map(|(a, _)| a)
}

/// A currency amount with its cents (`-6.90 EUR`, as banks print it), whatever the file wrote.
fn amount(q: Decimal, c: &Commodity) -> String {
    let mut q = q.normalize();
    if c.looks_like_currency() && q.scale() < 2 {
        q.rescale(2);
    }
    crate::write::amount(&Amount::new(q, c.clone()))
}

fn line(account: &Account, amt: &str) -> String {
    format!("{account}  {amt}")
}

/// A transaction of the ledger, still to review, whose waiting side a statement showed: one of the user's accounts, or
/// the other currency of an exchange.
#[derive(Debug, Clone)]
pub struct Completion {
    /// Its index in `ledger.txns`.
    pub txn: usize,
    pub edit: crate::edit::Edit,
}

/// Does the text say it is a currency exchange (vocabulary.toml `exchange_words`)?
fn says_exchange(text: &str, words: &[String]) -> bool {
    let t = super::extract::loose(text);
    words.iter().any(|w| t.contains(w.as_str()))
}

/// The ledger's other leg of an exchange this row is one side of: a transaction to review on the same account, a day
/// apart at most, moving the other way in another commodity, its other side waiting in a holding account. The edit puts
/// the row's units there, priced at what that leg moved (its fee apart); the row's own fee stays a posting of its own.
#[allow(clippy::too_many_arguments)]
fn exchange_leg(ledger: &Ledger, holding: &[Account], used: &HashSet<usize>, account: &Account, date: NaiveDate, c: &Commodity, gross: Decimal, fee: Decimal) -> Option<Completion> {
    ledger.txns.iter().enumerate().find_map(|(i, b)| {
        let t = &b.txn;
        if used.contains(&i) || t.status != Status::Review || (t.date - date).num_days().abs() > 1 {
            return None;
        }
        let [own] = t.postings.iter().filter(|p| &p.account == account).collect::<Vec<_>>()[..] else { return None };
        let [wait] = t.postings.iter().filter(|p| holding.contains(&p.account)).collect::<Vec<_>>()[..] else { return None };
        let leg = own.amount.as_ref()?;
        // What the waiting posting holds: every other posting in the leg's commodity, negated.
        let others: Option<Vec<&Amount>> = t.postings.iter().filter(|p| p.account != wait.account).map(|p| p.amount.as_ref().filter(|a| a.commodity == leg.commodity)).collect();
        let held = -others?.iter().map(|a| a.qty).sum::<Decimal>();
        let parked_ok = wait.amount.as_ref().is_none_or(|w| w.commodity == leg.commodity && w.qty == held);
        if leg.commodity == *c || (leg.qty < Decimal::ZERO) == (gross < Decimal::ZERO) || !parked_ok || held.is_zero() {
            return None;
        }
        let mut parts = vec![crate::edit::Part::Priced(account.clone(), Amount::new(gross, c.clone()), Amount::new(held.abs(), leg.commodity.clone()))];
        if !fee.is_zero() {
            parts.push(crate::edit::Part::Amount(account.clone(), Amount::new(-fee, c.clone())));
            parts.push(crate::edit::Part::Amount(Account::parse("Expenses:Bank:Fees").ok()?, Amount::new(fee, c.clone())));
        }
        Some(Completion { txn: i, edit: crate::edit::Edit { split: Some((wait.account.clone(), parts)), ..Default::default() } })
    })
}

pub struct Plan {
    pub planned: Vec<Planned>,
    pub completions: Vec<Completion>,
    pub errors: Vec<String>,
}

/// `name` gives each statement's note its name (unique in the vault).
pub fn plan(ledger: &Ledger, notes: &Notes, ignored: &HashSet<String>, mut statements: Vec<Statement>, name: &mut dyn FnMut(&Statement, &Account) -> String) -> Plan {
    statements.sort_by_key(|s| s.order);
    let mut errors = vec![];
    let history = History::of(ledger);
    let classifier = crate::classify::Classifier::new(ledger, notes);
    let words = transfer_words(notes);
    let exchange = crate::classify::exchange_words(notes).iter().map(|w| super::extract::loose(w)).collect::<Vec<_>>();
    let holding = crate::classify::holding_accounts(notes);
    let mut exchanged: HashSet<usize> = HashSet::new();
    let known_ids: HashSet<&str> = ledger.txns.iter().filter_map(|b| b.txn.id.as_deref()).collect();
    let unknown = Account::parse("Expenses:Unknown").unwrap();
    let mut pool: Vec<Seen> = ledger.txns.iter().enumerate().flat_map(|(i, b)| {
        let open = b.txn.status == Status::Review && b.txn.postings.iter().filter(|p| p.account == unknown).count() == 1;
        b.postings.iter().filter(|p| p.account.root().needs_note()).map(move |p| Seen {
            account: p.account.clone(), commodity: p.units.commodity.clone(), date: b.txn.date, qty: p.units.qty, taken: vec![], draft: None, own: None,
            fixable: open.then_some(i),
        })
    }).collect();
    let mut completions: Vec<Completion> = vec![];
    let mut drafts: Vec<Draft> = vec![];
    let mut ids = Ids::default();
    let mut out: Vec<Planned> = vec![];
    for st in statements {
        let account = match account_for(&st, notes) {
            Ok(a) => a,
            Err(e) => {
                errors.push(e);
                continue;
            }
        };
        let pi = out.len();
        let note = name(&st, &account);
        let mut p = Planned { note, account: account.clone(), new: vec![], known: 0, ignored: 0, paired: 0, checks: vec![], problems: vec![], statement: st };
        // What each row moves on the statement's account.
        let moves: Vec<Option<(Commodity, Decimal)>> = p.statement.rows.iter().map(|r| match &r.kind {
            Move::Cash { amount, fee } => Some((p.statement.currency.clone(), amount - fee)),
            Move::Fund { fund, isin, units, op, .. } => fund_commodity(notes, fund, isin.as_deref()).map(|c| (c, if *op == FundOp::Buy { *units } else { -*units })),
        }).collect();
        // A row with a fee may stand in the ledger as its gross amount plus the fee as a posting of its own (how an
        // exchange with a fee was booked): that gross matches it too.
        let gross: Vec<Option<Decimal>> = p.statement.rows.iter().map(|r| match &r.kind {
            Move::Cash { amount, fee } if !fee.is_zero() => Some(*amount),
            _ => None,
        }).collect();
        let row_ids: Vec<String> = p.statement.rows.iter().zip(&moves).map(|(r, m)| {
            let q = m.as_ref().map_or(Decimal::ZERO, |m| m.1);
            ids.next(import_id(account.as_str(), r.booked, q, &r.description))
        }).collect();
        let mut done = vec![false; p.statement.rows.len()];
        // Rows that matched another source's new transaction of this account, which takes this row's date.
        let mut adopted: Vec<(usize, usize)> = vec![];
        // By id, then the same day, then within DAYS, then a lone fit within LATE_DAYS: the closest match wins, and
        // each posting is matched once per statement.
        for pass in 0..4 {
            for (i, r) in p.statement.rows.iter().enumerate() {
                let Some((c, q)) = &moves[i] else { continue };
                if done[i] {
                    continue;
                }
                if pass == 0 {
                    if ignored.contains(&row_ids[i]) {
                        done[i] = true;
                        p.ignored += 1;
                        continue;
                    }
                    if !known_ids.contains(row_ids[i].as_str()) {
                        continue;
                    }
                }
                let window = [0, 0, DAYS, LATE_DAYS][pass];
                // How far a posting is from the row: from its booked date, or its value date (one source dates a card
                // payment by the purchase, another by the booking).
                let same_bank = |s: &Seen| s.own.as_deref() == Some(p.statement.preset.as_str());
                let far = |s: &Seen| { let b = (s.date - r.booked).num_days().abs(); if same_bank(s) { b } else { r.value.map_or(b, |v| b.min((s.date - v).num_days().abs())) } };
                let fits: Vec<usize> = pool.iter().enumerate()
                    .filter(|(_, s)| !s.taken.contains(&pi) && s.account == account && &s.commodity == c && (s.qty == *q || gross[i] == Some(s.qty)) && far(s) <= if same_bank(s) { 0 } else { window })
                    .map(|(k, _)| k).collect();
                // Late: as many fits as this statement's rows of that amount still waiting near them (two €2500
                // subscriptions charged together), never more.
                let waiting = (0..p.statement.rows.len()).filter(|&j| !done[j] && moves[j].as_ref() == Some(&(c.clone(), *q)) && (p.statement.rows[j].booked - r.booked).num_days().abs() <= LATE_DAYS).count();
                let hit = if pass == 3 && fits.len() > waiting { None } else { fits.into_iter().min_by_key(|&k| far(&pool[k])) };
                if let Some(k) = hit {
                    pool[k].taken.push(pi);
                    if let (Some(d), Some(n)) = (pool[k].draft, &r.note) {
                        drafts[d].narration.get_or_insert_with(|| n.clone());
                    }
                    // A bank file with balances dates the movement as its balances follow it; the other source's date
                    // (Actual's: the purchase) stays as the value date.
                    if let Some(d) = pool[k].draft.filter(|&d| r.balance.is_some() && drafts[d].own == account && pool[k].own.is_some()) {
                        let old = drafts[d].date;
                        if old != r.booked {
                            drafts[d].date = r.booked;
                            pool[k].date = r.booked;
                            if !drafts[d].meta.iter().any(|m| m.0 == "value-date") {
                                drafts[d].meta.insert(1, ("value-date".into(), old.to_string()));
                            }
                        }
                        adopted.push((i, d));
                    }
                }
                if hit.is_some() || pass == 0 {
                    done[i] = true;
                    p.known += 1;
                }
            }
        }
        // The day's last row carries the bank's balance, when the rows up to it add up to it.
        let mut chain_ok = vec![false; p.statement.rows.len()];
        let mut prev = p.statement.opening;
        for (i, (r, m)) in p.statement.rows.iter().zip(&moves).enumerate() {
            let q = m.as_ref().filter(|m| m.0 == p.statement.currency).map(|m| m.1);
            chain_ok[i] = matches!((prev, q, r.balance), (Some(a), Some(q), Some(b)) if a + q == b) || (prev.is_none() && r.balance.is_some());
            prev = r.balance.or(prev);
        }
        let rows = p.statement.rows.clone();
        let day_end = |i: usize| rows.get(i + 1).is_none_or(|n| n.booked != rows[i].booked)
            && rows.iter().enumerate().filter(|(j, x)| x.booked == rows[i].booked && *j <= i).all(|(j, _)| chain_ok[j]);
        // An adopted transaction carries the day's balance when its row ends the day.
        for &(i, d) in &adopted {
            if let (true, Some(b)) = (day_end(i), rows[i].balance) {
                if let Some(last) = drafts[d].postings.last_mut().filter(|l| !l.contains(" = ")) {
                    last.push_str(&format!(" = {}", amount(b, &p.statement.currency)));
                }
            }
        }
        for (i, r) in rows.iter().enumerate() {
            if done[i] {
                continue;
            }
            let Some((c, q)) = moves[i].clone() else {
                p.problems.push(format!("{} {}: no commodity note matches this fund (add `isin:` to its note)", r.booked, r.description));
                continue;
            };
            let assert = r.balance.filter(|_| day_end(i) && c == p.statement.currency).map(|b| format!(" = {}", amount(b, &c))).unwrap_or_default();
            let counter = match r.kind {
                // History naming another of the user's accounts outranks a file's category: money that went to one's
                // own account is a transfer whatever the other app filed it under (Actual's "Transport" top-ups).
                Move::Cash { .. } => {
                    let hist = history.counter(&account, &r.description);
                    match hist.clone().filter(|a| a.root().needs_note()) {
                        Some(own) => Some(own),
                        // The user's rules (rules.md) next: what they wrote outranks a file's category and a guess.
                        None => notes.rules.find(&[&r.description, &r.bank], q).map(|x| x.account.clone())
                            .or_else(|| classifier.guess(&[&r.description], q).filter(|g| g.sure()).map(|g| g.account))
                            .or_else(|| said_counter(&p, r, notes, ledger)).or(hist),
                    }
                }
                Move::Fund { .. } => None,
            };
            // The other currency's side of an exchange the ledger has waiting (Revolut's EUR "Exchanged to CAD").
            if matches!(r.kind, Move::Cash { .. }) && says_exchange(&format!("{} {}", r.description, r.bank), &exchange) {
                let fee = match r.kind { Move::Cash { fee, .. } => fee, Move::Fund { .. } => Decimal::ZERO };
                if let Some(done) = exchange_leg(ledger, &holding, &exchanged, &account, r.booked, &c, q + fee, fee) {
                    exchanged.insert(done.txn);
                    pool.push(Seen { account: account.clone(), commodity: c.clone(), date: r.booked, qty: q, taken: vec![pi], draft: None, own: Some(p.statement.preset.clone()), fixable: None });
                    completions.push(done);
                    p.paired += 1;
                    continue;
                }
            }
            // Another account's file is the other side of a movement the ledger has with that side unknown (Actual's
            // wallet: cash in from the ATM withdrawal Paisa left unknown): that transaction is completed instead.
            if matches!(r.kind, Move::Cash { .. }) {
                let named = counter.as_ref().filter(|a| a.root().needs_note());
                let text = format!("{} {}", r.description, r.bank);
                let fit = pool.iter().position(|s| {
                    let Some(t) = s.fixable else { return false };
                    let gap = (s.date - r.booked).num_days().abs();
                    s.account != account && s.commodity == c && s.qty == -q && !s.taken.contains(&pi) && gap <= DAYS
                        && match named {
                            Some(n) => &s.account == n,
                            None => gap == 0 && (says_transfer(&text, &s.account, notes, &words) || says_transfer(&ledger.txns[t].txn.payee, &account, notes, &words)),
                        }
                });
                if let Some(k) = fit {
                    pool[k].taken.push(pi);
                    let edit = crate::edit::Edit { recategorize: Some((unknown.clone(), account.clone())), ..Default::default() };
                    completions.push(Completion { txn: pool[k].fixable.take().unwrap(), edit });
                    p.paired += 1;
                    continue;
                }
            }
            match draft(&p, r, &c, q, &assert, counter, ledger) {
                Ok((postings, counter)) => {
                    let d = drafts.len();
                    pool.push(Seen { account: account.clone(), commodity: c.clone(), date: r.booked, qty: q, taken: vec![pi], draft: Some(d), own: Some(p.statement.preset.clone()), fixable: None });
                    if let Some((acct, cc, cq)) = counter {
                        pool.push(Seen { account: acct, commodity: cc, date: r.booked, qty: cq, taken: vec![], draft: Some(d), own: None, fixable: None });
                    }
                    let mut meta = vec![("bank".to_string(), r.bank.clone())];
                    if let Some(v) = r.value {
                        meta.push(("value-date".into(), v.to_string()));
                    }
                    meta.push(("statement".into(), format!("[[{}]]", p.note)));
                    let unknown = postings.first().is_some_and(|l| l == "Expenses:Unknown");
                    drafts.push(Draft { date: r.booked, payee: payee(&r.description), narration: r.note.clone(), id: row_ids[i].clone(), meta, postings, plan: pi,
                        own: account.clone(), commodity: c.clone(), qty: q,
                        fee: match r.kind { Move::Cash { fee, .. } => fee, Move::Fund { .. } => Decimal::ZERO }, unknown, text: format!("{} {}", r.description, r.bank), merged: false });
                }
                Err(e) => p.problems.push(format!("{} {}: {e}", r.booked, r.description)),
            }
        }
        out.push(p);
    }
    pair_transfers(&mut drafts, notes);
    pair_exchanges(&mut drafts, &holding, &exchange);
    for d in drafts.iter().filter(|d| d.merged) {
        out[d.plan].paired += 1;
    }
    // Text last: a later statement may have added a note to an earlier one's draft.
    for d in drafts.into_iter().filter(|d| !d.merged) {
        let mut s = format!("{} ! {}\n", d.date, crate::write::header(&d.payee, d.narration.as_deref(), &[], Some(&d.id)));
        for (k, v) in &d.meta {
            s.push_str(&format!("  {k}: {v}\n"));
        }
        for p in &d.postings {
            s.push_str(&format!("  {p}\n"));
        }
        // Read back and written canonically: what is written is what the parser reads.
        let (mut j, mut diags) = (Journal::default(), vec![]);
        parse_file("import", &s, &mut j, &mut diags);
        match (j.txns.first(), diags.is_empty()) {
            (Some(t), true) => out[d.plan].new.push((d.date, crate::write::txn(t))),
            _ => out[d.plan].problems.push(format!("{} {}: the transaction made does not read back ({diags:?})", d.date, d.payee)),
        }
    }
    for p in &mut out {
        p.new.sort_by_key(|(d, _)| *d);
        p.checks = checks(&p.statement, &p.account, &pool);
    }
    Plan { planned: out, completions, errors }
}

/// The other side the file itself names: another of the user's accounts (a transfer), or a category.
fn said_counter(p: &Planned, r: &Row, notes: &Notes, ledger: &Ledger) -> Option<Account> {
    if let Some(a) = r.transfer.as_deref().and_then(|t| super::account_named(t, &p.statement.accounts, notes, Some(&p.statement.currency)).ok().flatten()) {
        return Some(a);
    }
    let (cat, group) = r.category.as_ref()?;
    if let Some(a) = p.statement.categories.iter().find(|(k, _)| super::extract::loose(k) == super::extract::loose(cat)).and_then(|(_, a)| Account::parse(a).ok()) {
        return Some(a);
    }
    if let Ok(a) = Account::parse(cat) {
        return Some(a); // already a ledger account (`Equity:Opening`)
    }
    // The ledger's own account of that name, the shortest when several (`Expenses:Food` before `…:Food:Out`).
    let key = super::extract::loose(cat);
    let mut known: Vec<&Account> = ledger.txns.iter().flat_map(|b| &b.txn.postings).map(|x| &x.account)
        .filter(|a| !a.root().needs_note() && super::extract::loose(a.as_str().rsplit(':').next().unwrap_or_default()) == key).collect();
    known.sort_by_key(|a| a.as_str().len());
    if let Some(a) = known.first() {
        return Some((*a).clone());
    }
    let income = group.as_deref().is_some_and(|g| super::extract::loose(g).contains("income")) || key.contains("income");
    let part: String = cat.split_whitespace().collect::<Vec<_>>().join(" ").replace(':', " ");
    Account::parse(&format!("{}:{part}", if income { "Income" } else { "Expenses" })).ok()
}

/// The postings for a new row, and the real-account posting its counterpart makes (a transfer's other side, a
/// fund's cash leg), which a later statement then finds.
#[allow(clippy::type_complexity)]
fn draft(p: &Planned, r: &Row, c: &Commodity, q: Decimal, assert: &str, counter: Option<Account>, ledger: &Ledger) -> Result<(Vec<String>, Option<(Account, Commodity, Decimal)>), String> {
    let cur = &p.statement.currency;
    match &r.kind {
        Move::Cash { amount: a, fee } => {
            let counter = counter.unwrap_or_else(|| Account::parse("Expenses:Unknown").unwrap());
            let mut lines = vec![counter.to_string()];
            if !fee.is_zero() {
                lines.push(line(&Account::parse("Expenses:Bank:Fees").unwrap(), &amount(*fee, cur)));
            }
            lines.push(format!("{}{assert}", line(&p.account, &amount(q, c))));
            let real = counter.root().needs_note().then(|| (counter, cur.clone(), -*a));
            Ok((lines, real))
        }
        Move::Fund { units, total, op, .. } => {
            let cash = fund_cash(ledger, &p.account).ok_or("no earlier operation of this fund names the account its cash moves in")?;
            let lines = match op {
                FundOp::Buy => vec![format!("{}  {}", line(&p.account, &amount(*units, c)), format!("{{{{{}}}}}", amount(*total, cur))), line(&cash, &amount(-*total, cur))],
                FundOp::Sell => vec![format!("{} {{fifo}} @@ {}", line(&p.account, &amount(-*units, c)), amount(*total, cur)), "Income:Gains:Funds".into(), line(&cash, &amount(*total, cur))],
            };
            let signed = if *op == FundOp::Buy { -*total } else { *total };
            Ok((lines, Some((cash, cur.clone(), signed))))
        }
    }
}

/// The ledger's balance before `from` and after `to`, against the bank's.
fn checks(st: &Statement, account: &Account, pool: &[Seen]) -> Vec<Check> {
    let at = |pred: &dyn Fn(NaiveDate) -> bool| pool.iter().filter(|s| &s.account == account && s.commodity == st.currency && pred(s.date)).map(|s| s.qty).sum::<Decimal>();
    let mut out = vec![];
    if let (Some(from), Some(b)) = (st.from, st.opening) {
        out.push(Check { what: "opening", date: from.pred_opt().unwrap_or(from), bank: b, ledger: at(&|d| d < from) });
    }
    let closing = st.closing.or_else(|| st.rows.iter().rev().find_map(|r| r.balance));
    let to = st.to.or_else(|| st.rows.last().map(|r| r.booked));
    if let (Some(to), Some(b)) = (to, closing) {
        out.push(Check { what: "closing", date: to, bank: b, ledger: at(&|d| d <= to) });
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn payees_drop_references() {
        for (raw, want) in [("BOLT.EU/O/2609160503", "BOLT.EU"), ("WWW.AMAZON*CZ2KH6BX5", "WWW.AMAZON"), ("RYANAIR0000000Z53ZYJ", "RYANAIR"),
            ("AUCHAN 1076M", "AUCHAN"), ("AMAZON* 404 3051726 58", "AMAZON"), ("Payment from CHRIS BRAND", "Payment from CHRIS BRAND"), ("MAXI 7567", "MAXI"), ("/Txt/Auchan Supermar Mp", "Auchan Supermar Mp")] {
            assert_eq!(payee(raw), want, "{raw}");
        }
    }

    #[test]
    fn ignored_ids_from_the_fence() {
        let s = ignored("# Ignored\n\n```finance-ignored\n^unicaja-cuenta-1a  ; a refund I deleted\nrevolut-2b\n```\n");
        assert_eq!(s, ["unicaja-cuenta-1a".to_string(), "revolut-2b".to_string()].into());
    }
}
