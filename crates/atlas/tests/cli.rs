//! The CLI must work with no server running: files are written directly.
use std::process::Command;

fn atlas(ws: &std::path::Path, args: &[&str]) -> std::process::Output {
    Command::new(env!("CARGO_BIN_EXE_atlas")).arg("--workspace").arg(ws).args(args).output().unwrap()
}

#[test]
fn offline_capture_cmd_and_today() {
    let d = tempfile::tempdir().unwrap();
    std::fs::write(d.path().join("FOCUS.md"), "# Focus\nthesis chapter 2\n").unwrap();
    std::fs::write(d.path().join("todo.md"), "- [ ] email Georges\n").unwrap();

    let out = atlas(d.path(), &["capture", "first", "thought"]);
    assert!(out.status.success(), "{}", String::from_utf8_lossy(&out.stderr));
    let date = chrono_like_today();
    // a new vault's log: notes/log, a day opening with its properties and a heading (capture.rs)
    assert_eq!(String::from_utf8_lossy(&out.stdout).trim(), format!("notes/log/{date}.md:7"));
    let log = std::fs::read_to_string(d.path().join(format!("notes/log/{date}.md"))).unwrap();
    assert!(log.starts_with(&format!("---\ndate: {date}\ntype: log\n---\n# ")) && log.trim_end().ends_with(" first thought"), "{log}");

    let out = atlas(d.path(), &["cmd", "notify", r#"{"title":"x"}"#]);
    assert!(!out.status.success(), "notify without a UI must fail loudly");

    let out = atlas(d.path(), &["today"]);
    let text = String::from_utf8_lossy(&out.stdout);
    assert!(out.status.success());
    assert!(
        text.contains("thesis chapter 2") && text.contains("email Georges") && text.contains("first thought"),
        "{text}"
    );
}

#[test]
fn the_guides_travel_with_the_binary() {
    let d = tempfile::tempdir().unwrap();
    let out = atlas(d.path(), &["guide"]);
    assert!(out.status.success());
    assert!(String::from_utf8_lossy(&out.stdout).starts_with("# Extending Atlas from inside a vault"));
    let out = atlas(d.path(), &["guide", "--develop"]);
    assert!(String::from_utf8_lossy(&out.stdout).starts_with("# Developing Atlas"));
}

/// Today's local date via `date`, to avoid a chrono dev-dependency for one string.
fn chrono_like_today() -> String {
    let out = Command::new("date").arg("+%Y-%m-%d").output().unwrap();
    String::from_utf8(out.stdout).unwrap().trim().to_string()
}
