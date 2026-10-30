//! `atlas-capture [vault]`: the global quick-capture box (docs/guides/CAPTURE.md), drawn natively with egui —
//! no web view to start, so it is on screen at once. Type, Enter: written like `atlas capture` (through
//! the Atlas open on that vault, so its window updates; else straight to the files). Esc, or another
//! window taking the focus: gone, nothing written, the text kept as the vault's draft for the next open (draft.rs). Super+V (or a click on the vault) its list, Super+↑ / Super+↓
//! the vault before / after (Alt as well). Completions: `[[` a note, `#` a tag, `@` a day, and on a to-do the task fields (the
//! core's `task_suggest`, as in the editor).
use atlas_capture::app::{Capture, Theme, Vault};
use atlas_capture::window;
use std::path::PathBuf;
use std::time::Instant;

fn main() -> anyhow::Result<()> {
    let t0 = Instant::now();
    let timing = std::env::var_os("ATLAS_CAPTURE_TIMING").is_some();
    if std::env::args().nth(1).as_deref() == Some("--context") {
        return print_context();
    }
    let asked = std::env::args().nth(1).map(PathBuf::from);
    let vaults = vaults(asked);
    let theme = vaults.first().map_or(Theme::System, |v| theme_of(&v.path));
    // ATLAS_CAPTURE_TEXT: start with this typed; ATLAS_CAPTURE_MENU: with the vault menu open (screenshots, tests)
    let mut cap = Capture::new(vaults, std::env::var("ATLAS_CAPTURE_TEXT").unwrap_or_default(), theme).started_at(t0);
    // ATLAS_CAPTURE_DRAFTS: another draft folder ("off": none, for screenshots)
    match std::env::var("ATLAS_CAPTURE_DRAFTS").ok().as_deref() {
        Some("off") => {}
        Some(dir) => cap = cap.with_drafts(atlas_capture::draft::Drafts::at(dir.into())),
        None => cap = cap.with_drafts(atlas_capture::draft::Drafts::at(atlas_capture::draft::Drafts::default_dir())),
    }
    if std::env::var_os("ATLAS_CAPTURE_MENU").is_some() {
        cap.open_vault_menu();
    }
    cap.load_names();
    if std::env::var_os("ATLAS_CAPTURE_EXAMPLE_CHIPS").is_some() {
        example_chips(&cap); // screenshots of the chips (scripts/dev/capture/look.sh)
    } else if std::env::var_os("ATLAS_CAPTURE_NO_CONTEXT").is_none() {
        cap.extras.gather(); // the page you were on, the clipboard, the last screenshot: in the background
    }
    if timing {
        eprintln!("atlas-capture: vaults and theme read in {} ms", t0.elapsed().as_millis());
    }
    let ran = window::run(cap, t0, timing);
    let _ = std::fs::remove_dir_all(atlas_capture::context::scratch()); // the screen and pictures taken: in the vault now, or not wanted
    ran
}
fn example_chips(cap: &Capture) {
    use atlas_capture::context::Page;
    use atlas_capture::extras::{Kind, Offer, What};
    let page = Page { url: "https://www.youtube.com/watch?v=example".into(), title: "Green's functions, lecture 3 - YouTube".into() };
    cap.extras.offer(Offer { kind: Kind::Link, what: What::Link(page), on: true });
    cap.extras.offer(Offer { kind: Kind::Clipboard, what: What::Text("Hubbard model at half filling".into()), on: false });
    // ATLAS_CAPTURE_EXAMPLE_CHIPS=<a .png>: that picture as the last screenshot
    if let Some(png) = std::env::var_os("ATLAS_CAPTURE_EXAMPLE_CHIPS").filter(|v| v.to_string_lossy().ends_with(".png")) {
        cap.extras.offer(Offer { kind: Kind::Last, what: What::Picture(png.into()), on: true });
    }
}

/// `atlas-capture --context`: what the box would offer besides the text, each step said (to see why a link is missing).
fn print_context() -> anyhow::Result<()> {
    use atlas_capture::context;
    // ATLAS_CAPTURE_WINDOW="caption|class": as if that window was under the box (to check a browser's page lookup)
    let pretend = std::env::var("ATLAS_CAPTURE_WINDOW").ok().and_then(|v| v.split_once('|').map(|(c, k)| context::Window { caption: c.into(), class: k.into(), id: String::new() }));
    let w = pretend.or_else(context::window_under);
    println!("window you were on: {w:?}");
    if let Some(w) = &w {
        let t = std::time::Instant::now();
        println!("its picture: {:?} ({} ms)", context::window_shot(w), t.elapsed().as_millis());
    }
    if let Some(w) = &w {
        let app = context::browser_app(&w.class);
        println!("a browser (its desktop file says WebBrowser): {app:?}");
        if let Some(app) = app {
            let t = std::time::Instant::now();
            let page = context::page(w, &app);
            println!("page: {page:?} ({} ms)", t.elapsed().as_millis());
        }
    }
    println!("clipboard: {:?}", context::clipboard());
    println!("last screenshot (30 min): {:?}", context::last_screenshot(std::time::Duration::from_secs(30 * 60)));
    if std::env::var_os("ATLAS_CAPTURE_KEEP").is_none() {
        let _ = std::fs::remove_dir_all(context::scratch()); // ATLAS_CAPTURE_KEEP=1: kept, to look at the pictures
    }
    Ok(())
}

/// The vault asked for (or the one opened last) first, then the other known ones.
fn vaults(asked: Option<PathBuf>) -> Vec<Vault> {
    use atlas_core::vaults;
    let file = vaults::list_file();
    let first = vaults::to_open(asked, &file);
    let mut out: Vec<Vault> = first.iter().map(|p| Vault { name: name_of(p), path: p.clone() }).collect();
    // a vault on a server is not written from here (its folder here is, when it is a mirror)
    for v in vaults::list(&file).into_iter().filter(|v| !v.missing && v.url.is_none()) {
        let path = PathBuf::from(&v.path);
        if !out.iter().any(|o| o.path == path) {
            out.push(Vault { name: v.name, path });
        }
    }
    out
}

fn name_of(p: &std::path::Path) -> String {
    p.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_else(|| p.display().to_string())
}

fn theme_of(root: &std::path::Path) -> Theme {
    use atlas_core::config::Theme as T;
    match atlas_core::Workspace::open(root).and_then(|w| w.config()).map(|c| c.ui.theme) {
        Ok(T::Light) => Theme::Light,
        Ok(T::Dark) => Theme::Dark,
        Ok(T::System) | Err(_) => Theme::System,
    }
}
