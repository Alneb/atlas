//! Web pages as tabs. A site that forbids framing (X-Frame-Options, CSP frame-ancestors) is a blank iframe, and WebKitGTK cannot
//! drop those headers (its responses are read-only; `disable-web-security` does not lift them — measured,
//! docs/WEB-WINDOWS.md "Web tabs"). So each web tab is a WebKit view of the app's own, laid over the tab's place in the
//! page, as Obsidian's <webview>: the main view goes into a `gtk::Overlay`, the Web pane says where it is
//! (`atlasWeb` messages) and the app places, shows and hides one view per tab, telling the pane its address and title.
use std::cell::RefCell;
use std::collections::HashMap;

use gtk::prelude::*;
use gtk::OverlaySignals;
use webkit2gtk::{
    CookieManagerExt, LoadEvent, SettingsExt, URIRequestExt, UserContentInjectedFrames, UserContentManager,
    UserContentManagerExt, UserScript, UserScriptInjectionTime, WebContext, WebContextExt, WebView, WebViewExt, WebsiteDataManager,
    WebsiteDataManagerExt,
};

/// What the Web pane asks (ui/src/panes/Web.svelte); `id` is its dock panel's.
#[derive(serde::Deserialize)]
#[serde(tag = "op", rename_all = "lowercase")]
enum Ask {
    /// on screen at this rectangle (the page's CSS px); `url` is loaded when the view is made
    Show { id: String, url: String, x: f64, y: f64, w: f64, h: f64 },
    Hide { id: String },
    Go { id: String, url: String },
    Back { id: String },
    Forward { id: String },
    Reload { id: String },
    Close { id: String },
}

/// The keys a web tab hands back to Atlas, as names (never keystrokes: a site could post them itself, so a site can at
/// most close its own tab or open a palette); the browser's own keys stay in the page.
const KEYS: &str = r#"
// WebKitGTK reports Super as a key of its own ("Super", OSLeft), never in metaKey or getModifierState (measured in a
// hidden KWin through Xwayland, 2026-10-21): held from its keydown to its keyup or a blur, as Atlas does (keys.ts)
let sup = false;
const isSup = (e) => /^(Meta|OS|Super|Hyper)(Left|Right)?$/.test(e.key) || /^(Meta|OS|Super|Hyper)(Left|Right)?$/.test(e.code);
addEventListener("keyup", (e) => { if (isSup(e)) sup = false; }, true);
addEventListener("blur", () => { sup = false; });
addEventListener("keydown", (e) => {
  if (isSup(e)) { sup = true; return; }
  if (["Shift", "Control", "Alt", "AltGraph"].includes(e.key)) return; // a chord's other modifiers: wait for its key
  const meta = e.metaKey || sup || e.getModifierState("Super") || e.getModifierState("OS");
  const k = e.key.toLowerCase(), plain = !e.altKey && !meta;
  const send = (what) => { e.preventDefault(); e.stopImmediatePropagation(); webkit.messageHandlers.atlasWebKey.postMessage(what); };
  if (e.altKey && e.key === "ArrowLeft") { e.preventDefault(); history.back(); }
  else if (e.altKey && e.key === "ArrowRight") { e.preventDefault(); history.forward(); }
  else if (e.key === "F5" || (e.ctrlKey && plain && !e.shiftKey && k === "r")) { e.preventDefault(); location.reload(); }
  else if (e.ctrlKey && plain && !e.shiftKey && k === "w") send("close");
  else if (e.ctrlKey && plain && !e.shiftKey && k === "p") send("files");
  else if (e.key === "F1") send("palette");
  else if (e.ctrlKey && plain && !e.shiftKey && k === "l") send("address");
  // Super is Atlas's (its app keys; a page has no use for it): the chord back, run as Atlas binds it
  else if (meta) send("key:" + JSON.stringify({ key: e.key, code: e.code, ctrl: e.ctrlKey, shift: e.shiftKey, alt: e.altKey }));
}, true);
addEventListener("mouseup", (e) => { if (e.button === 3) history.back(); else if (e.button === 4) history.forward(); }, true);
"#;
const ACTIONS: [&str; 4] = ["close", "files", "palette", "address"];

struct Place {
    overlay: gtk::Overlay,
    tabs: HashMap<String, WebView>,
    context: Option<WebContext>,
}

thread_local! {
    static PLACE: RefCell<Option<Place>> = const { RefCell::new(None) };
    /// each tab's rectangle in the overlay (widget px), given as is by `get-child-position`; apart from PLACE, as the
    /// overlay asks for it while allocating
    static AT: RefCell<HashMap<WebView, gtk::gdk::Rectangle>> = RefCell::new(HashMap::new());
    /// apart from PLACE: a view's signals fire inside a call made while PLACE is borrowed (load_uri → uri) and tell it
    static MAIN: RefCell<Option<WebView>> = const { RefCell::new(None) };
}

/// Puts the main view in an overlay and listens to its page. GTK main thread, before the page loads.
pub fn attach(main: &WebView) {
    let Some(parent) = main.parent().and_then(|p| p.downcast::<gtk::Box>().ok()) else {
        return eprintln!("atlas-app: web tabs off (the window's view is not in a box)");
    };
    let overlay = gtk::Overlay::new();
    parent.remove(main);
    overlay.add(main);
    parent.pack_start(&overlay, true, true, 0);
    // a tab's view gets exactly its pane's rectangle. Not margins + size_request: the overlay allocates a child its
    // natural size, which a WebView never shrinks below its first one — a pane made smaller (a split, the window)
    // left the page overflowing it (measured in a hidden KWin: pane 742×275, view kept at 1142×451)
    overlay.connect_get_child_position(|_, w| {
        let view = w.downcast_ref::<WebView>()?;
        AT.with(|a| a.borrow().get(view).copied())
    });
    overlay.show_all();
    if let Some(ucm) = main.user_content_manager() {
        ucm.register_script_message_handler("atlasWeb");
        ucm.connect_script_message_received(Some("atlasWeb"), |_, r| {
            let Some(text) = r.js_value().map(|v| javascriptcore::ValueExt::to_str(&v)) else { return };
            match serde_json::from_str::<Ask>(&text) {
                Ok(ask) => handle(ask),
                Err(e) => eprintln!("atlas-app: a web tab's ask not understood ({e}): {text}"),
            }
        });
    }
    // the page loaded again (a new interface, a vault switch): its panes ask afresh, the old views go
    main.connect_load_changed(|_, ev| {
        if ev == LoadEvent::Started {
            with(|p| for (_, v) in p.tabs.drain() { forget(&p.overlay, &v) });
        }
    });
    PLACE.with(|p| *p.borrow_mut() = Some(Place { overlay, tabs: HashMap::new(), context: None }));
    MAIN.with(|m| *m.borrow_mut() = Some(main.clone()));
}

/// A view out of the overlay, and its rectangle with it.
fn forget(overlay: &gtk::Overlay, view: &WebView) {
    AT.with(|a| a.borrow_mut().remove(view));
    overlay.remove(view);
}

fn main() -> Option<WebView> { MAIN.with(|m| m.borrow().clone()) }

fn with<R>(f: impl FnOnce(&mut Place) -> R) -> Option<R> { PLACE.with(|p| p.borrow_mut().as_mut().map(f)) }

fn handle(ask: Ask) {
    with(|p| match ask {
        Ask::Show { id, url, x, y, w, h } => {
            let zoom = main().map_or(1.0, |m| m.zoom_level()); // widget px from the page's CSS px
            let view = match p.tabs.get(&id) {
                Some(v) => v.clone(),
                None => {
                    let v = make(p, &id);
                    if web_url(&url) { v.load_uri(&url) }
                    p.tabs.insert(id, v.clone());
                    v
                }
            };
            // edges rounded, not the size: the view ends where the pane does
            let (l, t) = ((x * zoom).round(), (y * zoom).round());
            let (r, b) = (((x + w) * zoom).round().max(l + 1.0), ((y + h) * zoom).round().max(t + 1.0));
            let at = gtk::gdk::Rectangle::new(l as i32, t as i32, (r - l) as i32, (b - t) as i32);
            AT.with(|a| a.borrow_mut().insert(view.clone(), at));
            view.queue_resize();
            view.show();
        }
        Ask::Hide { id } => if let Some(v) = p.tabs.get(&id) { v.hide() },
        Ask::Go { id, url } => if let (Some(v), true) = (p.tabs.get(&id), web_url(&url)) { v.load_uri(&url) },
        Ask::Back { id } => if let Some(v) = p.tabs.get(&id) { v.go_back() },
        Ask::Forward { id } => if let Some(v) = p.tabs.get(&id) { v.go_forward() },
        Ask::Reload { id } => if let Some(v) = p.tabs.get(&id) { v.reload() },
        Ask::Close { id } => if let Some(v) = p.tabs.remove(&id) { forget(&p.overlay, &v) },
    });
}

/// Only the web: a page cannot have the app load a file:// or another scheme in a tab.
fn web_url(url: &str) -> bool { url.starts_with("https://") || url.starts_with("http://") }

/// A tab's view: the web tabs' own cookies and storage (kept, so a sign-in lasts; apart from the Atlas page, so a site
/// never holds the core's key), the ad blocking of the browsing windows, the keys above.
fn make(p: &mut Place, id: &str) -> WebView {
    let context = p.context.get_or_insert_with(context).clone();
    let ucm = UserContentManager::new();
    ucm.add_script(&UserScript::new(KEYS, UserContentInjectedFrames::TopFrame, UserScriptInjectionTime::Start, &[], &[]));
    ucm.register_script_message_handler("atlasWebKey");
    let view = WebView::builder().web_context(&context).user_content_manager(&ucm).build();
    if let Some(s) = WebViewExt::settings(&view) {
        s.set_enable_developer_extras(true);
        // two fingers sideways on the touchpad: back / forward, as in a browser; pinch zoom is WebKit's own
        s.set_enable_back_forward_navigation_gestures(true);
    }
    crate::browser::filter::apply(&view);
    let tell_id = id.to_string();
    ucm.connect_script_message_received(Some("atlasWebKey"), move |_, r| {
        let Some(what) = r.js_value().map(|v| javascriptcore::ValueExt::to_str(&v).to_string()) else { return };
        if ACTIONS.contains(&what.as_str()) {
            if let Some(m) = main() { m.grab_focus() }
            tell(&tell_id, serde_json::json!({ "action": what }));
        } else if let Some(chord) = what.strip_prefix("key:").and_then(|j| serde_json::from_str::<serde_json::Value>(j).ok()) {
            // a Super chord: Atlas runs the global command bound to it (Web.svelte), never a keystroke into a page
            if let Some(m) = main() { m.grab_focus() }
            tell(&tell_id, serde_json::json!({ "key": chord }));
        }
    });
    let tell_id = id.to_string();
    let seen = move |v: &WebView| {
        tell(&tell_id, serde_json::json!({ "url": v.uri().map(|u| u.to_string()), "title": v.title().map(|t| t.to_string()), "loading": v.is_loading(), "back": v.can_go_back(), "forward": v.can_go_forward() }));
    };
    let s = seen.clone();
    view.connect_uri_notify(move |v| s(v));
    let s = seen.clone();
    view.connect_title_notify(move |v| s(v));
    view.connect_load_changed(move |v, _| seen(v));
    // a link that wants a new window: a new tab of Atlas
    let tell_id = id.to_string();
    view.connect_create(move |_, action| {
        if let Some(url) = action.request().and_then(|r| r.uri()) {
            tell(&tell_id, serde_json::json!({ "open": url.to_string() }));
        }
        None
    });
    p.overlay.add_overlay(&view);
    view
}

/// The web tabs' data and cache folders, beside the app's own (XDG).
fn context() -> WebContext {
    let home = std::path::PathBuf::from(std::env::var_os("HOME").unwrap_or_default());
    let base = |var: &str, dflt: &str| std::env::var_os(var).map(std::path::PathBuf::from).unwrap_or_else(|| home.join(dflt)).join("atlas/web-tabs");
    let (data, cache) = (base("XDG_DATA_HOME", ".local/share"), base("XDG_CACHE_HOME", ".cache"));
    let manager = WebsiteDataManager::builder()
        .base_data_directory(data.to_string_lossy().as_ref())
        .base_cache_directory(cache.to_string_lossy().as_ref())
        .build();
    if let Some(c) = manager.cookie_manager() {
        let _ = std::fs::create_dir_all(&data);
        c.set_persistent_storage(&data.join("cookies.sqlite").to_string_lossy(), webkit2gtk::CookiePersistentStorage::Sqlite);
    }
    let context = WebContext::with_website_data_manager(&manager);
    // a browser's back / forward and some page cache, not a full browser's memory caches: every web tab shares this
    // context, and each is a WebKit process of its own
    context.set_cache_model(webkit2gtk::CacheModel::DocumentBrowser);
    context
}

/// An `atlas-web` event to the Web pane `id`.
fn tell(id: &str, mut detail: serde_json::Value) {
    detail["id"] = id.into();
    let js = format!("window.dispatchEvent(new CustomEvent('atlas-web',{{detail:{detail}}}))");
    #[allow(deprecated)] // evaluate_javascript needs WebKitGTK 2.40, as in main.rs
    if let Some(m) = main() { m.run_javascript(&js, None::<&gtk::gio::Cancellable>, |_| {}) }
}
