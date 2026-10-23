//! Importer presets (docs/design/DESIGN-finance-import.md): a bank's export described as data, never as code. A preset is a
//! TOML file. The plugin ships one per export it has seen (`importers/*.toml`); a file in the vault's
//! `finance/importers/` adds a bank or, with the same `id`, replaces one. `extends = "norma43"` starts from another
//! preset and changes only what it writes (tables merge key by key), so another bank's Norma 43 is three lines.
//!
//! The engine knows file *formats* (CSV, a spreadsheet, fixed-width records, a PDF's or a text's lines). A preset names
//! where each field is in that format; the fields then mean the same for every bank (`statement::map`).
use regex::Regex;
use serde::Deserialize;
use std::collections::BTreeMap;

/// A field's place in a fixed-width record: `[from, to)` in characters.
pub type Span = [usize; 2];

/// Field values to test, `field = value` (case and accents ignored; `!value` = anything else; `*` = any non-empty;
/// `""` = empty or missing; `<=2026-02-06`, `>100` compare, as numbers or as text).
pub type When = BTreeMap<String, String>;

#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Preset {
    /// What an account note's `import:` names.
    pub id: String,
    /// The preset this one starts from (already merged in when read).
    pub extends: Option<String>,
    pub name: String,
    /// The folder under `statements/` its files are kept in.
    pub bank: String,
    /// Lower first in a batch: what feeds another account (a fund's cash leg, an account's card top-ups) goes first,
    /// so the other statement finds it written.
    #[serde(default = "one")]
    pub order: u32,
    #[serde(default)]
    pub detect: Detect,
    pub layout: Layout,
    /// `strftime` shapes tried first for dates; the usual bank shapes follow.
    #[serde(default)]
    pub dates: Vec<String>,
    /// The currency when the file does not say, and the codes it uses for them (`978: EUR`).
    pub currency: Option<String>,
    #[serde(default)]
    pub currency_codes: BTreeMap<String, String>,
    /// Numbers written without a decimal point, with this many implied decimals (Norma 43: 2).
    pub decimals: Option<u32>,
    /// A number field `x` is negative when field `x_sign` holds this (Norma 43: `1`, a debit).
    pub negative_sign: Option<String>,
    /// Templates tried in order (`{text2}`, `{kind} {fund}`); the first whose fields are all filled is the description.
    pub description: Vec<String>,
    /// The template of everything kept as `bank:`.
    pub bank_text: Option<String>,
    /// Text the bank writes for "nothing here" (`NO DISPONIBLE`): read as empty.
    #[serde(default)]
    pub empty_text: Vec<String>,
    #[serde(default)]
    pub skip: Vec<Skip>,
    #[serde(default)]
    pub rules: Vec<Rule>,
    /// When present, rows are fund operations: `kind` names the operation.
    pub funds: Option<Funds>,
    /// Fields made from others, `field = template` (`booked = "{day} {month} {year}"`); statement fields may be used.
    #[serde(default)]
    pub derive: BTreeMap<String, String>,
    /// The same for the statement's own fields (`from = "{start} {year}"`).
    #[serde(default)]
    pub derive_statement: BTreeMap<String, String>,
    /// Rows carry no amount, only the balance after them (columns a PDF's text cannot tell apart): each amount is
    /// its balance minus the one before, the first's minus `opening`.
    #[serde(default)]
    pub amount_from_balance: bool,
    /// Fields after the booked date that order a day's rows (`time`).
    #[serde(default)]
    pub sort: Vec<String>,
    /// A file holding several accounts' rows (an app's export): one statement per value of this field, which names
    /// its account.
    pub split_by: Option<String>,
    /// The file's account names → ledger accounts (`Wallet = "Assets:Cash"`), before any note is asked.
    #[serde(default)]
    pub accounts: BTreeMap<String, String>,
    /// The file's category names → ledger accounts (`Food = "Expenses:Food"`); a category not here becomes the
    /// ledger account whose last part it is, else `Expenses:<it>` (`Income:<it>` in a group named like income).
    #[serde(default)]
    pub categories: BTreeMap<String, String>,
}

fn one() -> u32 {
    1
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Detect {
    /// Every one of these appears in the file's first text (a sheet's first rows, a PDF's text).
    #[serde(default)]
    pub contains: Vec<String>,
    /// A regex the first line matches.
    pub first_line: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(tag = "format", rename_all = "lowercase", deny_unknown_fields)]
pub enum Layout {
    /// Columns by their header's text.
    Csv {
        #[serde(default = "comma")]
        delimiter: char,
        #[serde(default)]
        encoding: Encoding,
        columns: BTreeMap<String, String>,
    },
    /// The first sheet: statement fields in the cell after a label, rows under the header holding these columns.
    Sheet {
        #[serde(default)]
        labels: BTreeMap<String, String>,
        columns: BTreeMap<String, String>,
    },
    /// Lines that start with a record code; `movement` records start a row, `detail` ones add to it.
    Fixed {
        #[serde(default)]
        encoding: Encoding,
        records: BTreeMap<String, Record>,
    },
    /// A PDF's text (`pdftotext -layout`) or a text file, line by line.
    Pdf(TextLayout),
    Text(TextLayout),
}

fn comma() -> char {
    ','
}

#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct TextLayout {
    #[serde(default)]
    pub encoding: Encoding,
    /// Statement fields: a regex over the whole text whose first group is the value.
    #[serde(default)]
    pub find: BTreeMap<String, String>,
    /// A file holding several accounts: a line matching this begins one's section (its named groups are the
    /// section's fields, `account` naming it). Sections with the same `account` are one (a page's "continued").
    pub section: Option<String>,
    /// Like `find`, over each section's own lines (its opening balance).
    #[serde(default)]
    pub section_find: BTreeMap<String, String>,
    /// A regex a row's line matches; its named groups are the row's fields.
    pub row: String,
    /// Fields that, empty in a row, are the text of the lines just before it (a name the layout wrapped).
    #[serde(default)]
    pub fill_from_previous: Vec<String>,
}

#[derive(Debug, Clone, Copy, Default, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Encoding {
    #[default]
    Utf8,
    Latin1,
}

#[derive(Debug, Clone, Copy, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Role {
    Statement,
    Movement,
    Detail,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Record {
    pub role: Role,
    /// This record begins a statement (a file may hold several accounts' statements one after another).
    #[serde(default)]
    pub begins: bool,
    pub fields: BTreeMap<String, Span>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Skip {
    pub when: When,
    pub why: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Rule {
    pub when: When,
    /// `field: template`.
    pub set: BTreeMap<String, String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Funds {
    /// The bank's word for an operation → `buy` or `sell`.
    pub ops: BTreeMap<String, super::FundOp>,
}

/// The presets the plugin ships (the same files a vault copies to change one).
pub const BUILT_IN: [(&str, &str); 8] = [
    ("importers/enable-banking.toml", include_str!("../../../importers/enable-banking.toml")),
    ("importers/norma43.toml", include_str!("../../../importers/norma43.toml")),
    ("importers/revolut-csv.toml", include_str!("../../../importers/revolut-csv.toml")),
    ("importers/unicaja-card.toml", include_str!("../../../importers/unicaja-card.toml")),
    ("importers/unicaja-funds.toml", include_str!("../../../importers/unicaja-funds.toml")),
    ("importers/desjardins-pdf.toml", include_str!("../../../importers/desjardins-pdf.toml")),
    ("importers/unicaja-account.toml", include_str!("../../../importers/unicaja-account.toml")),
    ("importers/actual-csv.toml", include_str!("../../../importers/actual-csv.toml")),
];

impl Preset {
    /// What a preset must say for its rows to mean anything; its regexes compiled once to report a typo here.
    fn check(&self) -> Result<(), String> {
        let fields = self.fields();
        let has = |f: &str| fields.iter().any(|x| x == f) || self.derive.contains_key(f) || self.rules.iter().any(|r| r.set.contains_key(f));
        if !has("booked") {
            return Err("no field is `booked` (the date the bank booked a row)".into());
        }
        let money = if self.funds.is_some() { has("units") && has("total") } else { has("amount") || (has("debit") && has("credit")) || (self.amount_from_balance && has("balance")) };
        if !money {
            return Err(if self.funds.is_some() { "fund rows need `units` and `total`".into() } else { "no `amount` field (or `debit` and `credit`)".into() });
        }
        if self.description.is_empty() {
            return Err("`description` names no template".into());
        }
        if let Some(r) = &self.detect.first_line {
            Regex::new(r).map_err(|e| format!("detect.first_line: {e}"))?;
        }
        if let Layout::Pdf(t) | Layout::Text(t) = &self.layout {
            Regex::new(&t.row).map_err(|e| format!("layout.row: {e}"))?;
            if let Some(r) = &t.section {
                Regex::new(r).map_err(|e| format!("layout.section: {e}"))?;
            }
            for (k, r) in t.find.iter().chain(&t.section_find) {
                Regex::new(r).map_err(|e| format!("layout.find.{k}: {e}"))?;
            }
        }
        Ok(())
    }

    /// Every field name the layout fills.
    pub fn fields(&self) -> Vec<String> {
        match &self.layout {
            Layout::Csv { columns, .. } => columns.keys().cloned().collect(),
            Layout::Sheet { labels, columns } => labels.keys().chain(columns.keys()).cloned().collect(),
            Layout::Fixed { records, .. } => records.values().flat_map(|r| r.fields.keys().cloned()).collect(),
            Layout::Pdf(t) | Layout::Text(t) => {
                let groups = |r: &str| Regex::new(r).map(|r| r.capture_names().flatten().map(str::to_string).collect::<Vec<_>>()).unwrap_or_default();
                let mut names = groups(&t.row);
                names.extend(t.section.as_deref().map(groups).unwrap_or_default());
                t.find.keys().chain(t.section_find.keys()).cloned().chain(names).collect()
            }
        }
    }
}

/// The built-in presets, then the vault's (`(path, text)` of each `*.toml` under `finance/importers/`), the vault's
/// replacing a built-in of the same `id`. A broken file is an error for that file only.
pub fn presets(vault: &[(String, String)]) -> (Vec<Preset>, Vec<String>) {
    let mut errors = vec![];
    // Raw tables first, by id: `extends` merges a table over its parent's before any is typed.
    let mut raw: Vec<(String, String, toml::Table)> = vec![];
    for (path, text) in BUILT_IN.iter().map(|(p, t)| (p.to_string(), t.to_string())).chain(vault.iter().cloned()) {
        match text.parse::<toml::Table>() {
            Ok(t) => match t.get("id").and_then(toml::Value::as_str) {
                Some(id) => {
                    let id = id.to_string();
                    raw.retain(|(_, i, _)| *i != id);
                    raw.push((path, id, t));
                }
                None => errors.push(format!("{path}: no `id`")),
            },
            Err(e) => errors.push(format!("{path}: {e}")),
        }
    }
    let by_id: BTreeMap<&str, &toml::Table> = raw.iter().map(|(_, i, t)| (i.as_str(), t)).collect();
    let mut out = vec![];
    for (path, _, table) in &raw {
        let typed = resolve(table, &by_id, 0)
            .and_then(|t| toml::Value::Table(t).try_into::<Preset>().map_err(|e| e.to_string()))
            .and_then(|p| p.check().map(|_| p));
        match typed {
            Ok(p) => out.push(p),
            Err(e) => errors.push(format!("{path}: {e}")),
        }
    }
    (out, errors)
}

/// `table` merged over the chain of presets it extends.
fn resolve(table: &toml::Table, by_id: &BTreeMap<&str, &toml::Table>, depth: usize) -> Result<toml::Table, String> {
    let Some(parent) = table.get("extends").and_then(toml::Value::as_str) else { return Ok(table.clone()) };
    if depth > 8 {
        return Err(format!("`extends` goes round in a circle (at {parent})"));
    }
    let base = by_id.get(parent).ok_or_else(|| format!("extends `{parent}`, which no preset is"))?;
    let mut merged = resolve(base, by_id, depth + 1)?;
    merge(&mut merged, table);
    Ok(merged)
}

fn merge(into: &mut toml::Table, over: &toml::Table) {
    for (k, v) in over {
        match (into.get_mut(k), v) {
            (Some(toml::Value::Table(a)), toml::Value::Table(b)) => merge(a, b),
            _ => {
                into.insert(k.clone(), v.clone());
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_built_in_preset_reads() {
        let (presets, errors) = presets(&[]);
        assert!(errors.is_empty(), "{errors:?}");
        assert_eq!(presets.len(), BUILT_IN.len());
    }

    #[test]
    fn a_vault_file_replaces_a_built_in_and_a_broken_one_is_named() {
        let mine = "id = \"revolut-csv\"\nname = \"Mine\"\nbank = \"revolut\"\ndescription = [\"{description}\"]\n[layout]\nformat = \"csv\"\ncolumns = { booked = \"Date\", amount = \"Amount\", description = \"Text\" }\n";
        let broken = "id = \"x\"\nname = \"X\"\nbank = \"x\"\ndescription = [\"{a}\"]\n[layout]\nformat = \"csv\"\ncolumns = { amount = \"A\" }\n";
        let (presets, errors) = presets(&[("finance/importers/mine.toml".into(), mine.into()), ("finance/importers/x.toml".into(), broken.into())]);
        assert_eq!(presets.iter().find(|s| s.id == "revolut-csv").unwrap().name, "Mine");
        assert_eq!(presets.len(), BUILT_IN.len());
        assert!(errors[0].contains("x.toml") && errors[0].contains("booked"), "{errors:?}");
    }

    #[test]
    fn a_preset_extends_another() {
        let other = "id = \"sabadell-n43\"\nextends = \"norma43\"\nname = \"Sabadell\"\nbank = \"sabadell\"\n[layout]\nencoding = \"utf8\"\n";
        let (presets, errors) = presets(&[("finance/importers/sabadell.toml".into(), other.into())]);
        assert!(errors.is_empty(), "{errors:?}");
        let p = presets.iter().find(|p| p.id == "sabadell-n43").unwrap();
        assert_eq!((p.bank.as_str(), p.decimals), ("sabadell", Some(2)));
        let Layout::Fixed { encoding, records } = &p.layout else { panic!() };
        assert_eq!((*encoding, records.len()), (Encoding::Utf8, 5));
        assert_eq!(presets.iter().find(|p| p.id == "norma43").unwrap().bank, "unicaja");
    }
}
