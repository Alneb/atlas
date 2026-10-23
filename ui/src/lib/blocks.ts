// The block registry (docs/refactor/REFACTOR-blocks.md): ONE map of everything Atlas can draw. A block mounts
// into any host — a ```view block in a note, a `.page`, or a tab of its own — so the Library, a PDF,
// a terminal or a calendar are the same kind of thing and go wherever the user puts them.
//   - built-in blocks: Today's parts, settings, saved search, tool drafts
//   - every pane kind (library, git, pdf, editor, terminal…), through one adapter
//   - plugin blocks (`atlas.registerBlock`)
//   - anything else is a row view (list, table, calendar: lib/views.ts) fed by the core's /api/view
import { errText } from "./text";
import { hydrateFences } from "./fences";
import { mount, unmount, type Component } from "svelte";
import { parse as parseYaml } from "yaml";
import type { DockviewPanelApi } from "dockview-core";
import { api } from "./api";
import { on } from "./bus";
import { open, type PaneProps } from "./dock";
import { iconSvg } from "./icons";
import { paneComponents } from "./pane-components";
import { PANE_KINDS, blockType, paneIcon, paneId, paneTitle, specFromOptions, type IconName, type PaneKind, type PaneSpec } from "./panes";
import { renderView, rowViewTypes } from "./views";
import { BUILTIN_FIELDS, ROW_VIEW_FIELDS, type OptionField } from "./block-options";
import type { ViewRow } from "./gen/ViewRow";
import { lineOf, scopeAt, type Props } from "./section-props";
import TodayParts, { type TodayPart } from "../components/TodayParts.svelte";

/** Where a block is drawn: inside a note, on a page, alone in a tab, or in the sidebar. */
export type BlockHost = "note" | "page" | "tab" | "side";

export interface BlockCtx {
  /** The block's YAML, and the same parsed ({} when it does not parse). */
  src: string;
  options: Record<string, unknown>;
  /** The note or page holding the block: what "this section", `this.file` and frontmatter refer to. */
  doc: string;
  host: BlockHost;
  /** The block's title changed (an embedded pane names its file). */
  setTitle(title: string): void;
  /** What the block's place in its document knows: the note's frontmatter and the `key:: value`
   *  properties of the section around the block (lib/section-props.ts). {} outside a note. */
  props(): Promise<Props>;
}

export interface Block {
  /** What `type:` / `view:` says. */
  type: string;
  title: string;
  icon?: IconName;
  /** Height in px when embedded, for blocks that fill their box (panes). Others size to their content. */
  height?: number;
  /** Content that reads best on a card surface in a page (a note, a table); others bring their own look. */
  card?: boolean;
  /** The block shows a file: adding it asks which one (`true`: any file, or a pattern on the path). */
  file?: RegExp | true;
  /** The pane "Open as tab" opens instead of this block alone (an embedded PDF opens the PDF pane). */
  tab?(ctx: BlockCtx): PaneSpec | null;
  /** What it can be told, as form fields (lib/block-options.ts): the page's "Options…" form. */
  options?: OptionField[];
  /** A part of the shell (toolbar, tab list): never framed, no "open as a tab" button. */
  bare?: boolean;
  mount(host: HTMLElement, ctx: BlockCtx): void | (() => void);
}

const registry = new Map<string, Block>();
const watchers = new Map<string, Set<() => void>>();
const pending = new Set<string>();

/** Adds (or replaces) a block type; returns the undo. Blocks already on screen redraw. */
export function registerBlock(b: Block): () => void {
  registry.set(b.type, b);
  changed(b.type);
  return () => { if (registry.get(b.type) === b) { registry.delete(b.type); changed(b.type); } };
}
export const blockTypes = () => [...registry.keys(), ...rowViewTypes()];
export const allBlocks = () => [...registry.values()];
export const getBlock = (type: string) => registry.get(type);
/** The form fields of a block type: its own, a built-in's, or the row views' shared ones. */
export const optionFields = (type: string): OptionField[] =>
  registry.get(type)?.options ?? BUILTIN_FIELDS[type] ?? (rowViewTypes().includes(type) ? ROW_VIEW_FIELDS : []);

// deferred: a plugin re-registering unregisters then registers in one go — draw once, with the new code
function changed(type: string): void {
  if (pending.has(type)) return;
  pending.add(type);
  queueMicrotask(() => { pending.delete(type); for (const f of [...(watchers.get(type) ?? [])]) f(); });
}
function onChange(type: string, f: () => void): () => void {
  const set = watchers.get(type) ?? new Set();
  watchers.set(type, set);
  set.add(f);
  return () => set.delete(f);
}

// --- built-in blocks ----------------------------------------------------------------------------

export const svelteBlock = (type: string, title: string, C: Component<never>, props: (ctx: BlockCtx) => Record<string, unknown>): Block => ({
  type, title,
  mount(host, ctx) {
    const app = mount(C as Component<Record<string, unknown>>, { target: host, props: props(ctx) });
    return () => void unmount(app);
  },
});

// Components that pull in the app's actions load on first use (and stay out of an import cycle).
const lazyBlock = (type: string, title: string, load: () => Promise<{ default: unknown }>, props: (ctx: BlockCtx) => Record<string, unknown>): Block => ({
  type, title,
  mount(host, ctx) {
    let app: ReturnType<typeof mount> | undefined;
    let gone = false;
    void load().then((m) => { if (!gone) app = mount(m.default as Component<Record<string, unknown>>, { target: host, props: props(ctx) }); });
    return () => { gone = true; if (app) void unmount(app); };
  },
});

const TODAY_PARTS: Record<TodayPart, string> = { greeting: "Greeting", capture: "Capture", focus: "Focus", log: "Today's log", tasks: "Open tasks", activity: "Activity" };
/** A day's log (its name or path has the day): its Activity block shows that day, as the old Obsidian log's base did. */
const dayOfDoc = (doc?: string) => /(\d{4}-\d{2}-\d{2})[^/]*\.md$/.exec(doc ?? "")?.[1];
for (const [p, title] of Object.entries(TODAY_PARTS)) registerBlock(svelteBlock(p, title, TodayParts as Component<never>, (c) => ({ parts: [p], day: p === "activity" ? dayOfDoc(c.doc) : undefined })));
registerBlock(lazyBlock("settings", "Settings page", () => import("../components/settings/SettingsBlock.svelte"), (c) => ({ src: c.src })));
registerBlock(lazyBlock("search", "Saved search", () => import("../components/views/SearchBlock.svelte"), (c) => ({ src: c.src })));
registerBlock({ ...lazyBlock("review", "Review (notes waiting, one at a time)", () => import("../components/views/Review.svelte"), (c) => ({ src: c.src, doc: c.doc })), icon: "check", card: true });
registerBlock(lazyBlock("tags", "Tags (every tag, its notes)", () => import("../components/views/Tags.svelte"), () => ({})));
registerBlock(lazyBlock("suggestions", "Drafted for you", () => import("../components/ToolDrafts.svelte"), () => ({ compact: true })));

// --- every pane is a block ------------------------------------------------------------------------

// Three pane kinds share a name with an older, lighter block (a saved search's results, one settings
// page, a table of rows): the block keeps the name that files already use, the pane gets its own.
const PANE_BLOCK_TYPE: Partial<Record<PaneKind, string>> = { search: "search-pane", settings: "settings-pane", table: "file-table" };
/** The block type a pane kind is embedded (and bookmarked) as. */
export const paneBlockType = (kind: PaneKind) => PANE_BLOCK_TYPE[kind] ?? kind;
// pane kinds that show a file, and which files (asked for when the block is added by hand)
const PANE_FILES: Partial<Record<PaneKind, RegExp | true>> = {
  editor: true, pdf: /\.pdf$/i, image: /\.(png|jpe?g|gif|svg|webp|avif|bmp)$/i, table: /\.(tsv|csv|tab|dat|txt)$/i,
  page: /\.page$/i, excalidraw: /\.excalidraw(\.md)?$/i,
};
const EMBED_HEIGHT = 420;
let embeds = 0;

/** What an embedded pane gets instead of its dockview tab: the few members panes use. */
function embedPanel(spec: PaneSpec, el: HTMLElement, setTitle: (t: string) => void): DockviewPanelApi {
  const id = `${paneId(spec)}@embed${++embeds}`; // unique: the same file may also be open in a tab
  const shim = {
    id,
    title: paneTitle(spec),
    /** "active" = the keyboard is inside it: an embedded editor never takes the focus on load */
    get isActive() { return el.contains(document.activeElement); },
    setTitle,
    updateParameters() { /* an embed's parameters are its YAML */ },
    onDidActiveChange: () => ({ dispose() {} }),
    close() { /* closing an embed = removing its block from the document */ },
  };
  return shim as unknown as DockviewPanelApi;
}

function paneBlock(kind: PaneKind): Block {
  const sample = { kind } as PaneSpec; // only for the generic title and icon of the kind
  const specOf = (ctx: BlockCtx) => specFromOptions(kind, ctx.options);
  return {
    type: paneBlockType(kind),
    title: kind[0].toUpperCase() + kind.slice(1),
    icon: kind === "plugin" || kind === "editor" ? "file-text" : paneIcon(sample),
    height: EMBED_HEIGHT,
    file: PANE_FILES[kind],
    tab: (ctx) => { const s = specOf(ctx); return typeof s === "string" ? null : s; },
    mount(host, ctx) {
      const spec = specOf(ctx);
      if (typeof spec === "string") { message(host, "view-error", spec); return; }
      host.classList.add("atlas-pane", `atlas-pane-${kind}`);
      ctx.setTitle(paneTitle(spec));
      let app: ReturnType<typeof mount> | undefined;
      let gone = false;
      (paneComponents[kind] as () => Promise<{ default: Component<PaneProps<PaneKind>> }>)().then(
        (m) => { if (!gone) app = mount(m.default, { target: host, props: { spec, panel: embedPanel(spec, host, ctx.setTitle) } as PaneProps<PaneKind> }); },
        (e) => message(host, "view-error", `Could not load the ${kind} block: ${errText(e)}`),
      );
      return () => { gone = true; if (app) void unmount(app); };
    },
  };
}
for (const k of PANE_KINDS) if (k !== "block") registerBlock(paneBlock(k));

// --- content blocks: a note, some text, a database table — light, read in place ---------------------
const str = (v: unknown) => (typeof v === "string" ? v : "");
registerBlock({
  ...lazyBlock("note", "Note", () => import("../components/blocks/NoteBlock.svelte"), (c) => ({ path: str(c.options.path), section: str(c.options.section) })),
  icon: "file-text", card: true, file: /\.(md|markdown)$/i,
  tab: (c) => (str(c.options.path) ? { kind: "editor", path: str(c.options.path) } : null),
});
registerBlock({ ...lazyBlock("text", "Text", () => import("../components/blocks/NoteBlock.svelte"), (c) => ({ text: str(c.options.text), doc: c.doc })), icon: "edit", card: true });
// a Library entry with its PDF: the head of every reading note (`<citekey>.md`; docs/guides/ZOTERO.md)
registerBlock({
  ...lazyBlock("library.paper", "Paper (from the Library)", () => import("../components/blocks/PaperBlock.svelte"), (c) => ({ doc: c.doc, options: c.options, props: c.props })),
  icon: "library", card: true,
});
// `base` embedded is the table alone (the Base pane adds a header); as a tab it is the pane
registerBlock({
  ...lazyBlock("base", "Database", () => import("../components/BaseTable.svelte"), (c) => ({ path: str(c.options.path), view: str(c.options.table) || undefined, thisPath: c.doc, embedded: true })),
  icon: "table", card: true, file: /\.base$/i,
  tab: (c) => (str(c.options.path) ? { kind: "base", path: str(c.options.path) } : null),
});

// --- mounting -------------------------------------------------------------------------------------

function message(host: HTMLElement, cls: string, text: string): void {
  host.replaceChildren(Object.assign(document.createElement("p"), { className: cls, textContent: text }));
}

function parseOptions(src: string): Record<string, unknown> {
  try { const v = parseYaml(src); return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {}; }
  catch { return {}; }
}

// the last rows of each row view (document + YAML): a remount (scrolling, re-render) draws at once
const lastRows = new Map<string, { type: string; rows: ViewRow[] }>();

/** A row view (list, table, calendar…): rows from the core, cached first, refreshed on file events. */
function mountRows(body: HTMLElement, doc: string, src: string): () => void {
  const key = `${doc}\n${src}`;
  let clean = () => {};
  let t: ReturnType<typeof setTimeout> | undefined;
  let shown = ""; // what THIS element draws (the shared cache may be newer than it)
  const draw = (r: { type: string; rows: ViewRow[] }) => {
    shown = JSON.stringify(r);
    clean();
    body.replaceChildren();
    clean = renderView(body, { ...r, options: parseOptions(src), refresh: () => void load() });
  };
  const cached = lastRows.get(key);
  if (cached) draw(cached);
  const load = async () => {
    try {
      const r = await api.view(doc, src);
      const next = { type: r.kind, rows: r.rows };
      lastRows.set(key, next);
      if (JSON.stringify(next) !== shown) draw(next); // unchanged: keep the DOM
    } catch (e) { message(body, "view-error", errText(e)); }
  };
  void load();
  const off = on("fs", (e) => {
    if (!e.paths.length || e.paths.some((p) => p.endsWith(".md") || p.endsWith(".base"))) { clearTimeout(t); t = setTimeout(load, 400); }
  });
  return () => { off(); clean(); clearTimeout(t); };
}

/** Draws one block (its YAML `src`, in the context of document `doc`) into `el`; returns the cleanup.
 *  A block is its own island: keys and clicks inside it never reach an editor around it. Embedded
 *  blocks get a quiet "open as tab" button; a block already in a tab does not. */
export function mountBlock(el: HTMLElement, doc: string, src: string, host: BlockHost = "note"): () => void {
  for (const ev of ["keydown", "keyup", "keypress", "beforeinput", "input", "mousedown", "paste", "cut", "copy"]) el.addEventListener(ev, (e) => e.stopPropagation());
  el.classList.add("atlas-block");
  const type = blockType(src);
  const body = document.createElement("div");
  body.className = "block-body";
  let title = "";
  const ctx: BlockCtx = { src, options: parseOptions(src), doc, host, setTitle: (t) => { title = t; }, props: () => docProps(doc, src) };
  const pop = host === "tab" || registry.get(type)?.bare ? null : popButton(() => open(blockTab(src, doc, title)));
  el.replaceChildren(body, ...(pop ? [pop] : []));

  let clean = () => {};
  const draw = () => {
    clean();
    clean = () => {};
    const b = registry.get(type);
    // a dotted type is a plugin's: wait for it to register, redraw when it re-registers (hot reload)
    if (!b && type.includes(".")) { el.classList.add("own"); message(body, "view-wait", `Waiting for the plugin that draws “${type}”…`); return; }
    if (!b) { el.classList.remove("own"); clean = mountRows(body, doc, src); return; }
    el.classList.add("own");
    el.classList.toggle("framed", !!b.height && host !== "tab");
    const h = Number(ctx.options.height) || b.height;
    body.style.height = h && host !== "tab" ? `${h}px` : host === "tab" && b.height ? "100%" : "";
    body.replaceChildren();
    body.className = "block-body";
    try { clean = b.mount(body, ctx) ?? (() => {}); } // a throwing block shows its error, never breaks the document
    catch (e) { message(body, "view-error", `${type}: ${errText(e)}`); }
  };
  draw();
  const off = onChange(type, draw);
  return () => { off(); clean(); };
}

/** The tab a block opens as: its own pane when it has one (a PDF block → the PDF pane), else the
 *  block alone in a tab. */
export function blockTab(src: string, doc: string, title?: string): PaneSpec {
  const type = blockType(src);
  const b = registry.get(type);
  return b?.tab?.({ src, options: parseOptions(src), doc, host: "tab", setTitle() {}, props: () => docProps(doc, src) }) ?? { kind: "block", src, doc, title: title || b?.title || type };
}

/** A block finds itself in its note by its own YAML, and reads what that place knows. */
async function docProps(doc: string, src: string): Promise<Props> {
  if (!/\.(md|markdown)$/i.test(doc)) return {};
  try { const text = (await api.file(doc)).text; return scopeAt(text, lineOf(text, src)).props; }
  catch { return {}; }
}

function popButton(run: () => void): HTMLButtonElement {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "block-pop";
  b.title = "Open as a tab";
  b.setAttribute("aria-label", "Open this block as a tab");
  b.innerHTML = iconSvg("panel-right", 13);
  b.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); run(); });
  return b;
}

/** Mounts every not-yet-mounted ```view block under `root` (a rendered piece of the note `doc`). → unmounts them,
 *  for the owner to call when that piece goes (a widget destroyed, a re-render). Not on `isConnected`: a hidden
 *  tab's DOM is detached (dockview `onlyWhenVisible`) and must come back with its views drawn. */
export function hydrateBlocks(root: HTMLElement, doc: string): () => void {
  const cleans: (() => void)[] = [];
  for (const el of root.querySelectorAll<HTMLElement>(".view-block:not([data-mounted])")) {
    el.dataset.mounted = "1";
    const clean = mountBlock(el, doc, el.dataset.src ?? "");
    cleans.push(() => { clean(); delete el.dataset.mounted; });
  }
  hydrateFences(root, doc, (source) => docProps(doc, source), (clean) => cleans.push(clean)); // code fences a plugin draws (lib/fences.ts)
  return () => cleans.splice(0).forEach((c) => c());
}
