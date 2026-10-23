//! Every JSON shape on the wire. ts-rs mirrors these into `ui/src/lib/gen/` on `cargo test`,
//! so a UI/core mismatch fails the UI typecheck instead of failing at runtime.
use crate::config::Config;
use serde::{Deserialize, Serialize};
use ts_rs::TS;

/// Modification time in milliseconds since the Unix epoch (fits a JS number exactly).
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct Mtime(#[ts(type = "number")] pub u64);

impl Mtime {
    pub fn of(meta: &std::fs::Metadata) -> std::io::Result<Self> {
        let t = meta.modified()?;
        let ms = t.duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0);
        Ok(Self(ms))
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct WorkspaceInfo {
    pub root: String,
    pub name: String,
    pub config: Config,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "lowercase")]
#[ts(export)]
pub enum EntryKind {
    Dir,
    File,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct TreeEntry {
    pub name: String,
    pub path: String,
    pub kind: EntryKind,
    /// On the ignore list: shown dimmed, skipped by search/tasks/watcher.
    pub ignored: bool,
    /// Bytes (files only): the explorer's Size column.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional, type = "number")]
    pub size: Option<u64>,
    /// Last change, seconds since 1970: the explorer's Modified column.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional, type = "number")]
    pub modified: Option<i64>,
    /// A folder's own note (`<folder>/<folder>.md`): the tree shows the folder as that note.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub note: Option<String>,
    /// A note with `shown: false`: a companion the tree hides unless asked (docs/design/DESIGN-shared-notes.md).
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    #[ts(optional, as = "Option<bool>")]
    pub unshown: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct PathQuery {
    #[serde(default)]
    #[ts(optional)]
    pub path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct FileText {
    pub path: String,
    pub text: String,
    pub mtime: Mtime,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct FileWrite {
    pub path: String,
    pub text: String,
    /// The mtime the client last read; a mismatch on disk → 409 instead of clobbering.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub base_mtime: Option<Mtime>,
    /// Write only if there is no such file yet (a plugin's `createFile`): an existing one is left as it is and the
    /// answer says `written: false` — a 200, so a browser logs no error. Not together with `base_mtime`.
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    #[ts(as = "Option<bool>", optional)]
    pub only_new: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct FileWritten {
    pub mtime: Mtime,
    /// False only for an `only_new` write that found the file there (`mtime` is then the existing file's).
    pub written: bool,
}

/// Body of every non-2xx `/api` response. `mtime` is set on 409 (current on-disk mtime, if any).
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct ApiError {
    pub error: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub mtime: Option<Mtime>,
}

/// A file Today shows (focus, log): `text` is null when the file does not exist yet.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct DocSlot {
    pub path: String,
    pub text: Option<String>,
}

/// A text hit at a 1-based line (open tasks, search lines).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct LineHit {
    pub path: String,
    pub line: u32,
    pub text: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct Commit {
    pub hash: String,
    pub subject: String,
    /// Commit time, ms since epoch.
    pub time: Mtime,
    pub by: CommitBy,
    /// The agent's name ("Claude") when `by` is `agent`.
    #[serde(default)]
    #[ts(optional)]
    pub agent: Option<String>,
    pub kind: CommitKind,
    /// Number of files the commit touches.
    pub files: u32,
}

/// Who made a commit: one of an agent plugin's `commit_marks` (its trailer, its author) means that agent.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "lowercase")]
#[ts(export)]
pub enum CommitBy {
    You,
    /// An AI agent a plugin declares (its `commit_marks` matched): which one is in `agent`.
    Agent,
}

/// Housekeeping = touches only files that record other work (HISTORY.md, session logs, HTML views).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "lowercase")]
#[ts(export)]
pub enum CommitKind {
    Work,
    Housekeeping,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct CommitDetail {
    /// Full hash.
    pub hash: String,
    pub subject: String,
    pub body: String,
    pub author: String,
    pub time: Mtime,
    pub by: CommitBy,
    /// The agent's name ("Claude") when `by` is `agent`.
    #[serde(default)]
    #[ts(optional)]
    pub agent: Option<String>,
    pub kind: CommitKind,
    pub files: Vec<FileStat>,
    pub patch: Patch,
}

/// `added`/`removed` are null for binary files.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct FileStat {
    pub path: String,
    pub added: Option<u32>,
    pub removed: Option<u32>,
}

/// Unified diff text, cut at 1 MB (`truncated`).
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct Patch {
    pub patch: String,
    pub truncated: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "lowercase")]
#[ts(export)]
pub enum Change {
    Added,
    Modified,
    Deleted,
    Renamed,
    Untracked,
    Conflicted,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct StatusEntry {
    pub path: String,
    /// Source path of a rename.
    pub orig: Option<String>,
    /// Index vs HEAD.
    pub staged: Option<Change>,
    /// Working tree vs index (untracked and conflicted live here).
    pub unstaged: Option<Change>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct GitStatus {
    /// false: the workspace is not a git repository (everything else empty) — said, not an error
    pub repo: bool,
    pub branch: Option<String>,
    pub upstream: Option<String>,
    pub ahead: u32,
    pub behind: u32,
    pub entries: Vec<StatusEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct GitLogQuery {
    #[serde(default)]
    #[ts(optional)]
    pub skip: Option<u32>,
    #[serde(default)]
    #[ts(optional)]
    pub limit: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct HashQuery {
    pub hash: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct GitDiffQuery {
    pub path: String,
    #[serde(default)]
    #[ts(optional)]
    pub staged: Option<bool>,
}

/// Discard unstaged changes (POST /api/git/discard).
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct GitDiscardRequest {
    pub paths: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct GitDiscarded {
    /// Where the discarded text was copied (workspace-relative).
    pub kept: String,
}

/// One hunk to the index or the working tree (POST /api/git/apply).
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct GitApplyRequest {
    /// A unified diff: the file header and the hunk(s).
    pub patch: String,
    /// To the index (stage / unstage) rather than the working tree.
    pub cached: bool,
    /// Apply in reverse (unstage, discard).
    pub reverse: bool,
}

/// Pull / push result (POST /api/git/pull, /api/git/push): git's last line.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct GitSynced {
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct GitStageRequest {
    pub paths: Vec<String>,
    /// true = stage, false = unstage.
    pub stage: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct GitCommitRequest {
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct GitCommitted {
    pub hash: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct Changed {
    pub path: String,
    pub mtime: Mtime,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct Activity {
    pub commits: Vec<Commit>,
    pub changed: Vec<Changed>,
    /// Files made today or yesterday, newest first — mail left out (it has its own list).
    pub created: Vec<Created>,
}

/// `GET /api/activity?day=`: what was made on a day and what else changed (the Activity card, a day's log).
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct DayActivity {
    /// `YYYY-MM-DD`
    pub day: String,
    pub created: Vec<Created>,
    pub changed: Vec<Changed>,
}

/// A file by when it was made (its creation time, not its last change).
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct Created {
    pub path: String,
    /// ms since 1970
    #[ts(type = "number")]
    pub created: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct Today {
    /// Local date, `YYYY-MM-DD`.
    pub date: String,
    pub focus: DocSlot,
    pub log: DocSlot,
    pub tasks: Vec<LineHit>,
    pub activity: Activity,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct CaptureRequest {
    pub text: String,
    /// Capture into another vault than this server's: the path of one of the known vaults (the
    /// quick-capture window's chooser). Written straight into that vault's files.
    #[serde(default)]
    #[ts(optional)]
    pub vault: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct CaptureResult {
    pub path: String,
    /// 1-based line of the new bullet (log mode) or of the captured text (note mode).
    pub line: u32,
}

/// `POST /api/log/today`: today's log, made from the log template when it was not there yet.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct TodayLog {
    pub path: String,
    /// made by this call (the plugins' `on = "log"` tools then run: the weather of the day)
    pub created: bool,
}

/// `POST /api/note/new`: a new note, optionally from a template (`{{date}}`, `{{time}}`, `{{title}}`
/// filled in) and with `text` appended. Never replaces a file: a taken name gets a number.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct NewNote {
    /// A file name in the templates folder, without `.md`.
    #[serde(default)]
    #[ts(optional)]
    pub template: Option<String>,
    /// The note's name (and `{{title}}`); empty = named by date and time.
    pub title: String,
    /// The folder it must go to. Without it the place is decided in order: the template's
    /// `create_in:`, then `near`, then `[notes] dir`.
    #[serde(default)]
    #[ts(optional)]
    pub dir: Option<String>,
    /// The folder of the note the user was in: a new note goes beside it unless its template says where.
    #[serde(default)]
    #[ts(optional)]
    pub near: Option<String>,
    #[serde(default)]
    #[ts(optional)]
    pub text: Option<String>,
    /// Answers to the template's `{{prompt:…}}` questions and any other `{{name}}` it uses.
    #[serde(default)]
    #[ts(optional, type = "Record<string, unknown>")]
    pub values: Option<serde_json::Map<String, serde_json::Value>>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct NewNoteResult {
    pub path: String,
    /// 1-based last line (where to put the caret).
    pub line: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct SearchQuery {
    #[serde(default)]
    pub q: String,
    /// Match case exactly (default: smart case — case-insensitive unless the query has capitals).
    #[serde(default)]
    pub case: bool,
    /// Whole words only.
    #[serde(default)]
    pub word: bool,
    /// The query is a regular expression (default: literal text).
    #[serde(default)]
    pub regex: bool,
    /// Also search the agent's own files (`editor.index_exclude`); they are left out by default.
    #[serde(default)]
    pub agent: bool,
}

/// Replace across files (POST /api/replace): the search options plus the replacement.
#[derive(Debug, Clone, Deserialize, TS)]
#[ts(export)]
pub struct ReplaceRequest {
    pub q: String,
    pub with: String,
    #[serde(default)]
    pub case: bool,
    #[serde(default)]
    pub word: bool,
    #[serde(default)]
    pub regex: bool,
    #[serde(default)]
    pub agent: bool,
    /// Only these files (the ones the user left ticked); all matching files when absent.
    #[serde(default)]
    #[ts(optional)]
    pub only: Option<Vec<String>>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct ReplaceResult {
    pub files: Vec<String>,
    pub replacements: u32,
}

/// A tag and how many notes carry it or a tag nested under it (GET /api/tags).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct TagCount {
    pub tag: String,
    pub notes: u32,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct SearchResults {
    pub files: Vec<String>,
    pub lines: Vec<LineHit>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "lowercase")]
#[ts(export)]
pub enum CommandSource {
    Builtin,
    Script,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct CommandInfo {
    pub id: String,
    pub title: String,
    /// Workspace scripts: the manifest file and who added it (git), so the user sees which
    /// recurring jobs Claude turned into commands and which are their own.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub file: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub origin: Option<CommandOrigin>,
    /// Default keybinding, e.g. `Ctrl+Alt+C`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub keys: Option<String>,
    pub source: CommandSource,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub description: Option<String>,
    /// Required arguments (a path, a text…): not runnable bare from the palette or a shortcut.
    #[serde(default)]
    pub needs_args: bool,
    /// Scripts that run by themselves (`daily 03:00`, `every 2h`…), and how the last run went.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub schedule: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub last_run: Option<ScheduledRun>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct ScheduledRun {
    pub time: Mtime,
    pub ok: bool,
    /// The last output line, or the error.
    pub summary: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct CommandOrigin {
    pub by: CommitBy,
    /// The agent's name ("Claude") when `by` is `agent`.
    #[serde(default)]
    #[ts(optional)]
    pub agent: Option<String>,
    pub time: Mtime,
}

/// `POST /api/commands`: a new workspace script command (`.atlas/commands/<id>.toml`).
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct NewCommand {
    /// File name / command id; derived from the title when empty.
    #[serde(default)]
    pub id: String,
    pub title: String,
    /// Shell command line, run with `sh -c` in the workspace root.
    pub run: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub timeout_secs: Option<u64>,
    /// Optional: `daily 03:00`, `every 2h`…
    #[serde(default)]
    pub schedule: Option<String>,
}

/// `.atlas/keys.toml`: command id → chord (`""` = unbound). Overrides every default.
#[derive(Debug, Clone, Default, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct Keymap {
    pub keys: std::collections::BTreeMap<String, String>,
}

/// `PUT /api/keys`: set (`keys: Some`) or reset to the default (`None`) one binding.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct KeyBinding {
    pub id: String,
    pub keys: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct CmdRequest {
    #[serde(default = "empty_args")]
    #[ts(type = "Record<string, unknown>")]
    pub args: serde_json::Value,
}

fn empty_args() -> serde_json::Value {
    serde_json::Value::Object(Default::default())
}

/// `{ok:true, result}` or `{ok:false, error}`. Build it only via [`CmdResponse::from_result`],
/// which keeps `ok` consistent with the variant.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(untagged)]
#[ts(export)]
pub enum CmdResponse {
    Ok {
        #[ts(type = "true")]
        ok: bool,
        #[ts(type = "unknown")]
        result: serde_json::Value,
    },
    Err {
        #[ts(type = "false")]
        ok: bool,
        error: String,
    },
}

impl CmdResponse {
    pub fn from_result(r: &crate::Result<serde_json::Value>) -> Self {
        match r {
            Ok(result) => Self::Ok { ok: true, result: result.clone() },
            Err(e) => Self::Err { ok: false, error: e.to_string() },
        }
    }
}

/// Where `focus` moves the UI. Pane kinds the UI can raise without extra arguments.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "lowercase")]
#[ts(export)]
pub enum FocusPane {
    Today,
    Files,
    Search,
    Commands,
    Terminal,
    Claude,
    Editor,
}

/// Server → client messages on `WS /api/events`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(tag = "type", rename_all = "lowercase")]
#[ts(export)]
pub enum Event {
    /// Workspace-relative paths that changed on disk (debounced).
    Fs {
        paths: Vec<String>,
    },
    /// The paths of an `fs` batch that no longer exist (deleted, or the old name of a move), sent just before
    /// it: a client that skips rewrites of files it already knows still sees removals.
    Gone {
        paths: Vec<String>,
    },
    Open {
        path: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        #[ts(optional)]
        line: Option<u32>,
    },
    Notify {
        title: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        #[ts(optional)]
        body: Option<String>,
    },
    Focus {
        pane: FocusPane,
    },
    /// A sign-in window of the desktop app reached its return address (`atlas.signIn`): the whole
    /// address, carrying the provider's `code` or `error`.
    Signin {
        url: String,
    },
    /// A plugin's request met a sign-in in front of its service (`service_signin`): the page offers it.
    SigninNeeded {
        plugin: String,
        signin: crate::service_signin::Needed,
    },
    /// A sign-in to a service was kept (the desktop's sign-in window came back): plugins waiting on it may retry.
    SignedIn {
        host: String,
    },
    /// From a plugin's helper process: a line it printed without an id (`atlas.helper.on`), or
    /// `helper:exit` when it stopped.
    Plugin {
        plugin: String,
        event: String,
        #[ts(type = "unknown")]
        data: serde_json::Value,
    },
}

/// Terminal presets for `WS /api/pty`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize, TS)]
#[serde(rename_all = "lowercase")]
#[ts(export)]
pub enum PtyPreset {
    #[default]
    Shell,
    /// An AI agent's tab: a plugin's agent (`agent`, else the `claude` agent, else the first one declared). The name
    /// stays for the layouts saved with it, from when Claude was built in.
    Claude,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct PtyQuery {
    #[serde(default)]
    #[ts(as = "Option<PtyPreset>", optional)]
    pub preset: PtyPreset,
    #[serde(default)]
    #[ts(optional)]
    pub cols: Option<u16>,
    #[serde(default)]
    #[ts(optional)]
    pub rows: Option<u16>,
    /// Workspace-relative start dir; defaults to the root.
    #[serde(default)]
    #[ts(optional)]
    pub cwd: Option<String>,
    /// Run this with `sh -c` instead of the preset's program: no interactive shell (no rc files,
    /// no login banner), and the tab ends when the command does. A plugin's `terminal.open`.
    #[serde(default)]
    #[ts(optional)]
    pub command: Option<String>,
    /// An AI agent's terminal, as a plugin declares it (`<plugin>/<id>`, agent_terminals.rs).
    #[serde(default)]
    #[ts(optional)]
    pub agent: Option<String>,
    /// An agent tab's own session (a UUID kept in its saved layout): resumed when the agent has it (its
    /// `session_file`), else started under that id — so a restored tab comes back to its own conversation.
    #[serde(default)]
    #[ts(optional)]
    pub session: Option<String>,
    /// The tab's id: a socket with the key of a terminal still running (the page was reloaded) takes
    /// it over instead of starting a new one.
    #[serde(default)]
    #[ts(optional)]
    pub key: Option<String>,
}

/// Text frame client → server on `WS /api/pty`: `{"resize":[cols,rows]}`, or `"end"` when the tab
/// is closed (a socket that just drops leaves its terminal running for a reload to take over).
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
#[ts(export)]
pub enum PtyControl {
    Resize((u16, u16)),
    End,
}

/// `.atlas/cache/server.json`: how the CLI and scripts find a running server.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct ServerFile {
    pub port: u16,
    pub pid: u32,
    pub root: String,
    /// Where this vault's API is on that port: "" (at `/`), or `/v/<name>` on a server of several vaults.
    #[serde(default)]
    pub path: String,
}

/// What the user is looking at, as last reported by the UI — lets Claude (via `atlas mcp`) see
/// the current file and selection without the user pasting it.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct UiState {
    /// Active pane, e.g. `{kind:"editor", path:"notes/a.md"}`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub active: Option<PaneRef>,
    #[serde(default)]
    pub open: Vec<PaneRef>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub selection: Option<Selection>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct PaneRef {
    pub kind: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub path: Option<String>,
}

/// 1-based inclusive line range plus the selected text (capped by the UI at 20 kB).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct Selection {
    pub path: String,
    pub from_line: u32,
    pub to_line: u32,
    pub text: String,
}

/// Settings pane payload: the effective config plus the schema the form is generated from.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct ConfigDoc {
    pub config: crate::config::Config,
    #[ts(type = "Record<string, unknown>")]
    pub schema: serde_json::Value,
    /// Every setting's default, so Settings can mark what you changed and reset it.
    pub defaults: crate::config::Config,
    /// Workspace-relative path of the file settings are written to.
    pub path: String,
}

/// Detected choices per dotted setting path (e.g. `editor.code_font` → the monospace fonts installed).
/// Separate from ConfigDoc: detection spawns processes, config reads must stay cheap.
pub type Suggestions = std::collections::BTreeMap<String, Vec<Suggestion>>;

/// A diagnostic from the UI (uncaught errors, layout self-checks) → `.atlas/cache/ui.log`.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct UiLog {
    pub level: String,
    pub message: String,
}

/// One library entry, summarised from its note's properties: the wire shape of catalog-papers' helper (`list`), which
/// the References view reads (the fields stay in the note).
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct Paper {
    pub key: String,
    /// Workspace-relative folder of the entry.
    pub dir: String,
    pub title: String,
    /// Zotero item type (journalArticle, book, preprint, …).
    pub kind: String,
    /// "Last, First" as stored.
    pub authors: Vec<String>,
    pub year: Option<String>,
    pub venue: Option<String>,
    pub doi: Option<String>,
    pub arxiv: Option<String>,
    pub url: Option<String>,
    pub abstract_text: Option<String>,
    /// Zotero collections.
    pub collections: Vec<String>,
    /// Zotero tags: keywords and arXiv categories (imported automatically).
    pub tags: Vec<String>,
    /// Workspace-relative PDF, when there is one.
    pub pdf: Option<String>,
    /// When the entry joined the library (`dateAdded`, "YYYY-MM-DD hh:mm:ss"), for sorting.
    pub added: Option<String>,
    pub has_notes: bool,
}

/// catalog-papers' `edit`: the fields the Library edits in place (the note's other properties are kept).
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct PaperEdit {
    pub key: String,
    pub title: String,
    /// "Last, First" each.
    pub authors: Vec<String>,
    /// A year or a full date.
    pub date: String,
    pub venue: String,
    pub collections: Vec<String>,
    pub tags: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct PaperAdded {
    pub paper: Paper,
    /// false when the DOI / arXiv id was already in the library.
    pub created: bool,
    pub pdf: bool,
}

/// `POST /api/companion`: the companion note of a file or a folder entry (companion.rs), made when missing.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct CompanionNote {
    /// Workspace-relative path of the note.
    pub path: String,
    /// Written just now.
    pub created: bool,
    /// The legacy `notes.md` it was renamed from just now.
    pub migrated_from: Option<String>,
}

/// What `POST /api/companion` is asked: a file (`books/x.pdf`) or a folder entry (`refs/papers/<key>/`), with the
/// properties and the block a new note gets (an existing note is returned as it is).
#[derive(Debug, Clone, Deserialize, TS)]
#[ts(export)]
pub struct CompanionRequest {
    pub path: String,
    #[serde(default)]
    pub title: Option<String>,
    /// In order; the vault's template's own names and values win. An object, or YAML text: a caller whose JSON sorts
    /// keys (serde_json without `preserve_order`, every plugin call relayed through the core) sends text to keep it.
    #[serde(default, deserialize_with = "mapping_or_yaml")]
    #[ts(type = "Record<string, unknown> | string")]
    pub properties: serde_yaml::Mapping,
    /// The `view` block type drawing the thing (`library.paper`); default: a PDF's viewer, or the file embedded.
    #[serde(default)]
    pub block: Option<String>,
    /// Only say which note it is, make none (a reader looking up where you are; it writes its own note when it must).
    #[serde(default)]
    pub find: bool,
}

/// A mapping given as an object or as YAML text (`CompanionRequest::properties`); either keeps its order.
fn mapping_or_yaml<'de, D: serde::Deserializer<'de>>(d: D) -> Result<serde_yaml::Mapping, D::Error> {
    #[derive(Deserialize)]
    #[serde(untagged)]
    enum Given {
        Map(serde_yaml::Mapping),
        Text(String),
    }
    match Given::deserialize(d)? {
        Given::Map(m) => Ok(m),
        Given::Text(t) if t.trim().is_empty() => Ok(serde_yaml::Mapping::new()),
        Given::Text(t) => serde_yaml::from_str(&t).map_err(serde::de::Error::custom),
    }
}

/// `POST /api/fs/upload?path=<vault path>[&replace=true]` with the raw bytes as the body.
#[derive(Debug, Clone, Deserialize)]
pub struct UploadQuery {
    pub path: String,
    /// Write over a file already there (otherwise 409).
    #[serde(default)]
    pub replace: bool,
}

/// `POST /api/attach?note=<note path>&name=<file name>` with the raw bytes as the body.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct AttachQuery {
    pub note: String,
    pub name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct Attached {
    /// Workspace-relative path of the saved file.
    pub path: String,
    /// What to write in the note: `![[name]]`.
    pub embed: String,
}

/// `GET /api/lsp`: per language, the files it covers and the server that would run (None = none).
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct LspServerInfo {
    pub lang: crate::lsp::LspLang,
    pub extensions: Vec<String>,
    pub command: Option<Vec<String>>,
    /// `file://` URI of the workspace root (the server's rootUri).
    #[serde(default)]
    pub root_uri: String,
}

/// `PUT /api/property`: set one frontmatter property of a note (a Bases cell edit).
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct PropertyEdit {
    pub path: String,
    pub key: String,
    /// What the user typed; lists are comma-separated.
    pub text: String,
    /// Write a YAML list (the cell showed a list).
    #[serde(default)]
    pub list: bool,
}

/// One cell of a Bases table, typed so the UI picks the widget.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(tag = "t", rename_all = "lowercase")]
#[ts(export)]
pub enum BaseCell {
    Null,
    Bool {
        value: bool,
    },
    Num {
        value: f64,
    },
    Text {
        value: String,
    },
    /// A note or file; `path` when it resolves in the workspace.
    Link {
        text: String,
        path: Option<String>,
    },
    Date {
        text: String,
    },
    List {
        items: Vec<BaseCell>,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct BaseColumn {
    /// `file.name`, `formula.X`, `note.X` or a bare property.
    pub id: String,
    pub label: String,
    /// Pixels, from the base's `columnSize`.
    pub width: Option<f64>,
    /// The frontmatter key behind the column (None for computed `file.*` / `formula.*`).
    pub key: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct BaseRow {
    pub path: String,
    pub cells: Vec<BaseCell>,
    /// Per column: the property's raw text for editing (lists comma-separated, `[[links]]` kept);
    /// None for computed columns.
    pub edit: Vec<Option<String>>,
    /// Per column: the property is a list in this note.
    pub is_list: Vec<bool>,
    /// The row's value of the view's `groupBy` (a board column), as text.
    pub group: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct BaseView {
    pub name: String,
    /// `table` (others render as a table too, for now).
    pub kind: String,
    pub columns: Vec<BaseColumn>,
    pub rows: Vec<BaseRow>,
    /// Rows matching before `limit`.
    pub count: u32,
    /// The `groupBy` column id (a board's columns), and its frontmatter key when editable
    /// (dragging a card rewrites it).
    pub group_by: Option<String>,
    pub group_key: Option<String>,
    /// Properties the matching notes have that the view does not show, most common first.
    pub properties: Vec<String>,
    /// The view's own filter (the base's top-level one applies too), as the editor shows and edits it.
    pub filters: Option<Filter>,
    pub sort: Vec<SortKey>,
}

/// A Base filter as Obsidian writes it: one expression (`status == "done"`, `file.hasTag("paper")`), or a group of them
/// that must all hold (`and`), any hold (`or`) or none hold (`not`).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(untagged)]
#[ts(export)]
pub enum Filter {
    Expr(String),
    Group(FilterGroup),
}

/// One of `and` / `or` / `not` (Obsidian's YAML has exactly one key per group).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "lowercase")]
#[ts(export)]
pub enum FilterGroup {
    And(Vec<Filter>),
    Or(Vec<Filter>),
    Not(Vec<Filter>),
}

impl Filter {
    /// From a `.base`'s YAML. Through JSON: serde_yaml reads and writes an enum as a YAML tag (`!and`), never as the
    /// one-key mapping Obsidian writes.
    pub fn from_yaml(v: &serde_yaml::Value) -> Option<Self> {
        serde_json::to_value(v).ok().and_then(|j| serde_json::from_value(j).ok())
    }
    pub fn to_yaml(&self) -> serde_yaml::Value {
        serde_json::to_value(self).ok().and_then(|j| serde_yaml::to_value(j).ok()).unwrap_or(serde_yaml::Value::Null)
    }
}

/// One sort key of a view, as Obsidian writes it (`{property: due, direction: DESC}`).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct SortKey {
    pub property: String,
    pub direction: SortDir,
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "UPPERCASE")]
#[ts(export)]
pub enum SortDir {
    Asc,
    Desc,
}

/// A change to one view of a `.base` (POST /api/base/view), written back to the file.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(tag = "op", rename_all = "snake_case")]
#[ts(export)]
pub enum ViewEdit {
    /// Stop showing a column.
    Hide { column: String },
    /// Show a property as a column (at the end).
    Show { column: String },
    /// A new board view grouped by a property, with the current view's columns on its cards.
    Board { name: String, group_by: String },
    /// The view's own filter (none: every note the base's filter lets in).
    Filters { filters: Option<Filter> },
    /// How the rows are sorted, first key first (none: the files' order).
    Sort { sort: Vec<SortKey> },
    /// The columns shown, in this order.
    Order { columns: Vec<String> },
    Rename { name: String },
    /// A copy of the view under a new name (a table), to change without losing the first.
    Duplicate { name: String },
    /// The view goes; the base keeps at least one.
    Remove,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct BaseViewEdit {
    pub path: String,
    pub view: String,
    pub edit: ViewEdit,
}

/// `POST /api/base/query`: Bases YAML that is not a file (a view block in a note, a plugin's query).
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct BaseInline {
    pub src: String,
    /// The note it lives in (Obsidian's `this.file`).
    #[serde(default)]
    #[ts(optional)]
    pub this: Option<String>,
}

/// `GET /api/home`: the home document (None: the classic Today screen) and its title.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct HomeDoc {
    pub path: Option<String>,
    pub title: Option<String>,
}

/// A tool Atlas drafted from how the workspace is used (`GET /api/tools/suggestions`). Nothing is
/// written until it is kept.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct ToolDraft {
    pub id: String,
    pub title: String,
    /// The observed pattern, in a sentence.
    pub why: String,
    pub files: Vec<DraftFile>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct DraftFile {
    pub path: String,
    pub text: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct ToolId {
    pub id: String,
}

/// A `.page` file as the core reads it: only to take the home page's title and to check the pages
/// the toolsmith drafts. The UI has the full model (`ui/src/lib/page-doc.ts`); these types are not
/// part of the HTTP contract.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PageDoc {
    pub title: Option<String>,
    pub rows: Vec<PageRow>,
}

/// One row: one or more columns, each a list of blocks top to bottom.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PageRow {
    pub columns: Vec<Vec<PageBlock>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum PageBlock {
    /// A Today part or a registered view; `src` is its YAML, as in a view block.
    View { view: String, title: Option<String>, src: String },
    /// A note, rendered.
    Note { path: String, title: Option<String> },
    /// A `.base` table (optionally one of its views).
    Base { path: String, view: Option<String>, title: Option<String> },
    /// Free markdown.
    Text { text: String, title: Option<String> },
}

/// A CSS snippet (`GET /api/css-snippets`).
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct CssSnippet {
    pub name: String,
    pub path: String,
    pub css: String,
}

/// `POST /api/view`: a ```` ```view ```` block of a note (its YAML body) → rows for a registered view.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct ViewBlock {
    pub path: String,
    pub src: String,
}

/// One item a view draws: a task (path + line) or a note (path).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct ViewRow {
    pub path: Option<String>,
    pub line: Option<u32>,
    pub title: String,
    /// `YYYY-MM-DD`.
    pub date: Option<String>,
    /// For tasks: ticked or not.
    pub done: Option<bool>,
    pub props: std::collections::BTreeMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct ViewResult {
    /// The view to draw it with (`calendar`, `list`, `table`, a plugin view…).
    pub kind: String,
    pub rows: Vec<ViewRow>,
}

/// `POST /api/base/row`: a new note in a base's view.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct BaseNewRow {
    pub path: String,
    /// The `.base` file, and the view (default: the first).
    #[serde(default)]
    #[ts(optional)]
    pub view: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct BaseRowCreated {
    pub path: String,
    /// The new note shows in the view (its filters could not all be satisfied by prefilling).
    pub matches: bool,
}

/// `GET /api/base?path=<.base>&this=<embedding note>`.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct BaseResult {
    pub views: Vec<BaseView>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct BaseQuery {
    pub path: String,
    #[serde(default)]
    #[ts(optional)]
    pub this: Option<String>,
}

/// `GET /api/graph`: notes and the (undirected, unique) links between them, by index.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct Graph {
    pub nodes: Vec<GraphNode>,
    pub edges: Vec<[u32; 2]>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct GraphNode {
    pub path: String,
}

/// One link to a note, as written in another note.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct Backlink {
    /// Workspace-relative note that contains the link.
    pub source: String,
    /// 1-based line of the link.
    pub line: u32,
    /// That line, trimmed (and cut when long).
    pub context: String,
    /// `![[…]]` / `![](…)`: the note embeds the target.
    pub embed: bool,
    /// The property the link is the value of (`up: "[[X]]"`, `up:: [[X]]`): a typed link.
    pub relation: Option<String>,
}

/// `GET /api/backlinks?path=` — notes linking to `path`, sorted by source then line.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct Backlinks {
    pub path: String,
    pub links: Vec<Backlink>,
    /// Lines naming the note without linking to it (Obsidian's "unlinked mentions"), max 200.
    pub unlinked: Vec<Backlink>,
}

/// `POST /api/link-mention`: turn the mention of `target` on `line` of `source` into a link.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct LinkMention {
    pub source: String,
    pub line: u32,
    pub target: String,
}

/// `POST /api/task/tick`: tick the open task at `path`:`line`.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct TaskRef {
    pub path: String,
    pub line: u32,
}

/// What a `[[` link can point at (link_targets.rs).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "lowercase")]
#[ts(export)]
pub enum TargetKind {
    Note,
    Mail,
    Page,
    Pdf,
    Image,
    Base,
    Canvas,
    Other,
}

/// `GET /api/link-targets?q=&from=`: one row of the `[[` list.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct LinkTarget {
    pub path: String,
    /// what goes between `[[` and `]]`: the name, or the path when another file shares it
    pub link: String,
    pub kind: TargetKind,
    /// the alias or title the query matched (then `[[link|alias]]`)
    pub alias: Option<String>,
    pub title: Option<String>,
    /// linked from or to the note being written
    pub near: bool,
}

#[derive(Debug, Clone, Deserialize)]
pub struct LinkTargetsQuery {
    #[serde(default)]
    pub q: String,
    pub from: Option<String>,
}

/// `POST /api/task/line`: one task line ticked (`done`) or opened again, as text — no file is read or
/// written (the note editor holds the line). Answers the lines that replace it (`TaskTicked`).
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct TaskTick {
    pub text: String,
    pub done: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct TaskTicked {
    pub lines: Vec<String>,
}

/// `POST /api/fs/move`: rename or move a file or folder (no overwrite).
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct MoveRequest {
    pub from: String,
    pub to: String,
}

/// `POST /api/fs/move` → the links that followed it (relink.rs): how many, in which notes (paths after the move).
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct Moved {
    pub links: u32,
    pub notes: Vec<String>,
}

/// `POST /api/tags/rename`: a tag renamed in every note (tags.rs `rename`), nested tags with it.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct TagRename {
    pub from: String,
    pub to: String,
}

/// What a tag rename changed: tags renamed, in which notes.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct TagRenamed {
    pub tags: u32,
    pub notes: Vec<String>,
}

/// `POST /api/fs/trash` → where it went (`the Trash` or `.atlas/trash/<stamp>`).
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct Trashed {
    pub path: String,
    pub to: String,
}


/// LaTeX Suite snippet sources (JS text; the UI evaluates the array) + the variables file text.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct Snippets {
    pub sources: Vec<String>,
    pub variables: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct Suggestion {
    pub value: String,
    pub label: String,
}

/// `POST /api/frontmatter/edit`: one properties-panel change applied to the text the editor holds
/// (not the file: the editor owns the open note, so the change is one undoable edit there).
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct FrontmatterEditRequest {
    pub text: String,
    pub edit: FrontmatterEdit,
}

/// What the properties panel can do to one property; everything else in the file stays as it was.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(tag = "op", rename_all = "lowercase")]
#[ts(export)]
pub enum FrontmatterEdit {
    /// Set `key` (added at the end when missing); `null` leaves `key:` empty, a list is block style.
    Set {
        key: String,
        #[ts(type = "unknown")]
        value: serde_json::Value,
    },
    Remove { key: String },
    Rename { from: String, to: String },
}

/// The note's whole text after a frontmatter edit.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct FrontmatterText {
    pub text: String,
}

/// How a property is shown and edited in the properties panel.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "lowercase")]
#[ts(export)]
pub enum PropertyKind {
    Text,
    Number,
    Bool,
    Date,
    Datetime,
    List,
    Tags,
    Link,
    Links,
    Enum,
}

/// One property of the vault's spec file.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct PropertySpec {
    pub kind: PropertyKind,
    /// The choices of an `enum`.
    #[serde(default)]
    pub values: Vec<String>,
    /// Values offered while typing (a `link` / `links` / `list` property's usual hubs).
    #[serde(default)]
    pub suggest: Vec<String>,
    #[serde(default)]
    pub description: String,
    /// How a date is written (`YYYY-MM-DD HH:mm`); empty = the kind's usual form.
    #[serde(default)]
    pub format: String,
}

/// The properties a note of one `type:` has.
#[derive(Debug, Clone, Default, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct NoteTypeSpec {
    #[serde(default)]
    pub required: Vec<String>,
    #[serde(default)]
    pub optional: Vec<String>,
}

/// `GET /api/properties/spec`: the vault's property spec (`[editor] properties_spec`). Without the
/// file every map is empty and the panel infers each kind from the value's shape.
#[derive(Debug, Clone, Default, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct PropertySpecs {
    /// The file it was read from, relative to the vault.
    pub path: String,
    pub found: bool,
    pub properties: std::collections::BTreeMap<String, PropertySpec>,
    pub types: std::collections::BTreeMap<String, NoteTypeSpec>,
    /// What could not be read (an unknown kind, a YAML error); the rest is still used.
    pub problems: Vec<String>,
}
