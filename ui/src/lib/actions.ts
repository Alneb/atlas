// Built-in UI actions: one table drives the palette, the global keymap and the key hints.
import type { BuiltinId } from "./builtin-plugins";
import { openCaptures, openQuickCapture } from "./quick-capture.svelte";
import { errText } from "./text";
import { renameFile } from "./rename-file";
import { shownName } from "./paths";
import { api } from "./api";
import { toggleProperties } from "./properties-panel.svelte";
import { open, focusOrOpen, focusPanel, nextTerminalN, closeActive, resetLayout, openPath, toggleTerminalPanel, toggleSidePanel, focusTerminalPanel, navigate, historyList } from "./dock";
import { drawingExports, editors, lastEditorId, noteFormat, searchRequest, terminals, type TerminalHandle } from "./registry";
import { getDock } from "./dock-instance";
import { agentsOn, fillSelection } from "./agents";
import { context, currentSelection } from "./context.svelte";
import { extOf, openersFor, setDefaultOpener } from "./openers";
import { openPalette, pick } from "./palette.svelte";
import { app, toast } from "./state.svelte";
import { placeSidePanel, sideInBar } from "./side-panel.svelte";
import { toggleTheme, toggleVim, setTerminalPosition, setPropertiesView, settings } from "./settings.svelte";
import { zoom } from "./settings-schema";
import { toggleFullscreen } from "./fullscreen.svelte";
import { zoomPane } from "./pane-zoom";
import { reloadInterface } from "./ui-reload";
import { tabActions } from "./tabs.svelte";
import { vaultActions } from "./vaults";
import { sidebarActions } from "./sidebar.svelte";
import { notesActions } from "./notes-system";
import { paperActions } from "./papers";
import type { IconName, PaneSpec } from "./panes";
import { setHomeSpec } from "./apps.svelte";

export interface Action {
  id: string;
  title: string;
  keys?: string;
  /** More chords for the same command (not rebindable; `keys` is the one shown and overridden). */
  alsoKeys?: string[];
  /** "note": the chord counts only while the keyboard is in a note, and there it wins over a
   *  command bound to the same chord everywhere (Ctrl+B: bold in a note, the side panel elsewhere). */
  where?: "note";
  /** A focused terminal keeps every key without Super (F-keys aside) for its shell; `true` lets this
   *  command's keys reach it from a terminal too (switching tabs, the terminal toggle). */
  fromTerminal?: boolean;
  /** A built-in plugin's command (builtin-plugins.ts): it exists only while that plugin is on. */
  plugin?: BuiltinId;
  /** CSS selector of panes that keep this chord for themselves (the PDF zooms its page, not the app). */
  yieldTo?: string;
  /** As a toolbar button (lib/toolbar.ts): its icon, and a short name when the title is a sentence. */
  icon?: IconName | (() => IconName);
  label?: string;
  run(): void | Promise<void>;
}

/** The home document (`home` in config; a note of live blocks), or the classic Today pane when off.
 *  Resolved once per session: the first screen must not wait on a request twice. */
let home: Promise<{ path: string | null; title: string | null }> | null = null;
export const homeDoc = () => (home ??= api.home().then((h) => ({ path: h.path ?? null, title: h.title ?? null }), () => ({ path: null, title: null })));
export async function openHome(still: () => boolean = () => true): Promise<void> {
  const { path, title } = await homeDoc();
  if (!still()) return; // something else was asked for while the home document was looked up
  const spec: PaneSpec = !path ? { kind: "today" } : path.endsWith(".page") ? { kind: "page", path, title: title ?? undefined } : { kind: "editor", path };
  setHomeSpec(spec); // Home is an app, not a tab (lib/apps.svelte.ts)
  open(spec);
}

/** An address opens as it is (`example.org` gets https://), anything else is searched for, in a tab (web-links.ts). */
function browse(): void {
  pick({
    placeholder: "An address, or words to search the web for…", tag: "Web", icon: "globe", items: [],
    typed: (t) => (webAddress(t) ? `Open ${t}` : `Search the web for “${t}”`),
    onpick: (t) => {
      const text = t?.trim();
      if (!text) return;
      void import("./web-links").then((m) => m.openWeb(webAddress(text) ?? `https://duckduckgo.com/?q=${encodeURIComponent(text)}`));
    },
  });
}

/** `text` as a web address when it looks like one: a scheme, or a dotted host with no spaces (`wikipedia.org/wiki/X`). */
export function webAddress(text: string): string | null {
  const t = text.trim();
  if (/^https?:\/\//i.test(t)) return t;
  return !/\s/.test(t) && /^[\w-]+(\.[\w-]+)+(:\d+)?(\/.*)?$/.test(t) ? `https://${t}` : null;
}


/** The active drawing as an SVG beside it — on demand, never on every save. */
async function exportDrawing(): Promise<void> {
  const run = drawingExports.get(getDock()?.activePanel?.id ?? "");
  if (!run) return void toast("No drawing here", "Open a drawing first: this writes its SVG beside it.");
  try { toast("Drawing exported", await run(), "success"); } catch (e) { toast("Not exported", errText(e), "error"); }
}

/** The active drawing's note beside it: its tags, project and topics are the Library's Drawings filters. */
function drawingProperties(): void {
  const spec = getDock()?.activePanel?.params as PaneSpec | undefined;
  if (spec?.kind !== "excalidraw") return void toast("No drawing here", "Open a drawing first: its properties are its note's.");
  openPath(spec.path.replace(/\.excalidraw$/i, ".md"), undefined, { beside: true });
}

/** The project's symbols, from the current code file's language server. */
function goToSymbol(): void {
  const id = lastEditorId();
  if (!id || !editors.get(id)?.symbols()) toast("No symbols here", "Symbols come from a language server: open a code file.");
}

/** Git blame beside the current file's lines, or away again. */
async function toggleBlame(): Promise<void> {
  const id = lastEditorId();
  if (!id || !editors.get(id)) return void toast("No file here", "Open a file to see who changed each line.");
  await editors.get(id)!.toggleBlame();
}

export function showProblems(): void {
  const id = lastEditorId();
  if (!id || !editors.get(id)?.showProblems()) toast("No problems list here", "Problems come from a language server: open a code file.");
}

export const shellTerminal = () => focusOrOpen("terminal", () => ({ kind: "terminal", preset: "shell", n: nextTerminalN() }), (id) => id.startsWith("terminal:shell:"));
export const claudeTerminal = () => focusOrOpen("terminal", () => ({ kind: "terminal", preset: "claude", n: nextTerminalN() }), (id) => id.startsWith("terminal:claude:"));

/** Runs a command in the shell terminal (opened when there is none; shown, not focused away from on purpose):
 *  typed and entered there, so the user sees it, its output, and can press ↑ to run it again. */
export async function runInTerminal(command: string): Promise<boolean> {
  shellTerminal();
  return typeInto(() => [...terminals.values()].find((x) => x.preset === "shell" && x.ready()), command);
}

/** Opens a terminal tab (named `title`) running the command itself — no interactive shell, so no
 *  rc files or login banner — that closes when the command ends; e.g. an ssh connection. */
export async function runInNewTerminal(command: string, title?: string): Promise<boolean> {
  const n = nextTerminalN();
  open({ kind: "terminal", preset: "shell", n, title, command });
  for (let i = 0; i < 80; i++) {
    const t = terminals.get(`terminal:shell:${n}`);
    if (t) { t.focus(); return true; }
    await new Promise((r) => setTimeout(r, 100));
  }
  return false;
}

/** Waits (up to 8 s) for the terminal `find` returns, then types and enters the command. */
async function typeInto(find: () => { run(c: string): void } | undefined, command: string): Promise<boolean> {
  for (let i = 0; i < 80; i++) {
    const t = find();
    if (t) { t.run(command); return true; }
    await new Promise((r) => setTimeout(r, 100));
  }
  toast("The terminal is not ready", `Run it yourself: ${command}`, "info", 8000);
  return false;
}

/** The selection (or the open file) typed into an AI agent's terminal, in that agent's own words (its plugin's
 *  `send_selection`, e.g. Claude Code's `@path#L10-20 `): the agent tab used last, else the first agent's (opened). */
export async function sendToAgent(): Promise<void> {
  const id = lastEditorId();
  const sel = currentSelection();
  const path = sel?.text ? sel.path : id ? editors.get(id)?.path : undefined;
  if (!path) { toast("Nothing to send", "Open a file, select some lines, then send them to the agent."); return; }
  const lines = sel?.text && sel.path === path ? { from: sel.from_line, to: sel.to_line } : undefined;
  const declared = agentsOn().filter((a) => a.send_selection);
  // an agent tab's agent: the one it names, else (a tab of the "claude" preset saved without one) what the core starts
  // for it — the `claude` agent, else the first declared (pty.rs)
  const agentOf = (t: TerminalHandle) => t.agent ? declared.find((a) => a.ref === t.agent)
    : t.preset === "claude" ? declared.find((a) => a.id === "claude") ?? declared[0] : undefined;
  const sends = (t: TerminalHandle) => !!agentOf(t);
  const live = () => [...terminals].filter(([, t]) => sends(t) && t.ready()).sort(([, a], [, b]) => b.usedAt - a.usedAt)[0];
  const first = declared[0];
  if (!live()) {
    if (!first) { toast("No AI agent here", "Switch on an agent plugin (Claude) in Settings → Plugins, then send again."); return; }
    open({ kind: "terminal", preset: "claude", agent: first.ref, n: nextTerminalN() });
  }
  for (let i = 0; i < 80; i++) {
    const [panel, t] = live() ?? [];
    if (panel && t) {
      const text = fillSelection(agentOf(t)?.send_selection ?? "", path, lines);
      focusPanel(panel); // a hidden terminal panel (Ctrl+J) comes back
      t.paste(text); t.focus(); return;
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  toast("The agent is not ready yet", `Type it yourself: ${fillSelection(first.send_selection ?? "", path, lines)}`, "info", 8000);
}

/** Open with…: every view that can show the file, plus "always open .ext with…" (docs/guides/MALLEABLE.md R2). */
export function openWith(path?: string): void {
  const file = path ?? context.active?.path;
  if (!file) { toast("Open with…", "Open or select a file first."); return; }
  const ext = extOf(file);
  const views = openersFor(file);
  const custom = !!settings.config?.files.open_with?.[ext];
  pick({
    placeholder: `Open ${shownName(file)} with…`, tag: "Open with", icon: "file",
    items: [
      ...views.map((o) => ({ value: `once:${o.id}`, title: o.title, detail: o.isDefault ? "default" : "", icon: o.icon, section: "Open with" })),
      ...views.filter((o) => !o.isDefault).map((o) => ({ value: `always:${o.id}`, title: `Always open .${ext} with ${o.title}`, icon: o.icon, section: "Default" })),
      ...(custom ? [{ value: "always:", title: `Open .${ext} with Atlas's usual view again`, icon: "refresh" as const, section: "Default" }] : []),
    ],
    onpick: async (v) => {
      const [how, id] = [v.slice(0, v.indexOf(":")), v.slice(v.indexOf(":") + 1)];
      if (how === "always") {
        try { await setDefaultOpener(file, id || null); } catch (e) { toast("Not saved", errText(e), "error"); return; }
        openPath(file);
      } else {
        const o = views.find((x) => x.id === id);
        if (o) open(o.spec(file));
      }
    },
  });
}

export async function runServerCommand(id: string, title: string): Promise<void> {
  try {
    const r = await api.cmd(id);
    if (r.ok) {
      const body = r.result === undefined || r.result === null ? undefined : typeof r.result === "string" ? r.result : JSON.stringify(r.result, null, 1);
      toast(title, body?.slice(0, 400), "success");
    } else toast(`${title} failed`, r.error, "error");
  } catch (err) {
    toast(`${title} failed`, errText(err), "error");
  }
}

/** This vault in the desktop's browser: a locked core gives a link that works once (DESIGN-local-lock.md), an open one its address. */
async function openInBrowser(): Promise<void> {
  const url = await api.localLink().then((l) => l.url, () => location.href.split("#")[0]);
  window.open(url, "_blank", "noopener");
}

const PAGE_ZOOM = ".pdf-pane"; // panes with a zoom of their own

export const actions: Action[] = [
  { id: "ui.palette", title: "Command palette", keys: "Super+E", alsoKeys: ["F1"], run: () => openPalette("all") },
  { id: "ui.open-in-browser", title: "Open Atlas in the browser", run: openInBrowser },
  // e-ink (Settings → Appearance: ui.eink_refresh): the ghosts of earlier screens cleared by one full refresh
  { id: "ui.eink-refresh", title: "E-ink: clear the screen", run: () => void import("./eink").then((m) => m.einkRefresh(true)) },
  // the store before the note's pdf-marks block: each older drawing's marks moved over, after a yes (lib/pdf-migrate.ts)
  { id: "pdf.migrate-marks", title: "PDF: move older marks (drawings) into their notes", run: () => void import("./pdf-migrate").then((m) => m.migratePdfMarks()) },
  { id: "pdf.export-marks", title: "PDF: export a copy with its marks inside", run: () => {
    const p = context.active?.path;
    if (!p?.toLowerCase().endsWith(".pdf")) { toast("Export with marks", "Open the PDF to export first."); return; }
    void import("./pdf-export").then((m) => m.exportWithMarks(p));
  } },
  { id: "pdf.export-marks-flat", title: "PDF: export a copy with its marks drawn into the pages (for printing)", run: () => {
    const p = context.active?.path;
    if (!p?.toLowerCase().endsWith(".pdf")) { toast("Export with marks", "Open the PDF to export first."); return; }
    void import("./pdf-export").then((m) => m.exportWithMarks(p, "flat"));
  } },
  // Obsidian's keys, in notes only (lib/editor/md-format.ts sets noteFormat when the editor loads)
  { id: "note.bold", title: "Note: bold", keys: "Ctrl+B", where: "note", run: () => noteFormat.run?.("bold") },
  { id: "note.italic", title: "Note: italic", keys: "Ctrl+I", where: "note", run: () => noteFormat.run?.("italic") },
  { id: "note.link", title: "Note: link", keys: "Ctrl+K", where: "note", run: () => noteFormat.run?.("link") },
  { id: "note.task", title: "Note: to-do on this line (again: done, again: open)", keys: "Ctrl+L", where: "note", run: () => noteFormat.run?.("task") },
  // Obsidian Tasks' dialog: the caret's line (a to-do, or text that becomes one) with its fields in a form
  { id: "file.rename", title: "File: rename this file…", run: () => { const p = context.active?.path; if (p) renameFile(p); else toast("Rename", "Open the file to rename first."); } },
  { id: "note.task-edit", title: "Note: create or edit task…", where: "note", run: () => noteFormat.run?.("taskDialog") },
  { id: "note.insert-template", title: "Note: insert a template…", where: "note", run: () => noteFormat.run?.("insertTemplate") },
  { id: "note.cycle", title: "Note: cycle this line — text, list item, to-do, text", keys: "Ctrl+Q", where: "note", run: () => noteFormat.run?.("cycle") },
  { id: "ui.quickOpen", title: "Open file…", keys: "Super+P", alsoKeys: ["Ctrl+P"], run: () => openPalette("files") },
  // no default keys: Alt+←/→ move by word in the editor; the mouse's side buttons and a swipe do this (nav-input.ts)
  { id: "ui.back", title: "Go back (previous pane)", keys: "Super+[", run: () => navigate(-1) },
  { id: "ui.history", title: "History: the tabs visited, to go back to one…", run: () => historyList() },
  { id: "ui.forward", title: "Go forward", keys: "Super+]", run: () => navigate(1) },
  { id: "ui.today", title: "Home (your home document)", icon: "today", label: "Home", keys: "Super+H", run: () => void openHome() },
  { id: "ui.capture", title: "Capture (a popup over the current pane)", keys: "Super+C", run: () => openQuickCapture() },
  // the bar as a capture box, wherever one is: the same completions (task fields, [[notes, #tags, @days)
  { id: "ui.capture-bar", title: "Capture in the bar", run: () => openPalette("capture") },
  // every capture by day, to triage (components/views/Captures.svelte): the `captures` block alone in a tab
  { id: "ui.captures", title: "Captures: triage what was captured", icon: "inbox", run: openCaptures },
  // New…: every kind of new thing, each placed by its kind; the phone app's + opens it
  { id: "ui.new", title: "New… (a note, from a template, a drawing, or what a plugin adds)", icon: "plus", label: "New…", run: () => void import("./new-thing").then((m) => m.newThing()) },
  { id: "ui.browse", title: "Browse the web… (an address, or words to search)", icon: "globe", label: "Browse", keys: "Super+Shift+B", run: browse },
  { id: "ui.drawing", title: "New drawing (Excalidraw)", keys: "Super+Shift+D", run: () => import("./draw-new").then((m) => m.newExcalidraw()) },
  { id: "draw.exportSvg", title: "Drawing: export as SVG (beside it)", run: () => void exportDrawing() },
  { id: "draw.properties", title: "Drawing: its properties (tags, project, topics — its note, beside it)", run: drawingProperties },
  { id: "ui.terminal", title: "Focus terminal (again: hide)", keys: "Ctrl+`", fromTerminal: true, run: focusTerminalPanel },
  // Super+F; F11 as before
  { id: "ui.fullscreen", title: "Fullscreen: this tab (terminal or editor) over the whole window; again: back", keys: "Super+F", alsoKeys: ["F11"], run: () => { void toggleFullscreen(); } },
  { id: "ui.terminal.new", title: "New shell terminal", run: () => { open({ kind: "terminal", preset: "shell", n: nextTerminalN() }); } },
  // the id stays (keys the user rebound); the agent is the one used last (lib/agents.ts)
  { id: "ui.sendToClaude", title: "Send the selection to the AI agent (@file#lines for Claude)", keys: "Ctrl+Alt+Enter", run: sendToAgent },
  // the ids stay (keys the user rebound): the agent is a plugin's (pty.rs: the `claude` agent, else the first declared)
  { id: "ui.claude", title: "AI agent terminal (Claude, or the agent a plugin declares)", icon: "claude", label: "Agent", keys: "Super+K", run: claudeTerminal },
  { id: "ui.claude.new", title: "New AI agent session (another one beside the first)", run: () => { open({ kind: "terminal", preset: "claude", n: nextTerminalN() }); } },
  { id: "ui.files", title: "Show files", icon: "files", label: "Files", keys: "Super+Shift+F", run: () => { open({ kind: "files" }); } },
  // the big explorer (a tab, like Dolphin): the vault, SSH hosts, copyparty servers in one list
  { id: "ui.explorer", title: "Files: the explorer (vault, SSH hosts, servers)", icon: "folder-open", label: "Explorer", run: () => { open({ kind: "explorer", source: "vault", place: "" }); } },
  { id: "ui.properties", title: "Properties: show / hide the panel beside notes", icon: "table", run: () => toggleProperties() },
  { id: "ui.search", title: "Search in workspace", icon: "search", label: "Search", keys: "Ctrl+Shift+F", run: () => { open({ kind: "search" }); } },
  { id: "ui.replace", title: "Replace in files", keys: "Ctrl+Shift+H", run: () => { searchRequest.replace = true; open({ kind: "search" }); window.dispatchEvent(new Event("atlas-search-replace")); } },
  // Super+Q is Atlas's key (also from a terminal, which keeps Ctrl+W for the shell); Ctrl+W stays
  { id: "ui.close", title: "Close tab", keys: "Super+Q", alsoKeys: ["Ctrl+W"], run: closeActive },
  { id: "ui.reload", title: "Reload the interface", run: () => { void reloadInterface(); } },
  { id: "ui.vim", title: "Toggle vim mode", run: () => { toggleVim(); toast(`Vim mode ${app.vimEnabled ? "off" : "on"}`); } },
  { id: "ui.theme", title: "Toggle light / dark theme", icon: () => (app.theme === "dark" ? "sun" : "moon"), label: "Toggle theme", run: toggleTheme },
  { id: "ui.settings", title: "Settings", icon: "settings", keys: "Super+,", run: () => { open({ kind: "settings" }); } },
  // the keys zoom the tab they are in (lib/pane-zoom.ts); everything at once is its own trio
  { id: "ui.zoomIn", title: "Zoom in: this tab's text larger", keys: "Ctrl+Plus", alsoKeys: ["Ctrl+="], yieldTo: PAGE_ZOOM, run: () => zoomPane(1) },
  { id: "ui.zoomOut", title: "Zoom out: this tab's text smaller", keys: "Ctrl+Minus", yieldTo: PAGE_ZOOM, run: () => zoomPane(-1) },
  { id: "ui.zoomReset", title: "Zoom: this tab back to the normal size", keys: "Ctrl+0", yieldTo: PAGE_ZOOM, run: () => zoomPane(0) },
  { id: "ui.zoomAllIn", title: "Zoom everything in (all text sizes, a setting)", keys: "Ctrl+Alt+Plus", alsoKeys: ["Ctrl+Alt+="], run: () => zoom(1) },
  { id: "ui.zoomAllOut", title: "Zoom everything out (all text sizes, a setting)", keys: "Ctrl+Alt+Minus", run: () => zoom(-1) },
  { id: "ui.zoomAllReset", title: "Zoom everything: back to the default text sizes", keys: "Ctrl+Alt+0", run: () => zoom(0) },
  { id: "ui.outline", title: "Outline of the current note", icon: "outline", label: "Outline", keys: "Super+O", run: () => { open({ kind: "outline" }); } },
  { id: "ui.libraries", title: "Libraries (drawings, references, films, comics…)", icon: "library", label: "Libraries", run: () => { open({ kind: "libraries" }); } },
  // one Library page: References is its first library
  { id: "ui.library", title: "Library: references, then the vault's other libraries", icon: "library", label: "Library", keys: "Super+Shift+L", plugin: "library", run: () => { open({ kind: "libraries", at: "references" }); } },
  { id: "ui.git", title: "Git: changes and history", icon: "git", label: "Git", keys: "Super+G", run: () => { open({ kind: "git" }); } },
  { id: "ui.git.blame", title: "Git: who changed each line (blame)", icon: "git", run: () => void toggleBlame() },
  { id: "ui.sidePanel", title: "Show / hide the side panel (files, search, outline, git)", icon: "folder-tree", label: "Side panel (show / hide)", keys: "Super+B", run: toggleSidePanel },
  { id: "ui.sidePanel.move", title: "Move side panel (beside the editors ↔ in the left bar)", run: () => placeSidePanel(sideInBar() ? "dock" : "sidebar") },
  { id: "ui.panel", title: "Show / hide terminal panel", icon: "terminal", label: "Terminal (show / hide)", keys: "Super+J", run: toggleTerminalPanel },
  { id: "ui.panel.move", title: "Move terminal panel (bottom ↔ right)", run: () => setTerminalPosition(settings.config?.terminal.position === "right" ? "bottom" : "right") },
  { id: "ui.properties.inline", title: "Properties: show them in the note (as Obsidian)", run: () => setPropertiesView("inline") },
  { id: "ui.web", title: "Open web page…", run: () => openPalette("url") },
  { id: "ui.openWith", title: "Open with… (this file in another view)", keys: "Ctrl+Alt+O", run: () => openWith() },
  { id: "ui.focusFile", title: "Edit FOCUS.md", run: () => openPath(app.workspace?.config.focus ?? "FOCUS.md") },
  { id: "ui.resetLayout", title: "Reset layout", run: resetLayout },
  { id: "ui.python.env", title: "Python: choose the environment (for the Python server and new terminals)", icon: "terminal", run: () => void import("./python-env").then((m) => m.choosePythonEnv()) },
  { id: "ui.glance", title: "Glance: follow another device (what it shows, full screen)", icon: "eye", run: () => void import("./where.svelte").then((m) => m.followDevice()) },
  { id: "ui.symbols", title: "Go to a symbol in the project (functions, classes…)", icon: "file-code", run: () => goToSymbol() },
  { id: "ui.problems", title: "Problems: errors and warnings of the current file", keys: "Super+M", run: showProblems },
  { id: "ui.graph", title: "Graph of notes (links between notes)", icon: "link", label: "Graph", keys: "Super+Shift+G", run: () => { open({ kind: "graph" }); } },
  { id: "ui.commands", title: "Commands & keyboard shortcuts (all commands, new command)", icon: "command", label: "Commands & shortcuts", keys: "Super+Shift+K", run: () => { open({ kind: "commands" }); } },
  ...tabActions,
  ...vaultActions,
  ...sidebarActions,
  ...notesActions,
  ...paperActions,
];

/** Server built-ins that the UI fronts with a better interaction than a bare POST. */
export const serverBuiltinToUi: Record<string, string | null> = {
  capture: "ui.capture",
  open: "ui.quickOpen",
  today: "ui.today",
};
