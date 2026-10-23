//! The catalog plugin's helper: the engine served over the helper pipe, with Atlas reached back through the same pipe
//! (docs/guides/PLUGIN-API.md, "Calling Atlas back"). Methods: `recognize`, `preview`, `add`, `refresh`, `kinds`.
use atlas_catalog::engine::{Engine, Fail, Host, Pick};
use atlas_catalog::model::{Fields, Ids, KindName, Narration, PluginId};
use atlas_plugin::{q, serve, Atlas, Methods};
use serde_json::{json, Map, Value};

struct Core(Atlas);

fn why(e: atlas_plugin::Error) -> Fail {
    e.why
}

/// The frontmatter of a note's text as fields (none: an empty set).
fn frontmatter(text: &str) -> Fields {
    let Some(rest) = text.strip_prefix("---\n").or_else(|| text.strip_prefix("---\r\n")) else { return Fields::new() };
    let Some(end) = rest.find("\n---") else { return Fields::new() };
    serde_yaml::from_str::<serde_json::Value>(&rest[..end]).ok().and_then(|v| serde_json::from_value(v).ok()).unwrap_or_default()
}

impl Host for Core {
    fn contributions(&self) -> Result<Map<String, Value>, Fail> {
        let v = self.0.get("/api/plugins/catalog/contributions").map_err(why)?;
        Ok(v.as_object().cloned().unwrap_or_default())
    }

    fn vault_kinds(&self) -> Result<Vec<(String, String)>, Fail> {
        let entries = match self.0.tree(atlas_catalog::kind::KINDS_DIR) {
            Ok(v) => v,
            Err(e) if e.status == Some(404) => return Ok(Vec::new()),
            Err(e) => return Err(e.why),
        };
        let mut out = Vec::new();
        for e in entries.as_array().into_iter().flatten() {
            let Some(path) = e["path"].as_str() else { continue };
            if e["kind"] == "file" && (path.ends_with(".yaml") || path.ends_with(".yml")) {
                out.push((path.to_string(), self.0.read(path).map_err(why)?));
            }
        }
        Ok(out)
    }

    fn tool(&self, plugin: &PluginId, tool: &str, input: Value) -> Result<Value, Fail> {
        self.0.post(&format!("/api/plugins/{}/tools/{}", q(plugin.as_str()), q(tool)), &input).map_err(why)
    }

    fn api(&self, path: &str, input: Value) -> Result<Value, Fail> {
        // a page read here (catalog-web's source; clip.rs moved from the core), fetched through the core's fetch
        if path == "/api/clip" {
            let url = input.get("url").and_then(Value::as_str).ok_or("clip: no url")?;
            let clip = atlas_catalog::clip::fetch(url, |u, cookie| {
                let mut headers = json!({ "accept": "text/html,application/xhtml+xml,*/*;q=0.8" });
                if !cookie.is_empty() { headers["cookie"] = json!(cookie); }
                let r = self.0.post("/api/plugins/catalog/fetch", &json!({ "url": u, "headers": headers, "timeout_secs": 20 })).map_err(why)?;
                Ok(atlas_catalog::clip::Page {
                    status: r.get("status").and_then(Value::as_u64).unwrap_or(0) as u16,
                    url: r.get("url").and_then(Value::as_str).unwrap_or(u).to_string(),
                    text: r.get("text").and_then(Value::as_str).unwrap_or_default().to_string(),
                })
            })?;
            return serde_json::to_value(clip).map_err(|e| e.to_string());
        }
        if !path.starts_with("/api/") {
            return Err(format!("{path}: a source's api must be a path of Atlas's own API (/api/…)"));
        }
        self.0.post(path, &input).map_err(why)
    }

    fn notes_in(&self, folder: &str) -> Result<Vec<(String, Fields)>, Fail> {
        let prefix = format!("{}/", folder.trim_end_matches('/'));
        let mut out = Vec::new();
        for p in self.0.files(false).map_err(why)?.into_iter().filter(|p| p.starts_with(&prefix) && p.ends_with(".md")) {
            let text = self.0.read(&p).map_err(why)?;
            out.push((p, frontmatter(&text)));
        }
        Ok(out)
    }

    fn props(&self, path: &str) -> Result<Fields, Fail> {
        Ok(frontmatter(&self.0.read(path).map_err(why)?))
    }

    fn read(&self, path: &str) -> Result<Option<String>, Fail> {
        match self.0.read(path) {
            Ok(t) => Ok(Some(t)),
            Err(e) if e.status == Some(404) => Ok(None),
            Err(e) => Err(e.why),
        }
    }

    fn exists(&self, path: &str) -> Result<bool, Fail> {
        match self.0.get(&format!("/api/file?path={}", q(path))) {
            Ok(_) => Ok(true),
            Err(e) if e.status == Some(404) => Ok(false),
            Err(e) => Err(e.why),
        }
    }

    fn now(&self) -> String {
        chrono::Local::now().format("%Y-%m-%d %H:%M").to_string()
    }

    fn create(&self, path: &str, text: &str) -> Result<(), Fail> {
        self.0.write(path, text).map_err(why)
    }

    fn set_property(&self, path: &str, key: &str, value: &Value) -> Result<(), Fail> {
        // the core's property edit takes what a user would type: a list comma-separated
        let (text, list) = match value {
            Value::Array(a) => (a.iter().map(atlas_catalog::kind::text_of).collect::<Vec<_>>().join(", "), true),
            v => (atlas_catalog::kind::text_of(v), false),
        };
        self.0.put("/api/property", &json!({ "path": path, "key": key, "text": text, "list": list })).map(drop).map_err(why)
    }
}

fn text_param(p: &Value, key: &str) -> Result<String, atlas_plugin::Error> {
    p.get(key).and_then(Value::as_str).map(str::to_string).ok_or_else(|| atlas_plugin::Error { status: None, why: format!("{key:?} is needed") })
}

/// The card's choice: `kind`, and `ids` of one of several search results.
fn pick_param(p: &Value) -> Pick {
    Pick {
        kind: p.get("kind").and_then(Value::as_str).filter(|k| !k.is_empty()).map(KindName::new),
        ids: p.get("ids").cloned().and_then(|v| serde_json::from_value::<Ids>(v).ok()).filter(|i| !i.is_empty()),
        own: p.get("own").cloned().and_then(|v| serde_json::from_value::<Fields>(v).ok()).unwrap_or_default(),
        note: p.get("note").and_then(Value::as_str).filter(|n| !n.is_empty()).map(str::to_string),
    }
}

fn answer<T: serde::Serialize>(r: Result<T, Fail>) -> atlas_plugin::Result<Value> {
    r.and_then(|v| serde_json::to_value(v).map_err(|e| format!("the answer could not be written as JSON: {e}"))).map_err(|why| atlas_plugin::Error { status: None, why })
}

fn main() {
    let engine = || Engine::new(Core(Atlas::new()));
    let mut m = Methods::new();
    m.add("recognize", move |p| answer(Ok(engine().recognize(&text_param(&p, "text")?))));
    m.add("preview", move |p| answer(engine().preview(&text_param(&p, "text")?, &pick_param(&p))));
    m.add("add", move |p| answer(engine().add(&text_param(&p, "text")?, &pick_param(&p))));
    m.add("refresh", move |p| answer(engine().refresh(&text_param(&p, "path")?)));
    // after every capture: only what a pattern recognises (a link, a DOI, an ISBN…) — a plain thought starts no search
    m.add("capture", move |p| {
        if p.pointer("/settings/on_capture").and_then(Value::as_bool) == Some(false) {
            return Ok(json!({ "skipped": "switched off in the catalog's settings" }));
        }
        let text = text_param(&p, "text")?;
        let e = engine();
        if e.recognize(&text).result.candidates.is_empty() {
            return Ok(json!({ "skipped": "no link or identifier" }));
        }
        let added = e.add(&text, &Pick::default()).map_err(|why| atlas_plugin::Error { status: None, why })?;
        use atlas_catalog::engine::Outcome;
        let done = if matches!(added.result.outcome, Outcome::Created | Outcome::Delegated) { "Filed" } else { "Already filed" };
        let notice = format!("{done}: {}", added.result.path.trim_end_matches(".md"));
        let mut v = serde_json::to_value(&added).map_err(|e| atlas_plugin::Error { status: None, why: e.to_string() })?;
        v["notice"] = json!(notice);
        Ok(v)
    });
    m.add("kinds", move |_| {
        let mut say = Narration::default();
        let reg = engine().load(&mut say);
        let kinds: Vec<Value> = reg.kinds.iter().map(|(k, o)| json!({ "kind": k, "origin": o })).collect();
        Ok(json!({ "kinds": kinds, "steps": say }))
    });
    serve(m);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn frontmatter_is_read_or_empty() {
        assert_eq!(frontmatter("---\nsource: https://x.org\nyear: 2021\n---\nbody")["year"], json!(2021));
        assert!(frontmatter("no frontmatter").is_empty());
    }
}
