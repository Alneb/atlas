// Typed client for the Atlas HTTP + WebSocket API v0 (docs/ARCHITECTURE.md).
// Every HTTP request carries `x-atlas: 1` (the server's CSRF guard); WebSockets rely on Origin.
import type {
  ApiErrorBody, CaptureResult, CmdResult, CommandInfo, FileDoc, PtyPreset, PtyControl,
  PutFileResult, RelPath, ReplaceRequest, TaskTicked, LinkTarget, ReplaceResult, SearchResult, ServerEvent, Today, TreeEntry, UiState, Workspace,
  ConfigDoc, WorkspaceConfig, GitCommit, CommitDetail, GitStatus, Patch, GitCommitted, GitDiscarded, GitSynced,
} from "./types";

import { emitPluginEvent, type PluginEvent } from "./plugin-events";

declare global {
  interface Window { __ATLAS_API__?: string }
}
/** `plugin_net.rs`: FetchRequest / FetchResponse. A header is its text, or a secret the core fills in. */
export interface PluginFetchRequest { url: string; method?: string; headers?: Record<string, string | { secret: string; prefix?: string } | { oauth: string }>; body?: string; timeout_secs?: number; save_to?: string; save_in?: import("./gen/SaveIn").SaveIn; body_file?: string; form?: Record<string, string | { secret: string; prefix?: string }> }
export interface PluginFetchResponse { status: number; ok: boolean; headers: Record<string, string>; text: string; saved?: string; url: string; signin?: import("./gen/Needed").Needed }

/** After a request that worked, tell the plugins what happened; the result passes through. */
const told = (e: PluginEvent) => <T>(r: T): T => { emitPluginEvent(e); return r; };

/** Origin of the API. Empty = same origin (Vite proxy in dev, atlas-core serving dist in prod). */
export const apiBase = (): string => (typeof window !== "undefined" && window.__ATLAS_API__) || "";
/** A sessionStorage key of this window's vault: a vault switch loads the other vault in the same window, which keeps
 *  its sessionStorage — unscoped, the next vault restored this one's tabs and took over its terminals. */
export const vaultScoped = (key: string): string => `${key}@${apiBase() || "/"}`;

export class ApiError extends Error {
  constructor(readonly status: number, message: string, readonly body?: unknown) {
    super(message);
  }
  /** On 409 the server reports the current on-disk mtime (ms). */
  get diskMtime(): number | undefined {
    const b = this.body as ApiErrorBody | undefined;
    return typeof b === "object" && b && typeof b.mtime === "number" ? b.mtime : undefined;
  }
}

type Query = Record<string, string | number | undefined>;
/** How the task list is asked for (`Ask` in crates/atlas-core/src/task_suggest.rs). */
export type TaskAsk = { explicit?: boolean; at?: boolean; browse?: boolean; keepEnter?: boolean };

function url(path: string, query?: Query): string {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(query ?? {})) if (v !== undefined) qs.set(k, String(v));
  const s = qs.toString();
  return `${apiBase()}${path}${s ? `?${s}` : ""}`;
}

let bridgeAsked = 0;
/** The gate's sign-in for the server this page reaches through the bridge; once it lets the page in, a reload. */
function signInThroughBridge(page: string): void {
  if (Date.now() - bridgeAsked < 60_000) return;
  bridgeAsked = Date.now();
  window.open(`/signin/door?url=${encodeURIComponent(page)}`, "_blank"); // the desktop app catches it (its own core)
  const t = setInterval(() => {
    void fetch(url("/api/workspace"), { headers: { "x-atlas": "1" } }).then((r) => { if (r.ok) { clearInterval(t); location.reload(); } }, () => {});
  }, 2500);
  setTimeout(() => clearInterval(t), 300_000);
}

// Every call goes to this vault's own core (apiBase): a mirrored vault's writes are local, and the core asks the server
// for a lease first (core mirror_guard.rs; docs/design/DESIGN-mirror-v2.md).
async function request<T>(method: string, path: string, opts: { query?: Query; body?: unknown } = {}): Promise<T> {
  const headers: Record<string, string> = { "x-atlas": "1" };
  if (opts.body !== undefined) headers["content-type"] = "application/json";
  const res = await fetch(url(path, opts.query), {
    method,
    headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  const text = await res.text();
  let data: unknown = undefined;
  try { data = text ? JSON.parse(text) : undefined; } catch { data = text; }
  if (!res.ok) {
    // a vault on a server through the desktop's bridge (core remote_bridge.rs): the gate wants a sign-in — its page in
    // a window of the app (the door, as for the plugins; a security key works there), then this page again
    if (res.status === 401 && apiBase().startsWith("/remote/") && typeof data === "object" && data && "signin" in data) signInThroughBridge(String((data as { signin: { url: string } }).signin.url));
    // server mode: the session ended (signed out elsewhere, 30 days unused) → the sign-in page, then back here
    if (res.status === 401 && !/^https?:/.test(apiBase()) && typeof location !== "undefined") location.assign(`/login?next=${encodeURIComponent(location.pathname + location.search)}`);
    const msg = typeof data === "object" && data && "error" in data ? String((data as { error: unknown }).error) : text || res.statusText;
    throw new ApiError(res.status, `${method} ${path}: ${res.status} ${msg}`, data);
  }
  return data as T;
}

/** Settings → Server (docs/guides/SERVER.md). */
export type AuthMode = "password" | "proxy" | "both";
export interface ServerOptions { auth: AuthMode; trustedProxies: string[]; remoteUserHeader: string; allowPlainHttp: boolean; mcp: boolean }
export interface ServerState {
  serving: boolean; port: number; options: ServerOptions; hasPassword: boolean; sessions: number; notReady: string | null;
  tokens: { name: string; scope: "capture" | "full"; created: number; lastUsed: number | null }[];
  files: { settings: string; state: string };
}
export interface AgentsState { agents: { name: string; created: number; lastUsed: number | null }[]; locked: boolean; file: string; terminals: boolean; terminalAgent: string }
export interface Me { server: boolean; via?: "password" | "proxy" | "token"; user?: string; device?: string; signOut?: boolean }

/** The references library's plugin, and a call to its helper (typed: the answers are the core's Paper shapes). */
const PAPERS = "catalog-papers";
const papers = <T>(method: string, params?: unknown, timeout?: number): Promise<T> =>
  request<T>("POST", `/api/plugins/${PAPERS}/helper`, { body: { method, params: params ?? null, timeout_secs: timeout } });
/** Is the plugin in this vault, with its helper? Asked before listing: a missing helper answers 404, which the
 *  browser logs on every start of a vault without it (as a missing init.js would). */
const papersHere = (): Promise<boolean> =>
  request<{ id: string; has_helper: boolean; error?: string | null }[]>("GET", "/api/plugins").then((ps) => ps.some((p) => p.id === PAPERS && p.has_helper && !p.error));

export const api = {
  me: () => request<Me>("GET", "/api/auth/me"),
  /** A locked local core's one-time link for another window (local_lock.rs); 400 when the core is open. */
  localLink: () => request<{ url: string }>("POST", "/api/local/link"),
  signOut: () => request<void>("POST", "/api/auth/logout"),
  /** What a pen stroke was meant as (atlas-pen, the phone's recogniser): `x, y, t` triples, null triples between two
   *  strokes → the wire (pen-shapes.ts), `[0]` for none. */
  penShape: (xyt: (number | null)[], openink = true) => request<{ wire: number[] }>("POST", "/api/pen/shape", { body: { xyt, openink } }),
  server: () => request<ServerState>("GET", "/api/server"),
  serverOptions: (o: ServerOptions) => request<void>("PUT", "/api/server/options", { body: o }),
  serverPassword: (current: string | null, next: string) => request<void>("POST", "/api/server/password", { body: { current, new: next } }),
  serverToken: (name: string, scope: "capture" | "full") => request<{ token: string }>("POST", "/api/server/tokens", { body: { name, scope } }),
  serverRevoke: (name: string) => request<void>("DELETE", `/api/server/tokens/${encodeURIComponent(name)}`),
  /** Sign-ins to services kept for the plugins (service_signin.rs): hosts and dates, never a cookie. */
  serviceSignins: () => request<import("./gen/Kept").Kept[]>("GET", "/api/signin/doors"),
  forgetServiceSignin: (host: string) => request<boolean>("DELETE", `/api/signin/doors/${encodeURIComponent(host)}`),
  /** Settings → AI agents (agents.rs): this machine's agents, each with its own token; 400 on a server (device tokens there). */
  agents: () => request<AgentsState>("GET", "/api/agents"),
  allowAgent: (name: string) => request<{ token: string; mcp: unknown }>("POST", "/api/agents", { body: { name } }),
  /** Whether the terminals Atlas starts for an agent get the shared agent's token (agents.rs TERMINAL_AGENT). */
  agentTerminals: (on: boolean) => request<void>("PUT", "/api/agents/terminals", { body: { on } }),
  revokeAgent: (name: string) => request<void>("DELETE", `/api/agents/${encodeURIComponent(name)}`),
  serverSignOutAll: () => request<{ ended: number }>("POST", "/api/server/signout-all"),
  workspace: () => request<Workspace>("GET", "/api/workspace"),
  /** Every file (the tree); `index`: the user's own only, the agent's (`editor.index_exclude`) left out. */
  exists: (path: RelPath) => request<boolean>("GET", "/api/exists", { query: { path } }),
  files: (o: { index?: boolean } = {}) => request<string[]>("GET", "/api/files", { query: o.index ? { index: "true" } : {} }),
  tree: (path?: RelPath) => request<TreeEntry[]>("GET", "/api/tree", { query: { path: path || undefined } }),
  file: (path: RelPath) => request<FileDoc>("GET", "/api/file", { query: { path } }),
  /** 409 (ApiError.status) when `base_mtime` is given and the file changed on disk (or, in a mirrored vault, this copy
   *  is behind the server's: core mirror_guard.rs). */
  putFile: (path: RelPath, text: string, base_mtime?: number) =>
    request<PutFileResult>("PUT", "/api/file", { body: base_mtime === undefined ? { path, text } : { path, text, base_mtime } })
      .then(told({ type: "file:save", path })),
  /** Writes only if there is no such file (atomic on the server); `written: false` when one was there, kept as it is. */
  createFile: (path: RelPath, text: string) => request<PutFileResult>("PUT", "/api/file", { body: { path, text, only_new: true } }),
  today: () => request<Today>("GET", "/api/today"),
  /** What was made and what else changed on a day (default today). */
  activity: (day?: string) => request<import("./gen/DayActivity").DayActivity>("GET", "/api/activity", { query: { day } }),
  /** Today's log, made from the log template when it is not there yet. */
  todayLog: () => request<{ path: string; created: boolean }>("POST", "/api/log/today"),
  /** `vault`: capture into another known vault than this window's (the quick-capture window). */
  capture: (text: string, vault?: string) => request<CaptureResult>("POST", "/api/capture", { body: vault ? { text, vault } : { text } }).then((r) => { emitPluginEvent({ type: "capture", path: r.path, text }); return r; }),
  /** A new note, optionally from a template; never replaces a file. */
  templates: () => request<import("./gen/TemplateInfo").TemplateInfo[]>("GET", "/api/note/templates"),
  newNote: (r: import("./gen/NewNote").NewNote) => request<import("./gen/NewNoteResult").NewNoteResult>("POST", "/api/note/new", { body: r }).then((n) => { emitPluginEvent({ type: "file:create", path: n.path }); return n; }),
  /** `agent`: also the agent's own files (editor.index_exclude), left out by default. */
  search: (q: string, o: { case?: boolean; word?: boolean; regex?: boolean; agent?: boolean } = {}) =>
    request<SearchResult>("GET", "/api/search", { query: { q, case: o.case ? "true" : undefined, word: o.word ? "true" : undefined, regex: o.regex ? "true" : undefined, agent: o.agent ? "true" : undefined } }),
  /** Every tag with its number of notes; a tag's notes are `search("tag:<name>").files`. */
  tags: () => request<import("./gen/TagCount").TagCount[]>("GET", "/api/tags"),
  /** A tag renamed in every note, the tags nested under it too (core tags.rs `rename`). */
  renameTag: (from: string, to: string) => request<import("./gen/TagRenamed").TagRenamed>("POST", "/api/tags/rename", { body: { from, to } }),
  /** What to offer while a task is typed (task_suggest.rs). */
  taskSuggest: (before: string, o: TaskAsk = {}) =>
    request<import("./gen/TaskSuggest").TaskSuggest | null>("GET", "/api/tasks/suggest", { query: { before, explicit: String(!!o.explicit), at: String(!!o.at), browse: String(!!o.browse), keep_enter: String(!!o.keepEnter) } }),
  /** Rewrites the matching files on disk (see search::replace). */
  replace: (r: ReplaceRequest) => request<ReplaceResult>("POST", "/api/replace", { body: r }),
  commands: () => request<CommandInfo[]>("GET", "/api/commands"),
  cmd: (id: string, args: Record<string, unknown> = {}) =>
    request<CmdResult>("POST", `/api/cmd/${encodeURIComponent(id)}`, { body: { args } }),
  /** Raw bytes (PDF, images). Fetched with the header, so it works under the CSRF guard. */
  thumb: async (path: RelPath, w: number): Promise<Blob> => {
    const res = await fetch(url("/api/thumb", { path, w: String(Math.round(w)) }), { headers: { "x-atlas": "1" } });
    if (!res.ok) throw new ApiError(res.status, `GET /api/thumb: ${res.status}`);
    return res.blob();
  },
  raw: async (path: RelPath): Promise<Blob> => {
    const res = await fetch(url("/api/raw", { path }), { headers: { "x-atlas": "1" } });
    if (!res.ok) throw new ApiError(res.status, `GET /api/raw: ${res.status}`);
    return res.blob();
  },
  rawUrl: (path: RelPath) => url("/api/raw", { path }),
  /** What the user is looking at, for Claude via `atlas mcp` (atlas_context). */
  putUiState: (state: UiState) => request<void>("PUT", "/api/ui/state", { body: state }),
  config: () => request<ConfigDoc>("GET", "/api/config"),
  vscodeTheme: () => request<import("./vscode-theme").VscodeTheme>("GET", "/api/theme/vscode"),
  /** Raw bytes in the body; the server picks a free name in the note's attachment folder. */
  attach: async (note: RelPath, name: string, data: Blob) => {
    const res = await fetch(url("/api/attach", { note, name }), { method: "POST", headers: { "x-atlas": "1" }, body: data });
    if (!res.ok) throw new ApiError(res.status, `POST /api/attach: ${res.status} ${await res.text()}`);
    return (await res.json()) as { path: string; embed: string };
  },
  // the references library is the catalog-papers plugin's (its helper, plugins/beta/catalog-papers/engine;
  // docs/refactor/REFACTOR-references-plugin.md): these call it
  refsPdf: async (name: string, data: Blob) => {
    // the PDF into the plugin's cache, then filed by the helper (which removes the upload)
    const path = `.atlas/cache/plugins/${PAPERS}/import-${Date.now()}-${name.replace(/[^\w.-]+/g, "_")}`;
    const res = await fetch(url("/api/fs/upload", { path }), { method: "POST", headers: { "x-atlas": "1" }, body: data });
    if (!res.ok) throw new ApiError(res.status, `${await res.text()}`);
    return papers<import("./types").PaperAdded>("import", { path, name });
  },
  refsEdit: (e: import("./types").PaperEdit) => papers<import("./types").Paper>("edit", e),
  refsDelete: (key: string) => papers<import("./types").Trashed>("delete", { key }),
  /** The library; empty in a vault without the plugin. */
  refs: async (): Promise<import("./types").Paper[]> => ((await papersHere()) ? papers<import("./types").Paper[]>("list") : []),
  refsAdd: (id: string) => papers<import("./types").PaperAdded>("add", { id }, 300),
  refsBibtex: (key: string) => papers<string>("bibtex", { key }),
  /** The paper's reading note `<dir>/<citekey>.md`, made (or renamed from a legacy notes.md) if needed. */
  /** Whether a web page lets itself be shown as a tab (web_frame.rs). */
  webFrameable: (url: string) => request<boolean>("GET", "/api/web/frameable", { query: { url } }),
  /** A file's one note (companion.rs): `find` says which without making it; else made when missing. */
  companion: (req: import("./gen/CompanionRequest").CompanionRequest) => request<import("./types").CompanionNote>("POST", "/api/companion", { body: req }),
  refsNote: (key: string) => papers<import("./types").CompanionNote>("note", { key }),
  base: (path: string, thisPath?: string) =>
    request<import("./types").BaseResult>("GET", "/api/base", { query: thisPath ? { path, this: thisPath } : { path } }),
  keys: () => request<import("./types").Keymap>("GET", "/api/keys"),
  setKey: (id: string, keys: string | null) => request<import("./types").Keymap>("PUT", "/api/keys", { body: { id, keys } }),
  newCommand: (c: import("./types").NewCommand) => request<import("./types").CommandInfo>("POST", "/api/commands", { body: c }),
  lspServers: () => request<import("./types").LspServerInfo[]>("GET", "/api/lsp"),
  setProperty: (e: import("./types").PropertyEdit) => request<void>("PUT", "/api/property", { body: e }),
  /** One properties-panel edit applied to `text` (the editor's text); nothing is written. */
  editFrontmatter: (text: string, edit: import("./types").FrontmatterEdit) =>
    request<import("./gen/FrontmatterText").FrontmatterText>("POST", "/api/frontmatter/edit", { body: { text, edit } }),
  propertySpec: () => request<import("./types").PropertySpecs>("GET", "/api/properties/spec"),
  /** The properties the vault's notes use, with their commonest values (the panel's completion). */
  knownProperties: () => request<import("./gen/KnownProperty").KnownProperty[]>("GET", "/api/properties/known"),
  home: () => request<import("./gen/HomeDoc").HomeDoc>("GET", "/api/home"),
  /** The usage journal (core usage.rs): fire-and-forget, never in the way of what the user did. */
  usage: (e: import("./gen/UsageEvent").UsageEvent) => { void request<void>("POST", "/api/usage", { body: e }).catch(() => {}); },
  /** Tools Atlas drafted from how the workspace is used (docs/design/MALLEABLE.md R5); nothing is written until kept. */
  toolDrafts: () => request<import("./gen/ToolDraft").ToolDraft[]>("GET", "/api/tools/suggestions"),
  keepTool: (id: string) => request<string[]>("POST", "/api/tools/keep", { body: { id } }),
  dismissTool: (id: string) => request<void>("POST", "/api/tools/dismiss", { body: { id } }),
  cssSnippets: () => request<import("./gen/CssSnippet").CssSnippet[]>("GET", "/api/css-snippets"),
  /** A ```view block of a note → rows for a registered view. */
  view: (path: string, src: string) => request<import("./gen/ViewResult").ViewResult>("POST", "/api/view", { body: { path, src } }),
  /** Bases YAML evaluated without a file (view blocks in notes, plugin queries). */
  baseQuery: (src: string, thisPath?: string) => request<import("./types").BaseResult>("POST", "/api/base/query", { body: thisPath ? { src, this: thisPath } : { src } }),
  /** A new note in a base's view (folder and properties from its filters). */
  baseRow: (path: string, view?: string) => request<import("./gen/BaseRowCreated").BaseRowCreated>("POST", "/api/base/row", { body: { path, view } }),
  /** Hide / show a column, add a board view: written to the `.base`. */
  baseView: (e: import("./gen/BaseViewEdit").BaseViewEdit) => request<void>("POST", "/api/base/view", { body: e }),
  linkMention: (m: import("./types").LinkMention) => request<void>("POST", "/api/link-mention", { body: m }),
  mkdir: (path: string) => request<void>("POST", "/api/fs/mkdir", { query: { path } }),
  /** Raw bytes to a vault path (an upload in the explorer); 409 (ApiError.status) when it exists and not `replace`. */
  upload: async (path: RelPath, data: Blob, replace = false): Promise<void> => {
    const res = await fetch(url("/api/fs/upload", { path, replace: replace ? "true" : undefined }), { method: "POST", headers: { "x-atlas": "1" }, body: data });
    if (!res.ok) throw new ApiError(res.status, `POST /api/fs/upload: ${res.status} ${await res.text()}`);
  },
  /** A request made by the core for a plugin (`atlas.fetch`): only to hosts its manifest lists. */
  pluginFetch: (id: string, req: PluginFetchRequest) => request<PluginFetchResponse>("POST", `/api/plugins/${encodeURIComponent(id)}/fetch`, { body: req }),
  /** A plugin's media address (core plugin_media.rs): the ticket the core keeps its headers under, secrets filled in. */
  pluginMedia: (id: string, req: { url: string; headers?: PluginFetchRequest["headers"] }) => request<{ src: string; ticket: string }>("POST", `/api/plugins/${encodeURIComponent(id)}/media`, { body: req }),
  /** Copy a plugin into the vault (a folder, a git address, an archive); it arrives switched off. */
  installPlugin: (from: string, id?: string) => request<import("./gen/Installed").Installed>("POST", "/api/plugins/install", { body: { from, id } }),
  updatePlugin: (id: string) => request<import("./gen/Installed").Installed>("POST", `/api/plugins/${encodeURIComponent(id)}/update`),
  removePlugin: (id: string) => request<{ to: string }>("POST", `/api/plugins/${encodeURIComponent(id)}/remove`),
  /** Ask a plugin's helper process (started by the first call) and wait for its answer. */
  pluginHelper: (id: string, method: string, params?: unknown, timeout_secs?: number) => request<unknown>("POST", `/api/plugins/${encodeURIComponent(id)}/helper`, { body: { method, params: params ?? null, timeout_secs } }),
  pluginHelperState: (id: string) => request<{ state: "stopped" | "running" | "crashed" }>("GET", `/api/plugins/${encodeURIComponent(id)}/helper`),
  stopPluginHelper: (id: string) => request<{ state: string }>("POST", `/api/plugins/${encodeURIComponent(id)}/helper/stop`),
  pluginSecretNames: (id: string) => request<string[]>("GET", `/api/plugins/${encodeURIComponent(id)}/secrets`),
  pluginSecret: (id: string, name: string) => request<{ value: string | null }>("GET", `/api/plugins/${encodeURIComponent(id)}/secrets/${encodeURIComponent(name)}`),
  setPluginSecret: (id: string, name: string, value: string) => request<void>("PUT", `/api/plugins/${encodeURIComponent(id)}/secrets/${encodeURIComponent(name)}`, { body: { value } }),
  /** A plugin's OpenID sign-ins (plugin_oauth.rs): start → the provider's page; finish with the address it came back to. */
  pluginOauthStart: (id: string, req: import("./gen/OauthStart").OauthStart) => request<import("./gen/OauthStarted").OauthStarted>("POST", `/api/plugins/${encodeURIComponent(id)}/oauth/start`, { body: req }),
  pluginOauthFinish: (id: string, address: string) => request<{ name: string }>("POST", `/api/plugins/${encodeURIComponent(id)}/oauth/finish`, { body: { address } }),
  pluginOauthStatus: (id: string, name: string) => request<import("./gen/OauthStatus").OauthStatus>("GET", `/api/plugins/${encodeURIComponent(id)}/oauth/${encodeURIComponent(name)}`),
  pluginOauthSignOut: (id: string, name: string) => request<boolean>("DELETE", `/api/plugins/${encodeURIComponent(id)}/oauth/${encodeURIComponent(name)}`),
  deletePluginSecret: (id: string, name: string) => request<boolean>("DELETE", `/api/plugins/${encodeURIComponent(id)}/secrets/${encodeURIComponent(name)}`),
  /** The declared settings of a plugin (`[[setting]]`), written into its plugin.toml; null takes a key out. */
  pluginSettings: (id: string, values: Record<string, unknown>) => request<void>("PUT", `/api/plugins/${encodeURIComponent(id)}/settings`, { body: values }),
  /** A move; the core rewrites every link to what moved (relink.rs) and the notice says how many — wherever it started. */
  move: async (from: string, to: string) => {
    const r = await request<import("./gen/Moved").Moved | null>("POST", "/api/fs/move", { body: { from, to } });
    emitPluginEvent({ type: "file:rename", from, to });
    if (r?.links) {
      const n = r.notes.length, show = r.notes.slice(0, 6).map((p) => p.split("/").pop()!.replace(/\.md$/i, "")).join(", ");
      void import("./state.svelte").then((m) => m.toast(`${r.links} link${r.links === 1 ? "" : "s"} updated in ${n} note${n === 1 ? "" : "s"}`, `${show}${n > 6 ? ` and ${n - 6} more` : ""}`, "success"));
    }
    return r;
  },
  trash: async (path: string) => {
    const t = await request<import("./types").Trashed>("POST", "/api/fs/trash", { query: { path } });
    emitPluginEvent({ type: "file:delete", path });
    return t;
  },
  /** The file shown selected in the desktop's own file manager (the desktop's core only: 403 elsewhere). */
  revealOutside: (path: string) => request<void>("POST", "/api/fs/reveal-outside", { query: { path } }),
  tickTask: (path: string, line: number) => request<void>("POST", "/api/task/tick", { body: { path, line } }),
  /** The `[[` list for `q`, ranked by the core (link_targets.rs); `from`: the note being written (its neighbours rank higher). */
  linkTargets: (q: string, from?: string) => request<LinkTarget[]>("GET", "/api/link-targets", { query: from ? { q, from } : { q } }),
  /** One task line ticked (`done`) or opened again, as text: the lines that replace it (no file is touched). */
  taskLine: (text: string, done: boolean) => request<TaskTicked>("POST", "/api/task/line", { body: { text, done } }),
  graph: () => request<import("./types").Graph>("GET", "/api/graph"),
  backlinks: (path: string) => request<import("./types").Backlinks>("GET", "/api/backlinks", { query: { path } }),
  snippets: () => request<{ sources: string[]; variables: string }>("GET", "/api/snippets"),
  configSuggestions: () => request<Record<string, { value: string; label: string }[]>>("GET", "/api/config/suggestions"),
  uiLog: (level: string, message: string) => request<void>("POST", "/api/ui/log", { body: { level, message } }),
  putConfig: (c: WorkspaceConfig) => request<void>("PUT", "/api/config", { body: c }),
  gitLog: (skip = 0, limit = 100) => request<GitCommit[]>("GET", "/api/git/log", { query: { skip: String(skip), limit: String(limit) } }),
  gitCommit: (hash: string) => request<CommitDetail>("GET", "/api/git/commit", { query: { hash } }),
  gitStatus: () => request<GitStatus>("GET", "/api/git/status"),
  gitDiff: (path: RelPath, staged = false) => request<Patch>("GET", "/api/git/diff", { query: { path, staged: staged ? "true" : undefined } }),
  gitStage: (paths: RelPath[], stage: boolean) => request<void>("POST", "/api/git/stage", { body: { paths, stage } }),
  gitCommitIndex: (message: string) => request<GitCommitted>("POST", "/api/git/commit", { body: { message } }),
  /** Unstaged changes thrown away (a copy is kept; untracked files go to the Trash). */
  gitDiscard: (paths: RelPath[]) => request<GitDiscarded>("POST", "/api/git/discard", { body: { paths } }),
  /** A hunk patch to the index (`cached`) or the working tree; `reverse` to take it back. */
  gitApply: (patch: string, cached: boolean, reverse: boolean) => request<void>("POST", "/api/git/apply", { body: { patch, cached, reverse } }),
  gitPull: () => request<GitSynced>("POST", "/api/git/pull"),
  gitPush: () => request<GitSynced>("POST", "/api/git/push"),
};

// --- WebSockets ----------------------------------------------------------------------------

function wsUrl(path: string, query?: Query): string {
  // the base is the desktop core's own address, a vault's prefix on a server ("/v/phd"), or nothing
  const u = new URL(url(path, query), location.origin);
  u.protocol = u.protocol === "https:" ? "wss:" : "ws:";
  return u.toString();
}

/** Raw JSON-RPC relay to a language server (one message per frame). */
export const lspSocket = (lang: string): WebSocket => new WebSocket(wsUrl(`/api/lsp/${lang}`));
/** A file's live room (core live.rs; lib/live.ts). */
export const liveSocket = (path: string, name: string): WebSocket => new WebSocket(wsUrl("/api/live", { path, name }));

export type ConnState = "connecting" | "open" | "closed";

/**
 * Subscribe to /api/events with auto-reconnect (exponential backoff, capped at 5 s).
 * Malformed messages are logged and dropped, never thrown into the app.
 */
export function connectEvents(onEvent: (e: ServerEvent) => void, onState: (s: ConnState) => void): { close(): void } {
  let ws: WebSocket | null = null;
  let delay = 400;
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const open = () => {
    onState("connecting");
    ws = new WebSocket(wsUrl("/api/events"));
    ws.onopen = () => { delay = 400; onState("open"); };
    ws.onmessage = (m) => {
      if (typeof m.data !== "string") return;
      try { onEvent(JSON.parse(m.data) as ServerEvent); }
      catch (err) { console.warn("[atlas] bad event frame", m.data, err); }
    };
    ws.onclose = () => {
      onState("closed");
      if (stopped) return;
      timer = setTimeout(open, delay);
      delay = Math.min(delay * 2, 5000);
    };
    ws.onerror = () => ws?.close();
  };
  open();
  return {
    close() { stopped = true; clearTimeout(timer); ws?.close(); },
  };
}

/** Open a PTY socket. Binary frames are pty bytes both ways; resize goes as a text frame. */
/** `key`: the tab's id — after a page reload the socket takes over that tab's running terminal. */
export function openPty(opts: { preset: PtyPreset; agent?: string; cols: number; rows: number; cwd?: string; command?: string; session?: string; key?: string }): WebSocket {
  const ws = new WebSocket(wsUrl("/api/pty", { preset: opts.preset, agent: opts.agent, cols: opts.cols, rows: opts.rows, cwd: opts.cwd, command: opts.command, session: opts.session, key: opts.key }));
  ws.binaryType = "arraybuffer";
  return ws;
}

export function ptyResize(ws: WebSocket, cols: number, rows: number): void {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ resize: [cols, rows] } satisfies PtyControl));
}

/** The tab is closed: its program ends (a socket that only drops leaves it running for a reload). */
export function ptyEnd(ws: WebSocket): void {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify("end" satisfies PtyControl));
  ws.close();
}
