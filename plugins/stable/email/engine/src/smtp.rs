//! Sending (SMTP, RFC 5321): TLS from the start (465) or STARTTLS, AUTH PLAIN / LOGIN with a password or XOAUTH2 with
//! Outlook's token, every recipient tried and the refused ones reported, the message dot-stuffed with CRLF line ends.
//! Small on purpose: the same TLS stack as IMAP (imap::open), nothing else.

use crate::account::{Account, Auth, Security};
use crate::imap::{open, Stream};
use base64::Engine;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};

struct Conn {
    io: BufReader<Stream>,
    host: String,
}

impl Conn {
    /// One reply (possibly several "250-" lines) → (code, text of its lines).
    async fn reply(&mut self) -> Result<(u16, Vec<String>), String> {
        let mut lines = vec![];
        loop {
            let mut l = String::new();
            let n = tokio::time::timeout(std::time::Duration::from_secs(60), self.io.read_line(&mut l))
                .await
                .map_err(|_| format!("{} stopped answering", self.host))?
                .map_err(|e| format!("{}: {e}", self.host))?;
            if n == 0 {
                return Err(format!("{} closed the connection", self.host));
            }
            let l = l.trim_end().to_string();
            let code: u16 = l.get(..3).and_then(|c| c.parse().ok()).ok_or_else(|| format!("{} answered nonsense: {l}", self.host))?;
            let more = l.as_bytes().get(3) == Some(&b'-');
            lines.push(l.get(4..).unwrap_or("").to_string());
            if !more {
                return Ok((code, lines));
            }
        }
    }

    async fn send(&mut self, line: &str) -> Result<(u16, Vec<String>), String> {
        self.io.get_mut().write_all(format!("{line}\r\n").as_bytes()).await.map_err(|e| format!("{}: {e}", self.host))?;
        self.io.get_mut().flush().await.map_err(|e| format!("{}: {e}", self.host))?;
        self.reply().await
    }

    async fn expect(&mut self, line: &str, ok: u16, what: &str) -> Result<Vec<String>, String> {
        let (code, text) = self.send(line).await?;
        if code / 100 != ok / 100 {
            return Err(format!("{} refused {what}: {code} {}", self.host, text.join(" ")));
        }
        Ok(text)
    }
}

/// What a send did: who was refused (the others got it).
#[derive(Debug, Default, PartialEq)]
pub struct Sent {
    pub refused: Vec<(String, String)>,
}

/// Sends `raw` from `from` to every address of `to` (envelope recipients: To, Cc and Bcc together).
pub async fn send(acc: &Account, token: Option<String>, from: &str, to: &[String], raw: &[u8]) -> Result<Sent, String> {
    if to.is_empty() {
        return Err("nobody to send it to: fill in To".into());
    }
    let host = acc.smtp.host.clone();
    let stream = open(&acc.smtp).await?;
    let mut c = Conn { io: BufReader::new(stream), host: host.clone() };
    let (code, text) = c.reply().await?;
    if code != 220 {
        return Err(format!("{host} will not take mail now: {code} {}", text.join(" ")));
    }
    let me = "atlas.localdomain";
    let mut caps = c.expect(&format!("EHLO {me}"), 250, "EHLO").await?;
    if acc.smtp.security == Security::StartTls {
        c.expect("STARTTLS", 220, "STARTTLS").await?;
        let Stream::Plain(tcp) = c.io.into_inner() else { return Err("STARTTLS on a TLS connection".into()) };
        let name = tokio_rustls::rustls::pki_types::ServerName::try_from(host.clone()).map_err(|_| format!("{host} is not a server name"))?;
        let tls = tokio_rustls::TlsConnector::from(crate::imap::tls_config()).connect(name, tcp).await.map_err(|e| format!("TLS with {host} failed: {e}"))?;
        c = Conn { io: BufReader::new(Stream::Tls(Box::new(tls))), host: host.clone() };
        caps = c.expect(&format!("EHLO {me}"), 250, "EHLO").await?;
    }
    let auths: Vec<String> = caps.iter().filter_map(|l| l.to_uppercase().strip_prefix("AUTH").map(|a| a.trim_start_matches(['=', ' ']).to_string())).flat_map(|a| a.split_whitespace().map(String::from).collect::<Vec<_>>()).collect();
    let b64 = |s: &str| base64::engine::general_purpose::STANDARD.encode(s.as_bytes());
    match &acc.auth {
        Auth::Outlook { .. } => {
            let tok = token.ok_or("not signed in to Outlook: run “Email: sign in to Outlook…”")?;
            c.expect(&format!("AUTH XOAUTH2 {}", b64(&format!("user={}\x01auth=Bearer {tok}\x01\x01", acc.user))), 235, "the sign-in").await.map_err(|e| format!("{e} — sign in to Outlook again"))?;
        }
        Auth::Password(pw) if !auths.is_empty() => {
            if pw.is_empty() {
                return Err(format!("no password for {} yet: set it in Settings → Plugins & automation → Email", acc.name));
            }
            if auths.iter().any(|a| a == "PLAIN") || !auths.iter().any(|a| a == "LOGIN") {
                c.expect(&format!("AUTH PLAIN {}", b64(&format!("\0{}\0{pw}", acc.user))), 235, "the user name or password").await?;
            } else {
                c.expect("AUTH LOGIN", 334, "AUTH LOGIN").await?;
                c.expect(&b64(&acc.user), 334, "the user name").await?;
                c.expect(&b64(pw), 235, "the password").await?;
            }
        }
        Auth::Password(_) => {} // a server that asks for no sign-in (a local relay)
    }
    c.expect(&format!("MAIL FROM:<{from}>"), 250, &format!("the sender {from}")).await?;
    let mut sent = Sent::default();
    for r in to {
        let (code, text) = c.send(&format!("RCPT TO:<{r}>")).await?;
        if code / 100 != 2 {
            sent.refused.push((r.clone(), format!("{code} {}", text.join(" "))));
        }
    }
    if sent.refused.len() == to.len() {
        let _ = c.send("QUIT").await;
        return Err(format!("{host} refused every recipient: {}", sent.refused.iter().map(|(a, w)| format!("{a} ({w})")).collect::<Vec<_>>().join(", ")));
    }
    c.expect("DATA", 354, "the message").await?;
    let data = dot_stuff(raw);
    c.io.get_mut().write_all(&data).await.map_err(|e| format!("{host}: {e}"))?;
    c.expect(".", 250, "the message").await?;
    let _ = c.send("QUIT").await;
    Ok(sent)
}

/// CRLF line ends, a leading "." doubled (RFC 5321 4.5.2); the end mark is the caller's ".".
pub fn dot_stuff(raw: &[u8]) -> Vec<u8> {
    let mut out = Vec::with_capacity(raw.len() + 64);
    let mut at_start = true;
    let mut i = 0;
    while i < raw.len() {
        let b = raw[i];
        if at_start && b == b'.' {
            out.push(b'.');
        }
        match b {
            b'\r' if raw.get(i + 1) == Some(&b'\n') => {
                out.extend_from_slice(b"\r\n");
                i += 1;
                at_start = true;
            }
            b'\n' | b'\r' => {
                out.extend_from_slice(b"\r\n");
                at_start = true;
            }
            _ => {
                out.push(b);
                at_start = false;
            }
        }
        i += 1;
    }
    if !out.ends_with(b"\r\n") {
        out.extend_from_slice(b"\r\n");
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn dots_and_line_ends() {
        assert_eq!(dot_stuff(b"a\n.b\r\n..c\rd"), b"a\r\n..b\r\n...c\r\nd\r\n");
        assert_eq!(dot_stuff(b".\r\n"), b"..\r\n");
    }
}
