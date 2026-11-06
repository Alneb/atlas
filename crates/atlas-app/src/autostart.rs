//! `[desktop] start_at_login`: the system's own entry that starts `atlas-app --background` with the session — an XDG
//! autostart file on Linux, the `Run` key on Windows, a LaunchAgent on macOS (DESIGN-tray-background.md, step 5).
//! Written or removed at each start and each save of the settings, so it always names the program running now.
use std::path::{Path, PathBuf};

/// The flag the entry starts Atlas with: core and tray, no window until asked.
pub const BACKGROUND: &str = "--background";

/// Makes the system's entry match `on`. Errors are said, never fatal.
pub fn apply(on: bool) {
    let Ok(exe) = std::env::current_exe() else { return };
    // an AppImage runs from a temporary mount: the entry must name the AppImage file itself
    let exe = std::env::var_os("APPIMAGE").map(PathBuf::from).unwrap_or(exe);
    if let Err(e) = write(on, &exe) {
        eprintln!("atlas-app: starting with the session not {}: {e}", if on { "set" } else { "removed" });
    }
}

#[cfg(all(unix, not(target_os = "macos")))]
fn write(on: bool, exe: &Path) -> std::io::Result<()> {
    let dir = std::env::var_os("XDG_CONFIG_HOME").map(PathBuf::from).or_else(|| std::env::var_os("HOME").map(|h| PathBuf::from(h).join(".config")));
    let Some(dir) = dir else { return Ok(()) };
    let file = dir.join("autostart").join("atlas.desktop");
    if !on {
        return match std::fs::remove_file(&file) {
            Err(e) if e.kind() != std::io::ErrorKind::NotFound => Err(e),
            _ => Ok(()),
        };
    }
    std::fs::create_dir_all(file.parent().unwrap())?;
    let text = desktop_entry(exe);
    if std::fs::read_to_string(&file).is_ok_and(|t| t == text) {
        return Ok(());
    }
    std::fs::write(&file, text)
}

/// The XDG autostart entry (KDE, GNOME, XFCE, Cinnamon read `~/.config/autostart/`).
#[cfg_attr(any(windows, target_os = "macos"), allow(dead_code))]
fn desktop_entry(exe: &Path) -> String {
    let quoted = format!("\"{}\"", exe.display().to_string().replace('\\', "\\\\").replace('"', "\\\""));
    format!(
        "[Desktop Entry]\nType=Application\nName=Atlas\nComment=Atlas in the tray: schedules and notifications from the start of the session\nExec={quoted} {BACKGROUND}\nIcon=atlas\nTerminal=false\nX-GNOME-Autostart-enabled=true\nX-KDE-autostart-after=panel\n"
    )
}

#[cfg(windows)]
fn write(on: bool, exe: &Path) -> std::io::Result<()> {
    use std::os::windows::process::CommandExt;
    const NO_WINDOW: u32 = 0x0800_0000;
    let key = r"HKCU\Software\Microsoft\Windows\CurrentVersion\Run";
    let mut cmd = std::process::Command::new("reg");
    if on {
        cmd.args(["add", key, "/v", "Atlas", "/t", "REG_SZ", "/f", "/d"]).arg(format!("\"{}\" {BACKGROUND}", exe.display()));
    } else {
        cmd.args(["delete", key, "/v", "Atlas", "/f"]);
    }
    let out = cmd.creation_flags(NO_WINDOW).output()?;
    // deleting a value that is not there fails: nothing to remove
    if on && !out.status.success() {
        return Err(std::io::Error::other(String::from_utf8_lossy(&out.stderr).trim().to_string()));
    }
    Ok(())
}

#[cfg(target_os = "macos")]
fn write(on: bool, exe: &Path) -> std::io::Result<()> {
    let Some(home) = std::env::var_os("HOME") else { return Ok(()) };
    let file = PathBuf::from(home).join("Library/LaunchAgents/org.atlas.app.plist");
    if !on {
        return match std::fs::remove_file(&file) {
            Err(e) if e.kind() != std::io::ErrorKind::NotFound => Err(e),
            _ => Ok(()),
        };
    }
    std::fs::create_dir_all(file.parent().unwrap())?;
    let esc = |s: &str| s.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;");
    let text = format!(
        "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<!DOCTYPE plist PUBLIC \"-//Apple//DTD PLIST 1.0//EN\" \"http://www.apple.com/DTDs/PropertyList-1.0.dtd\">\n<plist version=\"1.0\"><dict>\n  <key>Label</key><string>org.atlas.app</string>\n  <key>ProgramArguments</key><array><string>{}</string><string>{BACKGROUND}</string></array>\n  <key>RunAtLoad</key><true/>\n  <key>ProcessType</key><string>Interactive</string>\n</dict></plist>\n",
        esc(&exe.display().to_string())
    );
    std::fs::write(&file, text)
}

#[cfg(test)]
mod tests {
    #[test]
    fn the_autostart_entry_starts_this_program_in_the_background_quoted() {
        let e = super::desktop_entry(std::path::Path::new("/opt/My Apps/atlas-app"));
        assert!(e.contains("Exec=\"/opt/My Apps/atlas-app\" --background\n"), "{e}");
        assert!(e.starts_with("[Desktop Entry]\nType=Application\n"));
    }
}
