//! Browsing windows: a link to a web page opens in a window of Atlas,
//! with ads and trackers blocked by WebKit's own content blocker, fed by `web_filters` (EasyList,
//! EasyPrivacy, uBlock Origin's list, converted). WebKitGTK runs no extensions, so this is the blocking, not uBlock's
//! panel. Keys, from a small script in every page: Alt+← / Alt+→ back / forward, Super+Shift+O the page in the desktop's
//! browser (Super: Atlas's own action, docs/guides/KEYS.md; Super+O is the outline), Ctrl+W close, F5 / Ctrl+R reload (a browser's usual keys). docs/WEB-WINDOWS.md.
use atlas_core::config::WebConfig;
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

/// The keys a browsing window adds to every page. Actions leave the page as an `atlas-browser:` address, which the
/// window catches in `on_navigation` (a page cannot reach the app any other way).
const KEYS: &str = r#"
// Super as ui/src/lib/keys.ts reads it: WebKitGTK on Wayland may say metaKey false, so a Super key seen going down counts
let superHeld = false;
const track = (down) => (e) => { if (/^(Meta|Super|OS)/.test(e.key) || /^(Meta|Super|OS)/.test(e.code)) superHeld = down; };
addEventListener("keydown", track(true), true);
addEventListener("keyup", track(false), true);
addEventListener("blur", () => { superHeld = false; });
addEventListener("keydown", (e) => {
  const go = (what) => { e.preventDefault(); e.stopImmediatePropagation(); location.href = "atlas-browser:" + what + "?" + encodeURIComponent(location.href); };
  if (e.altKey && e.key === "ArrowLeft") { e.preventDefault(); history.back(); }
  else if (e.altKey && e.key === "ArrowRight") { e.preventDefault(); history.forward(); }
  else if ((e.metaKey || superHeld || e.getModifierState("Super") || e.getModifierState("OS")) && e.shiftKey && !e.ctrlKey && e.key.toLowerCase() === "o") go("outside");
  else if (e.ctrlKey && !e.shiftKey && e.key.toLowerCase() === "w") go("close");
  else if (e.key === "F5" || (e.ctrlKey && !e.shiftKey && e.key.toLowerCase() === "r")) { e.preventDefault(); location.reload(); }
}, true);
"#;

/// A web page in a browsing window of its own.
pub fn open(app: &AppHandle, url: tauri::Url, outside: fn(&str)) {
    static N: std::sync::atomic::AtomicUsize = std::sync::atomic::AtomicUsize::new(0);
    let label = format!("web-{}", N.fetch_add(1, std::sync::atomic::Ordering::Relaxed));
    let (app2, label2, app3) = (app.clone(), label.clone(), app.clone());
    let built = WebviewWindowBuilder::new(app, &label, WebviewUrl::External(url.clone()))
        .title(url.host_str().unwrap_or("Web"))
        .inner_size(1180.0, 860.0)
        .initialization_script(KEYS)
        .disable_drag_drop_handler() // a file dropped on a web page reaches it (an upload, a mail's attachment)
        .on_document_title_changed(|w, title| {
            let _ = w.set_title(&if title.is_empty() { "Web".into() } else { title });
        })
        .on_navigation(move |to| {
            if to.scheme() != "atlas-browser" {
                return true;
            }
            let page = to.query().map(percent_decode).unwrap_or_default();
            match to.path() {
                "outside" => outside(&page),
                "close" => {
                    if let Some(w) = app2.get_webview_window(&label2) {
                        let _ = w.close();
                    }
                }
                _ => {}
            }
            false
        })
        // a link that asks for a new window: another browsing window (a sign-in popup included)
        .on_new_window(move |to, _| {
            open(&app3, to, outside);
            tauri::webview::NewWindowResponse::Deny
        })
        .build();
    match built {
        #[cfg(target_os = "linux")]
        Ok(w) => {
            let _ = w.with_webview(|v| filter::apply(&v.inner()));
        }
        #[cfg(not(target_os = "linux"))]
        Ok(_) => {}
        Err(e) => {
            eprintln!("atlas-app: no browsing window ({e}); the browser instead");
            outside(url.as_str());
        }
    }
}

fn percent_decode(s: &str) -> String {
    let b = s.as_bytes();
    let (mut out, mut i) = (Vec::with_capacity(b.len()), 0);
    while i < b.len() {
        match (b[i], b.get(i + 1..i + 3).and_then(|h| u8::from_str_radix(std::str::from_utf8(h).ok()?, 16).ok())) {
            (b'%', Some(v)) => { out.push(v); i += 3; }
            (c, _) => { out.push(c); i += 1; }
        }
    }
    String::from_utf8_lossy(&out).into_owned()
}

/// Prepare the blocking rules once per run, off the main thread (fetching and converting the lists takes seconds the
/// first time); windows opened before they are ready get them as soon as they are.
#[cfg(target_os = "linux")]
pub fn prepare(app: &AppHandle, web: WebConfig) {
    let app = app.clone();
    std::thread::spawn(move || match crate::web_filters::rules(&web) {
        Ok(Some(rules)) => {
            let n = rules.count.map_or("the kept".into(), |n| n.to_string());
            eprintln!("atlas-app: ad blocking — {n} rules ({})", rules.report.join("; "));
            let _ = app.run_on_main_thread(move || filter::compile(rules.id, rules.path));
        }
        Ok(None) => {
            eprintln!("atlas-app: ad blocking off (web.block_ads, or no filter list could be had)");
            let _ = app.run_on_main_thread(filter::off);
        }
        Err(e) => eprintln!("atlas-app: ad blocking not prepared: {e}"),
    });
}

/// The rules are WebKitGTK's content filters: WebView2 and WKWebView would need a blocker of their own.
#[cfg(not(target_os = "linux"))]
pub fn prepare(_app: &AppHandle, _web: WebConfig) {
    eprintln!("atlas-app: ad blocking is not built for this platform yet");
}

/// WebKitGTK's content filter store, through its C API (the Rust bindings stop short of it). Everything here runs on
/// the GTK main thread, so the state is a thread-local.
#[cfg(target_os = "linux")]
pub(crate) mod filter {
    use std::cell::RefCell;
    use std::ffi::CString;
    use std::path::PathBuf;
    use webkit2gtk::glib::translate::ToGlibPtr;
    use webkit2gtk_sys as wk;

    enum State {
        /// Rules not compiled yet: the windows that wait for them (each holds a reference); they reload once filtered.
        Waiting(Vec<*mut wk::WebKitWebView>),
        Ready(*mut wk::WebKitUserContentFilter),
        Off,
    }
    thread_local! { static STATE: RefCell<State> = const { RefCell::new(State::Waiting(Vec::new())) }; }

    pub fn apply(view: &webkit2gtk::WebView) {
        let v: *mut wk::WebKitWebView = view.to_glib_none().0;
        STATE.with(|s| match &mut *s.borrow_mut() {
            State::Ready(f) => unsafe { add(v, *f) },
            State::Waiting(list) => list.push(unsafe { gobject_sys::g_object_ref(v.cast()) }.cast()),
            State::Off => {}
        });
    }

    unsafe fn add(v: *mut wk::WebKitWebView, f: *mut wk::WebKitUserContentFilter) {
        let m = wk::webkit_web_view_get_user_content_manager(v);
        if !m.is_null() {
            wk::webkit_user_content_manager_add_filter(m, f);
        }
    }

    pub fn off() {
        STATE.with(|s| {
            if let State::Waiting(list) = std::mem::replace(&mut *s.borrow_mut(), State::Off) {
                for v in list {
                    unsafe { gobject_sys::g_object_unref(v.cast()) };
                }
            }
        });
    }

    fn ready(filter: *mut wk::WebKitUserContentFilter) {
        STATE.with(|s| {
            if let State::Waiting(list) = std::mem::replace(&mut *s.borrow_mut(), State::Ready(filter)) {
                // a page that loaded before the rules did is loaded again, filtered
                for v in list {
                    unsafe {
                        add(v, filter);
                        wk::webkit_web_view_reload(v);
                        gobject_sys::g_object_unref(v.cast());
                    }
                }
            }
        });
    }

    struct Job {
        store: *mut wk::WebKitUserContentFilterStore,
        id: CString,
        json: PathBuf,
    }

    /// Load the compiled rules named `id` from the store; compile them from `json` the first time.
    pub fn compile(id: String, json: PathBuf) {
        let dir = CString::new(crate::web_filters::cache_dir().join("compiled").to_string_lossy().as_bytes()).unwrap_or_default();
        let Ok(cid) = CString::new(id) else { return off() };
        let store = unsafe { wk::webkit_user_content_filter_store_new(dir.as_ptr()) };
        let job = Box::into_raw(Box::new(Job { store, id: cid, json }));
        unsafe { wk::webkit_user_content_filter_store_load(store, (*job).id.as_ptr(), std::ptr::null_mut(), Some(loaded), job.cast()) };
    }

    unsafe extern "C" fn loaded(_: *mut gobject_sys::GObject, res: *mut gio_sys::GAsyncResult, data: glib_sys::gpointer) {
        let job = data as *mut Job;
        let mut err = std::ptr::null_mut();
        let f = wk::webkit_user_content_filter_store_load_finish((*job).store, res, &mut err);
        if !f.is_null() {
            return done(job, f, "kept");
        }
        if !err.is_null() {
            glib_sys::g_error_free(err);
        }
        // not compiled yet (or the store was cleared): compile from the JSON, which takes a few seconds
        let path = CString::new((*job).json.to_string_lossy().as_bytes()).unwrap_or_default();
        let file = gio_sys::g_file_new_for_path(path.as_ptr());
        wk::webkit_user_content_filter_store_save_from_file((*job).store, (*job).id.as_ptr(), file, std::ptr::null_mut(), Some(saved), job.cast());
        gobject_sys::g_object_unref(file.cast());
    }

    unsafe extern "C" fn saved(_: *mut gobject_sys::GObject, res: *mut gio_sys::GAsyncResult, data: glib_sys::gpointer) {
        let job = data as *mut Job;
        let mut err = std::ptr::null_mut();
        let f = wk::webkit_user_content_filter_store_save_finish((*job).store, res, &mut err);
        if f.is_null() {
            let why = if err.is_null() { "no reason given".into() } else { std::ffi::CStr::from_ptr((*err).message).to_string_lossy().into_owned() };
            eprintln!("atlas-app: ad blocking rules did not compile: {why}");
            if !err.is_null() {
                glib_sys::g_error_free(err);
            }
            gobject_sys::g_object_unref((*job).store.cast());
            drop(Box::from_raw(job));
            return off();
        }
        done(job, f, "compiled");
    }

    unsafe fn done(job: *mut Job, f: *mut wk::WebKitUserContentFilter, how: &str) {
        eprintln!("atlas-app: ad blocking ready ({how})");
        gobject_sys::g_object_unref((*job).store.cast());
        drop(Box::from_raw(job));
        ready(f); // kept for the run: every browsing window shares it
    }
}
