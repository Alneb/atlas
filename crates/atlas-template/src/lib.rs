//! Atlas's own template language, a superset of Obsidian's core Templates syntax: no
//! Templater, no scripts — a template can only read, never run code. docs/guides/TEMPLATES.md has the
//! full reference.
//!
//! - `{{title}}`, `{{date}}`, `{{time}}`, `{{now}}`, `{{day}}` (the day the note is about: a title
//!   starting `YYYY-MM-DD`, else today); a format after `:` (moment tokens): `{{date:dddd D MMMM}}`;
//!   offsets: `{{day-1d:YYYY-MM-DD}}`, `{{date+2w}}` (units h d w m y).
//! - values: `{{author}}`, `{{book.year}}` — properties, prompt answers, a plugin's fields.
//! - `{{prompt:Question}}` — a value the user is asked for (answered through `values`).
//! - `{{include:Other}}` — another template, rendered here.
//! - `{{cursor}}` — where the caret goes.
//! - filters: `{{tags | join:", "}}`, `upper` `lower` `capitalize` `trim` `slug` `link` `join` `first`
//!   `last` `count` `default:x` `date:FMT` `replace:from,to`.
//! - blocks: `{{#if x}}…{{else}}…{{/if}}`, `{{#unless x}}…{{/unless}}`, `{{#each xs}}{{this}} {{@index}}{{/each}}`.
//!
//! A tag it cannot fill (an unknown name, a typo) stays as written: nothing is silently dropped — unless the caller
//! says otherwise (`Unknown::Empty`: a generated note, where a field a source did not give is just absent).
pub mod dates;

use chrono::{Duration, Months, NaiveDate, NaiveDateTime};
use serde_json::{Map, Value};

/// Marks the cursor while rendering; a private-use character no note contains.
const CURSOR: char = '\u{E000}';
const MAX_INCLUDE_DEPTH: u8 = 8;

/// What a tag Atlas cannot fill becomes.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Unknown {
    /// Left as written, so a typo shows (a note the user asked for).
    Keep,
    /// Nothing (a note written from a source's fields, which may lack some).
    Empty,
}

/// What a template is filled in with.
pub struct Ctx<'a> {
    pub title: &'a str,
    pub now: NaiveDateTime,
    /// Named values: prompt answers, properties, a plugin's fields.
    pub values: Map<String, Value>,
    /// Another template's text by name (`{{include:…}}`); None when there is no such template.
    pub include: &'a dyn Fn(&str) -> Option<String>,
    pub unknown: Unknown,
}

pub struct Rendered {
    pub text: String,
    /// 1-based line of `{{cursor}}`, if the template has one.
    pub cursor: Option<u32>,
}

pub fn render(template: &str, ctx: &Ctx) -> Rendered {
    let mut text = Renderer { ctx, depth: 0 }.block(template, &ctx.values);
    let cursor = text.find(CURSOR).map(|at| text[..at].matches('\n').count() as u32 + 1);
    text.retain(|c| c != CURSOR);
    Rendered { text, cursor }
}

/// The names of the values a template reads (`{{weather.city}}` → `weather`, also in blocks and filters' heads), each
/// once: what plugins may be asked to provide (template_values.rs). Built-in names are not listed.
pub fn names_used(template: &str) -> Vec<String> {
    const BUILT_IN: [&str; 8] = ["title", "cursor", "include", "prompt", "this", "@index", "else", "date"];
    let mut out: Vec<String> = vec![];
    for tag in template.split("{{").skip(1).filter_map(|t| t.split_once("}}").map(|(t, _)| t)) {
        let tag = tag.trim().trim_start_matches(['#', '/']);
        let expr = ["if ", "unless ", "each "].iter().find_map(|k| tag.strip_prefix(k)).unwrap_or(tag);
        let head = split_pipes(expr)[0].trim();
        let name = head.split([':', '.']).next().unwrap_or("").trim();
        let moment = ["date", "time", "now", "day"].iter().any(|b| name.starts_with(b) && name[b.len()..].chars().all(|c| "+-0123456789hdwmy".contains(c)));
        let literal = name.starts_with(['"', '\'']) || name.parse::<f64>().is_ok();
        if name.is_empty() || moment || literal || BUILT_IN.contains(&name) || ["if", "unless", "each"].contains(&name) || out.iter().any(|o| o == name) {
            continue;
        }
        out.push(name.to_string());
    }
    out
}

/// How a prompt is asked: `{{prompt:Course | choice:Physics,Maths}}`, `| date`, `| number`, `| note:projects/`
/// (a note in that folder, answered as a link), else plain text. Rendering skips these pipes.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PromptKind {
    Text,
    Choice(Vec<String>),
    Date,
    Number,
    /// a note, optionally in this folder
    Note(String),
}

const PROMPT_KINDS: [&str; 5] = ["text", "choice", "date", "number", "note"];

/// The questions a template asks with how each is asked, in order, each once (its first tag says the kind).
pub fn prompt_kinds(template: &str) -> Vec<(String, PromptKind)> {
    let mut out: Vec<(String, PromptKind)> = vec![];
    for tag in template.split("{{").skip(1).filter_map(|t| t.split_once("}}").map(|(t, _)| t)) {
        let Some(q) = tag.trim().strip_prefix("prompt:") else { continue };
        let parts = split_pipes(q);
        let name = parts[0].trim().to_string();
        if name.is_empty() || out.iter().any(|(n, _)| *n == name) {
            continue;
        }
        let kind = parts[1..]
            .iter()
            .find_map(|p| {
                let (k, a) = p.trim().split_once(':').map_or((p.trim(), ""), |(k, a)| (k.trim(), a.trim()));
                Some(match k {
                    "choice" => PromptKind::Choice(unquote(a).split(',').map(|c| c.trim().to_string()).filter(|c| !c.is_empty()).collect()),
                    "date" => PromptKind::Date,
                    "number" => PromptKind::Number,
                    "note" => PromptKind::Note(unquote(a).trim().trim_matches('/').to_string()),
                    "text" => PromptKind::Text,
                    _ => return None,
                })
            })
            .unwrap_or(PromptKind::Text);
        out.push((name, kind));
    }
    out
}

/// The questions a template asks (`{{prompt:…}}`), in order, each once.
pub fn prompts(template: &str) -> Vec<String> {
    let mut out: Vec<String> = vec![];
    for tag in template.split("{{").skip(1).filter_map(|t| t.split_once("}}").map(|(t, _)| t)) {
        if let Some(q) = tag.trim().strip_prefix("prompt:") {
            let q = split_pipes(q)[0].trim().to_string();
            if !q.is_empty() && !out.contains(&q) {
                out.push(q);
            }
        }
    }
    out
}

struct Renderer<'a, 'b> {
    ctx: &'a Ctx<'b>,
    depth: u8,
}

impl Renderer<'_, '_> {
    fn block(&self, src: &str, vars: &Map<String, Value>) -> String {
        let mut out = String::with_capacity(src.len());
        let mut rest = src;
        while let Some(open) = rest.find("{{") {
            out.push_str(&rest[..open]);
            let after = &rest[open + 2..];
            let Some(close) = after.find("}}") else {
                out.push_str(&rest[open..]);
                return out;
            };
            let tag = after[..close].trim();
            let tail = &after[close + 2..];
            if let Some((kind, expr)) = ["#if", "#unless", "#each"].iter().find_map(|k| tag.strip_prefix(k).map(|e| (&k[1..], e.trim()))) {
                match matching_end(tail, kind) {
                    Some((inner, next)) => {
                        out.push_str(&self.section(kind, expr, inner, vars));
                        rest = next;
                    }
                    None => {
                        // an unclosed block is shown as written
                        out.push_str(&rest[open..open + 2 + close + 2]);
                        rest = tail;
                    }
                }
                continue;
            }
            match (self.expr(tag, vars), self.ctx.unknown) {
                (Some(v), _) => out.push_str(&v),
                (None, Unknown::Keep) => out.push_str(&rest[open..open + 2 + close + 2]),
                (None, Unknown::Empty) => {}
            }
            rest = tail;
        }
        out.push_str(rest);
        out
    }

    fn section(&self, kind: &str, expr: &str, inner: &str, vars: &Map<String, Value>) -> String {
        let (yes, no) = split_else(inner);
        let v = self.value(expr, vars).unwrap_or(Value::Null);
        match kind {
            "if" => self.block(if truthy(&v) { yes } else { no }, vars),
            "unless" => self.block(if truthy(&v) { no } else { yes }, vars),
            _ => {
                let items = match v {
                    Value::Array(a) => a,
                    Value::Null => vec![],
                    other => vec![other],
                };
                if items.is_empty() {
                    return self.block(no, vars);
                }
                items
                    .into_iter()
                    .enumerate()
                    .map(|(i, item)| {
                        let mut scope = vars.clone();
                        if let Value::Object(fields) = &item {
                            scope.extend(fields.clone());
                        }
                        scope.insert("this".into(), item);
                        scope.insert("@index".into(), Value::from(i + 1));
                        self.block(yes, &scope)
                    })
                    .collect()
            }
        }
    }

    /// A tag's text, or None to leave it as written.
    fn expr(&self, tag: &str, vars: &Map<String, Value>) -> Option<String> {
        if tag == "cursor" {
            return Some(CURSOR.to_string());
        }
        if let Some(name) = tag.strip_prefix("include:") {
            if self.depth >= MAX_INCLUDE_DEPTH {
                return None;
            }
            let text = (self.ctx.include)(name.trim())?;
            return Some(Renderer { ctx: self.ctx, depth: self.depth + 1 }.block(&text, vars));
        }
        self.value(tag, vars).map(|v| text_of(&v))
    }

    /// `head | filter:arg | …` → a value; None when the head is unknown and no filter supplies one.
    fn value(&self, expr: &str, vars: &Map<String, Value>) -> Option<Value> {
        let parts = split_pipes(expr);
        let mut v = self.head(parts[0].trim(), vars);
        let prompt = parts[0].trim().starts_with("prompt:");
        for f in &parts[1..] {
            let (name, arg) = f.trim().split_once(':').map_or((f.trim(), None), |(n, a)| (n.trim(), Some(unquote(a.trim()))));
            if prompt && PROMPT_KINDS.contains(&name) {
                continue; // how it is asked (prompt_kinds), not a filter
            }
            v = filter(v, name, arg.as_deref());
        }
        v
    }

    fn head(&self, head: &str, vars: &Map<String, Value>) -> Option<Value> {
        if head.len() >= 2 && (head.starts_with('"') && head.ends_with('"') || head.starts_with('\'') && head.ends_with('\'')) {
            return Some(Value::from(&head[1..head.len() - 1]));
        }
        if let Ok(n) = head.parse::<f64>() {
            return serde_json::Number::from_f64(n).map(Value::Number);
        }
        let (name, arg) = head.split_once(':').map_or((head, None), |(n, a)| (n.trim(), Some(a)));
        if name == "title" && arg.is_none() {
            return Some(Value::from(self.ctx.title));
        }
        if name == "prompt" {
            return arg.and_then(|q| vars.get(q.trim()).cloned());
        }
        if let Some(when) = self.moment(name) {
            let (fmt, default) = match name.trim_start_matches(|c: char| c.is_alphabetic()) {
                _ if name.starts_with("time") => (arg, "HH:mm"),
                _ if name.starts_with("now") => (arg, "YYYY-MM-DD HH:mm"),
                _ => (arg, "YYYY-MM-DD"),
            };
            return Some(Value::from(dates::format(&when, fmt.filter(|f| !f.is_empty()).unwrap_or(default))));
        }
        if arg.is_some() {
            return None;
        }
        lookup(vars, name)
    }

    /// `date`, `time`, `now`, `day`, each with offsets (`day-1d`, `date+2w+3h`): the moment it names.
    fn moment(&self, name: &str) -> Option<NaiveDateTime> {
        let base = ["date", "time", "now", "day"].into_iter().find(|b| name.starts_with(b))?;
        let mut when = if base == "day" {
            NaiveDate::parse_from_str(self.ctx.title.get(..10).unwrap_or(""), "%Y-%m-%d").map(|d| d.and_time(self.ctx.now.time())).unwrap_or(self.ctx.now)
        } else {
            self.ctx.now
        };
        let mut rest = &name[base.len()..];
        while !rest.is_empty() {
            let sign = match rest.as_bytes()[0] {
                b'+' => 1,
                b'-' => -1,
                _ => return None,
            };
            let digits = rest[1..].find(|c: char| !c.is_ascii_digit()).unwrap_or(rest.len() - 1);
            let n: i64 = rest[1..1 + digits].parse().ok()?;
            let unit = rest[1 + digits..].chars().next()?;
            when = match unit {
                'h' => when + Duration::hours(sign * n),
                'd' => when + Duration::days(sign * n),
                'w' => when + Duration::weeks(sign * n),
                'm' | 'y' => {
                    let months = Months::new((n * if unit == 'y' { 12 } else { 1 }) as u32);
                    if sign > 0 { when.checked_add_months(months)? } else { when.checked_sub_months(months)? }
                }
                _ => return None,
            };
            rest = &rest[2 + digits..];
        }
        Some(when)
    }
}

/// `a.b.c` in the values; a name with dots of its own (a property "file.name") wins over the path.
fn lookup(vars: &Map<String, Value>, name: &str) -> Option<Value> {
    if let Some(v) = vars.get(name) {
        return Some(v.clone());
    }
    let mut parts = name.split('.');
    let mut v = vars.get(parts.next()?)?;
    for p in parts {
        v = match v {
            Value::Object(o) => o.get(p)?,
            Value::Array(a) => a.get(p.parse::<usize>().ok()?)?,
            _ => return None,
        };
    }
    Some(v.clone())
}

fn filter(v: Option<Value>, name: &str, arg: Option<&str>) -> Option<Value> {
    let each = |v: Value, f: &dyn Fn(String) -> String| match v {
        Value::Array(a) => Value::Array(a.into_iter().map(|x| Value::from(f(text_of(&x)))).collect()),
        other => Value::from(f(text_of(&other))),
    };
    Some(match (name, v) {
        ("default", v) => match v {
            Some(v) if truthy(&v) => v,
            _ => Value::from(arg.unwrap_or("")),
        },
        (_, None) => return None,
        ("upper", Some(v)) => each(v, &|s| s.to_uppercase()),
        ("lower", Some(v)) => each(v, &|s| s.to_lowercase()),
        ("capitalize", Some(v)) => each(v, &|s| {
            let mut c = s.chars();
            c.next().map(|f| f.to_uppercase().chain(c).collect()).unwrap_or_default()
        }),
        ("trim", Some(v)) => each(v, &|s| s.trim().to_string()),
        ("slug", Some(v)) => each(v, &|s| {
            let s: String = s.to_lowercase().chars().map(|c| if c.is_alphanumeric() { c } else { '-' }).collect();
            s.split('-').filter(|p| !p.is_empty()).collect::<Vec<_>>().join("-")
        }),
        // a value already written as a link stays one
        ("link", Some(v)) => each(v, &|s| if s.starts_with("[[") || s.is_empty() { s } else { format!("[[{s}]]") }),
        ("replace", Some(v)) => {
            let (from, to) = arg.and_then(|a| a.split_once(',')).unwrap_or((arg.unwrap_or(""), ""));
            each(v, &|s| if from.is_empty() { s } else { s.replace(from, to) })
        }
        ("date", Some(v)) => {
            let fmt = arg.unwrap_or("YYYY-MM-DD");
            each(v, &|s| dates::parse(&s).map(|d| dates::format(&d, fmt)).unwrap_or(s))
        }
        ("join", Some(Value::Array(a))) => Value::from(a.iter().map(text_of).collect::<Vec<_>>().join(arg.unwrap_or(", "))),
        ("join", Some(v)) => v,
        ("first", Some(Value::Array(a))) => a.into_iter().next()?,
        ("last", Some(Value::Array(a))) => a.into_iter().last()?,
        ("first" | "last", Some(v)) => v,
        ("count", Some(Value::Array(a))) => Value::from(a.len()),
        ("count", Some(v)) => Value::from(usize::from(truthy(&v))),
        // an unknown filter: the tag stays as written, so the typo shows
        _ => return None,
    })
}

fn text_of(v: &Value) -> String {
    match v {
        Value::Null => String::new(),
        Value::String(s) => s.clone(),
        Value::Array(a) => a.iter().map(text_of).collect::<Vec<_>>().join(", "),
        other => other.to_string(),
    }
}

fn truthy(v: &Value) -> bool {
    match v {
        Value::Null => false,
        Value::Bool(b) => *b,
        Value::String(s) => !s.trim().is_empty(),
        Value::Array(a) => !a.is_empty(),
        Value::Number(n) => n.as_f64() != Some(0.0),
        Value::Object(o) => !o.is_empty(),
    }
}

fn unquote(s: &str) -> String {
    let q = s.len() >= 2 && (s.starts_with('"') && s.ends_with('"') || s.starts_with('\'') && s.ends_with('\''));
    if q { s[1..s.len() - 1].to_string() } else { s.to_string() }
}

/// `a | b:"x|y" | c` → the parts, a `|` inside quotes kept.
fn split_pipes(s: &str) -> Vec<&str> {
    let mut parts = vec![];
    let (mut start, mut quote) = (0, None);
    for (i, c) in s.char_indices() {
        match (c, quote) {
            ('"' | '\'', None) => quote = Some(c),
            (c, Some(q)) if c == q => quote = None,
            ('|', None) => {
                parts.push(&s[start..i]);
                start = i + 1;
            }
            _ => {}
        }
    }
    parts.push(&s[start..]);
    parts
}

/// The text up to the `{{/kind}}` that closes a block (nested blocks of the same kind counted) and
/// what follows it.
fn matching_end<'s>(src: &'s str, kind: &str) -> Option<(&'s str, &'s str)> {
    let (open, close) = (format!("{{{{#{kind}"), format!("{{{{/{kind}}}}}"));
    let (mut depth, mut at) = (0usize, 0usize);
    loop {
        let next_close = src[at..].find(&close)? + at;
        match src[at..next_close].find(&open) {
            Some(o) => {
                depth += 1;
                at += o + open.len();
            }
            None if depth == 0 => return Some((&src[..next_close], &src[next_close + close.len()..])),
            None => {
                depth -= 1;
                at = next_close + close.len();
            }
        }
    }
}

/// A block's `{{else}}` at its own level (not one inside a nested block).
fn split_else(src: &str) -> (&str, &str) {
    let mut depth = 0i32;
    let mut i = 0;
    while let Some(o) = src[i..].find("{{") {
        let at = i + o;
        let tag = src[at + 2..].split("}}").next().unwrap_or("").trim();
        if tag.starts_with('#') {
            depth += 1;
        } else if tag.starts_with('/') {
            depth -= 1;
        } else if tag == "else" && depth == 0 {
            return (&src[..at], &src[at + 2 + src[at + 2..].find("}}").unwrap_or(0) + 2..]);
        }
        i = at + 2;
    }
    (src, "")
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn run(t: &str, values: Value) -> Rendered {
        let now = NaiveDate::from_ymd_opt(2026, 10, 17).unwrap().and_hms_opt(14, 5, 0).unwrap();
        let include = |name: &str| (name == "footer").then(|| "— {{title}}".to_string());
        let ctx = Ctx { title: "2026-10-20 Tue", now, values: values.as_object().cloned().unwrap_or_default(), include: &include, unknown: Unknown::Keep };
        render(t, &ctx)
    }

    #[test]
    fn dates_formats_and_offsets() {
        let r = run("{{date}} {{time}} {{date:dddd D MMMM}} {{date+1d}} {{date-1m:YYYY-MM}} {{day}} [[{{day-1d}}]] {{now+2h:HH:mm}}", json!({}));
        assert_eq!(r.text, "2026-10-17 14:05 Saturday 17 October 2026-10-18 2026-09 2026-10-20 [[2026-10-19]] 16:05");
    }

    #[test]
    fn values_filters_and_unknown_tags() {
        let v = json!({"author": ["Ada Lovelace", "Alan Turing"], "book": {"year": 1843}, "status": "", "kind": "film"});
        let r = run("{{author | link | join:\" · \"}} {{book.year}} {{status | default:to-read}} {{kind | upper}} {{nope}} {{kind | nofilter}} {{author | count}}", v);
        assert_eq!(r.text, "[[Ada Lovelace]] · [[Alan Turing]] 1843 to-read FILM {{nope}} {{kind | nofilter}} 2");
        assert_eq!(run("{{title | slug}}", json!({})).text, "2026-10-20-tue");
        assert_eq!(run("{{when | date:D MMM YYYY}}", json!({"when": "2026-03-05"})).text, "5 Mar 2026");
    }

    #[test]
    fn a_generated_note_drops_what_its_source_did_not_give() {
        let now = NaiveDate::from_ymd_opt(2026, 10, 17).unwrap().and_hms_opt(14, 5, 0).unwrap();
        let none = |_: &str| None;
        let ctx = Ctx { title: "Dune", now, values: json!({"year": 2021}).as_object().cloned().unwrap(), include: &none, unknown: Unknown::Empty };
        assert_eq!(render("{{title}} ({{year}}) {{director | link}}", &ctx).text, "Dune (2021) ");
    }

    #[test]
    fn blocks_nest_and_iterate() {
        let v = json!({"cast": [{"name": "A"}, {"name": "B"}], "rating": 4, "review": ""});
        let t = "{{#each cast}}{{@index}}. {{name}}\n{{/each}}{{#if rating}}★{{rating}}{{#if review}} {{review}}{{else}} (no review){{/if}}{{else}}unrated{{/if}}{{#unless review}}!{{/unless}}";
        assert_eq!(run(t, v).text, "1. A\n2. B\n★4 (no review)!");
        assert_eq!(run("{{#each tags}}x{{else}}none{{/each}}", json!({})).text, "none");
        assert_eq!(run("{{#if x}}open", json!({"x": 1})).text, "{{#if x}}open");
    }

    #[test]
    fn the_values_a_template_reads_are_named_for_the_plugins_that_provide_them() {
        let t = "{{title}} {{date:YYYY}} {{day-1d}} {{weather.city | upper}} {{#if weather.rain}}☔{{/if}} {{#each tasks}}{{this}}{{/each}} {{prompt:Q}} {{\"x\"}} {{cursor}}";
        assert_eq!(names_used(t), vec!["weather", "tasks"]);
    }

    #[test]
    fn prompt_kinds_say_how_to_ask_and_render_as_the_answer() {
        let t = "{{prompt:Course | choice:Physics, Maths}} {{prompt:Due | date}} {{prompt:Project | note:projects/ | link}} {{prompt:N | number}} {{prompt:Free}} {{prompt:Course}}";
        assert_eq!(
            prompt_kinds(t),
            vec![
                ("Course".into(), PromptKind::Choice(vec!["Physics".into(), "Maths".into()])),
                ("Due".into(), PromptKind::Date),
                ("Project".into(), PromptKind::Note("projects".into())),
                ("N".into(), PromptKind::Number),
                ("Free".into(), PromptKind::Text),
            ]
        );
        let mut values = Map::new();
        for (k, v) in [("Course", "Maths"), ("Due", "2026-11-02"), ("Project", "Thesis"), ("N", "3"), ("Free", "x")] {
            values.insert(k.into(), Value::from(v));
        }
        let include = |_: &str| None;
        let now = NaiveDate::from_ymd_opt(2026, 10, 20).unwrap().and_hms_opt(9, 0, 0).unwrap();
        let ctx = Ctx { title: "t", now, values, include: &include, unknown: Unknown::Keep };
        assert_eq!(render(t, &ctx).text, "Maths 2026-11-02 [[Thesis]] 3 x Maths");
    }

    #[test]
    fn prompts_include_and_cursor() {
        let t = "---\nproject: {{prompt:Project | default:misc}}\n---\n# {{prompt:Project}}\n{{cursor}}\n{{include:footer}} {{include:missing}}";
        assert_eq!(prompts(t), vec!["Project"]);
        let r = run(t, json!({}));
        assert_eq!(r.text, "---\nproject: misc\n---\n# {{prompt:Project}}\n\n— 2026-10-20 Tue {{include:missing}}");
        assert_eq!(r.cursor, Some(5));
        assert!(run(t, json!({"Project": "Bath"})).text.contains("# Bath"));
    }
}
