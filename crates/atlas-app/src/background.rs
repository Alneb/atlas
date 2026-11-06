//! Atlas living on behind its window (docs/design/DESIGN-tray-background.md): closing the window hides it, the tray
//! brings it back, a window hidden long enough is closed to give its page's memory back ("asleep") and built again when
//! shown; the core, its schedules and its notifications run on throughout. One [`Shell`] per process.
use crate::tray::{Model, TrayAction, Unseen};
use atlas_core::config::{Config, OnClose};
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Manager, WebviewWindow};

/// A tray drawer: shows the model (the menu, the tooltip, the attention icon). tray_sni.rs, tray_tauri.rs.
pub trait TrayView: Send + Sync {
    fn draw(&self, m: &Model);
}

/// Builds the main window on this vault's page, opening a note there first when asked (main.rs `MainWindow`).
pub type OpenMain = Box<dyn Fn(&AppHandle, Option<&str>) -> tauri::Result<WebviewWindow> + Send + Sync>;

struct State {
    model: Model,
    /// Since when the window is hidden (for the sleep); None while shown or asleep.
    hidden_since: Option<Instant>,
    /// The window was closed by us (asleep, or started in the background): the app must not exit for it.
    asleep: bool,
    /// The tray icon is on screen (a tray host answered).
    tray_on: bool,
    /// "Atlas keeps running in the tray" said already in this run.
    told: bool,
}

pub struct Shell {
    app: AppHandle,
    vault: PathBuf,
    core: String,
    open_main: OpenMain,
    state: Mutex<State>,
    tray: Mutex<Option<Arc<dyn TrayView>>>,
}

const MAIN: &str = "main";

impl Shell {
    pub fn new(app: AppHandle, vault: PathBuf, core: String, open_main: OpenMain) -> Arc<Self> {
        let name = vault.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
        let model = Model { vault: name, shown: true, quiet: atlas_core::notify::quiet(), ..Model::default() };
        Arc::new(Self { app, vault, core, open_main, state: Mutex::new(State { model, hidden_since: None, asleep: false, tray_on: false, told: false }), tray: Mutex::new(None) })
    }

    /// The tray's state now (what a drawer starts from).
    pub fn model(&self) -> Model {
        self.state.lock().unwrap().model.clone()
    }

    pub fn set_tray(&self, view: Arc<dyn TrayView>) {
        *self.tray.lock().unwrap() = Some(view);
        self.redraw();
    }

    /// The tray host is there (or went away): without one, closing quits (a hidden window could not be brought back).
    pub fn tray_online(&self, on: bool) {
        self.state.lock().unwrap().tray_on = on;
    }

    fn desktop(&self) -> atlas_core::config::DesktopConfig {
        Config::load(&self.vault).map(|c| c.desktop).unwrap_or_default()
    }

    fn window(&self) -> Option<WebviewWindow> {
        self.app.get_webview_window(MAIN)
    }

    fn redraw(&self) {
        let model = self.state.lock().unwrap().model.clone();
        if let Some(t) = self.tray.lock().unwrap().clone() {
            t.draw(&model);
        }
    }

    /// Brings the window forward — built again if asleep, opening `open` in it — and marks the notices read.
    pub fn show(self: &Arc<Self>, open: Option<String>) {
        let me = self.clone();
        let _ = self.app.run_on_main_thread(move || {
            match me.window() {
                Some(w) => {
                    let _ = w.show();
                    let _ = w.unminimize();
                    let _ = w.set_focus();
                    // a live page opens `open` from the core's Open event
                }
                None => {
                    if let Err(e) = (me.open_main)(&me.app, open.as_deref()) {
                        eprintln!("atlas-app: the window could not be opened again: {e}");
                        return;
                    }
                }
            }
            {
                let mut s = me.state.lock().unwrap();
                s.hidden_since = None;
                s.asleep = false;
                s.model.shown = true;
                s.model.mark_read();
            }
            me.redraw();
        });
    }

    /// Hides the window; Atlas runs on in the tray.
    pub fn hide(self: &Arc<Self>) {
        if let Some(w) = self.window() {
            let _ = w.hide();
        }
        {
            let mut s = self.state.lock().unwrap();
            s.hidden_since = Some(Instant::now());
            s.model.shown = false;
        }
        self.redraw();
    }

    /// What closing the window does: true when it was hidden instead (the close is to be prevented).
    pub fn close_requested(self: &Arc<Self>) -> bool {
        let tray_on = self.state.lock().unwrap().tray_on;
        if !tray_on || self.desktop().on_close == OnClose::Quit {
            return false;
        }
        self.hide();
        let first = !std::mem::replace(&mut self.state.lock().unwrap().told, true);
        if first {
            let core = self.core.clone();
            tauri::async_runtime::spawn(async move {
                let body = r#"{"args":{"title":"Atlas keeps running in the tray","body":"Its schedules and notifications go on. Quit from the tray icon's menu, or choose Quit in Settings → Desktop app."}}"#;
                if let Err(e) = crate::post(&core, "/api/cmd/notify", body).await {
                    eprintln!("atlas-app: {e}");
                }
            });
        }
        true
    }

    /// The app is about to exit because its last window closed: kept alive when we closed it (asleep).
    pub fn keeps_running(&self) -> bool {
        self.state.lock().unwrap().asleep
    }

    /// Started with `--background`: no window until it is asked for; the tray is the way in.
    pub fn start_asleep(&self) {
        let mut s = self.state.lock().unwrap();
        s.asleep = true;
        s.model.shown = false;
    }

    pub fn act(self: &Arc<Self>, a: TrayAction) {
        match a {
            TrayAction::Show => self.show(None),
            TrayAction::Hide => self.hide(),
            TrayAction::Capture => quick_capture(&self.vault),
            TrayAction::OpenNotice(i) => {
                let open = self.state.lock().unwrap().model.unseen.get(i).and_then(|u| u.open.clone());
                if let Some(path) = &open {
                    // a live page opens it from the core (the same way a notification's click does)
                    let (core, body) = (self.core.clone(), serde_json::json!({ "args": { "path": path } }).to_string());
                    tauri::async_runtime::spawn(async move {
                        let _ = crate::post(&core, "/api/cmd/open", &body).await;
                    });
                }
                self.show(open);
            }
            TrayAction::MarkRead => {
                self.state.lock().unwrap().model.mark_read();
                self.redraw();
            }
            TrayAction::ToggleQuiet => {
                let on = !atlas_core::notify::quiet();
                atlas_core::notify::set_quiet(on);
                self.state.lock().unwrap().model.quiet = on;
                self.redraw();
            }
            TrayAction::Quit => self.app.exit(0),
        }
    }

    /// The left click on the icon: hide a shown window, show a hidden or asleep one.
    pub fn toggle(self: &Arc<Self>) {
        let shown = self.window().is_some_and(|w| w.is_visible().unwrap_or(false));
        if shown {
            self.hide()
        } else {
            self.show(None)
        }
    }

    /// The window took the focus: the notices waiting in the tray are seen.
    pub fn looked_at(&self) {
        let changed = {
            let mut s = self.state.lock().unwrap();
            let had = s.model.attention();
            s.model.mark_read();
            had
        };
        if changed {
            self.redraw();
        }
    }

    /// Every notice of this process (notify.rs `on_notice`): one nobody looked at waits in the tray.
    pub fn notice(&self, n: &atlas_core::api::Notice, looked_at: bool) {
        if looked_at {
            return;
        }
        self.state.lock().unwrap().model.add_unseen(Unseen { title: n.title.clone(), source: n.source.clone(), open: atlas_core::notify::opens(n).map(str::to_string) });
        self.redraw();
    }

    /// Closes a window hidden for `[desktop] sleep_after_min` minutes, checked every half minute.
    pub fn watch_sleep(self: &Arc<Self>) {
        let me = self.clone();
        std::thread::Builder::new()
            .name("atlas-sleep".into())
            .spawn(move || loop {
                std::thread::sleep(Duration::from_secs(30));
                let minutes = me.desktop().sleep_after_min;
                let due = {
                    let s = me.state.lock().unwrap();
                    minutes > 0 && s.hidden_since.is_some_and(|t| t.elapsed() >= Duration::from_secs(u64::from(minutes) * 60))
                };
                if due {
                    me.sleep();
                }
            })
            .expect("a thread for the window's sleep");
    }

    fn sleep(self: &Arc<Self>) {
        {
            let mut s = self.state.lock().unwrap();
            s.asleep = true;
            s.hidden_since = None;
        }
        let me = self.clone();
        let _ = self.app.run_on_main_thread(move || {
            if let Some(w) = me.window() {
                eprintln!("atlas-app: the hidden window is closed to free its memory; Atlas runs on in the tray");
                let _ = w.destroy();
            }
        });
    }
}

/// The capture box, as its key starts it (it files through this process's core: vaults::running_server).
/// The native box (atlas-capture, beside this program in every package) when there is one, else this program's web box.
fn quick_capture(vault: &std::path::Path) {
    let Ok(me) = std::env::current_exe() else { return };
    let mut cmd = match crate::capture_box() {
        Some(native) => std::process::Command::new(native),
        None => {
            let mut c = std::process::Command::new(me);
            c.arg("--capture");
            c
        }
    };
    if let Err(e) = cmd.arg(vault).spawn() {
        eprintln!("atlas-app: the capture box did not start: {e}");
    }
}
