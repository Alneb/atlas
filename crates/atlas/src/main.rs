//! `atlas`: the CLI face of the command registry. Talks to a running server when there is one
//! (so the UI updates live), otherwise works on the files directly — Atlas never has to run.
use anyhow::{bail, Context, Result};
use atlas_core::api::{CaptureResult, ServerFile, Today};
use atlas_core::{capture, commands, today, workspace, Workspace};
use clap::{Parser, Subcommand};
use serde_json::{json, Value};
use std::path::{Path, PathBuf};
use std::time::Duration;

mod mcp;

#[derive(Parser)]
#[command(name = "atlas", version, about = "Atlas workspace: serve, capture, run commands, open files")]
struct Cli {
    /// Workspace folder (default: nearest ancestor with `.atlas/`, else the current dir).
    #[arg(long, global = true)]
    workspace: Option<PathBuf>,
    #[command(subcommand)]
    action: Action,
}

#[derive(Subcommand)]
enum ServerAction {
    /// What is set: the sign-in mode, whether a password is set, the tokens, the sessions.
    Status,
    /// Set or change the owner's password (asked on the terminal, or read from stdin when piped).
    Password,
    /// A device token for an app (the phone: `--scope capture`); printed once.
    Token {
        name: String,
        #[arg(long, value_enum, default_value = "capture")]
        scope: TokenScope,
    },
    /// Remove a device token by its name.
    Revoke { name: String },
    /// End every browser's session (device tokens stay).
    SignOutAll,
}

#[derive(Clone, Copy, clap::ValueEnum)]
enum TokenScope {
    Capture,
    Full,
}

#[derive(Subcommand)]
enum Action {
    /// Serve a workspace over HTTP/WS on 127.0.0.1; with `--listen`, to the network, everyone signed in (docs/guides/SERVER.md).
    Serve {
        dir: Option<PathBuf>,
        #[arg(long, default_value_t = 7717)]
        port: u16,
        /// Server mode: listen on this address (e.g. 0.0.0.0:7700), with the sign-in of `atlas server`.
        #[arg(long)]
        listen: Option<std::net::SocketAddr>,
        /// Server mode, several vaults: every folder in DIR is a vault at /v/<folder>/ (a container's /vaults).
        #[arg(long, requires = "listen", conflicts_with = "dir")]
        vaults_in: Option<PathBuf>,
        /// Server mode, several vaults: NAME=PATH, repeatable; served at /v/NAME/.
        #[arg(long = "vault", value_name = "NAME=PATH", requires = "listen", conflicts_with = "dir")]
        vaults: Vec<String>,
    },
    /// Server mode's sign-in: the password, device tokens, sessions (kept in ~/.config/atlas and ~/.local/state/atlas).
    Server {
        #[command(subcommand)]
        action: ServerAction,
    },
    /// Append a timestamped line to today's log (reads stdin when no text is given).
    Capture { text: Vec<String> },
    /// Run a command by id, e.g. `atlas cmd notify '{"title":"done"}'`.
    Cmd { id: String, args: Option<String> },
    /// Open a file in the running Atlas UI.
    Open {
        path: PathBuf,
        #[arg(long)]
        line: Option<u32>,
    },
    /// Print today's focus, log, open tasks and activity.
    Today,
    /// Make the note (`<paper>/<citekey>.md`) of every reference that has none, so every paper is a file `[[citekey]]`
    /// links to; the vault's `literature` template shapes them, notes already there are never touched. The same as
    /// `atlas plugin call catalog-papers notes` (the Zotero sync command runs it after each sync).
    PaperNotes,
    /// Run an MCP server on stdio for Claude Code (register in `.mcp.json`).
    Mcp,
    /// Print the guide to extending Atlas from inside a vault (pages, commands, plugins) — for
    /// people and for AI agents; `--develop` prints the guide to changing Atlas itself.
    Guide {
        #[arg(long)]
        develop: bool,
    },
    /// Plugins of this vault: install (copied into .atlas/plugins/), update, remove, list.
    Plugin {
        #[command(subcommand)]
        action: PluginAction,
    },
    /// Drawings made small (docs/design/DESIGN-drawing-size.md): compact JSON, pen points rounded, pictures at most
    /// 2000 px (opaque ones as JPEG). Says what it would do; `--apply` does it, originals copied to .atlas/trash/ first.
    Drawings {
        #[arg(long)]
        apply: bool,
    },
    /// One note per thing (docs/design/DESIGN-shared-notes.md §4): the notes earlier versions left beside a PDF or a
    /// book (a note of its ink, a reader's note beside the paper's) and drawings' SVG exports. Says what it would do;
    /// `--apply` merges the reading places into the owning notes and moves the extras to the Trash (copies first).
    Companions {
        #[arg(long)]
        apply: bool,
    },
}

#[derive(Subcommand)]
enum PluginAction {
    /// Copy a plugin into the vault from a folder, a git address or a .zip / .tar.gz. It arrives
    /// switched off: read what it may do, then switch it on in Settings → Plugins (or pass --on).
    Install {
        from: String,
        /// The plugin's folder name in the vault (default: the last part of `from`).
        #[arg(long)]
        id: Option<String>,
        /// Switch it on at once.
        #[arg(long)]
        on: bool,
    },
    /// Install again from where the plugin came; the vault's own settings are kept, the old copy goes to .atlas/trash/.
    Update { id: String },
    /// Move a plugin's folder to .atlas/trash/.
    Remove { id: String },
    /// The plugins of this vault, whether they are on, and what each may do.
    List,
    /// Ask a plugin's helper, in the running Atlas: `atlas plugin call catalog-papers import '{"path": "x.pdf"}'`.
    /// The answer is printed as JSON.
    Call {
        id: String,
        method: String,
        /// The method's parameters, a JSON object.
        params: Option<String>,
    },
}

/// What a plugin asks to be allowed, in plain words (the same sentence Settings shows).
fn may(p: &atlas_core::plugins::Permissions, helper: bool) -> String {
    let mut parts = Vec::new();
    if p.net.iter().any(|h| h == "*") {
        parts.push("talk to any server on the network".into());
    } else if !p.net.is_empty() {
        parts.push(format!("talk to {}", p.net.join(", ")));
    }
    if p.secrets {
        parts.push("keep secrets (outside the vault)".into());
    }
    if helper {
        parts.push("run a program of its own".into());
    }
    if parts.is_empty() { "nothing outside the page".into() } else { parts.join(" · ") }
}

fn plugin_action(ws: &Workspace, action: PluginAction) -> Result<()> {
    use atlas_core::plugin_install::{self as inst, Source};
    let root = ws.root();
    let report = |verb: &str, r: &inst::Installed| {
        println!("{verb} {} — {}{}", r.id, r.title, r.version.as_deref().map(|v| format!(" v{v}")).unwrap_or_default());
        println!("  may: {}", may(&r.permissions, r.has_helper));
        if let Some(old) = &r.replaced {
            println!("  the copy it replaced is in {old}");
        }
    };
    match action {
        PluginAction::Install { from, id, on } => {
            let r = inst::install(root, &Source::parse(&from), id.as_deref(), false)?;
            report("installed", &r);
            if on {
                inst::set_off(root, &r.id, false)?;
                println!("  switched on");
            } else {
                println!("  it is switched off: switch it on in Settings → Plugins & automation (or install with --on)");
            }
        }
        PluginAction::Update { id } => {
            let r = inst::update(root, &id)?;
            report("updated", &r);
            println!("  {}", if r.on { "still switched on" } else { "still switched off" });
        }
        PluginAction::Remove { id } => println!("removed {id}: its folder is in {}", inst::remove(root, &id)?),
        PluginAction::Call { .. } => unreachable!("answered by the running Atlas, before"),
        PluginAction::List => {
            let off = ws.config()?.plugins.off;
            for p in atlas_core::plugins::list(root) {
                let state = if p.error.is_some() { "broken" } else if off.contains(&p.id) { "off" } else { "on" };
                println!("{:<8}{} — {}{}", state, p.id, p.title, p.version.as_deref().map(|v| format!(" v{v}")).unwrap_or_default());
                match &p.error {
                    Some(e) => println!("        {e}"),
                    None => {
                        println!("        may: {}", may(&p.permissions, p.has_helper));
                        if let Some(from) = &p.from {
                            println!("        from: {from}  (atlas plugin update {})", p.id);
                        }
                    }
                }
            }
        }
    }
    Ok(())
}

// The guides travel inside the binary, so every vault has them whatever is installed where.
const GUIDE_EXTENDING: &str = include_str!("../../../docs/guides/EXTENDING.md");
const GUIDE_DEVELOPING: &str = include_str!("../../../docs/guides/DEVELOPING.md");

fn workspace_root(flag: Option<PathBuf>) -> Result<PathBuf> {
    if let Some(p) = flag {
        return Ok(p);
    }
    let cwd = std::env::current_dir()?;
    Ok(workspace::find_root(&cwd).unwrap_or(cwd))
}

/// A live server for this workspace: `server.json` exists, and the port answers for our root.
pub(crate) struct Server {
    base: String,
    http: reqwest::Client,
}

/// What [`Server::reach`] found.
pub(crate) enum Reach {
    Live(Server),
    /// A core serves this workspace but turns this program away; its reason.
    Refused(String),
    Absent,
}

/// Who this program is to the core (`x-atlas-client`): "mcp" while `atlas mcp` runs, so a server can refuse agents.
pub(crate) static CLIENT: std::sync::OnceLock<&'static str> = std::sync::OnceLock::new();

impl Server {
    pub(crate) async fn find(ws: &Workspace) -> Option<Self> {
        match Self::reach(ws).await {
            Reach::Live(s) => Some(s),
            Reach::Refused(_) | Reach::Absent => None,
        }
    }

    /// The core serving this workspace: live, there but turning this program away (its words), or not running.
    pub(crate) async fn reach(ws: &Workspace) -> Reach {
        let Some(sf) = std::fs::read_to_string(ws.cache_dir().join("server.json")).ok().and_then(|t| serde_json::from_str::<ServerFile>(&t).ok()) else {
            return Reach::Absent;
        };
        let base = format!("http://127.0.0.1:{}{}", sf.port, sf.path);
        let Some(http) = Self::client(sf.port) else { return Reach::Absent };
        let Ok(resp) = http.get(format!("{base}/api/workspace")).header("x-atlas", "1").timeout(Duration::from_millis(800)).send().await else {
            return Reach::Absent;
        };
        if matches!(resp.status(), reqwest::StatusCode::UNAUTHORIZED | reqwest::StatusCode::FORBIDDEN) {
            let body: Value = resp.json().await.unwrap_or_default();
            return Reach::Refused(body["error"].as_str().unwrap_or("refused").to_string());
        }
        match resp.json::<Value>().await {
            Ok(info) if info["root"].as_str() == Some(&*ws.root().to_string_lossy()) => Reach::Live(Self { base, http }),
            _ => Reach::Absent,
        }
    }

    /// A client that signs in as this program: `atlas mcp` as its agent (ATLAS_AGENT_TOKEN, put in the agent's MCP
    /// config by Settings → Agents), anything else with this machine's key (auth.rs `local_key_file`).
    fn client(port: u16) -> Option<reqwest::Client> {
        let mut h = reqwest::header::HeaderMap::new();
        let agent = (CLIENT.get() == Some(&"mcp")).then(|| std::env::var("ATLAS_AGENT_TOKEN").ok()).flatten().filter(|t| !t.trim().is_empty());
        if let Some(key) = agent.or_else(|| atlas_core::auth::local_key(port)) {
            h.insert(reqwest::header::AUTHORIZATION, format!("Bearer {}", key.trim()).parse().ok()?);
        }
        if let Some(c) = CLIENT.get() {
            h.insert(atlas_core::auth::CLIENT_HEADER, reqwest::header::HeaderValue::from_static(c));
        }
        reqwest::Client::builder().timeout(Duration::from_secs(40)).default_headers(h).build().ok()
    }

    pub(crate) async fn get(&self, path: &str) -> Result<Value> {
        let resp = self.http.get(format!("{}{path}", self.base)).header("x-atlas", "1").send().await?;
        Ok(resp.error_for_status()?.json().await?)
    }

    /// A JSON body to `path`, waiting up to `timeout` for the answer; a refused request carries the core's own words.
    pub(crate) async fn post(&self, path: &str, body: &Value, timeout: Duration) -> Result<Value> {
        let resp = self.http.post(format!("{}{path}", self.base)).header("x-atlas", "1").json(body).timeout(timeout).send().await?;
        if !resp.status().is_success() {
            let status = resp.status();
            return Err(anyhow::anyhow!("{status}: {}", resp.text().await.unwrap_or_default()));
        }
        Ok(resp.json().await?)
    }

    pub(crate) async fn cmd(&self, id: &str, args: Value) -> Result<Value> {
        let resp: Value = self
            .http
            .post(format!("{}/api/cmd/{id}", self.base))
            .header("x-atlas", "1")
            .json(&json!({ "args": args }))
            .send()
            .await?
            .json()
            .await
            .context("server reply")?;
        unwrap_cmd(resp)
    }
}

/// Every folder of `dir` (hidden ones aside) as a vault named after it, in name order.
fn vaults_in_dir(dir: &Path) -> Result<Vec<atlas_core::server::Served>> {
    let mut out: Vec<_> = std::fs::read_dir(dir)
        .with_context(|| format!("--vaults-in {}", dir.display()))?
        .flatten()
        .filter(|e| e.file_type().is_ok_and(|t| t.is_dir()) && !e.file_name().to_string_lossy().starts_with('.'))
        .map(|e| atlas_core::server::Served { name: e.file_name().to_string_lossy().into_owned(), root: e.path() })
        .collect();
    out.sort_by(|a, b| a.name.cmp(&b.name));
    anyhow::ensure!(!out.is_empty(), "no vault folders in {}", dir.display());
    Ok(out)
}

/// `atlas server …`: the same Auth the server and Settings → Server use (a running server reads the password at once,
/// tokens when it starts again — or make them in Settings, which changes the running one).
fn server_action(action: &ServerAction) -> Result<()> {
    use atlas_core::auth::{Auth, Scope};
    let auth = Auth::load()?;
    match action {
        ServerAction::Status => {
            let s = auth.settings();
            println!("sign-in: {:?}; password: {}; trusted proxies: [{}]; plain HTTP from others: {}; AI agents: {}", s.auth, if s.password_hash.is_some() { "set" } else { "not set" }, s.trusted_proxies.iter().map(ToString::to_string).collect::<Vec<_>>().join(", "), s.allow_plain_http, if s.mcp { "on" } else { "off" });
            for t in auth.tokens() {
                println!("  token {:<16} {:?}, last used {}", t.name, t.scope, t.last_used.map_or("never".into(), |u| chrono::DateTime::from_timestamp(u as i64, 0).map_or(u.to_string(), |d| d.format("%Y-%m-%d").to_string())));
            }
            println!("{} browser session(s); files: {} and {}", auth.session_count(), atlas_core::auth::settings_file().display(), atlas_core::auth::state_file().display());
            if let Some(why) = auth.not_ready() {
                println!("not ready to serve: {why}");
            }
        }
        ServerAction::Password => {
            let current = auth.settings().password_hash.is_some().then(|| ask("Current password: ")).transpose()?;
            let new = ask("New password (10 characters or more): ")?;
            if std::io::IsTerminal::is_terminal(&std::io::stdin()) && ask("Again: ")? != new {
                anyhow::bail!("the two differ: nothing changed");
            }
            auth.set_password(current.as_deref(), &new)?;
            println!("password set ({})", atlas_core::auth::settings_file().display());
        }
        ServerAction::Token { name, scope } => {
            let scope = match scope {
                TokenScope::Capture => Scope::Capture,
                TokenScope::Full => Scope::Full,
            };
            let token = auth.add_token(name, scope)?;
            eprintln!("token for “{name}” ({scope:?}) — shown once, give it to the app:");
            println!("{token}");
        }
        ServerAction::Revoke { name } => {
            anyhow::ensure!(auth.revoke_token(name), "no token named “{name}”");
            println!("revoked “{name}”");
        }
        ServerAction::SignOutAll => println!("{} session(s) ended", auth.sign_out_everywhere()),
    }
    Ok(())
}

/// A line from the terminal with the echo off (stty), or from stdin when it is not a terminal (scripts, tests).
fn ask(prompt: &str) -> Result<String> {
    use std::io::{BufRead, IsTerminal, Write};
    let tty = std::io::stdin().is_terminal();
    if tty {
        eprint!("{prompt}");
        std::io::stderr().flush()?;
        let _ = std::process::Command::new("stty").arg("-echo").stdin(std::process::Stdio::inherit()).status();
    }
    let mut line = String::new();
    let read = std::io::stdin().lock().read_line(&mut line);
    if tty {
        let _ = std::process::Command::new("stty").arg("echo").stdin(std::process::Stdio::inherit()).status();
        eprintln!();
    }
    read?;
    Ok(line.trim_end_matches(['\n', '\r']).to_string())
}

fn unwrap_cmd(resp: Value) -> Result<Value> {
    match resp["ok"].as_bool() {
        Some(true) => Ok(resp["result"].clone()),
        _ => bail!("{}", resp["error"].as_str().unwrap_or("command failed")),
    }
}

fn print_value(v: &Value) {
    match v {
        Value::String(s) => println!("{s}"),
        Value::Null => {}
        v => println!("{}", serde_json::to_string_pretty(v).unwrap_or_default()),
    }
}

fn print_today(t: &Today) {
    println!("# Today {}\n", t.date);
    match &t.focus.text {
        Some(text) if !text.trim().is_empty() => println!("## Focus ({})\n{}\n", t.focus.path, text.trim_end()),
        _ => println!("## Focus ({}) — empty\n", t.focus.path),
    }
    match &t.log.text {
        Some(text) => println!("## Log ({})\n{}\n", t.log.path, text.trim_end()),
        None => println!("## Log ({}) — nothing captured yet\n", t.log.path),
    }
    println!("## Open tasks ({})", t.tasks.len());
    for task in t.tasks.iter().take(30) {
        println!("- [ ] {}  ({}:{})", task.text, task.path, task.line);
    }
    if t.tasks.len() > 30 {
        println!("  … {} more", t.tasks.len() - 30);
    }
    println!("\n## Since yesterday: {} commits, {} changed files", t.activity.commits.len(), t.activity.changed.len());
    for c in &t.activity.commits {
        println!("  {} {}", c.hash, c.subject);
    }
    for c in t.activity.changed.iter().take(15) {
        println!("  ~ {}", c.path);
    }
}

/// `atlas open` takes paths relative to the cwd; the API wants them relative to the workspace.
fn to_workspace_rel(ws: &Workspace, path: &Path) -> Result<String> {
    let abs = std::env::current_dir()?.join(path);
    let abs = abs.canonicalize().with_context(|| format!("{}", abs.display()))?;
    abs.strip_prefix(ws.root())
        .map(|_| ws.rel(&abs))
        .map_err(|_| anyhow::anyhow!("{} is outside the workspace {}", abs.display(), ws.root().display()))
}

#[tokio::main]
async fn main() -> Result<()> {
    let cli = Cli::parse();
    if let Action::Server { action } = &cli.action {
        return server_action(action);
    }
    if let Action::Serve { dir, port, listen, vaults_in, vaults } = &cli.action {
        use atlas_core::server::{Listen, Served, Vaults};
        let what = if let Some(dir) = vaults_in {
            Vaults::Many(vaults_in_dir(dir)?)
        } else if !vaults.is_empty() {
            let named = vaults.iter().map(|v| {
                let (name, path) = v.split_once('=').ok_or_else(|| anyhow::anyhow!("--vault {v}: NAME=PATH"))?;
                Ok(Served { name: name.to_string(), root: PathBuf::from(path) })
            });
            Vaults::Many(named.collect::<Result<_>>()?)
        } else {
            Vaults::One(match dir {
                Some(d) => d.clone(),
                None => workspace_root(cli.workspace.clone())?,
            })
        };
        if let Vaults::Many(list) = &what {
            for v in list {
                eprintln!("atlas: vault “{}” at /v/{}/ ({})", v.name, v.name, v.root.display());
            }
        }
        let handle = match listen {
            None => atlas_core::server::serve_vaults(what, Listen::Local(*port, atlas_core::local_lock::Lock::from_env())).await?,
            Some(addr) => {
                let auth = atlas_core::auth::Auth::load()?;
                eprintln!("atlas: server mode, sign-in: {:?} ({})", auth.settings().auth, atlas_core::auth::settings_file().display());
                atlas_core::server::serve_vaults(what, Listen::Server { addr: *addr, auth: Box::new(auth) }).await?
            }
        };
        // locked (ATLAS_LOCAL_LOCK=1): the address with a one-time code, the only way a browser gets in
        let at = listen.map_or_else(|| handle.open_url(), |a| format!("http://{a}/ (and this machine: {})", handle.url()));
        eprintln!("atlas: serving {} at {at}", handle.info().root.display());
        tokio::signal::ctrl_c().await?;
        eprintln!("atlas: shutting down");
        return handle.shutdown().await;
    }

    if let Action::Guide { develop } = cli.action {
        print!("{}", if develop { GUIDE_DEVELOPING } else { GUIDE_EXTENDING });
        return Ok(());
    }
    let ws = Workspace::open(workspace_root(cli.workspace)?)?;
    if let Action::Mcp = cli.action {
        return mcp::serve(ws).await;
    }
    if let Action::Drawings { apply } = cli.action {
        let r = tokio::task::block_in_place(|| atlas_core::drawing_compact::compact_all(ws.root(), &ws.config()?, apply))?;
        let mb = |b: u64| b as f64 / 1e6;
        for (path, before, after) in &r.drawings {
            println!("{} {path}: {:.1} MB → {:.1} MB", if apply { "compacted" } else { "would compact" }, mb(*before), mb(*after));
        }
        let (b, a) = r.drawings.iter().fold((0, 0), |(b, a), d| (b + d.1, a + d.2));
        match r.snapshot {
            Some(s) => println!("{} drawings, {:.1} MB → {:.1} MB; the originals: {s}", r.drawings.len(), mb(b), mb(a)),
            None if apply => println!("nothing to compact"),
            None => println!("{} drawings, {:.1} MB → {:.1} MB — run again with --apply", r.drawings.len(), mb(b), mb(a)),
        }
        return Ok(());
    }
    if let Action::Companions { apply } = cli.action {
        let plan = atlas_core::companion_tidy::plan(ws.root(), &ws.config()?)?;
        for t in &plan {
            println!("{} {}", if apply { "done:" } else { "would tidy" }, t.what());
        }
        match (apply, plan.is_empty()) {
            (_, true) => println!("nothing to tidy: one note per thing"),
            (false, false) => println!("{} to tidy — run again with --apply", plan.len()),
            (true, false) => {
                let snap = tokio::task::block_in_place(|| atlas_core::companion_tidy::apply(&ws, &plan))?;
                println!("{} tidied; copies of everything touched: {}", plan.len(), snap.unwrap_or_default());
            }
        }
        return Ok(());
    }
    let call = match &cli.action {
        Action::Plugin { action: PluginAction::Call { id, method, params } } => Some((id.clone(), method.clone(), params.clone())),
        Action::PaperNotes => Some(("catalog-papers".into(), "notes".into(), None)),
        _ => None,
    };
    if let Some((id, method, params)) = call {
        let params: Value = match params {
            Some(p) => serde_json::from_str(&p).context("params must be JSON")?,
            None => json!({}),
        };
        // a helper calls back into its vault's core, so it runs in the running Atlas (the window's or `atlas serve`'s)
        let Some(s) = Server::find(&ws).await else { bail!("Atlas is not running for {}: open the vault (or `atlas serve` it) first", ws.root().display()) };
        let v = s.post(&format!("/api/plugins/{id}/helper"), &json!({ "method": method, "params": params, "timeout_secs": 3600 }), Duration::from_secs(3605)).await?;
        print_value(&v);
        return Ok(());
    }
    if let Action::Plugin { action } = cli.action {
        let replaced = match &action {
            PluginAction::Update { id } | PluginAction::Remove { id } => Some(id.clone()),
            _ => None,
        };
        plugin_action(&ws, action)?; // files only: works with or without a running Atlas
        // a running Atlas would go on calling the old helper program: stop it, the next call starts the new one
        if let (Some(id), Some(s)) = (replaced, Server::find(&ws).await) {
            match s.post(&format!("/api/plugins/{id}/helper/stop"), &json!({}), Duration::from_secs(5)).await {
                Ok(_) => println!("  the running Atlas starts its new helper on the next call"),
                Err(e) => println!("  the running Atlas still has the old helper ({e}): restart the plugin in Settings"),
            }
        }
        return Ok(());
    }
    let server = Server::find(&ws).await;
    match cli.action {
        Action::Serve { .. } | Action::Server { .. } | Action::Mcp | Action::Guide { .. } | Action::Plugin { .. } | Action::PaperNotes | Action::Drawings { .. } | Action::Companions { .. } => unreachable!("handled above"),
        Action::Capture { text } => {
            let text = if text.is_empty() { std::io::read_to_string(std::io::stdin())? } else { text.join(" ") };
            let r: CaptureResult = match &server {
                Some(s) => serde_json::from_value(s.cmd("capture", json!({ "text": text })).await?)?,
                None => capture::capture_unserved(ws.root(), &ws.config()?, &text)?,
            };
            println!("{}:{}", r.path, r.line);
        }
        Action::Cmd { id, args } => {
            let args: Value = match args {
                Some(a) => serde_json::from_str(&a).context("args must be a JSON object")?,
                None => json!({}),
            };
            let v = match &server {
                Some(s) => s.cmd(&id, args).await?,
                // No UI: run locally; UI-only commands (open/notify/focus) then report no listener.
                None => {
                    let bus = atlas_core::events::EventBus::default();
                    commands::run(&ws, &bus, commands::Command::resolve(ws.root(), &id, args)?).await?
                }
            };
            print_value(&v);
        }
        Action::Open { path, line } => {
            let Some(s) = &server else { bail!("Atlas is not running for {}", ws.root().display()) };
            let rel = to_workspace_rel(&ws, &path)?;
            s.cmd("open", json!({ "path": rel, "line": line })).await?;
        }
        Action::Today => print_today(&today::today(ws.root(), &ws.config()?)?),
    }
    Ok(())
}
