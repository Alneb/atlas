//! A read-only check on a real account (EXAMINE / BODY.PEEK only; no rules, nothing written to the server):
//! `cargo run --release -p atlas-email --example realcheck -- <params.json> <index dir> [prefetch]`, where params.json
//! holds { settings: { accounts: [...] }, secrets: {...} } for password accounts. Prints counts, never mail content
//! beyond subjects of the biggest conversations.
use email::{index::Index, mail::Mail, sync};
use std::sync::Arc;

fn main() {
    let a: Vec<String> = std::env::args().collect();
    let params: serde_json::Value = serde_json::from_str(&std::fs::read_to_string(&a[1]).unwrap()).unwrap();
    let dir = std::path::PathBuf::from(&a[2]);
    let mut params = params;
    params["settings"]["prefetch"] = serde_json::json!(a.get(3).and_then(|p| p.parse::<u64>().ok()).unwrap_or(300));
    let ix = Index::open(&dir.join("index.sqlite")).unwrap();
    let m = Mail::new(ix, dir.join("cache"), dir.join("vault"), Arc::new(|_: &str, _: &[(&str, &str)]| Err("no network".into())), Box::new(|n: &str, d| if n == "progress" || n == "status" { eprintln!("{n} {d}") }));
    m.remember(&params);
    for acc in m.accounts().into_iter().flatten() {
        let t = std::time::Instant::now();
        let r = m.rt.block_on(sync::account(&m, &acc, None));
        println!("{}: {:?} in {:.1}s", acc.name, r.as_ref().map(|r| (r.folders, r.added, r.removed, &r.errors)), t.elapsed().as_secs_f64());
        let t = std::time::Instant::now();
        let rows = m.index.list(&email::index::Scope { folders: vec![(acc.name.clone(), "INBOX".into())], ..Default::default() }, 100, 0);
        println!("  inbox first 100 conversations listed in {:.1} ms", t.elapsed().as_secs_f64() * 1000.0);
        let mut big: Vec<_> = m.index.list(&Default::default(), 100000, 0);
        let n = big.len();
        big.sort_by_key(|c| -c.count);
        println!("  conversations: {n}; biggest: {:?}", big.iter().take(8).map(|c| (c.count, c.subject.chars().take(50).collect::<String>())).collect::<Vec<_>>());
        let no_snip = rows.iter().filter(|c| c.snippet.is_empty()).count();
        println!("  inbox rows without a snippet (of {}): {no_snip}", rows.len());
    }
    for f in m.index.folders(None) {
        println!("  {} {:?} total {} unread {}", f.label, f.role, f.total, f.unread);
    }
}
