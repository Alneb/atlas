//! A security key (a YubiKey, any FIDO2 key) in Atlas's sign-in windows on Linux. WebKitGTK has no WebAuthn at all
//! (`PublicKeyCredential` is undefined), so a gate's page asking for the key (Authelia's second factor, a service's
//! OpenID sign-in through it) could never be answered there. The window's script (`SCRIPT`) answers the page's
//! `navigator.credentials.get`, and this module does what a browser does: the client data with the page's real origin
//! (read from the window, never from the page), then CTAP2's getAssertion to the key over USB (`/dev/hidraw*`, the
//! FIDO usage page; the desktop's udev rules give the signed-in user access to such keys). Registering a key is left
//! to a browser; signing in is all a sign-in window needs. Windows and macOS webviews have WebAuthn of their own.
//!
//! CTAPHID (FIDO CTAP 2.1 §11.2): 64-byte reports; an init packet (channel, command | 0x80, length, 57 bytes) then
//! continuation packets (channel, sequence, 59 bytes); `INIT` gets a channel, `CBOR` carries the command, `KEEPALIVE`
//! while the key waits for its touch.
use base64::Engine;
use sha2::{Digest, Sha256};
use std::fs::{File, OpenOptions};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};

const REPORT: usize = 64;
const BROADCAST: [u8; 4] = [0xff; 4];
const CMD_INIT: u8 = 0x86;
const CMD_CBOR: u8 = 0x90;
const CMD_KEEPALIVE: u8 = 0xbb;
const CMD_ERROR: u8 = 0xbf;
const GET_ASSERTION: u8 = 0x02;
/// CTAP2 status codes the window says in words.
const NO_CREDENTIALS: u8 = 0x2e;
const OPERATION_DENIED: u8 = 0x27;
const USER_ACTION_TIMEOUT: u8 = 0x2f;
const PIN_REQUIRED: u8 = 0x36;

/// The script every sign-in window carries: a `navigator.credentials.get` for security keys, answered by the app's
/// `webauthn_get` command, when the engine has none of its own.
pub const SCRIPT: &str = include_str!("webauthn.js");

/// What the page asked, its binary parts in base64url (the script's encoding).
#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Ask {
    pub challenge: String,
    pub rp_id: String,
    #[serde(default)]
    pub allow: Vec<String>,
}

/// The assertion, as the script turns it back into a `PublicKeyCredential` (base64url).
#[derive(Debug, serde::Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Signed {
    pub id: String,
    pub client_data_json: String,
    pub authenticator_data: String,
    pub signature: String,
    pub user_handle: Option<String>,
}

fn b64u(b: &[u8]) -> String {
    base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(b)
}

fn unb64u(s: &str) -> Result<Vec<u8>, String> {
    base64::engine::general_purpose::URL_SAFE_NO_PAD.decode(s.trim_end_matches('=')).map_err(|e| format!("not base64url: {e}"))
}

/// Whether the page at `origin` may ask for credentials of `rp_id`: its host is the relying party or under it, over
/// https (a browser's rule: a site cannot sign in to another one with the key).
pub fn may_ask(origin: &str, rp_id: &str) -> bool {
    let Some(host) = origin.strip_prefix("https://").map(|h| h.split([':', '/']).next().unwrap_or("").to_ascii_lowercase()) else { return false };
    let rp = rp_id.trim().trim_end_matches('.').to_ascii_lowercase();
    rp.contains('.') && (host == rp || host.ends_with(&format!(".{rp}")))
}

/// The client data a browser would make for this page, as bytes (WebAuthn §5.8.1, the keys in its order).
pub fn client_data(origin: &str, challenge: &str) -> Vec<u8> {
    let q = |s: &str| serde_json::Value::from(s).to_string();
    format!(r#"{{"type":"webauthn.get","challenge":{},"origin":{},"crossOrigin":false}}"#, q(challenge), q(origin)).into_bytes()
}

/// Sign in with a key plugged in: the page at `origin` asked `ask`. Blocks until the key is touched (or times out).
pub fn get(origin: &str, ask: &Ask) -> Result<Signed, String> {
    if !may_ask(origin, &ask.rp_id) {
        return Err(format!("{origin} may not ask for a key of {}", ask.rp_id));
    }
    let data = client_data(origin, &ask.challenge);
    let hash: [u8; 32] = Sha256::digest(&data).into();
    let allow = ask.allow.iter().map(|a| unb64u(a)).collect::<Result<Vec<_>, _>>()?;
    let keys = devices();
    if keys.is_empty() {
        return Err("no security key is plugged in".into());
    }
    // first, silently, which key holds one of the credentials (no touch asked); then that key, with the touch
    let mut chosen = None;
    let mut last = String::new();
    for path in &keys {
        let mut dev = match Device::open(path) {
            Ok(d) => d,
            Err(e) => {
                last = format!("{}: {e}", path.display());
                continue;
            }
        };
        if allow.is_empty() {
            chosen = Some(dev);
            break;
        }
        match dev.get_assertion(&ask.rp_id, &hash, &allow, false) {
            Ok(_) => {
                chosen = Some(dev);
                break;
            }
            Err(Failure::Status(NO_CREDENTIALS)) => last = "this key is not registered with this site".into(),
            Err(e) => last = e.to_string(),
        }
    }
    let Some(mut dev) = chosen else { return Err(last) };
    let a = dev.get_assertion(&ask.rp_id, &hash, &allow, true).map_err(|e| e.to_string())?;
    let id = a.credential.or_else(|| (allow.len() == 1).then(|| allow[0].clone())).ok_or("the key named no credential")?;
    Ok(Signed { id: b64u(&id), client_data_json: b64u(&data), authenticator_data: b64u(&a.auth_data), signature: b64u(&a.signature), user_handle: a.user.as_deref().map(b64u) })
}

/// The FIDO keys plugged in: each hidraw device whose report descriptor declares the FIDO usage page (0xF1D0).
pub fn devices() -> Vec<PathBuf> {
    let Ok(dir) = std::fs::read_dir("/sys/class/hidraw") else { return Vec::new() };
    let mut out: Vec<PathBuf> = dir
        .filter_map(|e| e.ok())
        .filter(|e| std::fs::read(e.path().join("device/report_descriptor")).is_ok_and(|d| is_fido(&d)))
        .map(|e| Path::new("/dev").join(e.file_name()))
        .collect();
    out.sort();
    out
}

/// A report descriptor's Usage Page item for FIDO: `06 D0 F1` (a 2-byte global item, little-endian 0xF1D0).
fn is_fido(descriptor: &[u8]) -> bool {
    descriptor.windows(3).any(|w| w == [0x06, 0xd0, 0xf1])
}

#[derive(Debug)]
enum Failure {
    Io(std::io::Error),
    /// The key's CTAP2 status.
    Status(u8),
    /// A CTAPHID error, or an answer that is not one.
    Protocol(String),
}

impl std::fmt::Display for Failure {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Failure::Io(e) => write!(f, "the key: {e}"),
            Failure::Status(NO_CREDENTIALS) => f.write_str("this key is not registered with this site"),
            Failure::Status(OPERATION_DENIED) => f.write_str("refused on the key"),
            Failure::Status(USER_ACTION_TIMEOUT) => f.write_str("the key was not touched in time"),
            Failure::Status(PIN_REQUIRED) => f.write_str("this site needs the key's PIN, which this window does not ask yet: sign in in a browser"),
            Failure::Status(s) => write!(f, "the key said 0x{s:02x}"),
            Failure::Protocol(why) => write!(f, "the key: {why}"),
        }
    }
}

impl From<std::io::Error> for Failure {
    fn from(e: std::io::Error) -> Self {
        Failure::Io(e)
    }
}

struct Assertion {
    credential: Option<Vec<u8>>,
    auth_data: Vec<u8>,
    signature: Vec<u8>,
    user: Option<Vec<u8>>,
}

/// One key, on a channel of its own.
struct Device<T: Read + Write = File> {
    io: T,
    cid: [u8; 4],
}

impl Device<File> {
    fn open(path: &Path) -> Result<Self, Failure> {
        let io = OpenOptions::new().read(true).write(true).open(path)?;
        Device::init(io)
    }
}

impl<T: Read + Write> Device<T> {
    fn init(io: T) -> Result<Self, Failure> {
        let mut d = Device { io, cid: BROADCAST };
        let mut nonce = [0u8; 8];
        File::open("/dev/urandom").and_then(|mut f| f.read_exact(&mut nonce))?;
        d.send(CMD_INIT, &nonce)?;
        loop {
            let (cmd, data) = d.recv()?;
            if cmd == CMD_INIT && data.len() >= 12 && data[..8] == nonce {
                d.cid.copy_from_slice(&data[8..12]);
                return Ok(d);
            }
        }
    }

    /// `data` as CTAPHID packets on this channel (each report written with its report id, 0, first).
    fn send(&mut self, cmd: u8, data: &[u8]) -> Result<(), Failure> {
        let len = u16::try_from(data.len()).map_err(|_| Failure::Protocol("a request too long".into()))?;
        let mut first = vec![0u8; REPORT + 1];
        first[1..5].copy_from_slice(&self.cid);
        first[5] = cmd;
        first[6..8].copy_from_slice(&len.to_be_bytes());
        let n = data.len().min(REPORT - 7);
        first[8..8 + n].copy_from_slice(&data[..n]);
        self.io.write_all(&first)?;
        for (seq, chunk) in data[n..].chunks(REPORT - 5).enumerate() {
            let mut next = vec![0u8; REPORT + 1];
            next[1..5].copy_from_slice(&self.cid);
            next[5] = seq as u8;
            next[6..6 + chunk.len()].copy_from_slice(chunk);
            self.io.write_all(&next)?;
        }
        Ok(())
    }

    /// The next whole message on this channel (other channels' packets passed over), keep-alives skipped.
    fn recv(&mut self) -> Result<(u8, Vec<u8>), Failure> {
        loop {
            let mut p = [0u8; REPORT];
            self.io.read_exact(&mut p)?;
            if p[..4] != self.cid || p[4] & 0x80 == 0 {
                continue;
            }
            let (cmd, len) = (p[4], u16::from_be_bytes([p[5], p[6]]) as usize);
            if cmd == CMD_KEEPALIVE {
                continue;
            }
            let mut data = p[7..7 + len.min(REPORT - 7)].to_vec();
            let mut seq = 0u8;
            while data.len() < len {
                self.io.read_exact(&mut p)?;
                if p[..4] != self.cid {
                    continue;
                }
                if p[4] != seq {
                    return Err(Failure::Protocol(format!("packet {} where {seq} was due", p[4])));
                }
                seq = seq.wrapping_add(1);
                let take = (len - data.len()).min(REPORT - 5);
                data.extend_from_slice(&p[5..5 + take]);
            }
            if cmd == CMD_ERROR {
                return Err(Failure::Protocol(format!("CTAPHID error 0x{:02x}", data.first().copied().unwrap_or(0))));
            }
            return Ok((cmd, data));
        }
    }

    /// authenticatorGetAssertion: `up` asks for the touch (the key blinks until then).
    fn get_assertion(&mut self, rp_id: &str, hash: &[u8; 32], allow: &[Vec<u8>], up: bool) -> Result<Assertion, Failure> {
        let mut req = vec![GET_ASSERTION];
        req.extend(assertion_request(rp_id, hash, allow, up));
        self.send(CMD_CBOR, &req)?;
        let (cmd, data) = self.recv()?;
        if cmd != CMD_CBOR || data.is_empty() {
            return Err(Failure::Protocol("not a CBOR answer".into()));
        }
        if data[0] != 0 {
            return Err(Failure::Status(data[0]));
        }
        parse_assertion(&data[1..]).ok_or_else(|| Failure::Protocol("an assertion that does not read".into()))
    }
}

/// The request's CBOR map, canonical (keys 1, 2, 3, 5 in order; a descriptor's `id` before `type`).
fn assertion_request(rp_id: &str, hash: &[u8; 32], allow: &[Vec<u8>], up: bool) -> Vec<u8> {
    use ciborium::Value as V;
    let mut map = vec![(V::Integer(1.into()), V::Text(rp_id.into())), (V::Integer(2.into()), V::Bytes(hash.to_vec()))];
    if !allow.is_empty() {
        let list = allow.iter().map(|id| V::Map(vec![(V::Text("id".into()), V::Bytes(id.clone())), (V::Text("type".into()), V::Text("public-key".into()))])).collect();
        map.push((V::Integer(3.into()), V::Array(list)));
    }
    map.push((V::Integer(5.into()), V::Map(vec![(V::Text("up".into()), V::Bool(up))])));
    let mut out = Vec::new();
    ciborium::into_writer(&V::Map(map), &mut out).expect("CBOR into memory");
    out
}

fn parse_assertion(cbor: &[u8]) -> Option<Assertion> {
    use ciborium::Value as V;
    let V::Map(map) = ciborium::from_reader::<V, _>(cbor).ok()? else { return None };
    let field = |k: u8| map.iter().find(|(key, _)| key.as_integer().is_some_and(|i| i == k.into())).map(|(_, v)| v);
    let id_of = |v: &V| v.as_map()?.iter().find(|(k, _)| k.as_text() == Some("id")).and_then(|(_, v)| v.as_bytes().cloned());
    Some(Assertion {
        credential: field(1).and_then(id_of),
        auth_data: field(2)?.as_bytes()?.clone(),
        signature: field(3)?.as_bytes()?.clone(),
        user: field(4).and_then(id_of),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::VecDeque;

    #[test]
    fn a_page_asks_only_for_its_own_site_and_over_https() {
        assert!(may_ask("https://auth.example.org", "example.org"));
        assert!(may_ask("https://auth.example.org:8443", "auth.example.org"));
        assert!(!may_ask("https://evil.example.net", "example.org"));
        assert!(!may_ask("https://notexample.org", "example.org"), "a look-alike is not under it");
        assert!(!may_ask("http://auth.example.org", "example.org"), "never over http");
        assert!(!may_ask("https://auth.example.org", "org"), "never a whole top-level domain");
    }

    #[test]
    fn the_client_data_is_a_browsers() {
        let d = String::from_utf8(client_data("https://auth.example.org", "q83v")).unwrap();
        assert_eq!(d, r#"{"type":"webauthn.get","challenge":"q83v","origin":"https://auth.example.org","crossOrigin":false}"#);
    }

    #[test]
    fn a_fido_key_is_found_by_its_usage_page() {
        // a YubiKey's FIDO interface starts so; a keyboard's does not carry 0xF1D0
        assert!(is_fido(&[0x06, 0xd0, 0xf1, 0x09, 0x01, 0xa1, 0x01]));
        assert!(!is_fido(&[0x05, 0x01, 0x09, 0x06, 0xa1, 0x01]));
    }

    /// A key on the other end of the reports: answers INIT with channel 7, then each CBOR request with `answer`.
    struct Fake {
        written: Vec<Vec<u8>>,
        out: VecDeque<[u8; REPORT]>,
        answer: Vec<u8>,
    }

    impl Fake {
        fn packets(cid: [u8; 4], cmd: u8, data: &[u8]) -> Vec<[u8; REPORT]> {
            let mut out = Vec::new();
            let mut p = [0u8; REPORT];
            p[..4].copy_from_slice(&cid);
            p[4] = cmd;
            p[5..7].copy_from_slice(&(data.len() as u16).to_be_bytes());
            let n = data.len().min(REPORT - 7);
            p[7..7 + n].copy_from_slice(&data[..n]);
            out.push(p);
            for (seq, c) in data[n..].chunks(REPORT - 5).enumerate() {
                let mut q = [0u8; REPORT];
                q[..4].copy_from_slice(&cid);
                q[4] = seq as u8;
                q[5..5 + c.len()].copy_from_slice(c);
                out.push(q);
            }
            out
        }
    }

    impl Write for Fake {
        fn write(&mut self, b: &[u8]) -> std::io::Result<usize> {
            assert_eq!(b.len(), REPORT + 1, "a whole report with its id");
            self.written.push(b.to_vec());
            let p = &b[1..];
            if p[4] == CMD_INIT {
                let mut data = p[7..15].to_vec(); // the nonce back, then the channel
                data.extend([0, 0, 0, 7, 2, 5, 4, 3, 1]);
                self.out.extend(Self::packets(BROADCAST, CMD_INIT, &data));
            } else if p[4] == CMD_CBOR {
                // someone else's packet first, and a keep-alive while "waiting for the touch"
                self.out.extend(Self::packets([9, 9, 9, 9], CMD_CBOR, &[0]));
                self.out.extend(Self::packets([0, 0, 0, 7], CMD_KEEPALIVE, &[2]));
                let answer = self.answer.clone();
                self.out.extend(Self::packets([0, 0, 0, 7], CMD_CBOR, &answer));
            }
            Ok(b.len())
        }
        fn flush(&mut self) -> std::io::Result<()> {
            Ok(())
        }
    }

    impl Read for Fake {
        fn read(&mut self, b: &mut [u8]) -> std::io::Result<usize> {
            let p = self.out.pop_front().expect("a read with nothing due");
            b[..REPORT].copy_from_slice(&p);
            Ok(REPORT)
        }
    }

    #[test]
    fn an_assertion_goes_over_ctaphid_and_comes_back_whole() {
        use ciborium::Value as V;
        // an answer longer than one packet: the continuation packets are put together
        let answer = V::Map(vec![
            (V::Integer(1.into()), V::Map(vec![(V::Text("id".into()), V::Bytes(vec![1, 2, 3])), (V::Text("type".into()), V::Text("public-key".into()))])),
            (V::Integer(2.into()), V::Bytes(vec![0xaa; 37])),
            (V::Integer(3.into()), V::Bytes(vec![0x30; 71])),
        ]);
        let mut bytes = vec![0u8];
        ciborium::into_writer(&answer, &mut bytes).unwrap();
        let fake = Fake { written: Vec::new(), out: VecDeque::new(), answer: bytes };
        let mut d = Device::init(fake).unwrap();
        assert_eq!(d.cid, [0, 0, 0, 7]);
        let a = d.get_assertion("example.org", &[7; 32], &[vec![1, 2, 3]], true).unwrap();
        assert_eq!((a.credential, a.auth_data.len(), a.signature.len(), a.user), (Some(vec![1, 2, 3]), 37, 71, None));
        // the request: on the key's channel, getAssertion, its map canonical
        let first = &d.io.written[1][1..];
        assert_eq!((&first[..4], first[4], first[7]), (&[0, 0, 0, 7][..], CMD_CBOR, GET_ASSERTION));
        let want = assertion_request("example.org", &[7; 32], &[vec![1, 2, 3]], true);
        let sent: Vec<u8> = d.io.written[1..].iter().enumerate().flat_map(|(i, w)| if i == 0 { w[9..].to_vec() } else { w[6..].to_vec() }).take(want.len()).collect();
        assert_eq!(sent, want);
        // a refusal is the key's status
        d.io.answer = vec![NO_CREDENTIALS];
        assert!(matches!(d.get_assertion("example.org", &[7; 32], &[], false), Err(Failure::Status(NO_CREDENTIALS))));
    }

    /// With a key plugged in: asks it silently for a site it has no credential for (no touch needed).
    #[test]
    #[ignore = "needs a FIDO2 key plugged in"]
    fn a_real_key_answers() {
        let keys = devices();
        assert!(!keys.is_empty(), "no FIDO key found under /sys/class/hidraw");
        let mut d = Device::open(&keys[0]).unwrap();
        let r = d.get_assertion("atlas-test.example.org", &[1; 32], &[vec![0; 16]], false);
        assert!(matches!(r, Err(Failure::Status(NO_CREDENTIALS))), "{:?}", r.err());
    }
}
