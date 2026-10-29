//! The Email plugin's helper: the engine (lib) behind the line protocol (docs/guides/PLUGIN-API.md). Every method is
//! answered on its own thread, so a long sync never holds up a click; events (new mail, sync status, consent) go to
//! the page as they happen.
use atlas_plugin::{error, event, serve_threads, SharedMethods};
use email::{api, index::Index, mail::Mail};
use std::path::PathBuf;
use std::sync::Arc;

fn main() {
    let root = std::env::var_os("ATLAS_ROOT").map(PathBuf::from).unwrap_or_else(|| PathBuf::from("."));
    let cache = std::env::var_os("ATLAS_PLUGIN_CACHE").map(PathBuf::from).unwrap_or_else(|| root.join(".atlas/cache/plugins/email"));
    let index = match Index::open(&cache.join("index.sqlite")) {
        Ok(i) => i,
        Err(e) => {
            eprintln!("email: {e}; using a memory index");
            Index::memory()
        }
    };
    let m = Mail::new(index, cache, root, Arc::new(email::oauth::core_post), Box::new(|name: &str, data| event(name, data)));
    // a newer parser: kept bodies read again behind, then the lists redrawn
    let again = m.clone();
    std::thread::spawn(move || {
        let n = again.index.reparse();
        let j = again.index.rejoin();
        if n > 0 {
            eprintln!("email: {n} kept messages read again with the newer parser");
        }
        if j > 0 {
            eprintln!("email: {j} conversations joined to the ones their messages answer");
        }
        if n + j > 0 {
            again.event("changed", serde_json::json!({}));
        }
    });
    let mut methods = SharedMethods::new();
    for (name, f) in api::table() {
        let m = m.clone();
        methods.add(name, move |p| api::call(&m, f, &p).map_err(error));
    }
    serve_threads(methods);
}
