//! One import: the inbox's files → what to write (DESIGN-finance-import.md, "A batch"). Pure: it reads through the
//! given vault and returns the files to write, so the plugin's helper and the command line apply the same plan, and a
//! dry run is the same call without the writing.
//!
//! What it writes: the new transactions appended to `journal/<year>.fin`; one note per statement in
//! `statements/<bank>/<account> <from> to <to>.md`; each original, renamed the same, added to its account's archive
//! `statements/<bank>/<account>.tar.gz` (incremental: the archive grows, nothing in it is replaced).
use super::plan::{plan, Planned};
use super::preset::presets;
use super::{read, title, Statement};
use crate::load::{Loaded, Source};
use crate::model::*;
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, HashMap, HashSet};
use std::fmt::Write as _;
use std::io::Read as _;

pub struct Input {
    /// Where it is (the inbox path), and its bytes.
    pub path: String,
    pub bytes: Vec<u8>,
}

/// One statement of the batch, for the pane's table.
#[derive(Debug, Clone, serde::Serialize)]
pub struct Line {
    pub note: String,
    pub account: String,
    pub source: String,
    pub rows: usize,
    pub new: usize,
    pub known: usize,
    pub paired: usize,
    pub skipped: usize,
    /// Its balance checks, and how many disagree with the ledger.
    pub checks: usize,
    pub off: usize,
}

#[derive(Default)]
pub struct Output {
    pub lines: Vec<Line>,
    /// Text files, each its whole new text (journals with the rows appended, statement notes, the report).
    pub texts: Vec<(String, String)>,
    /// Archives, each its whole new bytes.
    pub archives: Vec<(String, Vec<u8>)>,
    /// Inputs read (into the archive) or already imported before: they may leave the inbox.
    pub consumed: Vec<String>,
    pub report: String,
    pub new: usize,
    pub errors: Vec<String>,
}

fn sha(b: &[u8]) -> String {
    Sha256::digest(b).iter().map(|x| format!("{x:02x}")).collect()
}

fn ext(path: &str) -> &str {
    path.rsplit_once('.').map(|(_, e)| e).filter(|e| e.len() <= 5).unwrap_or("bin")
}

/// The names already in an archive, and its members (name, bytes) to carry over.
fn members(tgz: &[u8]) -> Result<Vec<(String, Vec<u8>)>, String> {
    let mut a = tar::Archive::new(flate2::read::GzDecoder::new(tgz));
    let mut out = vec![];
    for e in a.entries().map_err(|e| e.to_string())? {
        let mut e = e.map_err(|e| e.to_string())?;
        let name = e.path().map_err(|e| e.to_string())?.to_string_lossy().into_owned();
        let mut b = vec![];
        e.read_to_end(&mut b).map_err(|e| e.to_string())?;
        out.push((name, b));
    }
    Ok(out)
}

fn pack(files: &[(String, Vec<u8>)], mtime: u64) -> Result<Vec<u8>, String> {
    let mut t = tar::Builder::new(flate2::write::GzEncoder::new(vec![], flate2::Compression::best()));
    for (name, b) in files {
        let mut h = tar::Header::new_gnu();
        h.set_size(b.len() as u64);
        h.set_mode(0o644);
        h.set_mtime(mtime);
        h.set_cksum();
        t.append_data(&mut h, name, b.as_slice()).map_err(|e| e.to_string())?;
    }
    t.into_inner().and_then(|g| g.finish()).map_err(|e| e.to_string())
}

/// `vault` reads text; `read_bytes` reads a binary file (an archive) when it exists.
pub fn run(vault: &dyn Source, read_bytes: &dyn Fn(&str) -> Option<Vec<u8>>, loaded: &Loaded, folder: &str, inputs: Vec<Input>,
    pdf_text: &dyn Fn(&[u8]) -> Result<String, String>, today: chrono::NaiveDate) -> Output {
    let mut out = Output::default();
    let files = vault.files(folder).unwrap_or_default();
    let preset_files: Vec<(String, String)> = files.iter().filter(|p| p.starts_with(&format!("{folder}/importers/")) && p.ends_with(".toml"))
        .filter_map(|p| vault.read(p).ok().map(|t| (p.clone(), t))).collect();
    let (presets, mut errors) = presets(&preset_files);
    let ignored = vault.read(&format!("{folder}/ignored.md")).map(|t| super::plan::ignored(&t)).unwrap_or_default();
    let seen: HashMap<&str, &str> = loaded.notes.statements.iter().filter_map(|n| Some((n.sha256.as_deref()?, &*n.path))).collect();

    // Read every file; one already imported (same bytes) only leaves the inbox.
    let mut statements: Vec<Statement> = vec![];
    let mut originals: HashMap<String, (String, Vec<u8>)> = HashMap::new();
    let mut lines = vec![];
    for input in inputs {
        let name = input.path.rsplit('/').next().unwrap_or(&input.path).to_string();
        let hash = sha(&input.bytes);
        if let Some(note) = seen.get(hash.as_str()) {
            lines.push(format!("- `{name}`: already imported ({note}), the same file"));
            out.consumed.push(input.path.clone());
            continue;
        }
        match read(&name, &input.bytes, &presets, pdf_text) {
            Ok(sts) => {
                for mut st in sts {
                    st.source = name.clone();
                    statements.push(st);
                }
                originals.insert(name, (input.path, input.bytes));
            }
            Err(e) => errors.push(e),
        }
    }

    // Names unique in the vault and in this batch.
    let mut taken: HashSet<String> = files.iter().filter_map(|p| p.strip_suffix(".md")).map(|p| p.rsplit('/').next().unwrap_or(p).to_string()).collect();
    let mut name = |st: &Statement, a: &Account| {
        let base = title(st, a);
        let n = (1..).map(|i| if i == 1 { base.clone() } else { format!("{base} ({i})") }).find(|n| !taken.contains(n)).unwrap();
        taken.insert(n.clone());
        n
    };
    let super::plan::Plan { planned, completions, errors: plan_errors } = plan(&loaded.ledger, &loaded.notes, &ignored, statements, &mut name);
    errors.extend(plan_errors);

    // Journals: transactions completed in place first (their lines only), then each year's new rows appended.
    let mut journals: BTreeMap<String, String> = BTreeMap::new();
    let mut completed = 0;
    // Bottom up in each file: an edit that adds lines (an exchange's fee) leaves the lines above it where they were read.
    let mut completions = completions;
    completions.sort_by_key(|c| std::cmp::Reverse(loaded.ledger.txns[c.txn].txn.span.first));
    for c in &completions {
        let t = &loaded.ledger.txns[c.txn].txn;
        let path = t.span.path.to_string();
        let text = journals.entry(path.clone()).or_insert_with(|| vault.read(&path).unwrap_or_default());
        match crate::edit::apply(text, t, &c.edit) {
            Ok(new) => {
                *text = new;
                completed += 1;
            }
            Err(e) => errors.push(e),
        }
    }
    let mut by_year: BTreeMap<i32, Vec<&String>> = BTreeMap::new();
    for p in &planned {
        for (d, t) in &p.new {
            by_year.entry(chrono::Datelike::year(d)).or_default().push(t);
        }
    }
    for (year, txns) in by_year {
        let path = format!("{folder}/journal/{year}.fin");
        let mut text = journals.remove(&path).unwrap_or_else(|| vault.read(&path).unwrap_or_default());
        let txns = day_order(txns);
        for t in txns {
            text = format!("{}{}{t}", text.trim_end_matches('\n'), if text.trim().is_empty() { "" } else { "\n\n" });
        }
        out.texts.push((path, text));
    }
    out.texts.extend(journals);
    out.new = planned.iter().map(|p| p.new.len()).sum();

    // Archives: per account, the old members kept, the new originals added under the statement's name.
    let mut archived: BTreeMap<String, Vec<(String, Vec<u8>)>> = BTreeMap::new();
    let mut archive_of: HashMap<usize, String> = HashMap::new();
    let mtime = today.and_hms_opt(12, 0, 0).map_or(0, |t| t.and_utc().timestamp().max(0) as u64);
    for (i, p) in planned.iter().enumerate() {
        let Some((_, bytes)) = originals.get(&p.statement.source) else { continue };
        let account = p.account.as_str().split(':').skip(1).collect::<Vec<_>>().join(" ");
        let path = format!("{folder}/statements/{}/{account}.tar.gz", p.statement.bank);
        let list = match archived.get_mut(&path) {
            Some(l) => l,
            None => {
                let old = match read_bytes(&path) {
                    Some(b) => members(&b).unwrap_or_else(|e| { errors.push(format!("{path}: {e} (a new archive is not written over it)")); vec![] }),
                    None => vec![],
                };
                archived.entry(path.clone()).or_insert(old)
            }
        };
        let member = format!("{}.{}", p.note, ext(&p.statement.source));
        // The same original holding several accounts' statements is archived with each.
        if !list.iter().any(|(n, _)| *n == member) {
            list.push((member, bytes.clone()));
        }
        archive_of.insert(i, path);
    }
    for (path, files) in &archived {
        // An archive that could not be read stays as it is.
        if errors.iter().any(|e| e.starts_with(path.as_str())) {
            continue;
        }
        match pack(files, mtime) {
            Ok(b) => out.archives.push((path.clone(), b)),
            Err(e) => errors.push(format!("{path}: {e}")),
        }
    }

    // An account a statement shows moving before its note's `opened` was open then: the date moves back.
    // Every real account a new transaction posts to (a transfer's other side too), at its first date.
    let mut first: BTreeMap<Account, chrono::NaiveDate> = BTreeMap::new();
    for (d, t) in planned.iter().flat_map(|p| &p.new) {
        for name in t.lines().skip(1).filter_map(|l| l.strip_prefix("  ")).filter_map(|l| l.split("  ").next()) {
            if let Some(a) = Account::parse(name.trim()).ok().filter(|a| a.root().needs_note()) {
                first.entry(a).and_modify(|x| *x = (*x).min(*d)).or_insert(*d);
            }
        }
    }
    for (a, d) in first {
        let Some(n) = loaded.notes.accounts.get(&a).filter(|n| n.opened.is_some_and(|o| o > d)) else { continue };
        let Ok(text) = vault.read(&n.path) else { continue };
        let old = format!("opened: {}", n.opened.unwrap());
        if text.contains(&old) {
            out.texts.push((n.path.to_string(), text.replacen(&old, &format!("opened: {d}"), 1)));
            lines.push(format!("- `{}`: opened moved back to {d}, where its first imported movement is", n.path));
        }
    }

    // Statement notes.
    for (i, p) in planned.iter().enumerate() {
        let hash = originals.get(&p.statement.source).map(|(_, b)| sha(b)).unwrap_or_default();
        let archive = archive_of.get(&i).cloned().unwrap_or_default();
        out.texts.push((format!("{folder}/statements/{}/{}.md", p.statement.bank, p.note), note(p, &hash, &archive, today)));
    }
    out.consumed.extend(originals.values().map(|(path, _)| path.clone()));

    out.lines = planned.iter().map(|p| Line {
        note: p.note.clone(), account: p.account.to_string(), source: p.statement.source.clone(), rows: p.statement.rows.len(), new: p.new.len(),
        known: p.known, paired: p.paired, skipped: p.statement.skipped.len() + p.problems.len(), checks: p.checks.len(),
        off: p.checks.iter().filter(|c| c.bank != c.ledger).count(),
    }).collect();

    // The report.
    let mut r = format!("# Import, {today}\n\n");
    for p in &planned {
        let _ = writeln!(r, "- **{}** ({}, `{}`): {} rows, {} new, {} already in the ledger{}{}", p.note, p.account, p.statement.source, p.statement.rows.len(), p.new.len(), p.known,
            if p.paired > 0 { format!(", {} the other side of a transfer", p.paired) } else { String::new() },
            if p.ignored > 0 { format!(", {} ignored", p.ignored) } else { String::new() });
        for c in &p.checks {
            let _ = writeln!(r, "  - {} balance on {}: bank {}, ledger {}{}", c.what, c.date, c.bank, c.ledger, if c.bank == c.ledger { " ✓".to_string() } else { format!(" — **{} apart**", (c.bank - c.ledger).abs()) });
        }
        // Grouped by why (a whole period skipped is one line); every row is listed in the statement's note.
        let mut why: Vec<(String, Vec<&str>)> = vec![];
        for x in p.statement.skipped.iter().chain(&p.problems) {
            let (what, reason) = x.rsplit_once(": ").unwrap_or(("", x));
            match why.iter_mut().find(|(r, _)| r == reason) {
                Some((_, v)) => v.push(what),
                None => why.push((reason.to_string(), vec![what])),
            }
        }
        for (reason, rows) in why {
            let shown: Vec<&str> = rows.iter().take(3).copied().filter(|w| !w.is_empty()).collect();
            let more = if rows.len() > shown.len() { format!(", and {} more", rows.len() - shown.len()) } else { String::new() };
            let _ = writeln!(r, "  - {} not imported: {reason} ({}{more})", rows.len(), shown.join("; "));
        }
    }
    if completed > 0 {
        let _ = writeln!(r, "- {completed} transactions already in the ledger, their other side unknown, completed from another account's file (still to review)");
    }
    r.extend(lines.iter().map(|l| format!("{l}\n")));
    for e in &errors {
        let _ = writeln!(r, "- **error:** {e}");
    }
    out.report = r;
    out.errors = errors;
    out
}

/// The real accounts a transaction's text posts to, and those it asserts a balance for.
fn posts(t: &str) -> (Vec<&str>, Vec<&str>) {
    let (mut all, mut asserted) = (vec![], vec![]);
    for l in t.lines().skip(1).filter_map(|l| l.strip_prefix("  ")).filter(|l| l.starts_with("Assets:") || l.starts_with("Liabilities:")) {
        let name = l.split("  ").next().unwrap_or(l).trim();
        all.push(name);
        if l.contains(" = ") {
            asserted.push(name);
        }
    }
    (all, asserted)
}

/// By date; within a day, a transaction asserting an account's balance after every other that day posting to it,
/// so the bank's day-end balance holds after all of that day's movements.
fn day_order(mut txns: Vec<&String>) -> Vec<&String> {
    txns.sort_by_key(|t| t.get(..10).map(str::to_string));
    let mut out = vec![];
    for day in txns.chunk_by(|a, b| a.get(..10) == b.get(..10)) {
        let mut left: Vec<&String> = day.to_vec();
        while !left.is_empty() {
            // The first whose asserted accounts no other remaining one posts to (else the first: a cycle is rare).
            let free = (0..left.len()).find(|&i| {
                let (_, asserted) = posts(left[i]);
                asserted.iter().all(|a| left.iter().enumerate().all(|(j, o)| j == i || !posts(o).0.contains(a)))
            }).unwrap_or(0);
            out.push(left.remove(free));
        }
    }
    out
}

fn note(p: &Planned, sha256: &str, archive: &str, today: chrono::NaiveDate) -> String {
    let st = &p.statement;
    let c = &st.currency;
    let mut s = format!("---\ntype: finance-statement\naccount: {}\npreset: {}\nsource: \"{}\"\nsha256: {sha256}\n", p.account, st.preset, st.source.replace('"', "'"));
    if !archive.is_empty() {
        let _ = writeln!(s, "archive: \"[[{archive}]]\"");
    }
    for (k, v) in [("from", st.from), ("to", st.to)] {
        if let Some(d) = v {
            let _ = writeln!(s, "{k}: {d}");
        }
    }
    for (k, v) in [("opening", st.opening), ("closing", st.closing)] {
        if let Some(q) = v {
            let _ = writeln!(s, "{k}: {} {c}", q.normalize());
        }
    }
    let _ = write!(s, "imported: {today}\nrows: {}\nnew: {}\nknown: {}\n---\n\n# {}\n\n", st.rows.len(), p.new.len(), p.known, p.note);
    let _ = writeln!(s, "The bank's file `{}`, read with the `{}` preset, is kept in `{archive}` as `{}.{}`. Its transactions link here.\n", st.source, st.preset, p.note, ext(&st.source));
    if !p.checks.is_empty() {
        s.push_str("| Balance | Date | Bank | Ledger |\n|---|---|---|---|\n");
        for k in &p.checks {
            let _ = writeln!(s, "| {} | {} | {} {c} | {} {c}{} |", k.what, k.date, k.bank, k.ledger, if k.bank == k.ledger { " ✓" } else { " ✗" });
        }
        s.push('\n');
    }
    if !st.skipped.is_empty() || !p.problems.is_empty() {
        s.push_str("## Not imported\n\n");
        for x in st.skipped.iter().chain(&p.problems) {
            let _ = writeln!(s, "- {x}");
        }
    }
    s
}
