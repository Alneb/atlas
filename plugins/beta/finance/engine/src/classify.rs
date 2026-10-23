//! Smart categorisation (DESIGN-finance "Capture" and "Import pipeline": "rules, then a classifier trained on your
//! history"). Three layers, the first that answers wins:
//! 1. the user's rules (rules.rs), exact;
//! 2. what the history says: the nearest categorised payees by TF-IDF cosine over words and letter trigrams (so
//!    "Café CAUS" is "CAFE CAUS", "IVS France MP" is "IVS FRANCE", and a word every payee has, "mp", weighs nothing),
//!    among those with money going the same way, voted by similarity and count;
//! 3. a vocabulary of kinds of shop (vocabulary.toml: "pizza", "supermar", "pharmac" …), filed into the ledger's own
//!    category of that name, for a payee never seen.
//!
//! Every guess carries its confidence and the reason, so Review can show why and a doubtful one is asked, not filed.
use crate::book::Ledger;
use crate::model::*;
use crate::notes::Notes;
use crate::rules::{flow, texts, Rules};

/// What the history compares: the payee (and the narration), not the bank's text, whose boilerplate ("PUR PURCHASE",
/// "COMPRA EUR") is shared by every row of one bank and would make them all alike.
fn names(t: &Txn) -> String {
    let mut s = t.payee.clone();
    if let Some(n) = &t.narration {
        s.push(' ');
        s.push_str(n);
    }
    if words(&s).is_empty() {
        s = texts(t).join(" ");
    }
    s
}
use rust_decimal::Decimal;
use serde::Deserialize;
use std::collections::{BTreeMap, HashMap};

#[derive(Debug, Clone, PartialEq)]
pub enum Why {
    Rule(String),
    /// Like these categorised payees: (their text, how many times).
    Like(Vec<(String, usize)>),
    /// A word of the vocabulary.
    Kind(String),
    /// Money between the user and another person, after this card payment ("ARDECORE 17.50 EUR on 2025-02-12"); `exact`
    /// when it is that bill shared in equal parts.
    Shared { bill: String, exact: bool },
}

#[derive(Debug, Clone, PartialEq)]
pub struct Guess {
    pub account: Account,
    /// 0..1: how much of the vote it took, times how close the nearest example is.
    pub confidence: f64,
    pub why: Why,
}

impl Guess {
    /// Sure enough to file without asking.
    pub fn sure(&self) -> bool {
        match self.why {
            Why::Rule(_) => true,
            Why::Like(_) => self.confidence >= 0.55,
            Why::Kind(_) => self.confidence >= 0.5,
            Why::Shared { exact, .. } => exact,
        }
    }
    pub fn reason(&self) -> String {
        match &self.why {
            Why::Rule(at) => format!("your rule ({at})"),
            Why::Like(xs) => format!("like {}", xs.iter().map(|(t, n)| if *n > 1 { format!("{t} ×{n}") } else { t.clone() }).collect::<Vec<_>>().join(", ")),
            Why::Kind(w) => format!("a {w}"),
            Why::Shared { bill, exact: true } => format!("a share of {bill}"),
            Why::Shared { bill, exact: false } => format!("after {bill}"),
        }
    }
}

/// Lowercase, accents off, digits and punctuation out: the words a payee is known by.
pub fn words(s: &str) -> Vec<String> {
    use unicode_normalization::{char::is_combining_mark, UnicodeNormalization};
    let folded: String = s.nfd().filter(|c| !is_combining_mark(*c)).flat_map(char::to_lowercase).collect();
    folded.split(|c: char| !c.is_alphanumeric()).filter(|w| w.len() >= 2 && !w.chars().any(|c| c.is_ascii_digit()))
        .map(str::to_string).collect()
}

/// A payment's size for comparing (never 0, so a ratio is always defined).
fn size(q: Decimal) -> f64 {
    use rust_decimal::prelude::ToPrimitive;
    q.abs().to_f64().unwrap_or(0.0).max(0.5)
}

fn features(text: &str) -> HashMap<String, f64> {
    let mut f = HashMap::new();
    let ws = words(text);
    for w in &ws {
        *f.entry(format!("w:{w}")).or_insert(0.0) = 1.0;
    }
    // Trigrams of each word (with its edges), so a cut-off or misspelt name still meets its fellows.
    for w in &ws {
        let padded: Vec<char> = format!("^{w}$").chars().collect();
        for g in padded.windows(3) {
            *f.entry(format!("g:{}", g.iter().collect::<String>())).or_insert(0.0) = 0.35;
        }
    }
    f
}

struct Example {
    text: String,
    out: bool,
    label: Account,
    count: usize,
    /// The usual size of these payments (the median), so 3 € at Crous (the cafeteria) is unlike 250 € (the rent).
    size: f64,
    vec: HashMap<String, f64>,
    norm: f64,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Vocabulary {
    #[serde(default)]
    kind: Vec<Kind>,
    #[serde(default)]
    transfer_words: Vec<String>,
    #[serde(default)]
    exchange_words: Vec<String>,
    #[serde(default)]
    holding_accounts: Vec<String>,
    #[serde(default)]
    person_words: Vec<String>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Kind {
    /// The kind in words ("supermarket"), for the reason.
    name: String,
    /// The category, matched against the ledger's own by its last parts (`Food:Groceries`).
    category: String,
    /// Word beginnings (`supermar` matches "supermarche", "supermarket").
    words: Vec<String>,
    #[serde(default)]
    income: bool,
}

const VOCABULARY: &str = include_str!("../../data/vocabulary.toml");

/// One list of the vocabulary: the plugin's, then the vault's (finance/vocabulary.toml).
fn list(notes: &Notes, pick: fn(Vocabulary) -> Vec<String>) -> Vec<String> {
    let read = |t: &str| toml::from_str::<Vocabulary>(t).map(pick).unwrap_or_default();
    let mut out = read(VOCABULARY);
    out.extend(notes.data.get("vocabulary.toml").map(|t| read(t)).unwrap_or_default());
    out
}

/// The words that say a movement is a transfer (vocabulary.toml `transfer_words`).
pub fn transfer_words(notes: &Notes) -> Vec<String> {
    list(notes, |v| v.transfer_words)
}

/// The words that say a movement is a currency exchange within one account (`exchange_words`).
pub fn exchange_words(notes: &Notes) -> Vec<String> {
    list(notes, |v| v.exchange_words)
}

/// Words for money sent to or received from another person (`person_words`).
pub fn person_words(notes: &Notes) -> Vec<String> {
    list(notes, |v| v.person_words)
}

/// What a friend's transfer was for, from the card payments around it: a friend pays back their part of a bill the user
/// paid, or the user pays theirs. The nearest payment of the week before that is larger than it, but not more than nine
/// times (a 12 € part is not of a 775 € rent), gives the category; one that splits into 2 to 8 equal parts of it (to 2
/// cents) is called a share. Only for a transaction whose texts name a
/// person (`person_words`) and whose other side waits in a holding account: always a guess, confirmed in Review.
pub fn shared(l: &Ledger, notes: &Notes, t: &Txn) -> Option<Guess> {
    let holding = holding_accounts(notes);
    let text = format!(" {} ", words(&crate::rules::texts(t).join(" ")).join(" "));
    if !person_words(notes).iter().any(|w| text.contains(&format!(" {} ", words(w).join(" ")))) || !t.postings.iter().any(|p| holding.contains(&p.account)) {
        return None;
    }
    let own = t.postings.iter().filter(|p| p.account.root().needs_note() && !holding.contains(&p.account)).find_map(|p| p.amount.as_ref())?;
    let q = own.qty.abs();
    let cent2 = Decimal::new(2, 2);
    let bills = l.txns.iter().map(|b| &b.txn).filter(|b| (0..=7).contains(&(t.date - b.date).num_days()) && !std::ptr::eq(*b, t)).filter_map(|b| {
        let cat = label(b).filter(|a| a.root() == Root::Expenses)?;
        let paid = b.postings.iter().filter(|p| p.account.root().needs_note() && !holding.contains(&p.account)).filter_map(|p| p.amount.as_ref())
            .find(|a| a.commodity == own.commodity && a.qty < -q && -a.qty <= q * Decimal::from(9))?.qty.abs();
        let exact = (2..=8).any(|n| (paid / Decimal::from(n) - q).abs() <= cent2);
        Some((exact, (t.date - b.date).num_days(), paid, b, cat))
    });
    // Exact shares first, then the nearest in time, then the smallest bill.
    let (exact, _, paid, b, cat) = bills.min_by_key(|x| (!x.0, x.1, x.2))?;
    let bill = format!("{} {} on {}", b.payee, crate::write::amount(&Amount::new(paid, own.commodity.clone())), b.date);
    Some(Guess { account: cat.clone(), confidence: if exact { 0.9 } else { 0.4 }, why: Why::Shared { bill, exact } })
}

/// Where a movement waits for its other side (`holding_accounts`, and always Expenses:Unknown).
pub fn holding_accounts(notes: &Notes) -> Vec<Account> {
    let mut out = vec![Account::parse("Expenses:Unknown").expect("a valid account")];
    out.extend(list(notes, |v| v.holding_accounts).iter().filter_map(|a| Account::parse(a).ok()));
    out
}

/// The plugin's vocabulary with the vault's (finance/vocabulary.toml) before it: a vault kind of the same name
/// replaces the plugin's, and the vault's come first, so they win.
fn vocabulary(vault: Option<&str>) -> Result<Vec<Kind>, String> {
    let mut kinds = toml::from_str::<Vocabulary>(VOCABULARY).map_err(|e| format!("data/vocabulary.toml: {e}"))?.kind;
    if let Some(text) = vault {
        let mine = toml::from_str::<Vocabulary>(text).map_err(|e| format!("finance/vocabulary.toml: {e}"))?.kind;
        kinds.retain(|k| !mine.iter().any(|m| m.name == k.name));
        kinds.splice(0..0, mine);
    }
    Ok(kinds)
}

pub struct Classifier<'a> {
    rules: &'a Rules,
    /// A broken vault vocabulary, said once (the plugin's own is used meanwhile).
    pub problem: Option<String>,
    examples: Vec<Example>,
    idf: HashMap<String, f64>,
    kinds: Vec<(Kind, Account)>,
}

/// Per category: its vote and the examples that gave it.
type Votes<'e> = BTreeMap<&'e Account, (f64, Vec<(String, usize)>)>;

/// The category a transaction was filed in: its largest posting that is not a money account, a fee or Unknown.
pub fn label(t: &Txn) -> Option<&Account> {
    t.postings.iter().filter(|p| matches!(p.account.root(), Root::Expenses | Root::Income))
        .filter(|p| !p.account.is_under("Expenses:Unknown") && !p.account.is_under("Expenses:Bank:Fees") && !p.account.is_under("Income:Gains"))
        .max_by_key(|p| p.amount.as_ref().map(|a| a.qty.abs()).unwrap_or(Decimal::MAX)).map(|p| &p.account)
}

impl<'a> Classifier<'a> {
    pub fn new(l: &Ledger, notes: &'a Notes) -> Classifier<'a> {
        let rules = &notes.rules;
        let mut grouped: BTreeMap<(String, bool, Account), Vec<f64>> = BTreeMap::new();
        for b in &l.txns {
            if let Some(a) = label(&b.txn) {
                let key: String = words(&names(&b.txn)).join(" ");
                let q = flow(&b.txn);
                if !key.is_empty() {
                    grouped.entry((key, q.is_sign_negative(), a.clone())).or_default().push(size(q));
                }
            }
        }
        // How rare a word is, from every payee of the ledger, filed or not: "mp" ends half the card payments of one
        // bank, so it says nothing about any of them, however few are filed yet.
        let mut df: HashMap<String, usize> = HashMap::new();
        let all: std::collections::BTreeSet<String> = l.txns.iter().map(|b| words(&names(&b.txn)).join(" ")).filter(|k| !k.is_empty()).collect();
        for k in &all {
            for f in features(k).into_keys() {
                *df.entry(f).or_default() += 1;
            }
        }
        let raw: Vec<_> = grouped.into_iter().map(|((text, out, label), mut sizes)| {
            sizes.sort_by(f64::total_cmp);
            let f = features(&text);
            (text, out, label, (sizes.len(), sizes[sizes.len() / 2]), f)
        }).collect();
        let n = all.len().max(1) as f64;
        let idf: HashMap<String, f64> = df.into_iter().map(|(k, d)| (k, (1.0 + n / d as f64).ln())).collect();
        let examples = raw.into_iter().map(|(text, out, label, (count, size), f)| {
            let vec: HashMap<String, f64> = f.into_iter().map(|(k, w)| { let x = w * idf.get(&k).copied().unwrap_or(1.0); (k, x) }).collect();
            let norm = vec.values().map(|x| x * x).sum::<f64>().sqrt();
            Example { text, out, label, count, size, vec, norm }
        }).collect();
        let known: Vec<&Account> = l.txns.iter().flat_map(|b| &b.txn.postings).map(|p| &p.account).filter(|a| matches!(a.root(), Root::Expenses | Root::Income)).collect();
        let (vocab, problem) = match vocabulary(notes.data.get("vocabulary.toml").map(String::as_str)) {
            Ok(v) => (v, None),
            Err(e) => (vocabulary(None).expect("data/vocabulary.toml is checked by its test"), Some(e)),
        };
        let kinds = vocab.into_iter().map(|k| {
            let root = if k.income { "Income" } else { "Expenses" };
            let tail = format!(":{}", k.category);
            let last = k.category.rsplit(':').next().unwrap_or_default().to_string();
            // The ledger's own account of that name: the full tail first, else the same last part, else new.
            let mine = known.iter().filter(|a| a.as_str().starts_with(root)).find(|a| a.as_str().ends_with(&tail)).copied()
                .or_else(|| known.iter().filter(|a| a.as_str().starts_with(root)).find(|a| a.as_str().rsplit(':').next() == Some(last.as_str())).copied())
                .cloned().unwrap_or_else(|| Account::parse(&format!("{root}{tail}")).expect("vocabulary category"));
            (k, mine)
        }).collect();
        Classifier { rules, problem, examples, idf, kinds }
    }

    fn vector(&self, text: &str) -> (HashMap<String, f64>, f64) {
        // A word the history never saw is the rarest of all: it counts against every match, never for one.
        let rarest = self.idf.values().copied().fold(1.0, f64::max);
        let v: HashMap<String, f64> = features(text).into_iter().map(|(k, w)| { let x = w * self.idf.get(&k).copied().unwrap_or(rarest); (k, x) }).collect();
        let norm = v.values().map(|x| x * x).sum::<f64>().sqrt();
        (v, norm)
    }

    /// The best guess for a payment described by `texts`, of `qty` seen from the money account.
    pub fn guess(&self, texts: &[&str], qty: Decimal) -> Option<Guess> {
        if let Some(r) = self.rules.find(texts, qty) {
            return Some(Guess { account: r.account.clone(), confidence: 1.0, why: Why::Rule(format!("{}:{}", r.path, r.line)) });
        }
        let out = qty.is_sign_negative();
        let text = texts.join(" ");
        let mut best: Option<Guess> = None;
        let (q, qn) = self.vector(&text);
        let qty_size = size(qty);
        if qn > 0.0 {
            let mut near: Vec<(f64, &Example)> = self.examples.iter().filter(|e| e.out == out && e.norm > 0.0).filter_map(|e| {
                let dot: f64 = q.iter().filter_map(|(k, w)| Some(w * e.vec.get(k)?)).sum();
                // Alike in name, then in size: up to twice or half is the same; 60 times apart costs half.
                let apart = ((qty_size / e.size).ln().abs() - 2f64.ln()).max(0.0) / 30f64.ln();
                let sim = dot / (qn * e.norm) / (1.0 + apart);
                (sim >= 0.3).then_some((sim, e))
            }).collect();
            near.sort_by(|a, b| b.0.total_cmp(&a.0));
            near.truncate(7);
            let mut votes: Votes = BTreeMap::new();
            for (sim, e) in &near {
                let v = votes.entry(&e.label).or_default();
                v.0 += sim * sim * (1.0 + (e.count as f64).ln());
                v.1.push((e.text.to_uppercase(), e.count));
            }
            let total: f64 = votes.values().map(|v| v.0).sum();
            if let Some((a, (score, like))) = votes.into_iter().max_by(|x, y| x.1 .0.total_cmp(&y.1 .0)) {
                let top = near.iter().find(|(_, e)| &e.label == a).map_or(0.0, |x| x.0);
                best = Some(Guess { account: a.clone(), confidence: (score / total) * top.min(1.0), why: Why::Like(like.into_iter().take(3).collect()) });
            }
        }
        if best.as_ref().is_some_and(Guess::sure) {
            return best;
        }
        let ws = words(&text);
        let joined = format!(" {} ", ws.join(" "));
        // Several words: the phrase; three letters or fewer: the whole word (`stm`, not "stmt…"); else a beginning.
        let hit = |v: &str| if v.contains(' ') { joined.contains(&format!(" {v}")) } else if v.len() <= 4 { ws.iter().any(|w| w == v) } else { ws.iter().any(|w| w.starts_with(v)) };
        let kind = self.kinds.iter().filter(|(k, _)| k.income != out).find(|(k, _)| k.words.iter().any(|v| hit(v)));
        match kind {
            Some((k, a)) => Some(Guess { account: a.clone(), confidence: 0.55, why: Why::Kind(k.name.clone()) }),
            None => best,
        }
    }

    /// A transaction's guess: rules see every text (the bank's too); the history and the vocabulary its names.
    pub fn guess_txn(&self, t: &Txn) -> Option<Guess> {
        let q = flow(t);
        match self.rules.find(&texts(t), q) {
            Some(r) => Some(Guess { account: r.account.clone(), confidence: 1.0, why: Why::Rule(format!("{}:{}", r.path, r.line)) }),
            None => self.guess(&[&names(t)], q),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::load::load_texts;

    fn ledger() -> crate::load::Loaded {
        let mut j = String::new();
        for i in 0..20 {
            j += &format!("2026-01-{:02} * IVS France\n  Expenses:Food:Snacks  1.50 EUR\n  Assets:Bank\n", i % 28 + 1);
        }
        for i in 0..5 {
            j += &format!("2026-02-{:02} * CANTINA DE CIENCIAS\n  Expenses:Food:Cantine  4.20 EUR\n  Assets:Bank\n", i + 1);
        }
        j += "2026-02-10 * AUCHAN SUPERMAR\n  Expenses:Food:Groceries  20 EUR\n  Assets:Bank\n";
        j += "2026-03-01 * UNIVERSITE PARIS SACLAY DDFIP\n  Income:Scholarship  -1400 EUR\n  Assets:Bank\n";
        load_texts(&[("finance/journal/2026.fin".into(), j)])
    }

    #[test]
    fn the_vocabulary_reads_and_a_vaults_comes_first() {
        assert!(vocabulary(None).unwrap().len() > 10);
        let v = vocabulary(Some("[[kind]]\nname = \"supermarket\"\ncategory = \"Food:Super\"\nwords = [\"zzz\"]\n")).unwrap();
        assert_eq!((v[0].category.as_str(), v.iter().filter(|k| k.name == "supermarket").count()), ("Food:Super", 1));
        assert!(vocabulary(Some("kind = 3")).is_err());
    }

    #[test]
    fn history_spelt_differently_is_still_history() {
        let l = ledger();
        let c = Classifier::new(&l.ledger, &l.notes);
        let dec = |s: &str| s.parse::<Decimal>().unwrap();
        let g = c.guess(&["Ivs France Mp | /TXT/IVS France MP"], dec("-1.20")).unwrap();
        assert_eq!(g.account.as_str(), "Expenses:Food:Snacks");
        assert!(g.sure(), "{g:?}");
        // Money coming in from the same university is not a purchase.
        let g = c.guess(&["UNIVERSITE PARIS-SACLAY DDFIP"], dec("1400")).unwrap();
        assert_eq!(g.account.as_str(), "Income:Scholarship");
        // Never seen: the vocabulary files a pizzeria into the ledger's own Groceries/Restaurants names.
        let g = c.guess(&["ANTICA PIZZERIA DA MIC"], dec("-30")).unwrap();
        assert_eq!((g.account.as_str(), matches!(g.why, Why::Kind(_))), ("Expenses:Food:Restaurants", true));
        let g = c.guess(&["CARREFOUR ULIS MP"], dec("-30")).unwrap();
        assert_eq!(g.account.as_str(), "Expenses:Food:Groceries", "{g:?}");
        // Nothing alike and no kind: no guess, so it is asked.
        assert!(c.guess(&["EJJHDSSYIOTEF"], dec("600")).is_none_or(|g| !g.sure()));
    }
}
