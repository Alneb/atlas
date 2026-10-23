//! rust-embed needs `ui/dist` to exist at compile time; the UI may not be built yet,
//! so drop a placeholder page instead of failing the build.
// ui/dist is the repo's build output, not a vault: vault_write does not apply
#![allow(clippy::disallowed_methods)]
use std::path::Path;

fn main() {
    let dist = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../ui/dist");
    let index = dist.join("index.html");
    if !index.exists() {
        std::fs::create_dir_all(&dist).expect("create ui/dist");
        std::fs::write(
            &index,
            "<!doctype html><meta charset=utf-8><title>Atlas</title>\
             <p>Atlas server is running, but the UI is not built yet: \
             <code>npm --prefix ui run build</code>.</p>\n",
        )
        .expect("write placeholder ui/dist/index.html");
    }
    println!("cargo:rerun-if-changed=../../ui/dist");
}
