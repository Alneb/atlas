// The dockview-core host: pane mounting, opening/focusing panes, layout persistence.
import { onWide } from "./phone.svelte";
import {
  createDockview,
  type DockviewApi,
  type DockviewPanelApi,
  type ITabRenderer,
  type IWatermarkRenderer,
  type IHeaderActionsRenderer,
  type IGroupHeaderProps,
  type TabPartInitParameters,
  type AddPanelOptions,
  type IDockviewPanel,
} from "dockview-core";
import { mount, unmount } from "svelte";
import { basename, paneId, paneIcon, paneTitle, paneZone, specZone, type PaneKind, type PaneSpec, type SpecOf } from "./panes";
import { getDock, setDock, kindOf, panelZone, zoneGroup } from "./dock-instance";
import { besideActive, placement, reveal, hidePanel, setContentVisible, constrainTerminal, placeTerminalPanel, keepShape, nextTerminalN, noteToolSizes } from "./dock-panels";
import { canStep, jumpTo, noteVisit, stepHistory, visits } from "./nav-history";
import { travelSign } from "./nav-signs";
import { isSideKind, showSide, sideInBar, sidePanel, toggleSide, type SideId, type SideKind } from "./side-panel.svelte";
import { TOOL, sideToolOf, sideTools, toolId } from "./side-tools.svelte";
import { emitPluginEvent } from "./plugin-events";
import { drawingPages, editors, noteEditorActive, shownHooks, openIntent, paneFocus, explorerGo, parkOf, pdfPages, pluginAnchors, terminals } from "./registry";
import { rememberFile } from "./recent";
import { app } from "./state.svelte";
import { iconSvg } from "./icons";
import { setPanes } from "./context.svelte";
import { onSettings } from "./settings.svelte";
import { resolveSpec } from "./openers";
import { api } from "./api";
import type { PaneRef } from "./types";
import { shownPath } from "./paths";
import { isApp } from "./apps.svelte";
import { SveltePane, setOpening, type AnyLoader, type PaneComponents } from "./pane-host";

export type { PaneProps, PaneComponents } from "./pane-host";

export { getDock, kindOf } from "./dock-instance";
export { dockTerminal, nextTerminalN } from "./dock-panels";

/** Tab: kind icon, title, unsaved dot that turns into the close button on hover. */
class AtlasTab implements ITabRenderer {
  readonly element = document.createElement("div");
  private off: (() => void)[] = [];
  private stopDirty: (() => void) | null = null;
  init(p: TabPartInitParameters): void {
    const spec = p.params as PaneSpec;
    this.element.className = "atlas-tab";
    this.element.title = "path" in spec && spec.path ? spec.path : "url" in spec ? spec.url : paneTitle(spec);
    const icon = document.createElement("span");
    icon.className = "atlas-tab-icon";
    icon.innerHTML = iconSvg(paneIcon(spec));
    const title = document.createElement("span");
    title.className = "atlas-tab-title";
    title.textContent = p.api.title ?? paneTitle(spec);
    const close = document.createElement("button");
    close.className = "atlas-tab-close";
    close.title = "Close (Super+Q, Ctrl+W)";
    close.innerHTML = iconSvg("close");
    close.addEventListener("pointerdown", (e) => e.stopPropagation());
    close.addEventListener("click", (e) => { e.stopPropagation(); void closePanel(p.api); });
    // the middle button closes the tab — without first making it active (which mounted its pane only to close it)
    this.element.addEventListener("pointerdown", (e) => { if (e.button === 1) { e.preventDefault(); e.stopPropagation(); } });
    this.element.addEventListener("mousedown", (e) => { if (e.button === 1) e.preventDefault(); }); // no autoscroll
    this.element.addEventListener("auxclick", (e) => { if (e.button === 1) void closePanel(p.api); });
    this.element.append(icon, title, close);
    if (spec.kind === "terminal") this.element.addEventListener("dblclick", () => renameTab(p.api, title, spec));
    const sub = p.api.onDidTitleChange((e) => { title.textContent = e.title; });
    this.off.push(() => sub.dispose());
    // dirty flag lives in app state; poll it through a tiny $effect-free watcher
    this.stopDirty = watchDirty(p.api.id, (d) => this.element.classList.toggle("is-dirty", d));
  }
  dispose(): void {
    this.off.forEach((f) => f());
    this.stopDirty?.();
  }
}

/** Inline rename of a tab (terminals): Enter keeps it — also across restarts, via the spec —
 *  Escape cancels, an empty name goes back to the default. */
function renameTab(api: DockviewPanelApi, title: HTMLElement, spec: SpecOf<"terminal">): void {
  const input = document.createElement("input");
  input.className = "atlas-tab-rename";
  input.value = api.title ?? "";
  input.setAttribute("aria-label", "Terminal name");
  title.replaceWith(input);
  let done = false;
  // the tab's activation focuses the terminal a frame later: take the focus now and again after
  // it, and only then let a blur (a click elsewhere) commit the name
  input.focus();
  input.select();
  setTimeout(() => {
    if (done) return;
    if (document.activeElement !== input) { input.focus(); input.select(); }
    input.addEventListener("blur", () => finish(true));
  }, 60);
  const finish = (keep: boolean) => {
    if (done) return;
    done = true;
    input.replaceWith(title);
    if (!keep) return;
    const next = { ...spec, title: input.value.trim() || undefined };
    api.updateParameters(next);
    api.setTitle(paneTitle(next));
  };
  input.addEventListener("keydown", (e) => {
    e.stopPropagation(); // not a shortcut, not vim
    if (e.key === "Enter") finish(true);
    else if (e.key === "Escape") finish(false);
  });
  for (const ev of ["pointerdown", "mousedown", "click", "dblclick"]) input.addEventListener(ev, (e) => e.stopPropagation());
}

/** The terminal group's "+": another shell next to the ones there (VS Code). Hidden elsewhere. */
class GroupActions implements IHeaderActionsRenderer {
  readonly element = document.createElement("div");
  private subs: { dispose(): void }[] = [];
  init(p: IGroupHeaderProps): void {
    this.element.className = "atlas-group-actions";
    const add = document.createElement("button");
    add.className = "icon-btn";
    add.title = "New terminal";
    add.setAttribute("aria-label", "New terminal");
    add.innerHTML = iconSvg("plus", 14);
    add.addEventListener("click", () => open({ kind: "terminal", preset: "shell", n: nextTerminalN() }));
    this.element.append(add);
    const sync = () => { this.element.style.display = p.group.panels.some((x) => kindOf(x) === "terminal") ? "" : "none"; };
    sync();
    this.subs.push(p.containerApi.onDidAddPanel(sync), p.containerApi.onDidRemovePanel(sync), p.containerApi.onDidMovePanel(sync));
  }
  dispose(): void { this.subs.forEach((s) => s.dispose()); }
}

/** With vertical tabs the side column's header is the side panel's row of tools (SideHead.svelte), as on top
 *  of the panel in the left bar; its tabs are hidden (tabs.svelte.ts applyHeaders). Mounted while the group is
 *  the side column. Imported late: the component imports this module. */
class SideHeadActions implements IHeaderActionsRenderer {
  readonly element = document.createElement("div");
  private instance: ReturnType<typeof mount> | null = null;
  private subs: { dispose(): void }[] = [];
  private side = false;
  private loading = false;
  init(p: IGroupHeaderProps): void {
    this.element.className = "atlas-side-head";
    const sync = () => {
      this.side = p.group.panels.length > 0 && panelZone(p.group.panels[0]) === "side";
      if (this.side && !this.instance && !this.loading) {
        this.loading = true;
        void import("../components/sidebar/SideHead.svelte").then((m) => { this.loading = false; if (this.side && !this.instance) this.instance = mount(m.default, { target: this.element }); });
      } else if (!this.side && this.instance) { void unmount(this.instance); this.instance = null; }
    };
    sync();
    this.subs.push(p.containerApi.onDidAddPanel(sync), p.containerApi.onDidRemovePanel(sync), p.containerApi.onDidMovePanel(sync));
  }
  dispose(): void { this.side = false; this.subs.forEach((s) => s.dispose()); if (this.instance) void unmount(this.instance); }
}

// Dirty dots: panes call setDirty(); tabs subscribe. Kept outside runes so plain DOM can listen.
const dirtyWatchers = new Map<string, Set<(d: boolean) => void>>();
function watchDirty(id: string, fn: (d: boolean) => void): () => void {
  let set = dirtyWatchers.get(id);
  if (!set) dirtyWatchers.set(id, (set = new Set()));
  set.add(fn);
  fn(!!app.dirty[id]);
  return () => set!.delete(fn);
}
export function setDirty(id: string, dirty: boolean): void {
  if (!!app.dirty[id] === dirty) return;
  if (dirty) app.dirty[id] = true;
  else delete app.dirty[id];
  dirtyWatchers.get(id)?.forEach((fn) => fn(dirty));
}

class Watermark implements IWatermarkRenderer {
  readonly element = document.createElement("div");
  constructor() {
    this.element.className = "atlas-watermark";
    this.element.innerHTML = `<div class="atlas-watermark-inner"><div class="wm-mark">Atlas</div>
      <div class="wm-row"><span>Command palette</span><span class="kbd-group"><kbd>Ctrl</kbd><kbd>K</kbd></span></div>
      <div class="wm-row"><span>Open file</span><span class="kbd-group"><kbd>Ctrl</kbd><kbd>P</kbd></span></div>
      <div class="wm-row"><span>Capture</span><span class="kbd-group"><kbd>Ctrl</kbd><kbd>Alt</kbd><kbd>C</kbd></span></div>
      <div class="wm-row"><span>Terminal</span><span class="kbd-group"><kbd>Ctrl</kbd><kbd>\`</kbd></span></div></div>`;
  }
  init(): void {}
}

export function initDock(el: HTMLElement, components: PaneComponents): DockviewApi {
  const dock = createDockview(el, {
    theme: { name: "atlas", className: "dockview-theme-atlas", gap: 6, dndOverlayMounting: "relative", dndPanelOverlay: "group", dndTabIndicator: "line" },
    createComponent: (o) => new SveltePane(components[o.name as PaneKind] as AnyLoader, o.name as PaneKind),
    createTabComponent: () => new AtlasTab(),
    defaultTabComponent: "atlas",
    createWatermarkComponent: () => new Watermark(),
    createRightHeaderActionComponent: () => new GroupActions(),
    createPrefixHeaderActionComponent: () => new SideHeadActions(),
    scrollbars: "native",
  });
  setDock(dock);
  // Dragging a divider: no text selection anywhere (WebKit selected the whole side panel), and
  // terminals wait for the drop to refit (see Terminal.svelte).
  el.addEventListener("pointerdown", (e) => {
    if (!(e.target as HTMLElement).closest?.(".dv-sash")) return;
    document.body.classList.add("atlas-resizing");
    const end = () => {
      document.body.classList.remove("atlas-resizing");
      window.getSelection()?.removeAllRanges();
      window.dispatchEvent(new Event("atlas-resize-end"));
      window.removeEventListener("pointerup", end, true);
      window.removeEventListener("pointercancel", end, true);
    };
    window.addEventListener("pointerup", end, true);
    window.addEventListener("pointercancel", end, true);
  }, true);
  // vertical wheel over a tab strip scrolls it sideways (its scrollbar is hidden)
  el.addEventListener("wheel", (e) => {
    const strip = (e.target as HTMLElement).closest?.(".dv-tabs-container");
    if (!strip || Math.abs(e.deltaY) <= Math.abs(e.deltaX) || strip.scrollWidth <= strip.clientWidth) return;
    strip.scrollLeft += e.deltaY;
    e.preventDefault();
  }, { passive: false });
  dock.onDidActivePanelChange(reportPanes);
  dock.onDidActivePanelChange((e) => { if (e.panel && editors.has(e.panel.id)) noteEditorActive(e.panel.id); });
  dock.onDidActivePanelChange((e) => { if (e.panel) noteVisit(e.panel); });
  // the other devices hear what this one shows (lib/where: glance mode follows it); a PDF adds its page itself
  dock.onDidActivePanelChange((e) => { const s = e.panel?.params as { path?: unknown } | undefined; if (typeof s?.path === "string" && s.path) for (const f of shownHooks) f(s.path); });
  // a click on the tab of the pane already in front fires no activation: hand it the keys anyway
  el.addEventListener("pointerup", (e) => {
    const tab = (e.target as HTMLElement).closest?.(".dv-tab.dv-active-tab");
    const id = dock.activePanel?.id;
    if (!tab || !id || e.button !== 0) return;
    requestAnimationFrame(() => {
      const a = document.activeElement;
      if (!a || a === document.body || tab.contains(a)) giveKeys(id);
    });
  });
  dock.onDidAddPanel(reportPanes);
  dock.onDidRemovePanel(reportPanes);
  dock.onDidAddPanel(numberTerminals);
  dock.onDidRemovePanel(numberTerminals);
  dock.onDidLayoutChange(noteToolSizes);
  reportPanes();
  let lastPos: string | undefined;
  onSettings(moveSidePanel);
  onWide(moveSidePanel);
  onSettings((c) => {
    if (lastPos !== undefined && lastPos !== c.terminal.position) placeTerminalPanel(c.terminal.position);
    lastPos = c.terminal.position;
    constrainTerminal();
  });
  dock.onDidAddPanel((p) => { if (paneZone(kindOf(p)) === "bottom") requestAnimationFrame(constrainTerminal); });
  return dock;
}

// --- the layout as data (lib/workspaces.ts keeps it in files) ------------------------------------

/** Which tabs are open and where, as plain JSON. */
export const currentLayout = (): unknown => getDock()?.toJSON() ?? null;

/** Called after every change of the layout; returns the unsubscribe. */
export function onLayoutChange(fn: () => void): () => void {
  const sub = getDock()?.onDidLayoutChange(fn);
  return () => sub?.dispose();
}

type SavedPanel = { id: string; contentComponent?: string; title?: string; params?: { kind?: string }; renderer?: string };
type SavedNode = { type: string; data: SavedNode[] | { views: string[]; activeView?: string } };
type SavedLayout = { grid?: { root?: SavedNode }; panels?: Record<string, SavedPanel> };

/** An older saved layout brought to today's panes, one step per retired shape. */
export function migrateLayout<T>(layout: T): T {
  const l = layout as SavedLayout | null;
  if (!l?.panels) return layout;
  keepOnlyTerminalsRendered(l.panels);
  foldLibraryIntoLibraries(l);
  return layout;
}

/** PDFs were saved rendered "always" (in the page while in the background) until 2026-10-23: now only terminals. */
function keepOnlyTerminalsRendered(panels: Record<string, SavedPanel>): void {
  for (const p of Object.values(panels)) if (p.renderer === "always" && p.params?.kind !== "terminal") delete p.renderer;
}

/** The References pane of older layouts (`library`) as the one Library page (`libraries` at References): two tabs, two
 *  sidebar tiles otherwise. Dropped when both are open. */
function foldLibraryIntoLibraries(l: SavedLayout): void {
  const old = l.panels?.library;
  if (!l.panels || old?.params?.kind !== "library") return;
  const keep = !l.panels.libraries;
  delete l.panels.library;
  if (keep) l.panels.libraries = { ...old, id: "libraries", contentComponent: "libraries", title: "Library", params: { kind: "libraries", at: "references" } } as SavedPanel;
  const walk = (n?: SavedNode): void => {
    if (!n) return;
    if (Array.isArray(n.data)) { n.data.forEach(walk); return; }
    const leaf = n.data;
    leaf.views = keep ? leaf.views.map((v) => (v === "library" ? "libraries" : v)) : leaf.views.filter((v) => v !== "library");
    if (leaf.activeView === "library") leaf.activeView = keep ? "libraries" : leaf.views[0];
  };
  walk(l.grid?.root);
}

/** Replace what is open with a saved layout. False (and an empty dock) when it is not usable. */
export function applyLayout(layout: unknown): boolean {
  const dock = getDock();
  if (!dock) return false;
  try {
    dock.fromJSON(migrateLayout(structuredClone(layout)) as Parameters<DockviewApi["fromJSON"]>[0]);
    for (const g of dock.groups) if (!g.api.isVisible) setContentVisible(g, false);
    // a layout saved before names lost their extension: an automatic "hubbard.md" title reads "hubbard" again
    for (const p of dock.panels) {
      const spec = p.params as PaneSpec | undefined, path = spec && "path" in spec ? spec.path : undefined;
      if (spec && path && p.api.title === basename(path) && paneTitle(spec) !== p.api.title) p.api.setTitle(paneTitle(spec));
    }
    moveSidePanel();
    keepShape();
    window.dispatchEvent(new Event("atlas-layout"));
    return true;
  } catch (err) {
    console.warn("[atlas] layout unusable, starting fresh", err);
    dock.clear();
    return false;
  }
}

export function resetLayout(): void {
  getDock()?.clear();
  open({ kind: "today" });
}

// --- opening panes ------------------------------------------------------------------------------

function paneRef(p: { id: string; params?: Record<string, unknown> }): PaneRef {
  const path = p.params?.path;
  // an explorer's path is a vault path only in the vault (an SSH host's /home is not one)
  const inVault = kindOf(p) !== "explorer" || (p.params?.source ?? "vault") === "vault";
  return typeof path === "string" && inVault ? { kind: kindOf(p), path } : { kind: kindOf(p) };
}

function reportPanes(): void {
  const dock = getDock();
  if (dock) setPanes(dock.activePanel ? paneRef(dock.activePanel) : undefined, dock.panels.map(paneRef));
}

/** Show an open pane: its group back if hidden, the pane in front, the keys in it. */
function show(id: string): boolean {
  const p = getDock()?.getPanel(id);
  if (!p) return false;
  reveal(p.group);
  p.api.setActive();
  // already active panes get no activation event, so give them the keys here
  giveKeys(id);
  return true;
}

/** The keys into pane `id`: its own focus function, else its editor's or terminal's. */
function giveKeys(id: string): void {
  const f = paneFocus.get(id);
  if (f) f(); else (editors.get(id) ?? terminals.get(id))?.focus();
}

/** `beside`: not over what is being looked at but next to it — in the other split when there is
 *  one, else in a new one on the right (a PDF and its notes; a draft and its figures). */
export function open(spec: PaneSpec, opts: { activate?: boolean; beside?: boolean } = {}): DockviewPanelApi | null {
  const dock = getDock();
  if (!dock) return null;
  const side = sideIdOf(spec);
  if (side && sideInBar()) { showSide(side); return null; } // it lives in the left bar
  if ("path" in spec && spec.path) { rememberFile(spec.path); journalOpen(spec.path); }
  const id = paneId(spec);
  const existing = dock.getPanel(id);
  if (!existing && "path" in spec && spec.path) emitPluginEvent({ type: "file:open", path: spec.path }); // a new tab, not a return to one
  if (existing) {
    if (opts.activate !== false) {
      reveal(existing.group); existing.api.setActive(); paneFocus.get(id)?.();
      // the file asked for again: the tree scrolls back to it (the active file did not change, so nothing else says so)
      if (spec.kind !== "explorer" && "path" in spec && spec.path) window.dispatchEvent(new CustomEvent("atlas-active-file", { detail: spec.path }));
    }
    if (spec.kind === "editor" && spec.line !== undefined) editors.get(id)?.gotoLine(spec.line);
    if (spec.kind === "pdf" && spec.page !== undefined) pdfPages.get(id)?.(spec.page, { quote: spec.quote, annotation: spec.annotation });
    if (spec.kind === "excalidraw" && spec.page) drawingPages.get(id)?.(spec.page);
    if (spec.kind === "plugin" && spec.anchor) pluginAnchors.get(id)?.(spec.anchor);
    if (spec.kind === "explorer" && spec.path !== undefined) explorerGo.get(id)?.(spec.path, spec.select);
    return existing.api;
  }
  setOpening(opts.activate === false ? null : id);
  const panel = dock.addPanel({
    id,
    component: spec.kind,
    tabComponent: "atlas",
    title: paneTitle(spec),
    params: spec,
    // only terminals stay in the page in the background (a shell's screen must keep up); every other pane
    // leaves it — out of layout and of global listeners (pdf.js's selection watch cost every key ~60 ms with
    // 8 PDFs open) — and keeps its place through pane-scroll.ts
    renderer: spec.kind === "terminal" ? "always" : "onlyWhenVisible",
    inactive: opts.activate === false,
    ...((opts.beside && besideActive()) || placement(specZone(spec))),
  } as AddPanelOptions<PaneSpec>);
  setOpening(null);
  return panel.api;
}

// the usage journal (toolsmith miners): one entry per file per 10 s, so tab-hopping is not "use"
const journaled = new Map<string, number>();
function journalOpen(path: string): void {
  const now = Date.now();
  if (now - (journaled.get(path) ?? 0) < 10_000) return;
  journaled.set(path, now);
  api.usage({ kind: "open", path });
}

/** Set by the phone app's shell (native-shell.svelte.ts): true when the app opened `path` itself, natively (a native
 *  plugin's side: docs/refactor/REFACTOR-native-plugins.md), so no tab is made here. A hook, not an import: the shell imports the dock. */
let nativeOpener: ((path: string) => boolean) | null = null;
export function setNativeOpener(fn: ((path: string) => boolean) | null): void { nativeOpener = fn; }

/** `path` handed to the phone app's native plugin that opens it (a reader): false off the phone, or none opens it. */
export const openNative = (path: string): boolean => nativeOpener?.(path) ?? false;

/** `anchor`: the link's `#…` (`Chapter 3`), handed to a plugin's pane that shows the file (`atlas.anchor`). */
export function openPath(path: string, line?: number, opts: { beside?: boolean; anchor?: string } = {}): void {
  if (openNative(path)) return;
  openIntent.path = path;
  openIntent.t = Date.now();
  open(resolveSpec(path, line, opts.anchor), { beside: opts.beside }); // the vault's "Open with… → always", a plugin's claim, else the usual viewer
}

/** A drawing at one of its pages (`[[x.excalidraw#Page 2]]`, `#^frame=…`): the phone app's native Notepad when it
 *  opens drawings (it is handed `path#page`), else the drawing's pane at that page. */
export function openDrawingAt(path: string, page: string, opts: { beside?: boolean } = {}): void {
  if (openNative(`${path}#${page}`)) return;
  open({ kind: "excalidraw", path, page }, opts);
}

/** A tab put back as it was (the phone app's restored tabs, at the page's start): in the page, behind what is shown —
 *  never a native viewer opened over the screen, never brought to the front over the view the app asked for. */
export function restorePath(path: string): void {
  open(resolveSpec(path), { activate: false });
}

/** Terminals that would read the same ("Claude", "iq"): the first keeps the name, the others get
 *  2, 3… in the order they were opened, so two Claude sessions or two tabs on one host tell apart. */
function numberTerminals(): void {
  const groups = new Map<string, { n: number; api: DockviewPanelApi }[]>();
  for (const p of getDock()?.panels ?? []) {
    const spec = p.params as PaneSpec | undefined;
    if (spec?.kind !== "terminal") continue;
    const base = paneTitle(spec);
    groups.set(base, [...(groups.get(base) ?? []), { n: spec.n, api: p.api }]);
  }
  for (const [base, list] of groups) {
    list.sort((a, b) => a.n - b.n).forEach((t, i) => {
      const want = i === 0 ? base : `${base} ${i + 1}`;
      if (t.api.title !== want) t.api.setTitle(want);
    });
  }
}

/** Bring an open pane to the front by id (its group shown again if hidden) and focus it. */
export function focusPanel(id: string): void { show(id); }

/** Focus an existing pane of a kind (optionally matching a predicate) or create one. */
export function focusOrOpen<K extends PaneKind>(kind: K, make: () => SpecOf<K>, match?: (id: string) => boolean): void {
  const found = getDock()?.panels.find((p) => kindOf(p) === kind && (!match || match(p.id)));
  // a hidden panel (Ctrl+J) must come back: activating alone left Claude invisible (UX audit)
  if (found) { reveal(found.group); found.api.setActive(); }
  else open(make());
}

/** Go to the previous (-1) or next (+1) visited pane; a closed one is reopened. */
/** The history of tabs as a list (roadmap 7.3: "a way to see the history"): pick one to go back to it. */
export function historyList(): void {
  const items = visits().map(({ visit, here, index }) => ({ value: String(index), title: paneTitle(visit.spec), detail: here ? "here" : "path" in visit.spec && visit.spec.path ? shownPath(String(visit.spec.path)) : undefined, icon: paneIcon(visit.spec) }));
  void import("./palette.svelte").then(({ pick }) => pick({
    placeholder: items.length ? "Go back to… (the tabs visited, the latest first)" : "No history yet in this window", tag: "History", icon: "clock",
    items, onpick: (v) => jumpTo(Number(v), (x) => { if (!show(x.id)) open(x.spec); }),
  }));
}

let steppedAt = 0;
/** A step was taken a moment ago (the mouse's side button): the browser's own Back for that same press is not another. */
export const steppedJustNow = (): boolean => Date.now() - steppedAt < 400;
export function navigate(step: -1 | 1): void {
  steppedAt = Date.now();
  const leaving = getDock()?.activePanel;
  const went = stepHistory(step, leaving?.id, (v) => { if (!show(v.id)) open(v.spec); });
  if (!went) return;
  travelSign(step < 0, paneTitle(went.visit.spec), went.at, went.of);
  // back closes the tab it leaves, forward opens it again from the history
  if (step < 0 && leaving && leaving.id !== went.visit.id && closesOnBack(leaving)) leaving.api.close();
}

/** Set by tabs.svelte.ts (which imports this module): whether a tab is pinned. */
export const tabFacts = { pinned: (_id: string): boolean => false };

/** A document tab (one with a file: never a terminal), nothing unsaved, not pinned, not an app (Home, a plugin's
 *  view): what Back may close. A pane on the side or bottom is not in the history. */
function closesOnBack(p: IDockviewPanel): boolean {
  const spec = p.params as PaneSpec | undefined;
  return !!spec && "path" in spec && !!spec.path && panelZone(p) === "main"
    && !app.dirty[p.id] && !tabFacts.pinned(p.id) && !isApp(p.id, spec);
}

/** Whether back (-1) / forward (+1) has anywhere to go — the swipe sign greys out when not. */
export const canNavigate = (step: -1 | 1): boolean => canStep(step, getDock()?.activePanel?.id);

// --- the two tool panels (lib/dock-panels.ts), by key ---------------------------------------------

/** No panel yet → open its first pane; hidden → show and focus; shown → hide. With `whenFocused`
 *  a shown panel is hidden only if the keys are already in it (else they go there). */
function togglePanel(zone: "side" | "bottom", first: () => PaneSpec, whenFocused = false): void {
  const g = zoneGroup(zone);
  if (!g) { open(first()); return; }
  if (g.api.isVisible && (!whenFocused || getDock()?.activeGroup === g)) { hidePanel(g); return; }
  reveal(g);
  g.activePanel?.api.setActive();
}
/** The side panel's name for a pane (a built-in tool's kind, `tool:<type>` for a plugin's), if it is one. */
export function sideIdOf(spec: PaneSpec | undefined): SideId | null {
  if (!spec) return null;
  if (isSideKind(spec.kind)) return spec.kind;
  const t = spec.kind === "block" ? sideToolOf(spec.src) : undefined;
  return t ? toolId(t.type) : null;
}
/** …and back: the pane that shows it beside the editors. */
export function sideSpec(id: SideId): PaneSpec {
  if (!id.startsWith(TOOL)) return { kind: id as SideKind };
  const type = id.slice(TOOL.length);
  return { kind: "block", src: `type: ${type}\n`, doc: "", title: sideTools.find((t) => t.type === type)?.title };
}
/** Shows a side tool where the side panel is: in the left bar, or as a tab of the side column. */
export const openSide = (id: SideId): void => { open(sideSpec(id)); };

const newShell = (): PaneSpec => ({ kind: "terminal", preset: "shell", n: nextTerminalN() });

/** Ctrl+B (VS Code): the side panel (files, search, outline, git); its tabs stay open while hidden. */
export const toggleSidePanel = (): void => (sideInBar() ? toggleSide() : togglePanel("side", () => ({ kind: "files" })));

/** Follows ui.side_panel: the side tools leave the dock for the left bar, or come back to it. */
let sideWasInBar: boolean | undefined;
function moveSidePanel(): void {
  const dock = getDock(), inBar = sideInBar();
  if (!dock) return;
  if (inBar) {
    const docked = dock.panels.filter((p) => panelZone(p) === "side");
    const front = docked.find((p) => p.group.activePanel === p) ?? docked[0];
    if (front) { const id = sideIdOf(front.params as PaneSpec), shown = front.group.api.isVisible; if (id && shown) showSide(id); else sidePanel.visible = false; }
    for (const p of docked) p.api.close();
  } else if (sideWasInBar && sidePanel.visible) open(sideSpec(sidePanel.kind));
  sideWasInBar = inBar;
}
/** Super+J: the terminal panel; the shells keep running while hidden. */
export const toggleTerminalPanel = (): void => togglePanel("bottom", newShell);
/** Ctrl+`: focus the terminal (showing it if hidden); if it already has the keys, hide it. */
export const focusTerminalPanel = (): void => togglePanel("bottom", newShell, true);

// --- closing ------------------------------------------------------------------------------------

export async function closePanel(api: DockviewPanelApi): Promise<void> {
  const park = parkOf(api.id);
  // save first, but never let a slow server keep a tab open (the save goes on; a failure toasts)
  if (park) await Promise.race([park().catch(() => {}), new Promise((r) => setTimeout(r, 2000))]);
  api.close();
}

export function closeActive(): void {
  const p = getDock()?.activePanel;
  if (p) void closePanel(p.api);
}

export { lastEditorId } from "./registry";

export function activeEditorId(): string | null {
  const p = getDock()?.activePanel;
  return p && editors.has(p.id) ? p.id : null;
}
