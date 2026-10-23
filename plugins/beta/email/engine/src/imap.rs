//! IMAP (async-imap over tokio, rustls): connecting (TLS, STARTTLS, none), signing in (password, XOAUTH2), the folder
//! list with each folder's role, and the commands the sync and the pane use. Commands that carry an answer the
//! library drops (COPYUID, APPENDUID, Gmail's thread ids, MODSEQ) are read raw through [`Imap::raw`].

use crate::account::{Account, Auth, Security, Server};
use crate::index::Incoming;
use crate::parse;
use async_imap::imap_proto::rfc4315::UidSetMember;
use async_imap::imap_proto::{self, AttributeValue, MailboxDatum, NameAttribute, Outcome, Response, ResponseCode, Status};
use regex::Regex;
use std::collections::HashSet;
use std::pin::Pin;
use std::sync::{Arc, LazyLock};
use std::task::{Context, Poll};
use std::time::Duration;
use tokio::io::{AsyncBufReadExt, AsyncRead, AsyncWrite, AsyncWriteExt, BufReader, ReadBuf};
use tokio::net::TcpStream;

/// One connection's byte stream: plain or TLS.
#[derive(Debug)]
pub enum Stream {
    Plain(TcpStream),
    Tls(Box<tokio_rustls::client::TlsStream<TcpStream>>),
}

impl AsyncRead for Stream {
    fn poll_read(self: Pin<&mut Self>, cx: &mut Context<'_>, buf: &mut ReadBuf<'_>) -> Poll<std::io::Result<()>> {
        match self.get_mut() {
            Stream::Plain(s) => Pin::new(s).poll_read(cx, buf),
            Stream::Tls(s) => Pin::new(s.as_mut()).poll_read(cx, buf),
        }
    }
}
impl AsyncWrite for Stream {
    fn poll_write(self: Pin<&mut Self>, cx: &mut Context<'_>, buf: &[u8]) -> Poll<std::io::Result<usize>> {
        match self.get_mut() {
            Stream::Plain(s) => Pin::new(s).poll_write(cx, buf),
            Stream::Tls(s) => Pin::new(s.as_mut()).poll_write(cx, buf),
        }
    }
    fn poll_flush(self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<std::io::Result<()>> {
        match self.get_mut() {
            Stream::Plain(s) => Pin::new(s).poll_flush(cx),
            Stream::Tls(s) => Pin::new(s.as_mut()).poll_flush(cx),
        }
    }
    fn poll_shutdown(self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<std::io::Result<()>> {
        match self.get_mut() {
            Stream::Plain(s) => Pin::new(s).poll_shutdown(cx),
            Stream::Tls(s) => Pin::new(s.as_mut()).poll_shutdown(cx),
        }
    }
}

pub fn tls_config() -> Arc<tokio_rustls::rustls::ClientConfig> {
    static CONFIG: LazyLock<Arc<tokio_rustls::rustls::ClientConfig>> = LazyLock::new(|| {
        let mut roots = tokio_rustls::rustls::RootCertStore::empty();
        roots.extend(webpki_roots::TLS_SERVER_ROOTS.iter().cloned());
        let provider = Arc::new(tokio_rustls::rustls::crypto::ring::default_provider());
        Arc::new(
            tokio_rustls::rustls::ClientConfig::builder_with_provider(provider)
                .with_safe_default_protocol_versions()
                .expect("TLS versions")
                .with_root_certificates(roots)
                .with_no_client_auth(),
        )
    });
    CONFIG.clone()
}

async fn tls(tcp: TcpStream, host: &str) -> Result<Stream, String> {
    let name = tokio_rustls::rustls::pki_types::ServerName::try_from(host.to_string()).map_err(|_| format!("{host} is not a server name"))?;
    let s = tokio_rustls::TlsConnector::from(tls_config()).connect(name, tcp).await.map_err(|e| format!("TLS with {host} failed: {e}"))?;
    Ok(Stream::Tls(Box::new(s)))
}

const TIMEOUT: Duration = Duration::from_secs(30);

/// A TCP connection to a server, made secure as the account says. `starttls`: the line protocol's command
/// ("STARTTLS" for IMAP; SMTP does its own after EHLO).
pub async fn open(server: &Server) -> Result<Stream, String> {
    let addr = format!("{}:{}", server.host, server.port);
    let tcp = tokio::time::timeout(TIMEOUT, TcpStream::connect(&addr))
        .await
        .map_err(|_| format!("{addr} did not answer in {} s", TIMEOUT.as_secs()))?
        .map_err(|e| format!("cannot reach {addr}: {e}"))?;
    let _ = tcp.set_nodelay(true);
    match server.security {
        Security::Tls => tls(tcp, &server.host).await,
        Security::None => Ok(Stream::Plain(tcp)),
        Security::StartTls => Ok(Stream::Plain(tcp)), // upgraded by the caller after the greeting
    }
}

/// IMAP's STARTTLS on a fresh plain connection: read the greeting, ask, upgrade.
async fn imap_starttls(tcp: TcpStream, host: &str) -> Result<Stream, String> {
    let mut r = BufReader::new(tcp);
    let mut line = String::new();
    r.read_line(&mut line).await.map_err(|e| format!("{host}: {e}"))?;
    r.get_mut().write_all(b"a0 STARTTLS\r\n").await.map_err(|e| format!("{host}: {e}"))?;
    loop {
        line.clear();
        if r.read_line(&mut line).await.map_err(|e| format!("{host}: {e}"))? == 0 {
            return Err(format!("{host} closed the connection on STARTTLS"));
        }
        if let Some(rest) = line.strip_prefix("a0 ") {
            if !rest.trim_start().to_uppercase().starts_with("OK") {
                return Err(format!("{host} refused STARTTLS: {}", line.trim()));
            }
            break;
        }
    }
    tls(r.into_inner(), host).await
}

pub type Session = async_imap::Session<Stream>;

struct XOAuth2(String);
impl async_imap::Authenticator for XOAuth2 {
    type Response = String;
    fn process(&mut self, _challenge: &[u8]) -> String {
        self.0.clone()
    }
}

/// A signed-in IMAP connection and what its server can do.
pub struct Imap {
    pub s: Session,
    pub caps: HashSet<String>,
    pub account: String,
    /// the folder SELECTed (or EXAMINEd) now, and whether for writing
    pub selected: Option<(String, bool)>,
}

/// The access token an Outlook account signs in with (oauth.rs gets it; passwords need none).
pub type Token = Option<String>;

impl Imap {
    pub async fn connect(acc: &Account, token: Token) -> Result<Imap, String> {
        let host = &acc.imap.host;
        let stream = match acc.imap.security {
            Security::StartTls => {
                let Stream::Plain(tcp) = open(&acc.imap).await? else { unreachable!() };
                imap_starttls(tcp, host).await?
            }
            _ => open(&acc.imap).await?,
        };
        let mut client = async_imap::Client::new(stream);
        if acc.imap.security != Security::StartTls {
            let greeting = tokio::time::timeout(TIMEOUT, client.read_response()).await.map_err(|_| format!("{host} sent no greeting"))?;
            match greeting {
                Ok(Some(_)) => {}
                _ => return Err(format!("{host} closed the connection before greeting")),
            }
        }
        let session = match &acc.auth {
            Auth::Password(pw) => {
                if pw.is_empty() {
                    return Err(format!("no password for {} yet: set it in Settings → Plugins & automation → Email", acc.name));
                }
                tokio::time::timeout(TIMEOUT, client.login(&acc.user, pw))
                    .await
                    .map_err(|_| format!("{host} did not answer the sign-in"))?
                    .map_err(|(e, _)| refused(host, &e.to_string()))?
            }
            Auth::Outlook { .. } => {
                let tok = token.ok_or_else(|| "not signed in to Outlook: run “Email: sign in to Outlook…”".to_string())?;
                let auth = XOAuth2(format!("user={}\x01auth=Bearer {}\x01\x01", acc.user, tok));
                tokio::time::timeout(TIMEOUT, client.authenticate("XOAUTH2", auth))
                    .await
                    .map_err(|_| format!("{host} did not answer the sign-in"))?
                    .map_err(|(e, _)| format!("Outlook refused the sign-in ({e}): sign in again"))?
            }
        };
        let mut me = Imap { s: session, caps: HashSet::new(), account: acc.name.clone(), selected: None };
        let caps = me.s.capabilities().await.map_err(|e| format!("{host}: {e}"))?;
        me.caps = caps.iter().map(|c| format!("{c:?}").to_uppercase()).map(|c| cap_name(&c)).collect();
        if me.has("ENABLE") && me.has("CONDSTORE") {
            let _ = me.raw("ENABLE CONDSTORE").await;
        }
        Ok(me)
    }

    pub fn has(&self, cap: &str) -> bool {
        self.caps.contains(&cap.to_uppercase())
    }

    pub fn gmail(&self) -> bool {
        self.has("X-GM-EXT-1")
    }

    /// Send a command and hand every answer up to its tagged one (which must be OK) to `each`.
    pub async fn raw_each(&mut self, cmd: &str, mut each: impl FnMut(&Response)) -> Result<(), String> {
        let id = self.s.run_command(cmd).await.map_err(|e| format!("{}: {e}", first_word(cmd)))?;
        loop {
            let r = tokio::time::timeout(Duration::from_secs(120), self.s.read_response())
                .await
                .map_err(|_| format!("the server did not finish {} in 2 minutes", first_word(cmd)))?
                .map_err(|e| format!("{}: {e}", first_word(cmd)))?
                .ok_or_else(|| format!("the server closed the connection during {}", first_word(cmd)))?;
            let parsed = r.parsed();
            each(parsed);
            if let Response::Done { tag, status, outcome } = parsed {
                if tag.0 == id.0 {
                    if *status != Status::Ok {
                        return Err(format!("{} refused: {}", first_word(cmd), outcome.information.as_deref().unwrap_or("")));
                    }
                    return Ok(());
                }
            }
        }
    }

    /// A command whose answers do not matter beyond its OK.
    pub async fn raw(&mut self, cmd: &str) -> Result<(), String> {
        self.raw_each(cmd, |_| {}).await
    }

    // ----- folders

    /// Every folder that can hold mail: (server name, label people read, role, delimiter).
    pub async fn folders(&mut self) -> Result<Vec<(String, String, Option<String>, Option<String>)>, String> {
        let mut out = vec![];
        self.raw_each("LIST \"\" \"*\"", |r| {
            if let Response::MailboxData(MailboxDatum::List(l)) = r {
                let flags: Vec<String> = l.name_attributes.iter().map(attr_name).collect();
                if flags.iter().any(|f| f == "\\noselect" || f == "\\nonexistent") {
                    return;
                }
                let name = l.name.to_string();
                let (label, role) = role_of(&name, l.delimiter.as_deref(), &flags);
                out.push((name, label, role, l.delimiter.as_ref().map(|d| d.to_string())));
            }
        })
        .await?;
        // a server with no inbox in LIST (rare) still has one
        if !out.iter().any(|f| f.2.as_deref() == Some("inbox")) {
            out.push(("INBOX".into(), "Inbox".into(), Some("inbox".into()), Some("/".into())));
        }
        Ok(out)
    }

    /// SELECT (write) or EXAMINE (read-only) a folder → (uidvalidity, uidnext, highest modseq, exists).
    pub async fn select(&mut self, folder: &str, write: bool) -> Result<(u32, u32, u64, u32), String> {
        let cond = if self.has("CONDSTORE") { " (CONDSTORE)" } else { "" };
        let cmd = format!("{} {}{cond}", if write { "SELECT" } else { "EXAMINE" }, quote(folder));
        let (mut validity, mut next, mut modseq, mut exists) = (0, 0, 0, 0);
        self.raw_each(&cmd, |r| {
            match code_of(r) {
                Some(ResponseCode::UidValidity(v)) => validity = *v,
                Some(ResponseCode::UidNext(n)) => next = *n,
                Some(ResponseCode::HighestModSeq(m)) => modseq = *m,
                _ => {}
            }
            if let Response::MailboxData(MailboxDatum::Exists(n)) = r {
                exists = *n;
            }
        })
        .await
        .map_err(|e| format!("cannot open {folder}: {e}"))?;
        self.selected = Some((folder.to_string(), write));
        Ok((validity, next, modseq, exists))
    }

    /// Make sure `folder` is open, for writing when asked (EXAMINE is enough to read).
    pub async fn ensure(&mut self, folder: &str, write: bool) -> Result<(), String> {
        match &self.selected {
            Some((f, w)) if f == folder && (*w || !write) => Ok(()),
            _ => self.select(folder, write).await.map(|_| ()),
        }
    }

    /// Every uid in the open folder.
    pub async fn all_uids(&mut self) -> Result<Vec<u32>, String> {
        self.search("ALL").await
    }

    pub async fn search(&mut self, criteria: &str) -> Result<Vec<u32>, String> {
        let mut v: Vec<u32> = vec![];
        self.raw_each(&format!("UID SEARCH {criteria}"), |r| {
            if let Response::MailboxData(MailboxDatum::Search(s)) = r {
                v.extend(s);
            }
        })
        .await?;
        v.sort_unstable();
        v.dedup();
        Ok(v)
    }

    /// The header and state of messages (by uid) in the open folder, for the index.
    pub async fn headers(&mut self, uids: &[u32]) -> Result<Vec<Incoming>, String> {
        if uids.is_empty() {
            return Ok(vec![]);
        }
        let gm = if self.gmail() { " X-GM-THRID X-GM-LABELS" } else { "" };
        let obj = if self.has("OBJECTID") { " THREADID" } else { "" };
        let cmd = format!("UID FETCH {} (UID FLAGS INTERNALDATE RFC822.SIZE BODY.PEEK[HEADER]{gm}{obj})", set(uids));
        let mut got: Vec<Fetched> = vec![];
        self.raw_each(&cmd, |r| {
            if let Response::Fetch(_, attrs) = r {
                let mut m = Fetched::default();
                m.read(attrs);
                got.push(m);
            }
        })
        .await?;
        let mut out = vec![];
        for m in got {
            let Some(uid) = m.uid else { continue };
            let header = m.header.unwrap_or_default();
            out.push(Incoming {
                uid,
                flags: m.flags,
                labels: m.labels,
                gm_thread: m.thread,
                size: m.size as i64,
                envelope: parse::envelope(&header, m.arrived),
            });
        }
        Ok(out)
    }

    /// Flags (and Gmail labels) of messages in the open folder: all of `uids`, or those changed since `modseq`
    /// (CONDSTORE). → (uid, flags, labels when Gmail), and the highest modseq seen.
    pub async fn flags(&mut self, uids: &[u32], since: Option<u64>) -> Result<(Vec<crate::index::FlagUpdate>, u64), String> {
        let spec = match since {
            Some(_) => "1:*".to_string(),
            None if uids.is_empty() => return Ok((vec![], 0)),
            None => set(uids),
        };
        let gm = if self.gmail() { " X-GM-LABELS" } else { "" };
        let changed = since.map(|m| format!(" (CHANGEDSINCE {m})")).unwrap_or_default();
        let ms = if since.is_some() { " MODSEQ" } else { "" };
        let gmail = self.gmail();
        let mut out = vec![];
        let mut top = 0;
        self.raw_each(&format!("UID FETCH {spec} (UID FLAGS{gm}{ms}){changed}"), |r| {
            if let Response::Fetch(_, attrs) = r {
                let mut m = Fetched::default();
                m.read(attrs);
                top = top.max(m.modseq);
                if let Some(uid) = m.uid {
                    out.push((uid, m.flags, gmail.then_some(m.labels)));
                }
            }
        })
        .await?;
        Ok((out, top))
    }

    /// A whole message by uid in the open folder (BODY.PEEK: reading it does not mark it read).
    pub async fn body(&mut self, uid: u32) -> Result<Option<Vec<u8>>, String> {
        Ok(self.bodies(&[uid]).await?.into_iter().next().map(|(_, b)| b))
    }

    pub async fn bodies(&mut self, uids: &[u32]) -> Result<Vec<(u32, Vec<u8>)>, String> {
        if uids.is_empty() {
            return Ok(vec![]);
        }
        let mut out = vec![];
        self.raw_each(&format!("UID FETCH {} (UID BODY.PEEK[])", set(uids)), |r| {
            if let Response::Fetch(_, attrs) = r {
                let mut m = Fetched::default();
                m.read(attrs);
                if let (Some(uid), Some(b)) = (m.uid, m.whole) {
                    out.push((uid, b));
                }
            }
        })
        .await?;
        Ok(out)
    }

    /// +FLAGS / -FLAGS on uids of the open folder (opened for writing).
    pub async fn store(&mut self, uids: &[u32], add: bool, flags: &[&str]) -> Result<(), String> {
        if uids.is_empty() || flags.is_empty() {
            return Ok(());
        }
        let op = if add { "+FLAGS.SILENT" } else { "-FLAGS.SILENT" };
        self.raw(&format!("UID STORE {} {op} ({})", set(uids), flags.join(" "))).await
    }

    /// Gmail labels added or removed (X-GM-LABELS).
    pub async fn store_labels(&mut self, uids: &[u32], add: bool, labels: &[String]) -> Result<(), String> {
        if uids.is_empty() || labels.is_empty() {
            return Ok(());
        }
        let op = if add { "+X-GM-LABELS" } else { "-X-GM-LABELS" };
        let ls: Vec<String> = labels.iter().map(|l| quote(l)).collect();
        self.raw(&format!("UID STORE {} {op} ({})", set(uids), ls.join(" "))).await
    }

    /// Move uids of the open folder to `to` → the uids they got there, in order, when the server says (COPYUID).
    pub async fn move_to(&mut self, uids: &[u32], to: &str) -> Result<Vec<(u32, u32)>, String> {
        if uids.is_empty() {
            return Ok(vec![]);
        }
        let mut map = vec![];
        let mut read = |r: &Response| {
            if let Some(ResponseCode::CopyUid(_, from, to)) = code_of(r) {
                map = expand(from).into_iter().zip(expand(to)).collect();
            }
        };
        if self.has("MOVE") {
            self.raw_each(&format!("UID MOVE {} {}", set(uids), quote(to)), &mut read).await?;
        } else {
            self.raw_each(&format!("UID COPY {} {}", set(uids), quote(to)), &mut read).await?;
            self.store(uids, true, &["\\Deleted"]).await?;
            if self.has("UIDPLUS") {
                self.raw(&format!("UID EXPUNGE {}", set(uids))).await?;
            } else {
                // without UIDPLUS only EXPUNGE exists, which would also drop other clients' \Deleted mail: leave them
                // marked; the index forgets them, the server's next expunge takes them
            }
        }
        Ok(map)
    }

    /// Delete uids of the open folder for good (\Deleted + expunge of those only).
    pub async fn expunge(&mut self, uids: &[u32]) -> Result<(), String> {
        self.store(uids, true, &["\\Deleted"]).await?;
        if self.has("UIDPLUS") {
            self.raw(&format!("UID EXPUNGE {}", set(uids))).await
        } else {
            self.raw("EXPUNGE").await
        }
    }

    /// APPEND a message → its uid there when the server says (APPENDUID).
    pub async fn append(&mut self, folder: &str, flags: &[&str], raw: &[u8]) -> Result<Option<u32>, String> {
        let flags = if flags.is_empty() { String::new() } else { format!("({}) ", flags.join(" ")) };
        let rs = self.append_raw(folder, &flags, raw).await?;
        Ok(rs.iter().find_map(|code| match code {
            Some((_, uids)) => uids.first().copied(),
            None => None,
        }))
    }

    async fn append_raw(&mut self, folder: &str, flags: &str, raw: &[u8]) -> Result<Vec<Option<(u32, Vec<u32>)>>, String> {
        // a synchronising literal: the command, the server's "+", the bytes; LITERAL+ skips the wait
        let plus = self.has("LITERAL+");
        let cmd = format!("APPEND {} {flags}{{{}{}}}", quote(folder), raw.len(), if plus { "+" } else { "" });
        let id = self.s.run_command(&cmd).await.map_err(|e| format!("APPEND: {e}"))?;
        if !plus {
            let r = self.s.read_response().await.map_err(|e| format!("APPEND: {e}"))?.ok_or("APPEND: closed")?;
            match r.parsed() {
                Response::Continue { .. } => {}
                other => return Err(format!("{folder} refused the message: {other:?}")),
            }
        }
        let mut bytes = raw.to_vec();
        bytes.extend_from_slice(b"\r\n");
        self.s.get_mut().write_all(&bytes).await.map_err(|e| format!("APPEND: {e}"))?;
        self.s.get_mut().flush().await.map_err(|e| format!("APPEND: {e}"))?;
        loop {
            let r = self.s.read_response().await.map_err(|e| format!("APPEND: {e}"))?.ok_or("APPEND: closed")?;
            if let Response::Done { tag, status, outcome: Outcome { code, information } } = r.parsed() {
                if tag.0 == id.0 {
                    if *status != Status::Ok {
                        return Err(format!("{folder} refused the message: {}", information.as_deref().unwrap_or("")));
                    }
                    return Ok(vec![match code {
                        Some(ResponseCode::AppendUid(v, uids)) => Some((*v, expand(uids))),
                        _ => None,
                    }]);
                }
            }
        }
    }

    pub async fn create(&mut self, folder: &str) -> Result<(), String> {
        self.raw(&format!("CREATE {}", quote(folder))).await?;
        let _ = self.raw(&format!("SUBSCRIBE {}", quote(folder))).await;
        Ok(())
    }

    pub async fn delete_folder(&mut self, folder: &str) -> Result<(), String> {
        if self.selected.as_ref().is_some_and(|(f, _)| f == folder) {
            let _ = self.raw("UNSELECT").await;
            self.selected = None;
        }
        self.raw(&format!("DELETE {}", quote(folder))).await
    }

    pub async fn rename_folder(&mut self, from: &str, to: &str) -> Result<(), String> {
        self.raw(&format!("RENAME {} {}", quote(from), quote(to))).await
    }

    /// STATUS of a folder without opening it → (unseen, messages, uidnext, uidvalidity).
    pub async fn status(&mut self, folder: &str) -> Result<(u32, u32, u32, u32), String> {
        let mut v = (0, 0, 0, 0);
        self.raw_each(&format!("STATUS {} (UNSEEN MESSAGES UIDNEXT UIDVALIDITY)", quote(folder)), |r| {
            if let Response::MailboxData(MailboxDatum::Status { status, .. }) = r {
                for a in status {
                    match a {
                        imap_proto::StatusAttribute::Unseen(n) => v.0 = *n,
                        imap_proto::StatusAttribute::Messages(n) => v.1 = *n,
                        imap_proto::StatusAttribute::UidNext(n) => v.2 = *n,
                        imap_proto::StatusAttribute::UidValidity(n) => v.3 = *n,
                        _ => {}
                    }
                }
            }
        })
        .await?;
        Ok(v)
    }

    pub async fn noop(&mut self) -> bool {
        self.raw("NOOP").await.is_ok()
    }

    pub async fn logout(mut self) {
        let _ = tokio::time::timeout(Duration::from_secs(3), self.s.logout()).await;
    }
}

fn first_word(cmd: &str) -> &str {
    let w = cmd.split_whitespace().next().unwrap_or(cmd);
    if w == "UID" { cmd.split_whitespace().take(2).last().unwrap_or(w) } else { w }
}

/// What the server said about one message in a FETCH.
#[derive(Default)]
struct Fetched {
    uid: Option<u32>,
    flags: Vec<String>,
    labels: Vec<String>,
    thread: Option<u64>,
    size: u32,
    arrived: Option<i64>,
    header: Option<Vec<u8>>,
    whole: Option<Vec<u8>>,
    modseq: u64,
}

impl Fetched {
    fn read(&mut self, attrs: &[AttributeValue]) {
        for a in attrs {
            match a {
                AttributeValue::Uid(u) => self.uid = Some(*u),
                AttributeValue::Flags(f) => self.flags = f.iter().map(|x| x.to_string()).collect(),
                AttributeValue::GmailLabels(l) => self.labels = l.iter().map(|x| gmail_label(x)).collect(),
                AttributeValue::GmailThrId(t) => self.thread = Some(*t),
                AttributeValue::ThreadId(Some(t)) if self.thread.is_none() => self.thread = Some(hash64(t)),
                AttributeValue::Rfc822Size(s) => self.size = *s,
                AttributeValue::ModSeq(m) => self.modseq = *m,
                AttributeValue::InternalDate(d) => self.arrived = chrono::DateTime::parse_from_str(d, "%d-%b-%Y %H:%M:%S %z").ok().map(|t| t.timestamp()),
                AttributeValue::Rfc822Header(Some(h)) => self.header = Some(h.to_vec()),
                AttributeValue::Rfc822(Some(b)) => self.whole = Some(b.to_vec()),
                AttributeValue::BodySection { section, data: Some(d), .. } => match section {
                    Some(imap_proto::SectionPath::Full(imap_proto::MessageSection::Header)) => self.header = Some(d.to_vec()),
                    None => self.whole = Some(d.to_vec()),
                    _ => {}
                },
                _ => {}
            }
        }
    }
}

fn hash64(s: &str) -> u64 {
    use sha2::{Digest, Sha256};
    let h = Sha256::digest(s.as_bytes());
    u64::from_be_bytes(h[..8].try_into().unwrap()) >> 1
}

/// Gmail writes its system labels as \Inbox, \Important…; people's labels as they named them (mUTF-7 decoded).
fn gmail_label(l: &str) -> String {
    if l.starts_with('\\') { l.to_string() } else { mutf7_decode(l) }
}

fn attr_name(a: &NameAttribute) -> String {
    match a {
        NameAttribute::NoInferiors => "\\noinferiors".into(),
        NameAttribute::NoSelect => "\\noselect".into(),
        NameAttribute::Marked => "\\marked".into(),
        NameAttribute::Unmarked => "\\unmarked".into(),
        NameAttribute::All => "\\all".into(),
        NameAttribute::Archive => "\\archive".into(),
        NameAttribute::Drafts => "\\drafts".into(),
        NameAttribute::Flagged => "\\flagged".into(),
        NameAttribute::Junk => "\\junk".into(),
        NameAttribute::Sent => "\\sent".into(),
        NameAttribute::Trash => "\\trash".into(),
        NameAttribute::Extension(e) => e.to_lowercase(),
        _ => String::new(),
    }
}

/// async-imap's capability names as plain upper-case words ("Atom(\"MOVE\")" → "MOVE").
fn cap_name(debug: &str) -> String {
    let re = Regex::new(r#""([^"]+)""#).unwrap();
    match re.captures(debug) {
        Some(c) => c[1].to_uppercase(),
        None => debug.trim_matches(|c: char| !c.is_alphanumeric()).to_uppercase(),
    }
}

/// The response code an answer carries ([COPYUID …], [UIDNEXT …]…), tagged or not.
fn code_of<'a>(r: &'a Response<'a>) -> Option<&'a ResponseCode<'a>> {
    match r {
        Response::Data { outcome, .. } | Response::Done { outcome, .. } => outcome.code.as_ref(),
        _ => None,
    }
}

fn expand(set: &[UidSetMember]) -> Vec<u32> {
    set.iter()
        .flat_map(|m| match m {
            UidSetMember::Uid(u) => vec![*u],
            UidSetMember::UidRange(r) => r.clone().collect(),
        })
        .collect()
}

/// A uid set in IMAP's compact form: 1:4,7,9:10.
pub fn set(uids: &[u32]) -> String {
    let mut v = uids.to_vec();
    v.sort_unstable();
    v.dedup();
    let mut out: Vec<String> = vec![];
    let mut i = 0;
    while i < v.len() {
        let start = v[i];
        while i + 1 < v.len() && v[i + 1] == v[i] + 1 {
            i += 1;
        }
        out.push(if v[i] == start { start.to_string() } else { format!("{start}:{}", v[i]) });
        i += 1;
    }
    out.join(",")
}

/// A folder name as an IMAP quoted string (the name stays as the server spells it, modified UTF-7 included).
pub fn quote(s: &str) -> String {
    format!("\"{}\"", s.replace('\\', "\\\\").replace('"', "\\\""))
}

/// IMAP's modified UTF-7 (RFC 3501 5.1.3) → text: "Envoy&AOk-s" → "Envoyés".
pub fn mutf7_decode(s: &str) -> String {
    use base64::Engine;
    let mut out = String::new();
    let mut rest = s;
    while let Some(i) = rest.find('&') {
        out.push_str(&rest[..i]);
        let after = &rest[i + 1..];
        let Some(j) = after.find('-') else {
            out.push_str(&rest[i..]);
            return out;
        };
        let b = &after[..j];
        if b.is_empty() {
            out.push('&');
        } else {
            let b = b.replace(',', "/");
            let pad = "=".repeat((4 - b.len() % 4) % 4);
            match base64::engine::general_purpose::STANDARD.decode(format!("{b}{pad}")) {
                Ok(bytes) => {
                    let units: Vec<u16> = bytes.chunks(2).filter(|c| c.len() == 2).map(|c| u16::from_be_bytes([c[0], c[1]])).collect();
                    out.push_str(&String::from_utf16_lossy(&units));
                }
                Err(_) => out.push_str(&format!("&{}-", &after[..j])),
            }
        }
        rest = &after[j + 1..];
    }
    out.push_str(rest);
    out
}

/// Text → modified UTF-7, for a folder the user names.
pub fn mutf7_encode(s: &str) -> String {
    use base64::Engine;
    let mut out = String::new();
    let mut buf: Vec<u16> = vec![];
    let flush = |buf: &mut Vec<u16>, out: &mut String| {
        if buf.is_empty() {
            return;
        }
        let bytes: Vec<u8> = buf.iter().flat_map(|u| u.to_be_bytes()).collect();
        let b = base64::engine::general_purpose::STANDARD_NO_PAD.encode(bytes).replace('/', ",");
        out.push('&');
        out.push_str(&b);
        out.push('-');
        buf.clear();
    };
    for c in s.chars() {
        if (' '..='~').contains(&c) {
            flush(&mut buf, &mut out);
            if c == '&' { out.push_str("&-") } else { out.push(c) }
        } else {
            let mut b = [0u16; 2];
            buf.extend_from_slice(c.encode_utf16(&mut b));
        }
    }
    flush(&mut buf, &mut out);
    out
}

static NAMED: LazyLock<Vec<(&'static str, Regex)>> = LazyLock::new(|| {
    [
        ("sent", r"sent( items| messages| mail)?|envoy[ée]s|[ée]l[ée]ments envoy[ée]s|enviados|gesendet|gesendete elemente|inviata|posta inviata"),
        ("drafts", r"drafts?|brouillons|borradores|entw[üu]rfe|bozze"),
        ("archive", r"archives?|archivo|archiv|archivio|all mail|tous les messages|todos"),
        ("junk", r"junk( e-?mail)?|spam|courrier ind[ée]sirable|correo no deseado|bulk mail"),
        ("trash", r"trash|deleted( items| messages)?|corbeille|[ée]l[ée]ments supprim[ée]s|papelera|elementos eliminados|bin|papierkorb|cestino"),
        ("unimportant", r"not[ _-]?important"),
        ("snoozed", r"snoozed|en attente|pospuestos"),
    ]
    .into_iter()
    .map(|(r, p)| (r, Regex::new(&format!("(?i)^({p})$")).unwrap()))
    .collect()
});
/// Exchange lists its other stores as folders that hold no mail: role "other" (folded away, never synced).
static NOT_MAIL: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?i)^(calendars?|calendrier|calendario|kalender|contacts?|contactos|kontakte|suggested contacts|tasks|t[âa]ches|tareas|aufgaben|journal|diario|notes|notas|notizen|conversation history|historique des conversations|outbox|bo[îi]te d.envoi|bandeja de salida|postausgang|sync issues|probl[èe]mes de synchronisation|rss (feeds|subscriptions)|flux rss|social activity notifications|yammer root|externalcontacts|files)$").unwrap()
});

/// A folder's label (decoded, Gmail's "[Gmail]/" gone) and role: special-use flags (RFC 6154) first, else names in
/// English, French, Spanish, German, Italian.
pub fn role_of(name: &str, delim: Option<&str>, flags: &[String]) -> (String, Option<String>) {
    let decoded = mutf7_decode(name);
    let label = Regex::new(r"^\[(?:Gmail|Google Mail)\][/.]").unwrap().replace(&decoded, "").to_string();
    let d = delim.unwrap_or("/");
    let leaf = label.rsplit(d).next().unwrap_or(&label).trim().to_string();
    let top = label.split(d).next().unwrap_or(&label).trim().to_string();
    let has = |f: &str| flags.iter().any(|x| x == f);
    let role = if name.eq_ignore_ascii_case("INBOX") {
        Some("inbox")
    } else if has("\\sent") {
        Some("sent")
    } else if has("\\drafts") {
        Some("drafts")
    } else if has("\\trash") {
        Some("trash")
    } else if has("\\junk") {
        Some("junk")
    } else if has("\\all") {
        Some("all")
    } else if has("\\archive") {
        Some("archive")
    } else if has("\\flagged") || has("\\important") {
        Some("view")
    } else if let Some((r, _)) = NAMED.iter().find(|(r, re)| re.is_match(&leaf) && (*r != "archive" || !leaf.eq_ignore_ascii_case("all mail"))) {
        Some(*r)
    } else if leaf.eq_ignore_ascii_case("all mail") {
        Some("all")
    } else if NOT_MAIL.is_match(&top) {
        Some("other")
    } else {
        None
    };
    let label = if role == Some("inbox") { "Inbox".to_string() } else { label };
    (label, role.map(String::from))
}

/// Why a server said no to a password, said so the user knows what to do.
fn refused(host: &str, why: &str) -> String {
    let l = why.to_lowercase();
    if host.contains("gmail") || host.contains("google") {
        return format!("Gmail refused the password ({why}): Gmail wants an app password (myaccount.google.com → Security → App passwords)");
    }
    if l.contains("auth") || l.contains("login") || l.contains("credential") || l.contains("password") {
        return format!("{host} refused the user name or password ({why}): check them in Settings → Plugins & automation → Email");
    }
    format!("{host} refused the sign-in: {why}")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn modified_utf7_both_ways() {
        assert_eq!(mutf7_decode("Envoy&AOk-s"), "Envoyés");
        assert_eq!(mutf7_decode("Lectures &AOk-t&AOk-"), "Lectures été");
        assert_eq!(mutf7_decode("A&-B"), "A&B");
        assert_eq!(mutf7_decode("&ZeVnLIqe-"), "日本語");
        for s in ["Envoyés", "Lectures été", "A&B", "日本語", "Ünï/cödé ✓"] {
            assert_eq!(mutf7_decode(&mutf7_encode(s)), s);
        }
        assert_eq!(mutf7_encode("Envoyés"), "Envoy&AOk-s");
    }

    #[test]
    fn folder_roles_by_flags_names_and_languages() {
        let r = |n: &str, f: &[&str]| role_of(n, Some("/"), &f.iter().map(|s| s.to_string()).collect::<Vec<_>>());
        assert_eq!(r("INBOX", &[]), ("Inbox".into(), Some("inbox".into())));
        assert_eq!(r("[Gmail]/Sent Mail", &["\\sent"]), ("Sent Mail".into(), Some("sent".into())));
        assert_eq!(r("[Gmail]/All Mail", &["\\all"]), ("All Mail".into(), Some("all".into())));
        assert_eq!(r("&AMk-l&AOk-ments envoy&AOk-s", &[]), ("Éléments envoyés".into(), Some("sent".into())));
        assert_eq!(r("Papelera", &[]).1.as_deref(), Some("trash"));
        assert_eq!(r("Deleted Items", &[]).1.as_deref(), Some("trash"));
        assert_eq!(r("Courrier ind&AOk-sirable", &[]).1.as_deref(), Some("junk"));
        assert_eq!(r("Calendar/Birthdays", &[]).1.as_deref(), Some("other"));
        assert_eq!(r("INBOX/Not Important", &[]).1.as_deref(), Some("unimportant"));
        assert_eq!(r("Projects/Physics", &[]).1, None);
    }

    #[test]
    fn uid_sets_are_compact() {
        assert_eq!(set(&[9, 1, 2, 3, 7, 10, 2]), "1:3,7,9:10");
        assert_eq!(set(&[5]), "5");
    }

    #[test]
    fn capability_names() {
        assert_eq!(cap_name("Atom(\"MOVE\")"), "MOVE");
        assert_eq!(cap_name("Imap4rev1"), "IMAP4REV1");
    }
}
