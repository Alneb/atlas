//! SFTP (protocol 3) spoken directly over `ssh -s sftp`, one channel per host kept open between calls: a folder's
//! listing costs a few round trips instead of a new sftp session each time (~1.4 s on a slow host, its session setup). Only what browsing needs: realpath, stat, listing.
//! The channel rides the shared connection (ControlMaster=no: it never becomes one itself; BatchMode: never asks).
use serde_json::{json, Value};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::mpsc::{self, Receiver, RecvTimeoutError};
use std::sync::{Arc, LazyLock, Mutex};
use std::time::Duration;

/// Longest one answer may take before the channel is dropped (a host that stopped answering).
const ANSWER_WAIT: Duration = Duration::from_secs(60);

// packet types (draft-ietf-secsh-filexfer-02)
const INIT: u8 = 1;
const VERSION: u8 = 2;
const CLOSE: u8 = 4;
const OPENDIR: u8 = 11;
const READDIR: u8 = 12;
const REALPATH: u8 = 16;
const STAT: u8 = 17;
const STATUS: u8 = 101;
const HANDLE: u8 = 102;
const NAME: u8 = 104;
const ATTRS: u8 = 105;
const EOF: u32 = 1;

/// A file's attributes, as far as the explorer needs them.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct Attrs {
    pub size: Option<u64>,
    pub perm: Option<u32>,
    pub mtime: Option<u32>,
}

impl Attrs {
    pub fn kind(&self) -> &'static str {
        match self.perm.map(|p| p & 0o170000) {
            Some(0o040000) => "dir",
            Some(0o120000) => "link",
            _ => "file",
        }
    }
}

/// An answer's payload, read field by field.
struct Reader<'a>(&'a [u8]);

impl Reader<'_> {
    fn take(&mut self, n: usize) -> Result<&[u8], String> {
        if self.0.len() < n {
            return Err("sftp: a short answer from the host".into());
        }
        let (a, b) = self.0.split_at(n);
        self.0 = b;
        Ok(a)
    }
    fn u32(&mut self) -> Result<u32, String> {
        Ok(u32::from_be_bytes(self.take(4)?.try_into().expect("4 bytes")))
    }
    fn u64(&mut self) -> Result<u64, String> {
        Ok(u64::from_be_bytes(self.take(8)?.try_into().expect("8 bytes")))
    }
    fn bytes(&mut self) -> Result<Vec<u8>, String> {
        let n = self.u32()? as usize;
        Ok(self.take(n)?.to_vec())
    }
    fn string(&mut self) -> Result<String, String> {
        Ok(String::from_utf8_lossy(&self.bytes()?).into_owned())
    }
    fn attrs(&mut self) -> Result<Attrs, String> {
        let flags = self.u32()?;
        let mut a = Attrs::default();
        if flags & 0x1 != 0 {
            a.size = Some(self.u64()?);
        }
        if flags & 0x2 != 0 {
            self.take(8)?; // uid, gid
        }
        if flags & 0x4 != 0 {
            a.perm = Some(self.u32()?);
        }
        if flags & 0x8 != 0 {
            self.take(4)?; // atime
            a.mtime = Some(self.u32()?);
        }
        if flags & 0x8000_0000 != 0 {
            for _ in 0..self.u32()? {
                self.bytes()?;
                self.bytes()?;
            }
        }
        Ok(a)
    }
}

fn put_str(buf: &mut Vec<u8>, s: &[u8]) {
    buf.extend((s.len() as u32).to_be_bytes());
    buf.extend(s);
}

/// One open channel: requests written in turn, answers read by a thread of its own (so a wait has a limit).
struct Channel {
    child: Child,
    stdin: ChildStdin,
    answers: Receiver<(u8, Vec<u8>)>,
    next: u32,
}

impl Drop for Channel {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

impl Channel {
    fn open(argv: &[String]) -> Result<Channel, String> {
        let mut child = Command::new(&argv[0])
            .args(&argv[1..])
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .spawn()
            .map_err(|e| format!("{} could not be started: {e}", argv[0]))?;
        let stdin = child.stdin.take().expect("piped");
        let mut out = child.stdout.take().expect("piped");
        let (tx, answers) = mpsc::channel();
        std::thread::spawn(move || loop {
            let mut len = [0u8; 4];
            if out.read_exact(&mut len).is_err() {
                return;
            }
            let mut body = vec![0u8; u32::from_be_bytes(len) as usize];
            if body.is_empty() || out.read_exact(&mut body).is_err() {
                return;
            }
            let kind = body.remove(0);
            if tx.send((kind, body)).is_err() {
                return;
            }
        });
        let mut ch = Channel { child, stdin, answers, next: 1 };
        ch.write(INIT, &3u32.to_be_bytes())?;
        match ch.answer()? {
            (VERSION, _) => Ok(ch),
            (k, _) => Err(format!("sftp: the host answered {k} to the greeting")),
        }
    }

    fn write(&mut self, kind: u8, payload: &[u8]) -> Result<(), String> {
        let mut pkt = ((payload.len() + 1) as u32).to_be_bytes().to_vec();
        pkt.push(kind);
        pkt.extend(payload);
        self.stdin.write_all(&pkt).and_then(|_| self.stdin.flush()).map_err(|_| "sftp: the connection closed".to_string())
    }

    fn answer(&mut self) -> Result<(u8, Vec<u8>), String> {
        match self.answers.recv_timeout(ANSWER_WAIT) {
            Ok(a) => Ok(a),
            Err(RecvTimeoutError::Timeout) => Err("sftp: the host stopped answering".into()),
            Err(RecvTimeoutError::Disconnected) => Err("sftp: the connection closed".into()),
        }
    }

    /// A request written, its id returned: several go out before their answers are read (one round trip for all).
    fn send(&mut self, kind: u8, args: &[&[u8]]) -> Result<u32, String> {
        let id = self.next;
        self.next = self.next.wrapping_add(1);
        let mut p = id.to_be_bytes().to_vec();
        for a in args {
            put_str(&mut p, a);
        }
        self.write(kind, &p)?;
        Ok(id)
    }

    /// The answer to request `id` (type, payload after the id); earlier answers nobody waits for (a CLOSE) are skipped.
    fn recv(&mut self, id: u32) -> Result<(u8, Vec<u8>), String> {
        loop {
            let (k, body) = self.answer()?;
            let mut r = Reader(&body);
            if r.u32()? == id {
                return Ok((k, r.0.to_vec()));
            }
        }
    }
}

/// What a request can come back as: an answer, or the host saying no (its code and message).
#[derive(Debug)]
pub enum Failure {
    Host(u32, String),
    Channel(String),
}

impl std::fmt::Display for Failure {
    fn fmt(&self, f: &mut std::fmt::Formatter) -> std::fmt::Result {
        match self {
            Failure::Host(_, m) | Failure::Channel(m) => f.write_str(m),
        }
    }
}

fn status(body: &[u8]) -> Failure {
    let mut r = Reader(body);
    let code = r.u32().unwrap_or(4);
    let msg = r.string().unwrap_or_default();
    Failure::Host(code, if msg.is_empty() { format!("sftp: failure {code}") } else { msg })
}

/// A folder's listing, or the path is not one.
enum Folder {
    At(String, Vec<(String, Attrs)>),
    NotDir,
}

fn channel<T>(r: Result<T, String>) -> Result<T, Failure> {
    r.map_err(Failure::Channel)
}

impl Channel {
    fn name(&mut self, id: u32) -> Result<String, Failure> {
        match channel(self.recv(id))? {
            (NAME, b) => {
                let mut r = Reader(&b);
                channel(r.u32())?;
                channel(r.string())
            }
            (STATUS, b) => Err(status(&b)),
            (k, _) => Err(Failure::Channel(format!("sftp: answer {k} to realpath"))),
        }
    }

    fn attrs(&mut self, id: u32) -> Result<Attrs, Failure> {
        match channel(self.recv(id))? {
            (ATTRS, b) => channel(Reader(&b).attrs()),
            (STATUS, b) => Err(status(&b)),
            (k, _) => Err(Failure::Channel(format!("sftp: answer {k} to stat"))),
        }
    }

    fn realpath(&mut self, path: &str) -> Result<String, Failure> {
        let id = channel(self.send(REALPATH, &[path.as_bytes()]))?;
        self.name(id)
    }

    /// The folder at `path` (absolute): opened and resolved in one round trip, then read two pages at a time (a folder
    /// of up to ~100 entries — OpenSSH's page — is one more), closed without waiting.
    fn folder(&mut self, path: &str) -> Result<Folder, Failure> {
        let open = channel(self.send(OPENDIR, &[path.as_bytes()]))?;
        let real = channel(self.send(REALPATH, &[path.as_bytes()]))?;
        let handle = match channel(self.recv(open))? {
            (HANDLE, b) => channel(Reader(&b).bytes())?,
            (STATUS, b) => {
                let refused = status(&b);
                self.name(real)?;
                let id = channel(self.send(STAT, &[path.as_bytes()]))?;
                return match self.attrs(id) {
                    Ok(a) if a.kind() != "dir" => Ok(Folder::NotDir),
                    _ => Err(refused),
                };
            }
            (k, _) => return Err(Failure::Channel(format!("sftp: answer {k} to opendir"))),
        };
        let real = self.name(real)?;
        let mut out = Vec::new();
        let mut done = false;
        while !done {
            let pages = [channel(self.send(READDIR, &[&handle]))?, channel(self.send(READDIR, &[&handle]))?];
            for id in pages {
                match channel(self.recv(id))? {
                    (NAME, b) if !done => {
                        let mut r = Reader(&b);
                        for _ in 0..channel(r.u32())? {
                            let name = channel(r.string())?;
                            channel(r.bytes())?; // ls -l's line
                            let a = channel(r.attrs())?;
                            if name != "." && name != ".." {
                                out.push((name, a));
                            }
                        }
                    }
                    (STATUS, b) if !done => match status(&b) {
                        Failure::Host(EOF, _) => done = true,
                        f => {
                            let _ = self.send(CLOSE, &[&handle]);
                            return Err(f);
                        }
                    },
                    _ => {} // a page asked past the end
                }
            }
        }
        let _ = self.send(CLOSE, &[&handle]);
        Ok(Folder::At(real, out))
    }
}

/// The open channels, one per command line (host and settings); each used by one call at a time.
type Slot = Arc<Mutex<Option<Channel>>>;
static CHANNELS: LazyLock<Mutex<HashMap<Vec<String>, Slot>>> = LazyLock::new(Default::default);

/// `work` on the channel for `argv`, opened when there is none; a channel that broke is opened again once.
fn with<T>(argv: &[String], work: impl Fn(&mut Channel) -> Result<T, Failure>) -> Result<T, Failure> {
    let slot = CHANNELS.lock().unwrap_or_else(|e| e.into_inner()).entry(argv.to_vec()).or_default().clone();
    let mut held = slot.lock().unwrap_or_else(|e| e.into_inner());
    for attempt in 0..2 {
        if held.is_none() {
            *held = Some(Channel::open(argv).map_err(Failure::Channel)?);
        }
        match work(held.as_mut().expect("opened")) {
            Err(Failure::Channel(m)) => {
                *held = None;
                if attempt == 1 {
                    return Err(Failure::Channel(m));
                }
            }
            r => return r,
        }
    }
    unreachable!("two attempts")
}

/// The channel opened ahead (a host just connected): the first listing then skips the host's ~1.4 s session setup.
pub fn warm(argv: &[String]) {
    let _ = with(argv, |_| Ok(()));
}

/// A folder over the kept channel: {path, entries} as `sftp::listing` gives them, or {not_dir} for a file. "" and
/// "~/…" are the login folder's. A `Failure::Channel` means the channel itself could not be had (the caller may fall
/// back to a plain sftp); a `Failure::Host` is the host's answer (no such folder, permission).
pub fn listing(argv: &[String], path: &str) -> Result<Value, Failure> {
    let asked = match path {
        "" | "~" => ".".to_string(),
        p => p.strip_prefix("~/").map_or_else(|| p.to_string(), |rest| format!("./{rest}")),
    };
    with(argv, |ch| {
        let at = if asked.starts_with('/') { asked.clone() } else { ch.realpath(&asked)? };
        Ok(match ch.folder(&at)? {
            Folder::NotDir => json!({ "not_dir": true, "path": path }),
            Folder::At(real, list) => {
                let entries: Vec<Value> = list
                    .into_iter()
                    .map(|(name, a)| json!({ "name": name, "type": a.kind(), "size": a.size.unwrap_or(0), "mtime": a.mtime }))
                    .collect();
                json!({ "path": real, "entries": entries })
            }
        })
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The machine's own sftp-server on a temporary folder, as the explorer's tests use it (fixtures/fake_ssh.sh).
    fn server(root: &std::path::Path) -> Option<Vec<String>> {
        let bin = ["/usr/libexec/openssh/sftp-server", "/usr/lib/openssh/sftp-server", "/usr/lib/ssh/sftp-server", "/usr/libexec/sftp-server"]
            .into_iter()
            .find(|p| std::path::Path::new(p).exists())?;
        Some(vec![bin.to_string(), "-d".into(), root.display().to_string()])
    }

    #[test]
    fn lists_a_folder_and_says_a_file_is_one() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::create_dir(dir.path().join("data run")).unwrap();
        std::fs::write(dir.path().join("notes.md"), "hi").unwrap();
        for i in 0..250 {
            std::fs::write(dir.path().join("data run").join(format!("out {i}.txt")), "").unwrap(); // several pages
        }
        let Some(argv) = server(dir.path()) else { return eprintln!("no sftp-server here: skipped") };
        let l = listing(&argv, "").unwrap();
        let root = dir.path().canonicalize().unwrap();
        assert_eq!(l["path"], root.display().to_string());
        let mut names: Vec<(String, String)> = l["entries"].as_array().unwrap().iter().map(|e| (e["name"].as_str().unwrap().into(), e["type"].as_str().unwrap().into())).collect();
        names.sort();
        assert_eq!(names, [("data run".into(), "dir".into()), ("notes.md".into(), "file".into())]);
        assert_eq!(l["entries"].as_array().unwrap().iter().find(|e| e["name"] == "notes.md").unwrap()["size"], 2);
        // the same channel answers again; a file is not a folder; a missing path is the host's message
        assert_eq!(listing(&argv, "data run").unwrap()["entries"].as_array().unwrap().len(), 250);
        assert_eq!(listing(&argv, &format!("{}/data run", root.display())).unwrap()["path"], format!("{}/data run", root.display()));
        assert_eq!(listing(&argv, &format!("{}/notes.md", root.display())).unwrap()["not_dir"], true);
        assert!(matches!(listing(&argv, "/no/such/folder"), Err(Failure::Host(..))));
    }
}
