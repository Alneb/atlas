//! Prints what the parser reads from a message file — its text, preview and parts: `cargo run --example text -- <file.eml>`.
fn main() {
    for path in std::env::args().skip(1) {
        let raw = std::fs::read(&path).expect("a message file");
        let b = email::parse::body(&raw).expect("parsed");
        println!("== {path}\n-- text ({} chars):\n{}\n-- preview: {:?}\n-- parts: {:?}", b.text.len(), b.text.chars().take(600).collect::<String>(), email::parse::snippet(&b.text, 200), b.attachments.iter().map(|a| (&a.name, &a.mime)).collect::<Vec<_>>());
    }
}
