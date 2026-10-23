//! A plugin's settings as a schema (`[[setting]]` in its plugin.toml): the kinds of field, `when` and
//! `group`, lists of records (`kind = "records"`: cards of fields, such as mail accounts), defaults,
//! and what saving the form does to the file (toml_edit, so comments stay) and to the secret store.
//! The manifest itself is plugins.rs; docs/guides/PLUGIN-API.md ("Settings") is the reference.
use serde::{Deserialize, Deserializer, Serialize};
use serde_json::{Map, Value};
use std::collections::BTreeMap;
use ts_rs::TS;

type Res<T> = std::result::Result<T, String>;

/// One value a `when` accepts: a choice or a text, or the state of a switch.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(untagged)]
#[ts(export)]
pub enum WhenValue {
    Flag(bool),
    Text(String),
}

/// `"outlook"` or `["outlook", "exchange"]`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(untagged)]
#[ts(export)]
pub enum WhenValues {
    One(WhenValue),
    Any(Vec<WhenValue>),
}

/// `when = { auth = "outlook" }`: the field is shown, and saved, only while every named sibling field
/// has one of those values (its default when it has none).
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct When(pub BTreeMap<String, WhenValues>);

impl When {
    pub fn holds(&self, value_of: impl Fn(&str) -> Option<Value>) -> bool {
        self.0.iter().all(|(key, want)| {
            let Some(v) = value_of(key) else { return false };
            let is = |w: &WhenValue| match w {
                WhenValue::Flag(b) => v.as_bool() == Some(*b),
                WhenValue::Text(s) => v.as_str() == Some(s.as_str()) || v.as_f64().is_some_and(|n| s.parse::<f64>().ok() == Some(n)),
            };
            match want {
                WhenValues::One(w) => is(w),
                WhenValues::Any(ws) => ws.iter().any(is),
            }
        })
    }
}

/// A button on each card of a records field: runs the plugin's own command `command` with
/// `{ setting, record }` (the field's key and the card's name).
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(deny_unknown_fields)]
#[ts(export)]
pub struct RecordAction {
    pub label: String,
    pub command: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub when: Option<When>,
}

/// A button under the list of cards (an import): runs the plugin's command with `{ setting }`.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(deny_unknown_fields)]
#[ts(export)]
pub struct ListAction {
    pub label: String,
    pub command: String,
}

/// A ready-made card offered by "Add account" (Gmail, Outlook…): its label and the values it starts with.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(deny_unknown_fields)]
#[ts(export)]
pub struct AccountPreset {
    pub label: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub hint: Option<String>,
    #[serde(default)]
    #[ts(type = "Record<string, unknown>")]
    pub values: Map<String, Value>,
}

/// `account = { … }` on a records field: its cards are accounts, listed with every other plugin's on Settings →
/// Accounts (docs/design/DESIGN-plugin-settings-v2.md §2). The helper methods answer about cards, saved or not.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(deny_unknown_fields)]
#[ts(export)]
pub struct AccountSpec {
    /// What one is, in a word: "Mail", "Calendar", "Bank".
    pub kind: String,
    /// A line under the name, from the card's fields: `"{user} · {imap_host}"`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub summary: Option<String>,
    /// Helper method: `{ setting, records }` → `{ "<card>": { state: "ok"|"warn"|"error"|"busy", text } }`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub status: Option<String>,
    /// Helper method: `{ setting, record: {…the card as typed} }` → `{ ok, text }`; called before saving.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub test: Option<String>,
    #[serde(default)]
    pub presets: Vec<AccountPreset>,
}

/// What a records field holds: its cards' fields, and the buttons around them.
#[derive(Debug, Clone, Serialize, TS)]
#[ts(export)]
pub struct Records {
    /// The fields of one card (never records again). The naming field is always among them.
    pub fields: Vec<SettingField>,
    /// The label of the button that adds a card.
    pub add: String,
    /// The key of the field that names each card: unique, `[A-Za-z0-9_.@-]+`, fixed once saved.
    pub name: String,
    pub actions: Vec<RecordAction>,
    pub list_actions: Vec<ListAction>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub account: Option<AccountSpec>,
}

/// What a setting's value is, which is also the control it gets in the form.
#[derive(Debug, Clone, Serialize, TS)]
#[serde(tag = "kind", rename_all = "lowercase")]
#[ts(export)]
pub enum SettingKind {
    Text,
    /// Text of several lines (a signature, a template): a box in the form, not a line.
    Longtext,
    Number,
    Toggle,
    /// Several values (a TOML array of strings).
    List,
    /// One of `choices`.
    Choice { choices: Vec<String> },
    /// A token or a password: kept in the secret store outside the vault (secrets.rs), never in
    /// `plugin.toml`; the form shows only whether it is set. Needs `[permissions] secrets = true`.
    Secret,
    /// A list of cards, each a set of fields: `[[settings.<key>]]` tables in plugin.toml. A secret of
    /// a card is kept as `<key>.<name>.<field>`.
    Records(Box<Records>),
}

/// One `[[setting]]` of a plugin's manifest (or one field of a records card).
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(try_from = "RawField")]
#[ts(export)]
pub struct SettingField {
    pub key: String,
    /// Shown beside the control (default: the key).
    pub label: String,
    #[serde(flatten)]
    pub kind: SettingKind,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub hint: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub when: Option<When>,
    /// Fields of one group are drawn together under a heading that starts closed.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub group: Option<String>,
    /// Shown, not typed: the plugin sets it (a sign-in token); the form says only whether it is set.
    pub readonly: bool,
    /// Stands in while the settings do not have the key.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional, type = "unknown")]
    pub default: Option<toml::Value>,
    /// A text field's suggestions: the helper method that lists them (`[{value, label}]`), asked when the
    /// form opens — what is installed on the machine (the Claude plugin's commands and accounts).
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub suggest: Option<String>,
    /// Folded under "Advanced" at the end of its group.
    pub advanced: bool,
    /// Kept in the settings but not in the form: written by the plugin's own page (a pane's colours, what it hides).
    pub hidden: bool,
}

/// The kinds as they are written in a manifest.
#[derive(Debug, Clone, Copy, PartialEq, Deserialize)]
#[serde(rename_all = "lowercase")]
enum KindName {
    Text,
    Longtext,
    Number,
    Toggle,
    List,
    Choice,
    Secret,
    Records,
}

/// A `[[setting]]` as written: every key a kind may have. `SettingField::try_from` checks that each
/// key fits the kind, so a typo or a misplaced key is the manifest's error, not a silent no-op.
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct RawField {
    key: String,
    #[serde(default)]
    label: String,
    kind: KindName,
    #[serde(default)]
    hint: Option<String>,
    #[serde(default)]
    choices: Option<Vec<String>>,
    #[serde(default)]
    default: Option<toml::Value>,
    #[serde(default)]
    when: Option<When>,
    #[serde(default)]
    group: Option<String>,
    #[serde(default)]
    readonly: bool,
    #[serde(default)]
    fields: Option<Vec<SettingField>>,
    #[serde(default)]
    add: Option<String>,
    #[serde(default)]
    name: Option<String>,
    #[serde(default)]
    actions: Option<Vec<RecordAction>>,
    #[serde(default)]
    list_actions: Option<Vec<ListAction>>,
    #[serde(default)]
    suggest: Option<String>,
    #[serde(default)]
    account: Option<AccountSpec>,
    #[serde(default)]
    advanced: bool,
    #[serde(default)]
    hidden: bool,
}

impl TryFrom<RawField> for SettingField {
    type Error = String;
    fn try_from(r: RawField) -> Res<Self> {
        let key = r.key;
        let only = |what: &str, set: bool, kind: &str| if set { Err(format!("setting {key}: `{what}` is only for kind = \"{kind}\"")) } else { Ok(()) };
        if r.kind != KindName::Choice {
            only("choices", r.choices.is_some(), "choice")?;
        }
        if r.kind != KindName::Text {
            only("suggest", r.suggest.is_some(), "text")?;
        }
        if r.kind != KindName::Records {
            for (what, set) in [("fields", r.fields.is_some()), ("add", r.add.is_some()), ("name", r.name.is_some()), ("actions", r.actions.is_some()), ("list_actions", r.list_actions.is_some()), ("account", r.account.is_some())] {
                only(what, set, "records")?;
            }
        }
        let kind = match r.kind {
            KindName::Text => SettingKind::Text,
            KindName::Longtext => SettingKind::Longtext,
            KindName::Number => SettingKind::Number,
            KindName::Toggle => SettingKind::Toggle,
            KindName::List => SettingKind::List,
            KindName::Secret => SettingKind::Secret,
            KindName::Choice => SettingKind::Choice { choices: r.choices.unwrap_or_default() },
            KindName::Records => {
                if r.default.is_some() {
                    return Err(format!("setting {key}: a list of records has no default"));
                }
                let mut rec = records(&key, r.fields.unwrap_or_default(), r.add, r.name, r.actions.unwrap_or_default(), r.list_actions.unwrap_or_default())?;
                rec.account = r.account;
                SettingKind::Records(Box::new(rec))
            }
        };
        let label = if r.label.is_empty() { key.clone() } else { r.label };
        Ok(Self { key, label, kind, hint: r.hint, when: r.when, group: r.group, readonly: r.readonly, default: r.default, suggest: r.suggest, advanced: r.advanced, hidden: r.hidden })
    }
}

/// A records field's parts, checked: no records inside records, a naming text field (added when the
/// manifest does not declare one), and `when`s that name fields of the card.
fn records(key: &str, mut fields: Vec<SettingField>, add: Option<String>, name: Option<String>, actions: Vec<RecordAction>, list_actions: Vec<ListAction>) -> Res<Records> {
    if let Some(f) = fields.iter().find(|f| matches!(f.kind, SettingKind::Records(_))) {
        return Err(format!("setting {key}: field {} is a list of records inside a list of records, which is not supported", f.key));
    }
    let name = name.unwrap_or_else(|| "name".into());
    match fields.iter().find(|f| f.key == name) {
        None => fields.insert(0, SettingField { key: name.clone(), label: "Name".into(), kind: SettingKind::Text, hint: None, when: None, group: None, readonly: false, default: None, suggest: None, advanced: false, hidden: false }),
        Some(f) if !matches!(f.kind, SettingKind::Text) || f.when.is_some() || f.readonly || f.default.is_some() => {
            return Err(format!("setting {key}: the naming field {name} must be a plain text field (no when, readonly or default)"));
        }
        Some(_) => {}
    }
    check_siblings(&fields).map_err(|e| format!("setting {key}: {e}"))?;
    for a in &actions {
        if let Some(missing) = a.when.iter().flat_map(|w| w.0.keys()).find(|k| !fields.iter().any(|f| &f.key == *k)) {
            return Err(format!("setting {key}: action {:?} has a when on {missing}, which is not a field of a record", a.label));
        }
    }
    Ok(Records { fields, add: add.unwrap_or_else(|| "Add".into()), name, actions, list_actions, account: None })
}

/// Keys are unique among siblings, and a `when` names a sibling (not the field itself).
fn check_siblings(fields: &[SettingField]) -> Res<()> {
    for (i, f) in fields.iter().enumerate() {
        if fields[..i].iter().any(|g| g.key == f.key) {
            return Err(format!("the key {} is declared twice", f.key));
        }
        for k in f.when.iter().flat_map(|w| w.0.keys()) {
            if k == &f.key || !fields.iter().any(|g| &g.key == k) {
                return Err(format!("setting {}: its when names {k}, which is not another setting beside it", f.key));
            }
        }
    }
    Ok(())
}

/// `[[setting]]` of a manifest, read and checked as a whole (serde `deserialize_with`).
pub fn checked_fields<'de, D: Deserializer<'de>>(d: D) -> std::result::Result<Vec<SettingField>, D::Error> {
    let fields = Vec::<SettingField>::deserialize(d)?;
    check_siblings(&fields).map_err(serde::de::Error::custom)?;
    Ok(fields)
}

/// A card's name: what its secrets are kept under, so plain and short.
pub fn valid_record_name(name: &str) -> bool {
    !name.is_empty() && name.len() <= 100 && name.chars().all(|c| c.is_ascii_alphanumeric() || "_.@-".contains(c))
}

fn empty(v: &Value) -> bool {
    v.is_null() || v.as_str().is_some_and(|s| s.trim().is_empty()) || v.as_array().is_some_and(Vec::is_empty)
}

impl SettingField {
    fn default_json(&self) -> Option<Value> {
        self.default.as_ref().and_then(|d| serde_json::to_value(d).ok())
    }

    fn applies(&self, value_of: impl Fn(&str) -> Option<Value>) -> bool {
        self.when.as_ref().is_none_or(|w| w.holds(value_of))
    }

    /// The TOML value for what the form sent, or why it will not do. `None` = take the key out
    /// (empty, or the default: the file says only what was chosen).
    fn value(&self, v: &Value) -> Res<Option<toml_edit::Value>> {
        use toml_edit::Value as T;
        if empty(v) || self.default_json().as_ref() == Some(v) {
            return Ok(None);
        }
        let key = &self.key;
        let wrong = |want: &str| format!("{key}: {want} expected");
        Ok(Some(match &self.kind {
            SettingKind::Text | SettingKind::Longtext => T::from(v.as_str().ok_or_else(|| wrong("text"))?),
            SettingKind::Secret => return Err(format!("{key}: a secret is not written to plugin.toml")),
            SettingKind::Records(_) => return Err(format!("{key}: a list of records is not a single value")),
            SettingKind::Choice { choices } => {
                let s = v.as_str().ok_or_else(|| wrong("one of the choices"))?;
                if !choices.iter().any(|c| c == s) {
                    return Err(format!("{key}: {s:?} is not one of {choices:?}"));
                }
                T::from(s)
            }
            SettingKind::Toggle => T::from(v.as_bool().ok_or_else(|| wrong("true or false"))?),
            SettingKind::Number => match (v.as_i64(), v.as_f64()) {
                (Some(i), _) => T::from(i),
                (_, Some(x)) if x.is_finite() => T::from(x),
                _ => return Err(wrong("a number")),
            },
            SettingKind::List => {
                let items = v.as_array().ok_or_else(|| wrong("a list"))?;
                let mut a = toml_edit::Array::new();
                for it in items {
                    a.push(it.as_str().ok_or_else(|| wrong("a list of texts"))?);
                }
                T::Array(a)
            }
        }))
    }
}

/// The settings with each declared field's default where the key is missing — inside every card of
/// a records field too (a records field missing altogether is an empty list). A field whose `when`
/// does not hold gets no default.
pub fn with_defaults(settings: &toml::Table, fields: &[SettingField]) -> toml::Table {
    let mut t = settings.clone();
    fill(&mut t, fields);
    t
}

fn fill(t: &mut toml::Table, fields: &[SettingField]) {
    // the unconditional ones first: a `when` reads their defaults
    for f in fields.iter().filter(|f| f.when.is_none()).chain(fields.iter().filter(|f| f.when.is_some())) {
        let lookup = |k: &str| t.get(k).and_then(|v| serde_json::to_value(v).ok());
        if !f.applies(lookup) {
            continue;
        }
        match &f.kind {
            SettingKind::Records(r) => match t.get_mut(&f.key) {
                Some(toml::Value::Array(cards)) => cards.iter_mut().filter_map(toml::Value::as_table_mut).for_each(|c| fill(c, &r.fields)),
                Some(_) => {} // written by hand as something else: left for the plugin to see
                None => drop(t.insert(f.key.clone(), toml::Value::Array(Vec::new()))),
            },
            _ => {
                if let (false, Some(d)) = (t.contains_key(&f.key), &f.default) {
                    t.insert(f.key.clone(), d.clone());
                }
            }
        }
    }
}

/// What saving the form changes: the new plugin.toml, and the secrets to set and to forget.
#[derive(Debug)]
pub struct Saved {
    pub text: String,
    pub set: Vec<(String, String)>,
    pub forget: Vec<String>,
    /// Secrets of a renamed card, moved: (old name, new name) in the store.
    pub moved: Vec<(String, String)>,
    /// The cards renamed: (records key, old name, new name), told to the plugin.
    pub renamed: Vec<(String, String, String)>,
}

/// On a card the form sends: the name it was saved under, when the user renamed it (never written to the file).
pub const RENAMED_FROM: &str = "renamed_from";

/// The names of the cards a records value holds (in the file).
fn card_names(v: Option<&toml::Value>, name_key: &str) -> Vec<String> {
    v.and_then(toml::Value::as_array).into_iter().flatten().filter_map(|c| c.get(name_key)?.as_str().map(str::to_string)).collect()
}

/// Writes the declared settings the form sent into `[settings]` of `text` (a plugin.toml; comments and
/// everything else stay). A key sent empty, or equal to its default, is taken out, so the default
/// applies; a field whose `when` does not hold is taken out too. A records field is replaced whole
/// by the list sent (its order is the cards' order); the secrets of a card no longer in it are
/// forgotten. A key that is not a declared field is refused — unless it is sent as null, which takes
/// an old key out (a plugin moving its settings). Anything refused: nothing is written.
pub fn apply(id: &str, text: &str, fields: &[SettingField], current: &toml::Table, may_keep_secrets: bool, values: &Map<String, Value>) -> Res<Saved> {
    let mut doc: toml_edit::DocumentMut = text.parse().map_err(|e| format!("plugin.toml: {e}"))?;
    let now = with_defaults(current, fields);
    // a sibling's value for `when`: as sent (emptied = its default), else as the file has it
    let value_of = |k: &str| match values.get(k) {
        Some(v) if !empty(v) => Some(v.clone()),
        Some(_) => fields.iter().find(|f| f.key == k).and_then(SettingField::default_json),
        None => now.get(k).and_then(|v| serde_json::to_value(v).ok()),
    };
    let secret = |name: String, f: &SettingField, v: &Value, set: &mut Vec<(String, String)>| -> Res<()> {
        // the form never shows a secret, so an empty field means "as it is", not "forget it"
        if let Some(text) = v.as_str().filter(|s| !s.is_empty()) {
            if f.readonly {
                return Err(format!("{name}: set by the plugin, not by the form"));
            }
            if !may_keep_secrets {
                return Err(format!("{name}: plugin {id} keeps no secrets — add [permissions] secrets = true"));
            }
            set.push((name, text.to_string()));
        }
        Ok(())
    };
    let (mut changes, mut set, mut forget, mut moved, mut renamed) = (Vec::new(), Vec::new(), Vec::new(), Vec::new(), Vec::new());
    for (key, v) in values {
        let Some(f) = fields.iter().find(|f| &f.key == key) else {
            if v.is_null() {
                changes.push((key.clone(), None));
                continue;
            }
            return Err(format!("{key}: not a setting of plugin {id} (declare it with [[setting]])"));
        };
        let shown = f.applies(value_of);
        match &f.kind {
            SettingKind::Secret if shown => secret(key.clone(), f, v, &mut set)?,
            SettingKind::Secret => {}
            // hidden, a list of cards is left as it is: switching a field must not throw cards away
            SettingKind::Records(_) if !shown => {}
            SettingKind::Records(r) => {
                let (item, names, renames) = cards(f, r, v, &mut |name, sf, v| secret(name, sf, v, &mut set))?;
                let had = card_names(current.get(key), &r.name);
                let secret_fields = || r.fields.iter().filter(|sf| matches!(sf.kind, SettingKind::Secret));
                // a renamed card keeps its secrets under its new name; only cards really gone forget theirs
                for (from, to) in renames.iter().filter(|(from, _)| had.contains(from)) {
                    moved.extend(secret_fields().map(|sf| (format!("{key}.{from}.{}", sf.key), format!("{key}.{to}.{}", sf.key))));
                    renamed.push((key.clone(), from.clone(), to.clone()));
                }
                for gone in had.into_iter().filter(|n| !names.contains(n) && !renames.iter().any(|(from, _)| from == n)) {
                    forget.extend(secret_fields().map(|sf| format!("{key}.{gone}.{}", sf.key)));
                }
                changes.push((key.clone(), item));
            }
            _ if !shown => changes.push((key.clone(), None)),
            _ => changes.push((key.clone(), f.value(v)?.map(toml_edit::Item::Value))),
        }
    }
    if !doc.contains_key("settings") {
        // before the [[setting]] tables: a table written after them would read as part of the last one
        let mut t = toml_edit::Table::new();
        t.set_position(Some(0));
        doc.insert("settings", toml_edit::Item::Table(t));
    }
    let table = doc["settings"].as_table_mut().ok_or("plugin.toml: settings is not a table")?;
    for (key, item) in changes {
        match item {
            // a key already there keeps what is written around it (a comment at the end of its line)
            Some(toml_edit::Item::Value(mut v)) => {
                if let Some(old) = table.get(&key).and_then(toml_edit::Item::as_value) {
                    *v.decor_mut() = old.decor().clone();
                }
                table[key.as_str()] = toml_edit::Item::Value(v);
            }
            Some(mut item) => {
                place_under(table.position(), &mut item);
                table[key.as_str()] = item;
            }
            None => drop(table.remove(&key)),
        }
    }
    Ok(Saved { text: doc.to_string(), set, forget, moved, renamed })
}

/// Cards written as `[[settings.<key>]]` print right after `[settings]` (toml_edit orders tables by
/// position), not among the `[[setting]]` tables of the manifest.
pub fn place_under(position: Option<isize>, item: &mut toml_edit::Item) {
    if let Some(aot) = item.as_array_of_tables_mut() {
        aot.iter_mut().for_each(|t| t.set_position(position));
    }
}

/// The cards the form sent, as an array of tables (None when there are none), their names, and the renamed ones
/// (`renamed_from` → the name now).
type Cards = (Option<toml_edit::Item>, Vec<String>, Vec<(String, String)>);
fn cards(f: &SettingField, r: &Records, v: &Value, secret: &mut dyn FnMut(String, &SettingField, &Value) -> Res<()>) -> Res<Cards> {
    let key = &f.key;
    let list = if v.is_null() { &Vec::new() } else { v.as_array().ok_or_else(|| format!("{key}: a list of records expected"))? };
    let (mut aot, mut names, mut renames) = (toml_edit::ArrayOfTables::new(), Vec::<String>::new(), Vec::new());
    for card in list {
        let card = card.as_object().ok_or_else(|| format!("{key}: each record is an object of its fields"))?;
        if let Some(k) = card.keys().find(|k| *k != RENAMED_FROM && !r.fields.iter().any(|sf| &sf.key == *k)) {
            return Err(format!("{key}: {k} is not a field of a record"));
        }
        let name = card.get(&r.name).and_then(Value::as_str).map(str::trim).unwrap_or_default().to_string();
        if !valid_record_name(&name) {
            return Err(format!("{key}: the {} {name:?} — letters, digits and . @ - _ only, at most 100", r.name));
        }
        if names.contains(&name) {
            return Err(format!("{key}: two records are named {name}"));
        }
        let value_of = |k: &str| match card.get(k) {
            Some(v) if !empty(v) => Some(v.clone()),
            _ => r.fields.iter().find(|sf| sf.key == k).and_then(SettingField::default_json),
        };
        let mut t = toml_edit::Table::new();
        for sf in r.fields.iter().filter(|sf| sf.applies(value_of)) {
            let v = card.get(&sf.key).unwrap_or(&Value::Null);
            if sf.key == r.name {
                t.insert(&sf.key, toml_edit::value(name.as_str()));
            } else if matches!(sf.kind, SettingKind::Secret) {
                secret(format!("{key}.{name}.{}", sf.key), sf, v)?;
            } else if let Some(val) = sf.value(v).map_err(|e| format!("{key} {name}: {e}"))? {
                t.insert(&sf.key, toml_edit::Item::Value(val));
            }
        }
        if let Some(from) = card.get(RENAMED_FROM).and_then(Value::as_str).map(str::trim).filter(|from| !from.is_empty() && *from != name) {
            renames.push((from.to_string(), name.clone()));
        }
        names.push(name);
        aot.push(t);
    }
    Ok(((!aot.is_empty()).then_some(toml_edit::Item::ArrayOfTables(aot)), names, renames))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[derive(Debug, Deserialize)]
    struct M {
        #[serde(default)]
        settings: toml::Table,
        #[serde(rename = "setting", deserialize_with = "checked_fields")]
        fields: Vec<SettingField>,
    }
    fn manifest(text: &str) -> Res<M> {
        toml::from_str(text).map_err(|e| e.to_string())
    }
    const MAIL: &str = r#"# mail
title = "Mail"

[settings]
folder = "notes/mail" # where saved mail goes

[[setting]]
key = "accounts"
kind = "records"
add = "Add account"
actions = [{ label = "Sign in", command = "signin", when = { auth = "outlook" } }]
list_actions = [{ label = "Import…", command = "import" }]
fields = [
  { key = "auth", kind = "choice", choices = ["password", "outlook"], default = "password" },
  { key = "user", kind = "text" },
  { key = "password", kind = "secret", when = { auth = "password" } },
  { key = "imap_port", kind = "number", default = 993, group = "Servers", when = { auth = "password" } },
  { key = "tenant", kind = "text", default = "common", group = "Outlook", when = { auth = "outlook" } },
  { key = "oauth_refresh", kind = "secret", readonly = true, when = { auth = "outlook" } },
]

[[setting]]
key = "folder"
kind = "text"
"#;

    #[test]
    fn a_records_field_is_checked_when_the_manifest_is_read() {
        let m = manifest(MAIL).unwrap();
        let SettingKind::Records(r) = &m.fields[0].kind else { panic!("records") };
        assert_eq!((r.name.as_str(), r.fields[0].key.as_str(), r.add.as_str()), ("name", "name", "Add account"), "the naming field is added when not declared");
        assert_eq!(r.fields[0].label, "Name");
        let bad = |field: &str| manifest(&format!("[[setting]]\n{field}\n")).unwrap_err();
        assert!(bad("key = \"a\"\nkind = \"records\"\nfields = [{ key = \"b\", kind = \"records\" }]").contains("inside a list of records"));
        assert!(bad("key = \"a\"\nkind = \"text\"\nchoices = [\"x\"]").contains("only for kind = \"choice\""));
        assert!(bad("key = \"a\"\nkind = \"text\"\nfields = []").contains("only for kind = \"records\""));
        assert!(bad("key = \"a\"\nkind = \"text\"\nwhen = { b = \"x\" }").contains("not another setting"));
        assert!(bad("key = \"a\"\nkind = \"records\"\nfields = [{ key = \"x\", kind = \"text\", when = { y = \"1\" } }]").contains("not another setting"));
        assert!(bad("key = \"a\"\nkind = \"records\"\nname = \"n\"\nfields = [{ key = \"n\", kind = \"number\" }]").contains("plain text field"));
        assert!(bad("key = \"a\"\nkind = \"records\"\nactions = [{ label = \"x\", command = \"c\", when = { z = \"1\" } }]").contains("not a field of a record"));
        assert!(bad("key = \"a\"\nkind = \"number\"\nsuggest = \"m\"").contains("only for kind = \"text\""));
        let ok = manifest("[[setting]]\nkey = \"a\"\nkind = \"text\"\nsuggest = \"commands\"\n").unwrap();
        assert_eq!(ok.fields[0].suggest.as_deref(), Some("commands"), "a text field names the helper method of its suggestions");
        assert!(bad("key = \"a\"\nkind = \"text\"\nbogus = 1").contains("bogus"), "unknown keys are still refused");
        assert!(manifest("[[setting]]\nkey = \"a\"\nkind = \"text\"\n[[setting]]\nkey = \"a\"\nkind = \"number\"\n").unwrap_err().contains("twice"));
    }

    #[test]
    fn when_compares_texts_switches_and_lists_of_values() {
        let w: When = toml::from_str("auth = [\"a\", \"b\"]\non = true\n").unwrap();
        fn v(auth: &'static str, on: bool) -> impl Fn(&str) -> Option<Value> {
            move |k| Some(if k == "auth" { json!(auth) } else { json!(on) })
        }
        assert!(w.holds(v("b", true)));
        assert!(!w.holds(v("c", true)) && !w.holds(v("a", false)));
        assert!(!w.holds(|_| None), "no value: does not hold");
    }

    #[test]
    fn cards_are_saved_as_tables_with_their_secrets_in_the_store_and_read_back_with_defaults() {
        let m = manifest(MAIL).unwrap();
        let cards = json!({ "accounts": [
            { "name": "work", "auth": "outlook", "user": "me@work.example.org", "tenant": "common", "imap_port": 143, "password": "ignored: hidden" },
            { "name": "home", "auth": "password", "user": "me@home.example.org", "password": "pw1", "imap_port": 993 },
        ] });
        let s = apply("mail", MAIL, &m.fields, &m.settings, true, cards.as_object().unwrap()).unwrap();
        assert_eq!(s.set, [("accounts.home.password".to_string(), "pw1".to_string())], "a hidden secret is not kept; the shown one is, by card");
        assert!(s.forget.is_empty());
        assert!(s.text.starts_with("# mail\n") && s.text.contains("folder = \"notes/mail\" # where saved mail goes"), "{}", s.text);
        let own = &s.text[..s.text.find("[[setting]]").unwrap()];
        assert!(!own.contains("pw1") && !own.contains("143") && !own.contains("tenant") && !own.contains("993"), "secrets, hidden fields and defaults stay out:\n{own}");
        let saved = manifest(&s.text).expect("the file still parses");
        assert!(s.text.find("[[settings.accounts]]").unwrap() < s.text.find("[[setting]]").unwrap(), "the cards sit under [settings]:\n{}", s.text);
        let read = serde_json::to_value(with_defaults(&saved.settings, &saved.fields)).unwrap();
        assert_eq!(read["accounts"], json!([
            { "name": "work", "auth": "outlook", "user": "me@work.example.org", "tenant": "common" },
            { "name": "home", "auth": "password", "user": "me@home.example.org", "imap_port": 993 },
        ]), "the plugin gets each card with the defaults of the fields that apply");

        // reordered (the first card is the main one) and one removed: its secrets are forgotten
        let next = json!({ "accounts": [{ "name": "home", "user": "me@home.example.org" }] });
        let s2 = apply("mail", &s.text, &saved.fields, &saved.settings, true, next.as_object().unwrap()).unwrap();
        assert_eq!(s2.forget, ["accounts.work.password", "accounts.work.oauth_refresh"]);
        assert!(s2.set.is_empty(), "an empty secret leaves the stored one as it is");
        // none left: the key goes, and reads as an empty list
        let s3 = apply("mail", &s2.text, &saved.fields, &manifest(&s2.text).unwrap().settings, true, json!({ "accounts": [] }).as_object().unwrap()).unwrap();
        assert!(!s3.text.contains("settings.accounts"), "{}", s3.text);
        assert_eq!(with_defaults(&manifest(&s3.text).unwrap().settings, &saved.fields)["accounts"], toml::Value::Array(vec![]));
    }

    #[test]
    fn bad_cards_are_refused_and_nothing_is_written() {
        let m = manifest(MAIL).unwrap();
        let refused = |v: Value| apply("mail", MAIL, &m.fields, &m.settings, true, v.as_object().unwrap()).unwrap_err();
        assert!(refused(json!({ "accounts": [{ "name": "a b" }] })).contains("letters, digits"));
        assert!(refused(json!({ "accounts": [{ "user": "x" }] })).contains("letters, digits"), "a card needs a name");
        assert!(refused(json!({ "accounts": [{ "name": "a" }, { "name": "a" }] })).contains("two records"));
        assert!(refused(json!({ "accounts": [{ "name": "a", "port": 1 }] })).contains("not a field of a record"));
        assert!(refused(json!({ "accounts": [{ "name": "a", "auth": "carrier pigeon" }] })).contains("not one of"));
        assert!(refused(json!({ "accounts": [{ "name": "a", "auth": "outlook", "oauth_refresh": "typed" }] })).contains("set by the plugin"));
        assert!(refused(json!({ "accounts": "a" })).contains("a list of records"));
        let no_perm = apply("mail", MAIL, &m.fields, &m.settings, false, json!({ "accounts": [{ "name": "a", "password": "x" }] }).as_object().unwrap());
        assert!(no_perm.unwrap_err().contains("keeps no secrets"));
        assert!(refused(json!({ "imap_host": "x" })).contains("not a setting"));
        // an old key the plugin no longer declares is taken out when sent as null (a plugin moving its settings)
        let old = "title = \"Mail\"\n\n[settings]\nuser = \"old\"\nfolder = \"x\"\n\n[[setting]]\nkey = \"folder\"\nkind = \"text\"\n";
        let mo = manifest(old).unwrap();
        let s = apply("mail", old, &mo.fields, &mo.settings, true, json!({ "user": null }).as_object().unwrap()).unwrap();
        assert!(!s.text.contains("user") && s.text.contains("folder = \"x\""), "{}", s.text);
    }

    #[test]
    fn a_top_level_field_whose_when_does_not_hold_is_taken_out() {
        let text = "title = \"T\"\n\n[settings]\nmode = \"b\"\nextra = \"kept while b\"\n\n[[setting]]\nkey = \"mode\"\nkind = \"choice\"\nchoices = [\"a\", \"b\"]\ndefault = \"a\"\n\n[[setting]]\nkey = \"extra\"\nkind = \"text\"\nwhen = { mode = \"b\" }\ngroup = \"More\"\n";
        let m = manifest(text).unwrap();
        assert_eq!(m.fields[1].group.as_deref(), Some("More"));
        let s = apply("t", text, &m.fields, &m.settings, false, json!({ "mode": null, "extra": "typed" }).as_object().unwrap()).unwrap();
        let own = &s.text[..s.text.find("[[setting]]").unwrap()];
        assert!(!own.contains("extra") && !own.contains("mode ="), "mode emptied → its default a → extra hidden → out:\n{own}");
    }

    /// A `longtext` (a signature) keeps its lines through plugin.toml, top level and in a card.
    #[test]
    fn a_long_text_keeps_its_lines() {
        let text = "title = \"T\"\n\n[[setting]]\nkey = \"sig\"\nkind = \"longtext\"\n\n[[setting]]\nkey = \"cards\"\nkind = \"records\"\nfields = [{ key = \"name\", kind = \"text\" }, { key = \"sig\", kind = \"longtext\" }]\n";
        let m = manifest(text).unwrap();
        assert!(matches!(m.fields[0].kind, SettingKind::Longtext));
        let sig = "-- \nAda Lovelace\n\"Analytical\" Engines";
        let s = apply("t", text, &m.fields, &m.settings, false, json!({ "sig": sig, "cards": [{ "name": "a", "sig": sig }] }).as_object().unwrap()).unwrap();
        let back: toml::Value = toml::from_str(&s.text).unwrap();
        assert_eq!(back["settings"]["sig"].as_str(), Some(sig));
        assert_eq!(back["settings"]["cards"][0]["sig"].as_str(), Some(sig));
    }
}
