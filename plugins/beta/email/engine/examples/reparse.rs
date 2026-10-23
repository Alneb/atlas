//! Reads a copy of an index's kept bodies again with the current parser, and joins split conversations: `cargo run --example reparse -- <index.sqlite>`.
fn main() {
    let path = std::env::args().nth(1).expect("an index.sqlite (a copy: it is rewritten)");
    let ix = email::index::Index::open(std::path::Path::new(&path)).expect("index");
    let t = std::time::Instant::now();
    let n = ix.reparse();
    println!("read again: {n} bodies in {:?}", t.elapsed());
    let t = std::time::Instant::now();
    println!("joined: {} conversations in {:?}", ix.rejoin(), t.elapsed());
}
