//! `.atlas/config.toml`: optional, and every key has a default (invariant: zero required fields).
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use std::path::Path;
use ts_rs::TS;

pub const CONFIG_FILE: &str = ".atlas/config.toml";

/// Every field's doc comment is its description in the Settings pane (generated from the JSON
/// schema), so a new setting needs only a field here: no hand-written form to forget.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS, JsonSchema)]
#[serde(default)]
#[ts(export)]
pub struct Config {
    /// Folder for daily capture files (`<folder>/YYYY-MM-DD.md`). Under notes/ by default; a vault whose logs are in `log/` already keeps them there.
    pub log_dir: String,
    /// The template a new day's log starts from (a name in the templates folder, `[notes] templates`). Empty: its date
    /// and `type: log` as properties and the day as a heading, in the vault's date names.
    pub log_template: String,
    /// The folders a day's log is filed in under the log folder, as a date format (`YYYY/MM-MMMM`: `2026/10-October/`,
    /// month names in the vault's date names). Empty: every day directly in the log folder.
    pub log_folders: String,
    /// Your focus file, shown on Today. Atlas only displays it, never writes it.
    pub focus: String,
    /// The home screen, opened first: a `.page` layout file (rows and columns of blocks: capture,
    /// focus, tasks, log, activity, views, notes…) or a `.md` note of view blocks. Created once from a
    /// template if missing, then yours. Empty = the built-in Today screen.
    pub home: String,
    /// Skipped by search, tasks and the file watcher. A bare name matches at any depth (`node_modules`);
    /// a path is that entry and what is under it (`refs/zotero`); a leading `/` means "only at the
    /// vault's root" (`/runs` skips the top-level `runs` but not `notes/runs`).
    pub ignore: Vec<String>,
    /// Vim keybindings in the editor. Off by default, as in Obsidian: a newcomer's keys type text.
    pub vim: bool,
    pub ui: UiConfig,
    pub editor: EditorConfig,
    pub terminal: TerminalConfig,
    pub files: FilesConfig,
    pub activity: ActivityConfig,
    pub pdf: PdfConfig,
    pub draw: DrawConfig,
    pub lsp: LspConfig,
    pub automation: AutomationConfig,
    pub plugins: PluginsConfig,
    pub notes: NotesConfig,
    pub web: WebConfig,
}

/// What the keys every other program uses do while vim is on.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize, TS, JsonSchema)]
#[serde(rename_all = "lowercase")]
#[ts(export)]
pub enum VimKeys {
    /// Vim's own: Ctrl+V is block selection, Ctrl+A / Ctrl+X change a number, `u` and Ctrl+R undo and redo.
    #[default]
    Classic,
    /// Ctrl+C, Ctrl+X, Ctrl+V, Ctrl+Z, Ctrl+Y and Ctrl+A copy, cut, paste, undo, redo and select all —
    /// in normal, visual and insert mode alike. The rest of vim is untouched; what is given up is vim's
    /// own use of those keys (block selection on Ctrl+V, changing a number with Ctrl+A / Ctrl+X).
    Desktop,
}

/// Where a captured thought goes.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize, TS, JsonSchema)]
#[serde(rename_all = "lowercase")]
#[ts(export)]
pub enum CaptureMode {
    /// A timestamped bullet in today's log file.
    #[default]
    Log,
    /// A note of its own in the inbox folder (a "fleeting note"), made from a template.
    Note,
}

/// Notes: capture, and new notes from templates (docs/guides/NOTES-SYSTEM.md).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS, JsonSchema)]
#[serde(default)]
#[ts(export)]
pub struct NotesConfig {
    /// What capture (Ctrl+Alt+C, `atlas capture`) writes: a bullet in today's log, or a note of its own.
    pub capture: CaptureMode,
    /// Folder for captured notes (when capture makes notes).
    pub inbox: String,
    /// The template captured notes start from (a file name in the templates folder, without `.md`).
    pub capture_template: String,
    /// Width in pixels of a picture a capture embeds in the day's log: written `![[shot.png|160]]` (Obsidian's size), so
    /// a screenshot is a thumbnail there and in Obsidian. 0 = full size.
    pub capture_thumbnail: u32,
    /// Folder of note templates for "New note from a template…": notes in Atlas's template language —
    /// `{{title}}`, `{{date:dddd D MMMM}}`, `{{day-1d}}`, `{{prompt:Who}}`, `{{#if …}}`… (docs/guides/TEMPLATES.md).
    /// A template may say where its notes go with a `create_in: <folder>` line in its frontmatter
    /// (the line is not copied into the note).
    pub templates: String,
    /// Folder a new note goes to when nothing says otherwise (no `create_in:` in its template, and
    /// it was not made from inside a folder of notes). Empty = the vault's root.
    pub dir: String,
    /// The template a new note made without one gets, by its name or its folder (first rule that fits). Empty:
    /// the vault's Templater "file templates" / "folder templates", when it has them switched on.
    pub template_rules: Vec<TemplateRule>,
    /// The template a new note gets when nothing else chose one (no template asked for, no rule fits), so every note
    /// starts with properties. Empty: `default` when the templates folder has one, else the
    /// built-in `date` / `type` / `tags`. Left out of the "New…" list: it is what a plain note already is.
    pub default_template: String,
}

/// One rule of `template_rules`: `title` is a regex searched in the note's path (as Templater does), `folder` a
/// folder the note goes into (or under); the rule fits when what it names fits.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS, JsonSchema)]
#[ts(export)]
pub struct TemplateRule {
    #[serde(default)]
    #[ts(optional)]
    pub title: Option<String>,
    #[serde(default)]
    #[ts(optional)]
    pub folder: Option<String>,
    /// A template's name in the templates folder (without `.md`).
    pub template: String,
}

impl Default for NotesConfig {
    fn default() -> Self {
        Self { capture: CaptureMode::Log, inbox: "inbox".into(), capture_template: "fleeting".into(), capture_thumbnail: 160, templates: "templates".into(), dir: "notes".into(), template_rules: Vec::new(), default_template: String::new() }
    }
}

/// The built-in References plugin (the References page, \cite completion, the PDF reader's paper actions): on in a
/// vault unless listed in `plugins.off`. The references themselves are the catalog-papers plugin's.
pub const LIBRARY_PLUGIN: &str = "library";

/// Plugins: the vault's own (`.atlas/plugins/<id>/`) and the built-in ones (`library`).
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, TS, JsonSchema)]
#[serde(default)]
#[ts(export)]
pub struct PluginsConfig {
    /// Plugins switched off: listed in Settings but not loaded (no command, button or views). A
    /// built-in plugin goes here too: `library` removes the References page from this vault.
    pub off: Vec<String>,
    /// The OpenID Connect provider plugins sign in with when they name none (`https://auth.example.org`: Authelia,
    /// Keycloak, …). Empty: each plugin names its own, or finds it from the service it talks to.
    pub oidc_issuer: String,
    /// Atlas's client id at that provider, registered once for every plugin (a public client: no secret).
    pub oidc_client_id: String,
    /// The redirect address registered for that client (`https://localhost/atlas`).
    pub oidc_redirect: String,
}

/// Code intelligence (language servers): completion, hover, diagnostics, go to definition (F12),
/// rename (F2), format (Shift+Alt+F), references (Shift+F12). Per language: empty = the first
/// known server found on PATH, `off` = none, anything else = the command line to run.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS, JsonSchema)]
#[serde(default)]
#[ts(export)]
pub struct LspConfig {
    /// Language servers on or off altogether.
    pub enabled: bool,
    /// Rust (.rs). Auto: rust-analyzer.
    pub rust: String,
    /// Python (.py). Auto: basedpyright, pyright, pylsp.
    pub python: String,
    /// LaTeX (.tex, .bib). Auto: texlab.
    pub latex: String,
    /// C / C++. Auto: clangd.
    pub c: String,
    /// The locale the servers write their messages in (e.g. en_US.UTF-8, es_ES.UTF-8). Empty = the
    /// system's (yours is Spanish; the default asks for English).
    pub language: String,
    /// Hints the server draws inside the code, faint: a parameter's name at a call, the type a variable was given.
    pub inlay_hints: bool,
    /// The Python environment for the Python server and new terminals: a folder (a venv, a conda env; relative to the
    /// vault or absolute), "none" for the system's Python. Empty = the vault's own .venv or venv when there is one.
    pub python_env: String,
}

impl Default for LspConfig {
    fn default() -> Self {
        Self { enabled: true, rust: String::new(), python: String::new(), latex: String::new(), c: String::new(), language: "en_US.UTF-8".into(), inlay_hints: true, python_env: String::new() }
    }
}

/// Things Atlas does by itself.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS, JsonSchema)]
#[serde(default)]
#[ts(export)]
pub struct AutomationConfig {
    /// Run workspace commands that have a `schedule` (e.g. `daily 03:00`) while Atlas is open.
    /// Results: the Commands pane and `.atlas/cache/schedule.log`; failures notify.
    pub run_schedules: bool,
}

impl Default for AutomationConfig {
    fn default() -> Self {
        Self { run_schedules: true }
    }
}

/// Appearance.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS, JsonSchema)]
#[serde(default)]
#[ts(export)]
pub struct UiConfig {
    /// Color theme: dark, light, or `system` to follow the desktop's setting. The phone app always follows the phone's.
    pub theme: Theme,
    /// A VS Code color theme (.json) to dress Atlas in: window, editor, terminal and syntax colours.
    /// Empty = Atlas's own palette. It applies while the theme above is of its kind (a dark theme
    /// dresses dark mode; light mode keeps Atlas's light palette).
    pub vscode_theme: String,
    /// Accent colour (links, selection, buttons), as `#rrggbb`. Empty = the theme's own.
    pub accent: String,
    /// Font for the interface (menus, panes, tabs). Empty = Inter.
    pub ui_font: String,
    /// Interface text size, in px (14 = default; everything scales with it).
    #[schemars(range(min = 10, max = 22))]
    pub font_size: u32,
    /// Desktop window rendering (applies on the next app start). Auto = compatible: nothing runs
    /// while idle. Accelerated scrolls more smoothly but keeps the window busy.
    pub gpu_rendering: GpuRendering,
    /// CSS snippets switched off. Every `.css` file in `.atlas/snippets/` restyles Atlas live (like
    /// Obsidian snippets) unless its name is here.
    pub css_snippets_off: Vec<String>,
    /// Where open tabs are listed: a vertical sidebar (Zen-style, with pinned tabs) or the
    /// classic horizontal strip above each pane.
    pub tabs: TabsLayout,
    /// Where the side panel (files, search, outline, git) shows: its own column beside the editors
    /// (`dock`), or inside the left bar, under the list of tabs (`sidebar`; vertical tabs only).
    pub side_panel: SidePanelPlace,
    /// Motion: `full` (the default: short, subtle transitions and fades) or `instant` (the interface changes at
    /// once). Off on e-ink and under the system's reduced motion; the swipe and history signs and spinners move either way.
    pub motion: Motion,
    /// E-ink screens (a Boox and the like): pure black on white, no motion, no shadows, no tints that only say
    /// something in colour, links underlined. `auto` turns it on where the screen is one — the phone app on a Boox, or
    /// a browser that reports a slow-refresh screen.
    pub eink: Eink,
    /// E-ink: when the whole screen is refreshed (black, then white) to clear the ghosts partial updates leave.
    pub eink_refresh: EinkRefresh,
    /// Reopen the tabs of the last session when Atlas starts. Off: every start shows only the home
    /// screen (reloading the window still keeps your tabs).
    pub restore_layout: bool,
    /// Resting the pointer on a tab in the left bar shows what it holds (a note, a picture, a PDF's
    /// first page).
    pub tab_preview: bool,
    /// Ctrl+Tab: `glance` shows the focused split's tabs, most recent first, and switches when Ctrl
    /// is let go (Esc stays); `cycle` steps through every tab in the bar's order.
    pub tab_switcher: TabSwitcher,
    /// Background tabs sleep to free memory: after this many minutes unseen a tab's view is closed, and it comes back
    /// where it was when shown again (notes wait three times as long; terminals and unsaved tabs never sleep). 0: never.
    pub sleep_after_min: u32,
    /// The tabs seen last never sleep, however long unseen: switching among these stays instant.
    pub awake_tabs: u32,
    /// The libraries the Library page shows, in this order (`drawings`, `references`, `catalog`…: the core's and the
    /// vault's plugins'). Empty: every one the vault has. A work vault might keep `["drawings", "references"]`.
    pub libraries: Vec<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS, JsonSchema)]
#[serde(rename_all = "lowercase")]
#[ts(export)]
pub enum TabSwitcher {
    /// The focused split's tabs as cards, most recently used first; let go of Ctrl to switch.
    Glance,
    /// The next tab in the left bar's order, at once.
    Cycle,
}


#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS, JsonSchema)]
#[serde(rename_all = "lowercase")]
#[ts(export)]
pub enum PropertiesView {
    /// Out of the way: a faint "Properties" line above the note; a click shows the YAML.
    Hidden,
    /// In the note, above its text, as Obsidian shows them.
    Inline,
    /// In a panel at the right of the note, one control per property (date, list, link…).
    Panel,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS, JsonSchema)]
#[serde(rename_all = "lowercase")]
#[ts(export)]
pub enum TabsLayout {
    /// One sidebar on the left lists every open tab; pinned tabs on top.
    Vertical,
    /// A tab strip on top of every pane group.
    Horizontal,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS, JsonSchema)]
#[serde(rename_all = "lowercase")]
#[ts(export)]
pub enum SidePanelPlace {
    /// A column of its own, left of the editors.
    Dock,
    /// The lower half of the left bar, under the tab list.
    Sidebar,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize, TS, JsonSchema)]
#[serde(rename_all = "lowercase")]
#[ts(export)]
pub enum Eink {
    /// On where the screen is e-ink (detected), off elsewhere.
    #[default]
    Auto,
    /// Always: this device's screen is e-ink.
    On,
    /// Never.
    Off,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize, TS, JsonSchema)]
#[serde(rename_all = "lowercase")]
#[ts(export)]
pub enum EinkRefresh {
    /// After every change of tab and every scroll that came to rest (a PDF page, a note read down): the least ghosting.
    #[default]
    Often,
    /// Only when another tab comes to the front.
    Navigation,
    /// Only by the command "E-ink: clear the screen".
    Manual,
}

/// Short (≈120 ms) transitions and fades by default; e-ink screens and the system's reduced motion turn them off.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize, TS, JsonSchema)]
#[serde(rename_all = "lowercase")]
#[ts(export)]
pub enum Motion {
    /// No transitions or fades.
    Instant,
    /// The interface's transitions and fades.
    #[default]
    Full,
}

/// When the task fields (due date, priority, repeat…) are offered while a task is typed.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize, TS, JsonSchema)]
#[serde(rename_all = "lowercase")]
#[ts(export)]
pub enum TaskSuggestMode {
    #[default]
    /// Always, on a task line, as Obsidian Tasks with "minimum match 0": the fields the last word matches, else all of them.
    Always,
    /// Only when the last word matches a field's name ("du" → due date), or after `@`.
    Match,
    /// Never by itself (Ctrl+Space still asks).
    Off,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS, JsonSchema)]
#[serde(rename_all = "lowercase")]
#[ts(export)]
pub enum GpuRendering {
    /// Compatible: idle costs nothing (DMA-BUF kept a core 14–41 % busy with nothing happening).
    Auto,
    /// WebKit's DMA-BUF renderer: smoother scrolling, but busy while idle.
    Accelerated,
    /// No DMA-BUF (`WEBKIT_DISABLE_DMABUF_RENDERER=1`).
    Compatible,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS, JsonSchema)]
#[serde(rename_all = "lowercase")]
#[ts(export)]
pub enum DateNames {
    /// January, Monday…
    English,
    /// enero, lunes…
    Spanish,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS, JsonSchema)]
#[serde(rename_all = "lowercase")]
#[ts(export)]
pub enum Theme {
    Dark,
    Light,
    /// Follow the desktop setting.
    System,
}

/// Text and code editor.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS, JsonSchema)]
#[serde(default)]
#[ts(export)]
pub struct EditorConfig {
    /// Font for code files (any installed monospace font).
    pub code_font: String,
    /// Code font size, in px.
    #[schemars(range(min = 9, max = 28))]
    pub code_font_size: u32,
    /// Font for markdown notes.
    pub prose_font: String,
    /// Markdown font size, in px.
    #[schemars(range(min = 10, max = 28))]
    pub prose_font_size: u32,
    /// Line numbers in code files.
    pub line_numbers: bool,
    /// Wrap long lines in code files (markdown always wraps).
    pub wrap_code: bool,
    /// Vertical indentation guides in code files.
    pub indent_guides: bool,
    /// Minimap (zoomed-out overview) on the right of code files. Costs CPU on large files.
    pub minimap: bool,
    /// Path bar (folder › file) above the editor.
    pub breadcrumbs: bool,
    /// `[[` / `![[` completion of notes, files and `#headings` in markdown.
    pub link_completion: bool,
    /// Citations from the Library while writing: `@key` in notes (inserts `[@key]`) and `\cite{…}` in notes and .tex.
    pub citation_completion: bool,
    /// `/` menu of blocks (headings, to-do, callouts, math, table…) in markdown.
    pub slash_menu: bool,
    /// Fold markdown sections under their heading (gutter arrow, Ctrl+Shift+[ / ]).
    pub fold_headings: bool,
    /// "Linked mentions" under each note: the notes that link to it, with the line around the link.
    pub backlinks: bool,
    /// Show the note's file name as a title above its first line (Obsidian's "inline title").
    pub inline_title: bool,
    /// Typewriter scrolling in notes: the line being written stays at the middle of the pane, so
    /// the text moves and your eyes do not.
    pub typewriter: bool,
    /// In a code file, mark the lines that differ from what git has (new, changed, removed) in the gutter.
    pub git_gutter: bool,
    /// A bar of tools above a code file: find, replace, go to line, format, problems, and what
    /// plugins add for the file (run, build, test).
    pub code_bar: bool,
    /// A bar of formatting buttons above a note (bold, italic, heading, lists, to-do, quote, code,
    /// link, table) — for when the keys are not in the fingers yet.
    pub format_bar: bool,
    /// While the caret is inside a formula — in a note or a .tex file — show it drawn, updated as it is
    /// typed: display math (`$$…$$`, `\[…\]`, equation environments) under it in the text, inline math in a
    /// small box above its line.
    pub math_preview: bool,
    /// Resting the pointer on a link in a note ([[note]], [text](address)) shows what it leads to.
    pub link_preview: bool,
    /// A task's dates, priority and repeat rule drawn as small chips (a calendar and "Fri 17 Oct")
    /// instead of Obsidian Tasks' emoji; the line under the caret shows its text. The file keeps the emoji.
    pub task_chips: bool,
    /// While a task is typed — in a note, the capture box on the Home page and the quick-capture window alike —
    /// the list of its fields (dates, priority, repeat), in Obsidian Tasks' order and words.
    pub task_suggest: TaskSuggestMode,
    /// `[] ` or `todo ` (any case) at the start of a line in a note becomes `- [ ] `, as in the capture boxes.
    pub task_short_forms: bool,
    /// Save code files (anything but notes) by themselves as they are typed, as notes are. Off: only Ctrl+S
    /// saves them (a dot on the tab meanwhile), and their unsaved text is kept in a recovery copy that is
    /// offered back when the file is opened again.
    pub autosave_code: bool,
    /// Live editing: a note open on two devices (the desktop and the Boox, two windows) is edited together — each
    /// one's typing and cursor show on the other as it happens, and drawings share their strokes and pen. Off: each
    /// device saves on its own, as files do.
    pub live: bool,
    /// A note's properties (its frontmatter): hidden behind a "Properties" line, shown in the note,
    /// or in a panel at the right of the note where each one is edited with a control of its kind.
    pub properties: PropertiesView,
    /// The vault's property spec: which properties exist, their kinds and which note types use
    /// them (the panel's controls and suggestions). A path from the vault's root; without the
    /// file, kinds are guessed from the values.
    pub properties_spec: String,
    /// With vim on: `classic` leaves every key to vim; `desktop` gives Ctrl+C / X / V / Z / Y / A back
    /// to copy, cut, paste, undo, redo and select all, also in visual mode.
    pub vim_keys: VimKeys,
    /// An AI agent's own files (memories, session logs, its instructions): not your notes. They are
    /// left out of links, backlinks, the graph, `[[` completion, Bases, open tasks, quick open, the
    /// activity list and search (the Search pane has a switch to include them); the file tree still
    /// shows them. Same pattern rules as `ignore`: `/docs` is the top-level folder, `/AGENTS.md` a file.
    pub index_exclude: Vec<String>,
    /// Month and day names in Bases dates (`.format("MMMM")`, `dddd`), templates and daily notes.
    pub date_names: DateNames,
    /// Obsidian's "Strict line breaks": on, a single newline inside a paragraph is not a break in rendered notes (the
    /// Markdown rule); off (Obsidian's default), each line shows as written — an address, a poem, a screenshot's text.
    pub strict_line_breaks: bool,
    /// Where pasted / dropped files go, relative to the note's folder ("" = next to the note).
    pub attachment_folder: String,
    /// LaTeX Suite snippets while typing math in markdown (and in .tex files).
    pub latex_snippets: bool,
    /// Snippet file or folder in Obsidian LaTeX Suite format (a JS array of {trigger, replacement, options}).
    /// A relative path is inside the vault (`.atlas/snippets/snippets.coffee`); `~/…` is under home.
    pub latex_snippets_file: String,
    /// Snippet variables file (e.g. `${GREEK}` → `alpha|beta|…`).
    pub latex_snippet_variables_file: String,
    /// Line spacing in markdown notes (1.68 = default).
    #[schemars(range(min = 1.2, max = 2.2))]
    pub prose_line_height: f32,
    /// Maximum width of a markdown note, in characters (0 = full width).
    #[schemars(range(min = 0, max = 200))]
    pub prose_width: u32,
}

/// Terminal and Claude panes.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS, JsonSchema)]
#[serde(default)]
#[ts(export)]
pub struct TerminalConfig {
    /// Where the terminal panel docks.
    pub position: PanelPosition,
    /// Smallest width (docked right) or height (docked bottom) of the terminal panel, in px, so
    /// other panes cannot squeeze it out of sight.
    #[schemars(range(min = 80, max = 1200))]
    pub min_size: u32,
    /// Terminal font size, in px.
    #[schemars(range(min = 9, max = 24))]
    pub font_size: u32,
    /// How the terminal draws its text.
    pub renderer: TerminalRenderer,
    /// `[[wikilinks]]` printed in a terminal are links: a click opens the note (Ctrl+click beside),
    /// the pointer on one previews it; a link to no note yet starts it.
    pub wikilinks: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS, JsonSchema)]
#[serde(rename_all = "lowercase")]
#[ts(export)]
pub enum TerminalRenderer {
    /// WebGL: fast, and box-drawing lines join exactly (falls back to text when WebGL is missing).
    Gpu,
    /// Plain page text (the terminal's text is in the page, for tests and screen readers).
    Text,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS, JsonSchema)]
#[serde(rename_all = "lowercase")]
#[ts(export)]
pub enum PanelPosition {
    Bottom,
    Right,
}

/// Where a link to a web page opens.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize, TS, JsonSchema)]
#[serde(rename_all = "lowercase")]
#[ts(export)]
pub enum WebLinks {
    /// A tab of Atlas when the site lets itself be shown inside another page; else a browsing window, as below.
    #[default]
    Tab,
    /// A browsing window of Atlas: back / forward with Alt+← / Alt+→, ads blocked (below), Super+Shift+O hands the page to
    /// the desktop's browser.
    Window,
    /// The desktop's own browser.
    Browser,
}

/// The web: links, and ad blocking in Atlas's browsing windows (docs/design/WEB-WINDOWS.md).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS, JsonSchema)]
#[serde(default)]
#[ts(export)]
pub struct WebConfig {
    /// Where a link to a web page (in a note, a mail, a plugin) opens.
    pub open_links: WebLinks,
    /// Block ads and trackers in Atlas's browsing windows: WebKit's own content blocker, fed from the lists below.
    pub block_ads: bool,
    /// Filter lists in Adblock Plus / uBlock Origin syntax, fetched once a week (uBlock's extended syntax — scriptlets —
    /// has no WebKit equivalent and is skipped). A change applies to the next window.
    pub filter_lists: Vec<String>,
}

impl Default for WebConfig {
    fn default() -> Self {
        Self {
            open_links: WebLinks::Tab,
            block_ads: true,
            filter_lists: vec![
                "https://easylist.to/easylist/easylist.txt".into(),
                "https://easylist.to/easylist/easyprivacy.txt".into(),
                "https://ublockorigin.github.io/uAssets/filters/filters.txt".into(),
            ],
        }
    }
}

/// File tree.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS, JsonSchema)]
#[serde(default)]
#[ts(export)]
pub struct FilesConfig {
    /// Show folders from the ignore list (dimmed) in the file tree.
    pub show_ignored: bool,
    /// Show dotfiles and dot-folders (except `.git`).
    pub show_hidden: bool,
    /// Mark changed files in the tree from git (M modified, A added, U untracked, D deleted, R renamed,
    /// C conflict); folders holding changes get a dot.
    pub git_status: bool,
    /// The view each file extension opens in, when not Atlas's usual one (`tsv = "editor"`,
    /// `dat = "table"`, `json = "plugin:runs"`). Set from "Open with… → always".
    pub open_with: std::collections::BTreeMap<String, String>,
}

/// PDF reader and annotator.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS, JsonSchema)]
#[serde(default)]
#[ts(export)]
pub struct PdfConfig {
    /// Colour a new highlight, pen stroke or text note starts with.
    pub color: AnnotationColor,
    /// Pen (ink) stroke width.
    #[schemars(range(min = 1, max = 12))]
    pub ink_thickness: u32,
    /// Zoom a PDF opens at.
    pub open_zoom: PdfZoom,
    /// Also export annotations to the paper's reading note every time the PDF is saved.
    pub export_on_save: bool,
    /// What reads PDFs: the reader, covers, thumbnails, previews and embedded pages. One engine per document, never
    /// both; a file the chosen one cannot open offers the other.
    pub engine: PdfEngine,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS, JsonSchema)]
#[serde(rename_all = "lowercase")]
#[ts(export)]
pub enum PdfEngine {
    /// PDFium (WebAssembly, in a worker): fast on scans and books.
    Pdfium,
    /// pdf.js: the backup.
    Pdfjs,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS, JsonSchema)]
#[serde(rename_all = "lowercase")]
#[ts(export)]
pub enum AnnotationColor {
    Yellow,
    Green,
    Blue,
    Pink,
    Red,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS, JsonSchema)]
#[serde(rename_all = "kebab-case")]
#[ts(export)]
pub enum PdfZoom {
    /// Fit the page width.
    PageWidth,
    /// Whole page visible.
    PageFit,
    /// 100 %.
    Actual,
}

impl Default for PdfConfig {
    fn default() -> Self {
        Self { color: AnnotationColor::Yellow, ink_thickness: 2, open_zoom: PdfZoom::PageWidth, export_on_save: false, engine: PdfEngine::Pdfium }
    }
}

/// Drawing: Excalidraw (in Atlas). An `.rnote` is an input the Rnote plugin converts into one.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS, JsonSchema)]
#[serde(default)]
#[ts(export)]
pub struct DrawConfig {
    /// Folder where "New drawing" creates `.excalidraw` files.
    pub dir: String,
    /// Drawings open as a notepad (the Boox's look: its bar of pens and paper, fingers move the page). Off: plain
    /// Excalidraw with its own toolbar. An e-ink screen always has the notepad.
    pub notepad: bool,
    /// The pages a new drawing gets. Ask: chosen each time from the list.
    pub page_format: PageFormat,
    // ── the Boox's notepad (e-ink screens; org.atlas.notepad) ──
    /// Pen at the start (knote2's pens, Boox Notes'); the pen menu changes it while drawing.
    pub pen: NotepadPen,
    /// Paper of a new page.
    pub paper: NotepadPaper,
    /// Hold the pen still for half a second at the end of a stroke: a line, rectangle, ellipse or triangle drawn
    /// cleanly, as Boox Notes does.
    pub snap: bool,
    /// Shape recogniser. openink: boox_5c_re's trained one (lines, boxes, ellipses, triangles, polygons, arcs,
    /// arrows); atlas: the earlier one (lines, boxes, ellipses, triangles).
    pub shapes: ShapeRecogniser,
    /// Scribble back and forth over strokes (as Boox Notes does) and they are erased instead of the scribble kept.
    pub scribble: bool,
    /// A drawing opens with the pen, width and colour in hand when the notepad last closed; off: the defaults below.
    pub remember_pen: bool,
    /// Pen width at the start.
    pub width: PenWidth,
    /// Colour at the start.
    pub color: PenColor,
    /// Eraser. Whole strokes: a touch takes the stroke; part of strokes: only where the eraser passes.
    pub eraser: EraserMode,
    /// Shape at the start.
    pub shape: StartShape,
    /// Text size at the start.
    pub text_size: TextSize,
    /// A notebook shows one page filling the screen: the fingers zoom into it but never out of it or past its edges; a
    /// swipe from a side or the arrows turn it. Off: the canvas pans and zooms freely.
    pub page_mode: bool,
    /// A notebook's pages as a grid on one canvas, as Rnote lays them out (1: one under another).
    #[schemars(range(min = 1, max = 4))]
    pub per_row: u32,
}

/// Declares a setting's choices: each variant written as the given name (the names the notepad has always used).
macro_rules! choices {
    ($(#[$m:meta])* $name:ident { $($(#[$vm:meta])* $v:ident = $s:literal),+ $(,)? }) => {
        $(#[$m])*
        #[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize, TS, JsonSchema)]
        #[ts(export)]
        pub enum $name { $($(#[$vm])* #[serde(rename = $s)] $v,)+ }
        impl $name {
            pub fn as_str(self) -> &'static str { match self { $(Self::$v => $s,)+ } }
        }
    };
}
choices!(/// knote2's pens.
    NotepadPen { Ballpoint = "ballpoint", #[default] Fountain = "fountain", Brush = "brush", Marker = "marker", Square = "square", Pencil = "pencil", Charcoal = "charcoal" });
choices!(/// A new page's paper.
    NotepadPaper { #[default] Blank = "blank", Lines = "lines", Grid = "grid", Dots = "dots", Fine = "fine", Graph = "graph", Staff = "staff" });
choices!(ShapeRecogniser { #[default] Openink = "openink", Atlas = "atlas" });
choices!(PenWidth { Thin = "thin", #[default] Normal = "normal", Thick = "thick", VeryThick = "very thick" });
choices!(PenColor { #[default] Black = "black", DarkGrey = "dark grey", LightGrey = "light grey", Red = "red", Blue = "blue", Green = "green", Orange = "orange", Purple = "purple" });
choices!(EraserMode { #[default] WholeStrokes = "whole strokes", PartOfStrokes = "part of strokes" });
choices!(StartShape { Line = "line", Arrow = "arrow", #[default] Rectangle = "rectangle", Ellipse = "ellipse", Diamond = "diamond", Triangle = "triangle", Axes = "axes", AxesFull = "axes_full" });
choices!(TextSize { Small = "small", #[default] Medium = "medium", Large = "large", VeryLarge = "very large" });

/// A new drawing's pages (ui/src/lib/draw-new.ts draws each).
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize, TS, JsonSchema)]
#[serde(rename_all = "kebab-case")]
#[ts(export)]
pub enum PageFormat {
    /// Chosen each time a drawing is made.
    #[default]
    Ask,
    /// Pages the shape of the Boox Note Air's screen.
    Boox,
    /// The Boox Note Air's screen turned: landscape pages.
    BooxLandscape,
    /// A4 pages, portrait (210 × 297 mm): older drawings. A5 and Letter were taken out; a setting
    /// still naming them is read as A4.
    #[serde(alias = "a5", alias = "letter")]
    A4,
    /// A4 pages, landscape.
    A4Landscape,
    /// No pages: endless in every direction.
    Canvas,
    /// No pages: an origin at the top left, growing right and down.
    Corner,
}

impl Default for DrawConfig {
    fn default() -> Self {
        Self {
            dir: "notes/drawings".into(),
            notepad: true,
            page_format: PageFormat::Ask,
            pen: NotepadPen::default(),
            paper: NotepadPaper::default(),
            snap: true,
            shapes: ShapeRecogniser::default(),
            scribble: true,
            remember_pen: true,
            width: PenWidth::default(),
            color: PenColor::default(),
            eraser: EraserMode::default(),
            shape: StartShape::default(),
            text_size: TextSize::default(),
            page_mode: true,
            per_row: 4,
        }
    }
}

/// The Activity card on Today.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS, JsonSchema)]
#[serde(default)]
#[ts(export)]
pub struct ActivityConfig {
    /// Show commits made by Claude (co-authored).
    pub show_claude: bool,
    /// Show housekeeping commits (only history, session logs, HTML views touched) instead of one summary line.
    pub show_housekeeping: bool,
    /// Changed files in the same folder collapse into one row from this many on.
    #[schemars(range(min = 2, max = 50))]
    pub group_threshold: u32,
}

/// Where a new vault's daily logs go.
pub const DEFAULT_LOG_DIR: &str = "notes/log";

impl Default for Config {
    fn default() -> Self {
        Self {
            log_dir: DEFAULT_LOG_DIR.into(),
            log_template: String::new(),
            log_folders: String::new(),
            focus: "FOCUS.md".into(),
            home: "Home.page".into(),
            ignore: ["runs", "lib", "archive", "node_modules", "target", ".git"].map(String::from).to_vec(),
            vim: false,
            ui: UiConfig::default(),
            editor: EditorConfig::default(),
            terminal: TerminalConfig::default(),
            files: FilesConfig::default(),
            activity: ActivityConfig::default(),
            pdf: PdfConfig::default(),
            draw: DrawConfig::default(),
            lsp: LspConfig::default(),
            automation: AutomationConfig::default(),
            plugins: PluginsConfig::default(),
            notes: NotesConfig::default(),
            web: WebConfig::default(),
        }
    }
}

impl Default for UiConfig {
    fn default() -> Self {
        Self { theme: Theme::System, vscode_theme: String::new(), accent: String::new(), ui_font: String::new(), font_size: 14, gpu_rendering: GpuRendering::Auto, css_snippets_off: Vec::new(), tabs: TabsLayout::Vertical, side_panel: SidePanelPlace::Dock, motion: Motion::default(), eink: Eink::Auto, eink_refresh: EinkRefresh::Often, restore_layout: true, tab_preview: true, tab_switcher: TabSwitcher::Glance, sleep_after_min: 10, awake_tabs: 8, libraries: Vec::new() }
    }
}

impl Default for EditorConfig {
    fn default() -> Self {
        Self {
            code_font: "JetBrains Mono".into(),
            code_font_size: 14,
            prose_font: "Inter".into(),
            prose_font_size: 15,
            line_numbers: true,
            wrap_code: false,
            indent_guides: true,
            minimap: false,
            breadcrumbs: true,
            link_completion: true,
            citation_completion: true,
            slash_menu: true,
            fold_headings: true,
            backlinks: true,
            inline_title: true,
            typewriter: false,
            vim_keys: VimKeys::Classic,
            math_preview: true,
            link_preview: true,
            task_chips: true,
            task_suggest: TaskSuggestMode::Always,
            task_short_forms: true,
            autosave_code: false,
            live: true,
            properties: PropertiesView::Hidden,
            properties_spec: "templates/properties.yaml".into(),
            format_bar: false,
            code_bar: true,
            git_gutter: true,
            index_exclude: vec!["docs/memory".into()],
            date_names: DateNames::English,
            strict_line_breaks: false,
            attachment_folder: "attachments".into(),
            latex_snippets: true,
            latex_snippets_file: String::new(),
            latex_snippet_variables_file: String::new(),
            prose_line_height: 1.68,
            prose_width: 88,
        }
    }
}

impl Default for TerminalConfig {
    fn default() -> Self {
        Self {
            position: PanelPosition::Bottom,
            min_size: 280,
            font_size: 13,
            renderer: TerminalRenderer::Gpu,
            wikilinks: true,
        }
    }
}

impl Default for FilesConfig {
    fn default() -> Self {
        Self { show_ignored: true, show_hidden: false, git_status: true, open_with: Default::default() }
    }
}

impl Default for ActivityConfig {
    fn default() -> Self {
        Self { show_claude: true, show_housekeeping: false, group_threshold: 3 }
    }
}

impl Config {
    /// Missing file → defaults. A malformed file is an error so the user sees it, not a silent reset.
    pub fn load(root: &Path) -> anyhow::Result<Self> {
        let path = root.join(CONFIG_FILE);
        let (mut c, text) = match std::fs::read_to_string(&path) {
            Ok(text) => (toml::from_str::<Self>(&text).map_err(|e| anyhow::anyhow!("{}: {e}", path.display()))?, text),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => (Self::default(), String::new()),
            Err(e) => return Err(e.into()),
        };
        // a vault from before the log moved under notes/ (2026-10-19) keeps writing where its logs are
        let set = text.lines().any(|l| l.trim_start().starts_with("log_dir"));
        if !set && c.log_dir == DEFAULT_LOG_DIR && root.join("log").is_dir() && !root.join(DEFAULT_LOG_DIR).exists() {
            c.log_dir = "log".into();
        }
        Ok(c)
    }

    /// JSON schema (titles, descriptions, enums, ranges) that the Settings pane renders.
    pub fn schema() -> serde_json::Value {
        serde_json::to_value(schemars::schema_for!(Config)).unwrap_or_default()
    }

    /// Writes only the keys whose value changed, into the existing file, keeping its comments and
    /// layout. The result is re-parsed before it replaces the file, so a bad write never lands.
    pub fn save(root: &Path, new: &Config) -> anyhow::Result<()> {
        let path = root.join(CONFIG_FILE);
        let text = match std::fs::read_to_string(&path) {
            Ok(t) => t,
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => String::new(),
            Err(e) => return Err(e.into()),
        };
        let mut doc: toml_edit::DocumentMut = text.parse()?;
        let old = toml::Value::try_from(Self::load(root)?)?;
        let new_v = toml::Value::try_from(new)?;
        merge_changed(
            doc.as_table_mut(),
            old.as_table(),
            new_v.as_table().ok_or_else(|| anyhow::anyhow!("config is not a table"))?,
        );
        let out = doc.to_string();
        let check: Config = toml::from_str(&out)?;
        anyhow::ensure!(&check == new, "config did not round-trip; not written");
        crate::vault_write::write(&path, out.as_bytes())?;
        Ok(())
    }

    /// Whether a workspace-relative path (forward slashes) falls under the ignore list.
    pub fn is_ignored(&self, rel: &str) -> bool {
        matches_any(&self.ignore, rel)
    }

    /// An agent's own file (`editor.index_exclude`): kept apart from the user's notes everywhere but
    /// the file tree.
    pub fn is_agent_file(&self, rel: &str) -> bool {
        matches_any(&self.editor.index_exclude, rel)
    }

    /// Markdown that is not one of the user's notes for the index (backlinks, graph, Bases, tasks):
    /// `editor.index_exclude`, and the note templates — a template says `type: project` without
    /// being a project.
    pub fn index_excluded(&self, rel: &str) -> bool {
        let templates = self.notes.templates.trim_matches('/');
        self.is_agent_file(rel) || (!templates.is_empty() && rel.starts_with(&format!("{templates}/")))
    }
}

/// Whether a pattern names one place in the vault (it has a `/`: `refs/zotero`, or `/runs` for a
/// top-level entry) rather than a name to match at any depth (`target`, `node_modules`).
pub fn is_path_pattern(pat: &str) -> bool {
    pat.starts_with('/') || pat.trim_matches('/').contains('/')
}

/// A path pattern is that entry and everything under it; a bare name matches at any depth.
pub fn matches_any(pats: &[String], rel: &str) -> bool {
    pats.iter().any(|pat| {
        let path = is_path_pattern(pat);
        let pat = pat.trim_matches('/');
        if path {
            rel.strip_prefix(pat).is_some_and(|r| r.is_empty() || r.starts_with('/'))
        } else {
            rel.split('/').any(|seg| seg == pat)
        }
    })
}

fn merge_changed(doc: &mut toml_edit::Table, old: Option<&toml::Table>, new: &toml::Table) {
    // a key gone from the new value (an entry removed from a map like `open_with`) leaves the file
    for k in old.into_iter().flat_map(|o| o.keys()).filter(|k| !new.contains_key(*k)) {
        doc.remove(k);
    }
    for (k, v) in new {
        let was = old.and_then(|o| o.get(k));
        if let toml::Value::Table(sub) = v {
            let entry = doc.entry(k).or_insert_with(|| {
                let mut t = toml_edit::Table::new();
                t.set_implicit(true);
                toml_edit::Item::Table(t)
            });
            if let Some(t) = entry.as_table_mut() {
                merge_changed(t, was.and_then(toml::Value::as_table), sub);
            }
        } else if was != Some(v) {
            doc[k.as_str()] = toml_edit::value(edit_value(v));
        }
    }
}

fn edit_value(v: &toml::Value) -> toml_edit::Value {
    match v {
        toml::Value::String(s) => s.as_str().into(),
        toml::Value::Integer(i) => (*i).into(),
        toml::Value::Float(f) => (*f).into(),
        toml::Value::Boolean(b) => (*b).into(),
        toml::Value::Array(a) => toml_edit::Value::Array(a.iter().map(edit_value).collect()),
        // datetimes and inline tables do not occur in Config
        other => other.to_string().parse().unwrap_or_else(|_| other.to_string().into()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_page_format_taken_out_reads_as_a4() {
        // A5 and Letter were removed (2026-10-20): a vault's setting naming them must still load
        let dir = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(dir.path().join(".atlas")).unwrap();
        for old in ["a5", "letter"] {
            std::fs::write(dir.path().join(CONFIG_FILE), format!("[draw]\npage_format = \"{old}\"\n")).unwrap();
            assert_eq!(Config::load(dir.path()).unwrap().draw.page_format, PageFormat::A4, "{old}");
        }
        std::fs::write(dir.path().join(CONFIG_FILE), "[draw]\npage_format = \"boox-landscape\"\n").unwrap();
        assert_eq!(Config::load(dir.path()).unwrap().draw.page_format, PageFormat::BooxLandscape);
    }

    #[test]
    fn defaults_when_missing() {
        let dir = tempfile::tempdir().unwrap();
        let c = Config::load(dir.path()).unwrap();
        assert_eq!(c, Config::default());
        assert_eq!(c.log_dir, "notes/log");
        // a vault whose logs are in log/ already keeps them there, unless it says otherwise
        std::fs::create_dir_all(dir.path().join("log")).unwrap();
        assert_eq!(Config::load(dir.path()).unwrap().log_dir, "log");
        std::fs::create_dir_all(dir.path().join(".atlas")).unwrap();
        std::fs::write(dir.path().join(CONFIG_FILE), "log_dir = \"notes/log\"\n").unwrap();
        assert_eq!(Config::load(dir.path()).unwrap().log_dir, "notes/log");
        assert_eq!(c.focus, "FOCUS.md");
        assert!(!c.vim, "vim is asked for, never assumed");
        assert!(c.ignore.contains(&"node_modules".to_string()));
    }

    #[test]
    fn partial_file_keeps_other_defaults() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(dir.path().join(".atlas")).unwrap();
        std::fs::write(dir.path().join(CONFIG_FILE), "log_dir = \"journal\"\nvim = true\n").unwrap();
        let c = Config::load(dir.path()).unwrap();
        assert_eq!(c.log_dir, "journal");
        assert!(c.vim);
        assert_eq!(c.focus, "FOCUS.md");
        assert_eq!(c.ignore, Config::default().ignore);
    }

    #[test]
    fn malformed_file_is_an_error() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(dir.path().join(".atlas")).unwrap();
        std::fs::write(dir.path().join(CONFIG_FILE), "log_dir = [").unwrap();
        assert!(Config::load(dir.path()).is_err());
    }

    #[test]
    fn a_map_entry_removed_in_settings_leaves_the_file() {
        let dir = tempfile::tempdir().unwrap();
        let mut c = Config::default();
        c.files.open_with.insert("tsv".into(), "editor".into());
        c.files.open_with.insert("dat".into(), "table".into());
        Config::save(dir.path(), &c).unwrap();
        c.files.open_with.remove("tsv");
        Config::save(dir.path(), &c).unwrap();
        let text = std::fs::read_to_string(dir.path().join(CONFIG_FILE)).unwrap();
        assert!(!text.contains("tsv") && text.contains("dat = \"table\""), "{text}");
        assert_eq!(Config::load(dir.path()).unwrap(), c);
    }

    #[test]
    fn save_keeps_comments_and_writes_only_changes() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(dir.path().join(".atlas")).unwrap();
        std::fs::write(dir.path().join(CONFIG_FILE), "# mine\nlog_dir = \"journal\" # keep\n").unwrap();
        let mut c = Config::load(dir.path()).unwrap();
        c.terminal.position = PanelPosition::Right;
        c.ui.font_size = 15;
        Config::save(dir.path(), &c).unwrap();
        let text = std::fs::read_to_string(dir.path().join(CONFIG_FILE)).unwrap();
        assert!(text.contains("# mine") && text.contains("# keep"), "{text}");
        assert!(text.contains("position = \"right\"") && !text.contains("focus"), "{text}");
        assert_eq!(Config::load(dir.path()).unwrap(), c);
    }

    #[test]
    fn schema_carries_descriptions_and_enums() {
        let s = Config::schema().to_string();
        assert!(s.contains("Where the terminal panel docks"));
        assert!(s.contains("\"right\""));
    }

    #[test]
    fn ignore_matches_names_at_any_depth_and_prefixes() {
        let c = Config { ignore: vec!["runs".into(), "notes/private".into()], ..Config::default() };
        assert!(c.is_ignored("runs"));
        assert!(c.is_ignored("projects/x/runs/a.tsv"));
        assert!(!c.is_ignored("projects/runsheet.md"));
        assert!(c.is_ignored("notes/private/a.md"));
        // a leading `/` means the vault's root only: the big top-level runs/, not the notes about runs
        let c = Config { ignore: vec!["/runs".into()], ..Config::default() };
        assert!(c.is_ignored("runs") && c.is_ignored("runs/x/a.tsv"));
        assert!(!c.is_ignored("notes/runs/a.md"));
        assert!(!c.is_ignored("notes/privateer.md"));
    }
}
