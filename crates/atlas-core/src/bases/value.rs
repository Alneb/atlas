//! # `Val` — the dynamic value type for the Bases engine
//!
//! Rust is statically typed: a variable is an `i64` or a `String`, not "whatever".
//! But a base cell can hold *any* kind of value (a number, some text, a date, a
//! link, a list…). The classic way to model "one of several shapes" in Rust is an
//! **`enum`**: `Val` below has one *variant* per possible kind. Code then uses
//! `match` to handle each variant.
//!
//! This module also defines how values compare and coerce — the rules that make
//! `status == link("Done")` or `date >= today() - "1 day"` behave like Obsidian.

use super::dates;
use chrono::NaiveDateTime;
use std::collections::BTreeMap;

/// A dynamic value. Each line is one possible shape a value can take.
/// `#[derive(Debug, Clone)]` = printable for debugging, and `.clone()`-able.
#[derive(Debug, Clone)]
pub enum Val {
    Null,
    Bool(bool),
    Num(f64),
    Str(String),
    /// An Obsidian internal link, storing the raw target (without alias).
    Link(String),
    List(Vec<Val>),
    Map(BTreeMap<String, Val>),
    Date(NaiveDateTime),
}

impl Val {
    pub fn is_empty(&self) -> bool {
        match self {
            Val::Null => true,
            Val::Str(s) => s.trim().is_empty(),
            Val::List(l) => l.is_empty(),
            Val::Map(m) => m.is_empty(),
            _ => false,
        }
    }

    /// Truthiness used when a filter expression yields a non-boolean.
    pub fn truthy(&self) -> bool {
        match self {
            Val::Null => false,
            Val::Bool(b) => *b,
            Val::Num(n) => *n != 0.0,
            Val::Str(s) => !s.is_empty(),
            Val::List(l) => !l.is_empty(),
            Val::Map(m) => !m.is_empty(),
            Val::Link(_) | Val::Date(_) => true,
        }
    }

    /// Normalised string used for link/string equality (basename, case-insensitive).
    pub fn link_key(&self) -> Option<String> {
        let raw = match self {
            Val::Link(t) => t.clone(),
            Val::Str(s) => s.clone(),
            _ => return None,
        };
        // strip a possible heading / alias and take the last path segment
        let raw = raw.split('|').next().unwrap_or(&raw);
        let raw = raw.split('#').next().unwrap_or(raw);
        let base = raw.rsplit('/').next().unwrap_or(raw);
        let base = base.strip_suffix(".md").unwrap_or(base);
        Some(base.trim().to_lowercase())
    }

    /// Equality with Obsidian's quirks baked in (see the match arms): dates
    /// compare by calendar day, a date vs. a date-shaped string is parsed and
    /// compared, and anything involving a link compares by normalized basename.
    /// `match (self, other)` pattern-matches on the *pair* of values at once.
    pub fn eq_val(&self, other: &Val) -> bool {
        match (self, other) {
            (Val::Null, Val::Null) => true,
            (Val::Bool(a), Val::Bool(b)) => a == b,
            (Val::Num(a), Val::Num(b)) => a == b,
            // dates compare at day granularity (Obsidian's `== today()` semantics)
            (Val::Date(a), Val::Date(b)) => a.date() == b.date(),
            (Val::Date(d), Val::Str(s)) | (Val::Str(s), Val::Date(d)) => {
                dates::parse(s).map(|p| p.date() == d.date()).unwrap_or(false)
            }
            // any comparison involving a link compares by link key
            (Val::Link(_), _) | (_, Val::Link(_)) => match (self.link_key(), other.link_key()) {
                (Some(a), Some(b)) => a == b,
                _ => false,
            },
            (Val::Str(a), Val::Str(b)) => a == b,
            _ => false,
        }
    }

    /// Ordering for sorts; returns None when incomparable.
    pub fn cmp_val(&self, other: &Val) -> Option<std::cmp::Ordering> {
        match (self, other) {
            (Val::Num(a), Val::Num(b)) => a.partial_cmp(b),
            (Val::Date(a), Val::Date(b)) => Some(a.cmp(b)),
            // a date compared with a parseable date-string compares chronologically
            (Val::Date(a), Val::Str(s)) => dates::parse(s).map(|p| a.cmp(&p)),
            (Val::Str(s), Val::Date(b)) => dates::parse(s).map(|p| p.cmp(b)),
            (Val::Bool(a), Val::Bool(b)) => Some(a.cmp(b)),
            // Two strings that both look like dates sort chronologically (e.g. a
            // date column whose values weren't ISO so they stayed `Str`); other
            // string pairs sort case-insensitively.
            (Val::Str(a), Val::Str(b)) => match (dates::parse(a), dates::parse(b)) {
                (Some(da), Some(db)) => Some(da.cmp(&db)),
                _ => Some(a.to_lowercase().cmp(&b.to_lowercase())),
            },
            _ => {
                let a = self.sort_string();
                let b = other.sort_string();
                Some(a.cmp(&b))
            }
        }
    }

    fn sort_string(&self) -> String {
        match self {
            Val::Null => String::new(),
            Val::Str(s) => s.to_lowercase(),
            Val::Link(t) => self.link_key().unwrap_or_else(|| t.to_lowercase()),
            Val::Num(n) => format!("{n:020.6}"),
            Val::Bool(b) => b.to_string(),
            Val::Date(d) => d.format("%Y-%m-%dT%H:%M:%S").to_string(),
            Val::List(l) => l.first().map(|v| v.sort_string()).unwrap_or_default(),
            Val::Map(_) => String::new(),
        }
    }

    pub fn as_num(&self) -> Option<f64> {
        match self {
            Val::Num(n) => Some(*n),
            Val::Str(s) => s.trim().parse().ok(),
            Val::Bool(b) => Some(if *b { 1.0 } else { 0.0 }),
            Val::List(l) => Some(l.len() as f64),
            _ => None,
        }
    }
}

/// Parse a frontmatter YAML scalar string, detecting `[[wikilinks]]`.
pub fn from_yaml(y: &serde_yaml::Value) -> Val {
    match y {
        serde_yaml::Value::Null => Val::Null,
        serde_yaml::Value::Bool(b) => Val::Bool(*b),
        serde_yaml::Value::Number(n) => Val::Num(n.as_f64().unwrap_or(0.0)),
        serde_yaml::Value::String(s) => str_to_val(s),
        serde_yaml::Value::Sequence(seq) => Val::List(seq.iter().map(from_yaml).collect()),
        serde_yaml::Value::Mapping(m) => {
            let mut map = BTreeMap::new();
            for (k, v) in m {
                if let Some(ks) = k.as_str() {
                    map.insert(ks.to_string(), from_yaml(v));
                }
            }
            Val::Map(map)
        }
        serde_yaml::Value::Tagged(t) => from_yaml(&t.value),
    }
}

fn str_to_val(s: &str) -> Val {
    let t = s.trim();
    // A bare `[[Note]]` is a single link. But a string that merely *contains*
    // wikilinks (e.g. `[[Physics]],[[TFM]]`) is NOT one link — the inner would
    // hold stray `]]`/`[[`. Those stay `Str` and are rendered link-aware later
    // (matching how the note property editor renders them), so they show as
    // separate links rather than one broken target.
    if t.starts_with("[[")
        && t.ends_with("]]")
        && t.len() >= 4
        && !t[2..t.len() - 2].contains("[[")
        && !t[2..t.len() - 2].contains("]]")
    {
        let inner = &t[2..t.len() - 2];
        // keep alias off the stored target; display handled elsewhere
        return Val::Link(inner.to_string());
    }
    // Obsidian's date properties are ISO-formatted (YYYY-MM-DD[THH:MM:SS]). Detect
    // these so bases render and sort them as real dates (and the client can
    // reformat them to fit the column width). The ISO-prefix guard avoids turning
    // ambiguous text like "3/4" into a date.
    if looks_like_iso_date(t) {
        if let Some(d) = dates::parse(t) {
            return Val::Date(d);
        }
    }
    Val::Str(s.to_string())
}

/// True if `s` begins with an ISO calendar date `YYYY-MM-DD`.
fn looks_like_iso_date(s: &str) -> bool {
    let b = s.as_bytes();
    s.len() >= 10
        && b[0..4].iter().all(u8::is_ascii_digit)
        && b[4] == b'-'
        && b[5].is_ascii_digit()
        && b[6].is_ascii_digit()
        && b[7] == b'-'
        && b[8].is_ascii_digit()
        && b[9].is_ascii_digit()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn iso_date_detection() {
        assert!(looks_like_iso_date("2026-06-04"));
        assert!(looks_like_iso_date("2026-06-04T10:30:00"));
        assert!(!looks_like_iso_date("3/4"));
        assert!(!looks_like_iso_date("2026/06/04"));
        assert!(!looks_like_iso_date("hello world"));
    }

    #[test]
    fn str_to_val_classifies() {
        assert!(matches!(str_to_val("[[Some Note]]"), Val::Link(t) if t == "Some Note"));
        // a string holding *several* wikilinks is not one link — stays a string
        // so it renders as separate links (matches the property editor)
        assert!(matches!(str_to_val("[[Physics]],[[TFM]]"), Val::Str(_)));
        assert!(matches!(str_to_val("2026-06-04"), Val::Date(_)));
        // ambiguous text must stay a string, not become a date
        assert!(matches!(str_to_val("3/4"), Val::Str(_)));
        assert!(matches!(str_to_val("just text"), Val::Str(_)));
    }

    #[test]
    fn link_key_normalises() {
        // basename, alias/heading stripped, lowercased, .md removed
        assert_eq!(Val::Link("Folder/My Note.md".into()).link_key().unwrap(), "my note");
        assert_eq!(Val::Link("Note#Heading".into()).link_key().unwrap(), "note");
        assert_eq!(Val::Link("Note|Alias".into()).link_key().unwrap(), "note");
        assert!(Val::Num(1.0).link_key().is_none());
    }

    #[test]
    fn eq_val_link_and_string() {
        // a link equals a plain string with the same basename
        assert!(Val::Link("Folder/Foo.md".into()).eq_val(&Val::Str("foo".into())));
        assert!(Val::Num(1.0).eq_val(&Val::Num(1.0)));
        assert!(!Val::Num(1.0).eq_val(&Val::Num(2.0)));
    }

    #[test]
    fn truthiness_and_empty() {
        // truthy() is non-empty (no trim); is_empty() trims whitespace
        assert!(!Val::Str(String::new()).truthy());
        assert!(Val::Str("  ".into()).truthy());
        assert!(Val::Str("x".into()).truthy());
        assert!(Val::Str("   ".into()).is_empty());
        assert!(!Val::Num(0.0).is_empty());
        assert!(Val::List(vec![]).is_empty());
    }

    #[test]
    fn as_num_coercions() {
        assert_eq!(Val::Str(" 42 ".into()).as_num(), Some(42.0));
        assert_eq!(Val::Bool(true).as_num(), Some(1.0));
        assert_eq!(Val::List(vec![Val::Null, Val::Null]).as_num(), Some(2.0));
        assert_eq!(Val::Null.as_num(), None);
    }
}
