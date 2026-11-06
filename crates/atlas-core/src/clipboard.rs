//! The desktop clipboard's picture, for a paste the web view hands over without it. WebKitGTK's paste-as-plain-text
//! (Ctrl+Shift+V, the paste key in Vim mode) gives the page an empty `text/plain` and no files even when a screenshot
//! is on the clipboard, so the page asks here instead (ui/src/lib/attach.ts). Read with the session's own tools:
//! `wl-paste` under Wayland, `xclip` under X11; on macOS and Windows the system's clipboard through `arboard` (their
//! web views hand a pasted picture over themselves; this is the same answer when the page asks). A core with no display
//! (a server) has no clipboard and answers nothing.
#[cfg(not(any(target_os = "macos", windows)))]
use std::process::Stdio;
#[cfg(not(any(target_os = "macos", windows)))]
use std::time::Duration;
#[cfg(not(any(target_os = "macos", windows)))]
use tokio::process::Command;

/// The command that reads one type off the clipboard.
#[cfg(not(any(target_os = "macos", windows)))]
type ReadCmd = fn(&str) -> Vec<String>;

/// How long a clipboard tool may take: the owner of the clipboard answers it, and a stuck one must not hang a paste.
#[cfg(not(any(target_os = "macos", windows)))]
const WAIT: Duration = Duration::from_secs(3);

/// The picture on the clipboard as a PNG, or None (no picture).
#[cfg(any(target_os = "macos", windows))]
pub async fn image() -> Option<(String, Vec<u8>)> {
    tokio::task::spawn_blocking(|| {
        let img = arboard::Clipboard::new().ok()?.get_image().ok()?;
        let rgba = image::RgbaImage::from_raw(u32::try_from(img.width).ok()?, u32::try_from(img.height).ok()?, img.bytes.into_owned())?;
        let mut png = std::io::Cursor::new(Vec::new());
        rgba.write_to(&mut png, image::ImageFormat::Png).ok()?;
        Some(("image/png".to_string(), png.into_inner()))
    })
    .await
    .ok()
    .flatten()
}

/// The picture on the clipboard: (its type, its bytes), or None (no display, no tool, no picture).
#[cfg(not(any(target_os = "macos", windows)))]
pub async fn image() -> Option<(String, Vec<u8>)> {
    let wayland = std::env::var_os("WAYLAND_DISPLAY").is_some();
    if !wayland && std::env::var_os("DISPLAY").is_none() {
        return None;
    }
    let (list, read): (&[&str], ReadCmd) = if wayland {
        (&["wl-paste", "--list-types"], |t| vec!["wl-paste".into(), "--no-newline".into(), "--type".into(), t.into()])
    } else {
        (&["xclip", "-selection", "clipboard", "-t", "TARGETS", "-o"], |t| vec!["xclip".into(), "-selection".into(), "clipboard".into(), "-t".into(), t.into(), "-o".into()])
    };
    let types = String::from_utf8(run(list).await?).ok()?;
    let ty = pick(&types)?;
    let args = read(&ty);
    let bytes = run(&args.iter().map(String::as_str).collect::<Vec<_>>()).await?;
    (!bytes.is_empty()).then_some((ty, bytes))
}

/// The picture type to read from a clipboard's list of types: PNG when offered (screenshots), else the first image.
#[cfg_attr(any(target_os = "macos", windows), allow(dead_code))]
fn pick(types: &str) -> Option<String> {
    let images: Vec<&str> = types.lines().map(str::trim).filter(|t| t.starts_with("image/")).collect();
    images.iter().find(|t| **t == "image/png").or(images.first()).map(|t| t.to_string())
}

#[cfg(not(any(target_os = "macos", windows)))]
async fn run(args: &[&str]) -> Option<Vec<u8>> {
    let child = Command::new(args[0]).args(&args[1..]).stdin(Stdio::null()).stdout(Stdio::piped()).stderr(Stdio::null()).kill_on_drop(true).spawn().ok()?;
    let out = tokio::time::timeout(WAIT, child.wait_with_output()).await.ok()?.ok()?;
    out.status.success().then_some(out.stdout)
}

#[cfg(test)]
mod tests {
    use super::pick;

    #[test]
    fn png_first_then_any_picture_never_text() {
        assert_eq!(pick("text/plain\nimage/jpeg\nimage/png\n").as_deref(), Some("image/png"));
        assert_eq!(pick("TARGETS\nimage/bmp\nimage/jpeg").as_deref(), Some("image/bmp"));
        assert_eq!(pick("text/plain;charset=utf-8\nUTF8_STRING\ntext/uri-list"), None);
    }
}
