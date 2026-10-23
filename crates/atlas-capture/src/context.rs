//! What the box can add besides the text (docs/guides/CAPTURE.md, "Besides the text"): the page of the browser you were on, the
//! clipboard, the last screenshot, the screen as it is now. Each is read in the background when the box opens and none can
//! fail the box: whatever is not there is simply not offered.
use anyhow::{bail, Context as _, Result};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant, SystemTime};

/// The window that had the focus before the box, as KWin names it.
#[derive(Clone, Debug, PartialEq)]
pub struct Window {
    pub caption: String,
    pub class: String,
    /// KWin's id for it (`{uuid}`), to take its picture; empty when not known.
    pub id: String,
}

/// A browser's page: its address and title.
#[derive(Clone, Debug, PartialEq)]
pub struct Page {
    pub url: String,
    pub title: String,
}

impl Page {
    /// As it goes into the note: a Markdown link titled like the tab.
    pub fn markdown(&self) -> String {
        let title = self.title.replace(['[', ']'], "");
        if title.trim().is_empty() {
            self.url.clone()
        } else if self.url.is_empty() {
            title.trim().to_string() // a song from a local file: its name, no link
        } else {
            format!("[{}]({})", title.trim(), self.url)
        }
    }
}

#[derive(Clone, Debug, PartialEq)]
pub enum Clip {
    Text(String),
    /// A picture on the clipboard (a screenshot copied, an image copied from a page), written to a file.
    Image(PathBuf),
}

/// Where this box keeps what it takes (the screen, a copied picture): the session's runtime folder, removed on exit.
pub fn scratch() -> PathBuf {
    let base = std::env::var_os("XDG_RUNTIME_DIR").map(PathBuf::from).unwrap_or_else(std::env::temp_dir);
    base.join(format!("atlas-capture-{}", std::process::id()))
}

/// What is playing (MPRIS: a music player, a browser's video through Plasma's integration): the first player that
/// says "Playing" — else one "Paused" (paused to capture it) — as a page: the song or video by its artist and title,
/// linked when the player gives a web address.
pub fn playing() -> Option<Page> {
    use dbus::arg::{PropMap, RefArg};
    use dbus::blocking::stdintf::org_freedesktop_dbus::Properties;
    use dbus::blocking::Connection;
    let conn = Connection::new_session().ok()?;
    let bus = conn.with_proxy("org.freedesktop.DBus", "/org/freedesktop/DBus", Duration::from_millis(500));
    let (names,): (Vec<String>,) = bus.method_call("org.freedesktop.DBus", "ListNames", ()).ok()?;
    const PLAYER: &str = "org.mpris.MediaPlayer2.Player";
    let players: Vec<_> = names.iter().filter(|n| n.starts_with("org.mpris.MediaPlayer2.")).map(|n| conn.with_proxy(n.as_str(), "/org/mpris/MediaPlayer2", Duration::from_millis(500))).collect();
    let status: Vec<Option<String>> = players.iter().map(|p| p.get::<String>(PLAYER, "PlaybackStatus").ok()).collect();
    let mut order: Vec<usize> = (0..players.len()).filter(|&i| matches!(status[i].as_deref(), Some("Playing" | "Paused"))).collect();
    order.sort_by_key(|&i| status[i].as_deref() != Some("Playing")); // playing ones first
    for p in order.into_iter().map(|i| &players[i]) {
        let Ok(meta) = p.get::<PropMap>(PLAYER, "Metadata") else { continue };
        let text = |k: &str| meta.get(k).and_then(|v| v.0.as_str().map(String::from)).unwrap_or_default();
        let artists: Vec<String> = meta
            .get("xesam:artist")
            .and_then(|v| v.0.as_iter().map(|it| it.filter_map(|a| a.as_str().map(String::from)).collect()))
            .unwrap_or_default();
        if let Some(page) = playing_page(&text("xesam:title"), &artists, &text("xesam:url")) {
            return Some(page);
        }
    }
    None
}

/// A player's title, artists and address → the page offered: "Artist – Title", the address only when it is a web one
/// (a local file's path says nothing to a note); None when it says nothing at all.
pub fn playing_page(title: &str, artists: &[String], url: &str) -> Option<Page> {
    let artist = artists.iter().map(|a| a.trim()).filter(|a| !a.is_empty()).collect::<Vec<_>>().join(", ");
    let title = title.trim();
    let name = match (artist.is_empty(), title.is_empty()) {
        (_, true) => artist,
        (true, false) => title.to_string(),
        // a video titled "Artist - Song" already names its artist
        (false, false) if title.to_lowercase().starts_with(&artist.to_lowercase()) => title.to_string(),
        (false, false) => format!("{artist} – {title}"),
    };
    let url = if url.starts_with("http://") || url.starts_with("https://") { url.to_string() } else { String::new() };
    (!name.is_empty() || !url.is_empty()).then_some(Page { url, title: name })
}

/// The window you were on: asked of KWin with a one-line script that calls back over D-Bus. The box's own window is
/// skipped by its process id, so it does not matter whether the box is already on screen.
pub fn window_under() -> Option<Window> {
    use dbus::blocking::Connection;
    use dbus::channel::{MatchingReceiver, Sender};
    use dbus::message::MatchRule;
    let conn = Connection::new_session().ok()?;
    let me = conn.unique_name().to_string();
    let pid = std::process::id();
    let script = format!(
        r#"const pick = (w) => w && w.pid !== {pid} && w.normalWindow && !w.minimized;
let w = workspace.activeWindow;
if (!pick(w)) {{ w = null; const s = workspace.stackingOrder; for (let i = s.length - 1; i >= 0; i--) if (pick(s[i])) {{ w = s[i]; break; }} }}
callDBus("{me}", "/", "org.atlas.Capture", "window", w ? String(w.caption) : "", w ? String(w.resourceClass) : "", w ? String(w.internalId) : "");"#
    );
    let dir = scratch();
    std::fs::create_dir_all(&dir).ok()?;
    let file = dir.join("window.js");
    std::fs::write(&file, script).ok()?;
    let name = format!("atlas-capture-{pid}");
    let got: Arc<Mutex<Option<Window>>> = Arc::default();
    let put = got.clone();
    conn.start_receive(
        MatchRule::new_method_call(),
        Box::new(move |msg, c| {
            if msg.member().as_deref() == Some("window") {
                if let Ok((caption, class, id)) = msg.read3::<String, String, String>() {
                    *put.lock().unwrap() = (!caption.is_empty() || !class.is_empty()).then_some(Window { caption, class, id });
                }
                let _ = c.send(msg.method_return());
            }
            true
        }),
    );
    let kwin = conn.with_proxy("org.kde.KWin", "/Scripting", Duration::from_millis(800));
    let (id,): (i32,) = kwin.method_call("org.kde.kwin.Scripting", "loadScript", (file.to_string_lossy().into_owned(), name.clone())).ok()?;
    let script = conn.with_proxy("org.kde.KWin", format!("/Scripting/Script{id}"), Duration::from_millis(800));
    let ran: Result<(), _> = script.method_call("org.kde.kwin.Script", "run", ());
    let until = Instant::now() + Duration::from_millis(800);
    while ran.is_ok() && got.lock().unwrap().is_none() && Instant::now() < until {
        let _ = conn.process(Duration::from_millis(40));
    }
    let _: Result<(bool,), _> = kwin.method_call("org.kde.kwin.Scripting", "unloadScript", (name,));
    let _ = std::fs::remove_file(&file);
    let w = got.lock().unwrap().take();
    w
}

/// The desktop file name (Flatpak: the app id) of a window class that is a web browser — its desktop file says
/// `Categories=…WebBrowser` (shape, not a list of names); None for anything else.
pub fn browser_app(class: &str) -> Option<String> {
    let class = class.to_lowercase();
    if class.is_empty() {
        return None;
    }
    for dir in application_dirs() {
        let Ok(entries) = std::fs::read_dir(&dir) else { continue };
        for e in entries.flatten() {
            let path = e.path();
            let Some(stem) = path.file_stem().and_then(|s| s.to_str()).map(str::to_lowercase) else { continue };
            if path.extension().and_then(|x| x.to_str()) != Some("desktop") {
                continue;
            }
            let named = stem == class || stem.ends_with(&format!(".{class}"));
            let Ok(text) = std::fs::read_to_string(&path) else { continue };
            let wm = text.lines().find_map(|l| l.strip_prefix("StartupWMClass=")).map(str::to_lowercase);
            if (named || wm.as_deref() == Some(class.as_str())) && text.lines().any(|l| l.starts_with("Categories=") && l.contains("WebBrowser")) {
                return path.file_stem().map(|s| s.to_string_lossy().into_owned());
            }
        }
    }
    None
}

fn application_dirs() -> Vec<PathBuf> {
    let home = home();
    let data = std::env::var_os("XDG_DATA_HOME").map(PathBuf::from).unwrap_or_else(|| home.join(".local/share"));
    let mut dirs = vec![data.join("applications"), data.join("flatpak/exports/share/applications")];
    let system = std::env::var("XDG_DATA_DIRS").unwrap_or_else(|_| "/usr/local/share:/usr/share".into());
    dirs.extend(system.split(':').filter(|d| !d.is_empty()).map(|d| Path::new(d).join("applications")));
    dirs.push(PathBuf::from("/var/lib/flatpak/exports/share/applications"));
    dirs
}

fn home() -> PathBuf {
    std::env::var_os("HOME").map(PathBuf::from).unwrap_or_default()
}

/// The page a browser window shows: the newest visit in that browser's history whose title the window's caption holds
/// (a caption is "<page title> — <browser>"). Never a guess: no title match, no page.
pub fn page(w: &Window, app: &str) -> Option<Page> {
    let dbs = history_dbs(&home(), &w.class, app);
    let class = w.class.to_lowercase();
    let short = class.rsplit('.').next().unwrap_or(&class).to_string();
    // the browser's own profile first (its path names it), then the most recently written one
    let mut ranked: Vec<(bool, SystemTime, History)> = dbs
        .into_iter()
        .map(|h| {
            let p = h.path().to_string_lossy().to_lowercase();
            (!short.is_empty() && p.contains(&short), written(h.path()), h)
        })
        .collect();
    ranked.sort_by_key(|r| std::cmp::Reverse((r.0, r.1)));
    for (_, _, db) in ranked.into_iter().take(3) {
        let Ok(rows) = db.recent(80) else { continue };
        if let Some(p) = match_caption(&w.caption, &rows) {
            return Some(p);
        }
    }
    None
}

/// The row whose title the caption holds, the longest such title winning (a site's home page, "YouTube", is in every one
/// of its captions), the newest among equals. Compared folded: a title may be stored decomposed and the caption composed.
fn match_caption(caption: &str, rows: &[Page]) -> Option<Page> {
    let cap = fold(caption);
    let held = |r: &Page| -> Option<usize> {
        let t = fold(r.title.trim());
        (t.chars().count() >= 3 && cap.contains(&t) && r.url.starts_with("http")).then_some(t.len())
    };
    let best = rows.iter().filter_map(held).max()?;
    rows.iter().find(|r| held(r) == Some(best)).cloned()
}

/// Lowercase letters and digits only, an accented letter dropped whole whether stored composed ("í") or as a letter and a
/// combining mark ("i" + U+0301): both forms fold the same with no Unicode tables. Text with no such letters (another
/// script) is kept as it is.
fn fold(s: &str) -> String {
    let chars: Vec<char> = s.chars().collect();
    let mark = |c: char| ('\u{300}'..='\u{36f}').contains(&c);
    let out: String = chars
        .iter()
        .enumerate()
        .filter(|&(i, c)| c.is_ascii_alphanumeric() && !chars.get(i + 1).copied().is_some_and(mark))
        .map(|(_, c)| c.to_ascii_lowercase())
        .collect();
    if out.is_empty() {
        s.to_string()
    } else {
        out
    }
}

/// A browser profile's history: Firefox's family (`places.sqlite`) or Chromium's (`History`).
#[derive(Clone, Debug)]
enum History {
    Places(PathBuf),
    Chromium(PathBuf),
}

impl History {
    fn path(&self) -> &Path {
        match self {
            History::Places(p) | History::Chromium(p) => p,
        }
    }

    fn query(&self) -> &'static str {
        match self {
            History::Places(_) => "SELECT url, IFNULL(title, '') FROM moz_places WHERE last_visit_date IS NOT NULL ORDER BY last_visit_date DESC LIMIT ?1",
            History::Chromium(_) => "SELECT url, IFNULL(title, '') FROM urls ORDER BY last_visit_time DESC LIMIT ?1",
        }
    }

    /// The newest visits. Read in place when the browser lets it; else (it holds the file locked) from a copy.
    fn recent(&self, n: usize) -> Result<Vec<Page>> {
        let read = |p: &Path| -> Result<Vec<Page>> {
            let db = rusqlite::Connection::open_with_flags(p, rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY | rusqlite::OpenFlags::SQLITE_OPEN_NO_MUTEX)?;
            db.busy_timeout(Duration::from_millis(80))?;
            let mut st = db.prepare(self.query())?;
            let rows = st.query_map([n as i64], |r| Ok(Page { url: r.get(0)?, title: r.get(1)? }))?;
            Ok(rows.flatten().collect())
        };
        match read(self.path()) {
            Ok(rows) => Ok(rows),
            Err(_) => {
                let dir = scratch().join("history");
                std::fs::create_dir_all(&dir)?;
                let name = self.path().file_name().context("a history file")?;
                let copy = dir.join(name);
                std::fs::copy(self.path(), &copy)?;
                let wal = with_suffix(self.path(), "-wal");
                if wal.exists() {
                    std::fs::copy(&wal, with_suffix(&copy, "-wal"))?;
                }
                let rows = read(&copy);
                let _ = std::fs::remove_dir_all(&dir);
                rows
            }
        }
    }
}

fn with_suffix(p: &Path, s: &str) -> PathBuf {
    let mut o = p.as_os_str().to_owned();
    o.push(s);
    PathBuf::from(o)
}

/// When a history was last written: its write-ahead log moves on every visit while the browser runs.
fn written(db: &Path) -> SystemTime {
    [db.to_path_buf(), with_suffix(db, "-wal")]
        .iter()
        .filter_map(|p| p.metadata().and_then(|m| m.modified()).ok())
        .max()
        .unwrap_or(SystemTime::UNIX_EPOCH)
}

/// The browser's histories, found by shape — a `places.sqlite`, or a `History` with a `Preferences` beside it — under its
/// own folders only: a Flatpak's data folder, else Firefox's family's dot folders and the config folders named like it.
fn history_dbs(home: &Path, class: &str, app: &str) -> Vec<History> {
    let mut out = Vec::new();
    let flatpak = home.join(".var/app").join(app);
    if !app.is_empty() && flatpak.is_dir() {
        walk(&flatpak, 0, &mut out);
        return out;
    }
    for r in [".mozilla", ".zen", ".librewolf", ".floorp", ".waterfox"] {
        walk(&home.join(r), 0, &mut out);
    }
    let words: Vec<String> =
        format!("{class} {app}").to_lowercase().split(|c: char| !c.is_alphanumeric()).filter(|w| w.len() >= 4 && *w != "browser").map(String::from).collect();
    if let Ok(entries) = std::fs::read_dir(home.join(".config")) {
        for e in entries.flatten() {
            let name = e.file_name().to_string_lossy().to_lowercase();
            if words.iter().any(|w| name.contains(w.as_str())) {
                walk(&e.path(), 1, &mut out);
            }
        }
    }
    out
}

fn walk(dir: &Path, depth: usize, out: &mut Vec<History>) {
    const SKIP: [&str; 9] = ["cache", ".cache", "caches", "code cache", "gpucache", "storage", "extensions", "indexeddb", "service worker"];
    if depth > 5 {
        return;
    }
    let Ok(entries) = std::fs::read_dir(dir) else { return };
    for e in entries.flatten() {
        let name = e.file_name().to_string_lossy().into_owned();
        let Ok(kind) = e.file_type() else { continue };
        if kind.is_dir() {
            if !SKIP.contains(&name.to_lowercase().as_str()) {
                walk(&e.path(), depth + 1, out);
            }
        } else if name == "places.sqlite" {
            out.push(History::Places(e.path()));
        } else if name == "History" && dir.join("Preferences").exists() {
            out.push(History::Chromium(e.path()));
        }
    }
}

/// The clipboard (Wayland, `wl-paste`): a picture when it holds one, else its text.
pub fn clipboard() -> Option<Clip> {
    std::env::var_os("WAYLAND_DISPLAY")?;
    let types = run(Command::new("wl-paste").arg("--list-types"), Duration::from_millis(600)).ok()?;
    let types = String::from_utf8_lossy(&types);
    if types.lines().any(|t| t.trim() == "image/png") {
        let png = run(Command::new("wl-paste").args(["--type", "image/png"]), Duration::from_millis(1500)).ok()?;
        let dir = scratch();
        std::fs::create_dir_all(&dir).ok()?;
        let file = dir.join(format!("Clipboard {}.png", chrono::Local::now().format("%Y-%m-%d %H%M%S")));
        std::fs::write(&file, png).ok()?;
        return Some(Clip::Image(file));
    }
    if types.lines().any(|t| t.starts_with("text/") || t.trim() == "UTF8_STRING" || t.trim() == "STRING") {
        let text = run(Command::new("wl-paste").args(["--no-newline", "--type", "text"]), Duration::from_millis(600)).ok()?;
        let text = String::from_utf8_lossy(&text).trim().to_string();
        return (!text.is_empty()).then_some(Clip::Text(text));
    }
    None
}

/// The newest picture in the screenshots folder, when it was taken in the last `within`.
pub fn last_screenshot(within: Duration) -> Option<PathBuf> {
    let dir = screenshots_dir();
    let newest = std::fs::read_dir(&dir)
        .ok()?
        .flatten()
        .filter(|e| {
            let n = e.file_name().to_string_lossy().to_lowercase();
            [".png", ".jpg", ".jpeg", ".webp"].iter().any(|x| n.ends_with(x))
        })
        .filter_map(|e| Some((e.metadata().ok()?.modified().ok()?, e.path())))
        .max_by_key(|(t, _)| *t)?;
    (newest.0.elapsed().unwrap_or(Duration::MAX) <= within).then_some(newest.1)
}

/// Spectacle's save folder (its `imageSaveLocation`), else Pictures/Screenshots.
fn screenshots_dir() -> PathBuf {
    let config = std::env::var_os("XDG_CONFIG_HOME").map(PathBuf::from).unwrap_or_else(|| home().join(".config"));
    if let Ok(text) = std::fs::read_to_string(config.join("spectaclerc")) {
        if let Some(url) = text.lines().find_map(|l| l.strip_prefix("imageSaveLocation=")) {
            return PathBuf::from(url.trim_start_matches("file://"));
        }
    }
    let pictures = run(Command::new("xdg-user-dir").arg("PICTURES"), Duration::from_millis(300))
        .ok()
        .map(|o| PathBuf::from(String::from_utf8_lossy(&o).trim()))
        .filter(|p| p.is_absolute())
        .unwrap_or_else(|| home().join("Pictures"));
    pictures.join("Screenshots")
}

/// A picture of that window as it is (KWin's ScreenShot2 `CaptureWindow`): KWin draws the window on its own, so the box —
/// whether already on screen or not — is never in it, and it is taken the moment the box opens. KWin allows it to programs whose
/// desktop file lists `X-KDE-DBUS-Restricted-Interfaces=org.kde.KWin.ScreenShot2` (packaging/atlas-capture.desktop);
/// refused, the box falls back to `take_screen`.
pub fn window_shot(w: &Window) -> Result<PathBuf> {
    use dbus::arg::{OwnedFd, PropMap, RefArg, Variant};
    use dbus::blocking::Connection;
    use std::os::fd::IntoRawFd;
    if w.id.is_empty() {
        bail!("no window id");
    }
    let (read, write) = std::io::pipe()?;
    let reader = std::thread::spawn(move || {
        let mut buf = Vec::new();
        let mut read = read;
        let _ = std::io::Read::read_to_end(&mut read, &mut buf);
        buf
    });
    let conn = Connection::new_session()?;
    let proxy = conn.with_proxy("org.kde.KWin", "/org/kde/KWin/ScreenShot2", Duration::from_secs(3));
    let mut options: PropMap = PropMap::new();
    options.insert("native-resolution".into(), Variant(Box::new(true) as Box<dyn RefArg>));
    for key in ["include-decoration", "include-cursor", "include-shadow"] {
        options.insert(key.into(), Variant(Box::new(false) as Box<dyn RefArg>));
    }
    // the write end goes to KWin; ours closes when the call returns, so the reader sees the end of the data
    let fd = unsafe { OwnedFd::new(write.into_raw_fd()) };
    let (meta,): (PropMap,) = proxy.method_call("org.kde.KWin.ScreenShot2", "CaptureWindow", (w.id.as_str(), options, fd))?;
    let data = reader.join().map_err(|_| anyhow::anyhow!("the picture's reader"))?;
    let num = |k: &str| meta.get(k).and_then(|v| v.0.as_u64()).unwrap_or(0) as usize;
    let (width, height, stride, format) = (num("width"), num("height"), num("stride"), num("format"));
    if width == 0 || height == 0 || data.len() < stride * height {
        bail!("KWin gave no picture ({width}×{height}, {} bytes)", data.len());
    }
    // QImage formats: 4/5/6 (RGB32, ARGB32, premultiplied) are B,G,R,A in memory; 16/17/18 (RGBX/RGBA8888) R,G,B,A
    let bgra = match format {
        4..=6 => true,
        16..=18 => false,
        f => bail!("a picture format the box does not read ({f})"),
    };
    let mut rgba = Vec::with_capacity(width * height * 4);
    for y in 0..height {
        for px in data[y * stride..y * stride + width * 4].chunks_exact(4) {
            let (r, b) = if bgra { (px[2], px[0]) } else { (px[0], px[2]) };
            rgba.extend_from_slice(&[r, px[1], b, if format == 4 || format == 16 { 255 } else { px[3] }]);
        }
    }
    let dir = scratch();
    std::fs::create_dir_all(&dir)?;
    let file = dir.join(format!("Screen {}.png", chrono::Local::now().format("%Y-%m-%d %H%M%S")));
    let mut enc = png::Encoder::new(std::io::BufWriter::new(std::fs::File::create(&file)?), width as u32, height as u32);
    enc.set_color(png::ColorType::Rgba);
    enc.set_compression(png::Compression::Fast);
    enc.write_header()?.write_image_data(&rgba)?;
    Ok(file)
}

/// The screen the box is on, as it is now (Spectacle in the background: no window, no notice). The caller hides the box first.
pub fn take_screen() -> Result<PathBuf> {
    let dir = scratch();
    std::fs::create_dir_all(&dir)?;
    let file = dir.join(format!("Screen {}.png", chrono::Local::now().format("%Y-%m-%d %H%M%S")));
    run(Command::new("spectacle").args(["--background", "--nonotify", "--current", "--output"]).arg(&file), Duration::from_secs(8)).context("spectacle")?;
    if !file.exists() {
        bail!("spectacle wrote nothing");
    }
    Ok(file)
}

/// A command's output, or an error when it fails or outlives `limit` (then it is killed: nothing may hang the box).
fn run(cmd: &mut Command, limit: Duration) -> Result<Vec<u8>> {
    let mut child = cmd.stdin(Stdio::null()).stdout(Stdio::piped()).stderr(Stdio::null()).spawn()?;
    let mut out = child.stdout.take().context("stdout")?;
    let reader = std::thread::spawn(move || {
        let mut buf = Vec::new();
        let _ = std::io::Read::read_to_end(&mut out, &mut buf);
        buf
    });
    let until = Instant::now() + limit;
    loop {
        if let Some(status) = child.try_wait()? {
            let buf = reader.join().unwrap_or_default();
            if !status.success() {
                bail!("{status}");
            }
            return Ok(buf);
        }
        if Instant::now() > until {
            let _ = child.kill();
            let _ = child.wait();
            bail!("took too long");
        }
        std::thread::sleep(Duration::from_millis(10));
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_caption_finds_its_page_and_nothing_else() {
        let rows = vec![
            Page { url: "https://www.youtube.com/".into(), title: "YouTube".into() }, // newer, but only the site's name
            Page { url: "https://www.youtube.com/watch?v=abc".into(), title: "Cuprates explained - YouTube".into() },
            Page { url: "https://example.org/".into(), title: "Example Domain".into() },
        ];
        let p = match_caption("(3) Cuprates explained - YouTube — Zen Browser", &rows).unwrap();
        assert_eq!(p.url, "https://www.youtube.com/watch?v=abc");
        assert_eq!(p.markdown(), "[Cuprates explained - YouTube](https://www.youtube.com/watch?v=abc)");
        assert_eq!(match_caption("Konsole", &rows), None);
        // stored decomposed (as Zen keeps it), shown composed
        let stored = vec![Page { url: "https://www.youtube.com/watch?v=x".into(), title: "Jose\u{301} Mari\u{301}a, live session - YouTube".into() }];
        assert!(match_caption("José María, live session - YouTube — Zen Browser", &stored).is_some());
    }

    #[test]
    fn histories_are_found_by_shape() {
        let home = std::env::temp_dir().join(format!("atlas-hist-{}", std::process::id()));
        let zen = home.join(".var/app/app.zen_browser.zen/.zen/ab12.Default (release)");
        let chromium = home.join(".config/chromium/Default");
        std::fs::create_dir_all(&zen).unwrap();
        std::fs::create_dir_all(&chromium).unwrap();
        std::fs::write(zen.join("places.sqlite"), "").unwrap();
        std::fs::write(chromium.join("History"), "").unwrap();
        std::fs::write(chromium.join("Preferences"), "{}").unwrap();
        std::fs::create_dir_all(home.join(".config/notes")).unwrap();
        std::fs::write(home.join(".config/notes/History"), "").unwrap();
        let zen_found = history_dbs(&home, "zen", "app.zen_browser.zen");
        assert!(matches!(&zen_found[..], [History::Places(p)] if p.starts_with(&zen)), "{zen_found:?}");
        let chromium_found = history_dbs(&home, "chromium-browser", "chromium-browser");
        assert!(matches!(&chromium_found[..], [History::Chromium(p)] if p.starts_with(&chromium)), "{chromium_found:?}");
        assert!(history_dbs(&home, "org.kde.notes", "org.kde.notes").is_empty(), "no Preferences beside it: not a browser's");
        std::fs::remove_dir_all(&home).unwrap();
    }

    #[test]
    fn a_firefox_history_is_read() {
        let dir = std::env::temp_dir().join(format!("atlas-places-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let db = dir.join("places.sqlite");
        let c = rusqlite::Connection::open(&db).unwrap();
        c.execute_batch(
            "CREATE TABLE moz_places (url TEXT, title TEXT, last_visit_date INTEGER);
             INSERT INTO moz_places VALUES ('https://old.example/', 'Old', 1), ('https://new.example/', 'New page', 2), ('https://never/', 'x', NULL);",
        )
        .unwrap();
        drop(c);
        let rows = History::Places(db).recent(10).unwrap();
        assert_eq!(rows.iter().map(|r| r.title.as_str()).collect::<Vec<_>>(), ["New page", "Old"]);
        std::fs::remove_dir_all(&dir).unwrap();
    }
}
