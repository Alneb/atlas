//! Where Linux, macOS and Windows differ (docs/design/DESIGN-desktop-ports.md): folders, processes, opening things
//! outside Atlas, and starting a command line. Every caller goes through here; nothing else in the core branches on
//! the operating system.
pub mod dirs;
pub mod open;
pub mod proc;
pub mod run_line;

/// Where a core runs, as a plugin manifest names it (`[platforms]`): a desktop system, the phone app, or a server
/// (`atlas serve`: no window, many devices, whatever the system under it).
#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, serde::Serialize, serde::Deserialize, ts_rs::TS)]
#[serde(rename_all = "lowercase")]
#[ts(export)]
pub enum Platform {
    Linux,
    Macos,
    Windows,
    Android,
    Server,
}

static SERVER: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);

impl Platform {
    pub const ALL: [Platform; 5] = [Platform::Linux, Platform::Macos, Platform::Windows, Platform::Android, Platform::Server];

    /// Where this core runs: the server once server mode started (`mark_server`), else the system it was built for.
    pub fn current() -> Platform {
        if SERVER.load(std::sync::atomic::Ordering::Relaxed) { Platform::Server } else { Platform::os() }
    }

    /// The system this core was built for.
    pub const fn os() -> Platform {
        if cfg!(target_os = "android") {
            Platform::Android
        } else if cfg!(target_os = "windows") {
            Platform::Windows
        } else if cfg!(target_os = "macos") {
            Platform::Macos
        } else {
            Platform::Linux
        }
    }

    /// Server mode started in this process (server.rs): from now on the core is a server, not a desktop.
    pub fn mark_server() {
        SERVER.store(true, std::sync::atomic::Ordering::Relaxed);
    }

    pub const fn name(self) -> &'static str {
        match self {
            Platform::Linux => "Linux",
            Platform::Macos => "macOS",
            Platform::Windows => "Windows",
            Platform::Android => "Android",
            Platform::Server => "a server",
        }
    }
}

/// How well a plugin runs on a platform. Only `No` stops it there; `Untested` runs and says so in Settings.
#[derive(Clone, Copy, Debug, PartialEq, Eq, serde::Serialize, serde::Deserialize, ts_rs::TS)]
#[serde(rename_all = "lowercase")]
#[ts(export)]
pub enum Support {
    Works,
    Untested,
    No,
}

/// A plugin's word on one platform: its support and, optionally, why (what it needs, what is missing there).
#[derive(Clone, Debug, PartialEq, Eq, serde::Serialize, ts_rs::TS)]
#[ts(export)]
pub struct Compat {
    pub platform: Platform,
    pub support: Support,
    #[ts(optional)]
    pub why: Option<String>,
}
