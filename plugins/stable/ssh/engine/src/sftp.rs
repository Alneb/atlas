//! A host's files in Atlas's explorer (main.js `atlas.files.source`) over sftp: each call runs `sftp -b -` once with a
//! few commands, on the plugin's shared connection (so sftp opens none of its own). A failing command stops the batch;
//! its message is the error. Paths sent to sftp are escaped (sftp reads its own quoting and expands globs in every
//! path), absolute, and never start with "-". Local paths stay inside the vault (`ATLAS_ROOT`), and nothing there is
//! overwritten: a second file of the same name gets a number.
use crate::proc;
use chrono::TimeZone;
use regex::Regex;
use serde_json::{json, Value};
use std::path::{Component, Path, PathBuf};
use std::sync::LazyLock;
use std::time::Duration;

type Answer = Result<Value, String>;

/// Larger files are downloaded into a folder of the vault, not opened from a copy.
const COPY_LIMIT: u64 = 512_000_000;
/// Working copies of remote files, in the vault so the editor is the one for any file. Not under .atlas/cache: saves there are the app's bookkeeping and tell plugins
/// nothing. Out of the vault's git by a .gitignore of its own, out of search and [[ (the walk keeps only .atlas/pages).
const EDIT_DIR: &str = ".atlas/remote/ssh";
/// copy (vault path) → {host, path, size, modified} as last seen on the host
const EDIT_INDEX: &str = ".atlas/remote/ssh/index.json";

/// `drwxr-xr-x    ? user  group   4096 Oct 15 02:43 name` (sftp's `ls -l`; the link count may be "?")
static LS: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"^([-dlbcps?])[-rwxsStTl+.@]{9}\S*\s+\S+\s+\S+\s+\S+\s+(\d+)\s+(\w{3}\s+\d{1,2}\s+(?:\d{1,2}:\d{2}|\d{4}))\s(.+)$").expect("the ls pattern"));

pub fn root() -> PathBuf {
    let r = crate::ssh::absolute(Path::new(&std::env::var("ATLAS_ROOT").unwrap_or_else(|_| ".".into())));
    r.canonicalize().unwrap_or(r)
}

/// A path as sftp reads it: quotes, blanks and glob characters escaped (a leading ~ still expands).
pub fn esc(path: &str) -> Result<String, String> {
    if path.contains(['\n', '\r']) {
        return Err("a name with a line break cannot be sent to sftp".into());
    }
    let path = if path.starts_with('-') { format!("./{path}") } else { path.to_string() };
    Ok(path.chars().flat_map(|c| if " \t\"'\\*?[]{}".contains(c) { vec!['\\', c] } else { vec![c] }).collect())
}

/// The commands in one sftp session → its output; a failure is sftp's own last words.
fn batch(argv: &[String], commands: &[String]) -> Result<String, String> {
    let r = proc::run(argv, Some(&(commands.join("\n") + "\n")), Duration::from_secs(600));
    if r.ok() {
        return Ok(r.out);
    }
    let last = r.err.lines().map(str::trim).rfind(|l| !l.is_empty()).map(str::to_string);
    Err(last.unwrap_or_else(|| format!("sftp exited with {}", r.code.map_or("a signal".into(), |c| c.to_string()))))
}

/// sftp's date ("Oct 15 02:43" this year, "Oct 15 2024" before) in seconds, local time; None when unread. sftp prints
/// English month names.
fn epoch(stamp: &str) -> Option<i64> {
    let local = |d: chrono::NaiveDateTime| chrono::Local.from_local_datetime(&d).earliest().map(|t| t.timestamp());
    if !stamp.contains(':') {
        return local(chrono::NaiveDate::parse_from_str(stamp, "%b %d %Y").ok()?.and_hms_opt(0, 0, 0)?);
    }
    let now = chrono::Local::now().naive_local();
    let year = chrono::Datelike::year(&now);
    let d = chrono::NaiveDateTime::parse_from_str(&format!("{stamp} {year}"), "%b %d %H:%M %Y").ok()?;
    local(if d > now + chrono::Duration::days(1) { chrono::Datelike::with_year(&d, year - 1)? } else { d })
}

/// `ls -la` lines → [{name, type, size, modified, mtime}] ("." and ".." left out).
fn entries(out: &str) -> Vec<Value> {
    out.lines()
        .filter_map(|line| LS.captures(line))
        .filter(|m| m[4] != *"." && m[4] != *"..")
        .map(|m| {
            let kind = match &m[1] { "d" => "dir", "l" => "link", _ => "file" };
            let stamp = m[3].split_whitespace().collect::<Vec<_>>().join(" ");
            let name = if &m[4] == "/" { "/" } else { m[4].rsplit('/').next().unwrap_or(&m[4]) };
            json!({ "name": name, "type": kind, "size": m[2].parse::<u64>().unwrap_or(0), "modified": stamp, "mtime": epoch(&stamp) })
        })
        .collect()
}

fn join(folder: &str, name: &str) -> String {
    if folder == "/" { format!("/{name}") } else { format!("{}/{name}", folder.trim_end_matches('/')) }
}

/// A folder: its absolute path (sftp's pwd) and entries; `not_dir` when the path is a file (a link to one).
pub fn listing(argv: &[String], path: &str) -> Answer {
    let mut cmds = Vec::new();
    if !path.is_empty() {
        cmds.push(format!("cd {}", esc(path)?));
    }
    cmds.extend(["pwd".into(), "ls -la".into()]);
    let out = match batch(argv, &cmds) {
        Ok(o) => o,
        Err(e) if e.to_lowercase().contains("not a directory") => return Ok(json!({ "not_dir": true, "path": path })),
        Err(e) => return Err(e),
    };
    let pwd = out.lines().find_map(|l| l.strip_prefix("Remote working directory:")).map(str::trim).unwrap_or(path);
    Ok(json!({ "path": pwd, "entries": entries(&out) }))
}

/// One path's entry, or None: read from its folder's listing (sftp's `ls` has no -d).
fn stat(argv: &[String], path: &str) -> Result<Option<Value>, String> {
    let trimmed = path.trim_end_matches('/');
    let (folder, name) = trimmed.rsplit_once('/').unwrap_or(("", trimmed));
    let out = batch(argv, &[format!("-ls -la {}", esc(if folder.is_empty() { "/" } else { folder })?)])?; // "-": a missing folder is an answer
    Ok(entries(&out).into_iter().find(|e| e["name"] == name))
}

/// `p` with `..` and `.` taken out, its existing part's links followed (it need not exist).
fn real(p: &Path) -> PathBuf {
    let mut clean = PathBuf::new();
    for c in p.components() {
        match c {
            Component::ParentDir => drop(clean.pop()),
            Component::CurDir => {}
            c => clean.push(c),
        }
    }
    let mut base = clean.clone();
    let mut rest = Vec::new();
    while !base.exists() {
        let Some(name) = base.file_name().map(|n| n.to_os_string()) else { break };
        rest.push(name);
        base.pop();
    }
    let mut full = base.canonicalize().unwrap_or(base);
    full.extend(rest.iter().rev());
    full
}

fn inside_vault(rel: &str) -> Result<PathBuf, String> {
    let root = root();
    let full = real(&root.join(if rel.is_empty() { "." } else { rel }));
    if full != root && !full.starts_with(&root) {
        return Err(format!("{rel}: not a folder of this vault"));
    }
    Ok(full)
}

fn relative(p: &Path) -> String {
    p.strip_prefix(root()).unwrap_or(p).to_string_lossy().into_owned()
}

/// `name` in `folder`, numbered when taken (`notes 2.md`): nothing is overwritten.
fn free_path(folder: &Path, name: &str) -> PathBuf {
    let (stem, ext) = match name.rfind('.') {
        Some(i) if i > 0 && !name[..i].chars().all(|c| c == '.') => (&name[..i], &name[i..]),
        _ => (name, ""),
    };
    let mut path = folder.join(name);
    let mut n = 1;
    while path.exists() || path.is_symlink() {
        n += 1;
        path = folder.join(format!("{stem} {n}{ext}"));
    }
    path
}

fn edit_index(update: Option<(&str, Value)>) -> serde_json::Map<String, Value> {
    let full = root().join(EDIT_INDEX);
    let mut index = std::fs::read_to_string(&full).ok().and_then(|t| serde_json::from_str::<serde_json::Map<String, Value>>(&t).ok()).unwrap_or_default();
    if let Some((k, v)) = update {
        index.insert(k.to_string(), v);
        if let Some(dir) = full.parent() {
            let _ = std::fs::create_dir_all(dir);
        }
        let tmp = full.with_extension("json.tmp");
        if std::fs::write(&tmp, serde_json::to_string_pretty(&index).unwrap_or_default()).is_ok() {
            let _ = std::fs::rename(&tmp, &full);
        }
    }
    index
}

fn text<'a>(p: &'a Value, key: &str) -> Result<&'a str, String> {
    p[key].as_str().ok_or_else(|| format!("{key}: needed"))
}

/// A remote file copied into EDIT_DIR/<host>/<path> → {local}: the vault path Atlas opens.
pub fn fetch_for_edit(argv: &[String], p: &Value) -> Answer {
    let (host, path) = (text(p, "host")?, text(p, "path")?);
    let e = stat(argv, path)?.ok_or_else(|| format!("{path}: no such file"))?;
    if e["type"] == "dir" {
        return Err(format!("{path} is a folder"));
    }
    let size = e["size"].as_u64().unwrap_or(0);
    if size > COPY_LIMIT {
        return Err(format!("{path} is {:.0} MB: too large to open from a copy, download it instead", size as f64 / 1e6));
    }
    let ignore = root().join(".atlas/remote/.gitignore");
    if !ignore.exists() {
        let _ = std::fs::create_dir_all(ignore.parent().unwrap_or(&root()));
        let _ = std::fs::write(&ignore, "# working copies of remote files (the SSH plugin): not part of the vault's history\n*\n");
    }
    let rel = format!("{EDIT_DIR}/{}/{}", crate::ssh::safe(host, ".@-"), path.trim_start_matches('/'));
    let local = inside_vault(&rel)?;
    if let Some(dir) = local.parent() {
        std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    batch(argv, &[format!("get {} {}", esc(path)?, esc(&local.to_string_lossy())?)])?;
    edit_index(Some((&rel, json!({ "host": host, "path": path, "size": e["size"], "modified": e["modified"] }))));
    Ok(json!({ "local": rel, "path": path }))
}

/// The copy back to where it came from — refused when the file there changed since (its size or date; sftp's listing
/// has minutes), unless `force`: nothing on the host is overwritten unseen.
pub fn save_edit(argv: &[String], p: &Value) -> Answer {
    let (host, rel, force) = (text(p, "host")?, text(p, "local")?, p["force"].as_bool().unwrap_or(false));
    let seen = edit_index(None).get(rel).cloned().filter(|s| s["host"] == host).ok_or_else(|| format!("{rel}: not a copy of a file on {host}"))?;
    let path = seen["path"].as_str().unwrap_or_default().to_string();
    if let Some(now) = stat(argv, &path)? {
        if !force && (&now["size"], &now["modified"]) != (&seen["size"], &seen["modified"]) {
            return Ok(json!({ "changed": path, "message": format!("{path} changed on {host} since it was opened here ({}, {} B)", now["modified"].as_str().unwrap_or("?"), now["size"]) }));
        }
    }
    let local = inside_vault(rel)?;
    batch(argv, &[format!("put {} {}", esc(&local.to_string_lossy())?, esc(&path)?)])?;
    // Recorded only when the host holds what was sent: another write between the put and this stat would be taken
    // for ours and its change never reported; left as it was, the next save says the file changed.
    let after = stat(argv, &path)?.unwrap_or(json!({}));
    if after["size"].as_u64() == std::fs::metadata(&local).ok().map(|m| m.len()) {
        let mut seen = seen;
        seen["size"] = after["size"].clone();
        seen["modified"] = after["modified"].clone();
        edit_index(Some((rel, seen)));
    }
    Ok(json!({ "saved": format!("{host}:{path}") }))
}

/// A remote file (or folder, with all inside) into a vault folder; never over an existing file.
pub fn download(argv: &[String], p: &Value) -> Answer {
    let path = text(p, "path")?;
    let dest = inside_vault(p["folder"].as_str().unwrap_or_default())?;
    std::fs::create_dir_all(&dest).map_err(|e| e.to_string())?;
    let name = path.trim_end_matches('/').rsplit('/').next().filter(|n| !n.is_empty()).unwrap_or("download");
    let local = free_path(&dest, name);
    let r = if p["dir"].as_bool().unwrap_or(false) { "-R " } else { "" };
    batch(argv, &[format!("get {r}{} {}", esc(path)?, esc(&local.to_string_lossy())?)])?;
    Ok(json!({ "saved": relative(&local) }))
}

/// A vault file into a remote folder; a file of that name there is replaced only with `replace`.
pub fn upload(argv: &[String], p: &Value) -> Answer {
    let (local_rel, folder) = (text(p, "local")?, text(p, "folder")?);
    let local = inside_vault(local_rel)?;
    if !local.is_file() {
        return Err(format!("{local_rel}: not a file of this vault"));
    }
    let remote = join(folder, &local.file_name().unwrap_or_default().to_string_lossy());
    if !p["replace"].as_bool().unwrap_or(false) && stat(argv, &remote)?.is_some() {
        return Ok(json!({ "exists": remote }));
    }
    batch(argv, &[format!("put {} {}", esc(&local.to_string_lossy())?, esc(&remote)?)])?;
    Ok(json!({ "uploaded": remote }))
}

pub fn mkdir(argv: &[String], p: &Value) -> Answer {
    let path = text(p, "path")?;
    batch(argv, &[format!("mkdir {}", esc(path)?)])?;
    Ok(json!({ "created": path }))
}

/// Never over another file: sftp's posix-rename would replace it without a word.
pub fn rename(argv: &[String], p: &Value) -> Answer {
    let (from, to) = (text(p, "from")?, text(p, "to")?);
    if stat(argv, to)?.is_some() {
        return Err(format!("{} already exists there", to.rsplit('/').next().unwrap_or(to)));
    }
    batch(argv, &[format!("rename {} {}", esc(from)?, esc(to)?)])?;
    Ok(json!({ "renamed": to }))
}

/// A file, or an empty folder: nothing is deleted recursively.
pub fn delete(argv: &[String], p: &Value) -> Answer {
    let (path, dir) = (text(p, "path")?, p["dir"].as_bool().unwrap_or(false));
    match batch(argv, &[format!("{} {}", if dir { "rmdir" } else { "rm" }, esc(path)?)]) {
        Ok(_) => Ok(json!({ "deleted": path })),
        Err(e) if dir => Err(format!("{path} was not deleted: only an empty folder can be ({e})")),
        Err(e) => Err(e),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sftp_reads_escaped_paths_and_its_listing_is_read_back() {
        assert_eq!(esc("/a b/[1]*.txt").unwrap(), r"/a\ b/\[1\]\*.txt");
        assert_eq!(esc("-rf").unwrap(), "./-rf");
        assert!(esc("a\nb").is_err());
        let out = "drwxr-xr-x    ? me  me   4096 Oct 15 02:43 .\n-rw-r--r--    1 me  me     10 Jan  5  2024 /r/out [1].txt\nlrwxrwxrwx    1 me  me      8 Oct 15 02:43 to-notes\n";
        let e = entries(out);
        assert_eq!(e.iter().map(|e| (e["name"].as_str().unwrap(), e["type"].as_str().unwrap(), e["size"].as_u64().unwrap())).collect::<Vec<_>>(), [("out [1].txt", "file", 10), ("to-notes", "link", 8)]);
        assert_eq!(e[0]["modified"], "Jan 5 2024");
        assert!(e[0]["mtime"].as_i64().unwrap() > 1_704_000_000);
        assert_eq!((join("/", "x"), join("/a/", "x")), ("/x".to_string(), "/a/x".to_string()));
    }

    #[test]
    fn a_free_name_gets_a_number_and_a_path_outside_the_vault_is_refused() {
        let d = tempfile::tempdir().unwrap();
        std::fs::write(d.path().join("notes.md"), "").unwrap();
        assert_eq!(free_path(d.path(), "notes.md"), d.path().join("notes 2.md"));
        assert_eq!(free_path(d.path(), ".bashrc"), d.path().join(".bashrc"));
        assert_eq!(real(&d.path().join("a/../b/c")), d.path().canonicalize().unwrap().join("b/c"));
    }
}
