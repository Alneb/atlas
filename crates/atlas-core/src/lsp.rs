//! Language servers for the code editor. Each `/api/lsp/{lang}` WebSocket spawns one server in the
//! workspace root and relays JSON-RPC: LSP's `Content-Length` framing on stdio ↔ one WebSocket text
//! message per JSON message (what @codemirror/lsp-client's Transport expects). The server dies with
//! the socket; its stderr goes to `.atlas/cache/lsp-<lang>.log`.
use crate::api::LspServerInfo;
use crate::config::{Config, LspConfig};
use crate::Workspace;
use axum::extract::ws::{CloseFrame, Message, WebSocket};
use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use tokio::io::{AsyncBufRead, AsyncBufReadExt, AsyncReadExt, AsyncWriteExt, BufReader};
use ts_rs::TS;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "lowercase")]
#[ts(export)]
pub enum LspLang {
    Rust,
    Python,
    Latex,
    C,
}

impl LspLang {
    pub const ALL: [LspLang; 4] = [LspLang::Rust, LspLang::Python, LspLang::Latex, LspLang::C];

    pub fn extensions(self) -> &'static [&'static str] {
        match self {
            LspLang::Rust => &["rs"],
            LspLang::Python => &["py", "pyi"],
            LspLang::Latex => &["tex", "bib", "sty", "cls"],
            LspLang::C => &["c", "h", "cc", "cpp", "cxx", "hpp", "hh"],
        }
    }

    /// Known servers, best first (used when the setting is empty).
    fn candidates(self) -> &'static [&'static [&'static str]] {
        match self {
            LspLang::Rust => &[&["rust-analyzer"]],
            LspLang::Python => {
                &[&["basedpyright-langserver", "--stdio"], &["pyright-langserver", "--stdio"], &["pylsp"]]
            }
            LspLang::Latex => &[&["texlab"]],
            LspLang::C => &[&["clangd"]],
        }
    }

    fn setting(self, c: &LspConfig) -> &str {
        match self {
            LspLang::Rust => &c.rust,
            LspLang::Python => &c.python,
            LspLang::Latex => &c.latex,
            LspLang::C => &c.c,
        }
    }

    fn name(self) -> &'static str {
        match self {
            LspLang::Rust => "rust",
            LspLang::Python => "python",
            LspLang::Latex => "latex",
            LspLang::C => "c",
        }
    }
}

/// Executable lookup: a path (`~` expanded, relative = from the workspace root) must exist; a bare
/// name is searched on PATH and in the usual per-user bin folders (a desktop-launched app often has
/// a minimal PATH).
fn find_exe(name: &str, root: &Path) -> Option<PathBuf> {
    if name.contains('/') {
        return crate::platform::run_line::executable(&root.join(crate::pty::expand_home(name))); // join keeps an absolute path as is
    }
    if let Some(p) = crate::platform::host::find(name) {
        return Some(p); // in a Flatpak: the host's server (it runs there)
    }
    let home = crate::platform::dirs::home();
    let extra = home.iter().flat_map(|h| [h.join(".cargo/bin"), h.join(".local/bin")]);
    std::env::var_os("PATH")
        .map(|p| std::env::split_paths(&p).collect::<Vec<_>>())
        .unwrap_or_default()
        .into_iter()
        .chain(extra)
        .find_map(|d| crate::platform::run_line::executable(&d.join(name)))
}

/// The command line to run for `lang`, with its executable resolved; None = no server.
pub fn command(lang: LspLang, cfg: &Config, root: &Path) -> Option<Vec<String>> {
    if !cfg.lsp.enabled {
        return None;
    }
    let set = lang.setting(&cfg.lsp).trim();
    let argv: Vec<Vec<String>> = match set {
        "off" => return None,
        "" => lang.candidates().iter().map(|c| c.iter().map(|s| s.to_string()).collect()).collect(),
        s => vec![s.split_whitespace().map(String::from).collect()],
    };
    argv.into_iter().find_map(|mut a| {
        a[0] = find_exe(&a[0], root)?.to_string_lossy().into_owned();
        Some(a)
    })
}

pub fn servers(cfg: &Config, root: &Path) -> Vec<LspServerInfo> {
    LspLang::ALL
        .iter()
        .map(|&lang| LspServerInfo {
            lang,
            extensions: lang.extensions().iter().map(|e| e.to_string()).collect(),
            command: command(lang, cfg, root),
            root_uri: String::new(),
        })
        .collect()
}

/// One framed message from a server's stdout; Ok(None) at end of stream.
async fn read_message<R: AsyncBufRead + Unpin>(r: &mut R) -> std::io::Result<Option<String>> {
    let mut len: Option<usize> = None;
    loop {
        let mut line = String::new();
        if r.read_line(&mut line).await? == 0 {
            return Ok(None);
        }
        let line = line.trim_end();
        if line.is_empty() {
            if len.is_some() {
                break;
            }
            continue; // stray blank line between messages
        }
        if let Some((k, v)) = line.split_once(':') {
            if k.eq_ignore_ascii_case("content-length") {
                len = v.trim().parse().ok();
            }
        }
    }
    let mut body = vec![0u8; len.unwrap_or(0)];
    r.read_exact(&mut body).await?;
    Ok(Some(String::from_utf8_lossy(&body).into_owned()))
}

fn frame(msg: &str) -> Vec<u8> {
    let mut out = format!("Content-Length: {}\r\n\r\n", msg.len()).into_bytes();
    out.extend_from_slice(msg.as_bytes());
    out
}

pub async fn session(socket: WebSocket, ws: Workspace, lang: LspLang) {
    if let Err(e) = run(socket, &ws, lang).await {
        eprintln!("atlas: {} language server: {e:#}", lang.name());
    }
}

async fn run(mut socket: WebSocket, ws: &Workspace, lang: LspLang) -> anyhow::Result<()> {
    let Some(argv) = command(lang, &ws.config()?, ws.root()) else {
        let _ = socket.send(Message::Close(Some(gone(CLOSE_NONE, "no server configured or found")))).await;
        anyhow::bail!("no server configured or found");
    };
    let log = crate::vault_write::cache::file(&ws.cache_dir().join(format!("lsp-{}.log", lang.name())))?;
    let cfg = ws.config()?;
    let locale = cfg.lsp.language.clone();
    let mut cmd = std::process::Command::new(&argv[0]);
    // the Python server sees the vault's environment's packages (python_env.rs)
    if lang == LspLang::Python {
        if let Some(env) = crate::python_env::chosen(&cfg, ws.root()) {
            cmd.envs(crate::python_env::vars(&env));
        }
    }
    if !locale.trim().is_empty() {
        // servers localize from the environment (pyright: LC_ALL / LC_MESSAGES / LANG / LANGUAGE)
        let lang_only = locale.split(['_', '.']).next().unwrap_or("en").to_string();
        cmd.env("LC_ALL", &locale).env("LC_MESSAGES", &locale).env("LANG", &locale).env("LANGUAGE", lang_only);
    }
    cmd.args(&argv[1..]).current_dir(ws.root());
    let mut child = tokio::process::Command::from(crate::platform::host::std_command(cmd)?)
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(log)
        .kill_on_drop(true)
        .spawn()?;
    let mut stdin = child.stdin.take().expect("piped");
    let mut stdout = BufReader::new(child.stdout.take().expect("piped"));
    let (mut sink, mut stream) = socket.split();
    loop {
        tokio::select! {
            msg = read_message(&mut stdout) => match msg? {
                Some(m) => if sink.send(Message::Text(m.into())).await.is_err() { break },
                None => {
                    // the server exited on its own: the page is told how, so it reports a dead server only then
                    // (not when the page itself closed the socket, e.g. the tab closed before the first answer)
                    let status = tokio::time::timeout(std::time::Duration::from_secs(2), child.wait()).await;
                    let how = match status {
                        Ok(Ok(s)) => format!("exited ({s})"),
                        _ => "closed its output".to_string(),
                    };
                    let _ = sink.send(Message::Close(Some(gone(CLOSE_EXITED, &how)))).await;
                    break;
                }
            },
            msg = stream.next() => match msg {
                Some(Ok(Message::Text(t))) => {
                    stdin.write_all(&frame(&t)).await?;
                    stdin.flush().await?;
                }
                Some(Ok(Message::Close(_))) | None | Some(Err(_)) => break,
                Some(Ok(_)) => {}
            },
        }
    }
    let _ = child.start_kill();
    Ok(())
}

/// Close codes the page reads (lib/editor/lsp.ts `reportDead`): the server exited by itself, or there is none.
const CLOSE_EXITED: u16 = 4001;
const CLOSE_NONE: u16 = 4004;
fn gone(code: u16, reason: &str) -> CloseFrame {
    CloseFrame { code, reason: reason.chars().take(120).collect::<String>().into() }
}

/// Workspace root as the `file://` URI servers expect.
pub fn root_uri(root: &Path) -> String {
    format!("file://{}", root.to_string_lossy().replace(' ', "%20"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn frames_round_trip() {
        let mut bytes = frame(r#"{"id":1}"#);
        bytes.extend(b"Content-Type: application/vscode-jsonrpc; charset=utf-8\r\n");
        bytes.extend(frame("{\"é\":2}"));
        let mut r = BufReader::new(&bytes[..]);
        assert_eq!(read_message(&mut r).await.unwrap().as_deref(), Some(r#"{"id":1}"#));
        assert_eq!(read_message(&mut r).await.unwrap().as_deref(), Some("{\"é\":2}"), "length is in bytes");
        assert_eq!(read_message(&mut r).await.unwrap(), None);
    }

    #[test]
    fn command_honours_off_paths_and_missing_servers() {
        let d = tempfile::tempdir().unwrap();
        let exe = d.path().join("my-ls");
        std::fs::write(&exe, "#!/bin/sh\n").unwrap();
        let mut cfg = Config::default();
        cfg.lsp.python = format!("{} --stdio", exe.display());
        assert_eq!(command(LspLang::Python, &cfg, d.path()), Some(vec![exe.display().to_string(), "--stdio".into()]));
        cfg.lsp.python = "/nonexistent/ls".into();
        assert_eq!(command(LspLang::Python, &cfg, d.path()), None);
        cfg.lsp.python = "my-ls".into(); // bare name: PATH only
        assert_eq!(command(LspLang::Python, &cfg, d.path()), None);
        cfg.lsp.python = "./my-ls".into(); // relative path: from the workspace root
        assert_eq!(
            command(LspLang::Python, &cfg, d.path()),
            Some(vec![d.path().join("./my-ls").display().to_string()])
        );
        cfg.lsp.python = "off".into();
        assert_eq!(command(LspLang::Python, &cfg, d.path()), None);
        cfg.lsp.python = format!("{}", exe.display());
        cfg.lsp.enabled = false;
        assert_eq!(command(LspLang::Python, &cfg, d.path()), None);
    }
}
