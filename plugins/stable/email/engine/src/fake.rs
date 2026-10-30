//! A stand-in mail server for the tests (the engine's and the pane's e2e): IMAP and SMTP on 127.0.0.1, no TLS, no
//! network. Enough of IMAP4rev1 and its extensions for the engine (LIST with special-use, SELECT / EXAMINE with
//! CONDSTORE, UID SEARCH / FETCH / STORE / MOVE / COPY / EXPUNGE with COPYUID, APPEND with APPENDUID, CREATE, DELETE,
//! RENAME, STATUS, IDLE) and of SMTP (EHLO, AUTH PLAIN / LOGIN, MAIL, RCPT, DATA). Mail sent to the user is delivered
//! to the INBOX, so IDLE has something to tell. After every change the state is written to `<dir>/state.json`
//! (folder → uid, flags, subject, message id) and each sent message to `<dir>/sent/<n>.eml`.
//! User "me@example.org", password "pw". The `fake-mail` binary serves it for the e2e tests.

use serde_json::json;
use std::collections::{BTreeMap, BTreeSet};
use std::io::{BufRead, BufReader, Read, Write};
use std::net::{TcpListener, TcpStream};
use std::path::PathBuf;
use std::sync::{Arc, Condvar, Mutex};
use std::time::Duration;

pub const USER: &str = "me@example.org";
pub const PASSWORD: &str = "pw";

#[derive(Clone)]
pub struct Msg {
    pub uid: u32,
    pub flags: BTreeSet<String>,
    pub raw: Vec<u8>,
    pub modseq: u64,
}

pub struct Folder {
    pub special: &'static str,
    pub uidvalidity: u32,
    pub uidnext: u32,
    pub msgs: Vec<Msg>,
}

pub struct Store {
    pub folders: BTreeMap<String, Folder>,
    pub modseq: u64,
    pub sent: usize,
    pub dir: Option<PathBuf>,
}

/// The server's mailboxes, shared by its connections; `changed` wakes the IDLEs.
pub struct Server {
    pub store: Mutex<Store>,
    pub changed: Condvar,
    /// How many LISTs to answer by closing the connection (a server that hangs up).
    pub hang_up_on_list: std::sync::atomic::AtomicUsize,
    pub moves: bool,
    pub imap_port: u16,
    pub smtp_port: u16,
}

fn msg(n: u32, from: &str, subject: &str, text: &str, day: u32, attach: Option<(&str, &str)>) -> Vec<u8> {
    let mut m = format!("From: {from}\r\nTo: Me <{USER}>\r\nSubject: {subject}\r\nDate: Mon, {day:02} Oct 2026 09:{n:02}:00 +0000\r\nMessage-ID: <seed-{n}@example.org>\r\nMIME-Version: 1.0\r\n");
    match attach {
        None => m.push_str(&format!("Content-Type: text/plain; charset=utf-8\r\nContent-Transfer-Encoding: 8bit\r\n\r\n{text}\r\n")),
        Some((name, content)) => m.push_str(&format!(
            "Content-Type: multipart/mixed; boundary=\"b\"\r\n\r\n--b\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Transfer-Encoding: 8bit\r\n\r\n{text}\r\n--b\r\nContent-Type: text/plain\r\nContent-Disposition: attachment; filename=\"{name}\"\r\n\r\n{content}\r\n--b--\r\n"
        )),
    }
    m.into_bytes()
}

const PIXEL: &str = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

fn html_msg() -> Vec<u8> {
    format!(
        "From: Lab News <news@example.org>\r\nTo: Me <{USER}>\r\nSubject: Newsletter with pictures\r\nDate: Thu, 15 Oct 2026 08:00:00 +0000\r\nMessage-ID: <seed-html@example.org>\r\nList-Unsubscribe: <https://example.org/unsubscribe>\r\nList-Unsubscribe-Post: List-Unsubscribe=One-Click\r\nMIME-Version: 1.0\r\nContent-Type: multipart/mixed; boundary=\"m\"\r\n\r\n--m\r\nContent-Type: multipart/alternative; boundary=\"a\"\r\n\r\n--a\r\nContent-Type: text/plain; charset=utf-8\r\n\r\nPlain version. See https://example.org/talk\r\n\r\n> earlier message\r\n>> the first one\r\n--a\r\nContent-Type: multipart/related; boundary=\"r\"\r\n\r\n--r\r\nContent-Type: text/html; charset=utf-8\r\n\r\n<html><head><style>.hl{{color:rgb(200, 0, 0)}}</style></head><body><p class=\"hl\">Styled heading</p><p>The talk: <a href=\"https://example.org/talk\">the talk page</a></p><img src=\"cid:logo@x\" alt=\"logo\"><img src=\"https://tracker.example.org/pixel.gif\" alt=\"remote\"><div class=\"gmail_quote\">earlier message<blockquote>the first one</blockquote></div><script>document.title=\"x\"</script></body></html>\r\n--r\r\nContent-Type: image/png\r\nContent-ID: <logo@x>\r\nContent-Transfer-Encoding: base64\r\n\r\n{PIXEL}\r\n--r--\r\n--a--\r\n--m\r\nContent-Type: image/png; name=\"photo.png\"\r\nContent-Disposition: attachment; filename=\"photo.png\"\r\nContent-Transfer-Encoding: base64\r\n\r\n{PIXEL}\r\n--m--\r\n"
    )
    .into_bytes()
}

fn seed() -> BTreeMap<String, Folder> {
    let f = |special, msgs: Vec<(Vec<&str>, Vec<u8>)>| Folder {
        special,
        uidvalidity: 1,
        uidnext: msgs.len() as u32 + 1,
        msgs: msgs.into_iter().enumerate().map(|(i, (flags, raw))| Msg { uid: i as u32 + 1, flags: flags.into_iter().map(String::from).collect(), raw, modseq: 1 }).collect(),
    };
    let mut b = BTreeMap::new();
    b.insert(
        "INBOX".into(),
        f(
            "",
            vec![
                (vec!["\\Seen"], msg(1, "Ada Lovelace <ada@example.org>", "Cluster time on iq", "The allocation for next month is approved.\r\n\r\nAda", 12, None)),
                (vec![], msg(2, "Grace Hopper <grace@example.org>", "Draft of the DCA section", "Here is the draft, see the attached notes.\r\n\r\nGrace", 13, Some(("notes.txt", "sigma(k) at U=6")))),
                (vec![], msg(3, "Ngô Bảo <ngo@example.org>", "Séminaire jeudi", "Le séminaire est jeudi à 14 h.", 14, None)),
            ],
        ),
    );
    b.insert("Archive".into(), f("\\Archive", vec![(vec!["\\Seen"], msg(4, "Old Friend <old@example.org>", "Archived thread", "From last year.", 1, None))]));
    b.insert("Sent".into(), f("\\Sent", vec![]));
    b.insert("Drafts".into(), f("\\Drafts", vec![]));
    b.insert("Trash".into(), f("\\Trash", vec![]));
    b.insert(
        "Lectures &AOk-t&AOk-".into(),
        f(
            "",
            vec![
                (vec!["\\Seen"], html_msg()),
                (vec!["\\Seen"], msg(5, "Ana <ana@example.org>", "Re: Re: slides", "Agreed, see https://example.org/slides.pdf.\r\n\r\nOn Mon, Ben wrote:\r\n> Can you check?\r\n>\r\n> On Sun, Ana wrote:\r\n>> Here are the slides.", 15, None)),
            ],
        ),
    );
    for other in ["Calendar", "Calendar/Birthdays", "Contacts"] {
        b.insert(other.into(), f("", vec![]));
    }
    b
}

impl Store {
    fn save(&self) {
        let Some(dir) = &self.dir else { return };
        let state: serde_json::Map<String, serde_json::Value> = self
            .folders
            .iter()
            .map(|(name, f)| {
                let msgs: Vec<_> = f
                    .msgs
                    .iter()
                    .map(|m| {
                        let e = crate::parse::envelope(&m.raw, None);
                        json!({ "uid": m.uid, "flags": m.flags, "subject": e.subject, "message_id": format!("<{}>", e.message_id) })
                    })
                    .collect();
                (name.clone(), json!(msgs))
            })
            .collect();
        let tmp = dir.join("state.json.tmp");
        let _ = std::fs::write(&tmp, serde_json::to_string_pretty(&state).unwrap());
        let _ = std::fs::rename(tmp, dir.join("state.json"));
    }

    pub fn add(&mut self, folder: &str, raw: Vec<u8>, flags: &[&str]) -> Option<u32> {
        self.modseq += 1;
        let m = self.modseq;
        let f = self.folders.get_mut(folder)?;
        let uid = f.uidnext;
        f.uidnext += 1;
        f.msgs.push(Msg { uid, flags: flags.iter().map(|s| s.to_string()).collect(), raw, modseq: m });
        Some(uid)
    }
}

/// Starts the server on free ports; it serves until the process ends. `dir`: where state.json and sent/ go.
pub fn start(dir: Option<PathBuf>, moves: bool) -> Arc<Server> {
    if let Some(d) = &dir {
        let _ = std::fs::create_dir_all(d.join("sent"));
    }
    let imap = TcpListener::bind("127.0.0.1:0").unwrap();
    let smtp = TcpListener::bind("127.0.0.1:0").unwrap();
    let server = Arc::new(Server {
        store: Mutex::new(Store { folders: seed(), modseq: 1, sent: 0, dir }),
        changed: Condvar::new(),
        hang_up_on_list: Default::default(),
        moves,
        imap_port: imap.local_addr().unwrap().port(),
        smtp_port: smtp.local_addr().unwrap().port(),
    });
    server.store.lock().unwrap().save();
    let s = server.clone();
    std::thread::spawn(move || {
        for c in imap.incoming().flatten() {
            let s = s.clone();
            std::thread::spawn(move || {
                let _ = Imap { s, sel: None, write: false, out: c.try_clone().unwrap() }.serve(c);
            });
        }
    });
    let s = server.clone();
    std::thread::spawn(move || {
        for c in smtp.incoming().flatten() {
            let s = s.clone();
            std::thread::spawn(move || {
                let _ = smtp_serve(&s, c);
            });
        }
    });
    server
}

struct Imap {
    s: Arc<Server>,
    sel: Option<String>,
    write: bool,
    out: TcpStream,
}

/// A command line's arguments: atoms, "quoted strings" unquoted, (lists) nested, as strings with parens kept.
fn args(line: &str) -> Vec<String> {
    let mut out = vec![];
    let cs: Vec<char> = line.chars().collect();
    let mut i = 0;
    while i < cs.len() {
        match cs[i] {
            ' ' => i += 1,
            '"' => {
                let mut s = String::new();
                i += 1;
                while i < cs.len() && cs[i] != '"' {
                    if cs[i] == '\\' && i + 1 < cs.len() {
                        i += 1;
                    }
                    s.push(cs[i]);
                    i += 1;
                }
                i += 1;
                out.push(s);
            }
            '(' => {
                let mut depth = 0;
                let s = i;
                while i < cs.len() {
                    if cs[i] == '(' {
                        depth += 1
                    } else if cs[i] == ')' {
                        depth -= 1;
                        if depth == 0 {
                            i += 1;
                            break;
                        }
                    }
                    i += 1;
                }
                out.push(cs[s..i].iter().collect());
            }
            _ => {
                let s = i;
                let mut depth = 0;
                while i < cs.len() && (cs[i] != ' ' || depth > 0) {
                    if cs[i] == '[' {
                        depth += 1
                    } else if cs[i] == ']' {
                        depth -= 1
                    }
                    i += 1;
                }
                out.push(cs[s..i].iter().collect());
            }
        }
    }
    out
}

fn uids_in(spec: &str, have: &[u32]) -> BTreeSet<u32> {
    let max = have.iter().copied().max().unwrap_or(0);
    let mut out = BTreeSet::new();
    for part in spec.split(',') {
        let (a, b) = part.split_once(':').unwrap_or((part, part));
        let n = |x: &str| if x == "*" { max } else { x.parse().unwrap_or(0) };
        let (lo, hi) = (n(a).min(n(b)), n(a).max(n(b)));
        out.extend(have.iter().filter(|u| **u >= lo && **u <= hi));
    }
    out
}

fn header_of(raw: &[u8]) -> &[u8] {
    match raw.windows(4).position(|w| w == b"\r\n\r\n") {
        Some(i) => &raw[..i + 4],
        None => raw,
    }
}

impl Imap {
    fn send(&mut self, s: &str) -> std::io::Result<()> {
        self.out.write_all(s.as_bytes())?;
        self.out.write_all(b"\r\n")
    }
    fn caps(&self) -> String {
        format!("IMAP4rev1 {}UIDPLUS IDLE CONDSTORE ENABLE SPECIAL-USE LITERAL+ ID UNSELECT AUTH=PLAIN", if self.s.moves { "MOVE " } else { "" })
    }

    fn serve(mut self, c: TcpStream) -> std::io::Result<()> {
        let mut r = BufReader::new(c);
        self.send("* OK fake mail ready")?;
        let mut authed = false;
        loop {
            let mut line = String::new();
            if r.read_line(&mut line)? == 0 {
                return Ok(());
            }
            let line = line.trim_end().to_string();
            let Some((tag, rest)) = line.split_once(' ') else { continue };
            let (cmd, rest) = rest.split_once(' ').unwrap_or((rest, ""));
            let cmd = cmd.to_uppercase();
            let a = args(rest);
            match cmd.as_str() {
                "CAPABILITY" => {
                    let c = self.caps();
                    self.send(&format!("* CAPABILITY {c}"))?;
                    self.send(&format!("{tag} OK done"))?;
                }
                "LOGIN" => {
                    if a.first().map(String::as_str) == Some(USER) && a.get(1).map(String::as_str) == Some(PASSWORD) {
                        authed = true;
                        self.send(&format!("{tag} OK logged in"))?;
                    } else {
                        self.send(&format!("{tag} NO [AUTHENTICATIONFAILED] wrong password"))?;
                    }
                }
                "LOGOUT" => {
                    self.send("* BYE")?;
                    self.send(&format!("{tag} OK bye"))?;
                    return Ok(());
                }
                "NOOP" | "ENABLE" | "ID" | "CHECK" | "SUBSCRIBE" | "UNSUBSCRIBE" => self.send(&format!("{tag} OK done"))?,
                _ if !authed => self.send(&format!("{tag} NO sign in first"))?,
                "UNSELECT" | "CLOSE" => {
                    self.sel = None;
                    self.send(&format!("{tag} OK done"))?;
                }
                "LIST" if self.s.hang_up_on_list.load(std::sync::atomic::Ordering::SeqCst) > 0 => {
                    self.s.hang_up_on_list.fetch_sub(1, std::sync::atomic::Ordering::SeqCst);
                    return Ok(());
                }
                "LIST" | "LSUB" => {
                    let names: Vec<(String, &'static str)> = self.s.store.lock().unwrap().folders.iter().map(|(n, f)| (n.clone(), f.special)).collect();
                    for (n, sp) in names {
                        let mut flags = vec![];
                        if !sp.is_empty() {
                            flags.push(sp);
                        }
                        if n.contains('/') || names_has_children(&n, &self.s) {
                            flags.push("\\HasChildren");
                        }
                        self.send(&format!("* LIST ({}) \"/\" \"{}\"", flags.join(" "), n))?;
                    }
                    self.send(&format!("{tag} OK done"))?;
                }
                "SELECT" | "EXAMINE" => {
                    let name = a.first().cloned().unwrap_or_default();
                    let st = self.s.store.lock().unwrap();
                    let Some(f) = st.folders.get(&name) else {
                        drop(st);
                        self.send(&format!("{tag} NO no such folder"))?;
                        continue;
                    };
                    let (n, v, next, ms) = (f.msgs.len(), f.uidvalidity, f.uidnext, st.modseq);
                    drop(st);
                    self.sel = Some(name);
                    self.write = cmd == "SELECT";
                    self.send("* FLAGS (\\Answered \\Flagged \\Deleted \\Seen \\Draft)")?;
                    self.send(&format!("* {n} EXISTS"))?;
                    self.send(&format!("* OK [UIDVALIDITY {v}] ok"))?;
                    self.send(&format!("* OK [UIDNEXT {next}] ok"))?;
                    self.send(&format!("* OK [HIGHESTMODSEQ {ms}] ok"))?;
                    self.send(&format!("{tag} OK [{}] done", if self.write { "READ-WRITE" } else { "READ-ONLY" }))?;
                }
                "STATUS" => {
                    let name = a.first().cloned().unwrap_or_default();
                    let st = self.s.store.lock().unwrap();
                    match st.folders.get(&name) {
                        Some(f) => {
                            let unseen = f.msgs.iter().filter(|m| !m.flags.contains("\\Seen")).count();
                            let line = format!("* STATUS \"{name}\" (MESSAGES {} UNSEEN {unseen} UIDNEXT {} UIDVALIDITY {})", f.msgs.len(), f.uidnext, f.uidvalidity);
                            drop(st);
                            self.send(&line)?;
                            self.send(&format!("{tag} OK done"))?;
                        }
                        None => {
                            drop(st);
                            self.send(&format!("{tag} NO no such folder"))?
                        }
                    }
                }
                "CREATE" => {
                    let name = a.first().cloned().unwrap_or_default();
                    let mut st = self.s.store.lock().unwrap();
                    let fresh = !st.folders.contains_key(&name);
                    st.folders.entry(name).or_insert(Folder { special: "", uidvalidity: 1, uidnext: 1, msgs: vec![] });
                    st.save();
                    drop(st);
                    self.send(&format!("{tag} {}", if fresh { "OK created" } else { "NO [ALREADYEXISTS] exists" }))?;
                }
                "DELETE" => {
                    let name = a.first().cloned().unwrap_or_default();
                    let mut st = self.s.store.lock().unwrap();
                    let ok = st.folders.remove(&name).is_some();
                    st.save();
                    drop(st);
                    self.send(&format!("{tag} {}", if ok { "OK deleted" } else { "NO no such folder" }))?;
                }
                "RENAME" => {
                    let (from, to) = (a.first().cloned().unwrap_or_default(), a.get(1).cloned().unwrap_or_default());
                    let mut st = self.s.store.lock().unwrap();
                    let ok = match st.folders.remove(&from) {
                        Some(f) => {
                            st.folders.insert(to, f);
                            true
                        }
                        None => false,
                    };
                    st.save();
                    drop(st);
                    self.send(&format!("{tag} {}", if ok { "OK renamed" } else { "NO no such folder" }))?;
                }
                "APPEND" => {
                    let name = a.first().cloned().unwrap_or_default();
                    let flags: Vec<String> = a.iter().find(|x| x.starts_with('(')).map(|f| f.trim_matches(['(', ')']).split_whitespace().map(String::from).collect()).unwrap_or_default();
                    let lit = a.last().cloned().unwrap_or_default();
                    let plus = lit.ends_with("+}");
                    let n: usize = lit.trim_matches(['{', '}', '+']).parse().unwrap_or(0);
                    if !plus {
                        self.send("+ go ahead")?;
                    }
                    let mut raw = vec![0u8; n];
                    r.read_exact(&mut raw)?;
                    let mut end = String::new();
                    r.read_line(&mut end)?;
                    let mut st = self.s.store.lock().unwrap();
                    let fl: Vec<&str> = flags.iter().map(String::as_str).collect();
                    let v = st.folders.get(&name).map(|f| f.uidvalidity);
                    match (st.add(&name, raw, &fl), v) {
                        (Some(uid), Some(v)) => {
                            st.save();
                            drop(st);
                            self.s.changed.notify_all();
                            self.send(&format!("{tag} OK [APPENDUID {v} {uid}] appended"))?;
                        }
                        _ => {
                            drop(st);
                            self.send(&format!("{tag} NO [TRYCREATE] no such folder"))?
                        }
                    }
                }
                "IDLE" => {
                    self.send("+ idling")?;
                    let sel = self.sel.clone();
                    let start = sel.as_ref().map(|s| self.s.store.lock().unwrap().folders.get(s).map(|f| f.msgs.len()).unwrap_or(0)).unwrap_or(0);
                    // a thread waits for DONE; this one tells about new mail meanwhile
                    let done = Arc::new(Mutex::new(false));
                    let (d2, s2) = (done.clone(), self.s.clone());
                    let mut r2 = r.get_ref().try_clone()?;
                    let waiter = std::thread::spawn(move || {
                        let mut buf = [0u8; 16];
                        let mut got = String::new();
                        while !got.to_uppercase().contains("DONE") {
                            let n = r2.read(&mut buf).unwrap_or(0);
                            if n == 0 {
                                break;
                            }
                            got.push_str(&String::from_utf8_lossy(&buf[..n]));
                        }
                        *d2.lock().unwrap() = true;
                        s2.changed.notify_all();
                    });
                    let mut seen = start;
                    loop {
                        let st = self.s.store.lock().unwrap();
                        let (st, _) = self.s.changed.wait_timeout(st, Duration::from_millis(500)).unwrap();
                        let now = sel.as_ref().and_then(|s| st.folders.get(s)).map(|f| f.msgs.len()).unwrap_or(0);
                        drop(st);
                        if now != seen {
                            seen = now;
                            self.send(&format!("* {now} EXISTS"))?;
                        }
                        if *done.lock().unwrap() {
                            break;
                        }
                    }
                    let _ = waiter.join();
                    self.send(&format!("{tag} OK idle done"))?;
                }
                "UID" => {
                    let sub = a.first().map(|s| s.to_uppercase()).unwrap_or_default();
                    self.uid(tag, &sub, &a[1..])?;
                }
                "EXPUNGE" => {
                    self.expunge(None)?;
                    self.send(&format!("{tag} OK done"))?;
                }
                _ => self.send(&format!("{tag} BAD unknown command {cmd}"))?,
            }
        }
    }

    fn expunge(&mut self, only: Option<&BTreeSet<u32>>) -> std::io::Result<()> {
        let Some(sel) = self.sel.clone() else { return Ok(()) };
        let mut st = self.s.store.lock().unwrap();
        let f = st.folders.get_mut(&sel).unwrap();
        let mut gone = vec![];
        let mut i = 0;
        while i < f.msgs.len() {
            let m = &f.msgs[i];
            if m.flags.contains("\\Deleted") && only.is_none_or(|o| o.contains(&m.uid)) {
                f.msgs.remove(i);
                gone.push(i + 1);
            } else {
                i += 1;
            }
        }
        st.save();
        drop(st);
        for seq in gone.into_iter().rev() {
            self.send(&format!("* {seq} EXPUNGE"))?;
        }
        Ok(())
    }

    fn uid(&mut self, tag: &str, sub: &str, a: &[String]) -> std::io::Result<()> {
        let Some(sel) = self.sel.clone() else { return self.send(&format!("{tag} NO select a folder first")) };
        let have: Vec<u32> = self.s.store.lock().unwrap().folders[&sel].msgs.iter().map(|m| m.uid).collect();
        match sub {
            "SEARCH" => {
                let crit = a.join(" ");
                let st = self.s.store.lock().unwrap();
                let f = &st.folders[&sel];
                let hits: Vec<String> = f
                    .msgs
                    .iter()
                    .filter(|m| {
                        let up = crit.to_uppercase();
                        if up.starts_with("HEADER MESSAGE-ID") {
                            let want = a.get(2).cloned().unwrap_or_default();
                            return String::from_utf8_lossy(header_of(&m.raw)).contains(&want);
                        }
                        if up.starts_with("TEXT") || up.starts_with("BODY") {
                            let want = a.get(1).cloned().unwrap_or_default().to_lowercase();
                            return String::from_utf8_lossy(&m.raw).to_lowercase().contains(&want);
                        }
                        if up.starts_with("UNSEEN") {
                            return !m.flags.contains("\\Seen");
                        }
                        if up.starts_with("KEYWORD") {
                            return m.flags.contains(a.get(1).map(String::as_str).unwrap_or(""));
                        }
                        true
                    })
                    .map(|m| m.uid.to_string())
                    .collect();
                drop(st);
                self.send(format!("* SEARCH {}", hits.join(" ")).trim_end())?;
                self.send(&format!("{tag} OK done"))
            }
            "FETCH" => {
                let set = uids_in(&a[0], &have);
                let items = a.get(1).cloned().unwrap_or_default().to_uppercase();
                let since: Option<u64> = a.get(2).and_then(|c| c.to_uppercase().strip_prefix("(CHANGEDSINCE ").and_then(|x| x.trim_end_matches(')').parse().ok()));
                let peek = items.contains(".PEEK") || !self.write;
                let mut st = self.s.store.lock().unwrap();
                let mut out: Vec<Vec<u8>> = vec![];
                let mut changed = false;
                st.modseq += 1;
                let ms = st.modseq;
                let f = st.folders.get_mut(&sel).unwrap();
                for (i, m) in f.msgs.iter_mut().enumerate() {
                    if !set.contains(&m.uid) || since.is_some_and(|s| m.modseq <= s) {
                        continue;
                    }
                    let whole = items.contains("BODY[]") || items.contains("BODY.PEEK[]") || items.contains("RFC822)") || items.ends_with("RFC822");
                    if whole && !peek && m.flags.insert("\\Seen".into()) {
                        m.modseq = ms;
                        changed = true;
                    }
                    let mut parts = format!("* {} FETCH (UID {}", i + 1, m.uid).into_bytes();
                    if items.contains("FLAGS") {
                        parts.extend(format!(" FLAGS ({})", m.flags.iter().cloned().collect::<Vec<_>>().join(" ")).bytes());
                    }
                    if items.contains("MODSEQ") || since.is_some() {
                        parts.extend(format!(" MODSEQ ({})", m.modseq).bytes());
                    }
                    if items.contains("INTERNALDATE") {
                        parts.extend(b" INTERNALDATE \"12-Oct-2026 09:00:00 +0000\"");
                    }
                    if items.contains("RFC822.SIZE") {
                        parts.extend(format!(" RFC822.SIZE {}", m.raw.len()).bytes());
                    }
                    if items.contains("BODY.PEEK[HEADER]") || items.contains("BODY[HEADER]") {
                        let h = header_of(&m.raw);
                        parts.extend(format!(" BODY[HEADER] {{{}}}\r\n", h.len()).bytes());
                        parts.extend_from_slice(h);
                    }
                    if whole {
                        parts.extend(format!(" BODY[] {{{}}}\r\n", m.raw.len()).bytes());
                        parts.extend_from_slice(&m.raw);
                    }
                    parts.extend(b")");
                    out.push(parts);
                }
                if changed {
                    st.save();
                }
                drop(st);
                for o in out {
                    self.out.write_all(&o)?;
                    self.out.write_all(b"\r\n")?;
                }
                self.send(&format!("{tag} OK done"))
            }
            "STORE" => {
                if !self.write {
                    return self.send(&format!("{tag} NO read-only"));
                }
                let set = uids_in(&a[0], &have);
                let op = a.get(1).cloned().unwrap_or_default().to_uppercase();
                let flags: Vec<String> = a.get(2).map(|f| f.trim_matches(['(', ')']).split_whitespace().map(String::from).collect()).unwrap_or_default();
                let mut st = self.s.store.lock().unwrap();
                st.modseq += 1;
                let ms = st.modseq;
                let f = st.folders.get_mut(&sel).unwrap();
                for m in f.msgs.iter_mut().filter(|m| set.contains(&m.uid)) {
                    for fl in &flags {
                        if op.starts_with('+') {
                            m.flags.insert(fl.clone());
                        } else if op.starts_with('-') {
                            m.flags.remove(fl);
                        }
                    }
                    m.modseq = ms;
                }
                st.save();
                drop(st);
                self.s.changed.notify_all();
                self.send(&format!("{tag} OK done"))
            }
            "MOVE" | "COPY" => {
                if sub == "MOVE" && !self.s.moves {
                    return self.send(&format!("{tag} BAD no MOVE here"));
                }
                let set = uids_in(&a[0], &have);
                let to = a.get(1).cloned().unwrap_or_default();
                let mut st = self.s.store.lock().unwrap();
                if !st.folders.contains_key(&to) {
                    drop(st);
                    return self.send(&format!("{tag} NO [TRYCREATE] no such folder"));
                }
                let moving: Vec<Msg> = st.folders[&sel].msgs.iter().filter(|m| set.contains(&m.uid)).cloned().collect();
                let mut new = vec![];
                for m in &moving {
                    let fl: Vec<&str> = m.flags.iter().filter(|f| *f != "\\Deleted").map(String::as_str).collect();
                    new.push(st.add(&to, m.raw.clone(), &fl).unwrap());
                }
                let v = st.folders[&to].uidvalidity;
                let mut gone = vec![];
                if sub == "MOVE" {
                    let f = st.folders.get_mut(&sel).unwrap();
                    let mut i = 0;
                    while i < f.msgs.len() {
                        if set.contains(&f.msgs[i].uid) {
                            f.msgs.remove(i);
                            gone.push(i + 1);
                        } else {
                            i += 1;
                        }
                    }
                }
                st.save();
                drop(st);
                self.s.changed.notify_all();
                let from: Vec<String> = moving.iter().map(|m| m.uid.to_string()).collect();
                let to_u: Vec<String> = new.iter().map(|u| u.to_string()).collect();
                let code = format!("[COPYUID {v} {} {}]", from.join(","), to_u.join(","));
                if sub == "MOVE" {
                    self.send(&format!("* OK {code} moved"))?;
                    for seq in gone.into_iter().rev() {
                        self.send(&format!("* {seq} EXPUNGE"))?;
                    }
                    self.send(&format!("{tag} OK done"))
                } else {
                    self.send(&format!("{tag} OK {code} copied"))
                }
            }
            "EXPUNGE" => {
                let set = uids_in(&a[0], &have);
                self.expunge(Some(&set))?;
                self.send(&format!("{tag} OK done"))
            }
            _ => self.send(&format!("{tag} BAD unknown UID command")),
        }
    }
}

fn names_has_children(n: &str, s: &Server) -> bool {
    s.store.lock().unwrap().folders.keys().any(|k| k.starts_with(&format!("{n}/")))
}

fn smtp_serve(s: &Server, c: TcpStream) -> std::io::Result<()> {
    let mut out = c.try_clone()?;
    let mut r = BufReader::new(c);
    let mut say = |t: &str| out.write_all(format!("{t}\r\n").as_bytes());
    say("220 fake smtp")?;
    let mut rcpt: Vec<String> = vec![];
    loop {
        let mut line = String::new();
        if r.read_line(&mut line)? == 0 {
            return Ok(());
        }
        let l = line.trim_end();
        let up = l.to_uppercase();
        if up.starts_with("EHLO") || up.starts_with("HELO") {
            say("250-fake")?;
            say("250-AUTH PLAIN LOGIN")?;
            say("250 SIZE 52428800")?;
        } else if up.starts_with("AUTH PLAIN") {
            use base64::Engine;
            let creds = base64::engine::general_purpose::STANDARD.decode(l[10..].trim()).unwrap_or_default();
            let ok = creds == format!("\0{USER}\0{PASSWORD}").into_bytes();
            say(if ok { "235 ok" } else { "535 wrong password" })?;
        } else if up.starts_with("MAIL FROM") {
            rcpt.clear();
            say("250 ok")?;
        } else if up.starts_with("RCPT TO") {
            let a = l.split_once(':').map(|x| x.1).unwrap_or("").trim().trim_matches(['<', '>']).to_string();
            if a.contains("refuse") {
                say("550 no such user")?;
            } else {
                rcpt.push(a);
                say("250 ok")?;
            }
        } else if up == "DATA" {
            say("354 go")?;
            let mut data = vec![];
            loop {
                let mut l = String::new();
                r.read_line(&mut l)?;
                if l == ".\r\n" || l == ".\n" || l.is_empty() {
                    break;
                }
                let l = l.strip_prefix('.').map(String::from).unwrap_or(l);
                data.extend_from_slice(l.as_bytes());
            }
            let mut st = s.store.lock().unwrap();
            st.sent += 1;
            if let Some(d) = &st.dir {
                let _ = std::fs::write(d.join("sent").join(format!("{}.eml", st.sent)), &data);
            }
            if rcpt.iter().any(|a| a.eq_ignore_ascii_case(USER)) {
                st.add("INBOX", data, &[]);
            }
            st.save();
            drop(st);
            s.changed.notify_all();
            say("250 queued")?;
        } else if up == "QUIT" {
            say("221 bye")?;
            return Ok(());
        } else if up == "RSET" || up == "NOOP" {
            say("250 ok")?;
        } else {
            say("502 not here")?;
        }
    }
}
