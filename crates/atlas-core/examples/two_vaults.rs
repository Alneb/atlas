//! What a second vault costs the desktop's core (server_desktop.rs). One core serves a throwaway vault list; measured
//! from the process itself (/proc/self, Linux): resident memory, threads (by name), open files, inotify watches, and
//! over an idle window the CPU time and the context switches (wake-ups) the vaults cost doing nothing.
//!
//! Two scenarios, one per run:
//! - `open`: only A on the list, then B added and opened by the requests a window makes (workspace, tree, graph,
//!   search): the second vault's start time and what it adds once open.
//! - `ahead`: A and B on the list from the start and B never asked for: whether `start_ahead` starts B anyway, when,
//!   and what that costs, then the switch to B (its first requests). B's `last_opened` is `<B age in days>` ago, so a
//!   policy keyed on recent use can be checked.
//!   `start_ahead` does nothing under `ATLAS_NO_SCHEDULE`, so this scenario needs it unset: only on generated vaults,
//!   which have no scheduled commands (two-vaults.mjs sees to it).
//!
//! Run through `node scripts/dev/two-vaults.mjs`, which makes the vaults in target/ and keeps the run away from the
//! machine's own vault list, state and notifications. Directly:
//! `cargo run --release -p atlas-core --example two_vaults -- <open|ahead> <vault A> <vault B> [idle seconds] [B age in days]`
#![allow(clippy::disallowed_methods)] // a measurement writes its throwaway vault list directly, as the tests write their fixtures
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

/// One look at the process.
#[derive(Debug, Clone, Default)]
struct Look {
    rss_kb: u64,
    threads: BTreeMap<String, u32>,
    fds: u32,
    inotify_watches: u32,
    /// Per thread (by id): CPU time run in ns (schedstat) and voluntary + involuntary switches (each a wake-up or a
    /// preemption). Kept per thread so a window counts only what live threads did: a thread that exits between two
    /// looks takes its counts with it, which made a process-wide difference go negative.
    tasks: BTreeMap<u32, (u64, u64)>,
}

fn read(p: impl AsRef<Path>) -> String {
    std::fs::read_to_string(p).unwrap_or_default()
}

/// A field of a /proc status file (`VmRSS:  1234 kB` → 1234).
fn field(status: &str, name: &str) -> u64 {
    status.lines().find_map(|l| l.strip_prefix(name)?.split_whitespace().next()?.parse().ok()).unwrap_or(0)
}

fn look() -> Look {
    let mut l = Look { rss_kb: field(&read("/proc/self/status"), "VmRSS:"), ..Default::default() };
    for t in std::fs::read_dir("/proc/self/task").into_iter().flatten().flatten() {
        // thread names with their numbers trimmed, so "tokio-runtime-w" or "notify-rs inot" count as kinds
        let name = read(t.path().join("comm")).trim().trim_end_matches(|c: char| c.is_ascii_digit() || c == '-' || c == '#').to_string();
        *l.threads.entry(name).or_default() += 1;
        let st = read(t.path().join("status"));
        let switches = field(&st, "voluntary_ctxt_switches:") + field(&st, "nonvoluntary_ctxt_switches:");
        // schedstat: time on the CPU (ns), time waiting for it, timeslices
        let ran = read(t.path().join("schedstat")).split_whitespace().next().and_then(|x| x.parse().ok()).unwrap_or(0);
        let tid = t.file_name().to_string_lossy().parse().unwrap_or(0);
        l.tasks.insert(tid, (ran, switches));
    }
    for fd in std::fs::read_dir("/proc/self/fdinfo").into_iter().flatten().flatten() {
        l.fds += 1;
        l.inotify_watches += read(fd.path()).lines().filter(|x| x.starts_with("inotify wd:")).count() as u32;
    }
    l
}

/// The requests a window makes when it opens a vault, as far as they cost the core, each timed: the workspace (on a
/// vault not started yet, its start), the tree, the graph (the note index), a search.
async fn open(http: &reqwest::Client, base: &str, name: &str) -> Vec<(&'static str, Duration)> {
    let mut times = Vec::new();
    for p in ["/api/workspace", "/api/tree", "/api/graph", "/api/search?q=note"] {
        let t = Instant::now();
        let r = http.get(format!("{base}/v/{name}{p}")).header("x-atlas", "1").send().await.expect("the core answers");
        assert!(r.status().is_success(), "{p} on {name}: {}", r.status());
        let _ = r.bytes().await;
        times.push((p, t.elapsed()));
    }
    times
}

/// Each plugin helper of vault `name`, started by a first call and timed (a method no helper has: the answer is an
/// error, the start is what is measured), then called again warm. A vault with no plugins prints nothing.
async fn helpers(http: &reqwest::Client, base: &str, name: &str) {
    let t = Instant::now();
    let r = http.get(format!("{base}/v/{name}/api/plugins")).header("x-atlas", "1").send().await.expect("the core answers");
    let list: serde_json::Value = r.json().await.expect("the plugin list");
    let listed = t.elapsed();
    let ids: Vec<String> = list
        .as_array()
        .into_iter()
        .flatten()
        .filter(|p| p["has_helper"].as_bool() == Some(true) && p["blocked"].is_null())
        .filter_map(|p| p["id"].as_str().map(str::to_string))
        .collect();
    if list.as_array().is_none_or(|l| l.is_empty()) {
        return;
    }
    println!("{name}'s plugins listed in {listed:.0?}; their helpers' first and second calls:");
    for id in ids {
        let mut took = Vec::new();
        for _ in 0..2 {
            let t = Instant::now();
            let r = http
                .post(format!("{base}/v/{name}/api/plugins/{id}/helper"))
                .header("x-atlas", "1")
                .json(&serde_json::json!({ "method": "two-vaults.probe", "timeout_secs": 10 }))
                .send()
                .await
                .expect("the core answers");
            let status = r.status();
            let _ = r.bytes().await;
            took.push(format!("{:.0?} ({})", t.elapsed(), status.as_u16()));
        }
        println!("  {id}: first {}, again {}", took[0], took[1]);
    }
}

fn show_open(what: &str, times: &[(&str, Duration)]) {
    let all: Duration = times.iter().map(|(_, d)| *d).sum();
    let each: Vec<String> = times.iter().map(|(p, d)| format!("{p} {d:.0?}")).collect();
    println!("{what}: {all:.0?} ({})", each.join(", "));
}

/// CPU milliseconds and switches per minute over an idle window of `secs`, summed over the threads alive at its end
/// (a thread born inside the window counts from zero).
async fn idle(secs: u64) -> (f64, f64) {
    let a = look();
    tokio::time::sleep(Duration::from_secs(secs)).await;
    let b = look();
    let (mut ns, mut sw) = (0u64, 0u64);
    for (tid, (ran, switches)) in &b.tasks {
        let (ran0, sw0) = a.tasks.get(tid).copied().unwrap_or((0, 0));
        ns += ran.saturating_sub(ran0);
        sw += switches.saturating_sub(sw0);
    }
    let per_min = 60.0 / secs as f64;
    (ns as f64 / 1e6 * per_min, sw as f64 * per_min)
}

/// The vault list: each vault with its `last_opened` that many days ago.
fn list(file: &Path, vaults: &[(&Path, f64)]) {
    let now = chrono::Utc::now().timestamp_millis();
    let body: String = vaults
        .iter()
        .map(|(v, days)| {
            let ago = (days * 86_400_000.0) as i64;
            format!("[[vault]]\nname = {:?}\npath = {:?}\nlast_opened = {}\n\n", v.file_name().unwrap().to_string_lossy(), v.to_string_lossy(), now - ago)
        })
        .collect();
    std::fs::write(file, body).expect("the vault list");
}

fn name(p: &Path) -> String {
    p.file_name().unwrap().to_string_lossy().into_owned()
}

/// Whether the core has started `vault` (the vault list's `warm`, as the picker sees it).
async fn warm(http: &reqwest::Client, base: &str, from: &str, vault: &Path) -> bool {
    let r = http.get(format!("{base}/v/{from}/api/vaults")).header("x-atlas", "1").send().await.expect("the core answers");
    let list: serde_json::Value = r.json().await.expect("the vault list");
    let want = vault.to_string_lossy();
    list["vaults"].as_array().into_iter().flatten().any(|v| v["path"].as_str() == Some(&want) && v["warm"].as_bool() == Some(true))
}

fn table(one: &Look, two: &Look, idle1: (f64, f64), idle2: (f64, f64), secs: u64, heads: (&str, &str)) {
    let row = |what: &str, a: f64, b: f64, unit: &str| println!("| {what} | {a:.1} {unit} | {b:.1} {unit} | {:+.1} {unit} |", b - a);
    println!("| | {} | {} | difference |", heads.0, heads.1);
    println!("|---|---|---|---|");
    row("resident memory", one.rss_kb as f64 / 1024.0, two.rss_kb as f64 / 1024.0, "MB");
    row("threads", one.threads.values().sum::<u32>() as f64, two.threads.values().sum::<u32>() as f64, "");
    row("open files", one.fds as f64, two.fds as f64, "");
    row("inotify watches", one.inotify_watches as f64, two.inotify_watches as f64, "");
    row("idle CPU", idle1.0, idle2.0, "ms/min");
    row("idle wake-ups", idle1.1, idle2.1, "/min");
    println!("(idle windows: {secs} s)");
    println!();
    println!("threads that changed, by name:");
    let names: std::collections::BTreeSet<&String> = one.threads.keys().chain(two.threads.keys()).collect();
    for n in names {
        let (a, b) = (one.threads.get(n).copied().unwrap_or(0), two.threads.get(n).copied().unwrap_or(0));
        if a != b {
            println!("  {n}: {a} → {b}");
        }
    }
}

async fn start(a: &Path, file: &Path) -> (atlas_core::server::ServerHandle, Duration) {
    let t = Instant::now();
    let core = atlas_core::server::serve_vaults(atlas_core::server::Vaults::Desktop { first: a.to_path_buf(), list: file.to_path_buf() }, atlas_core::server::Listen::Local(0, atlas_core::local_lock::Lock::Open)).await.expect("the core starts");
    (core, t.elapsed())
}

/// `open`: the second vault opened by a window.
async fn scenario_open(a: &Path, b: &Path, file: &Path, secs: u64) -> atlas_core::server::ServerHandle {
    list(file, &[(a, 0.0)]); // only A: start_ahead (20 s after the start) finds nothing else to start
    let (core, started) = start(a, file).await;
    let base = format!("http://127.0.0.1:{}", core.port());
    let http = reqwest::Client::new();
    println!("core start with A (A started in it): {started:.0?}");
    show_open("A opened, A already started", &open(&http, &base, &name(a)).await);
    // past start_ahead's 20 s and the first index walks, so the window below is the steady state
    tokio::time::sleep(Duration::from_secs(25)).await;
    let one = look();
    let idle1 = idle(secs).await;

    list(file, &[(a, 0.0), (b, 0.0)]);
    show_open("B started and opened by its first requests", &open(&http, &base, &name(b)).await);
    show_open("B opened again, warm", &open(&http, &base, &name(b)).await);
    helpers(&http, &base, &name(b)).await;
    tokio::time::sleep(Duration::from_secs(5)).await;
    let two = look();
    let idle2 = idle(secs).await;
    println!();
    table(&one, &two, idle1, idle2, secs, ("one vault", "two vaults"));
    core
}

/// `ahead`: B on the list and never asked for.
async fn scenario_ahead(a: &Path, b: &Path, file: &Path, secs: u64, b_days: f64) -> atlas_core::server::ServerHandle {
    assert!(std::env::var_os("ATLAS_NO_SCHEDULE").is_none(), "the ahead scenario needs ATLAS_NO_SCHEDULE unset (start_ahead is off under it)");
    list(file, &[(a, 0.0), (b, b_days)]);
    let t0 = Instant::now();
    let (core, started) = start(a, file).await;
    let base = format!("http://127.0.0.1:{}", core.port());
    let http = reqwest::Client::new();
    println!("core start with A (A started in it; B on the list, last opened {b_days} days ago): {started:.0?}");
    show_open("A opened", &open(&http, &base, &name(a)).await);
    tokio::time::sleep(Duration::from_secs(8)).await;
    let one = look();
    let idle1 = idle(10).await; // before start_ahead's 20 s: the vault list's A alone
    // start_ahead's 20 s, plus as long again for B to start
    let mut seen = None;
    while t0.elapsed() < Duration::from_secs(60) {
        if warm(&http, &base, &name(a), b).await {
            seen = Some(t0.elapsed());
            break;
        }
        tokio::time::sleep(Duration::from_millis(250)).await;
    }
    match seen {
        Some(d) => println!("B started ahead, never asked for: warm {:.1} s after the core started", d.as_secs_f64()),
        None => println!("B not started ahead: still cold 60 s after the core started"),
    }
    tokio::time::sleep(Duration::from_secs(5)).await;
    let two = look();
    let idle2 = idle(secs).await;
    // the switch: B's first requests, on a B started ahead (and its note index built in the background) or not
    show_open("B opened for the first time (the switch)", &open(&http, &base, &name(b)).await);
    println!();
    table(&one, &two, idle1, idle2, secs, ("A alone (first 20 s)", "after start_ahead"));
    core
}

#[tokio::main]
async fn main() {
    let usage = "usage: two_vaults <open|ahead> <vault A> <vault B> [idle seconds] [B age in days]";
    let args: Vec<String> = std::env::args().skip(1).collect();
    let mode = args.first().expect(usage).clone();
    let a = PathBuf::from(args.get(1).expect(usage)).canonicalize().expect("vault A");
    let b = PathBuf::from(args.get(2).expect(usage)).canonicalize().expect("vault B");
    let secs: u64 = args.get(3).and_then(|s| s.parse().ok()).unwrap_or(60);
    let b_days: f64 = args.get(4).and_then(|s| s.parse().ok()).unwrap_or(0.0);
    let file = std::env::var_os("ATLAS_VAULTS").map(PathBuf::from).expect("ATLAS_VAULTS: a throwaway vault list (two-vaults.mjs sets it)");
    let before = look();
    println!("before the core: {:.1} MB, {} threads", before.rss_kb as f64 / 1024.0, before.threads.values().sum::<u32>());
    let core = match mode.as_str() {
        "open" => scenario_open(&a, &b, &file, secs).await,
        "ahead" => scenario_ahead(&a, &b, &file, secs, b_days).await,
        other => panic!("{other}: {usage}"),
    };
    core.shutdown().await.expect("a clean stop");
}
