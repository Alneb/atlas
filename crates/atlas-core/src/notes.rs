//! New notes from templates (docs/guides/NOTES-SYSTEM.md). A template is a plain note in the templates
//! folder; `{{date}}`, `{{time}}` and `{{title}}` in it are filled in (the syntax of Obsidian's core
//! Templates plugin). A new note never replaces a file: a taken name gets " 2", " 3"…
use crate::api::{NewNote, NewNoteResult};
use crate::config::Config;
use crate::{paths, Error, Result};
use chrono::NaiveDateTime;
use serde::Serialize;
use serde_json::{Map, Value};
use std::path::Path;

/// What a fleeting note is when the vault has no `fleeting` template of its own.
const FLEETING: &str = "---\ntype: fleeting\ncreated: {{date}}\n---\n";
const TITLE_CHARS: usize = 60;

/// A file name out of a title: path separators and characters file systems reject become spaces.
pub(crate) fn file_stem(title: &str) -> String {
    let clean: String = title.chars().map(|c| if c.is_control() || r#"\/:*?"<>|#^[]"#.contains(c) { ' ' } else { c }).collect();
    let short: String = clean.split_whitespace().collect::<Vec<_>>().join(" ").chars().take(TITLE_CHARS).collect();
    short.trim().trim_start_matches('.').trim().to_string() // a leading dot hides a file; a trailing one is a name ("2026-03-07 sáb.")
}

/// One Templater tag's value (`<% … %>`), for the tags the user's templates use: `tp.file.title`,
/// `tp.file.creation_date("fmt")`, `tp.date.now("fmt", offset_days, …)`, `tp.file.cursor()` (where
/// the caret goes: an empty value), and a quoted string. Anything else — and every `<%* … %>` script
/// block — is not run: None, and the tag stays as written, visible, so nothing is silently dropped.
fn templater_tag(expr: &str, title: &str, now: NaiveDateTime) -> Option<String> {
    let e = expr.trim();
    let args = |name: &str| -> Option<Vec<String>> {
        let inner = e.strip_prefix(name)?.trim().strip_prefix('(')?.strip_suffix(')')?;
        Some(inner.split(',').map(|a| a.trim().trim_matches(|c| c == '"' || c == '\'').to_string()).filter(|a| !a.is_empty()).collect())
    };
    let fmt = |f: &str, when: NaiveDateTime| crate::bases::dates::format(&when, if f.is_empty() { "YYYY-MM-DD" } else { f });
    if e == "tp.file.title" {
        return Some(title.to_string());
    }
    if let Some(a) = args("tp.file.creation_date") {
        return Some(fmt(a.first().map_or("", String::as_str), now));
    }
    if let Some(a) = args("tp.date.now") {
        let days: i64 = a.get(1).and_then(|d| d.parse().ok()).unwrap_or(0);
        // a reference date read from the title (`tp.file.title` with a YYYY-MM-DD format): a daily note made for another day
        let base = match (a.get(2).map(String::as_str), a.get(3)) {
            (Some("tp.file.title"), Some(f)) if f.starts_with("YYYY-MM-DD") => {
                chrono::NaiveDate::parse_from_str(title.get(..10).unwrap_or(""), "%Y-%m-%d").ok().map(|d| d.and_time(now.time())).unwrap_or(now)
            }
            _ => now,
        };
        return Some(fmt(a.first().map_or("", String::as_str), base + chrono::Duration::days(days)));
    }
    if args("tp.file.cursor").is_some() {
        return Some(String::new());
    }
    let quoted = e.len() >= 2 && ((e.starts_with('"') && e.ends_with('"')) || (e.starts_with('\'') && e.ends_with('\'')));
    quoted.then(|| e[1..e.len() - 1].to_string())
}

/// Where a Templater template moves its note: the folder of `tp.file.move(<path>)` in a script block,
/// the path written as a template literal (directly, or through one `let x = \`…\`` before it) made of
/// text, `${tp.file.title}` and `${tp.file.creation_date("fmt")}` — the user's daily template's way of
/// filing a day under `notes/periodic/YYYY/MM-MMMM/`. Anything else in the path: None (not guessed).
fn templater_move_dir(template: &str, title: &str, now: NaiveDateTime) -> Option<String> {
    let at = template.find("tp.file.move(")?;
    let arg = template[at + "tp.file.move(".len()..].split(')').next()?.trim();
    let literal = if let Some(lit) = arg.strip_prefix('`') {
        lit.strip_suffix('`')?.to_string()
    } else {
        // `let newPath = \`…\`;` … `tp.file.move(newPath)`
        let decl = template[..at].rfind(&format!("{arg} = `"))?;
        let rest = &template[decl + arg.len() + 4..];
        rest[..rest.find('`')?].to_string()
    };
    let mut out = String::new();
    let mut rest = literal.as_str();
    while let Some(i) = rest.find("${") {
        out.push_str(&rest[..i]);
        let end = rest[i..].find('}')? + i;
        out.push_str(&templater_tag(&rest[i + 2..end], title, now)?);
        rest = &rest[end + 1..];
    }
    out.push_str(rest);
    let dir = out.trim().trim_end_matches(".md").rsplit_once('/')?.0.trim_matches('/').to_string();
    (!dir.is_empty() && !dir.split('/').any(|p| p == ".." || p.is_empty())).then_some(dir)
}

/// Templater's `<% … %>` tags (not `<%* … %>` blocks: they are programs, left as written). Also says
/// on which line `tp.file.cursor()` was, for the caret.
fn templater(text: &str, title: &str, now: NaiveDateTime) -> (String, Option<u32>) {
    let mut out = String::with_capacity(text.len());
    let (mut rest, mut cursor) = (text, None);
    while let Some(i) = rest.find("<%") {
        out.push_str(&rest[..i]);
        let tail = &rest[i..];
        let Some(end) = tail.find("%>") else { out.push_str(tail); rest = ""; break };
        let tag = &tail[..end + 2];
        let inner = tag[2..tag.len() - 2].trim_start_matches(['-', '_']).trim_end_matches(['-', '_']);
        match (inner.starts_with('*'), templater_tag(inner, title, now)) {
            (false, Some(v)) => {
                if inner.trim().starts_with("tp.file.cursor") && cursor.is_none() {
                    cursor = Some(out.matches('\n').count() as u32 + 1);
                }
                out.push_str(&v);
            }
            _ => out.push_str(tag),
        }
        rest = &tail[end + 2..];
    }
    out.push_str(rest);
    (out, cursor)
}

/// `{{…}}` filled in by Atlas's template language (template.rs); `{{cursor}}`'s line comes back.
/// `{{include:name}}` reads the vault's templates folder when there is a vault: the other template's
/// body, its frontmatter left out (an included piece is text, not a second note's properties).
fn fill(vault: Option<(&Path, &Config)>, template: &str, title: &str, now: NaiveDateTime, values: &Map<String, Value>) -> (String, Option<u32>) {
    let body = |t: String| match atlas_text::frontmatter::split(&t) {
        (Some(_), rest) => rest.trim_start_matches(['\r', '\n']).to_string(),
        (None, _) => t,
    };
    let include = |name: &str| vault.and_then(|(root, cfg)| template_text(root, cfg, name).ok()).map(body);
    // day and month names in the vault's language ("2026-10-17 sáb."), as its Bases and daily notes write them
    let _names = vault.map(|(_, cfg)| crate::bases::dates::names(cfg.editor.date_names == crate::config::DateNames::Spanish));
    let ctx = crate::template::Ctx { title, now, values: values.clone(), include: &include, unknown: crate::template::Unknown::Keep };
    let r = crate::template::render(template, &ctx);
    (r.text, r.cursor)
}

/// A day's log when no template is named (`log_template`): what the capture box always wrote, the heading now in
/// the vault's date names.
const DAILY_LOG: &str = "---\ndate: {{date}}\ntype: log\n---\n# {{date:dddd, D MMMM YYYY}}\n\n";

/// How a new day's log starts: the template the rules give the day (a template's `apply_when: { moment: day }`, else
/// `log_template`) filled in for it (its own properties dropped), else [`DAILY_LOG`].
/// A named template that is missing falls back too, so a capture never fails over it.
pub(crate) fn daily_log_start(root: &Path, cfg: &Config, date: &str, now: NaiveDateTime) -> String {
    let path = crate::capture::day_log(cfg, now.date());
    let chosen = crate::template_rules::choose(root, cfg, &crate::template_rules::Moment::Day { path: &path });
    let text = chosen.and_then(|c| template_text(root, cfg, &c.template).ok()).map(|t| take_own(&t).0);
    let filled = templater(&fill(Some((root, cfg)), text.as_deref().unwrap_or(DAILY_LOG), date, now, &Map::new()).0, date, now).0;
    match filled.trim_end_matches('\n') {
        "" => String::new(),
        t => format!("{t}\n\n"),
    }
}

/// A template's text filled in for a note whose place is decided elsewhere (a paper's reading note):
/// `{{…}}` and Templater tags, without its `create_in:` line.
pub(crate) fn render_template(root: &Path, cfg: &Config, template: &str, title: &str, now: NaiveDateTime) -> String {
    templater(&fill(Some((root, cfg)), &take_create_in(template).0, title, now, &Map::new()).0, title, now).0
}

/// A template's `create_in: <folder>` (a frontmatter line): taken out of the text and returned.
fn take_create_in(template: &str) -> (String, Option<String>) {
    let (text, own) = take_own(template);
    (text, own.create_in)
}

/// The properties a template keeps for itself, never copied into its notes.
#[derive(Debug, Default)]
struct TemplateOwn {
    /// `create_in:` the folder its notes are filed in.
    create_in: Option<String>,
    /// `template_title:` its name in the lists ("Film" for `12_movie`).
    title: Option<String>,
}

/// The template's text without its own properties, and those properties.
fn take_own(template: &str) -> (String, TemplateOwn) {
    let mut own = TemplateOwn::default();
    let (Some(yaml), after) = atlas_text::frontmatter::split(template) else { return (template.to_string(), own) };
    let value = |v: &str| Some(v.trim().trim_matches(|c| c == '"' || c == '\'').to_string()).filter(|f| !f.is_empty());
    let mut taken = false;
    // `apply_when:` spans the lines indented under it (template_rules.rs reads it)
    let mut in_rules = false;
    let kept: Vec<&str> = yaml
        .lines()
        .filter(|l| {
            if in_rules && l.starts_with([' ', '\t', '-']) {
                return false;
            }
            in_rules = false;
            if l.starts_with("apply_when:") {
                in_rules = true;
            } else if let Some(v) = l.strip_prefix("create_in:") {
                own.create_in = value(v);
            } else if let Some(v) = l.strip_prefix("template_title:") {
                own.title = value(v);
            } else {
                return true;
            }
            taken = true;
            false
        })
        .collect();
    if !taken {
        return (template.to_string(), own);
    }
    let head = if kept.is_empty() { String::new() } else { format!("{}\n", kept.join("\n")) };
    (format!("---\n{head}---\n{after}"), own)
}

/// What a note gets when nothing chose a template (`[notes] default_template` unset and no `default.md`).
const DEFAULT_NOTE: &str = "---\ndate: {{now}}\ntype:\ntags:\n---\n";

/// The vault's default template's name: `[notes] default_template`, else `default` when the folder has one.
fn default_name(root: &Path, cfg: &Config) -> Option<String> {
    let set = cfg.notes.default_template.trim();
    if !set.is_empty() {
        return Some(set.to_string());
    }
    template_text(root, cfg, "default").is_ok().then(|| "default".to_string())
}

/// Templater's own rules, read from the vault's Obsidian settings (`file_templates` / `folder_templates`, each only
/// when switched on there), so a vault keeps choosing its templates the same way in both apps.
pub(crate) fn templater_rules(root: &Path, cfg: &Config) -> Vec<crate::config::TemplateRule> {
    let Ok(text) = std::fs::read_to_string(root.join(".obsidian/plugins/templater-obsidian/data.json")) else { return vec![] };
    let Ok(v) = serde_json::from_str::<Value>(&text) else { return vec![] };
    let dir = cfg.notes.templates.trim_matches('/');
    let name = |t: &str| {
        let t = t.trim().trim_end_matches(".md");
        t.strip_prefix(&format!("{dir}/")).unwrap_or(t).to_string()
    };
    let mut rules = vec![];
    for (on, list, key) in [("enable_file_templates", "file_templates", "regex"), ("enable_folder_templates", "folder_templates", "folder")] {
        if v[on] != Value::Bool(true) {
            continue;
        }
        for r in v[list].as_array().into_iter().flatten() {
            let (Some(what), Some(t)) = (r[key].as_str(), r["template"].as_str()) else { continue };
            if what.trim().is_empty() || t.trim().is_empty() {
                continue;
            }
            let (title, folder) = if key == "regex" { (Some(what.to_string()), None) } else { (None, Some(what.trim_matches('/').to_string())) };
            rules.push(crate::config::TemplateRule { title, folder, template: name(t) });
        }
    }
    rules
}

/// The template a note made without one gets by the vault's rules (template_rules.rs: the templates' own
/// `apply_when:`, `[notes] template_rules`, else Templater's).
fn template_by_rule(root: &Path, cfg: &Config, rel: &str) -> Option<String> {
    crate::template_rules::choose(root, cfg, &crate::template_rules::Moment::NewNote { path: rel }).map(|c| c.template)
}

/// The template's text; a missing `fleeting` falls back to the built-in one, any other is an error.
pub(crate) fn template_text(root: &Path, cfg: &Config, name: &str) -> Result<String> {
    let rel = format!("{}/{name}.md", cfg.notes.templates.trim_matches('/'));
    match std::fs::read_to_string(paths::safe_join(root, &rel)?) {
        Ok(s) => Ok(s),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound && name == "fleeting" => Ok(FLEETING.into()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound && name == BUILT_IN_DEFAULT => Ok(DEFAULT_NOTE.into()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Err(Error::NotFound(format!("no template {rel}"))),
        Err(e) => Err(e.into()),
    }
}

pub fn new_note(root: &Path, cfg: &Config, req: &NewNote) -> Result<NewNoteResult> {
    new_note_at(root, cfg, req, chrono::Local::now().naive_local())
}

/// A note's text before it has a place: the template filled in, then the body.
struct Draft {
    text: String,
    /// 1-based line of `tp.file.cursor()`, if the template has one.
    cursor: Option<u32>,
    /// The folder the template files its notes in (`create_in:` or Templater's `tp.file.move`).
    create_in: Option<String>,
}

fn draft(root: &Path, cfg: &Config, template: Option<&str>, title: &str, body: Option<&str>, values: &Map<String, Value>, now: NaiveDateTime) -> Result<Draft> {
    let (template, create_in) = match template.filter(|t| !t.is_empty()) {
        Some(t) => take_create_in(&template_text(root, cfg, t)?),
        None => (String::new(), None),
    };
    // a Templater template that moves its note says where it goes the same way `create_in:` does
    let create_in = create_in.or_else(|| templater_move_dir(&template, title, now));
    let (filled, at) = fill(Some((root, cfg)), &template, title, now, values);
    let (mut text, cursor) = templater(&filled, title, now);
    let cursor = cursor.or(at);
    if let Some(body) = body.filter(|b| !b.trim().is_empty()) {
        if !text.is_empty() && !text.ends_with('\n') {
            text.push('\n');
        }
        text.push_str(body.trim_end());
        text.push('\n');
    }
    Ok(Draft { text, cursor, create_in })
}

/// Writes a new file; `Ok(false)` when the name is taken (`create_new`: never clobbers, even in a race).
fn write_new(root: &Path, rel: &str, text: &str) -> Result<bool> {
    let abs = paths::safe_join(root, rel)?;
    Ok(crate::vault_write::create(&abs, text.as_bytes())? == crate::vault_write::Created::New)
}

/// The template a new note is made from: the one asked for, else the vault's rules' choice by its name and folder
/// (a daily note's, a weekly one's).
fn chosen_template(root: &Path, cfg: &Config, req: &NewNote, stem: &str) -> Option<String> {
    if let Some(t) = req.template.as_deref().filter(|t| !t.is_empty()) {
        return Some(t.to_string());
    }
    let first = [req.dir.as_deref(), req.near.as_deref()].into_iter().flatten().map(|d| d.trim().trim_matches('/')).find(|d| !d.is_empty());
    let dir = first.unwrap_or_else(|| cfg.notes.dir.trim().trim_matches('/'));
    let rel = if dir.is_empty() { format!("{stem}.md") } else { format!("{dir}/{stem}.md") };
    template_by_rule(root, cfg, &rel)
        .filter(|t| template_text(root, cfg, t).is_ok())
        // nothing chose one: the vault's default, so every note starts with properties
        .or_else(|| Some(default_name(root, cfg).filter(|t| template_text(root, cfg, t).is_ok()).unwrap_or_else(|| BUILT_IN_DEFAULT.to_string())))
}

/// The name standing for [`DEFAULT_NOTE`] (no such file needed; a file of that name would be read instead).
const BUILT_IN_DEFAULT: &str = "default";

/// The text of the template this note will be made from, with the templates it includes after it: what a caller
/// reads to know which values it uses (template_values.rs) before the note is made.
pub fn template_for(root: &Path, cfg: &Config, req: &NewNote) -> Option<String> {
    let name = chosen_template(root, cfg, req, &file_stem(req.title.trim()))?;
    let mut text = template_text(root, cfg, &name).ok()?;
    let mut seen = vec![name];
    let mut at = 0;
    while let Some(i) = text[at..].find("{{include:") {
        let start = at + i + "{{include:".len();
        let Some(end) = text[start..].find("}}") else { break };
        let inc = text[start..start + end].trim().to_string();
        at = start + end;
        if seen.len() < 8 && !seen.contains(&inc) {
            if let Ok(t) = template_text(root, cfg, &inc) {
                text.push('\n');
                text.push_str(&t);
            }
            seen.push(inc);
        }
    }
    Some(text)
}

pub fn new_note_at(root: &Path, cfg: &Config, req: &NewNote, now: NaiveDateTime) -> Result<NewNoteResult> {
    // a name typed with its extension ("idea.md") is still one note, not "idea.md.md"
    let title = req.title.trim();
    let title = title.strip_suffix(".md").unwrap_or(title).trim_end();
    let stem = match file_stem(title) {
        s if s.is_empty() => now.format("%Y-%m-%d %H%M").to_string(),
        s => s,
    };
    let chosen = chosen_template(root, cfg, req, &stem);
    let Draft { text, cursor, create_in } = draft(root, cfg, chosen.as_deref(), title, req.text.as_deref(), &req.values.clone().unwrap_or_default(), now)?;
    // where it goes: asked for > the template's own folder > beside the note the user was in > the notes folder
    let dir = [req.dir.as_deref(), create_in.as_deref(), req.near.as_deref()]
        .into_iter()
        .flatten()
        .map(|d| d.trim().trim_matches('/'))
        .find(|d| !d.is_empty())
        .unwrap_or_else(|| cfg.notes.dir.trim().trim_matches('/'));
    let rel_of = |n: u32| {
        let name = if n == 1 { format!("{stem}.md") } else { format!("{stem} {n}.md") };
        if dir.is_empty() { name } else { format!("{dir}/{name}") }
    };
    // a taken name gets a number: two captures in the same minute cannot clobber
    for n in 1..1000 {
        let rel = rel_of(n);
        if write_new(root, &rel, &text)? {
            return Ok(NewNoteResult { path: rel, line: cursor.unwrap_or_else(|| text.lines().count().max(1) as u32) });
        }
    }
    Err(Error::BadRequest(format!("too many notes named {stem}")))
}

/// The top-level keys of a text's frontmatter, in order: a `key:` line at the left margin (Templater
/// script lines and list items are not keys).
fn frontmatter_keys(text: &str) -> Vec<String> {
    let Some(yaml) = atlas_text::frontmatter::split(text).0 else { return vec![] };
    yaml.lines()
        .filter(|l| !l.starts_with([' ', '\t', '-', '#']))
        .filter_map(|l| l.split_once(':').map(|(k, _)| k.trim()))
        .filter(|k| !k.is_empty() && k.chars().all(|c| c.is_alphanumeric() || "_- ".contains(c)))
        .map(String::from)
        .collect()
}

/// A template as an agent sees it (`atlas_templates`): the name to pass as `template`, the folder its
/// notes are filed in (for a note made now), and the properties its frontmatter defines.
#[derive(Debug, Clone, Serialize, ts_rs::TS)]
#[ts(export)]
pub struct TemplateInfo {
    pub name: String,
    /// Its name in the lists: its `template_title:`, else none (the list makes one from `name`).
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub title: Option<String>,
    /// The vault's default template (`[notes] default_template`, or `default`): what a plain note is made from, so
    /// "New…" leaves it out.
    pub default: bool,
    pub path: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub folder: Option<String>,
    pub properties: Vec<String>,
    /// What the template asks when a note is made from it (`{{prompt:…}}`), answered through `values`.
    pub prompts: Vec<String>,
    /// When it applies by itself, in words, in the order tried (template_rules.rs `described`).
    pub applies: Vec<String>,
    /// How each prompt is asked (`| choice:a,b`, `| date`, `| number`, `| note:folder`), in `prompts`' order.
    pub asks: Vec<PromptAsk>,
}

/// One question of a template, and how the app asks it (one form for all of them).
#[derive(Debug, Clone, Serialize, ts_rs::TS)]
#[ts(export)]
pub struct PromptAsk {
    pub name: String,
    /// `text`, `choice`, `date`, `number` or `note`
    pub kind: String,
    /// `choice`: the choices
    pub choices: Vec<String>,
    /// `note`: the folder its notes are in ("" anywhere)
    pub folder: String,
}

fn asks(template: &str) -> Vec<PromptAsk> {
    use crate::template::PromptKind as K;
    crate::template::prompt_kinds(template)
        .into_iter()
        .map(|(name, k)| {
            let (kind, choices, folder) = match k {
                K::Text => ("text", vec![], String::new()),
                K::Choice(c) => ("choice", c, String::new()),
                K::Date => ("date", vec![], String::new()),
                K::Number => ("number", vec![], String::new()),
                K::Note(f) => ("note", vec![], f),
            };
            PromptAsk { name, kind: kind.into(), choices, folder }
        })
        .collect()
}

/// The templates "New note from a template…" offers: the `.md` files directly in `[notes] templates`.
pub fn templates(root: &Path, cfg: &Config) -> Result<Vec<TemplateInfo>> {
    let dir = cfg.notes.templates.trim().trim_matches('/');
    let entries = match std::fs::read_dir(paths::safe_join(root, dir)?) {
        Ok(e) => e,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(vec![]),
        Err(e) => return Err(e.into()),
    };
    let now = chrono::Local::now().naive_local();
    let default = default_name(root, cfg);
    let mut applies = crate::template_rules::described(root, cfg);
    let mut out: Vec<TemplateInfo> = entries
        .flatten()
        .filter(|e| e.file_type().is_ok_and(|t| t.is_file()))
        .filter_map(|e| {
            let file = e.file_name().to_string_lossy().into_owned();
            let name = file.strip_suffix(".md")?.to_string();
            let (text, own) = take_own(&std::fs::read_to_string(e.path()).ok()?);
            let folder = own.create_in.or_else(|| templater_move_dir(&text, &name, now));
            Some(TemplateInfo {
                path: if dir.is_empty() { file.clone() } else { format!("{dir}/{file}") },
                folder,
                properties: frontmatter_keys(&text),
                prompts: crate::template::prompts(&text),
                asks: asks(&text),
                applies: applies.remove(&name).unwrap_or_default(),
                title: own.title,
                default: default.as_deref() == Some(name.as_str()),
                name,
            })
        })
        .collect();
    out.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(out)
}

/// `atlas_new_note`: a note at exactly `path` (`.md` added when missing), from a template, with
/// properties set from `fields`. Unlike [`new_note`] a taken path is refused, not numbered: an agent
/// that names a note means that note, and a " 2" beside it would be a duplicate.
#[derive(Debug, Clone, Default)]
pub struct NoteFile<'a> {
    pub path: &'a str,
    pub template: Option<&'a str>,
    /// `{{title}}`; default: the file name.
    pub title: Option<&'a str>,
    /// Properties to set: text, numbers, booleans, lists or null (an empty value).
    pub fields: serde_json::Map<String, serde_json::Value>,
    /// Appended after the template's text.
    pub text: Option<&'a str>,
}

#[derive(Debug, Clone, Serialize)]
pub struct NoteFileResult {
    pub path: String,
    /// 1-based line for the caret.
    pub line: u32,
    /// Fields the template does not define (added at the end of the frontmatter): a misspelt name shows here.
    pub added: Vec<String>,
}

pub fn new_note_file(root: &Path, cfg: &Config, req: &NoteFile) -> Result<NoteFileResult> {
    new_note_file_at(root, cfg, req, chrono::Local::now().naive_local())
}

pub fn new_note_file_at(root: &Path, cfg: &Config, req: &NoteFile, now: NaiveDateTime) -> Result<NoteFileResult> {
    let rel = req.path.trim();
    if rel.is_empty() || rel.ends_with('/') {
        return Err(Error::BadRequest(format!("path {rel:?}: a note's file path, such as notes/Idea.md")));
    }
    let rel = if rel.ends_with(".md") { rel.to_string() } else { format!("{rel}.md") };
    let stem = rel.rsplit('/').next().unwrap_or(&rel).trim_end_matches(".md").to_string();
    let title = req.title.map(str::trim).filter(|t| !t.is_empty()).unwrap_or(&stem);
    let Draft { mut text, cursor, .. } = draft(root, cfg, req.template, title, req.text, &req.fields, now)?;
    let (defined, lines_before) = (frontmatter_keys(&text), text.lines().count());
    let mut added = vec![];
    for (key, value) in &req.fields {
        if key.trim().is_empty() || key.contains([':', '\n']) || key.starts_with([' ', '-', '#']) {
            return Err(Error::BadRequest(format!("fields: {key:?} is not a property name")));
        }
        if value.is_object() {
            return Err(Error::BadRequest(format!("fields.{key}: a text, number, true/false, list or null, not an object")));
        }
        let yaml = serde_yaml::to_value(value).map_err(|e| Error::BadRequest(format!("fields.{key}: {e}")))?;
        text = crate::frontmatter::set_property(&text, key, &yaml);
        if !defined.contains(key) {
            added.push(key.clone());
        }
    }
    if !write_new(root, &rel, &text)? {
        return Err(Error::BadRequest(format!("{rel} already exists: open it, or choose another path (a note is never replaced)")));
    }
    // fields may add frontmatter lines above the template's caret
    let shift = text.lines().count() as i64 - lines_before as i64;
    let line = cursor.map(|c| (c as i64 + shift).max(1) as u32).unwrap_or_else(|| text.lines().count().max(1) as u32);
    Ok(NoteFileResult { path: rel, line, added })
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::NaiveDate;

    fn now() -> NaiveDateTime {
        NaiveDate::from_ymd_opt(2026, 10, 13).unwrap().and_hms_opt(9, 5, 0).unwrap()
    }

    #[test]
    fn a_note_from_a_template_is_filled_in_and_never_replaces_a_file() {
        let d = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(d.path().join("templates")).unwrap();
        std::fs::write(d.path().join("templates/project.md"), "---\ntype: project\ncreated: {{date}}\n---\n# {{title}}\nat {{time}}\n").unwrap();
        let req = NewNote { template: Some("project".into()), title: "Bath: fitting / v2?".into(), dir: Some("projects/".into()), near: None, text: None, values: None };
        let r = new_note_at(d.path(), &Config::default(), &req, now()).unwrap();
        assert_eq!(r.path, "projects/Bath fitting v2.md");
        assert_eq!(
            std::fs::read_to_string(d.path().join(&r.path)).unwrap(),
            "---\ntype: project\ncreated: 2026-10-13\n---\n# Bath: fitting / v2?\nat 09:05\n"
        );
        assert_eq!(new_note_at(d.path(), &Config::default(), &req, now()).unwrap().path, "projects/Bath fitting v2 2.md");
        // no place asked for: the vault's notes folder, never the root by accident
        let typed_ext = NewNote { template: None, title: "idea.md".into(), dir: None, near: None, text: None, values: None };
        assert_eq!(new_note_at(d.path(), &Config::default(), &typed_ext, now()).unwrap().path, "notes/idea.md");
        let missing = NewNote { template: Some("nope".into()), ..req.clone() };
        assert!(matches!(new_note_at(d.path(), &Config::default(), &missing, now()), Err(Error::NotFound(_))));
        let out = NewNote { dir: Some("../x".into()), ..req };
        assert!(matches!(new_note_at(d.path(), &Config::default(), &out, now()), Err(Error::BadPath(_))));
    }

    #[test]
    fn an_untitled_note_is_named_by_the_minute_and_fleeting_needs_no_template_file() {
        let d = tempfile::tempdir().unwrap();
        let req = NewNote { template: Some("fleeting".into()), title: " ".into(), dir: Some("inbox".into()), near: None, text: Some("a thought\n\n".into()), values: None };
        let r = new_note_at(d.path(), &Config::default(), &req, now()).unwrap();
        assert_eq!(r.path, "inbox/2026-10-13 0905.md");
        assert_eq!(std::fs::read_to_string(d.path().join(&r.path)).unwrap(), "---\ntype: fleeting\ncreated: 2026-10-13\n---\na thought\n");
        assert_eq!(r.line, 5);
    }

    #[test]
    fn templater_tags_the_users_templates_use_are_filled_and_scripts_are_left_alone() {
        let d = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(d.path().join("templates")).unwrap();
        std::fs::write(
            d.path().join("templates/movie.md"),
            "---\ncreated: <% tp.file.creation_date(\"YYYY-MM-DD\") %>\nkind: <% \"film\" %>\n---\n# <% tp.file.title %>\n\n<% tp.file.cursor() %>\n\n<%* tR += 'x' %>\nnext: <% tp.date.now(\"YYYY-MM-DD\", 1, tp.file.title, \"YYYY-MM-DD ddd\") %>\n",
        )
        .unwrap();
        let req = NewNote { template: Some("movie".into()), title: "2026-10-20 Tue".into(), dir: Some("films".into()), near: None, text: None, values: None };
        let r = new_note_at(d.path(), &Config::default(), &req, now()).unwrap();
        let text = std::fs::read_to_string(d.path().join(&r.path)).unwrap();
        assert_eq!(text, "---\ncreated: 2026-10-13\nkind: film\n---\n# 2026-10-20 Tue\n\n\n\n<%* tR += 'x' %>\nnext: 2026-10-21\n");
        assert_eq!(r.line, 7, "the caret goes where tp.file.cursor() was");
    }

    #[test]
    fn a_templater_template_that_moves_its_note_files_it_there() {
        let d = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(d.path().join("templates")).unwrap();
        let daily = "---\n<%*\nlet newPath = `notes/periodic/${tp.file.creation_date(\"YYYY\")}/${tp.file.creation_date(\"MM-MMMM\")}/${tp.file.title}`;\nawait tp.file.move(newPath);\n%>\n---\n# <% tp.file.title %>\n";
        std::fs::write(d.path().join("templates/daily.md"), daily).unwrap();
        let req = NewNote { template: Some("daily".into()), title: "2026-10-13 Tue".into(), dir: None, near: Some("elsewhere".into()), text: None, values: None };
        let r = new_note_at(d.path(), &Config::default(), &req, now()).unwrap();
        assert_eq!(r.path, "notes/periodic/2026/10-October/2026-10-13 Tue.md");
        assert_eq!(templater_move_dir("<%* await tp.file.move(`a/${tp.file.title}`) %>", "T", now()).as_deref(), Some("a"), "a literal path");
        assert_eq!(templater_move_dir("<%* await tp.file.move(somewhere()) %>", "T", now()), None, "a path it cannot read: not guessed");
    }

    #[test]
    fn a_new_note_goes_to_its_templates_folder_then_beside_the_open_note_then_to_the_notes_folder() {
        let d = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(d.path().join("templates")).unwrap();
        std::fs::write(d.path().join("templates/session.md"), "---\ntype: session\ncreate_in: campaigns/sessions\n---\n# {{title}}\n").unwrap();
        std::fs::write(d.path().join("templates/plain.md"), "# {{title}}\n").unwrap();
        let cfg = Config::default();
        let note = |template: &str, dir: Option<&str>, near: Option<&str>| {
            let req = NewNote { template: Some(template.into()), title: "N".into(), dir: dir.map(Into::into), near: near.map(Into::into), text: None, values: None };
            new_note_at(d.path(), &cfg, &req, now()).unwrap().path
        };
        // the template's folder wins over where the user happens to be; its line is not copied
        let p = note("session", None, Some("notes/physics"));
        assert_eq!(p, "campaigns/sessions/N.md");
        assert_eq!(std::fs::read_to_string(d.path().join(&p)).unwrap(), "---\ntype: session\n---\n# N\n");
        assert_eq!(note("plain", None, Some("notes/physics")), "notes/physics/N.md");
        assert_eq!(note("plain", None, None), "notes/N.md");
        assert_eq!(note("plain", None, Some("")), "notes/N 2.md", "made from a file at the root: still the notes folder");
        assert_eq!(note("session", Some("elsewhere"), None), "elsewhere/N.md", "a folder asked for is obeyed");
        let mut root = Config::default();
        root.notes.dir = String::new();
        let req = NewNote { template: None, title: "R".into(), dir: None, near: None, text: None, values: None };
        assert_eq!(new_note_at(d.path(), &root, &req, now()).unwrap().path, "R.md", "an empty setting means the root, by choice");
    }

    #[test]
    fn an_agent_lists_the_templates_with_their_folder_and_properties() {
        let d = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(d.path().join("templates/old")).unwrap();
        std::fs::write(d.path().join("templates/literature.md"), "---\ntype: Literature\ncreate_in: notes/papers\nsources:\n  - x\nauthors:\n---\n# {{title}}\n").unwrap();
        std::fs::write(d.path().join("templates/plain.md"), "# {{title}}\n").unwrap();
        std::fs::write(d.path().join("templates/readme.txt"), "not a template").unwrap();
        let t = templates(d.path(), &Config::default()).unwrap();
        let names: Vec<_> = t.iter().map(|t| t.name.as_str()).collect();
        assert_eq!(names, ["literature", "plain"], "only the .md files directly in the folder, as the UI offers them");
        assert_eq!((t[0].path.as_str(), t[0].folder.as_deref()), ("templates/literature.md", Some("notes/papers")));
        assert_eq!(t[0].properties, ["type", "sources", "authors"], "create_in is where it goes, not a property");
        assert!(t[1].folder.is_none() && t[1].properties.is_empty());
        let mut none = Config::default();
        none.notes.templates = "nowhere".into();
        assert!(templates(d.path(), &none).unwrap().is_empty());
    }

    #[test]
    fn an_agents_note_is_made_at_its_path_from_the_template_with_its_fields_and_never_replaces_one() {
        let d = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(d.path().join("templates")).unwrap();
        std::fs::write(d.path().join("templates/literature.md"), "---\ntype: Literature\ncreated: {{date}}\nsources:\nyear:\ncreate_in: notes/papers\n---\n# {{title}}\n\n<% tp.file.cursor() %>\n").unwrap();
        let cfg = Config::default();
        let fields = serde_json::json!({"sources": ["[[georges2004strongly]]"], "year": 2004, "rating": null});
        let req = NoteFile { path: "notes/physics/DMFT review", template: Some("literature"), fields: fields.as_object().unwrap().clone(), ..Default::default() };
        let r = new_note_file_at(d.path(), &cfg, &req, now()).unwrap();
        assert_eq!(r.path, "notes/physics/DMFT review.md", "the path asked for wins over the template's create_in");
        assert_eq!(r.added, ["rating"]);
        let text = std::fs::read_to_string(d.path().join(&r.path)).unwrap();
        assert_eq!(text, "---\ntype: Literature\ncreated: 2026-10-13\nsources:\n  - '[[georges2004strongly]]'\nyear: 2004\nrating:\n---\n# DMFT review\n\n\n");
        assert_eq!(r.line, 11, "the caret line follows the lines the fields added");
        let again = new_note_file_at(d.path(), &cfg, &NoteFile { fields: Default::default(), ..req.clone() }, now());
        assert!(matches!(again, Err(Error::BadRequest(m)) if m.contains("already exists")));
        assert_eq!(std::fs::read_to_string(d.path().join(&r.path)).unwrap(), text, "the note is untouched");

        let plain = NoteFile { path: "idea.md", title: Some("An idea"), text: Some("body"), ..Default::default() };
        assert_eq!(std::fs::read_to_string(d.path().join(new_note_file_at(d.path(), &cfg, &plain, now()).unwrap().path)).unwrap(), "body\n");
        let bad = |f: serde_json::Value| new_note_file_at(d.path(), &cfg, &NoteFile { path: "x.md", fields: f.as_object().unwrap().clone(), ..Default::default() }, now());
        assert!(matches!(bad(serde_json::json!({"a": {"b": 1}})), Err(Error::BadRequest(_))), "an object is refused");
        assert!(matches!(bad(serde_json::json!({"a: b": 1})), Err(Error::BadRequest(_))), "a key YAML would split is refused");
        assert!(!d.path().join("x.md").exists(), "nothing is written when the request is wrong");
        for path in ["../out.md", "/etc/x.md", "notes/", " "] {
            assert!(new_note_file_at(d.path(), &cfg, &NoteFile { path, ..Default::default() }, now()).is_err(), "{path}");
        }
        let missing = NoteFile { path: "y.md", template: Some("nope"), ..Default::default() };
        assert!(matches!(new_note_file_at(d.path(), &cfg, &missing, now()), Err(Error::NotFound(_))));
    }

    #[test]
    fn templates_include_others_and_take_prompt_answers() {
        let dir = tempfile::tempdir().unwrap();
        let cfg = Config::default();
        let t = dir.path().join(cfg.notes.templates.trim_matches('/'));
        std::fs::create_dir_all(&t).unwrap();
        std::fs::write(t.join("header.md"), "---\ncreate_in: elsewhere\n---\nmade {{date:D MMM}}").unwrap();
        std::fs::write(t.join("meeting.md"), "# {{prompt:Who}} on {{day}}\n{{include:header}}\n{{#if agenda}}{{#each agenda}}- {{this}}\n{{/each}}{{/if}}{{cursor}}").unwrap();
        let mut values = Map::new();
        values.insert("Who".into(), Value::from("Ada"));
        values.insert("agenda".into(), serde_json::json!(["fit", "plots"]));
        let req = NewNote { template: Some("meeting".into()), title: "2026-10-20 sync".into(), dir: Some("m".into()), near: None, text: None, values: Some(values) };
        let r = new_note_at(dir.path(), &cfg, &req, now()).unwrap();
        let text = std::fs::read_to_string(dir.path().join(&r.path)).unwrap();
        assert!(text.starts_with("# Ada on 2026-10-20\nmade 13 Oct\n"), "{text}");
        assert!(text.contains("- fit\n- plots\n"), "{text}");
        assert_eq!(templates(dir.path(), &cfg).unwrap().iter().find(|t| t.name == "meeting").unwrap().prompts, vec!["Who"]);
    }

    #[test]
    fn a_note_made_without_a_template_gets_one_by_its_name_or_folder_as_templater_chose() {
        let dir = tempfile::tempdir().unwrap();
        let cfg = Config::default();
        std::fs::create_dir_all(dir.path().join("templates")).unwrap();
        std::fs::create_dir_all(dir.path().join(".obsidian/plugins/templater-obsidian")).unwrap();
        std::fs::write(dir.path().join("templates/99_dailyTemplate.md"), "# Day {{day:dddd}}\n").unwrap();
        std::fs::write(dir.path().join("templates/99_weeklyTemplate.md"), "# Week\n").unwrap();
        std::fs::write(dir.path().join("templates/99_dreamTemplate.md"), "<%* const w = await tp.user.getWeather(); %>\n# Dream\n").unwrap();
        std::fs::write(dir.path().join("templates/lab.md"), "# Lab\n").unwrap();
        // a real Templater setup, cut down: file templates on, folder templates off
        std::fs::write(dir.path().join(".obsidian/plugins/templater-obsidian/data.json"), r#"{"enable_file_templates": true, "file_templates": [
            {"regex": "sueño", "template": "templates/99_dreamTemplate.md"},
            {"regex": "\\d{4}-\\d{2}-\\d{2} [a-zA-Zá]{3}\\.", "template": "templates/99_dailyTemplate.md"}, {"regex": "\\d{4}-\\d{2} W\\d{2}", "template": "templates/99_weeklyTemplate.md"},
            {"regex": "([", "template": "templates/broken.md"}, {"regex": "", "template": ""}],
            "enable_folder_templates": false, "folder_templates": [{"folder": "labs", "template": "templates/lab.md"}]}"#).unwrap();
        let make = |title: &str, dir_: Option<&str>, cfg: &Config| {
            let req = NewNote { template: None, title: title.into(), dir: dir_.map(Into::into), near: None, text: None, values: None };
            let r = new_note_at(dir.path(), cfg, &req, now()).unwrap();
            std::fs::read_to_string(dir.path().join(r.path)).unwrap()
        };
        assert_eq!(make("2026-10-20 Tue.", None, &cfg), "# Day Tuesday\n");
        // the dream rule names a script template (left to Obsidian): passed over, the next rule that fits is used
        assert_eq!(make("2026-10-20 Tue. sueño", None, &cfg), "# Day Tuesday\n");
        assert_eq!(make("2026-10 W43", None, &cfg), "# Week\n");
        let plain = "---\ndate: 2026-10-13 09:05\ntype:\ntags:\n---\n"; // the built-in default: every note has properties
        assert_eq!(make("an idea", Some("labs"), &cfg), plain, "folder templates are off in Templater: not used");
        // the vault's own rules win over Templater's
        let mut own = cfg.clone();
        own.notes.template_rules = vec![crate::config::TemplateRule { title: None, folder: Some("labs".into()), template: "lab".into() }];
        assert_eq!(make("run 7", Some("labs/sub"), &own), "# Lab\n");
        assert_eq!(make("2026-10-21 Wed.", None, &own), plain, "own rules replace Templater's");
    }

    #[test]
    fn a_note_nothing_chose_a_template_for_gets_the_vaults_default_and_the_default_is_not_offered() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(dir.path().join("templates")).unwrap();
        // a template's own name for the lists, never copied into its notes
        std::fs::write(dir.path().join("templates/00_default.md"), "---\ntemplate_title: Plain note\ndate: {{now}}\nstatus:\n---\n").unwrap();
        std::fs::write(dir.path().join("templates/12_movie.md"), "---\ntemplate_title: Film\ntype: movie\n---\n").unwrap();
        let mut cfg = Config::default();
        cfg.notes.default_template = "00_default".into();
        let req = NewNote { template: None, title: "an idea".into(), dir: None, near: None, text: None, values: None };
        let r = new_note_at(dir.path(), &cfg, &req, now()).unwrap();
        assert_eq!(std::fs::read_to_string(dir.path().join(r.path)).unwrap(), "---\ndate: 2026-10-13 09:05\nstatus:\n---\n");
        let t = templates(dir.path(), &cfg).unwrap();
        let by = |n: &str| t.iter().find(|x| x.name == n).unwrap();
        assert!(by("00_default").default && !by("12_movie").default);
        assert_eq!((by("12_movie").title.as_deref(), by("12_movie").properties.clone()), (Some("Film"), vec!["type".to_string()]));
        // with none set, a `default.md` is the default
        std::fs::write(dir.path().join("templates/default.md"), "---\nkind: plain\n---\n").unwrap();
        assert!(templates(dir.path(), &Config::default()).unwrap().iter().any(|x| x.name == "default" && x.default));
    }

    #[test]
    fn a_title_ending_in_a_dot_keeps_it_as_the_vaults_daily_notes_do() {
        // a Spanish vault's days are "2026-03-07 sáb..md": a trimmed dot would make a second note beside Obsidian's
        assert_eq!(file_stem("2026-03-07 sáb."), "2026-03-07 sáb.");
        assert_eq!(file_stem(".hidden idea"), "hidden idea");
    }
}
