//! The Calendar (DAV) plugin's helper. With no argument it serves Atlas over the helper pipe (plugin.toml `[helper]`),
//! each call on its own thread; with a method name it runs that one method on the JSON params read from stdin and
//! prints the answer (for tests and by hand):
//!   echo '{"settings": {...}, "secrets": {"password": "..."}}' | dav calendars
use atlas_dav::{api, conf};
use atlas_plugin::{serve_threads, SharedMethods};
use serde_json::{json, Value};
use std::sync::atomic::Ordering;

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let Some(method) = args.first() else {
        conf::SERVING.store(true, Ordering::Relaxed);
        let mut m = SharedMethods::new();
        for (name, f) in api::table() {
            m.add(name, f);
        }
        serve_threads(m);
        return;
    };
    let Some(run) = api::table().into_iter().find(|(n, _)| n == method).map(|(_, f)| f) else {
        let names: Vec<&str> = api::table().iter().map(|(n, _)| *n).collect();
        eprintln!("dav: no method {method:?} ({})", names.join(", "));
        std::process::exit(2);
    };
    let mut input = String::new();
    let _ = std::io::Read::read_to_string(&mut std::io::stdin(), &mut input);
    let params: Value = if input.trim().is_empty() {
        json!({})
    } else {
        serde_json::from_str(&input).unwrap_or_else(|e| {
            eprintln!("dav: params are not JSON: {e}");
            std::process::exit(2)
        })
    };
    match run(params) {
        Ok(v) => println!("{}", serde_json::to_string_pretty(&v).unwrap_or_default()),
        Err(e) => {
            eprintln!("dav: {e}");
            std::process::exit(1);
        }
    }
}
