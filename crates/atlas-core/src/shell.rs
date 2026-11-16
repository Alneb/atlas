//! What the core asks of the desktop shell around it (atlas-app), through hooks the shell sets once at start: bring its
//! window forward (a notification's click, a second launch, the tray), hear that a vault's settings were saved, and
//! forget the websites' data its web tabs and browsing windows keep.
//! A core with no window around it (`atlas serve`, tests, the phone) leaves them unset and every call is a no-op.
//! docs/design/DESIGN-tray-background.md, "One way to bring Atlas forward".
use crate::config::Config;
use std::path::{Path, PathBuf};
use std::sync::OnceLock;

/// A request to show the window: on `vault`'s page, opening `open` (a vault path) once it is there.
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct Show {
    /// The vault the request is about; None: whichever the window shows.
    pub vault: Option<PathBuf>,
    pub open: Option<String>,
}

type ShowHook = Box<dyn Fn(Show) + Send + Sync>;
type ConfigHook = Box<dyn Fn(&Path, &Config) + Send + Sync>;
/// Hears how many sites' data was forgotten, or why not.
pub type Forgotten = Box<dyn FnOnce(Result<usize, String>) + Send>;
type ForgetHook = Box<dyn Fn(Forgotten) + Send + Sync>;
static SHOW: OnceLock<ShowHook> = OnceLock::new();
static CONFIG: OnceLock<ConfigHook> = OnceLock::new();
static FORGET: OnceLock<ForgetHook> = OnceLock::new();

/// The shell's way of showing its window. Set once; a second call is ignored.
pub fn on_show(f: impl Fn(Show) + Send + Sync + 'static) {
    let _ = SHOW.set(Box::new(f));
}

/// Shows the shell's window; false when there is no shell (nothing to bring forward).
pub fn show(s: Show) -> bool {
    match SHOW.get() {
        Some(f) => {
            f(s);
            true
        }
        None => false,
    }
}

/// Whether a shell is around this core.
pub fn present() -> bool {
    SHOW.get().is_some()
}

/// The shell hears each vault's settings once saved (`[desktop]` applies at once).
pub fn on_config(f: impl Fn(&Path, &Config) + Send + Sync + 'static) {
    let _ = CONFIG.set(Box::new(f));
}

pub fn config_saved(root: &Path, cfg: &Config) {
    if let Some(f) = CONFIG.get() {
        f(root, cfg);
    }
}

/// The shell's way of forgetting every website's cookies, storage and cache (never Atlas's own). Set once.
pub fn on_forget_web_data(f: impl Fn(Forgotten) + Send + Sync + 'static) {
    let _ = FORGET.set(Box::new(f));
}

/// Asks the shell to forget the websites' data; false when no shell can (no window, or a platform without it).
pub fn forget_web_data(done: Forgotten) -> bool {
    match FORGET.get() {
        Some(f) => {
            f(done);
            true
        }
        None => false,
    }
}

/// Body of `POST /api/shell/show`: what a second launch of the app asks of the first.
#[derive(Debug, Default, serde::Deserialize)]
pub struct ShowRequest {
    #[serde(default)]
    pub open: Option<String>,
}
