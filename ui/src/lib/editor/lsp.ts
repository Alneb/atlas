// Language servers for code files (@codemirror/lsp-client): one client per language, shared by all
// editors, talking to atlas-core's `/api/lsp/{lang}` relay (which runs the server in the workspace).
import { errText } from "../text";
import { LSPClient, LSPPlugin, Workspace, findReferences, formatDocument, jumpToDefinition, jumpToImplementation, languageServerExtensions, renameSymbol, signatureKeymap, type Transport, type WorkspaceFile } from "@codemirror/lsp-client";
import { Prec, type Extension, type Text } from "@codemirror/state";
import { keymap, type EditorView } from "@codemirror/view";
import { forEachDiagnostic } from "@codemirror/lint";
import { api, lspSocket } from "../api";
import { pick } from "../palette.svelte";
import { openPath } from "../dock";
import { toast } from "../state.svelte";
import { onSettings } from "../settings.svelte";
import type { LspLang, LspServerInfo } from "../types";
import { inlayHints } from "./inlay-hints";

let servers: Promise<LspServerInfo[]> | null = null;
const clients = new Map<LspLang, Promise<LSPClient | null>>();
const workspaces = new Map<LspLang, AtlasWorkspace>();
const sockets = new Map<LspLang, WebSocket>(); // each client's current connection (restartLanguage closes it)
// a settings change may pick another server: new editors re-resolve, running clients stay
onSettings(() => { servers = null; });

const ext = (path: string) => path.slice(path.lastIndexOf(".") + 1).toLowerCase();

/** LSP language id for a file (the server keys features on it). */
function languageId(lang: LspLang, e: string): string {
  switch (lang) {
    case "c": return e === "c" || e === "h" ? "c" : "cpp";
    case "latex": return e === "bib" ? "bibtex" : "latex";
    case "rust": return "rust";
    case "python": return "python";
  }
}

type File = WorkspaceFile & { view: EditorView; doc: Text };

/** Like the library's default workspace (one view per file, tolerated when a file is reopened),
 *  plus `displayFile`: a definition in another workspace file opens it in an Atlas tab. */
class AtlasWorkspace extends Workspace {
  files: File[] = [];
  private versions: Record<string, number> = Object.create(null);
  constructor(client: LSPClient, private rootUri: string) { super(client); }

  private next(uri: string) { return (this.versions[uri] = (this.versions[uri] ?? -1) + 1); }

  syncFiles() {
    const out = [];
    for (const file of this.files) {
      const plugin = LSPPlugin.get(file.view);
      if (!plugin || plugin.unsyncedChanges.empty) continue;
      out.push({ changes: plugin.unsyncedChanges, file, prevDoc: file.doc });
      file.doc = file.view.state.doc;
      file.version = this.next(file.uri);
      plugin.clear();
    }
    return out;
  }

  openFile(uri: string, languageId: string, view: EditorView) {
    const had = this.getFile(uri) as File | null;
    if (had) { had.view = view; return; } // same file in a second tab: follow the newest view
    const file = { uri, languageId, version: this.next(uri), doc: view.state.doc, view, getView: () => file.view };
    this.files.push(file);
    this.client.didOpen(file);
  }

  closeFile(uri: string, view: EditorView) {
    const file = this.getFile(uri) as File | null;
    if (!file || file.view !== view) return;
    this.files = this.files.filter((f) => f !== file);
    this.client.didClose(uri);
  }

  async displayFile(uri: string): Promise<EditorView | null> {
    if (!uri.startsWith(this.rootUri + "/")) {
      toast("Definition is outside the workspace", decodeURIComponent(uri.replace(/^file:\/\//, "")));
      return null;
    }
    openPath(uri.slice(this.rootUri.length + 1).split("/").map(decodeURIComponent).join("/"));
    // the new editor registers itself through its LSP plugin once its file has loaded
    for (let i = 0; i < 50; i++) {
      const f = this.getFile(uri) as File | null;
      if (f) return f.view;
      await new Promise((r) => setTimeout(r, 100));
    }
    return null;
  }
}

/** The workspace as an LSP workspace folder: servers find their config files (pyrightconfig.json,
 *  .latexmkrc…) relative to it; @codemirror/lsp-client only sends `rootUri`. */
function withFolders(msg: string, rootUri: string): string {
  const m = JSON.parse(msg);
  if (m.method !== "initialize") return msg;
  m.params.workspaceFolders = [{ uri: rootUri, name: rootUri.split("/").pop() || "workspace" }];
  m.params.capabilities.workspace = { ...m.params.capabilities.workspace, workspaceFolders: true, configuration: true };
  return JSON.stringify(m);
}

/** Requests FROM the server: the library ignores them, and an unanswered one can stall a server.
 *  Settings come back empty, so each server's own config file decides; the rest get `null`. */
function answer(msg: string): string | null {
  const m = JSON.parse(msg);
  if (!("id" in m) || !("method" in m)) return null;
  const result = m.method === "workspace/configuration" ? (m.params?.items ?? []).map(() => ({})) : null;
  return JSON.stringify({ jsonrpc: "2.0", id: m.id, result });
}

type TextEdit = { range: { start: { line: number; character: number }; end: { line: number; character: number } }; newText: string };

/** Applies LSP text edits to a string (positions are UTF-16 code units, as in JS). */
function applyEdits(text: string, edits: TextEdit[]): string {
  const starts = [0];
  for (let i = 0; i < text.length; i++) if (text[i] === "\n") starts.push(i + 1);
  const off = (p: { line: number; character: number }) => Math.min(text.length, (starts[p.line] ?? text.length) + p.character);
  const sorted = [...edits].sort((a, b) => off(b.range.start) - off(a.range.start));
  for (const e of sorted) text = text.slice(0, off(e.range.start)) + e.newText + text.slice(off(e.range.end));
  return text;
}

type WorkspaceEdit = { changes?: Record<string, TextEdit[]>; documentChanges?: { textDocument?: { uri: string }; edits?: TextEdit[]; kind?: string }[] };

/** A WorkspaceEdit as text edits per file: `documentChanges` (what basedpyright / rust-analyzer
 *  send) folded into `changes`; file operations (create, rename, delete) are named, not done. */
function editsByFile(r: WorkspaceEdit, what: string): Record<string, TextEdit[]> {
  const changes: Record<string, TextEdit[]> = { ...(r.changes ?? {}) };
  for (const d of r.documentChanges ?? []) {
    if (d.kind) { toast(`${what} also wants to ${d.kind} a file`, "Atlas applied the text edits only."); continue; }
    if (d.textDocument && d.edits) changes[d.textDocument.uri] = [...(changes[d.textDocument.uri] ?? []), ...d.edits];
  }
  return changes;
}

/** Edits a file on disk (one that no editor shows through the language client). */
function editOnDisk(uri: string, edits: TextEdit[], rootUri: string, what: string): void {
  if (!uri.startsWith(rootUri + "/")) { toast(`${what} skipped a file outside the workspace`, decodeURIComponent(uri)); return; }
  const path = uri.slice(rootUri.length + 1).split("/").map(decodeURIComponent).join("/");
  void api.file(path).then((f) => api.putFile(path, applyEdits(f.text, edits), f.mtime))
    .catch((e) => toast(`${what} could not edit ${path}`, errText(e), "error"));
}

/** A rename's WorkspaceEdit, made whole for the library (6.3), which reads only `changes` and only
 *  edits files open in an editor: files that are not open are edited on disk here. */
function settleRename(m: { result?: WorkspaceEdit | null }, lang: LspLang, rootUri: string): void {
  if (!m.result) return;
  const changes = editsByFile(m.result, "Rename");
  const ws = workspaces.get(lang);
  const closed = Object.keys(changes).filter((uri) => !ws?.getFile(uri));
  for (const uri of closed) { editOnDisk(uri, changes[uri], rootUri, "Rename"); delete changes[uri]; }
  if (closed.length) toast("Renamed", `${Object.keys(changes).length + closed.length} files changed`);
  m.result = { changes };
}

// --- code actions (Ctrl+.): the server's quick fixes and refactorings for the caret or selection ---

type CodeAction = { title: string; kind?: string; edit?: WorkspaceEdit; command?: { command: string; arguments?: unknown[] } | string; arguments?: unknown[]; disabled?: { reason: string } };
const roots = new WeakMap<LSPClient, string>();

/** Asks the server what it can do here and offers the answers in the palette's chooser. */
function codeActions(view: EditorView): boolean {
  const p = LSPPlugin.get(view);
  if (!p) return false;
  const sel = view.state.selection.main, range = { start: p.toPosition(sel.from), end: p.toPosition(sel.to) };
  // the problems on the caret's line(s) go along: most quick fixes are answers to one of them
  const diagnostics: unknown[] = [];
  const first = view.state.doc.lineAt(sel.from).from, last = view.state.doc.lineAt(sel.to).to;
  forEachDiagnostic(view.state, (d, from, to) => {
    if (from <= last && to >= first) diagnostics.push({ range: { start: p.toPosition(from), end: p.toPosition(to) }, message: d.message, severity: d.severity === "error" ? 1 : d.severity === "warning" ? 2 : 3 });
  });
  p.client.sync();
  p.client.request<unknown, (CodeAction | null)[] | null>("textDocument/codeAction", { textDocument: { uri: p.uri }, range, context: { diagnostics, triggerKind: 1 } }).then((list) => {
    const actions = (list ?? []).filter((a): a is CodeAction => !!a && !a.disabled);
    if (!actions.length) { toast("No code actions here", "The language server offers nothing for this place."); return; }
    pick({
      placeholder: "Code action…", tag: "Code action", icon: "file-code",
      items: actions.map((a, i) => ({ value: String(i), title: a.title, detail: a.kind })),
      onpick: (v) => runAction(view, p, actions[Number(v)]),
    });
  }, (e) => toast("Code actions failed", errText(e), "error"));
  return true;
}

/** Applies an action: its edit (this file in the editor, others on disk), then its command. */
function runAction(view: EditorView, p: LSPPlugin, a: CodeAction | undefined): void {
  if (!a) return;
  if (a.edit) {
    const changes = editsByFile(a.edit, "The code action");
    for (const [uri, edits] of Object.entries(changes)) {
      if (uri === p.uri) view.dispatch({ changes: edits.map((e) => ({ from: p.fromPosition(e.range.start), to: p.fromPosition(e.range.end), insert: e.newText })), userEvent: "input.codeaction" });
      else editOnDisk(uri, edits, roots.get(p.client) ?? "", "The code action");
    }
  }
  const cmd = typeof a.command === "string" ? { command: a.command, arguments: a.arguments } : a.command;
  if (cmd) void p.client.request("workspace/executeCommand", cmd).catch((e) => toast("The code action's command failed", errText(e), "error"));
  view.focus();
}

// --- symbols in the project: any function, class or section the server knows, by name, in the chooser ---

type Symbol = { name: string; kind?: number; containerName?: string; location: { uri: string; range?: { start: { line: number } } } };
/** LSP's SymbolKind numbers, the common ones by name (the rest go without). */
const KINDS: Record<number, string> = { 2: "module", 5: "class", 6: "method", 8: "field", 9: "constructor", 10: "enum", 11: "interface", 12: "function", 13: "variable", 14: "constant", 23: "struct", 26: "type" };

/** Asks the server for the project's symbols (`workspace/symbol`; servers that list nothing for "" are asked for the
 *  word at the caret) and opens the one chosen at its line. */
export function workspaceSymbols(view: EditorView): boolean {
  const p = LSPPlugin.get(view);
  if (!p) return false;
  const root = roots.get(p.client) ?? "";
  const at = view.state.wordAt(view.state.selection.main.head);
  const word = at ? view.state.sliceDoc(at.from, at.to) : "";
  const ask = (query: string) => p.client.request<unknown, Symbol[] | null>("workspace/symbol", { query }).then((l) => l ?? []);
  let found: Symbol[] = [];
  pick({
    placeholder: "Symbol in the project…", tag: "Symbol", icon: "file-code",
    items: async () => {
      p.client.sync();
      found = await ask("").catch(() => []);
      if (!found.length && word) found = await ask(word).catch(() => []);
      if (!found.length) toast("No symbols", "The language server lists none for this project.");
      return found.map((s, i) => {
        const where = s.location.uri.startsWith(root + "/") ? decodeURIComponent(s.location.uri.slice(root.length + 1)) : decodeURIComponent(s.location.uri);
        const line = s.location.range ? `:${s.location.range.start.line + 1}` : "";
        return { value: String(i), title: s.name, detail: [KINDS[s.kind ?? 0], s.containerName, `${where}${line}`].filter(Boolean).join(" · ") };
      });
    },
    onpick: (v) => {
      const s = found[Number(v)];
      if (!s) return;
      if (!s.location.uri.startsWith(root + "/")) return void toast("The symbol is outside the workspace", decodeURIComponent(s.location.uri));
      openPath(s.location.uri.slice(root.length + 1).split("/").map(decodeURIComponent).join("/"), s.location.range ? s.location.range.start.line + 1 : undefined);
    },
  });
  return true;
}

/** A server that went away without ever answering (not installed properly, a wrong command): say so
 *  once, with the last line it wrote — else completion and hover are just silently missing. */
const reported = new Set<LspLang>();
async function reportDead(lang: LspLang, why: string): Promise<void> {
  if (reported.has(lang)) return;
  reported.add(lang);
  const log = `.atlas/cache/lsp-${lang}.log`;
  const last = await api.file(log).then((f) => f.text.trim().split("\n").pop() ?? "", () => "");
  toast(`The ${lang} language server did not start`, `${last || `It ${why || "closed"} without a message.`} (No completion, hover or errors for ${lang} files until this is fixed: Settings → Code; log: ${log})`, "error", 15000);
}

function connect(lang: LspLang, rootUri: string): Promise<Transport> {
  return new Promise((resolve, reject) => {
    const ws = lspSocket(lang);
    sockets.set(lang, ws);
    const handlers = new Set<(m: string) => void>();
    const renames = new Set<number>(); // ids of our textDocument/rename requests
    let heard = false;
    ws.onmessage = (e) => {
      heard = true;
      let text = String(e.data);
      const reply = answer(text);
      if (reply) { ws.send(reply); return; }
      if (renames.size && /"id"/.test(text)) {
        const m = JSON.parse(text);
        if (renames.delete(m.id)) { settleRename(m, lang, rootUri); text = JSON.stringify(m); }
      }
      for (const h of handlers) h(text);
    };
    ws.onopen = () => resolve({
      send: (m) => {
        if (m.includes('"textDocument/rename"')) { const id = JSON.parse(m).id; if (typeof id === "number") renames.add(id); }
        ws.send(withFolders(m, rootUri));
      },
      subscribe: (h) => handlers.add(h),
      unsubscribe: (h) => handlers.delete(h),
    });
    ws.onerror = () => reject(new Error(`${lang} language server: connection failed`));
    // a dead server: forget the client so the next editor starts a fresh one
    // reported only when the core says the server died (lsp.rs: 4001 exited, 4004 none found) — not when the
    // socket closed for another reason (the page closed it, the core restarted), which once raised a false alarm
    ws.onclose = (e) => { clients.delete(lang); if (!heard && (e.code === 4001 || e.code === 4004)) void reportDead(lang, e.reason); };
  });
}

function client(info: LspServerInfo): Promise<LSPClient | null> {
  let c = clients.get(info.lang);
  if (!c) {
    c = connect(info.lang, info.root_uri).then(
      (t) => {
        const made = new LSPClient({
          rootUri: info.root_uri,
          workspace: (c) => { const w = new AtlasWorkspace(c, info.root_uri); workspaces.set(info.lang, w); return w; },
          // code actions come back as objects with their edits only when the client says it reads them
          // inlay hints come only to a client that says it shows them
          extensions: [...languageServerExtensions(), { clientCapabilities: { textDocument: { codeAction: { codeActionLiteralSupport: { codeActionKind: { valueSet: ["", "quickfix", "refactor", "source"] } } }, inlayHint: { dynamicRegistration: false } } } }],
          timeout: 8000,
        });
        roots.set(made, info.root_uri);
        return made.connect(t);
      },
      (err) => { console.warn("[atlas]", err); clients.delete(info.lang); return null; },
    );
    clients.set(info.lang, c);
  }
  return c;
}

/** A language's server started again (another Python environment chosen): the same client reconnects to a new
 *  server, which is sent the open files again. Nothing when no server of that language is running. */
export async function restartLanguage(lang: LspLang): Promise<void> {
  const c = await clients.get(lang);
  const root = c ? roots.get(c) : undefined;
  if (!c || !root) return;
  c.disconnect();
  const old = sockets.get(lang);
  if (old) { old.onclose = null; old.close(); } // its server stops with it (lsp.rs: kill_on_drop)
  try { c.connect(await connect(lang, root)); } catch (e) { clients.delete(lang); toast(`The ${lang} language server did not start again`, errText(e), "error"); }
}

/** The LSP keys, ahead of vim (whose normal mode swallows F2). Each command declines (false) in a
 *  file without a server, so the key falls through. */
export const lspKeys: Extension = Prec.highest(keymap.of([
  { key: "F2", run: renameSymbol },
  { key: "F12", run: jumpToDefinition },
  { key: "Mod-F12", run: jumpToImplementation },
  // the parameters of the call the caret is in (it also opens by itself after "(" and ","): Ctrl+Shift+Space, as in VS Code
  ...signatureKeymap,
  { key: "Shift-F12", run: findReferences },
  { key: "Shift-Alt-f", run: formatDocument },
  { key: "Mod-.", run: codeActions },
]));

/** The LSP extension for a file, or null when no server covers it (or none is installed). */
export async function lspFor(path: string): Promise<Extension | null> {
  servers ??= api.lspServers().catch(() => []);
  const e = ext(path);
  const info = (await servers).find((s) => s.command && s.extensions.includes(e));
  if (!info) return null;
  const c = await client(info);
  return c ? [c.plugin(`${info.root_uri}/${path.split("/").map(encodeURIComponent).join("/")}`, languageId(info.lang, e)), inlayHints] : null;
}
