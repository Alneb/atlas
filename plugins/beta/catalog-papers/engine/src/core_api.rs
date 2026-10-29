//! The helper's seams, through the core over the helper pipe (atlas-plugin): the network (the core's plugin fetch,
//! so the plugin's `net` permissions apply), a new entry's note, the Trash, captures and the plugin's settings.
use crate::connector::Host;
use crate::entry::{self, Companion};
use crate::net::{only_pdf, Miss, Net};
use crate::refs::{Res, Trash};
use crate::settings::Settings;
use atlas_plugin::{q, Atlas, Verb};
use serde_json::{json, Value};
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{Duration, Instant};

/// arXiv asks for one request every three seconds.
const ARXIV_EVERY: Duration = Duration::from_secs(3);

pub struct CoreApi {
    pub atlas: Atlas,
    pub plugin: String,
    /// The vault, canonical (`ATLAS_ROOT`): the helper runs where the vault is.
    pub root: PathBuf,
    arxiv_last: Mutex<Option<Instant>>,
}

fn why(e: atlas_plugin::Error) -> String {
    e.why
}

impl CoreApi {
    pub fn new(plugin: String, root: PathBuf) -> CoreApi {
        CoreApi { atlas: Atlas::new(), plugin, root, arxiv_last: Mutex::new(None) }
    }

    /// `POST /api/plugins/<id>/fetch`; a PDF is saved into the plugin's cache (`save_to`) and read back from disk.
    fn fetch(&self, url: &str, save_to: Option<&str>) -> Res<Value> {
        self.fetch_with(url, save_to, None)
    }

    /// `fetch` with an `Authorization` header from the plugin's secret (`(name, prefix)`), filled in by the core.
    fn fetch_with(&self, url: &str, save_to: Option<&str>, secret: Option<(&str, &str)>) -> Res<Value> {
        let r = self.ask(url, save_to, secret, false)?;
        match r["ok"].as_bool() {
            Some(true) => Ok(r),
            _ => Err(format!("{url}: {}", r["status"].as_u64().map_or("no answer".to_string(), |s| format!("HTTP {s}")))),
        }
    }

    /// The core's answer as it is, `ok` or not; `quiet`: a sign-in met is not offered (plugin_net `quiet`).
    fn ask(&self, url: &str, save_to: Option<&str>, secret: Option<(&str, &str)>, quiet: bool) -> Res<Value> {
        if url.contains("arxiv.org/") {
            let mut last = self.arxiv_last.lock().unwrap_or_else(|e| e.into_inner());
            if let Some(wait) = last.map(|t| ARXIV_EVERY.saturating_sub(t.elapsed())) {
                std::thread::sleep(wait);
            }
            *last = Some(Instant::now());
        }
        let mut req = json!({ "url": url, "timeout_secs": 25, "headers": { "user-agent": "Atlas/0.1 (research workspace)" } });
        if let Some((name, prefix)) = secret {
            req["headers"]["authorization"] = json!({ "secret": name, "prefix": prefix });
        }
        if let Some(s) = save_to {
            req["save_to"] = s.into();
        }
        if quiet {
            req["quiet"] = true.into();
        }
        self.atlas.post(&format!("/api/plugins/{}/fetch", q(&self.plugin)), &req).map_err(why)
    }

    /// The plugin's settings: given with a tool's call (`params.settings`), else asked of the core (the plugin's
    /// entry in `GET /api/plugins`: its settings file with the declared defaults). No core (a test run): defaults.
    pub fn settings(&self, params: &Value) -> Settings {
        if params["settings"].is_object() {
            return Settings::from_value(&params["settings"]);
        }
        let all = self.atlas.get("/api/plugins").unwrap_or(Value::Null);
        let mine = all.as_array().into_iter().flatten().find(|p| p["id"].as_str() == Some(self.plugin.as_str()));
        Settings::from_value(mine.map_or(&Value::Null, |p| &p["settings"]))
    }

    /// What the other plugins contribute to this one (`[contributes.catalog-papers]`: the PDF sources).
    pub fn contributions(&self) -> Res<serde_json::Map<String, Value>> {
        let v = self.atlas.get(&format!("/api/plugins/{}/contributions", q(&self.plugin))).map_err(why)?;
        Ok(v.as_object().cloned().unwrap_or_default())
    }

    /// Another plugin's tool (a PDF source).
    pub fn tool(&self, plugin: &str, tool: &str, input: &Value) -> Res<Value> {
        self.atlas.post(&format!("/api/plugins/{}/tools/{}", q(plugin), q(tool)), input).map_err(why)
    }
}

impl Net for CoreApi {
    fn json(&self, url: &str) -> Res<Value> {
        let r = self.fetch(url, None)?;
        serde_json::from_str(r["text"].as_str().unwrap_or_default()).map_err(|e| format!("{url}: not JSON ({e})"))
    }
    fn text(&self, url: &str) -> Res<String> {
        Ok(self.fetch(url, None)?["text"].as_str().unwrap_or_default().to_string())
    }
    fn json_with_secret(&self, url: &str, secret: &str, prefix: &str) -> Res<Value> {
        let r = self.fetch_with(url, None, Some((secret, prefix)))?;
        serde_json::from_str(r["text"].as_str().unwrap_or_default()).map_err(|e| format!("{url}: not JSON ({e})"))
    }
    fn pdf(&self, url: &str) -> Result<Vec<u8>, Miss> {
        let name = format!("pdf-{:x}.pdf", url.bytes().fold(0u64, |h, b| h.wrapping_mul(31).wrapping_add(b as u64)));
        let r = self.ask(url, Some(&name), None, true).map_err(Miss::Other)?;
        if !r["signin"].is_null() {
            return Err(Miss::Gate(url.to_string()));
        }
        if r["ok"].as_bool() != Some(true) {
            return Err(Miss::Other(format!("{url}: {}", r["status"].as_u64().map_or("no answer".to_string(), |s| format!("HTTP {s}")))));
        }
        let saved = r["saved"].as_str().ok_or_else(|| Miss::Other(format!("{url}: nothing saved")))?;
        let path = atlas_text::paths::safe_join(&self.root, saved).map_err(Miss::Other)?;
        let bytes = std::fs::read(&path).map_err(|e| Miss::Other(format!("{saved}: {e}")));
        let _ = std::fs::remove_file(&path); // written into the entry by the caller; the cache keeps no second copy
        only_pdf(url, bytes?).map_err(Miss::Other)
    }
    fn offer_signin(&self, url: &str) {
        let _ = self.ask(url, None, None, false); // the core sees the gate again and offers it this time
    }
}

impl Companion for CoreApi {
    /// The core's companion note (`POST /api/companion`): the vault's literature template with the entry's properties
    /// (entry::companion_properties) and the paper's block; `entry::write` then sets the entry's other fields. No
    /// answer (an older core): the plain note the core makes without a template.
    fn make(&self, dir: &Path, key: &str, m: &serde_yaml::Mapping) -> Res<()> {
        let rel = atlas_text::paths::rel_path(&self.root, dir).ok_or_else(|| format!("{} is outside the vault", dir.display()))?;
        let props = entry::companion_properties(key, m);
        let title = props.get("title").and_then(serde_yaml::Value::as_str).unwrap_or(key).to_string();
        // as YAML text: a JSON object would reach the core with its keys sorted (serde_json without preserve_order)
        let yaml = serde_yaml::to_string(&props).map_err(|e| e.to_string())?;
        let ask = json!({ "path": format!("{rel}/"), "title": title, "properties": yaml, "block": "library.paper" });
        let asked = self.atlas.call(Verb::Post, "/api/companion", Some(&ask));
        let note = dir.join(entry::note_file(key));
        if asked.is_ok() && note.is_file() {
            return Ok(());
        }
        let today = chrono::Local::now().format("%Y-%m-%d").to_string();
        atlas_plugin::write_file(&note, entry::plain_note(key, &title, &today).as_bytes()).map_err(|e| e.to_string())
    }
}

impl Trash for CoreApi {
    /// `POST /api/fs/trash?path=`: the desktop's Trash, else `.atlas/trash/<time>/`.
    fn trash(&self, rel: &str) -> Res<String> {
        let r = self.atlas.call(Verb::Post, &format!("/api/fs/trash?path={}", q(rel)), None).map_err(why)?;
        Ok(r["to"].as_str().unwrap_or_default().to_string())
    }
}

/// The connector's host: the core, with the settings read at each request.
pub struct ConnectorHost(pub CoreApi);

impl Host for ConnectorHost {
    fn net(&self) -> &dyn Net {
        &self.0
    }
    fn companion(&self) -> &dyn Companion {
        &self.0
    }
    fn trash(&self) -> &dyn Trash {
        &self.0
    }
    fn settings(&self) -> Settings {
        self.0.settings(&Value::Null)
    }
    fn capture(&self, text: &str) -> Res<()> {
        self.0.atlas.capture(text).map(drop).map_err(why)
    }
    fn changed(&self, paths: Vec<String>) {
        atlas_plugin::event("papers:changed", json!({ "paths": paths }));
    }
}
