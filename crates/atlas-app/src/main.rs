//! Atlas desktop shell: runs atlas-core in-process and points one webview at it. The window is
//! just another HTTP client, so the same UI also works in a browser against `atlas serve`.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod autostart;
mod background;
mod browser;
mod tray;
#[cfg(target_os = "linux")]
mod tray_sni;
#[cfg(not(target_os = "linux"))]
mod tray_tauri;
#[cfg(target_os = "linux")]
mod web_filters;
#[cfg(target_os = "linux")]
mod webtab;

use std::path::PathBuf;
use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};

/// WebKitGTK's DMA-BUF renderer gives a blank window with the NVIDIA proprietary driver, but
/// turning it off everywhere makes scrolling sluggish (it did on an AMD 680M). Setting
/// `ui.gpu_rendering`; an explicit env var wins. Must run before any thread exists.
fn webkit_rendering(root: &std::path::Path) {
    if !cfg!(target_os = "linux") {
        return; // a WebKitGTK setting
    }
    use atlas_core::config::{Config, GpuRendering};
    if std::env::var_os("WEBKIT_DISABLE_DMABUF_RENDERER").is_some() {
        return;
    }
    let mode = Config::load(root).map(|c| c.ui.gpu_rendering).unwrap_or(GpuRendering::Auto);
    let compatible = match mode {
        GpuRendering::Compatible => true,
        GpuRendering::Accelerated => false,
        // DMA-BUF kept the window's main thread busy while idle (14–41 % of a core measured on
        // 2026-10-14, 0 % without it, ~50 MB less): auto is the efficient one everywhere now
        GpuRendering::Auto => true,
    };
    if compatible {
        std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
    }
    eprintln!("atlas-app: rendering {mode:?} → {}", if compatible { "compatible (no DMA-BUF)" } else { "accelerated" });
}

/// The vault to show: the folder given on the command line, else the one opened most recently,
/// else (first run) a small welcome vault that explains how to open or create one.
fn vault_to_open(asked: Option<PathBuf>) -> anyhow::Result<PathBuf> {
    use atlas_core::vaults;
    if let Some(known) = vaults::to_open(asked, &vaults::list_file()) {
        return Ok(known);
    }
    let welcome = atlas_core::platform::dirs::atlas(atlas_core::platform::dirs::Base::Data).join("Welcome");
    std::fs::create_dir_all(&welcome)?;
    let home = welcome.join("Home.page");
    if !home.exists() {
        std::fs::write(&home, WELCOME_PAGE)?;
    }
    Ok(welcome)
}

const WELCOME_PAGE: &str = r#"# The first screen of a fresh Atlas. This folder is a vault like any other; yours go wherever you like.
title: Welcome
rows:
  - [greeting]
  - - view: vaults
      title: Start with a vault
  - - view: text
      title: What a vault is
      text: |
        Atlas works on **vaults**: plain folders of notes, papers, code and data. Each vault keeps its own
        settings, plugins and pages in its `.atlas/` folder, so a work vault and a personal one stay apart.
        An Obsidian vault opens as it is.

        **New vault…** makes a folder (for example `~/Notes`); **Open a folder…** takes one you have. Atlas
        remembers it and opens it the next time it starts. Later, **Ctrl+Alt+V** switches between vaults and
        **F1** lists every command.

        This Welcome vault is only a start page; what is written here stays in Atlas's own data folder.
"#;

/// The desktop's core for `root`: on this machine only, locked (local_lock.rs `Lock::desktop`). It serves every vault
/// of the vault list beside `root`, each at `/v/<name>/` and started when first opened, so switching is a page load in
/// this window (server_desktop.rs).
async fn desktop_core(root: PathBuf) -> anyhow::Result<atlas_core::server::ServerHandle> {
    let vaults = atlas_core::server::Vaults::Desktop { first: root, list: atlas_core::vaults::list_file() };
    atlas_core::server::serve_vaults(vaults, atlas_core::server::Listen::Local(0, atlas_core::local_lock::Lock::desktop())).await
}

/// The capture box's page at a core's address or one-time link (`…/?k=code` → `…/capture.html?k=code`).
/// capture.html: the box's own small page; `#capture` too, so an older core (whose UI has no capture.html and
/// answers with the app's page) still shows the box.
fn capture_page(link: &str) -> String {
    let (base, query) = link.split_once('?').map_or((link, None), |(b, q)| (b, Some(q)));
    let page = format!("{}/capture.html", base.trim_end_matches('/'));
    match query {
        Some(q) => format!("{page}?{q}#capture"),
        None => format!("{page}#capture"),
    }
}

/// `atlas-app --capture`: the native box (atlas-capture) when the package put one beside this program — an AppImage,
/// the macOS app and the Windows install, where a shortcut can only name the app — and `ATLAS_CAPTURE` does not ask
/// for the web box. Its exit code; None: no native box here, the web box below opens.
fn native_capture(folder: Option<&std::path::Path>) -> Option<i32> {
    if std::env::var("ATLAS_CAPTURE").is_ok_and(|v| v == "webview") {
        return None;
    }
    let boxed = capture_box()?;
    let mut cmd = std::process::Command::new(&boxed);
    cmd.args(folder);
    match cmd.status() {
        Ok(s) => Some(s.code().unwrap_or(1)),
        Err(e) => {
            eprintln!("atlas-app: {} did not start ({e}); the web box instead", boxed.display());
            None
        }
    }
}

/// The native capture box the package put beside this program, if it did.
fn capture_box() -> Option<PathBuf> {
    let exe = std::env::current_exe().ok()?;
    Some(exe.with_file_name(format!("atlas-capture{}", std::env::consts::EXE_SUFFIX))).filter(|b| b.is_file())
}

/// macOS: a global key for the capture box while Atlas runs — `ATLAS_CAPTURE_KEY` (Tauri's form, e.g.
/// "Control+Super+C"; "none" for no key), Ctrl+Cmd+C by default (Cmd+Shift+C is taken by browsers and Finder).
/// The box opens on the vault this window shows.
#[cfg(target_os = "macos")]
fn capture_key(vault: PathBuf) -> tauri::plugin::TauriPlugin<tauri::Wry> {
    use tauri_plugin_global_shortcut::{Builder, Shortcut, ShortcutState};
    let builder = Builder::new().with_handler(move |_app, _key, event| {
        if event.state == ShortcutState::Pressed {
            match capture_box() {
                Some(b) => {
                    if let Err(e) = std::process::Command::new(&b).arg(&vault).spawn() {
                        eprintln!("atlas-app: the capture box did not start: {e}");
                    }
                }
                None => eprintln!("atlas-app: no capture box beside the app"),
            }
        }
    });
    let key = std::env::var("ATLAS_CAPTURE_KEY").unwrap_or_else(|_| "Control+Super+C".into());
    if key == "none" {
        return builder.build();
    }
    match key.parse::<Shortcut>().map_err(|e| e.to_string()).and_then(|k| builder.with_shortcut(k).map_err(|e| e.to_string())) {
        Ok(b) => b.build(),
        Err(e) => {
            eprintln!("atlas-app: no capture key ({key:?}: {e})");
            Builder::new().build()
        }
    }
}

/// `atlas-app --capture [folder]`: the quick-capture window (docs/guides/CAPTURE.md) — one small frameless
/// box above everything, showing the app's `/#capture` page. It talks to the Atlas already open on
/// that vault when there is one (two cores on one vault would run its schedules twice), and only
/// otherwise starts a core of its own for as long as the box is open. The page asks to be closed
/// by going to `/__atlas_close` (after Enter, or on Esc).
fn capture_window(root: PathBuf) -> anyhow::Result<()> {
    webkit_rendering(&root);
    let mut own = None;
    // the address to open: a locked core's one-time link (its cookie lets the box in), else the core's own
    let link = match atlas_core::vaults::running_server(&root) {
        Some(base) => tauri::async_runtime::block_on(post(&base, "/api/local/link", "{}"))
            .ok()
            .and_then(|answer| serde_json::from_str::<serde_json::Value>(&answer).ok()?["url"].as_str().map(String::from))
            .unwrap_or(base),
        None => {
            let s = tauri::async_runtime::block_on(desktop_core(root.clone()))?;
            let url = s.open_url();
            own = Some(s);
            url
        }
    };
    eprintln!("atlas-app: capture into {} ({})", root.display(), if own.is_some() { "its own core" } else { "the open Atlas" });
    let url: tauri::Url = capture_page(&link).parse()?;
    tauri::Builder::default()
        .setup(move |app| {
            let handle = app.handle().clone();
            WebviewWindowBuilder::new(app, "capture", WebviewUrl::External(url))
                .title("Atlas capture")
                // OS file drops reach the page's own `drop` (the editor, the explorer, the capture popup); Tauri's
                // handler would take them first (on Windows the page then never sees a dropped file)
                .disable_drag_drop_handler()
                .inner_size(620.0, 160.0) // the capture box of one line, and room under it for a list
                .resizable(false)
                .decorations(false)
                .always_on_top(true)
                .skip_taskbar(true)
                .center()
                .focused(true)
                .on_navigation(move |to| {
                    if to.path() == "/__atlas_close" {
                        handle.exit(0);
                        return false;
                    }
                    true
                })
                .build()?;
            Ok(())
        })
        // a box left behind is in the way: it closes when another window takes the focus (once it had it)
        .on_window_event({
            let had_focus = std::sync::atomic::AtomicBool::new(false);
            move |window, event| {
                if let tauri::WindowEvent::Focused(focused) = event {
                    if *focused {
                        had_focus.store(true, std::sync::atomic::Ordering::Relaxed);
                    } else if had_focus.load(std::sync::atomic::Ordering::Relaxed) {
                        window.app_handle().exit(0);
                    }
                }
            }
        })
        .build(context())?
        .run(move |_app, event| {
            if let tauri::RunEvent::Exit = event {
                if let Some(s) = own.take() {
                    let _ = tauri::async_runtime::block_on(s.shutdown());
                }
            }
        });
    Ok(())
}

/// `atlas-app --browse <url> [folder]`: that page in a browsing window of its own (browser.rs), ads blocked as the
/// vault's `[web]` settings say; no core, no main window. From a terminal, and how the blocking is checked.
/// A vault on a server (`atlas-app https://atlas.example.org/v/notes/`, from the vault picker): no core on this machine,
/// one window on the server's own page — the same app the server serves. Its sign-in in front (Authelia, a security key)
/// happens in this window and WebKit keeps the session, as a browser would; the window follows it to other hosts and
/// back. A link the page opens goes to the desktop's own handler (docs/design/DESIGN-desktop-remote.md).
fn remote_window(url: tauri::Url) -> anyhow::Result<()> {
    if std::env::var_os("WEBKIT_DISABLE_DMABUF_RENDERER").is_none() {
        std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1"); // as `ui.gpu_rendering = auto` does for a local vault
    }
    let host = url.host_str().unwrap_or_default().to_string();
    eprintln!("atlas-app: a vault on a server, window → {url}");
    tauri::Builder::default()
        .setup(move |app| {
            WebviewWindowBuilder::new(app, "main", WebviewUrl::External(url))
                .title(format!("Atlas — {host}"))
                // OS file drops reach the page's own `drop` (the editor, the explorer, the capture popup); Tauri's
                // handler would take them first (on Windows the page then never sees a dropped file)
                .disable_drag_drop_handler()
                .inner_size(MAIN_SIZE.width, MAIN_SIZE.height)
                .on_new_window(|to, _| {
                    open_outside(to.as_str());
                    tauri::webview::NewWindowResponse::Deny
                })
                .build()
                .map(|w| fit_to_screen(&w))?;
            Ok(())
        })
        .build(context())?
        .run(|_, _| {});
    Ok(())
}

/// A window larger than its screen's free area (a 1366×768 laptop, a 1280×800 tablet) is shrunk into it and centred,
/// so no edge or title bar starts off screen. A screen with room keeps the size asked for.
/// The app's context, expanded once: on macOS each expansion embeds Info.plist under one symbol, so a second one fails
/// to link.
fn context() -> tauri::Context {
    tauri::generate_context!()
}

/// The main window's size, made smaller by `fit_to_screen` on a screen that cannot hold it.
const MAIN_SIZE: tauri::LogicalSize<f64> = tauri::LogicalSize::new(1400.0, 900.0);

/// Fits `MAIN_SIZE` into the monitor's work area (95 %). Compared with the size asked for: the window's own size is
/// 0×0 until it is mapped (Wayland), and a window bigger than the screen opens cut off there (a 1366×768 laptop).
fn fit_to_screen(window: &tauri::WebviewWindow) {
    let Ok(Some(monitor)) = window.current_monitor() else { return };
    let (size, area) = (MAIN_SIZE.to_physical::<u32>(monitor.scale_factor()), monitor.work_area().size);
    if size.width <= area.width && size.height <= area.height {
        return;
    }
    let fit = tauri::PhysicalSize::new(size.width.min(area.width * 95 / 100), size.height.min(area.height * 95 / 100));
    let _ = window.set_size(fit);
    let _ = window.center();
}

/// The window in the theme's background (tokens.css `--bg-app`) until the page paints: no white flash at start.
fn paint_before_page(window: &tauri::WebviewWindow, vault: &std::path::Path) {
    use atlas_core::config::{Config, Theme};
    let dark = match Config::load(vault).map(|c| c.ui.theme).unwrap_or(Theme::System) {
        Theme::Dark => true,
        Theme::Light => false,
        Theme::System => window.theme().map_or(true, |t| t == tauri::Theme::Dark),
    };
    let color = if dark { tauri::window::Color(0x10, 0x12, 0x16, 255) } else { tauri::window::Color(0xec, 0xee, 0xf2, 255) };
    let _ = window.set_background_color(Some(color));
}

/// Web pages as tabs on Windows: WebView2 is Chromium, so an extension of the app's own (`webview2/frame-any`, its
/// declarativeNetRequest rules) removes X-Frame-Options and Content-Security-Policy from the pages Atlas's window frames
/// — and only those (`initiatorDomains`: the core's own address) — and every site shows in a plain iframe, as in
/// Obsidian. Written out under the cache at each start (WebView2 loads unpacked extensions from a folder). None: it
/// could not be written; sites that refuse framing then open in a window, as before. WebKitGTK has no such hook
/// (DEVELOPING.md, "Web pages as tabs"): Linux keeps a native view over the pane.
#[cfg(windows)]
fn frame_any_extension() -> Option<PathBuf> {
    let root = atlas_core::platform::dirs::atlas(atlas_core::platform::dirs::Base::Cache).join("webview2-extensions");
    let dir = root.join("frame-any");
    let files = [("manifest.json", include_str!("../webview2/frame-any/manifest.json")), ("rules.json", include_str!("../webview2/frame-any/rules.json"))];
    let written = std::fs::create_dir_all(&dir).and_then(|_| files.iter().try_for_each(|(name, text)| std::fs::write(dir.join(name), text)));
    match written {
        Ok(()) => Some(root),
        Err(e) => {
            eprintln!("atlas-app: web pages as tabs: the WebView2 extension was not written to {}: {e}", dir.display());
            None
        }
    }
}

/// Web pages as tabs on Linux: the libsoup hook (frames/frames.rs, built by build.rs) is written under the cache and
/// put in LD_PRELOAD before WebKit starts its processes; it acts in the network process only and takes itself out of
/// LD_PRELOAD in every process it is loaded into, so the shells and helpers Atlas starts never carry it on. False: it
/// could not be written (the web tabs keep the native view, webtab.rs).
#[cfg(target_os = "linux")]
fn frames_preload() -> bool {
    const LIB: &[u8] = include_bytes!(concat!(env!("OUT_DIR"), "/libatlas-webkit-frames.so"));
    let dir = atlas_core::platform::dirs::atlas(atlas_core::platform::dirs::Base::Cache);
    let path = dir.join("libatlas-webkit-frames.so");
    let current = std::fs::read(&path).is_ok_and(|b| b == LIB);
    // written beside and renamed: a running WebKit process may have the old one mapped
    let written = current || {
        let tmp = dir.join(format!("libatlas-webkit-frames.so.{}", std::process::id()));
        std::fs::create_dir_all(&dir).and_then(|_| std::fs::write(&tmp, LIB)).and_then(|_| std::fs::rename(&tmp, &path)).map_err(|e| eprintln!("atlas-app: web pages as tabs: {} not written: {e}", path.display())).is_ok()
    };
    if written {
        let before = std::env::var("LD_PRELOAD").unwrap_or_default();
        let list = [path.to_string_lossy().into_owned()].into_iter().chain(before.split([':', ' ']).filter(|p| !p.is_empty() && !p.contains("atlas-webkit-frames")).map(str::to_owned));
        // SAFETY: main's first steps, before any thread exists
        unsafe { std::env::set_var("LD_PRELOAD", list.collect::<Vec<_>>().join(":")) };
    }
    written
}

/// Tells the page it is in the desktop app (in a plain browser, web links open the browser's own tabs) and whether its
/// iframes can show any site (lib/web-links.ts): on Windows the extension above removes the headers that forbid it, on
/// Linux the libsoup hook (`frames_preload`).
fn frames_any_page(frames: bool) -> &'static str {
    if frames { "window.__atlasDesktop = true; window.__atlasFramesAnything = true;" } else { "window.__atlasDesktop = true;" }
}

/// The core's "choose a folder" (the vault switcher's Choose…) is the system's own dialog, over this window: typing a whole
/// path was the only way, and on macOS nobody knows theirs.
fn folder_dialog(app: &tauri::AppHandle) {
    use atlas_core::vaults::PickPurpose;
    use tauri_plugin_dialog::DialogExt;
    let app = app.clone();
    atlas_core::vaults::on_pick_folder(move |purpose| {
        // the window of the moment: it is built again after its sleep (background.rs)
        let window = app.get_webview_window(MAIN_WINDOW)?;
        let title = match purpose {
            PickPurpose::Open => "Open a folder as a vault",
            PickPurpose::Create => "Where the new vault goes — make a new folder here, or choose an empty one",
        };
        let mut d = window.dialog().file().set_title(title).set_parent(&window).set_can_create_directories(true);
        if let Some(home) = std::env::var_os("HOME").or_else(|| std::env::var_os("USERPROFILE")) {
            d = d.set_directory(home);
        }
        d.blocking_pick_folder().and_then(|f| f.into_path().ok())
    });
}

fn browse_window(url: tauri::Url, root: PathBuf) -> anyhow::Result<()> {
    let web = atlas_core::config::Config::load(&root).map(|c| c.web).unwrap_or_default();
    tauri::Builder::default()
        .setup(move |app| {
            browser::prepare(app.handle(), web);
            browser::open(app.handle(), url, open_outside);
            Ok(())
        })
        .build(context())?
        .run(|_, _| {});
    Ok(())
}

/// An AppImage's runtime points Python (and Perl) at the libraries in its own mount; every program Atlas starts inherits
/// that, and the system's `python3` then fails ("Python path configuration") — every Python plugin with it. Atlas runs
/// no interpreter itself, so those variables go before anything starts. By shape: any `PYTHON*` / `PERL*` variable whose
/// value lies in `$APPDIR`; none outside an AppImage.
fn leave_appimage_interpreters() {
    let Some(dir) = std::env::var_os("APPDIR").filter(|d| !d.is_empty()) else { return };
    let dir = dir.to_string_lossy().into_owned();
    for (k, v) in std::env::vars_os() {
        let name = k.to_string_lossy();
        if (name.starts_with("PYTHON") || name.starts_with("PERL")) && v.to_string_lossy().contains(&dir) {
            // SAFETY: the first thing main does, before any thread exists
            unsafe { std::env::remove_var(&k) };
        }
    }
}

fn main() -> anyhow::Result<()> {
    leave_appimage_interpreters();
    // GTK's Wayland app id (X11: WM_CLASS) is the program name; "atlas" makes KWin find atlas.desktop and its Icon=atlas,
    // where the binary's name "atlas-app" matched no desktop file and the window showed Wayland's generic icon.
    #[cfg(target_os = "linux")]
    gtk::glib::set_prgname(Some("atlas"));
    // `atlas-app [folder]` is the app; `atlas-app --capture [folder]` the quick-capture box
    let args: Vec<std::ffi::OsString> = std::env::args_os().skip(1).collect();
    #[cfg(target_os = "linux")]
    if args.first().is_some_and(|a| a == web_filters::CONVERT_FLAG) {
        let out = args.get(1).map(PathBuf::from).ok_or_else(|| anyhow::anyhow!("{} <rules.json>", web_filters::CONVERT_FLAG))?;
        return Ok(web_filters::convert_main(&out)?);
    }
    let folder = args.iter().find(|a| !a.to_string_lossy().starts_with("--")).map(PathBuf::from);
    if args.iter().any(|a| a == "--capture") {
        if let Some(code) = native_capture(folder.as_deref()) {
            std::process::exit(code);
        }
        return capture_window(vault_to_open(folder)?);
    }
    if let Some(i) = args.iter().position(|a| a == "--browse") {
        let url = args.get(i + 1).map(|u| u.to_string_lossy().into_owned()).unwrap_or_default();
        let rest = args.iter().skip(i + 2).find(|a| !a.to_string_lossy().starts_with("--")).map(PathBuf::from);
        return browse_window(url.parse().map_err(|e| anyhow::anyhow!("--browse {url:?}: {e}"))?, rest.unwrap_or_else(|| PathBuf::from(".")));
    }
    // a server's address instead of a folder: a window on that vault's page, no core here
    if let Some(url) = folder.as_ref().and_then(|f| atlas_core::vaults::server_address(&f.to_string_lossy())) {
        return remote_window(url.parse()?);
    }
    let root = vault_to_open(folder)?;
    // `--background`: the core and the tray, no window until asked (the session's autostart entry, autostart.rs)
    let background_start = args.iter().any(|a| a == autostart::BACKGROUND);
    // one Atlas per vault: a second launch brings the first one's window forward (it may be hidden in the tray)
    if let Some(base) = atlas_core::vaults::running_server(&root) {
        let asked = if background_start { Ok(String::new()) } else { tauri::async_runtime::block_on(post(&base, "/api/shell/show", "{}")) };
        match asked {
            Ok(_) => {
                eprintln!("atlas-app: Atlas already runs on {} ({base}): {}", root.display(), if background_start { "nothing to start" } else { "its window brought forward" });
                return Ok(());
            }
            Err(e) => eprintln!("atlas-app: the Atlas running on {} has no window to show ({e}); starting one", root.display()),
        }
    }
    webkit_rendering(&root);
    #[cfg(target_os = "linux")]
    let frames = frames_preload();
    #[cfg(not(target_os = "linux"))]
    let frames = cfg!(windows);
    // the installed UI (packaging/install.sh copies it): a new interface reloads into this window
    // without a new program (atlas-core ui_files.rs; the page watches /api/ui/build)
    if std::env::var_os("ATLAS_UI_DIR").is_none() {
        if let Some(d) = atlas_core::ui_files::installed() {
            std::env::set_var("ATLAS_UI_DIR", d);
        }
    }
    // Tauri's async runtime is tokio; the server task keeps running on it after block_on returns.
    let server = tauri::async_runtime::block_on(desktop_core(root.clone()))?;
    // the vault list (docs/guides/SHELL.md) is written here only: `atlas serve` on a throwaway folder leaves no trace
    if let Err(e) = atlas_core::vaults::remember_now(&server.info().root) {
        eprintln!("atlas-app: vault list not updated: {e}");
    }
    // ATLAS_DEV=1 (the "Atlas (dev)" launcher): the UI from this repository's Vite dev server, so a
    // saved .svelte / .ts / .css shows at once with no rebuild; the core stays the installed one
    let mut dev = std::env::var_os("ATLAS_DEV").is_some().then(|| dev_ui(&server.url(), server.key())).transpose()?;
    // the locked core is opened by a one-time link that leaves the key's cookie in this window
    let url = std::env::var("ATLAS_UI_URL").ok().or_else(|| dev.as_ref().map(|d| d.url.clone())).unwrap_or_else(|| server.open_url());
    eprintln!("atlas-app: workspace {} served at {}; window → {url}", server.info().root.display(), server.url());
    watch_for_update(server.url());
    let url: tauri::Url = url.parse()?;
    let core = server.url();
    let server = Some(server);
    let vault = root.clone();

    let builder = tauri::Builder::default().plugin(tauri_plugin_dialog::init());
    #[cfg(target_os = "macos")]
    let builder = builder.plugin(capture_key(root.clone()));
    // the link a rebuilt window opens with: a locked core's one-time codes are spent, so a fresh one each time
    let server = std::sync::Arc::new(std::sync::Mutex::new(server));
    let fresh_link = {
        let (server, fixed) = (server.clone(), std::env::var("ATLAS_UI_URL").ok().or_else(|| dev.as_ref().map(|d| d.url.clone())));
        move || fixed.clone().or_else(|| server.lock().unwrap().as_ref().map(|s| s.open_url()))
    };
    builder
        .setup(move |app| {
            let handle = app.handle().clone();
            browser::prepare(&handle, atlas_core::config::Config::load(&vault).map(|c| c.web).unwrap_or_default());
            let spec = MainSpec { home: url.clone(), core: core.clone(), vault: vault.clone(), frames };
            let open_main: background::OpenMain = Box::new(move |app, open| {
                let mut to = fresh_link().and_then(|l| l.parse::<tauri::Url>().ok()).unwrap_or_else(|| spec.home.clone());
                if let Some(path) = open {
                    to.query_pairs_mut().append_pair("open", path);
                }
                spec.build(app, to)
            });
            let shell = background::Shell::new(handle.clone(), vault.clone(), core.clone(), open_main);
            let _ = SHELL.set(shell.clone());
            folder_dialog(&handle);
            // a notification's click, a second launch, the tray: one way to bring the window forward (shell.rs)
            let s = shell.clone();
            atlas_core::shell::on_show(move |show| s.show(show.open));
            let s = shell.clone();
            atlas_core::notify::on_notice(move |n, looked_at| s.notice(n, looked_at));
            let start_vault = vault.clone();
            atlas_core::shell::on_config(move |root, cfg| {
                if same_folder(root, &start_vault) {
                    autostart::apply(cfg.desktop.start_at_login);
                }
            });
            autostart::apply(atlas_core::config::Config::load(&vault).map(|c| c.desktop.start_at_login).unwrap_or(false));
            if background_start {
                shell.start_asleep();
            } else {
                shell.show(None);
            }
            start_tray(&handle, &shell, background_start);
            shell.watch_sleep();
            Ok(())
        })
        .on_window_event(|window, event| {
            if let (MAIN_WINDOW, tauri::WindowEvent::CloseRequested { api, .. }) = (window.label(), event) {
                if SHELL.get().is_some_and(|s| s.close_requested()) {
                    api.prevent_close();
                }
            }
        })
        .build(context())?
        .run(move |_app, event| match event {
            // the window closed by its sleep (or never opened, `--background`): Atlas runs on in the tray
            tauri::RunEvent::ExitRequested { code: None, api, .. } if SHELL.get().is_some_and(|s| s.keeps_running()) => api.prevent_exit(),
            // macOS: a click on the Dock icon of an Atlas with no window shown
            #[cfg(target_os = "macos")]
            tauri::RunEvent::Reopen { has_visible_windows: false, .. } => {
                if let Some(s) = SHELL.get() {
                    s.show(None);
                }
            }
            tauri::RunEvent::Exit => {
                if let Some(mut d) = dev.take() {
                    let _ = d.vite.kill(); // the dev server goes with the window
                }
                // Graceful stop so `.atlas/cache/server.json` does not point at a dead port.
                if let Some(s) = server.lock().unwrap().take() {
                    let _ = tauri::async_runtime::block_on(s.shutdown());
                }
            }
            _ => {}
        });
    Ok(())
}

const MAIN_WINDOW: &str = "main";
static SHELL: std::sync::OnceLock<std::sync::Arc<background::Shell>> = std::sync::OnceLock::new();

fn same_folder(a: &std::path::Path, b: &std::path::Path) -> bool {
    a == b || matches!((a.canonicalize(), b.canonicalize()), (Ok(x), Ok(y)) if x == y)
}

/// The tray icon (tray_sni.rs on Linux, tray_tauri.rs elsewhere). Without one, closing quits, and a `--background`
/// start opens its window after all — a window hidden with no way back would look like a crash.
fn start_tray(app: &tauri::AppHandle, shell: &std::sync::Arc<background::Shell>, background_start: bool) {
    let (rgba, w, h) = tray_pixels();
    let model = shell.model();
    #[cfg(target_os = "linux")]
    {
        let _ = app; // ksni needs no handle: its own D-Bus connection
        let shell = shell.clone();
        tauri::async_runtime::spawn(async move {
            if let Err(e) = tray_sni::start(shell.clone(), tray_sni::Icons::from_rgba(&rgba, w, h), model).await {
                eprintln!("atlas-app: no tray icon ({e}): closing the window quits Atlas");
                if background_start {
                    shell.show(None);
                }
            }
        });
    }
    #[cfg(not(target_os = "linux"))]
    if let Err(e) = tray_tauri::start(app, shell.clone(), tray_tauri::Icons::from_rgba(&rgba, w, h), model) {
        eprintln!("atlas-app: no tray icon ({e}): closing the window quits Atlas");
        if background_start {
            shell.show(None);
        }
    }
}

/// The app's icon at 64 px, as RGBA (the tray scales it to its own size).
fn tray_pixels() -> (Vec<u8>, u32, u32) {
    let mut dec = png::Decoder::new(&include_bytes!("../icons/64x64.png")[..]);
    dec.set_transformations(png::Transformations::EXPAND | png::Transformations::ALPHA);
    let Ok(mut reader) = dec.read_info() else { return (vec![0; 64 * 64 * 4], 64, 64) };
    let mut buf = vec![0; reader.output_buffer_size()];
    let Ok(info) = reader.next_frame(&mut buf) else { return (vec![0; 64 * 64 * 4], 64, 64) };
    buf.truncate(info.buffer_size());
    let rgba = match info.color_type {
        png::ColorType::Rgba => buf,
        png::ColorType::Rgb => buf.as_chunks::<3>().0.iter().flat_map(|p| [p[0], p[1], p[2], 255]).collect(),
        png::ColorType::GrayscaleAlpha => buf.as_chunks::<2>().0.iter().flat_map(|p| [p[0], p[0], p[0], p[1]]).collect(),
        _ => buf.iter().flat_map(|&g| [g, g, g, 255]).collect(),
    };
    (rgba, info.width, info.height)
}

/// What the main window is built from — at start and again after its sleep (background.rs).
struct MainSpec {
    home: tauri::Url,
    core: String,
    vault: PathBuf,
    frames: bool,
}

impl MainSpec {
    fn build(&self, app: &tauri::AppHandle, url: tauri::Url) -> tauri::Result<tauri::WebviewWindow> {
        let (handle, core, vault, vault_bg) = (app.clone(), self.core.clone(), self.vault.clone(), self.vault.clone());
        let off_app = OffApp { home: self.home.clone(), handle: handle.clone(), vault: vault.clone() };
        let main = WebviewWindowBuilder::new(app, MAIN_WINDOW, WebviewUrl::External(url))
            .title("Atlas")
            .initialization_script(frames_any_page(self.frames))
            // a web tab's frame: its address, history, find and Atlas's keys (frame_page.js; inert elsewhere)
            .initialization_script_for_all_frames(include_str!("frame_page.js"))
            // OS file drops reach the page's own `drop` (the editor, the explorer, the capture popup); Tauri's
            // handler would take them first (on Windows the page then never sees a dropped file)
            .disable_drag_drop_handler()
            .inner_size(MAIN_SIZE.width, MAIN_SIZE.height);
        // the window's page never leaves Atlas (OffApp). WebKitGTK reports a frame's navigation as the page's, and
        // a web tab is a frame: there the guard watches the page's own loads instead (`load-changed` is the main
        // frame's alone), below; elsewhere the navigation hook is the main frame's.
        #[cfg(not(target_os = "linux"))]
        let main = main.on_navigation(move |to| off_app.stay(to));
        #[cfg(windows)]
        let main = match frame_any_extension() {
            Some(dir) => main.browser_extensions_enabled(true).extensions_path(dir),
            None => main,
        };
        let main = main
            // window.open: WebKitGTK opens nothing without a handler. A sign-in page that returns to a
            // localhost address gets a window of ours (it catches that address); a web page a browsing window
            // (browser.rs) or the desktop's browser (`web.open_links`); anything else (mailto:) its desktop handler.
            .on_new_window(move |to, _| {
                if let Some(page) = door_target(&to) {
                    door_window(&handle, page, core.clone());
                    return tauri::webview::NewWindowResponse::Deny;
                }
                // the core's own address (the "Open Atlas in the browser" link) is for the desktop's browser
                let own = to.port_or_known_default() == tauri::Url::parse(&core).ok().and_then(|c| c.port()) && matches!(to.host_str(), Some("127.0.0.1" | "localhost"));
                match signin_return(&to) {
                    Some(back) => signin_window(&handle, to, back, core.clone()),
                    None if own => open_outside(to.as_str()),
                    None => web_link(&handle, to, &vault),
                }
                tauri::webview::NewWindowResponse::Deny
            })
            .build()?;
        fit_to_screen(&main);
        paint_before_page(&main, &vault_bg);
        // WebKitGTK silently drops a window.open that no fresh click started — and a plugin's sign-in
        // opens its page only after its helper has answered. Every request still goes through on_new_window.
        #[cfg(target_os = "linux")]
        main.with_webview(move |w| {
            use webkit2gtk::{SettingsExt, WebViewExt};
            if let Some(s) = w.inner().settings() {
                s.set_javascript_can_open_windows_automatically(true);
            }
            pinch_to_wheel(&w.inner());
            stay_in_atlas(&w.inner(), off_app);
            webtab::attach(&w.inner()); // web pages as tabs, framing allowed or not
            // a document, not a browser: no back/forward page cache, small memory caches — Atlas is one page and never goes back to a page it left
            if let Some(c) = w.inner().context() {
                use webkit2gtk::WebContextExt;
                c.set_cache_model(webkit2gtk::CacheModel::DocumentViewer);
            }
        })?;
        Ok(main)
    }
}

/// The page leaving Atlas for an outside address (a sign-in, a stray link): the load is stopped before it commits
/// (the page stays as it was) and the address goes where OffApp sends it. Linux only: see where it is called.
#[cfg(target_os = "linux")]
fn stay_in_atlas(view: &webkit2gtk::WebView, off: OffApp) {
    use webkit2gtk::{LoadEvent, WebViewExt};
    view.connect_load_changed(move |v, ev| {
        if !matches!(ev, LoadEvent::Started | LoadEvent::Redirected) {
            return;
        }
        let Some(to) = v.uri().and_then(|u| tauri::Url::parse(&u).ok()) else { return };
        if !off.stay(&to) {
            v.stop_loading();
        }
    });
}

/// A touchpad pinch never zooms the whole page (WebKitGTK scales it on its own, before any script could stop it): the
/// GTK event is taken here and handed to the page as a Ctrl+wheel at the fingers, which a drawing, a PDF or a picture
/// zooms on, as they do for Ctrl+wheel.
#[cfg(target_os = "linux")]
fn pinch_to_wheel(view: &webkit2gtk::WebView) {
    use gtk::prelude::WidgetExt;
    use webkit2gtk::WebViewExt;
    let last = std::cell::Cell::new(1.0f64);
    view.connect_event(move |v, ev| {
        let Some(p) = ev.downcast_ref::<gtk::gdk::EventTouchpadPinch>() else { return gtk::glib::Propagation::Proceed };
        let scale = p.scale();
        if (scale - 1.0).abs() < 1e-6 {
            last.set(1.0); // a pinch begins (or ends) at scale 1
            return gtk::glib::Propagation::Stop;
        }
        let ratio = scale / last.replace(scale);
        let delta = -ratio.ln() * 400.0; // fingers apart: zoom in, as a Ctrl+wheel up
        if delta.abs() > 0.01 {
            let (x, y) = p.position();
            let js = format!(
                "(()=>{{const t=document.elementFromPoint({x},{y})||document.body;t.dispatchEvent(new WheelEvent('wheel',{{deltaY:{delta},ctrlKey:true,clientX:{x},clientY:{y},bubbles:true,cancelable:true}}))}})()"
            );
            #[allow(deprecated)] // evaluate_javascript needs WebKitGTK 2.40; this runs on every version the app supports
            v.run_javascript(&js, None::<&gtk::gio::Cancellable>, |_| {});
        }
        gtk::glib::Propagation::Stop
    });
}

/// The address an OAuth sign-in page sends its answer to (its `redirect_uri`), when that is this computer
/// (`https://localhost`, `http://127.0.0.1:8400/…`): nothing listens there, so the page has to be caught on the way.
fn signin_return(page: &tauri::Url) -> Option<tauri::Url> {
    let back: tauri::Url = page.query_pairs().find(|(k, _)| k == "redirect_uri")?.1.parse().ok()?;
    let local = matches!(back.host_str(), Some("localhost" | "127.0.0.1" | "[::1]"));
    (local && matches!(back.scheme(), "http" | "https")).then_some(back)
}

/// Whether `to` is the sign-in's return address (with its `?code=…`): same scheme, host and port, path under it.
fn returns_to(to: &tauri::Url, back: &tauri::Url) -> bool {
    to.scheme() == back.scheme()
        && to.host_str() == back.host_str()
        && to.port_or_known_default() == back.port_or_known_default()
        && to.path().starts_with(back.path())
}

/// A provider's sign-in page in a window of Atlas, as Thunderbird does it: the user signs in there, and when the
/// page heads for its return address the window closes and hands that address to the page that asked
/// (POST /api/signin → the "signin" event → `atlas.signIn`). If the window cannot be made, the browser.
fn signin_window(app: &tauri::AppHandle, page: tauri::Url, back: tauri::Url, core: String) {
    static N: std::sync::atomic::AtomicUsize = std::sync::atomic::AtomicUsize::new(0);
    let label = format!("signin-{}", N.fetch_add(1, std::sync::atomic::Ordering::Relaxed));
    let (app2, label2) = (app.clone(), label.clone());
    let built = WebviewWindowBuilder::new(app, &label, WebviewUrl::External(page.clone()))
        .title("Sign in — Atlas")
        .inner_size(520.0, 720.0)
        .center()
        .focused(true)
        .on_navigation(move |to| {
            if !returns_to(to, &back) {
                return true;
            }
            let (core, body, app, label) = (core.clone(), serde_json::json!({ "url": to.as_str() }).to_string(), app2.clone(), label2.clone());
            tauri::async_runtime::spawn(async move {
                if let Err(e) = post(&core, "/api/signin", &body).await {
                    eprintln!("atlas-app: sign-in answer not delivered: {e}");
                }
                if let Some(w) = app.get_webview_window(&label) {
                    let _ = w.close();
                }
            });
            false
        })
        .build();
    if let Err(e) = built {
        eprintln!("atlas-app: no sign-in window ({e}); the browser instead");
        open_outside(page.as_str());
    }
}

/// The page's ask for a service sign-in (core `/signin/door?url=…` on this computer): the service's address.
fn door_target(to: &tauri::Url) -> Option<tauri::Url> {
    let local = matches!(to.host_str(), Some("localhost" | "127.0.0.1" | "[::1]"));
    if !local || to.path() != "/signin/door" {
        return None;
    }
    let page: tauri::Url = to.query_pairs().find(|(k, _)| k == "url")?.1.parse().ok()?;
    matches!(page.scheme(), "http" | "https").then_some(page)
}

/// A service's gate (Authelia, Authentik…) in a window of Atlas: the user signs in on its page (a security key works
/// there), and once a page of the service itself has loaded, its cookies go to the core (POST /api/signin/door),
/// which sends them with the plugins' later requests to that site — then the window closes. A page of the service
/// with no cookie at all is not a gate's doing: the window stays for the user to finish or close.
fn door_window(app: &tauri::AppHandle, page: tauri::Url, core: String) {
    static N: std::sync::atomic::AtomicUsize = std::sync::atomic::AtomicUsize::new(0);
    let label = format!("door-{}", N.fetch_add(1, std::sync::atomic::Ordering::Relaxed));
    let host = page.host_str().unwrap_or_default().to_ascii_lowercase();
    let done = std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false));
    let built = WebviewWindowBuilder::new(app, &label, WebviewUrl::External(page.clone()))
        .title(format!("Sign in to {host} — Atlas"))
        .inner_size(520.0, 720.0)
        .center()
        .focused(true)
        .on_page_load(move |w, load| {
            let back_home = load.url().host_str().is_some_and(|h| h.eq_ignore_ascii_case(&host));
            if load.event() != tauri::webview::PageLoadEvent::Finished || !back_home || done.load(std::sync::atomic::Ordering::SeqCst) {
                return;
            }
            let (core, host, done, at) = (core.clone(), host.clone(), done.clone(), load.url().clone());
            // cookies are read off the handler's thread (it would block the window's own loop)
            tauri::async_runtime::spawn(async move {
                let cookies: Vec<serde_json::Value> = match w.cookies_for_url(at) {
                    Ok(list) => list.iter().map(|c| door_cookie(c, &host)).collect(),
                    Err(e) => return eprintln!("atlas-app: the sign-in window's cookies could not be read: {e}"),
                };
                if cookies.is_empty() || done.swap(true, std::sync::atomic::Ordering::SeqCst) {
                    return;
                }
                let body = serde_json::json!({ "host": host, "cookies": cookies }).to_string();
                match post(&core, "/api/signin/door", &body).await {
                    Ok(_) => drop(w.close()),
                    Err(e) => eprintln!("atlas-app: sign-in to {host} not kept: {e}"),
                }
            });
        })
        .build();
    if let Err(e) = built {
        eprintln!("atlas-app: no sign-in window ({e})");
    }
}

/// A cookie as the core keeps it (`service_signin::Cookie`): a domain cookie carries its leading dot.
fn door_cookie(c: &tauri::webview::Cookie<'static>, host: &str) -> serde_json::Value {
    let domain = c.domain().map(str::to_string).unwrap_or_else(|| host.to_string());
    serde_json::json!({
        "name": c.name(), "value": c.value(), "host_only": !domain.starts_with('.'), "domain": domain,
        "path": c.path().unwrap_or("/"), "secure": c.secure().unwrap_or(false),
        "expires": c.expires_datetime().map(|t| t.unix_timestamp().max(0)),
    })
}

/// An address in the desktop's own handler (the browser for the web, the mail client for mailto:).
/// The main window on a core of this machine never leaves it: a link that would replace the app with a web page (a
/// PDF's link, a page's own) opens as `window.open` would — a browsing window or the desktop's browser. A window on a
/// remote server is left alone: its sign-in in front takes it to other hosts and back.
struct OffApp {
    home: tauri::Url,
    handle: tauri::AppHandle,
    vault: PathBuf,
}

impl OffApp {
    fn stay(&self, to: &tauri::Url) -> bool {
        let local = |u: &tauri::Url| matches!(u.host_str(), Some("127.0.0.1" | "localhost" | "tauri.localhost" | "[::1]"));
        if !local(&self.home) || !matches!(to.scheme(), "http" | "https") || local(to) {
            return true;
        }
        web_link(&self.handle, to.clone(), &self.vault);
        false
    }
}

/// A web page leaving the main window, as `[web] open_links` says: a Web tab of the app (the pane's
/// `__atlasOpenWeb`, ui/src/lib/web-links.ts), a browsing window, or the desktop's browser. Other schemes: their handler.
fn web_link(app: &tauri::AppHandle, to: tauri::Url, vault: &std::path::Path) {
    use atlas_core::config::WebLinks;
    if !matches!(to.scheme(), "http" | "https") {
        return open_outside(to.as_str());
    }
    match atlas_core::config::Config::load(vault).map(|c| c.web.open_links).unwrap_or_default() {
        WebLinks::Tab => match app.get_webview_window("main") {
            Some(main) => {
                let js = format!("window.__atlasOpenWeb ? window.__atlasOpenWeb({}) : void 0", serde_json::Value::from(to.as_str()));
                if main.eval(&js).is_err() {
                    browser::open(app, to, open_outside);
                }
            }
            None => browser::open(app, to, open_outside),
        },
        WebLinks::Window => browser::open(app, to, open_outside),
        WebLinks::Browser => open_outside(to.as_str()),
    }
}

fn open_outside(url: &str) {
    if let Err(e) = atlas_core::platform::open::url(url) {
        eprintln!("atlas-app: {e}");
    }
}

/// The installed program is replaced by every rebuild (docs/scripts/auto-install.sh), but a running
/// window keeps the old one: when the file on disk changes, say so once per new build — a toast
/// through the core's own `notify` command, so the UI needs nothing new.
fn watch_for_update(base: String) {
    let Ok(exe) = std::env::current_exe() else { return };
    let stamp = |p: &std::path::Path| std::fs::metadata(p).and_then(|m| m.modified()).ok();
    let mut seen = stamp(&exe);
    tauri::async_runtime::spawn(async move {
        loop {
            tokio::time::sleep(std::time::Duration::from_secs(20)).await;
            let now = stamp(&exe);
            if now.is_none() || now == seen {
                continue; // mid-install the file may be missing for a moment
            }
            seen = now;
            let body = r#"{"args":{"title":"Atlas was updated","body":"A new build is installed. Restart Atlas to use it."}}"#;
            if let Err(e) = post(&base, "/api/cmd/notify", body).await {
                eprintln!("atlas-app: update notice not shown: {e}");
            }
        }
    });
}

/// A bare HTTP POST to the core on localhost (no HTTP client dependency for one request); with the core's key when it
/// left one (a locked core, local_lock.rs), as the `atlas` CLI does. → the answer's body when it succeeded.
async fn post(base: &str, path: &str, body: &str) -> std::io::Result<String> {
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    // a vault of the desktop's core is served under its prefix (`http://127.0.0.1:port/v/name`)
    let (host, prefix) = split_base(base);
    let path = format!("{prefix}{path}");
    let key = atlas_core::auth::local_key_header(host);
    let mut s = tokio::net::TcpStream::connect(host).await?;
    let req = format!("POST {path} HTTP/1.1\r\nHost: {host}\r\nx-atlas: 1\r\n{key}content-type: application/json\r\ncontent-length: {}\r\nconnection: close\r\n\r\n{body}", body.len());
    s.write_all(req.as_bytes()).await?;
    let mut answer = Vec::new();
    s.read_to_end(&mut answer).await?;
    let answer = String::from_utf8_lossy(&answer);
    let (head, body) = answer.split_once("\r\n\r\n").unwrap_or((&answer, ""));
    if !head.split(' ').nth(1).is_some_and(|code| code.starts_with('2')) {
        return Err(std::io::Error::other(head.lines().next().unwrap_or("no answer").to_string()));
    }
    Ok(body.to_string())
}

/// `http://host:port/v/name/` → (`host:port`, `/v/name`).
fn split_base(base: &str) -> (&str, &str) {
    let rest = base.trim_start_matches("http://").trim_end_matches('/');
    match rest.find('/') {
        Some(i) => (&rest[..i], &rest[i..]),
        None => (rest, ""),
    }
}

/// The Vite dev server of the repository Atlas was built from, proxying `/api` to this window's core.
struct DevUi {
    url: String,
    vite: std::process::Child,
}

fn dev_ui(core: &str, key: Option<&str>) -> anyhow::Result<DevUi> {
    // ATLAS_REPO (written by install.sh): auto-install builds from a temporary copy, so the build's own path is not the repo
    let repo = std::env::var_os("ATLAS_REPO").map(std::path::PathBuf::from).unwrap_or_else(|| std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join(".."));
    let ui = repo.join("ui");
    anyhow::ensure!(ui.join("package.json").is_file(), "ATLAS_DEV: no UI sources at {} (this build came from elsewhere)", ui.display());
    let port = (5174..5200).find(|p| std::net::TcpListener::bind(("127.0.0.1", *p)).is_ok()).ok_or_else(|| anyhow::anyhow!("ATLAS_DEV: no free port for Vite"))?;
    eprintln!("atlas-app: dev mode: Vite on {port}, from {}", ui.display());
    let vite = std::process::Command::new("npm")
        // --host: "localhost" may resolve to ::1 only, and the window below waits on 127.0.0.1
        .args(["run", "dev", "--", "--host", "127.0.0.1", "--port", &port.to_string(), "--strictPort"])
        .current_dir(&ui)
        .env("ATLAS_API", core)
        .env("ATLAS_API_KEY", key.unwrap_or_default()) // vite.config.ts: the proxy signs its requests with it
        .spawn()?;
    // the window must not open on a server that is not listening yet
    for _ in 0..150 {
        if std::net::TcpStream::connect(("127.0.0.1", port)).is_ok() {
            return Ok(DevUi { url: format!("http://127.0.0.1:{port}/"), vite });
        }
        std::thread::sleep(std::time::Duration::from_millis(100));
    }
    anyhow::bail!("ATLAS_DEV: Vite did not start on port {port} in 15 s")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_vaults_address_splits_into_its_host_and_its_prefix() {
        assert_eq!(split_base("http://127.0.0.1:4000/v/notes/"), ("127.0.0.1:4000", "/v/notes"));
        assert_eq!(split_base("http://127.0.0.1:4000/"), ("127.0.0.1:4000", ""));
        assert_eq!(split_base("http://127.0.0.1:4000"), ("127.0.0.1:4000", ""));
    }

    #[test]
    fn the_welcome_page_parses_and_leads_to_a_vault() {
        let p = atlas_core::page::parse(WELCOME_PAGE).unwrap();
        assert_eq!(p.title.as_deref(), Some("Welcome"));
        let blocks: Vec<_> = p.rows.iter().flat_map(|r| r.columns.iter().flatten()).collect();
        assert!(blocks.iter().any(|b| matches!(b, atlas_core::api::PageBlock::View { view, .. } if view == "vaults")), "the buttons to a vault");
        // the keys it names are the app's (actions.ts / vaults.ts), not another program's
        assert!(WELCOME_PAGE.contains("Ctrl+Alt+V") && !WELCOME_PAGE.contains("Ctrl+K"));
    }

    #[test]
    fn the_capture_box_opens_through_the_one_time_link() {
        assert_eq!(capture_page("http://127.0.0.1:7700/?k=abc"), "http://127.0.0.1:7700/capture.html?k=abc#capture");
        assert_eq!(capture_page("http://127.0.0.1:7700/v/work/?k=abc"), "http://127.0.0.1:7700/v/work/capture.html?k=abc#capture");
        assert_eq!(capture_page("http://127.0.0.1:7700/"), "http://127.0.0.1:7700/capture.html#capture", "an open core");
    }

    #[test]
    fn a_sign_in_page_is_known_by_its_local_return_address() {
        let ms: tauri::Url = "https://login.microsoftonline.com/common/oauth2/v2.0/authorize?client_id=x&redirect_uri=https%3A%2F%2Flocalhost&scope=a".parse().unwrap();
        let back = signin_return(&ms).expect("a localhost redirect_uri");
        assert_eq!(back.as_str(), "https://localhost/");
        assert!(returns_to(&"https://localhost/?code=abc&state=s".parse().unwrap(), &back));
        assert!(!returns_to(&"https://localhost.evil.example/?code=abc".parse().unwrap(), &back));
        assert!(!returns_to(&"http://localhost/?code=abc".parse().unwrap(), &back), "another scheme");
        assert!(!returns_to(&"https://login.microsoftonline.com/common/login".parse().unwrap(), &back));

        let loopback: tauri::Url = "https://accounts.example/auth?redirect_uri=http://127.0.0.1:8400/cb".parse().unwrap();
        let back = signin_return(&loopback).unwrap();
        assert!(returns_to(&"http://127.0.0.1:8400/cb?code=1".parse().unwrap(), &back));
        assert!(!returns_to(&"http://127.0.0.1:8401/cb?code=1".parse().unwrap(), &back), "another port");

        let door: tauri::Url = "http://127.0.0.1:7700/signin/door?url=https%3A%2F%2Flinks.example.org%2Fapi".parse().unwrap();
        assert_eq!(door_target(&door).unwrap().as_str(), "https://links.example.org/api");
        assert!(door_target(&"https://evil.example/signin/door?url=https://links.example.org".parse().unwrap()).is_none(), "only this computer's core asks");
        assert!(door_target(&"http://127.0.0.1:7700/signin/door?url=file:///etc/passwd".parse().unwrap()).is_none());

        for plain in ["https://example.org/page", "https://x.example/auth?redirect_uri=https://app.example/cb", "https://x.example/?redirect_uri=file:///etc"] {
            assert!(signin_return(&plain.parse().unwrap()).is_none(), "{plain} goes to the browser");
        }
    }
}
