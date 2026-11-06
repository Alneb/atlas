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
    println!("cargo:rustc-env=ATLAS_COMMIT={}", commit());
}

/// The commit this core is built from, shown in Settings beside the version: `git rev-parse` in a checkout (rebuilt
/// when HEAD moves), else a `COMMIT` file beside this crate (the server's build context has no .git: bundle.sh writes
/// it), else empty.
fn commit() -> String {
    let crate_dir = Path::new(env!("CARGO_MANIFEST_DIR"));
    let git = crate_dir.join("../../.git");
    if git.exists() {
        println!("cargo:rerun-if-changed=../../.git/HEAD");
        println!("cargo:rerun-if-changed=../../.git/logs/HEAD");
        let out = std::process::Command::new("git").args(["rev-parse", "--short=8", "HEAD"]).current_dir(crate_dir).output();
        if let Some(o) = out.ok().filter(|o| o.status.success()) {
            return String::from_utf8_lossy(&o.stdout).trim().to_string();
        }
    }
    println!("cargo:rerun-if-changed=COMMIT");
    std::fs::read_to_string(crate_dir.join("COMMIT")).map(|s| s.trim().to_string()).unwrap_or_default()
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
