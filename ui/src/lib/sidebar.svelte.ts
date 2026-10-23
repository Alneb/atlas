// The sidebar is a page of blocks (docs/guides/SHELL.md): `.atlas/sidebar.page` lists them top to bottom —
// `toolbar`, `pins`, `bookmarks`, `tabs`, or any other block (outline, backlinks, a calendar). Without
// the file the default below is used; "Sidebar: arrange its blocks…" writes it and opens it as a page.
// Also here: what the sidebar's own blocks share — the keyboard cursor, the filter, drag state, menu.
import { renameFile } from "./rename-file";
import { errText } from "./text";
import { atPointer, type MenuAt } from "./menu";
import { shownName } from "./paths";
import { revealItems } from "./reveal-items";
import { fullscreen } from "./fullscreen.svelte";
import { tick } from "svelte";
import type { Action } from "./actions";
import { api } from "./api";
import { on } from "./bus";
import { focusPanel, open, openSide } from "./dock";
import { appLaunchers } from "./apps.svelte";
import { SIDE_COMMANDS } from "./side-panel.svelte";
import { sideTools, toolId } from "./side-tools.svelte";
import { keysOf } from "./keymap.svelte";
import { pluginMenu } from "./plugin-menus";
import { parsePage, type PageBlock } from "./page-doc";
import { paneBlockType } from "./blocks";
import { getDock } from "./dock-instance";
import { embedOptions, paneIcon, type PaneSpec } from "./panes";
import { editors, lastEditorId } from "./registry";
import { toast } from "./state.svelte";
import {
  tabs, pinId, isPinned, activate, closeTab, pin, unpin, togglePin, closeOthers, closeAllTabs, moveTabBeside, moveTabToEnd, canSplit, splitRight,
  revealInTree, copyPath, renameTab, startDrag, endDrag, type TabItem, type TabGroup,
} from "./tabs.svelte";
import { toolItems, type ToolEntry } from "./toolbar";
import { readText } from "./vault-files";
import { superOf } from "./keys";

export const SIDEBAR_FILE = ".atlas/sidebar.page";
export const DEFAULT_SIDEBAR = `# The sidebar, top to bottom. Arrange it like any page (the Arrange button), or edit this text.
# Its own blocks: toolbar (items: command ids, plus the words plugins and spacer), pins, bookmarks,
# tabs. Any other block works too: outline, backlinks, files, {view: calendar, from: tasks}…
title: Sidebar
# On top the apps (Home, Email, the Library…) and the pinned tabs; then the tabs; the side panel's
# tools are the row on top of the side panel; the row at the bottom is settings and general actions.
rows:
  - [pins]
  - [bookmarks]
  - [tabs]
  - [{view: toolbar, items: [ui.new, ui.sidePanel, spacer, ui.commands, ui.settings, ui.theme]}]
`;

const blocksOf = (text: string): PageBlock[] => parsePage(text).model.rows.flatMap((r) => r.columns.flat()); // one column: a sidebar has no rows
export const sidebar = $state({ blocks: blocksOf(DEFAULT_SIDEBAR), error: "" });

async function load(): Promise<void> {
  const text = await readText(SIDEBAR_FILE);
  try { sidebar.blocks = blocksOf(text ?? DEFAULT_SIDEBAR); sidebar.error = ""; }
  catch (e) { sidebar.error = `${SIDEBAR_FILE}: ${errText(e)}`; } // keeps the last good one
}

async function arrange(): Promise<void> {
  try {
    if ((await readText(SIDEBAR_FILE)) === null) await api.putFile(SIDEBAR_FILE, DEFAULT_SIDEBAR);
    open({ kind: "page", path: SIDEBAR_FILE, title: "Sidebar" });
  } catch (e) { toast("The sidebar's file could not be written", errText(e), "error"); }
}
export const sidebarActions: Action[] = [
  { id: "ui.sidebar.arrange", title: "Sidebar: arrange its blocks…", run: () => void arrange() },
  { id: "ui.trashFile", title: "Delete this file (to the Trash)…", run: () => {
    const p = getDock()?.activePanel?.params?.path, path = typeof p === "string" ? p : editors.get(lastEditorId() ?? "")?.path;
    if (path) trashFile(path); else toast("No file here", "Open the note or file to delete first.");
  } },
];

export function initSidebar(): () => void {
  void load();
  return on("fs", (e) => { if (!e.paths.length || e.paths.includes(SIDEBAR_FILE)) void load(); });
}

/** The activity rail (horizontal tabs): the apps, the side panel's tools, then every toolbar's buttons. */
export const railItems = (): ToolEntry[][] => [
  appLaunchers().map((a): ToolEntry => ({ icon: a.icon, label: a.title, keys: a.keys, run: a.open })),
  toolItems([...SIDE_COMMANDS], undefined, { ids: SIDE_COMMANDS, add: sideTools.map((t) => ({ icon: t.icon, label: t.title, run: () => openSide(toolId(t.type)) })) }),
  ...sidebar.blocks.filter((b) => b.type === "toolbar").map((b) => toolItems(b.options.items, SIDE_COMMANDS)),
];

// --- state shared by the sidebar's blocks ---------------------------------------------------------------

export const side = $state({
  /** collapsed but shown in full as an overlay: hovered, or asked for by the keyboard (`kb`) */
  peek: false, kb: false,
  /** fullscreen: opened by a click on its empty space or by a tool that needs it; closes on a click elsewhere or Escape, not on leaving */
  held: false,
  filter: "", filtering: false, cursor: null as string | null,
  dragId: null as string | null, mark: null as { id: string; after: boolean } | null, pinMark: null as number | null,
  /** a split half a dragged tab would go into */
  into: null as string | null,
  /** the end of a section (the room under its last row) a dragged tab would go to */
  end: null as string | null,
  menu: null as MenuAt | null,
  renaming: null as string | null, renameValue: "",
});
/** Whether the sidebar shows names (false: collapsed to icons). Blocks hosted elsewhere are always wide. */
/** Icons only: as the user chose, or always in fullscreen (the saved choice is untouched): hovering opens it, except in
 *  fullscreen, where only a click on its empty space or a tool that needs it does (Sidebar.svelte). */
export const sideCollapsed = () => tabs.sidebar.collapsed || fullscreen.on;
export const sideWide = () => !sideCollapsed() || side.peek;

const match = (t: { title: string; tip: string }) => !side.filter || `${t.title} ${t.tip}`.toLowerCase().includes(side.filter.toLowerCase());
export const pinTiles = () => tabs.pins.map((p) => ({ id: pinId(p), title: p.title, icon: paneIcon(p.spec), tip: ("path" in p.spec && p.spec.path) || p.title, open: tabs.open.includes(pinId(p)) })).filter(match);
export const tabGroups = () => tabs.groups.map((g) => ({ ...g, tabs: g.tabs.filter(match) })).filter((g) => g.tabs.length || !side.filter);
/** what j/k walk: pins, then every listed row */
export const flatIds = () => [...pinTiles().map((p) => p.id), ...tabGroups().flatMap((g) => g.tabs.map((t) => t.id))];

// --- keyboard: j/k, Enter, x, p, / over pins and tabs --------------------------------------------------

const rowEl = (id: string) => document.querySelector<HTMLElement>(`[data-tab-id="${CSS.escape(id)}"]`);
const filterBox = () => document.querySelector<HTMLInputElement>(".side-filter");

export async function moveCursor(id: string | null): Promise<void> {
  side.cursor = id;
  await tick();
  if (id) { const el = rowEl(id); el?.focus({ preventScroll: true }); el?.scrollIntoView({ block: "nearest" }); }
}
function step(d: number): void {
  const flat = flatIds();
  if (!flat.length) return;
  const i = side.cursor ? flat.indexOf(side.cursor) : -1;
  void moveCursor(flat[Math.max(0, Math.min(flat.length - 1, i < 0 ? 0 : i + d))]);
}
function reset(): void { side.filtering = false; side.filter = ""; side.cursor = null; side.kb = false; side.peek = false; side.held = false; }
function leaveList(): void { reset(); if (tabs.active) focusPanel(tabs.active); }
function openCursor(id: string | null): void { if (id) { reset(); activate(id); } }

export function onListKey(e: KeyboardEvent): void {
  if (e.ctrlKey || e.altKey || superOf(e) || side.renaming) return;
  const flat = flatIds(), c = side.cursor;
  const handled = (() => {
    switch (e.key) {
      case "j": case "ArrowDown": step(1); return true;
      case "k": case "ArrowUp": step(-1); return true;
      case "g": case "Home": void moveCursor(flat[0] ?? null); return true;
      case "G": case "End": void moveCursor(flat[flat.length - 1] ?? null); return true;
      case "Enter": case "l": case "o": openCursor(c); return true;
      case "x": case "Delete": if (c) { const next = flat[flat.indexOf(c) + 1] ?? flat[flat.indexOf(c) - 1] ?? null; closeTab(c); void moveCursor(next); } return true;
      case "p": if (c) togglePin(c); return true;
      case "/": side.filtering = true; void tick().then(() => filterBox()?.focus()); return true;
      case "Escape": leaveList(); return true;
      default: return false;
    }
  })();
  if (handled) { e.preventDefault(); e.stopPropagation(); }
}
export function onFilterKey(e: KeyboardEvent): void {
  e.stopPropagation(); // typing, not shortcuts or vim
  const flat = flatIds();
  if (e.key === "Enter") { e.preventDefault(); openCursor(side.cursor ?? flat[0] ?? null); }
  else if (e.key === "Escape") { e.preventDefault(); if (side.filter) side.filter = ""; else { side.filtering = false; void moveCursor(side.cursor ?? flat[0] ?? null); } }
  else if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); step(e.key === "ArrowDown" ? 1 : -1); void tick().then(() => filterBox()?.focus()); }
}
/** Ctrl+Shift+A: the list takes the keyboard (a collapsed sidebar opens over the panes first). */
export async function takeKeyboard(): Promise<void> {
  if (tabs.sidebar.collapsed) { side.kb = true; side.peek = true; }
  await tick();
  const flat = flatIds();
  void moveCursor(tabs.active && flat.includes(tabs.active) ? tabs.active : flat[0] ?? null);
}

// --- context menu, rename ---------------------------------------------------------------------------------

/** "Embed in <note>": this tab as a live block in the note last written in (a ```view block — plain
 *  text in the note, so it can be edited or deleted like any other line). */
function embedItem(id: string): { label: string; run: () => void }[] {
  const target = lastEditorId(), note = target ? editors.get(target) : undefined;
  const spec = getDock()?.getPanel(id)?.params as PaneSpec | undefined;
  const opts = spec && embedOptions(spec);
  if (!note || !spec || !opts || target === id || !/\.(md|markdown)$/i.test(note.path)) return [];
  const lines = [`type: ${paneBlockType(spec.kind)}`, ...Object.entries(opts).map(([k, v]) => `${k}: ${/^[\w./ -]+$/.test(v) ? v : JSON.stringify(v)}`)];
  const name = shownName(note.path);
  return [{ label: `Embed in ${name}`, run: () => { note.insertBlock(["```view", ...lines, "```"].join("\n")); toast(`Embedded in ${name}`, "A view block was added after the paragraph the caret is in.", "success"); } }];
}

/** The file `path` to the Trash, after a yes;
 *  its tabs close with it. */
export function trashFile(path: string): void {
  void import("./palette.svelte").then(({ pick }) => pick({
    placeholder: `Move ${shownName(path)} to the Trash?`, tag: "Delete", icon: "close",
    items: [{ value: "yes", title: `Move ${path} to the Trash`, detail: "recoverable from the Trash", icon: "close" }, { value: "", title: "Cancel" }],
    onpick: async (v) => {
      if (!v) return;
      try {
        const r = await api.trash(path);
        for (const id of tabs.open.filter((id) => getDock()?.getPanel(id)?.params?.path === path)) closeTab(id);
        toast("Moved to " + r.to, path);
      } catch (err) { toast("Not deleted", errText(err), "error"); }
    },
  }));
}

export function openMenu(e: MouseEvent, t: { id: string; path?: string; kind?: string }): void {
  e.preventDefault();
  const isOpen = tabs.open.includes(t.id), pinned = isPinned(t.id);
  side.menu = atPointer(e, [
    { label: pinned ? "Unpin" : "Pin", icon: "pin" as const, hint: keysOf("ui.tabs.pin"), run: () => (pinned ? unpin(t.id) : pin(t.id)) },
    ...(isOpen && canSplit(t.id) ? [{ label: "Split right", icon: "panel-right" as const, run: () => splitRight(t.id) }] : []),
    ...(t.path ? [
      { label: "Reveal in file tree", icon: "files" as const, run: () => revealInTree(t.path!) },
      ...revealItems(t.path),
      { label: "Copy path", icon: "copy" as const, run: () => void copyPath(t.path!) },
    ] : []),
    ...(t.kind === "terminal" ? [{ label: "Rename…", icon: "edit" as const, run: () => startRename(t.id) }] : []),
    ...(t.path ? [{ label: "Rename file…", icon: "edit" as const, run: () => renameFile(t.path!) }] : []),
    ...embedItem(t.id),
    ...(isOpen ? ["sep" as const, { label: "Close", icon: "close" as const, hint: keysOf("ui.close"), run: () => closeTab(t.id) }, { label: "Close others in this group", run: () => closeOthers(t.id) }, { label: "Close all tabs", run: closeAllTabs }] : []),
    ...(t.path ? ["sep" as const, { label: "Move to Trash…", icon: "close" as const, danger: true, run: () => trashFile(t.path!) }] : []),
    ...pluginMenu("tab", { path: t.path, kind: t.kind }),
  ]);
}

// terminals; double-click. The double-click also activates the terminal, which takes the focus a frame
// later: take it back once, and only then let a blur (a click elsewhere) commit the name.
let renameArmed = false;
const renameBox = () => document.querySelector<HTMLInputElement>(".tab-rename");
export function startRename(id: string): void {
  const t = tabs.groups.flatMap((g) => g.tabs).find((x) => x.id === id);
  if (!t || t.kind !== "terminal") return;
  side.renaming = id; side.renameValue = t.title; renameArmed = false;
  void tick().then(() => { renameBox()?.focus(); renameBox()?.select(); });
  setTimeout(() => { if (side.renaming && document.activeElement !== renameBox()) { renameBox()?.focus(); renameBox()?.select(); } renameArmed = true; }, 80);
}
export function finishRename(keep: boolean, fromBlur = false): void {
  if (fromBlur && !renameArmed) return;
  if (side.renaming && keep) renameTab(side.renaming, side.renameValue);
  side.renaming = null;
}

// --- drag and drop: reorder tabs, move between groups, pin by dropping on the tiles -----------------------

export function dragStart(e: DragEvent, id: string): void {
  side.dragId = id;
  if (tabs.open.includes(id)) startDrag(e, id); else e.dataTransfer?.setData("text/plain", id); // a resting pin: reorder only
}
export function dragEnd(): void { side.dragId = null; side.mark = null; side.pinMark = null; side.into = null; side.end = null; endDrag(); }
/** WebKit (the desktop app) allows a drop only where `dragenter` was accepted as well as `dragover`. */
export function acceptDrag(e: DragEvent): void { if (side.dragId) e.preventDefault(); }
// WebKitGTK may send no `dragend` after a drop elsewhere: the row would stay "being dragged". Any
// drop, or the next press of a button, ends a drag that is still marked.
if (typeof window !== "undefined") {
  window.addEventListener("drop", () => { if (side.dragId) setTimeout(dragEnd, 0); }, true); // after the row's own drop handler
  window.addEventListener("pointerdown", () => { if (side.dragId) dragEnd(); }, true);
}
export function rowOver(e: DragEvent, id: string): void {
  if (!side.dragId) return;
  e.preventDefault();
  side.into = null; side.end = null;
  const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
  side.mark = { id, after: e.clientY > r.top + r.height / 2 };
}
/** Over a half of a split row: the tab would join that half's group, shown there. */
export function halfOver(e: DragEvent, id: string): void {
  if (!side.dragId) return;
  e.preventDefault();
  side.mark = null;
  side.into = id === side.dragId ? null : id;
}
export function rowDrop(e: DragEvent, g: TabGroup, t: TabItem): void {
  const id = side.dragId, mark = side.mark;
  if (!id || !mark) return;
  e.preventDefault();
  if (isPinned(id)) unpin(id);
  if (tabs.open.includes(id) && id !== t.id) moveTabBeside(id, t.id, mark.after);
  dragEnd();
}
export function groupDrop(e: DragEvent, g: TabGroup): void {
  const id = side.dragId;
  if (!id) return;
  e.preventDefault();
  if (isPinned(id)) unpin(id);
  if (tabs.open.includes(id)) { moveTabToEnd(id, g.id); activate(id); }
  dragEnd();
}
export function pinsOver(e: DragEvent): void {
  if (!side.dragId) return;
  e.preventDefault();
  const tiles = [...(e.currentTarget as HTMLElement).querySelectorAll<HTMLElement>(".pin")];
  const i = tiles.findIndex((el) => { const r = el.getBoundingClientRect(); return e.clientY < r.bottom && (e.clientX < r.left + r.width / 2 || e.clientY < r.top); });
  side.pinMark = i < 0 ? tiles.length : i;
}
export function pinsDrop(e: DragEvent): void {
  const id = side.dragId;
  if (!id) return;
  e.preventDefault();
  const from = tabs.pins.findIndex((p) => pinId(p) === id);
  const at = side.pinMark ?? tabs.pins.length;
  pin(id, from >= 0 && from < at ? at - 1 : at);
  dragEnd();
}

export const middleClose = (e: MouseEvent, id: string) => { if (e.button === 1) { e.preventDefault(); closeTab(id); } };
/** collapsed file tabs: two letters tell them apart where the icons are all alike */
export const monogram = (title: string) => { const s = title.replace(/\.[^.]+$/, "").replace(/[^\p{L}\p{N}]/gu, ""); return (s[0] ?? "?").toUpperCase() + (s[1] ?? "").toLowerCase(); };
