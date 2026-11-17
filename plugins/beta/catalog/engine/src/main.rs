//! The catalog plugin's helper: the engine served over the helper pipe, with Atlas reached back through the same pipe
//! (docs/guides/PLUGIN-API.md, "Calling Atlas back"). Methods: `recognize`, `preview`, `add`, `download`, `refresh`, `kinds`, `capture`.
use atlas_catalog::engine::{Downloaded, Engine, Fail, Host, Pick};
use atlas_catalog::model::{Fields, IdName, Ids, KindName, Narration, PluginId};
use atlas_catalog::thing::{Thing, Why};
use atlas_plugin::{q, serve, Atlas, Methods};
use serde_json::{json, Map, Value};

struct Core(Atlas);

fn why(e: atlas_plugin::Error) -> Fail {
    e.why
}

/// The frontmatter of a note's text as fields (none: an empty set).
fn frontmatter(text: &str) -> Fields {
    let Some(yaml) = atlas_text::frontmatter::split(text).0 else { return Fields::new() };
    serde_yaml::from_str::<serde_json::Value>(yaml).ok().and_then(|v| serde_json::from_value(v).ok()).unwrap_or_default()
}

impl Host for Core {
    fn contributions(&self) -> Result<Map<String, Value>, Fail> {
        let v = self.0.get("/api/plugins/catalog/contributions").map_err(why)?;
        let mut out = v.as_object().cloned().unwrap_or_default();
        // the page a link points to, read by this engine: one more (low-priority) source for every kind, unless the
        // "Read the page a link points to" setting is off (it was the Catalog · Web pages plugin)
        let plugins = self.0.get("/api/plugins").unwrap_or_default();
        let mine = plugins.as_array().into_iter().flatten().find(|p| p["id"] == "catalog");
        if mine.is_none_or(|p| p["settings"]["read_pages"] != false) {
            out.entry("catalog").or_insert_with(|| json!({ "sources": [{ "kind": "*", "engine": "clip", "priority": 10, "needs": ["url"] }] }));
        }
        Ok(out)
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
        if !path.starts_with("/api/") {
            return Err(format!("{path}: a source's api must be a path of Atlas's own API (/api/…)"));
        }
        self.0.post(path, &input).map_err(why)
    }

    fn clip(&self, input: Value) -> Result<Value, Fail> {
        // a page read here (the catalog's own page source), fetched through the core's fetch
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
        serde_json::to_value(clip).map_err(|e| e.to_string())
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

    fn notes_with(&self, properties: &[String]) -> Result<Vec<(String, Fields)>, Fail> {
        if properties.is_empty() {
            return Ok(Vec::new());
        }
        // one Bases query over the core's index: every note having one of them, with them and its type as columns
        let q = |s: &str| serde_json::to_string(s).unwrap_or_default();
        let keys: Vec<&str> = std::iter::once("type").chain(properties.iter().map(String::as_str)).collect();
        let any: String = properties.iter().map(|p| format!("      - file.hasProperty({})\n", q(p))).collect();
        let order: String = keys.iter().map(|k| format!("      - {}\n", q(k))).collect();
        let src = format!("filters:\n  or:\n{any}views:\n  - type: table\n    name: things\n    order:\n{order}");
        let r = self.0.post("/api/base/query", &json!({ "src": src })).map_err(why)?;
        let view = &r["views"][0];
        let cols: Vec<Option<String>> = view["columns"].as_array().into_iter().flatten().map(|c| c["key"].as_str().map(str::to_string)).collect();
        let mut out = Vec::new();
        for row in view["rows"].as_array().into_iter().flatten() {
            let Some(path) = row["path"].as_str() else { continue };
            let mut f = Fields::new();
            for (k, v) in cols.iter().zip(row["values"].as_array().into_iter().flatten()) {
                if let Some(k) = k.as_ref().filter(|_| !v.is_null()) {
                    f.insert(k.clone(), v.clone());
                }
            }
            out.push((path.to_string(), f));
        }
        Ok(out)
    }

    fn companion_find(&self, file: &str) -> Result<Option<String>, Fail> {
        let r = self.0.post("/api/companion", &json!({ "path": file, "find": true })).map_err(why)?;
        match r["path"].as_str() {
            Some(p) if self.exists(p)? => Ok(Some(p.to_string())),
            _ => Ok(None),
        }
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
            // there, but no text to give: a PDF (415), a large file (413)
            Err(e) if matches!(e.status, Some(413 | 415)) => Ok(true),
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

    fn download(&self, url: &str, cache_name: &str) -> Result<Downloaded, Fail> {
        // streamed to the cache by the core (up to its file limit), never through this pipe
        let r = self.0.post("/api/plugins/catalog/fetch", &json!({ "url": url, "headers": { "accept": "*/*" }, "timeout_secs": 180, "save_to": cache_name })).map_err(why)?;
        if !r["signin"].is_null() {
            return Err(format!("{url}: a sign-in stands in front of it; sign in, then download it again"));
        }
        if r["ok"].as_bool() != Some(true) {
            return Err(format!("{url} answered {}", r["status"].as_u64().map_or("nothing".to_string(), |s| format!("HTTP {s}"))));
        }
        let saved = r["saved"].as_str().ok_or_else(|| format!("{url}: nothing saved"))?.to_string();
        Ok(Downloaded { saved, content_type: r["headers"]["content-type"].as_str().unwrap_or_default().to_string() })
    }

    fn move_file(&self, from: &str, to: &str) -> Result<(), Fail> {
        self.0.post("/api/fs/move", &json!({ "from": from, "to": to })).map(drop).map_err(why)
    }

    fn companion(&self, file: &str, title: &str, properties: &[(String, Value)]) -> Result<String, Fail> {
        // as YAML text, so the core keeps their order (a JSON object reaches it with its keys sorted)
        let mut m = serde_yaml::Mapping::new();
        for (k, v) in properties {
            m.insert(k.as_str().into(), serde_yaml::to_value(v).map_err(|e| e.to_string())?);
        }
        let yaml = serde_yaml::to_string(&m).map_err(|e| e.to_string())?;
        let r = self.0.post("/api/companion", &json!({ "path": file, "title": title, "properties": yaml })).map_err(why)?;
        r["path"].as_str().map(str::to_string).ok_or_else(|| format!("{file}: the core named no note"))
    }

    fn pdf_text(&self, path: &str) -> Option<String> {
        // the core extracts a PDF's text for search as soon as it arrives (pdf_text.rs); waited for a little, then
        // the document is filed without it (a scanned PDF has none at all)
        let cached = format!(".atlas/cache/pdftext/{path}.txt");
        for _ in 0..PDF_TEXT_TRIES {
            match self.0.read(&cached) {
                Ok(t) => return Some(t),
                Err(e) if e.status == Some(404) => std::thread::sleep(std::time::Duration::from_millis(500)),
                Err(_) => return None,
            }
        }
        None
    }

    fn pdf_info(&self, path: &str) -> atlas_catalog::first_page::Info {
        // the helper runs where the vault is (`ATLAS_ROOT`), as catalog-papers reads its PDFs
        let root = std::env::var_os("ATLAS_ROOT").map(std::path::PathBuf::from).unwrap_or_default();
        let Ok(abs) = atlas_text::paths::safe_join(&root, path) else { return Default::default() };
        std::fs::read(abs).map(|b| atlas_catalog::first_page::info_of_bytes(&b)).unwrap_or_default()
    }
}

/// Half-seconds a PDF's text is waited for.
const PDF_TEXT_TRIES: u32 = 30;

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
        known: fields_param(p, "fields"),
    }
}

fn fields_param(p: &Value, key: &str) -> Fields {
    p.get(key).cloned().and_then(|v| serde_json::from_value::<Fields>(v).ok()).unwrap_or_default()
}

/// The `note` tool's thing: its kind, IDs, what its server says, the vault file it is.
fn thing_param(p: &Value) -> Thing {
    let ids: Ids = p.get("ids").cloned().and_then(|v| serde_json::from_value::<serde_json::Map<String, Value>>(v).ok()).unwrap_or_default()
        .into_iter()
        // a server's id may come as a number (Suwayomi's): IDs are text
        .filter_map(|(k, v)| match v { Value::String(s) => Some((IdName::new(k), s)), Value::Number(n) => Some((IdName::new(k), n.to_string())), _ => None })
        .collect();
    Thing {
        kind: p.get("kind").and_then(Value::as_str).filter(|k| !k.is_empty()).map(KindName::new),
        ids,
        known: fields_param(p, "fields"),
        file: p.get("file").and_then(Value::as_str).filter(|f| !f.trim().is_empty()).map(str::to_string),
        own: fields_param(p, "own"),
    }
}

fn answer<T: serde::Serialize>(r: Result<T, Fail>) -> atlas_plugin::Result<Value> {
    r.and_then(|v| serde_json::to_value(v).map_err(|e| format!("the answer could not be written as JSON: {e}"))).map_err(|why| atlas_plugin::Error { status: None, why })
}

/// The engine for one call, with the plugin's settings the core sends with it (`params.settings`).
fn engine(p: &Value) -> Engine<Core> {
    Engine::new(Core(Atlas::new())).with_documents(p.pointer("/settings/documents").and_then(Value::as_str).unwrap_or_default())
}

fn main() {
    let mut m = Methods::new();
    m.add("recognize", move |p| answer(Ok(engine(&p).recognize(&text_param(&p, "text")?))));
    m.add("preview", move |p| answer(engine(&p).preview(&text_param(&p, "text")?, &pick_param(&p))));
    m.add("add", move |p| answer(engine(&p).add(&text_param(&p, "text")?, &pick_param(&p))));
    // the note of a thing a plugin shows (an Audiobookshelf book, a Suwayomi series, an EPUB): found, or made once it
    // is yours (thing.rs) — the one rule every plugin and both apps ask
    m.add("note", move |p| {
        let why = Why::parse(p.get("why").and_then(Value::as_str), p.get("progress").and_then(Value::as_f64)).map_err(|why| atlas_plugin::Error { status: None, why })?;
        answer(engine(&p).note_of(&thing_param(&p), why))
    });
    m.add("download", move |p| answer(engine(&p).download(&text_param(&p, "text")?)));
    // what `download` keeps, by extension: the one list the Captures view asks for its "Download" (document.rs)
    m.add("document_types", move |_| Ok(json!(atlas_catalog::document::DOCUMENTS)));
    m.add("refresh", move |p| answer(engine(&p).refresh(&text_param(&p, "path")?)));
    // after every capture: only what a pattern recognises (a link, a DOI, an ISBN…) — a plain thought starts no search
    m.add("capture", move |p| {
        if p.pointer("/settings/on_capture").and_then(Value::as_bool) == Some(false) {
            return Ok(json!({ "skipped": "switched off in the catalog's settings" }));
        }
        let text = text_param(&p, "text")?;
        let e = engine(&p);
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
    m.add("kinds", move |p| {
        let mut say = Narration::default();
        let reg = engine(&p).load(&mut say);
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
