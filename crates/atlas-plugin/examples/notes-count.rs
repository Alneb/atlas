//! A whole compiled helper: `notes_count` counts the vault's notes, `stamp` appends a line to one, both through the
//! core over the pipe. Build it static for a plugin's `bin/<target>/helper` (docs/guides/PLUGIN-API.md, "Calling Atlas back"):
//!   cargo build --release --example notes-count --target x86_64-unknown-linux-musl
use atlas_plugin::{serve, Atlas, Methods};
use serde_json::json;

fn main() {
    let mut m = Methods::new();
    m.add("notes_count", |_| {
        let n = Atlas::new().files(true)?.iter().filter(|p| p.ends_with(".md")).count();
        Ok(json!({ "notes": n }))
    });
    m.add("stamp", |p| {
        let atlas = Atlas::new();
        let path = p["path"].as_str().unwrap_or("Inbox.md");
        let text = atlas.read(path).unwrap_or_default();
        atlas.write(path, &format!("{text}- stamped by a compiled helper\n"))?;
        Ok(json!({ "ok": true }))
    });
    serve(m);
}
