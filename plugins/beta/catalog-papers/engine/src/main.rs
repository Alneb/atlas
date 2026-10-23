//! The catalog-papers helper (`papers`): the references library served over the helper pipe
//! (docs/guides/PLUGIN-API.md, "Calling Atlas back"), the core reached back through the same pipe (core_api.rs).
//! Methods: list add import attach edit merge type delete bibtex bib citekey fold (the References view), lookup and
//! catalog_add (the catalog's tools `lookup` / `add`), connector (the Zotero Connector's listener, on or off as the
//! settings say; started with the helper).
use atlas_papers::catalog;
use atlas_papers::connector::{self, Connector, Listener};
use atlas_papers::core_api::{ConnectorHost, CoreApi};
use atlas_papers::refs::{ImportOpts, Lib, PaperEdit, Res};
use atlas_papers::settings::Settings;
use atlas_plugin::{serve, Methods};
use serde::de::DeserializeOwned;
use serde_json::{json, Value};
use std::cell::RefCell;
use std::path::{Path, PathBuf};
use std::rc::Rc;

type Answer = atlas_plugin::Result<Value>;

fn fail(why: impl Into<String>) -> atlas_plugin::Error {
    atlas_plugin::Error { status: None, why: why.into() }
}

fn answer<T: serde::Serialize>(r: Res<T>) -> Answer {
    r.and_then(|v| serde_json::to_value(v).map_err(|e| format!("the answer could not be written as JSON: {e}"))).map_err(fail)
}

fn text(p: &Value, key: &str) -> atlas_plugin::Result<String> {
    p[key].as_str().map(str::to_string).ok_or_else(|| fail(format!("{key:?} is needed")))
}

fn parse<T: DeserializeOwned>(p: &Value) -> atlas_plugin::Result<T> {
    serde_json::from_value(p.clone()).map_err(|e| fail(format!("params: {e}")))
}

/// The vault: `ATLAS_ROOT` (set by the core), canonical so every path check holds.
fn vault() -> PathBuf {
    let root = std::env::var_os("ATLAS_ROOT").map(PathBuf::from).unwrap_or_else(|| PathBuf::from("."));
    root.canonicalize().unwrap_or(root)
}

/// One method: the library with this call's settings.
fn with_lib<T: serde::Serialize>(core: &CoreApi, p: &Value, f: impl FnOnce(&Lib) -> Res<T>) -> Answer {
    let cfg = core.settings(p);
    answer(f(&Lib { root: &core.root, cfg: &cfg, net: core, made: core, trash: core }))
}

/// The Connector's listener as the settings want it: started when on (and not running), stopped when off.
fn sync_connector(slot: &RefCell<Option<Listener>>, cfg: &Settings, plugin: &str, root: &Path) -> Value {
    let mut l = slot.borrow_mut();
    match (cfg.connector, l.is_some()) {
        (true, false) => {
            let host = ConnectorHost(CoreApi::new(plugin.to_string(), root.to_path_buf()));
            *l = Some(Listener::start(Connector::new(host, root.to_path_buf()), connector::port()));
        }
        (false, true) => *l = None, // dropped: stopped
        _ => {}
    }
    json!({ "on": cfg.connector, "port": l.as_ref().map(|l| l.port), "listening": l.as_ref().is_some_and(|l| l.listening()) })
}

fn main() {
    let plugin = std::env::var("ATLAS_PLUGIN_ID").ok().filter(|p| !p.is_empty()).unwrap_or_else(|| "catalog-papers".into());
    let root = vault();
    let core = Rc::new(CoreApi::new(plugin.clone(), root.clone()));
    let listener = Rc::new(RefCell::new(None));
    sync_connector(&listener, &core.settings(&Value::Null), &plugin, &root);

    let mut m = Methods::new();
    let c = core.clone();
    m.add("list", move |p| with_lib(&c, &p, |lib| lib.list()));
    let c = core.clone();
    m.add("add", move |p| {
        let id = text(&p, "id")?;
        with_lib(&c, &p, |lib| lib.add(&id))
    });
    // a PDF the page uploaded into the vault (best: this plugin's cache, which is emptied after) filed as an entry
    let c = core.clone();
    m.add("import", move |p| {
        let path = text(&p, "path")?;
        let name = p["name"].as_str().map(String::from).unwrap_or_else(|| path.rsplit('/').next().unwrap_or(&path).to_string());
        let opts: ImportOpts = parse(&p)?;
        let file = atlas_text::paths::safe_join(&c.root, &path).map_err(fail)?;
        let bytes = std::fs::read(&file).map_err(|e| fail(format!("{path}: {e}")))?;
        let r = with_lib(&c, &p, |lib| lib.import_pdf_with(&name, &bytes, &opts));
        if r.is_ok() && path.starts_with(&format!(".atlas/cache/plugins/{}/", c.plugin)) {
            let _ = std::fs::remove_file(&file); // filed: the upload is not kept twice
        }
        r
    });
    let c = core.clone();
    m.add("attach", move |p| {
        let (key, file, from) = (text(&p, "key")?, text(&p, "file")?, text(&p, "from")?);
        with_lib(&c, &p, |lib| lib.attach_pdf(&key, &file, &from))
    });
    let c = core.clone();
    m.add("edit", move |p| {
        let e: PaperEdit = parse(&p)?;
        with_lib(&c, &p, |lib| lib.edit(&e))
    });
    let c = core.clone();
    m.add("merge", move |p| {
        let (dup, into) = (text(&p, "dup")?, text(&p, "into")?);
        with_lib(&c, &p, |lib| lib.merge(&dup, &into))
    });
    let c = core.clone();
    m.add("type", move |p| {
        let (key, kind) = (text(&p, "key")?, text(&p, "kind")?);
        with_lib(&c, &p, |lib| lib.set_type(&key, &kind))
    });
    let c = core.clone();
    m.add("delete", move |p| {
        let key = text(&p, "key")?;
        with_lib(&c, &p, |lib| lib.delete(&key).map(|to| json!({ "path": key, "to": to })))
    });
    let c = core.clone();
    m.add("bibtex", move |p| {
        let key = text(&p, "key")?;
        with_lib(&c, &p, |lib| lib.bibtex(&key))
    });
    let c = core.clone();
    m.add("bib", move |p| with_lib(&c, &p, |lib| lib.write_bib().map(|n| json!({ "entries": n }))));
    // the key a paper with these fields would get here (what `add` names its folder); authors "Last, First" joined
    // by "; ", or a list
    let c = core.clone();
    m.add("citekey", move |p| {
        let title = text(&p, "title")?;
        let authors: Vec<String> = match &p["authors"] {
            Value::Array(a) => a.iter().filter_map(Value::as_str).map(String::from).collect(),
            Value::String(s) => s.split("; ").map(str::trim).filter(|a| !a.is_empty()).map(String::from).collect(),
            _ => vec![],
        };
        let year = p["year"].as_str().map(String::from).or_else(|| p["year"].as_u64().map(|y| y.to_string()));
        with_lib(&c, &p, |lib| lib.next_citekey(&authors, year.as_deref(), &title).map(|key| json!({ "key": key })))
    });
    // the entry's note, made when missing (the UI opens it: a citation chip, the Library's "Notes")
    let c = core.clone();
    m.add("note", move |p| {
        let key = text(&p, "key")?;
        with_lib(&c, &p, |lib| lib.note(&key).map(|path| json!({ "path": path })))
    });
    let c = core.clone();
    m.add("notes", move |p| with_lib(&c, &p, |lib| lib.notes().map(|made| json!({ "made": made }))));
    let c = core.clone();
    m.add("fold", move |p| {
        let apply = p["apply"].as_bool().unwrap_or(false);
        with_lib(&c, &p, |lib| lib.fold_all(apply))
    });
    // the catalog's tools (plugin.toml [[tool]] lookup, and add → method catalog_add)
    let c = core.clone();
    m.add("lookup", move |p| {
        let cfg = c.settings(&p);
        let lib = Lib { root: &c.root, cfg: &cfg, net: &*c, made: &*c, trash: &*c };
        let key_of = |title: &str, year: Option<String>, authors: &[String]| lib.next_citekey(authors, year.as_deref(), title).ok();
        Ok(catalog::lookup(&*c, &p, &cfg.email, &key_of))
    });
    let c = core.clone();
    m.add("catalog_add", move |p| {
        let sources = || c.contributions();
        let ask = |s: &catalog::Source, paper: &Value| c.tool(&s.plugin, &s.tool, paper);
        with_lib(&c, &p, |lib| catalog::add(lib, &p, &sources, &ask))
    });
    let (c, l) = (core.clone(), listener.clone());
    m.add("connector", move |p| Ok(sync_connector(&l, &c.settings(&p), &c.plugin, &c.root)));
    serve(m);
}
