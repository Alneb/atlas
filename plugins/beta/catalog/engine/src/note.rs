//! The note of a thing: written new by the catalog, or brought up to date property by property. The user's body and
//! every property the kind does not own are never touched (PHILOSOPHY §2), so a refresh can run any number of times.
use crate::kind::Kind;
use crate::merge::Merged;
use crate::model::Fields;
use serde_json::Value;

/// The properties a new note gets, in order: `type`, the IDs, the owned fields (the kind's order, or by name), then
/// what the rules add (`extra`).
/// Fields that are never properties: a page's whole text, markup. They read as noise in a note's frontmatter.
const NOT_PROPERTIES: &[&str] = &["text", "body_html", "html", "review"];

/// The properties a note gets, in order: `type`, the owned fields (the kind's order, or by name), what the rules add
/// (`extra`), then the IDs — what a person reads first, the identifiers last. Each field under the vault's own name
/// (`rename`) and shape (`as_links`).
pub fn properties(kind: &Kind, m: &Merged, extra: &[String]) -> Vec<(String, Value)> {
    let mut out: Vec<(String, Value)> = vec![("type".into(), Value::String(kind.note_type().into()))];
    let mut push = |field: &str, v: &Value| {
        let key = kind.property_of(field);
        if !NOT_PROPERTIES.contains(&field) && out.iter().all(|(o, _)| o != key) {
            out.push((key.to_string(), kind.shown(field, v)));
        }
    };
    if kind.properties.is_empty() {
        m.fields.iter().for_each(|(k, v)| push(k, v));
    } else {
        kind.properties.iter().filter_map(|k| m.fields.get(k).map(|v| (k, v))).for_each(|(k, v)| push(k, v));
    }
    extra.iter().filter_map(|k| m.fields.get(k).map(|v| (k, v))).for_each(|(k, v)| push(k, v));
    for (p, v) in kind.id_properties(&m.ids) {
        if out.iter().all(|(o, _)| *o != p) {
            out.push((p, Value::String(v)));
        }
    }
    out
}

/// Words worth a note's text: not empty, and not a line of facts a shop page gives as its description ("Radiohead ·
/// album · 1997 · 12 songs", "Listen to … on Spotify").
pub(crate) fn prose(t: &str) -> bool {
    let t = t.trim();
    !t.is_empty() && t.matches(" · ").count() < 2 && !t.starts_with("Listen to ")
}

/// A note's text with its description brought up to date: only a paragraph that is still word for word what a source
/// wrote (`written`) is replaced, so the user's own words never are. None when there is nothing to change.
pub fn with_description(text: &str, now: &str, written: &[String]) -> Option<String> {
    let now = now.trim();
    for old in written.iter().map(|t| t.trim()).filter(|t| !t.is_empty() && *t != now) {
        // a paragraph of its own: a blank line before it, a line end or the text's end after it
        let at = text.match_indices(old).map(|(i, _)| i).find(|&i| text[..i].ends_with("\n\n") && matches!(text[i + old.len()..].chars().next(), None | Some('\n')));
        if let Some(i) = at {
            return Some(format!("{}{now}{}", &text[..i], &text[i + old.len()..]));
        }
    }
    None
}

/// A `set:` value with `{today}` / `{now}` filled in (`now` is `YYYY-MM-DD HH:MM`).
fn stamped(v: &Value, now: &str) -> Value {
    match v {
        Value::String(s) => Value::String(s.replace("{now}", now).replace("{today}", now.get(..10).unwrap_or(now))),
        Value::Array(a) => Value::Array(a.iter().map(|x| stamped(x, now)).collect()),
        v => v.clone(),
    }
}

/// A new note's whole text: frontmatter, then the kind's template (`{{field}}`, `{{block}}`) or the block and room
/// for the user.
pub fn render(kind: &Kind, m: &Merged, extra: &[String], template: Option<&str>, now: &str) -> String {
    let mut map = serde_yaml::Mapping::new();
    let mut props = properties(kind, m, extra);
    // the vault's own starting properties (`topics`, `date`); a property the catalog fills keeps its value
    for (k, v) in &kind.set {
        if props.iter().all(|(p, _)| p != k) {
            props.push((k.clone(), stamped(v, now)));
        }
    }
    // a new note starts on its collection's first shelf, right under its type; from then on the shelf is the user's
    if let Some((k, v)) = kind.library.first_shelf().filter(|(k, _)| props.iter().all(|(p, _)| p != k)) {
        props.insert(1, (k, v));
    }
    for (k, v) in props {
        map.insert(serde_yaml::Value::String(k), serde_yaml::to_value(&v).unwrap_or(serde_yaml::Value::Null));
    }
    let yaml = serde_yaml::to_string(&map).unwrap_or_default();
    let block = format!("```view\ntype: {}\n```", kind.block);
    let body = match template {
        // Atlas's one template language (docs/guides/TEMPLATES.md): `{{director | link}}`, `{{#if cast}}…{{/if}}`,
        // dates; a field no source gave is simply absent
        Some(t) => {
            let mut values: serde_json::Map<String, Value> = m.fields.iter().map(|(k, v)| (k.clone(), v.clone())).collect();
            values.insert("block".into(), Value::String(block.clone()));
            let when = chrono::NaiveDateTime::parse_from_str(now, "%Y-%m-%d %H:%M").unwrap_or_default();
            let title = m.fields.get("title").map(crate::kind::text_of).unwrap_or_default();
            let none = |_: &str| None;
            let ctx = atlas_template::Ctx { title: &title, now: when, values, include: &none, unknown: atlas_template::Unknown::Empty };
            atlas_template::render(t, &ctx).text
        }
        None => match kind.body.as_ref().and_then(|f| m.fields.get(f)).map(crate::kind::text_of).filter(|t| prose(t)) {
            Some(text) => format!("{block}\n\n{text}\n"),
            None => format!("{block}\n\n"),
        },
    };
    // the user's own review (a sync from where they wrote it) under its heading, after the thing itself
    let review = m.fields.get("review").map(crate::kind::text_of).filter(|t| !t.is_empty());
    let body = match review {
        Some(r) => format!("{}\n\n## Review\n\n{r}\n", body.trim_end()),
        None => body,
    };
    format!("---\n{yaml}---\n\n{body}")
}

/// The owned properties whose value changed, to write one by one through the core (which keeps the file's own
/// formatting). A source that now says nothing never blanks a property.
pub fn changes(kind: &Kind, m: &Merged, extra: &[String], current: &Fields) -> Vec<(String, Value)> {
    properties(kind, m, extra)
        .into_iter()
        .filter(|(k, v)| k != "type" && (kind.owns(k) || extra.contains(k)) && current.get(k) != Some(v))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::kind::Kinds;
    use crate::model::{IdName, KindName, PluginId};
    use serde_json::json;

    fn article() -> Kind {
        Kinds::builtin().get(&KindName::new("article")).unwrap().clone()
    }

    fn merged() -> Merged {
        let mut m = Merged::default();
        m.ids.insert(IdName::new("url"), "https://example.org/post".into());
        m.fields = serde_json::from_value(json!({"title": "A post: on things", "site": "example.org", "body_html": "<p>x</p>"})).unwrap();
        m.from.insert("title".into(), PluginId::new("catalog-web"));
        m
    }

    #[test]
    fn only_a_synopsis_still_in_a_sources_words_is_replaced() {
        let note = "---\ntype: movie\n---\n\n```view\ntype: catalog.item\n```\n\nA look at riot police.\n\n## Review\n\nMine.\n";
        let written = vec!["A look at riot police.".to_string()];
        let fresh = with_description(note, "Seis antidisturbios…", &written).unwrap();
        assert!(fresh.contains("\n\nSeis antidisturbios…\n\n## Review\n\nMine.\n"), "{fresh}");
        let edited = note.replace("A look at riot police.", "A look at riot police. My own words.");
        assert_eq!(with_description(&edited, "Seis…", &written), None, "the user's edit stays");
        assert_eq!(with_description(note, "A look at riot police.", &written), None, "the same text: nothing to do");
        assert_eq!(with_description("x\n\nIn a sentence: A look at riot police.\n", "Seis…", &written), None, "only a paragraph of its own");
    }

    #[test]
    fn a_new_note_has_type_ids_owned_fields_and_the_block() {
        let text = render(&article(), &merged(), &[], None, "2026-10-17 13:45");
        assert_eq!(text, "---\ntype: article\ntitle: 'A post: on things'\nsite: example.org\nsource: https://example.org/post\n---\n\n```view\ntype: catalog.item\n```\n\n");
    }

    #[test]
    fn a_template_fills_fields_and_places_the_block() {
        let text = render(&article(), &merged(), &[], Some("# {{ title }}\n\n{{block}}\n\n## What I think\n"), "2026-10-17 13:45");
        assert!(text.ends_with("---\n\n# A post: on things\n\n```view\ntype: catalog.item\n```\n\n## What I think\n"), "{text}");
    }

    #[test]
    fn a_refresh_changes_only_owned_properties_that_differ() {
        let current: Fields = serde_json::from_value(json!({"type": "article", "source": "https://example.org/post", "title": "Old", "site": "example.org", "rating": 4})).unwrap();
        assert_eq!(changes(&article(), &merged(), &[], &current), vec![("title".to_string(), json!("A post: on things"))]);
    }

    #[test]
    fn a_vault_writes_fields_under_its_own_names_as_links_with_its_starting_properties() {
        // films as an Obsidian vault keeps them: `actors`, `poster`, director and genres as links, topics and the capture's date
        let mut k = article();
        k.properties = ["year", "director", "cast", "genres", "cover"].map(String::from).to_vec();
        k.rename = [("cast", "actors"), ("cover", "poster")].map(|(a, b)| (a.to_string(), b.to_string())).into();
        k.as_links = vec!["director".into(), "genres".into()];
        k.set = serde_json::from_value(json!({"topics": ["[[Cinema]]"], "date": "{now}", "year": 1900})).unwrap();
        let mut m = merged();
        m.fields = serde_json::from_value(json!({"title": "Dune", "year": 2021, "director": "Denis Villeneuve", "cast": ["Zendaya", "Josh Brolin"], "genres": ["Science Fiction"], "cover": "https://x/p.jpg", "text": "the page's words"})).unwrap();
        let text = render(&k, &m, &[], None, "2026-10-17 13:45");
        let yaml = text.split("---\n").nth(1).unwrap();
        assert_eq!(yaml, "type: article\nyear: 2021\ndirector: '[[Denis Villeneuve]]'\nactors:\n- Zendaya\n- Josh Brolin\ngenres:\n- '[[Science Fiction]]'\nposter: https://x/p.jpg\nsource: https://example.org/post\ndate: 2026-10-17 13:45\ntopics:\n- '[[Cinema]]'\n", "{text}");
        // a refresh compares under the vault's names and leaves `set` properties alone
        let current: Fields = serde_json::from_value(json!({"type": "article", "year": 2021, "director": "[[Denis Villeneuve]]", "actors": ["Zendaya"], "genres": ["[[Science Fiction]]"], "poster": "https://x/p.jpg", "source": "https://example.org/post", "topics": ["[[Mine]]"]})).unwrap();
        assert_eq!(changes(&k, &m, &[], &current), vec![("actors".to_string(), json!(["Zendaya", "Josh Brolin"]))]);
    }
}
