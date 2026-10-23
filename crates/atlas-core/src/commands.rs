//! The command registry: built-ins are an enum (each id has exactly one argument shape), scripts
//! are `.atlas/commands/<id>.toml` manifests re-read on every listing, so no recompile is needed.
use crate::api::{CommandInfo, CommandSource, Event, FocusPane};
use crate::events::EventBus;
use crate::{capture, today, Error, Result, Workspace};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::path::{Path, PathBuf};
use std::time::Duration;
use ts_rs::TS;

pub const COMMANDS_DIR: &str = ".atlas/commands";
pub const SCRIPT_TIMEOUT: Duration = Duration::from_secs(30);

/// A built-in call as it arrives: `{"id": "...", "args": {...}}`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(tag = "id", content = "args")]
#[ts(export)]
pub enum Builtin {
    #[serde(rename = "capture")]
    Capture { text: String },
    #[serde(rename = "open")]
    Open {
        path: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        #[ts(optional)]
        line: Option<u32>,
    },
    #[serde(rename = "notify")]
    Notify {
        title: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        #[ts(optional)]
        body: Option<String>,
    },
    #[serde(rename = "focus")]
    Focus { pane: FocusPane },
    #[serde(rename = "today")]
    Today {},
}

/// The argument-free identity of a built-in, for listing; `Builtin::kind` keeps the two in step.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum BuiltinId {
    Capture,
    Open,
    Notify,
    Focus,
    Today,
}

impl BuiltinId {
    pub const ALL: [Self; 5] = [
        Self::Capture,
        Self::Open,
        Self::Notify,
        Self::Focus,
        Self::Today,
    ];

    /// (id, title, default keys, description)
    pub fn meta(self) -> (&'static str, &'static str, Option<&'static str>, &'static str) {
        match self {
            Self::Capture => {
                ("capture", "Capture to today's log", Some("Ctrl+Alt+C"), "Append a timestamped line to today's log")
            }
            Self::Open => ("open", "Open file", None, "Open a workspace file in a pane (optionally at a line)"),
            Self::Notify => ("notify", "Notify", None, "Show a notification in the UI"),
            Self::Focus => ("focus", "Focus pane", None, "Bring a pane to the front"),
            Self::Today => ("today", "Today", None, "Focus, today's log, open tasks and recent activity"),
        }
    }

    pub fn from_id(id: &str) -> Option<Self> {
        Self::ALL.into_iter().find(|b| b.meta().0 == id)
    }

    /// Shape-based: a built-in needs arguments when it cannot be built from empty ones.
    pub fn needs_args(self) -> bool {
        let (id, ..) = self.meta();
        serde_json::from_value::<Builtin>(json!({ "id": id, "args": {} })).is_err()
    }

    pub fn info(self) -> CommandInfo {
        let (id, title, keys, description) = self.meta();
        CommandInfo {
            id: id.into(),
            title: title.into(),
            keys: keys.map(Into::into),
            source: CommandSource::Builtin,
            description: Some(description.into()),
            file: None,
            origin: None,
            needs_args: self.needs_args(),
            schedule: None,
            last_run: None,
        }
    }
}

impl Builtin {
    pub fn kind(&self) -> BuiltinId {
        match self {
            Self::Capture { .. } => BuiltinId::Capture,
            Self::Open { .. } => BuiltinId::Open,
            Self::Notify { .. } => BuiltinId::Notify,
            Self::Focus { .. } => BuiltinId::Focus,
            Self::Today {} => BuiltinId::Today,
        }
    }
}

/// `.atlas/commands/<id>.toml`.
#[derive(Debug, Clone, Deserialize)]
pub struct ScriptManifest {
    pub title: String,
    /// Run through `sh -c` (so `~`, pipes and quoting work), cwd = workspace root.
    pub run: String,
    #[serde(default)]
    pub keys: Option<String>,
    #[serde(default)]
    pub description: Option<String>,
    /// Seconds before the run is killed (default [`SCRIPT_TIMEOUT`]); long jobs (audits, builds) raise it.
    #[serde(default)]
    pub timeout_secs: Option<u64>,
    /// Run by itself while Atlas is open: `daily 03:00`, `every 2h`, `hourly` (see schedule.rs).
    #[serde(default)]
    pub schedule: Option<String>,
}

#[derive(Debug, Clone)]
pub struct ScriptCommand {
    pub id: String,
    pub manifest: ScriptManifest,
}

#[derive(Debug, Clone)]
pub enum Command {
    Builtin(Builtin),
    Script { script: ScriptCommand, args: Value },
}

/// Ids double as file names, so keep them to a safe alphabet.
fn valid_script_id(id: &str) -> bool {
    !id.is_empty() && !id.starts_with('.') && id.chars().all(|c| c.is_ascii_alphanumeric() || "._-".contains(c))
}

fn load_script(path: &Path) -> Result<ScriptCommand> {
    let id = path.file_stem().unwrap_or_default().to_string_lossy().into_owned();
    let text = std::fs::read_to_string(path)?;
    let manifest = toml::from_str(&text).map_err(|e| Error::BadRequest(format!("{}: {e}", path.display())))?;
    Ok(ScriptCommand { id, manifest })
}

/// Valid script manifests, sorted by id. Broken manifests and ids shadowing a built-in are
/// reported on stderr and skipped, never fatal.
pub fn scripts(root: &Path) -> Vec<ScriptCommand> {
    let Ok(entries) = std::fs::read_dir(root.join(COMMANDS_DIR)) else { return Vec::new() };
    let mut out: Vec<ScriptCommand> = entries
        .flatten()
        .map(|e| e.path())
        .filter(|p| p.extension().is_some_and(|x| x == "toml"))
        .filter_map(|p| match load_script(&p) {
            Ok(s) if !valid_script_id(&s.id) => {
                eprintln!("atlas: skipping {}: invalid command id", p.display());
                None
            }
            Ok(s) if BuiltinId::from_id(&s.id).is_some() => {
                eprintln!("atlas: skipping {}: shadows built-in `{}`", p.display(), s.id);
                None
            }
            Ok(s) => Some(s),
            Err(e) => {
                eprintln!("atlas: skipping command: {e}");
                None
            }
        })
        .collect();
    out.sort_by(|a, b| a.id.cmp(&b.id));
    out
}

pub fn list(root: &Path) -> Vec<CommandInfo> {
    let builtins = BuiltinId::ALL.into_iter().map(BuiltinId::info);
    let runs = crate::schedule::records(&root.join(".atlas/cache"));
    let scripts = scripts(root).into_iter().map(|s| {
        let file = format!("{COMMANDS_DIR}/{}.toml", s.id);
        let last_run = s.manifest.schedule.as_ref().and_then(|_| runs.get(&s.id).cloned());
        CommandInfo {
            origin: crate::git::file_origin(root, &file),
            file: Some(file),
            id: s.id,
            title: s.manifest.title,
            keys: s.manifest.keys,
            source: CommandSource::Script,
            description: s.manifest.description,
            needs_args: false,
            last_run,
            schedule: s.manifest.schedule,
        }
    });
    builtins.chain(scripts).collect()
}

/// Writes a new script command; refuses to overwrite one or to shadow a built-in.
pub fn create(root: &Path, c: &crate::api::NewCommand) -> Result<CommandInfo> {
    let title = c.title.trim();
    if title.is_empty() || c.run.trim().is_empty() {
        return Err(Error::BadRequest("a command needs a title and a command line".into()));
    }
    let id =
        if c.id.trim().is_empty() { crate::paths::slugify(title).replace('-', ".") } else { c.id.trim().to_string() };
    if !valid_script_id(&id) || BuiltinId::from_id(&id).is_some() {
        return Err(Error::BadRequest(format!(
            "`{id}` cannot be a command id (letters, digits, . _ -; not a built-in)"
        )));
    }
    let path = root.join(COMMANDS_DIR).join(format!("{id}.toml"));
    if path.exists() {
        return Err(Error::Conflict { current: None });
    }
    let mut doc = toml_edit::DocumentMut::new();
    doc["title"] = toml_edit::value(title);
    if !c.description.trim().is_empty() {
        doc["description"] = toml_edit::value(c.description.trim());
    }
    doc["run"] = toml_edit::value(c.run.trim());
    if let Some(t) = c.timeout_secs {
        doc["timeout_secs"] = toml_edit::value(t as i64);
    }
    if let Some(sc) = c.schedule.as_deref().map(str::trim).filter(|x| !x.is_empty()) {
        sc.parse::<crate::schedule::Schedule>().map_err(Error::BadRequest)?;
        doc["schedule"] = toml_edit::value(sc);
    }
    crate::vault_write::write(&path, doc.to_string().as_bytes())?;
    list(root).into_iter().find(|i| i.id == id).ok_or_else(|| Error::BadRequest("written but not loadable".into()))
}

impl Command {
    pub fn resolve(root: &Path, id: &str, args: Value) -> Result<Self> {
        if BuiltinId::from_id(id).is_some() {
            let b = serde_json::from_value(json!({ "id": id, "args": args }))
                .map_err(|e| Error::BadRequest(format!("arguments for `{id}`: {e}")))?;
            return Ok(Self::Builtin(b));
        }
        if !valid_script_id(id) {
            return Err(Error::NotFound(format!("command `{id}`")));
        }
        let path: PathBuf = root.join(COMMANDS_DIR).join(format!("{id}.toml"));
        if !path.is_file() {
            return Err(Error::NotFound(format!("command `{id}`")));
        }
        Ok(Self::Script { script: load_script(&path)?, args })
    }
}

/// Run a command. Events go to `bus`; ones that only make sense with a UI fail without one.
pub async fn run(ws: &Workspace, bus: &EventBus, cmd: Command) -> Result<Value> {
    match cmd {
        Command::Builtin(b) => match b {
            Builtin::Capture { text } => {
                let r = blocking({
                    let ws = ws.clone();
                    let text = text.clone();
                    move || capture::capture(ws.root(), &ws.config()?, &text)
                })
                .await?;
                bus.captured(crate::events::Captured { text, path: r.path.clone(), line: r.line });
                Ok(to_json(&r))
            }
            Builtin::Open { path, line } => {
                let abs = ws.resolve(&path)?;
                if !abs.exists() {
                    return Err(Error::NotFound(path));
                }
                let n = bus.emit(Event::Open { path: ws.rel(&abs), line })?;
                Ok(json!({ "delivered": n }))
            }
            Builtin::Notify { title, body } => Ok(json!({ "delivered": bus.emit(Event::Notify { title, body })? })),
            Builtin::Focus { pane } => Ok(json!({ "delivered": bus.emit(Event::Focus { pane })? })),
            Builtin::Today {} => {
                let ws = ws.clone();
                Ok(to_json(&blocking(move || today::today(ws.root(), &ws.config()?)).await?))
            }
        },
        Command::Script { script, args } => {
            let t = script.manifest.timeout_secs.map_or(SCRIPT_TIMEOUT, Duration::from_secs);
            run_script(ws.root(), &script, &args, t).await
        }
    }
}

/// `sh -c <run>` with args as JSON on stdin. stdout is the result (parsed as JSON when it is);
/// a non-zero exit returns stderr. The whole process group is killed on timeout.
pub async fn run_script(root: &Path, script: &ScriptCommand, args: &Value, timeout: Duration) -> Result<Value> {
    use std::process::Stdio;
    use tokio::io::AsyncWriteExt;
    let mut cmd = tokio::process::Command::new("sh");
    cmd.arg("-c")
        .arg(&script.manifest.run)
        .current_dir(root)
        .env("ATLAS_ROOT", root)
        .env("ATLAS_COMMAND", &script.id)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true);
    #[cfg(unix)]
    cmd.process_group(0);
    let mut child = cmd.spawn().map_err(|e| Error::CommandFailed(format!("{}: {e}", script.id)))?;
    let pid = child.id();
    if let Some(mut stdin) = child.stdin.take() {
        // A script that ignores stdin may close it early; that is not a failure.
        let _ = stdin.write_all(args.to_string().as_bytes()).await;
    }
    let out = match tokio::time::timeout(timeout, child.wait_with_output()).await {
        Ok(out) => out?,
        Err(_) => {
            if let Some(pid) = pid {
                let _ = std::process::Command::new("kill").args(["-KILL", "--", &format!("-{pid}")]).status();
            }
            return Err(Error::CommandFailed(format!("{} timed out after {}s", script.id, timeout.as_secs())));
        }
    };
    let stdout = String::from_utf8_lossy(&out.stdout).trim().to_string();
    if !out.status.success() {
        let stderr = String::from_utf8_lossy(&out.stderr).trim().to_string();
        let detail = if stderr.is_empty() { stdout } else { stderr };
        return Err(Error::CommandFailed(format!("{} exited with {}: {detail}", script.id, out.status)));
    }
    Ok(serde_json::from_str(&stdout).unwrap_or(Value::String(stdout)))
}

pub(crate) async fn blocking<T: Send + 'static>(f: impl FnOnce() -> Result<T> + Send + 'static) -> Result<T> {
    tokio::task::spawn_blocking(f).await.map_err(|e| Error::Other(e.into()))?
}

fn to_json<T: Serialize>(v: &T) -> Value {
    serde_json::to_value(v).unwrap_or(Value::Null)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn builtins_needing_arguments_are_detected_by_shape() {
        let needs: Vec<&str> = BuiltinId::ALL.into_iter().filter(|b| b.needs_args()).map(|b| b.meta().0).collect();
        assert_eq!(
            needs,
            vec!["capture", "open", "notify", "focus"]
        );
    }

    #[test]
    fn every_builtin_id_parses_to_its_kind() {
        let samples = [
            json!({"text": "x"}),
            json!({"path": "a.md", "line": 3}),
            json!({"title": "done"}),
            json!({"pane": "terminal"}),
            json!({}),
        ];
        for (id, args) in BuiltinId::ALL.into_iter().zip(samples) {
            let tmp = tempfile::tempdir().unwrap();
            match Command::resolve(tmp.path(), id.meta().0, args).unwrap() {
                Command::Builtin(b) => assert_eq!(b.kind(), id),
                other => panic!("{other:?}"),
            }
        }
    }

    #[test]
    fn bad_args_and_unknown_ids() {
        let tmp = tempfile::tempdir().unwrap();
        assert!(matches!(Command::resolve(tmp.path(), "capture", json!({})), Err(Error::BadRequest(_))));
        assert!(matches!(Command::resolve(tmp.path(), "focus", json!({"pane": "nope"})), Err(Error::BadRequest(_))));
        assert!(matches!(Command::resolve(tmp.path(), "nope", json!({})), Err(Error::NotFound(_))));
        assert!(matches!(Command::resolve(tmp.path(), "../x", json!({})), Err(Error::NotFound(_))));
    }

    fn write_cmd(root: &Path, id: &str, toml: &str) {
        std::fs::create_dir_all(root.join(COMMANDS_DIR)).unwrap();
        std::fs::write(root.join(COMMANDS_DIR).join(format!("{id}.toml")), toml).unwrap();
    }

    #[tokio::test]
    async fn script_gets_json_stdin_and_returns_json() {
        let tmp = tempfile::tempdir().unwrap();
        let root = tmp.path();
        std::fs::create_dir_all(root.join("tools")).unwrap();
        std::fs::write(
            root.join("tools/echo.py"),
            "import json, os, sys\nargs = json.load(sys.stdin)\n\
             print(json.dumps({'got': args, 'cwd': os.getcwd(), 'n': len(os.listdir('.'))}))\n",
        )
        .unwrap();
        write_cmd(root, "echo.args", "title = \"Echo\"\nrun = \"python3 tools/echo.py\"\ndescription = \"d\"\n");
        write_cmd(root, "plain", "title = \"Plain\"\nrun = \"echo hello | tr a-z A-Z\"\n");
        write_cmd(root, "fail", "title = \"Fail\"\nrun = \"echo oops >&2; exit 3\"\n");
        write_cmd(root, "capture", "title = \"Shadow\"\nrun = \"true\"\n");
        write_cmd(root, "broken", "title = ");

        let ids: Vec<_> = list(root).into_iter().filter(|c| c.source == CommandSource::Script).map(|c| c.id).collect();
        assert_eq!(ids, ["echo.args", "fail", "plain"]);

        let ws = Workspace::open(root).unwrap();
        let bus = EventBus::default();
        let cmd = Command::resolve(ws.root(), "echo.args", json!({"k": [1, 2]})).unwrap();
        let v = run(&ws, &bus, cmd).await.unwrap();
        assert_eq!(v["got"], json!({"k": [1, 2]}));
        assert_eq!(v["cwd"], json!(ws.root().to_string_lossy()));

        let v = run(&ws, &bus, Command::resolve(ws.root(), "plain", json!({})).unwrap()).await.unwrap();
        assert_eq!(v, json!("HELLO"));

        let err = run(&ws, &bus, Command::resolve(ws.root(), "fail", json!({})).unwrap()).await.unwrap_err();
        assert!(err.to_string().contains("oops"), "{err}");
    }

    #[tokio::test]
    async fn script_timeout_kills() {
        let tmp = tempfile::tempdir().unwrap();
        let s = ScriptCommand {
            id: "slow".into(),
            manifest: ScriptManifest {
                title: "s".into(),
                run: "sleep 30".into(),
                keys: None,
                description: None,
                timeout_secs: None,
                schedule: None,
            },
        };
        let t0 = std::time::Instant::now();
        let err = run_script(tmp.path(), &s, &json!({}), Duration::from_millis(300)).await.unwrap_err();
        assert!(err.to_string().contains("timed out"));
        assert!(t0.elapsed() < Duration::from_secs(5));
    }

    #[test]
    fn real_phd_manifests_parse() {
        // Shapes copied from a real vault's .atlas/commands (read-only fixture).
        let tmp = tempfile::tempdir().unwrap();
        write_cmd(
            tmp.path(),
            "refs.bib",
            "title = \"Papers: rebuild refs.bib\"\ndescription = \"Regenerate refs/refs.bib from the notes of refs/papers/*\"\n\
             run = \"uv run --script ~/Projects/atlas/scripts/vault/refs_bib.py refs/papers refs/refs.bib\"\n",
        );
        let l = list(tmp.path());
        let c = l.iter().find(|c| c.id == "refs.bib").unwrap();
        assert_eq!(c.title, "Papers: rebuild refs.bib");
        assert_eq!(c.source, CommandSource::Script);
    }

    #[tokio::test]
    async fn ui_events_need_a_listener() {
        let tmp = tempfile::tempdir().unwrap();
        std::fs::write(tmp.path().join("a.md"), "x").unwrap();
        let ws = Workspace::open(tmp.path()).unwrap();
        let bus = EventBus::default();
        let open = || Command::resolve(ws.root(), "open", json!({"path": "a.md", "line": 2})).unwrap();
        assert!(run(&ws, &bus, open()).await.is_err());
        let mut rx = bus.subscribe();
        run(&ws, &bus, open()).await.unwrap();
        assert_eq!(rx.recv().await.unwrap(), Event::Open { path: "a.md".into(), line: Some(2) });
    }
}
