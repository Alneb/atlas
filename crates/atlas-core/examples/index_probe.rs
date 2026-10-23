//! Measures the core's in-memory note index (links.rs) on a real-shaped vault: its build time, the heap it keeps,
//! the peak a request costs, and representative queries. Never point it at the user's own vault while Atlas runs on
//! it — it only reads, but use a copy (docs/decisions/PERFORMANCE.md, "The core's indexes").
//!
//! `cargo run --release -p atlas-core --example index_probe -- <vault> [note-for-backlinks] [base-file]`
use atlas_core::config::Config;
use std::alloc::{GlobalAlloc, Layout, System};
use std::path::Path;
use std::sync::atomic::{AtomicIsize, Ordering::Relaxed};
use std::time::Instant;

/// Counts live heap bytes and their high-water mark (the harness only; the app uses the system allocator as is).
struct Counting;
static LIVE: AtomicIsize = AtomicIsize::new(0);
static PEAK: AtomicIsize = AtomicIsize::new(0);

unsafe impl GlobalAlloc for Counting {
    unsafe fn alloc(&self, l: Layout) -> *mut u8 {
        let p = unsafe { System.alloc(l) };
        if !p.is_null() {
            let now = LIVE.fetch_add(l.size() as isize, Relaxed) + l.size() as isize;
            PEAK.fetch_max(now, Relaxed);
        }
        p
    }
    unsafe fn dealloc(&self, p: *mut u8, l: Layout) {
        unsafe { System.dealloc(p, l) };
        LIVE.fetch_sub(l.size() as isize, Relaxed);
    }
    unsafe fn realloc(&self, p: *mut u8, l: Layout, new: usize) -> *mut u8 {
        let q = unsafe { System.realloc(p, l, new) };
        if !q.is_null() {
            let now = LIVE.fetch_add(new as isize - l.size() as isize, Relaxed) + new as isize - l.size() as isize;
            PEAK.fetch_max(now, Relaxed);
        }
        q
    }
}

#[global_allocator]
static A: Counting = Counting;

fn mb(b: isize) -> String {
    format!("{:.1} MB", b as f64 / 1e6)
}

fn rss() -> String {
    let pages: isize = std::fs::read_to_string("/proc/self/statm")
        .ok()
        .and_then(|s| s.split_whitespace().nth(1)?.parse().ok())
        .unwrap_or(0);
    mb(pages * 4096)
}

/// One call's wall time, live-heap change and peak above the start.
fn once<T>(f: impl FnOnce() -> T) -> (f64, isize, isize, T) {
    let live0 = LIVE.load(Relaxed);
    PEAK.store(live0, Relaxed);
    let t = Instant::now();
    let out = f();
    let ms = t.elapsed().as_secs_f64() * 1e3;
    (ms, LIVE.load(Relaxed) - live0, PEAK.load(Relaxed) - live0, out)
}

/// The median wall time and the largest peak of `n` warm calls.
fn warm<T>(name: &str, n: usize, mut f: impl FnMut() -> T, size: impl Fn(&T) -> usize) {
    let mut times = Vec::new();
    let mut peak = 0;
    let mut items = 0;
    for _ in 0..n {
        let (ms, _, p, out) = once(&mut f);
        times.push(ms);
        peak = peak.max(p);
        items = size(&out);
    }
    times.sort_by(f64::total_cmp);
    println!(
        "{name:<28} p50 {:>8.1} ms   min {:>8.1} ms   peak +{:<10} ({items} items)",
        times[n / 2],
        times[0],
        mb(peak)
    );
}

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let root =
        Path::new(args.first().expect("usage: index_probe <vault> [note] [base]")).canonicalize().expect("vault");
    let note = args.get(1).cloned().unwrap_or_else(|| "notes/Condensed Matter.md".into());
    let base = args.get(2).cloned().unwrap_or_else(|| "refs/papers/Papers.base".into());
    let cfg = Config::load(&root).unwrap_or_default();
    // `INDEX_PROBE_DUMP=file`: the answers as JSON instead of timings, to compare two builds of the index
    if let Ok(out) = std::env::var("INDEX_PROBE_DUMP") {
        return dump(&root, &cfg, Path::new(&out));
    }
    let base_src = std::fs::read_to_string(root.join(&base)).unwrap_or_default();
    println!("vault {}  (rss at start {})", root.display(), rss());

    let (ms, kept, peak, bl) = once(|| atlas_core::links::backlinks(&root, &cfg, &note));
    println!("BUILD (first backlinks)       {ms:>8.1} ms   kept {}   peak +{}   rss {}", mb(kept), mb(peak), rss());
    println!("  backlinks of {note}: {} links, {} unlinked", bl.links.len(), bl.unlinked.len());
    drop(bl);
    let (ms, kept, peak, _) = once(|| atlas_core::links::backlinks(&root, &cfg, &note));
    println!("REFRESH (second, no change)   {ms:>8.1} ms   kept {}   peak +{}", mb(kept), mb(peak));

    let n = 7;
    warm("backlinks", n, || atlas_core::links::backlinks(&root, &cfg, &note), |b| b.links.len() + b.unlinked.len());
    warm(
        "base (Papers.base)",
        n,
        || atlas_core::bases::evaluate(&root, &cfg, &base_src, None),
        |r| r.views.iter().map(|v| v.rows.len()).sum(),
    );
    warm("link targets [[cond", n, || atlas_core::link_targets::targets(&root, &cfg, "cond", None), Vec::len);
    warm("link targets [[ (empty)", n, || atlas_core::link_targets::targets(&root, &cfg, "", Some(&note)), Vec::len);
    warm("tags::all", n, || atlas_core::tags::all(&root, &cfg), Vec::len);
    warm("property_spec::known", n, || atlas_core::property_spec::known(&root, &cfg), Vec::len);
    warm("graph", n, || atlas_core::links::graph(&root, &cfg), |g| g.edges.len());
    warm("relink plan (move a note)", n, || atlas_core::relink::plan(&root, &cfg, &note, "notes/CM.md"), |_| 0);
    warm("search names 'condensed'", n, || atlas_core::search::match_files(&root, &cfg, "condensed", false), Vec::len);

    // the same with the vault's watcher running, as in the app: an unchanged vault need not be walked again
    let _watch = atlas_core::events::spawn_watcher(&root, cfg.clone(), atlas_core::events::EventBus::default())
        .expect("watcher");
    warm(
        "backlinks (watched)",
        n,
        || atlas_core::links::backlinks(&root, &cfg, &note),
        |b| b.links.len() + b.unlinked.len(),
    );
    warm(
        "base (watched)",
        n,
        || atlas_core::bases::evaluate(&root, &cfg, &base_src, None),
        |r| r.views.iter().map(|v| v.rows.len()).sum(),
    );
    warm("link targets [[cond (watched)", n, || atlas_core::link_targets::targets(&root, &cfg, "cond", None), Vec::len);
    warm("graph (watched)", n, || atlas_core::links::graph(&root, &cfg), |g| g.edges.len());
    println!("live heap at end {}   rss {}", mb(LIVE.load(Relaxed)), rss());
    if let Ok(other) = std::env::var("INDEX_PROBE_DAY") {
        day(&root, Path::new(&other).canonicalize().expect("second vault"), &base_src);
    }
}

/// A day, compressed: both vaults asked in turn what the app asks (backlinks of many notes, Bases, `[[` targets as a
/// link is typed, tags, the graph), a note of the second vault saved every 10 rounds. RSS printed as it goes.
fn day(a: &Path, b: std::path::PathBuf, base_src: &str) {
    let vaults = [a.to_path_buf(), b.clone()];
    let cfgs: Vec<Config> = vaults.iter().map(|v| Config::load(v).unwrap_or_default()).collect();
    let _watch: Vec<_> = vaults
        .iter()
        .zip(&cfgs)
        .map(|(v, c)| {
            atlas_core::events::spawn_watcher(v, c.clone(), atlas_core::events::EventBus::default()).expect("watcher")
        })
        .collect();
    let notes: Vec<String> = atlas_core::search::match_files(a, &cfgs[0], ".md", false);
    let edited = b.join("FOCUS.md");
    let original = std::fs::read(&edited).unwrap_or_default();
    let t = Instant::now();
    let rounds = 300;
    println!("DAY: {} rounds over {} and {}", rounds, a.display(), b.display());
    for i in 0..rounds {
        let (v, c) = (&vaults[i % 2], &cfgs[i % 2]);
        let note = &notes[i % notes.len()];
        let _ = atlas_core::links::backlinks(v, c, note);
        let _ = atlas_core::bases::evaluate(v, c, base_src, Some(note));
        for q in ["c", "co", "con", "cond"] {
            let _ = atlas_core::link_targets::targets(v, c, q, Some(note));
        }
        if i % 5 == 0 {
            let _ = atlas_core::tags::all(v, c);
            let _ = atlas_core::links::graph(v, c);
        }
        if i % 10 == 0 {
            #[allow(clippy::disallowed_methods)] // the harness's own copy of a vault
            std::fs::write(&edited, format!("{}\nsaved {i}\n", String::from_utf8_lossy(&original))).unwrap();
        }
        if (i + 1) % 50 == 0 {
            println!(
                "  after {:>3} rounds: {:>6.1} s   live heap {}   rss {}",
                i + 1,
                t.elapsed().as_secs_f64(),
                mb(LIVE.load(Relaxed)),
                rss()
            );
        }
    }
    #[allow(clippy::disallowed_methods)]
    std::fs::write(&edited, original).unwrap();
}

/// The answers of every reader of the index, for a set of notes and every `.base` of the vault.
fn dump(root: &Path, cfg: &Config, out: &Path) {
    use atlas_core::links;
    let notes = [
        "notes/Condensed Matter.md",
        "notes/Physics.md",
        "Collections.md",
        "notes/films/Films.base",
        "refs/papers/Papers.base",
    ];
    let mut j = serde_json::Map::new();
    for n in notes {
        j.insert(format!("backlinks {n}"), serde_json::to_value(links::backlinks(root, cfg, n)).unwrap());
        j.insert(
            format!("targets from {n}"),
            serde_json::to_value(atlas_core::link_targets::targets(root, cfg, "", Some(n))).unwrap(),
        );
    }
    for q in ["cond", "phys", "mail", "2024"] {
        j.insert(
            format!("targets {q}"),
            serde_json::to_value(atlas_core::link_targets::targets(root, cfg, q, None)).unwrap(),
        );
    }
    for b in [
        "Home.base",
        "refs/papers/Papers.base",
        "notes/films/Films.base",
        "notes/attachments/00_base_topic.base",
        "notes/attachments/00_base_lecture.base",
        "mail/me@uni.example.org/Inbox.base",
    ] {
        let src = std::fs::read_to_string(root.join(b)).unwrap_or_default();
        j.insert(
            format!("base {b}"),
            serde_json::to_value(atlas_core::bases::evaluate(root, cfg, &src, Some("notes/Condensed Matter.md")))
                .unwrap(),
        );
    }
    j.insert("tags".into(), serde_json::to_value(atlas_core::tags::all(root, cfg)).unwrap());
    j.insert("tag notes".into(), serde_json::to_value(atlas_core::tags::notes(root, cfg, "physics")).unwrap());
    j.insert("known".into(), serde_json::to_value(atlas_core::property_spec::known(root, cfg)).unwrap());
    j.insert("graph".into(), serde_json::to_value(links::graph(root, cfg)).unwrap());
    #[allow(clippy::disallowed_methods)] // the dump goes to a scratch file, never into a vault
    std::fs::write(out, serde_json::to_string_pretty(&j).unwrap()).unwrap();
}
