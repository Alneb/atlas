//! A note's frontmatter as the note index keeps it (links.rs): its string-keyed properties in file order, in one boxed
//! slice. A `serde_yaml::Mapping` costs ~160 bytes an entry (a hash, an index slot, a 72-byte `Value` key) plus spare
//! capacity — 6.7 MB of the index's 9.6 on a large real vault; this is ~90 bytes, none spare.
//! Every reader looks properties up by name, so a non-string key (`2024: x`) is dropped here as all of them skipped it.
use serde_yaml::{Mapping, Value};

#[derive(Debug, Clone, Default, PartialEq)]
pub(crate) struct Props(Box<[(Box<str>, Value)]>);

impl Props {
    /// Looked up by a scan: a note has a handful of properties, fewer than a hash would pay for.
    pub fn get(&self, key: &str) -> Option<&Value> {
        self.0.iter().find(|(k, _)| &**k == key).map(|(_, v)| v)
    }

    pub fn contains_key(&self, key: &str) -> bool {
        self.get(key).is_some()
    }

    pub fn iter(&self) -> impl Iterator<Item = (&str, &Value)> {
        self.0.iter().map(|(k, v)| (&**k, v))
    }

    pub fn keys(&self) -> impl Iterator<Item = &str> {
        self.0.iter().map(|(k, _)| &**k)
    }

    pub fn is_empty(&self) -> bool {
        self.0.is_empty()
    }
}

impl From<Mapping> for Props {
    fn from(m: Mapping) -> Self {
        let keyed = m.into_iter().filter_map(|(k, mut v)| {
            shrink(&mut v);
            Some((k.as_str()?.into(), v))
        });
        Props(keyed.collect())
    }
}

/// Spare capacity left by the parser in nested lists and maps.
fn shrink(v: &mut Value) {
    match v {
        Value::Sequence(xs) => {
            xs.iter_mut().for_each(shrink);
            xs.shrink_to_fit();
        }
        Value::Mapping(m) => {
            m.values_mut().for_each(shrink);
            m.shrink_to_fit();
        }
        Value::Tagged(t) => shrink(&mut t.value),
        _ => {}
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn keeps_string_keys_in_order_and_finds_them_by_name() {
        let m: Mapping = serde_yaml::from_str("title: T\n2024: year\ntags: [a, b]\nup: '[[P]]'\n").unwrap();
        let p = Props::from(m);
        assert_eq!(p.keys().collect::<Vec<_>>(), ["title", "tags", "up"], "a non-string key is left out, order kept");
        assert_eq!(p.get("title").and_then(Value::as_str), Some("T"));
        assert!(p.contains_key("tags") && !p.contains_key("2024") && !p.contains_key("missing"));
        assert!(Props::default().is_empty());
    }
}
