// The plugin API's contract: what a plugin's view, main.js and blocks get (`PluginApi`) and the shapes around it.
// Kept apart from its implementation (plugins.svelte.ts) so the promise plugins rely on reads on its own page
// (docs/guides/PLUGIN-API.md); "kept small and stable: plugins outlive app refactors".
import type { LibrarySource } from "./library";
import type { Plugin } from "./gen/Plugin";
import type { BaseResult } from "./types";
import type { OptionField } from "./block-options";
import type { Table } from "./table";
import type { ViewRenderer } from "./views";
import type { PickRequest } from "./palette.svelte";
import type { SuggestionProvider } from "./suggestions";
import type { MenuPlace, MenuTarget, PluginMenuItem } from "./plugin-menus";
import type { ContextSnapshot, PluginFileSource } from "./plugins.svelte";
import type { Listed } from "./file-sources.svelte";
import type { PluginEvent, PluginEventType } from "./plugin-events";
import type { FenceRender } from "./fences";
import type { CompletionSpec, DecorationSpec, EditorTouch, PasteHandler, Where } from "./editor/plugin-hooks";
import type { CodeTool } from "./plugin-code-tools";
import type { NativeSample, PenOptions } from "./pen-target";
import type { EmbedRender } from "./embed-registry";
import type { Live, LiveHandlers } from "./live";

export const PLUGIN_API_VERSION = 17;

/** What a plugin's view gets. Kept small and stable: plugins outlive app refactors. */
export interface PluginApi {
  /** The plugin API's number (the same as `API_VERSION` in the core's plugins.rs): test it before using something newer. */
  version: number;
  plugin: PluginSelf;
  /** The file this pane was opened with ("Open with…"); undefined for the plugin's own pane and main.js. */
  path?: string;
  /** What this pane was opened on by `openView(arg)` (a host, an account); undefined otherwise. */
  arg?: string;
  /** (v7) The `#…` of the link the pane was opened by: `Chapter 3` of `[[x.epub#Chapter 3]]`, `page=3`; undefined
   *  when none. A later link to the same file while the pane is open comes to `pane.onAnchor`. */
  anchor?: string;
  /** (v7) This pane as its file's editor (the editor contract): the unsaved dot, the save hook, later anchors.
   *  Only in a pane (view.js); undefined in main.js and blocks. */
  pane?: PluginPane;
  /** Open the plugin's pane (view.js) in a tab, or focus it when one is open on the same `arg`. Each `arg`
   *  (a string: JSON-encode more) is a tab of its own, kept in the layout; the pane reads it as `atlas.arg`. */
  openView(arg?: string, opts?: { title?: string; icon?: string; beside?: boolean }): void;
  /** Run the plugin's data script (`data = …` in plugin.toml) with `args`; resolves to its JSON. */
  data(args?: unknown): Promise<unknown>;
  /** `{ beside: true }`: next to the active tab (the other split, or a new one on the right)
   *  instead of over it — a paper's PDF and its notes side by side. */
  open(path: string, line?: number, opts?: { beside?: boolean }): void;
  /** (v6) `path` to the phone app's own reader (a native plugin's `opens`: an .epub, a .cbz, `suwayomi:<id>/<name>`):
   *  true when the app took it; false on the desktop or in a browser — show it in the page then. */
  openNative(path: string): boolean;
  /** Open a table file in the table viewer (any `.tsv`/`.csv`). */
  openTable(path: string): void;
  readText(path: string): Promise<string>;
  /** A folder's entries, one level (hidden and ignored ones as the explorer marks them): `dir` for folders, `size`
   *  in bytes and `mtime` in seconds for files. A plugin with a library on disk (manga, books) walks it with this. */
  list(dir: string): Promise<{ name: string; path: string; dir: boolean; ignored: boolean; size?: number; mtime?: number }[]>;
  /** Whether a vault file or folder is there, never an error (a folder that may be missing: ask before `list`). */
  exists(path: string): Promise<boolean>;
  /** Write a file whole (made if missing) → its new `mtime`. With `baseMtime` (from an earlier writeText), refused
   *  with a 409 `ApiError` when it changed on disk since — the editor's guard. For the plugin's own files (a
   *  `reading.json`): never rewrite the user's notes this way (docs/PHILOSOPHY.md §2). */
  writeText(path: string, text: string, opts?: { baseMtime?: number }): Promise<{ mtime: number }>;
  /** An object URL for a workspace file (images, PDFs) — fetched with the API header. */
  fileUrl(path: string): Promise<string>;
  /** (v9) The URL of a file of this plugin's own folder (`fonts/serif.woff2`, `cover.png`, `worker.js`) for anything
   *  that loads by URL: `<img src>`, a CSS `url()` / `@font-face`, `new Worker`, `import()`. Served by the core with its
   *  type, never outside the folder; a changed file gets a new URL on the plugin's next load. Ending in "/" (`fonts/`):
   *  the folder's address, a base for a library that fetches its own files (Excalidraw's `EXCALIDRAW_ASSET_PATH`). A module may also say
   *  `new URL("./x", import.meta.url)`, or import a sibling plugin's file (`../zip/zip.js`). */
  assetUrl(rel: string): string;
  /** A downscaled image (≤ `width` px, default 320) for galleries: never show full-size figures small. */
  thumbUrl(path: string, width?: number): Promise<string>;
  /** Called with the changed paths on every file event; returns the unsubscribe function. */
  onFilesChanged(fn: (paths: string[]) => void): () => void;
  /** `options.run`: what a click on the notice does (open what it is about). */
  toast(title: string, body?: string, kind?: "info" | "success" | "error", options?: { run?: () => void }): void;
  /** The e-ink mode (lib/eink.ts): whether it is on, and one full refresh against ghosts (a reader's page turn).
   *  `pen(host, take, opts)` (v5): the phone app's native pen over `host` (pen-target.ts — the firmware's quick line,
   *  every sample of each stroke to `take` in client CSS px); `sync()` after what `opts` reads changes, `off()` to give
   *  it back. Null where there is no native pen (a browser, the desktop): read the pointer there. */
  eink: { readonly on: boolean; refresh(): void; pen(host: HTMLElement, take: (samples: NativeSample[]) => void, opts?: PenOptions): { sync(): void; off(): void } | null };
  // --- v2 (docs/guides/MALLEABLE.md, R3): the shared context and the data substrate ---
  /** What the user is looking at: active/open panes, editor selection, caret section, hover. A snapshot. */
  context(): ContextSnapshot;
  /** Called on every context change (with a snapshot); returns the unsubscribe function. */
  onContext(fn: (c: ContextSnapshot) => void): () => void;
  /** Point at a note (or clear with null): other panes highlight it, as Atlas's own views do. */
  hover(path: string | null, line?: number): void;
  /** Rewrite one frontmatter property of a note (only that key; lists from arrays). */
  writeProperty(path: string, key: string, value: string | string[]): Promise<void>;
  /** Evaluate Bases YAML (filters, formulas, views) over the workspace's notes; `thisPath` is `this.file`. */
  query(baseYaml: string, thisPath?: string): Promise<BaseResult>;
  /** The rows a ```view block of this YAML gets (`type: task-list\nfrom: tasks\ndue: today`: today's tasks), evaluated
   *  as if the block were in `path` (default: none). */
  view(src: string, path?: string): Promise<import("./gen/ViewResult").ViewResult>;
  /** (v7) Draws `![[file]]` in notes for these files: `patterns` are extensions (`"epub"`) or globs (`"maps/*.json"`);
   *  `render(host, { path, anchor, options, width, note, compact, open })` → cleanup (may be async). Asked before the
   *  core's own embeds (the newest registration wins); pictures stay the core's. Embeds drawn already are drawn again
   *  when it comes, changes or goes (lib/embed-registry.ts). */
  registerEmbed(patterns: string | string[], render: EmbedRender): () => void;
  /** Add a view type for ```view blocks (and Lua widgets): `render(host, {type, rows})` → cleanup. */
  registerView(type: string, render: ViewRenderer): () => void;
  /** Draws a kind of note its own way (a mail note as the mail): a note whose `view` property is `name`, or whose `type`
   *  is in `types`, opens drawn by `render(host, { path, text, props, showNote })` (again on each change of its text) →
   *  cleanup; the pane offers "Show as note" for the markdown (lib/note-views.svelte.ts). */
  registerNoteView(name: string, v: { title: string; types?: string[]; render(host: HTMLElement, note: { path: string; text: string; props: Record<string, unknown>; showNote(): void }): void | (() => void) }): () => void;
  /** Add an `@prefix:` mention kind: `get(id)` → { title, subtitle?, props?, path? } (path = what a click opens). */
  registerEntities(p: { prefix: string; get(id: string): Promise<PluginEntity | null>; list?(): Promise<{ id: string; title: string }[]> }): () => void;
  // --- v3 (docs/refactor/REFACTOR-plugins-v3.md): pieces, not apps ---
  /** A block type for ```view blocks and .page files (`type: runs.plot`). It gets the block's options and
   *  the note it sits in; `props()` reads that note's frontmatter (a run note's `run:`). `about.options`
   *  lists its options as form fields — a page then offers "Options…" for it. */
  registerBlock(type: string, render: (host: HTMLElement, block: BlockContext) => void | (() => void), about?: { title?: string; options?: OptionField[] }): () => void;
  /** A palette command (bind keys in Settings → Keyboard). `run` gets an argument when something other than the
   *  palette runs it: a records card's button passes `{ setting, record }`, a button under the cards `{ setting }`. */
  registerCommand(c: PluginCommand): () => void;
  /** A kind of new thing in New… (the phone's +): `run` makes it — asking what it needs (`pick`) — and opens it. */
  registerNew(k: { id: string; title: string; detail?: string; icon?: string; run(): void | Promise<void> }): () => void;
  /** Another plugin's settings and data — plugins build on each other. Null when absent or off. */
  other(id: string): { settings: Record<string, unknown>; data(args?: unknown): Promise<unknown> } | null;
  /** Atlas's library page (the one References is) over the plugin's own items: search, sort, tabs, groups, a list or
   *  covers, the selected item with its actions (lib/library.ts, docs/refactor/REFACTOR-libraries.md). Returns the cleanup. */
  mountLibrary(host: HTMLElement, source: LibrarySource): () => void;
  /** The same source as one of the vault's libraries: a tab of the Libraries page (the phone's Library), shown as the
   *  vault's `[ui] libraries` says (docs/design/DESIGN-libraries-everywhere.md). Returns its removal. */
  registerLibrary(source: LibrarySource): () => void;
  /** Draw any block (built-in, or another plugin's) into `host`: YAML text or an options object. */
  mountBlock(host: HTMLElement, block: string | Record<string, unknown>, notePath?: string): () => void;
  /** A TSV/CSV file parsed (header sniffed, any size). */
  table(path: string): Promise<Table>;
  /** Atlas's plot (zoom, hover, ≤ 3000 drawn points): x and one or more y series. Returns the cleanup. */
  plot(host: HTMLElement, d: { x: number[]; ys: number[][]; xLabel?: string; yLabels?: string[] }): () => void;
  /** A note's frontmatter as an object ({} when none). */
  noteProps(path: string): Promise<Record<string, unknown>>;
  /** (v10) A file to the vault's Trash (`.atlas/trash/`, taken back from there): what a library's Delete… does. */
  trash(path: string): Promise<void>;
  /** The one note of file `path` (a paper's PDF: the paper's note; else `<name>.md` beside it): its path, made by the
   *  core when missing — the vault's template rules, the file's block, `properties` — as on every device. `find`:
   *  only say which, make none. Never write a companion note's text yourself. */
  companion(path: string, opts?: { find?: boolean; title?: string; properties?: Record<string, unknown> }): Promise<string>;
  /** (v14) The marks of a PDF or a book of pictures (a manga chapter: an archive, or a folder ending in `/`) — kept
   *  by the core in the file's note (a chapter's in its series' note, a block each) — and that note, to watch. */
  marks(file: string): Promise<{ note: string | null; marks: import("./gen/Mark").Mark[] }>;
  /** (v14) A page's marks drawn as Atlas draws them (ink with its pressure, highlights, post-its…), to lay over the
   *  page: an `<svg>` filling its positioned parent. `size`: the page in the marks' space, PDF points (default: a
   *  picture page, 1000 × 1000 — its fractions). */
  marksSvg(marks: readonly import("./gen/Mark").Mark[], page: number, size?: [number, number]): SVGSVGElement;
  /** (v13) The vault's templates: name, title, the folder their notes go in, their questions and when each applies by
   *  itself (docs/guides/TEMPLATES.md). */
  templates(): Promise<import("./gen/TemplateInfo").TemplateInfo[]>;
  /** (v13) A new note, made the way every new note is (the core: `template` when named, else the vault's rules for
   *  where it goes, else the default template; `values` answer its questions; `body` after it) → its path. */
  newNote(o: { title: string; folder?: string; template?: string; values?: Record<string, unknown>; body?: string }): Promise<string>;
  /** (v13) `template` merged into the existing note `path` — only what the note lacks (properties, list items,
   *  sections, blocks) → what it added, in words. */
  applyTemplate(path: string, template: string): Promise<string[]>;
  /** Capture text as the capture box does (today's log, or a note — the vault's setting); `[] ` makes a to-do. */
  capture(text: string): Promise<{ path: string; line: number }>;
  /** Write a new file; false (and nothing written) when it already exists. */
  createFile(path: string, text: string): Promise<boolean>;
  /** Ask the user to choose (or type) a value in the palette: Atlas's one chooser. Returns a function that
   *  closes it if it is still showing (the answer came another way). */
  pick(req: PickRequest): () => void;
  /** Open a sign-in page (OAuth) whose answer comes back to `back`, a localhost address such as
   *  `https://localhost`. The desktop app shows it in a window of its own and resolves with the whole address
   *  it ended on (`?code=…` or `?error=…`); in a browser it opens a tab and never resolves, so keep a way to
   *  paste that address. A new sign-in to the same `back` rejects the unfinished one. */
  signIn(url: string, back: string): Promise<string>;
  /** The address a sign-in to `back` came back to in a browser while no tab was waiting (the one that asked was
   *  closed or reloaded): kept 30 minutes by the server's return page, handed out once. Check it when the pane opens. */
  signInReturned?(back: string): string | null;
  /** Offer a view for the section under the caret (`{path, heading, text}` → `[{label, insert}]`);
   *  shown under the note, inserted only when the user accepts (Alt+Enter). */
  registerSuggestion(p: SuggestionProvider): () => void;
  // --- v4 (docs/refactor/REFACTOR-plugins-v4.md): events, and hooks into the frame grouped by area ---
  /** Something done in Atlas: `file:open` (a new tab on a file), `file:save`, `file:create` (a new note),
   *  `file:rename` (`from`, `to`), `file:delete`, `capture` (`path`, `text`), `command` (`id`). Returns the unsubscribe function. */
  on<T extends PluginEventType>(type: T, fn: (e: Extract<PluginEvent, { type: T }>) => void | Promise<void>): () => void;
  /** The network, through the core: no CORS, a timeout, and only the hosts listed in the manifest
   *  (`[permissions] net = ["links.example.org"]`). Like the browser's `fetch`, with three differences: a header
   *  may be `{ secret: "token", prefix: "Bearer " }` (the core fills the plugin's secret in); `body` may be an
   *  object (sent as JSON); `saveTo: "covers/x.jpg"` writes the answer into the plugin's cache folder and gives
   *  its path back as `saved` (for `fileUrl` / `thumbUrl`). A status like 404 is an answer, not an error. */
  fetch(url: string, init?: PluginFetchInit): Promise<PluginResponse>;
  /** An address the page can play (`<audio src>`, `<video src>`) for media on a server that wants the plugin's secret
   *  on every request (Audiobookshelf's token): the core asks the server with the headers given here — a secret named,
   *  filled in by the core, never in the page — passing the player's ranges through. Same hosts as `fetch`. */
  media(url: string, init?: { headers?: PluginFetchInit["headers"] }): Promise<string>;
  /** OpenID Connect sign-ins (Authelia, any provider; needs `[permissions] secrets = true` and the provider's host in
   *  `net`): `signIn` opens the provider's page (the desktop's sign-in window) and keeps the tokens on the server; a
   *  header `{ oauth: name }` in `fetch` is then `Bearer <access token>`, renewed by the core. In a browser the page
   *  opens in a tab and the address it ends on must be pasted: pass it to `finish`. Unnamed, the provider is the
   *  one `resource` (an address of the service) names in its 401, else the vault's; the client and redirect too. */
  oauth: {
    signIn(name: string, provider?: { issuer?: string; resource?: string; clientId?: string; redirect?: string; scopes?: string[] }): Promise<void>;
    finish(address: string): Promise<void>;
    status(name: string): Promise<{ signed_in: boolean; expires: number; renews: boolean }>;
    signOut(name: string): Promise<boolean>;
  };
  /** Secrets of this plugin in this vault, kept outside the vault (needs `[permissions] secrets = true`). */
  secrets: { get(name: string): Promise<string | null>; set(name: string, value: string): Promise<void>; delete(name: string): Promise<boolean>; has(name: string): Promise<boolean> };
  /** The plugin's helper: a program of its own that the core keeps running (`[helper] run = "…"` in plugin.toml),
   *  spoken to in JSON lines — for speed, compiled code, or a connection that stays open. The first `call`
   *  starts it; `on` hears the events it prints (and `"helper:exit"` when it stops); `restart` stops it so the
   *  next call starts a fresh one. */
  helper: {
    call(method: string, params?: unknown, opts?: { /** seconds (default 60) */ timeout?: number }): Promise<unknown>;
    on(event: string, fn: (data: unknown) => void): () => void;
    state(): Promise<"stopped" | "running" | "crashed">;
    restart(): Promise<void>;
  };
  /** The shell terminal: `run(command)` types the command there and enters it (the terminal is opened when there
   *  is none), so the user sees the command and its output — what a "Run" button should do. Resolves false when
   *  no terminal became ready. `open(command, title?)` runs it in a new terminal tab of its own (an ssh session). */
  terminal: {
    run(command: string): Promise<boolean>; open(command: string, title?: string): Promise<boolean>;
    /** What words the terminal's shell reads — `posix` (sh, bash, zsh, fish…), `powershell` or `cmd` — so a command
     *  typed into it is quoted for it (API 17). The shell of the machine the terminal runs on, a server's too. */
    shell(): Promise<"posix" | "powershell" | "cmd">;
  };
  /** The file explorer (lib/file-sources.svelte.ts). `source(def)`: this plugin's places (hosts, servers) in it, one
   *  source per plugin, its local copies in `.atlas/remote/<plugin id>/`; `explore({ source?, place?, path? })` opens it
   *  there (default: this plugin's source). `list` / `local`: any source's folder, and a vault path to open one of its
   *  files (a local copy of a remote one) — another plugin's server read as the explorer reads it (Books' remote folders). */
  files: {
    source(def: PluginFileSource): () => void;
    explore(at?: { source?: string; place?: string; path?: string }): void;
    list(source: string, place: string, path: string): Promise<Listed>;
    local(source: string, place: string, path: string): Promise<string>;
    /** (v11) A picture of a source's file (a server's own thumbnail of a PDF), as the explorer's Thumbnails view gets
     *  it: a URL for an <img>, null when the source has none. Three at a time, kept for the run. */
    thumb(source: string, place: string, path: string): Promise<string | null>;
  };
  editor: {
    /** Draws a fenced code block of that name (```` ```statblock ````) in notes, in live preview and the reading
     *  view: `render(host, { source, path, props })` → cleanup. Without the plugin the fence stays a code block. */
    registerFence(name: string, render: FenceRender): () => void;
    /** A completion source: `complete({ path, line, before, word })` → `[{ label, detail?, insert?, kind? }]` (or a promise).
     *  `trigger` (a regular expression or a text): offer only when the text before the caret ends like that. */
    registerCompletion(spec: CompletionSpec): () => void;
    /** A key in the editor, ahead of the app's and vim's: `run({ path, line, selection, replace, insert })`;
     *  return `false` to let the key go on. `where`: "note", "code" or "all". */
    registerKey(keys: string, run: (t: EditorTouch) => boolean | void, where?: Where): () => void;
    /** What is pasted / dropped (`{ text, html, files, path }`) → the text to insert instead, or null: not mine. */
    onPaste(fn: PasteHandler): () => void;
    onDrop(fn: PasteHandler): () => void;
    /** Every match of `pattern` in the visible text: `render(match)` → `{ class?, title?, replace?(host) }`. */
    registerDecoration(pattern: RegExp, render: (m: RegExpExecArray) => DecorationSpec | null | undefined | void): () => void;
    /** Buttons in the bar above a code file: `fn({ path })` → `[{ label, title?, run }]` for that file (run, build, test). */
    toolbar(fn: (file: { path: string }) => CodeTool[] | null | undefined | void): () => void;
    /** The escape hatch: a raw CodeMirror 6 extension. Unstable: it follows the editor library, not Atlas.
     *  Build it from `codemirror` below — the app's own copies of the library, the only ones the editor accepts. */
    extension(ext: unknown): () => void;
    /** The editor library's modules as Atlas loaded them: `@codemirror/state` and `@codemirror/view`. */
    codemirror: { state: typeof import("@codemirror/state"); view: typeof import("@codemirror/view") };
  };
  /** (v8) A file's live room (core live.rs): the devices with it open send each other what changes as it happens, and
   *  one of them saves it (`writes()`; in a mirrored vault the room is the server's). Left when the plugin unloads. */
  live: {
    join(path: string, on: LiveHandlers): Live;
  };
  /** (v8) The core's pen recogniser (atlas-pen, the phone's own): a held stroke as `[x, y, t, …]` (null breaks a line) →
   *  the shape's wire (`[]`: none), as the drawings snap a held stroke (lib/pen-shapes.ts). */
  pen: {
    shape(xyt: (number | null)[]): Promise<{ wire: number[] }>;
  };
  shell: {
    /** Rows in a right-click menu (`file`, `tab`, `editor`, `block`): `fn(target)` → rows, shown after the app's. */
    menu(where: MenuPlace, fn: (target: MenuTarget) => PluginMenuItem[] | null | undefined | void): () => void;
    /** A tool in the side panel, beside Files / Search / Outline / Git: `mount(host)` draws it (and may return
     *  its cleanup). It also becomes a command, "Side panel: <title>". */
    sideTool(t: { id: string; title: string; icon?: string; mount(host: HTMLElement): void | (() => void) }): () => void;
    /** A cell in the status bar (a button when it has `run`). `set` changes its text; gone on reload or `remove()`. */
    statusItem(it: { id: string; text: string; title?: string; run?: () => void | Promise<void> }): { set(text: string, title?: string): void; remove(): void };
    /** A chip under the date in Today's greeting (the weather, the week…): `icon` an emoji or a short symbol, `order`
     *  where it goes (lower first; default 50), a button when it has `run`. Gone on reload or `remove()`. */
    greetingItem(it: { id: string; text: string; icon?: string; title?: string; order?: number; run?: () => void | Promise<void> }): { set(text: string, title?: string): void; remove(): void };
  };
}
/** (v7) A plugin pane as a file's editor: what the core's editors do, for a pane of a plugin (Plugin.svelte). */
export interface PluginPane {
  /** The tab's unsaved dot. While it is on, Back keeps the tab and closing it saves first. */
  setDirty(dirty: boolean): void;
  /** What saves the file: Ctrl+S in the pane, closing the tab, the window going away, another workspace (each only while
   *  dirty). Resolving clears the dot; throwing keeps it and says why. One per pane: a later call replaces it. */
  onSave(save: () => void | Promise<void>): () => void;
  /** A link to this file with another `#…` while the pane is open (`[[x.epub#Chapter 3]]`): go there. */
  onAnchor(go: (anchor: string) => void): () => void;
  /** Closes this pane's tab (saving first, as closing it by hand does): a view that hands the file on (Rnote's opens the
   *  drawing it made). */
  close(): void;
}
/** The plugin's manifest as listed, and what it may do to its own settings. */
export type PluginSelf = Plugin & {
  /** Writes settings as the form does (`PUT /api/plugins/<id>/settings`): declared keys only, a records field as
   *  its whole list, null takes a key out (also one no longer declared). Resolves once the plugin was reloaded
   *  with them (its main.js ran again), so do not await it inside `register`. */
  saveSettings(values: Record<string, unknown>): Promise<void>;
  /** Opens the plugin's page in Settings. */
  openSettings(): void;
  /** (v12) A section the plugin draws on its page in Settings — a rules editor, calendars with their colours —
   *  before or after the generated settings (`place`, default after). `mount` returns its cleanup. Settings it
   *  changes go through `ctx.save`, so the TOML file stays the one truth. */
  registerSettingsSection(s: SettingsSection): () => void;
};
export interface SettingsSection {
  id: string;
  title: string;
  /** One line under the title. */
  hint?: string;
  place?: "before" | "after";
  mount(host: HTMLElement, ctx: SettingsSectionContext): void | (() => void);
}
export interface SettingsSectionContext {
  /** The plugin's settings as saved now. */
  settings(): Record<string, unknown>;
  /** Writes these keys (the others kept); resolves true once saved and the plugin reloaded. */
  save(patch: Record<string, unknown>): Promise<boolean>;
  /** The plugin's helper. */
  call(method: string, params?: unknown, timeoutSecs?: number): Promise<unknown>;
}
export type PluginCommand = { id: string; title: string; keys?: string; run(arg?: unknown): void | Promise<void> };
export interface PluginFetchInit {
  method?: string; headers?: Record<string, string | { secret: string; prefix?: string } | { oauth: string }>; body?: string | object; /** seconds (default 30) */ timeout?: number; saveTo?: string;
  /** where `saveTo` is: "cache" (default) or "remote" — the local copy of a remote file, `.atlas/remote/<plugin>/` (the explorer opens it) */
  saveIn?: "cache" | "remote";
  /** send this vault file's bytes as the body (an upload) */
  bodyFile?: string;
  /** a url-encoded form instead of `body`; a field may be `{ secret }`, filled in by the core (a key never in the page) */
  form?: Record<string, string | { secret: string; prefix?: string }>;
}
export interface PluginResponse {
  status: number; ok: boolean; headers: Record<string, string>; url: string; saved?: string;
  /** A sign-in stands in front of the service (Authelia, Authentik…): Atlas has offered it; retry once `signedin`. */
  signin?: import("./gen/Needed").Needed;
  text(): Promise<string>; json(): Promise<unknown>;
}
export interface BlockContext {
  /** The block's YAML, and the same parsed. */
  src: string;
  options: Record<string, unknown>;
  /** The note or .page holding the block. */
  note: string;
  /** That note's frontmatter, plus the `key:: value` properties of the section the block is in
   *  (docs/guides/EXPRESSIONS.md): `run:: X` under a heading reaches every block below it. */
  props(): Promise<Record<string, unknown>>;
}
export interface PluginEntity { title: string; subtitle?: string; props?: Record<string, string>; path?: string }
