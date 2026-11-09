//! KDE Plasma's tablet mode (a convertible folded back, or the switch in the system tray): while it is on, the
//! windows take the touch layout (`<html data-tablet>` → `data-touch`, ui/src/lib/touch.ts and styles/touch.css).
//! KWin publishes it as `org.kde.KWin.TabletModeManager.tabletMode`; on another desktop nothing happens.
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{AppHandle, Manager};

static ON: AtomicBool = AtomicBool::new(false);

/// The script that tells a page the current mode (run at each page load and at each change).
pub fn script() -> String {
    format!("document.documentElement.toggleAttribute('data-tablet', {}); dispatchEvent(new Event('atlas-tablet'));", ON.load(Ordering::SeqCst))
}

/// Follows KWin's tablet mode on a thread of its own, telling every window when it changes.
pub fn watch(app: AppHandle) {
    let _ = std::thread::Builder::new().name("tablet-mode".into()).spawn(move || {
        if let Err(e) = follow(&app) {
            eprintln!("atlas-app: KDE's tablet mode is not followed: {e}");
        }
    });
}

fn follow(app: &AppHandle) -> zbus::Result<()> {
    let conn = zbus::blocking::Connection::session()?;
    let kwin = zbus::blocking::Proxy::new(&conn, "org.kde.KWin", "/org/kde/KWin", "org.kde.KWin.TabletModeManager")?;
    // not KDE, or a machine that cannot fold: nothing to follow, nothing to say
    if !kwin.get_property::<bool>("tabletModeAvailable").unwrap_or(false) {
        return Ok(());
    }
    let changes = kwin.receive_property_changed::<bool>("tabletMode");
    set(app, kwin.get_property("tabletMode")?);
    for change in changes {
        if let Ok(on) = change.get() {
            set(app, on);
        }
    }
    Ok(())
}

fn set(app: &AppHandle, on: bool) {
    ON.store(on, Ordering::SeqCst);
    let js = script();
    for w in app.webview_windows().values() {
        let _ = w.eval(js.as_str());
    }
}
