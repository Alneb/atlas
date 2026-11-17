//! What this device's Syncthing says about a vault's folder, read from its own `config.xml` — no API key, no request
//! to its REST API (the Syncthing plugin's job): whether a folder holds the vault, whether that folder or a device it
//! is shared with is paused, and whether Syncthing's GUI port answers at all. sync_state.rs puts it in the vault's
//! status line, so "Syncthing has not brought the server's newer copy yet" comes with the reason it may not.
//!
//! Only what the config proves is said: no config found (the server's container, the phone, whose Syncthing keeps its
//! config in its own app's storage) → nothing at all, never a guess.
use serde::Serialize;
use std::path::{Path, PathBuf};

/// Where Syncthing keeps its config under the home folder: 2.x in `~/.local/state`, 1.x in `~/.config` (as the Syncthing
/// plugin looks), macOS's and Windows' own places last.
const CONFIGS: [&str; 4] = [".local/state/syncthing/config.xml", ".config/syncthing/config.xml", "Library/Application Support/Syncthing/config.xml", "AppData/Local/Syncthing/config.xml"];

/// How long the GUI port may take to accept: it is this machine's own loopback.
const KNOCK: std::time::Duration = std::time::Duration::from_millis(300);

/// This device's Syncthing, for one folder.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, ts_rs::TS)]
#[serde(tag = "state", rename_all = "snake_case")]
#[ts(export)]
pub enum SyncthingHere {
    /// It runs and shares the folder, nothing paused.
    Runs,
    /// Its config shares the folder but its GUI port does not answer: Syncthing is not running.
    NotRunning,
    /// The folder is paused in Syncthing: nothing comes or goes.
    FolderPaused { label: String },
    /// Devices the folder is shared with are paused: nothing reaches or comes from them.
    DevicesPaused { names: Vec<String> },
    /// The vault has a `.stfolder` but this device's Syncthing shares no folder holding it (copied from elsewhere, or
    /// the folder removed from Syncthing).
    NotShared,
}

/// A `<folder>` of the config, as far as it matters here.
#[derive(Debug, Clone, PartialEq)]
struct Folder {
    label: String,
    path: String,
    paused: bool,
    devices: Vec<String>,
}

/// The config, as far as it matters here: its folders, its devices' (id, name, paused), the GUI's address.
#[derive(Debug, Default, PartialEq)]
struct Config {
    folders: Vec<Folder>,
    devices: Vec<(String, String, bool)>,
    gui: Option<String>,
}

/// An attribute's value in an element's opening tag (`id="x"`), XML's five entities undone.
fn attr(tag: &str, name: &str) -> Option<String> {
    let at = tag.find(&format!(" {name}=\""))? + name.len() + 3;
    let end = tag[at..].find('"')? + at;
    Some(tag[at..end].replace("&lt;", "<").replace("&gt;", ">").replace("&quot;", "\"").replace("&apos;", "'").replace("&amp;", "&"))
}

/// The text of the first `<name>…</name>` in `body`.
fn child<'a>(body: &'a str, name: &str) -> Option<&'a str> {
    let open = format!("<{name}>");
    let at = body.find(&open)? + open.len();
    let end = body[at..].find(&format!("</{name}>"))? + at;
    Some(body[at..end].trim())
}

/// The config's text read for what matters. Syncthing writes it itself, one element per line, so a scan by tags is
/// enough; a config it did not write (hand-edited oddly) reads as having less, never as more.
fn parse(text: &str) -> Config {
    let mut c = Config::default();
    for block in text.split("<folder ").skip(1) {
        let Some(end) = block.find("</folder>") else { continue };
        let (tag, body) = block[..end].split_once('>').unwrap_or((&block[..end], ""));
        let Some(path) = attr(&format!(" {tag}"), "path") else { continue };
        // the folder's own <paused> comes after its <device> list; a <device> inside a folder carries none
        let devices = body.split("<device ").skip(1).filter_map(|d| attr(&format!(" {}", d.split('>').next().unwrap_or("")), "id")).collect();
        let label = attr(&format!(" {tag}"), "label").filter(|l| !l.is_empty()).or_else(|| attr(&format!(" {tag}"), "id")).unwrap_or_default();
        c.folders.push(Folder { label, path, paused: child(body, "paused") == Some("true"), devices });
    }
    // the top-level devices are the ones with a name; their end tag closes their own <paused>
    let outside_folders: String = text.split("</folder>").map(|part| part.split("<folder ").next().unwrap_or("")).collect();
    for block in outside_folders.split("<device ").skip(1) {
        let (tag, rest) = block.split_once('>').unwrap_or((block, ""));
        let tag = format!(" {tag}");
        let (Some(id), Some(name)) = (attr(&tag, "id"), attr(&tag, "name")) else { continue };
        let body = rest.split("</device>").next().unwrap_or("");
        c.devices.push((id, name, child(body, "paused") == Some("true")));
    }
    c.gui = text.split("<gui ").nth(1).and_then(|g| child(g.split("</gui>").next().unwrap_or(""), "address")).map(str::to_string);
    c
}

/// `~/x` against `home`; anything else as it is.
fn expand(path: &str, home: &Path) -> PathBuf {
    match path.strip_prefix("~/") {
        Some(rest) => home.join(rest),
        None if path == "~" => home.to_path_buf(),
        None => PathBuf::from(path),
    }
}

/// The deepest folder holding `root` (the vault may sit below a folder's top). `real` resolves links.
fn folder_of<'a>(c: &'a Config, root: &Path, home: &Path, real: &dyn Fn(&Path) -> PathBuf) -> Option<&'a Folder> {
    let root = real(root);
    c.folders
        .iter()
        .filter_map(|f| {
            let p = real(&expand(f.path.trim_end_matches(['/', '\\']), home));
            root.starts_with(&p).then(|| (f, p.components().count()))
        })
        .max_by_key(|(_, depth)| *depth)
        .map(|(f, _)| f)
}

/// What the config says of the vault at `root`, with `answers` telling whether the GUI's address accepts a connection.
fn judge(c: &Config, root: &Path, home: &Path, real: &dyn Fn(&Path) -> PathBuf, answers: &dyn Fn(&str) -> Option<bool>) -> SyncthingHere {
    let Some(f) = folder_of(c, root, home, real) else { return SyncthingHere::NotShared };
    // not running first: a paused folder of a Syncthing that is not even running is the lesser news
    if c.gui.as_deref().and_then(answers) == Some(false) {
        return SyncthingHere::NotRunning;
    }
    if f.paused {
        return SyncthingHere::FolderPaused { label: f.label.clone() };
    }
    // this device is among the folder's too, never paused (Syncthing cannot pause itself)
    let names: Vec<String> = c.devices.iter().filter(|(id, _, paused)| *paused && f.devices.contains(id)).map(|(_, name, _)| name.clone()).collect();
    if names.is_empty() { SyncthingHere::Runs } else { SyncthingHere::DevicesPaused { names } }
}

/// Whether a GUI address (`127.0.0.1:8384`, `0.0.0.0:8384`, `[::1]:8384`) accepts a connection; None for one this
/// cannot knock on (a unix socket), so nothing is said.
fn knock(address: &str) -> Option<bool> {
    use std::net::{SocketAddr, TcpStream, ToSocketAddrs};
    if address.starts_with("unix") || address.starts_with('/') {
        return None;
    }
    let a = address.trim_start_matches("http://").trim_start_matches("https://");
    // a wildcard listens on loopback too
    let a = a.replacen("0.0.0.0:", "127.0.0.1:", 1).replacen("[::]:", "[::1]:", 1);
    let addrs: Vec<SocketAddr> = a.to_socket_addrs().ok()?.collect();
    Some(addrs.iter().any(|s| TcpStream::connect_timeout(s, KNOCK).is_ok()))
}

/// What this device's Syncthing says of the vault at `root`, for a vault with a `.stfolder`; None when no config is
/// found here (nothing to say).
pub fn of(root: &Path) -> Option<SyncthingHere> {
    let home = PathBuf::from(std::env::var_os("HOME").or_else(|| std::env::var_os("USERPROFILE"))?);
    let text = CONFIGS.iter().find_map(|c| std::fs::read_to_string(home.join(c)).ok())?;
    let real = |p: &Path| std::fs::canonicalize(p).unwrap_or_else(|_| p.to_path_buf());
    Some(judge(&parse(&text), root, &home, &real, &knock))
}

#[cfg(test)]
mod tests {
    use super::*;

    /// As Syncthing writes it: a folder's devices carry no name, the top-level ones do; each has its own <paused>.
    const CONFIG: &str = r#"<configuration version="37">
    <folder id="notes-1" label="Notes" path="~/notes" type="sendreceive" rescanIntervalS="300">
        <filesystemType>basic</filesystemType>
        <device id="SELF" introducedBy="">
            <encryptionPassword></encryptionPassword>
        </device>
        <device id="PHONE" introducedBy="">
            <encryptionPassword></encryptionPassword>
        </device>
        <paused>false</paused>
    </folder>
    <folder id="work-2" label="" path="/home/u/work/" type="sendreceive">
        <device id="SELF" introducedBy=""></device>
        <paused>true</paused>
    </folder>
    <device id="SELF" name="laptop" compression="metadata" introducer="false">
        <address>dynamic</address>
        <paused>false</paused>
    </device>
    <device id="PHONE" name="phone &amp; tab" compression="metadata" introducer="false">
        <address>dynamic</address>
        <paused>true</paused>
    </device>
    <gui enabled="true" tls="false">
        <address>127.0.0.1:8384</address>
        <apikey>k</apikey>
    </gui>
</configuration>"#;

    fn judged(root: &str, runs: Option<bool>) -> SyncthingHere {
        judge(&parse(CONFIG), Path::new(root), Path::new("/home/u"), &|p: &Path| p.to_path_buf(), &|_| runs)
    }

    #[test]
    fn the_config_is_read_for_its_folders_devices_and_gui() {
        let c = parse(CONFIG);
        assert_eq!(c.folders.len(), 2);
        assert_eq!((c.folders[0].label.as_str(), c.folders[0].path.as_str(), c.folders[0].paused), ("Notes", "~/notes", false));
        assert_eq!(c.folders[0].devices, ["SELF", "PHONE"]);
        assert_eq!((c.folders[1].label.as_str(), c.folders[1].paused), ("work-2", true), "no label: its id");
        assert_eq!(c.devices, [("SELF".into(), "laptop".into(), false), ("PHONE".into(), "phone & tab".into(), true)]);
        assert_eq!(c.gui.as_deref(), Some("127.0.0.1:8384"));
    }

    #[test]
    fn each_state_of_this_devices_syncthing_is_told_apart() {
        assert_eq!(judged("/home/u/notes", Some(true)), SyncthingHere::DevicesPaused { names: vec!["phone & tab".into()] });
        assert_eq!(judged("/home/u/notes/sub", Some(false)), SyncthingHere::NotRunning, "a vault below a folder's top");
        assert_eq!(judged("/home/u/work", Some(true)), SyncthingHere::FolderPaused { label: "work-2".into() });
        assert_eq!(judged("/home/u/workx", Some(true)), SyncthingHere::NotShared, "a path prefix is not a parent");
        // a GUI it cannot knock on (a socket): only what the config says
        assert_eq!(judged("/home/u/work", None), SyncthingHere::FolderPaused { label: "work-2".into() });
        let unpaused = CONFIG.replace("<paused>true</paused>\n    </device>", "<paused>false</paused>\n    </device>");
        let c = parse(&unpaused);
        assert_eq!(judge(&c, Path::new("/home/u/notes"), Path::new("/home/u"), &|p: &Path| p.to_path_buf(), &|_| Some(true)), SyncthingHere::Runs);
    }

    #[test]
    fn a_closed_port_is_not_running_and_a_socket_is_not_knocked_on() {
        let l = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let open = l.local_addr().unwrap();
        assert_eq!(knock(&open.to_string()), Some(true));
        drop(l);
        assert_eq!(knock(&open.to_string()), Some(false), "nothing listens there now");
        assert_eq!(knock("unix:///run/st.sock"), None);
    }
}
