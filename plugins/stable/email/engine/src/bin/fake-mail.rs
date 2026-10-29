//! The stand-in mail server for the pane's e2e tests: `fake-mail <dir> [--no-move]` prints {"imap": port, "smtp": port}
//! and serves until killed (src/fake.rs).
fn main() {
    let args: Vec<String> = std::env::args().collect();
    let dir = args.get(1).map(std::path::PathBuf::from);
    let s = email::fake::start(dir, !args.iter().any(|a| a == "--no-move"));
    println!("{}", serde_json::json!({ "imap": s.imap_port, "smtp": s.smtp_port }));
    loop {
        std::thread::park();
    }
}
