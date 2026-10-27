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
    let gen = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../ui/src/lib/gen");
    println!("cargo:rustc-env=ATLAS_CORE_TYPES={}", core_types(&gen));
    println!("cargo:rerun-if-changed=../../ui/src/lib/gen");
}

/// The stamp of the types the interface is built against (ui/vite.config.ts `coreTypes`, the same FNV-1a 64 over each
/// generated file's name and bytes, sorted): an installed interface with another stamp is not served (ui_files.rs).
fn core_types(gen: &Path) -> String {
    let mut names: Vec<String> = std::fs::read_dir(gen)
        .map(|d| d.filter_map(|e| e.ok()?.file_name().into_string().ok()).filter(|n| n.ends_with(".ts")).collect())
        .unwrap_or_default();
    names.sort();
    let mut h: u64 = 0xcbf2_9ce4_8422_2325;
    let mut eat = |bytes: &[u8]| bytes.iter().for_each(|b| h = (h ^ u64::from(*b)).wrapping_mul(0x0100_0000_01b3));
    for n in names {
        eat(format!("{n}\0").as_bytes());
        eat(&std::fs::read(gen.join(&n)).unwrap_or_default());
        eat(&[0]);
    }
    format!("{h:016x}")
}
