fn main() {
    frames_library();
    tauri_build::build()
}

/// Linux: the web tabs' libsoup hook (frames/frames.rs) as a shared library in OUT_DIR, embedded by main.rs. Plain rustc,
/// no crates: it is loaded into WebKit's network process and must carry nothing else.
fn frames_library() {
    println!("cargo:rerun-if-changed=frames/frames.rs");
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() != Ok("linux") {
        return;
    }
    let out = std::path::PathBuf::from(std::env::var("OUT_DIR").expect("OUT_DIR")).join("libatlas-webkit-frames.so");
    let rustc = std::env::var("RUSTC").unwrap_or_else(|_| "rustc".into());
    let target = std::env::var("TARGET").expect("TARGET");
    let status = std::process::Command::new(rustc)
        .args(["--edition", "2021", "--crate-type", "cdylib", "--crate-name", "atlas_webkit_frames", "-C", "opt-level=2", "-C", "panic=abort", "-C", "strip=symbols", "--target", &target, "-o"])
        .arg(&out)
        .arg("frames/frames.rs")
        .status()
        .expect("rustc did not start (the web tabs' frames library)");
    assert!(status.success(), "the web tabs' frames library (frames/frames.rs) did not build");
}
