//! Writing a capture: through the Atlas open on that vault (its window updates, and one core runs the
//! vault's schedules), else straight to the files — what `atlas capture` does.
use anyhow::{anyhow, bail, Context, Result};
use std::io::{Read, Write};
use std::path::Path;

/// → (path, line) of what was written. An Atlas that is listed as serving the vault but takes no connection (it
/// crashed, or is closing) is passed by: the files are written directly, so the capture is never lost. Once the
/// request is sent, a failure is said instead — the open Atlas may have written it already.
pub fn capture(root: &Path, text: &str) -> Result<(String, u64)> {
    if let Some(base) = atlas_core::vaults::running_server(root) {
        let body = serde_json::json!({ "args": { "text": text } }).to_string();
        match post(&base, "/api/cmd/capture", &body) {
            Err(Post::Unreachable) => {} // to the files below
            Err(Post::Failed(e)) => return Err(e),
            Ok(v) => {
                if v["ok"].as_bool() != Some(true) {
                    bail!("{}", v["error"].as_str().unwrap_or("the open Atlas refused it"));
                }
                let r = &v["result"];
                return Ok((r["path"].as_str().unwrap_or("").to_string(), r["line"].as_u64().unwrap_or(0)));
            }
        }
    }
    let ws = atlas_core::Workspace::open(root)?;
    let r = atlas_core::capture::capture_unserved(ws.root(), &ws.config()?, text)?;
    Ok((r.path.to_string(), r.line as u64))
}

/// Copies a file (the screen, a picture, a shared file) beside today's log note, where captures go → (path, embed).
/// The desktop box and the phone app both attach through here.
pub fn attach(root: &Path, name: &str, source: &Path) -> Result<(String, String)> {
    let ws = atlas_core::Workspace::open(root)?;
    let cfg = ws.config()?;
    let note = atlas_core::capture::day_log(&cfg, chrono::Local::now().date_naive());
    let bytes = std::fs::read(source).with_context(|| source.display().to_string())?;
    let a = atlas_core::files::attach(&ws, &note, name, &bytes)?;
    Ok((a.path, a.embed))
}

/// Why a POST to the open Atlas did not answer.
#[derive(Debug)]
enum Post {
    /// no connection: nothing reached it
    Unreachable,
    /// sent (or half sent): it may have acted on it
    Failed(anyhow::Error),
}

/// One POST to the core on localhost, with no HTTP client library (the box must start fast and small); with the
/// core's key when it left one — a locked core (the phone's in-app one, local_lock.rs) refuses anything without it.
fn post(base: &str, path: &str, body: &str) -> std::result::Result<serde_json::Value, Post> {
    let rest = base.trim_start_matches("http://");
    let host = rest.split('/').next().unwrap_or(rest);
    let prefix = rest[host.len()..].trim_end_matches('/');
    let key = atlas_core::auth::local_key_header(host);
    let s = std::net::TcpStream::connect_timeout(&host.parse().map_err(|e| Post::Failed(anyhow!("{host}: {e}")))?, std::time::Duration::from_secs(2))
        .map_err(|_| Post::Unreachable)?;
    exchange(s, host, prefix, &key, path, body).map_err(Post::Failed)
}

fn exchange(mut s: std::net::TcpStream, host: &str, prefix: &str, key: &str, path: &str, body: &str) -> Result<serde_json::Value> {
    s.set_read_timeout(Some(std::time::Duration::from_secs(10)))?;
    write!(s, "POST {prefix}{path} HTTP/1.1\r\nHost: {host}\r\nx-atlas: 1\r\n{key}content-type: application/json\r\ncontent-length: {}\r\nconnection: close\r\n\r\n{body}", body.len())?;
    let mut raw = Vec::new();
    s.read_to_end(&mut raw)?;
    let text = String::from_utf8_lossy(&raw);
    let (head, rest) = text.split_once("\r\n\r\n").ok_or_else(|| anyhow!("no answer from the open Atlas"))?;
    let body = if head.to_ascii_lowercase().contains("transfer-encoding: chunked") { dechunk(rest) } else { rest.to_string() };
    serde_json::from_str(&body).context("the open Atlas's answer")
}

fn dechunk(mut rest: &str) -> String {
    let mut out = String::new();
    while let Some((size, tail)) = rest.split_once("\r\n") {
        let n = usize::from_str_radix(size.trim(), 16).unwrap_or(0);
        if n == 0 || tail.len() < n {
            break;
        }
        out.push_str(&tail[..n]);
        rest = tail[n..].trim_start_matches("\r\n");
    }
    out
}
