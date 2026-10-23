//! Opening things outside Atlas: a folder in the system's file manager, a URL in the system's browser.
use std::path::Path;
use std::process::Command;

/// Shows `abs` in the system's file manager, selected where the OS can. Err: nothing could open it, in words.
pub fn reveal(abs: &Path) -> Result<(), String> {
    if std::env::var_os("ATLAS_NO_BROWSER").is_some() {
        return Ok(()); // tests never touch the user's desktop
    }
    let folder = || if abs.is_dir() { abs.to_path_buf() } else { abs.parent().unwrap_or(abs).to_path_buf() };
    if cfg!(windows) {
        // explorer's exit code is 1 even when it worked: only a failure to start counts
        let mut arg = std::ffi::OsString::from("/select,");
        arg.push(abs);
        return Command::new("explorer").arg(arg).spawn().map(|_| ()).map_err(|e| format!("explorer did not start: {e}"));
    }
    if cfg!(target_os = "macos") {
        return Command::new("open").arg("-R").arg(abs).status().map(|_| ()).map_err(|e| format!("open -R did not start: {e}"));
    }
    // the freedesktop file manager interface (Dolphin, Nautilus, Thunar… answer it) shows the item selected
    let uri = format!("file://{}", abs.display());
    let dbus = Command::new("dbus-send")
        .args(["--session", "--dest=org.freedesktop.FileManager1", "--type=method_call", "/org/freedesktop/FileManager1", "org.freedesktop.FileManager1.ShowItems"])
        .arg(format!("array:string:{uri}"))
        .arg("string:")
        .status();
    if matches!(dbus, Ok(s) if s.success()) {
        return Ok(());
    }
    Command::new("xdg-open")
        .arg(folder())
        .spawn()
        .map(|_| ())
        .map_err(|_| "no file manager answered, and xdg-open (xdg-utils) is not installed to open the folder".to_string())
}

/// Opens `url` in the system's browser (or the program the OS gives that kind of link).
pub fn url(url: &str) -> Result<(), String> {
    let mut cmd = if cfg!(windows) {
        // `explorer <url>` hands it to the default handler; `cmd /c start` would parse `&` in the URL
        let mut c = Command::new("explorer");
        c.arg(url);
        c
    } else if cfg!(target_os = "macos") {
        let mut c = Command::new("open");
        c.arg(url);
        c
    } else {
        let mut c = Command::new("xdg-open");
        c.arg(url);
        c
    };
    cmd.spawn().map(|_| ()).map_err(|e| format!("could not open {url}: {e}"))
}
