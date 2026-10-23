// Bookmarks (docs/guides/SHELL.md): `.atlas/bookmarks.yaml`, a plain file of the vault.
//   pins:       the tiles at the top of the sidebar (Ctrl+1…8 reach them)
//   bookmarks:  a list for the sidebar and the palette; each is also a command (`bookmark.<name>`),
//               so it can have a shortcut
// An entry is a file path, or one of
//   {path: notes/x.md, heading: Results}   {view: library}   {search: "tag:todo"}
//   {command: workspace.Read paper}        {url: https://arxiv.org}          — each may say `title:`
import { errText } from "./text";
import { shownName } from "./paths";
import { parseDocument, parse as parseYaml, stringify, type Document } from "yaml";
import type { Action } from "./actions";
import { api } from "./api";
import { blockTab, paneBlockType } from "./blocks";
import { on } from "./bus";
import { context } from "./context.svelte";
import { getDock, open, openPath } from "./dock";
import { addCommands, allCommands, setCommands } from "./keymap.svelte";
import { resolveSpec } from "./openers";
import { pick, type PickItem } from "./palette.svelte";
import { paneIcon, paneId, paneTitle, type IconName, type PaneSpec } from "./panes";
import { drop, KEYS, load } from "./prefs";
import { toast } from "./state.svelte";
import { readText } from "./vault-files";

export const BOOKMARKS_FILE = ".atlas/bookmarks.yaml";
const HEADER = `# Bookmarks of this vault (Atlas reads and writes this file; edit it freely).
# pins: the tiles at the top of the sidebar. bookmarks: listed in the sidebar and the palette;
# each is also a command, so it can have a shortcut (Settings → Keyboard).
# An entry is a file path, or {path:, heading:} {view: library} {search: "…"} {command: id} {url: …},
# each with an optional title.
pins: []
bookmarks: []
`;

/** What a bookmark points at — a closed set: a new kind must be handled in every switch below. */
export type Target =
  | { kind: "file"; path: string; heading?: string }
  | { kind: "view"; view: string; options: Record<string, unknown> }
  | { kind: "search"; q: string }
  | { kind: "command"; id: string }
  | { kind: "url"; url: string };
export interface Bookmark { target: Target; title?: string }
/** A pinned tab: a bookmark that opens a pane, with the pane resolved. */
export interface Pin { spec: PaneSpec; title: string }

export const bookmarks = $state({ list: [] as Bookmark[] });
let pins: Pin[] = [];
let doc: Document = parseDocument(HEADER);
let known = ""; // the file's text as last read or written: the same text again is not news, and is not written
const pinWatchers = new Set<(pins: Pin[]) => void>();

// --- the file's entries <-> bookmarks -------------------------------------------------------------

const str = (v: unknown) => (typeof v === "string" && v ? v : undefined);

function readEntry(v: unknown): Bookmark | null {
  if (typeof v === "string") return v ? { target: { kind: "file", path: v } } : null;
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const { title, path, heading, view, search, command, url, ...rest } = v as Record<string, unknown>;
  const t = str(title);
  if (str(view)) return { title: t, target: { kind: "view", view: str(view)!, options: { ...(path === undefined ? {} : { path }), ...rest } } };
  if (str(path)) return { title: t, target: { kind: "file", path: str(path)!, heading: str(heading) } };
  if (str(search)) return { title: t, target: { kind: "search", q: str(search)! } };
  if (str(command)) return { title: t, target: { kind: "command", id: str(command)! } };
  if (str(url)) return { title: t, target: { kind: "url", url: str(url)! } };
  return null;
}

function writeEntry(b: Bookmark): unknown {
  const title = b.title ? { title: b.title } : {};
  const t = b.target;
  switch (t.kind) {
    case "file": return !b.title && !t.heading ? t.path : { path: t.path, ...(t.heading ? { heading: t.heading } : {}), ...title };
    case "view": return { view: t.view, ...t.options, ...title };
    case "search": return { search: t.q, ...title };
    case "command": return { command: t.id, ...title };
    case "url": return { url: t.url, ...title };
  }
}

/** The pane a bookmark opens (a command opens none). The title travels as an option: a pinned
 *  terminal or page keeps its name. */
export function bookmarkSpec(b: Bookmark): PaneSpec | null {
  const t = b.target;
  switch (t.kind) {
    case "file": return resolveSpec(t.path);
    case "view": {
      const { doc: of, ...options } = t.options;
      return blockTab(stringify({ type: t.view, ...options, ...(b.title ? { title: b.title } : {}) }), str(of) ?? "", b.title);
    }
    case "search": return { kind: "search", q: t.q };
    case "url": return { kind: "web", url: t.url };
    case "command": return null;
  }
}

/** The bookmark for an open pane: a file path when the file opens that way by itself, else the
 *  pane as a block (`{view: terminal, n: 2}`). */
export function bookmarkOf(spec: PaneSpec, title?: string): Bookmark {
  const named = title && title !== paneTitle(spec) ? title : undefined;
  if ("path" in spec && spec.path && paneId(resolveSpec(spec.path)) === paneId(spec)) return { title: named, target: { kind: "file", path: spec.path } };
  if (spec.kind === "web") return { title: named, target: { kind: "url", url: spec.url } };
  if (spec.kind === "search" && spec.q) return { title: named, target: { kind: "search", q: spec.q } };
  if (spec.kind === "block") {
    const { type, ...options } = (parseYaml(spec.src) ?? {}) as Record<string, unknown>;
    return { title: spec.title ?? named, target: { kind: "view", view: str(type) ?? "list", options: { ...options, ...(spec.doc ? { doc: spec.doc } : {}) } } };
  }
  const { kind, ...options } = spec;
  const { title: own, ...rest } = options as Record<string, unknown>;
  return { title: str(own) ?? named, target: { kind: "view", view: paneBlockType(kind), options: rest } };
}

export function bookmarkTitle(b: Bookmark): string {
  if (b.title) return b.title;
  const t = b.target;
  switch (t.kind) {
    case "file": return t.heading ? `${shownName(t.path)} › ${t.heading}` : shownName(t.path);
    case "search": return `Search: ${t.q}`;
    case "command": return allCommands().find((c) => c.id === t.id)?.title ?? t.id;
    case "view":
    case "url": { const s = bookmarkSpec(b); return s ? paneTitle(s) : ""; }
  }
}

export function bookmarkIcon(b: Bookmark): IconName {
  const t = b.target;
  if (t.kind === "command") return "command";
  if (t.kind === "search") return "search";
  const s = bookmarkSpec(b);
  return s ? paneIcon(s) : "file";
}

/** What the file says about an entry, for a tooltip or a chooser's detail line. */
export function bookmarkDetail(b: Bookmark): string {
  const t = b.target;
  switch (t.kind) {
    case "file": return t.heading ? `${t.path} # ${t.heading}` : t.path;
    case "view": return `view: ${t.view}`;
    case "search": return "saved search";
    case "command": return `command: ${t.id}`;
    case "url": return t.url;
  }
}

async function headingLine(path: string, heading: string): Promise<number | undefined> {
  const text = await readText(path);
  const i = text?.split("\n").findIndex((l) => /^#{1,6}\s/.test(l) && l.replace(/^#+\s+/, "").trim() === heading) ?? -1;
  return i < 0 ? undefined : i + 1;
}

export async function openBookmark(b: Bookmark): Promise<void> {
  const t = b.target;
  if (t.kind === "command") {
    const c = allCommands().find((x) => x.id === t.id);
    if (c) await c.run(); else toast("That command is gone", `${t.id} (in ${BOOKMARKS_FILE})`, "error");
  } else if (t.kind === "file") openPath(t.path, t.heading ? await headingLine(t.path, t.heading) : undefined);
  else { const s = bookmarkSpec(b); if (s) open(s); }
}

// --- the file ---------------------------------------------------------------------------------------

const entries = (key: string): Bookmark[] => {
  const v = (doc.toJS() ?? {})[key];
  return (Array.isArray(v) ? v : []).map(readEntry).filter((b): b is Bookmark => !!b);
};
const toPin = (b: Bookmark): Pin | null => { const spec = bookmarkSpec(b); return spec ? { spec, title: b.title ?? paneTitle(spec) } : null; };

function publish(): void {
  bookmarks.list = entries("bookmarks");
  pins = entries("pins").map(toPin).filter((p): p is Pin => !!p);
  for (const f of pinWatchers) f(pins);
  setCommands(PREFIX, bookmarks.list.map((b): Action => ({ id: `${PREFIX}${slug(bookmarkTitle(b))}`, title: `Bookmark: ${bookmarkTitle(b)}`, run: () => openBookmark(b) })));
}

async function loadFile(): Promise<void> {
  const text = await readText(BOOKMARKS_FILE);
  if (text !== null && text === known) return;
  const next = parseDocument(text ?? HEADER);
  if (next.errors.length) { toast("Bookmarks file not read", `${BOOKMARKS_FILE}: ${next.errors[0].message}`, "error", 9000); return; }
  doc = next;
  known = text ?? "";
  publish();
}

/** Puts one list back into the YAML document (the comments above the keys stay) and saves it. */
async function writeList(key: "pins" | "bookmarks", list: Bookmark[]): Promise<void> {
  const node = doc.createNode(list.map(writeEntry));
  doc.set(key, node);
  const text = doc.toString({ lineWidth: 0, flowCollectionPadding: false });
  // nothing to say: no write, and no publish — a watcher that saves on every publish would loop
  if (text === known) return;
  known = text;
  publish();
  try { await api.putFile(BOOKMARKS_FILE, text); }
  catch (e) { known = ""; toast("Bookmarks not saved", errText(e), "error"); }
}

/** The pinned tabs, now and whenever the file changes. */
export function onPins(fn: (pins: Pin[]) => void): () => void {
  pinWatchers.add(fn);
  fn(pins);
  return () => pinWatchers.delete(fn);
}
export const savePins = (list: Pin[]) => writeList("pins", list.map((p) => bookmarkOf(p.spec, p.title)));

export function addBookmark(b: Bookmark): void {
  const same = (x: Bookmark) => JSON.stringify(writeEntry(x)) === JSON.stringify(writeEntry(b));
  if (bookmarks.list.some(same)) { toast("Already bookmarked", bookmarkTitle(b)); return; }
  void writeList("bookmarks", [...bookmarks.list, b]);
  toast("Bookmarked", `${bookmarkTitle(b)} — it is in the sidebar and the palette (${BOOKMARKS_FILE})`, "success");
}
export const removeBookmark = (b: Bookmark) => writeList("bookmarks", bookmarks.list.filter((x) => x !== b));

// --- commands -----------------------------------------------------------------------------------------

const PREFIX = "bookmark.";
const slug = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "") || "untitled";

/** Bookmark what is in front of the user: the tab, the heading under the caret, or a typed search / link. */
function askAdd(): void {
  const panel = getDock()?.activePanel;
  const spec = panel?.params as PaneSpec | undefined;
  const sec = context.section;
  const found = new Map<string, Bookmark>();
  if (spec) found.set("tab", bookmarkOf(spec, panel?.title));
  if (sec?.heading) found.set("heading", { target: { kind: "file", path: sec.path, heading: sec.heading } });
  const items: PickItem[] = [...found].map(([value, b]) => ({ value, title: `Bookmark ${value === "tab" ? "this tab" : "this heading"}: ${bookmarkTitle(b)}`, detail: bookmarkDetail(b), icon: bookmarkIcon(b) }));
  pick({
    placeholder: "Bookmark this tab or heading — or type a search or a web address to keep…", tag: "Bookmark", icon: "pin",
    items,
    typed: (t) => (/^https?:\/\//.test(t) ? `Bookmark the page ${t}` : `Save the search “${t}”`),
    onpick: (v, isNew) => {
      const b = isNew ? (/^https?:\/\//.test(v) ? { target: { kind: "url" as const, url: v } } : { target: { kind: "search" as const, q: v } }) : found.get(v);
      if (b) addBookmark(b);
    },
  });
}

function askOpen(): void {
  const list = bookmarks.list;
  pick({
    placeholder: "Open a bookmark…", tag: "Bookmarks", icon: "pin",
    items: [
      ...list.map((b, i) => ({ value: `open:${i}`, title: bookmarkTitle(b), detail: bookmarkDetail(b), icon: bookmarkIcon(b), section: "Bookmarks" })),
      ...(list.length ? [] : [{ value: "", title: "No bookmarks yet", detail: "Run “Bookmark: add…” on a tab, a heading or a search" }]),
      ...list.map((b, i) => ({ value: `remove:${i}`, title: `Remove ${bookmarkTitle(b)}`, icon: "close" as const, section: "Manage" })),
      { value: "edit", title: "Edit the bookmarks file", detail: BOOKMARKS_FILE, icon: "edit" as const, section: "Manage" },
    ],
    onpick: (v) => {
      if (v === "edit") return void editBookmarks();
      const [what, i] = v.split(":");
      const b = list[Number(i)];
      if (b && what === "open") void openBookmark(b);
      else if (b && what === "remove") void removeBookmark(b);
    },
  });
}

/** Opens the file as text (written first, with its explaining header, when it is not there yet). */
export async function editBookmarks(): Promise<void> {
  if ((await readText(BOOKMARKS_FILE)) === null) await api.putFile(BOOKMARKS_FILE, doc.toString({ lineWidth: 0 }));
  open({ kind: "editor", path: BOOKMARKS_FILE });
}

const fixed: Action[] = [
  { id: "ui.bookmark.add", title: "Bookmark: add this tab, heading or search…", keys: "Ctrl+Alt+B", run: askAdd },
  { id: "ui.bookmarks", title: "Bookmarks: open…", keys: "Ctrl+Shift+B", icon: "pin", label: "Bookmarks", run: askOpen },
  { id: "ui.bookmarks.edit", title: "Bookmarks: edit the file", run: () => void editBookmarks() },
];

/** Reads the file and follows it. Pins kept in the browser by older versions move into the file once. */
export function initBookmarks(): () => void {
  addCommands(fixed);
  void loadFile().then(() => {
    const legacy = load<Pin[]>(KEYS.pins, []);
    drop(KEYS.pins);
    if (legacy.length && !pins.length) void savePins(legacy);
  });
  return on("fs", (e) => { if (!e.paths.length || e.paths.includes(BOOKMARKS_FILE)) void loadFile(); });
}
