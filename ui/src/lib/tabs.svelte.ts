// Vertical tabs (docs/design/VERTICAL-TABS.md): a reactive list of every open dockview panel, grouped by
// dockview group in screen order, plus pinned tabs (Zen's Essentials), kept in the vault's bookmarks
// file (lib/bookmarks.svelte.ts).
// Dockview stays the source of truth for what is open and in which order (its saved layout
// restores both); this module only mirrors it, and moves panels through dockview's own API.
import { saveShellPrefs, shellPart } from "./shell-prefs";
import { LocalSelectionTransfer, PanelTransfer, type DockviewApi, type DockviewGroupPanel, type IDockviewPanel } from "dockview-core";
import { onPins, savePins as writePins, type Pin } from "./bookmarks.svelte";
import { closePanel, focusPanel, getDock, open, sideIdOf, tabFacts } from "./dock";
import { isApp } from "./apps.svelte";
import type { SideId } from "./side-panel.svelte";
import { panelZone } from "./dock-instance";
import { paneIcon, paneId, paneTitle, type IconName, type PaneKind, type PaneSpec, type PaneZone } from "./panes";
import { load, save, KEYS } from "./prefs";
import { onSettings, settings } from "./settings.svelte";
import { glance, trackRecent } from "./tab-glance";
import { toast } from "./state.svelte";
import { iconSvg } from "./icons";
import type { TabsLayout } from "./gen/TabsLayout";
import type { Action } from "./actions";

/** `shown`: the one its split displays (active: the one with the keyboard). */
export interface TabItem {
  /** The parent folder, when another open tab has the same name. */
  hint?: string; id: string; title: string; icon: IconName; kind: PaneKind; path?: string; tip: string; active: boolean; shown: boolean }
export interface TabGroup { id: string; label: string; zone: PaneZone; visible: boolean; active: boolean; tabs: TabItem[] }
export type { Pin };

const SIDEBAR_MIN = 180, SIDEBAR_MAX = 440;
type SidebarPrefs = { width: number; collapsed: boolean };

export const tabs = $state({
  /** cached until the settings arrive, so a restart does not flash the other layout */
  layout: load<TabsLayout>(KEYS.tabs, "vertical"),
  groups: [] as TabGroup[],
  /** open apps (Home, Email…): shown with the pins, not in the groups (lib/apps.svelte.ts) */
  apps: [] as TabItem[],
  /** the side column's front tool while it is shown beside the editors (its heading lights it) */
  side: null as SideId | null,
  pins: [] as Pin[],
  open: [] as string[],
  active: null as string | null,
  sidebar: { width: 248, collapsed: false, ...load<Partial<SidebarPrefs>>(KEYS.sidebar, {}) } as SidebarPrefs,
});

export const pinId = (p: Pin) => paneId(p.spec);
export const isPinned = (id: string) => tabs.pins.some((p) => pinId(p) === id);
tabFacts.pinned = isPinned; // Back leaves a pinned tab open (dock.ts navigate)
const vertical = () => tabs.layout === "vertical";

// the user: the terminal section comes before the editors (side panel, terminal, editors)
const ZONE_RANK: Record<PaneZone, number> = { side: 0, bottom: 1, main: 2 };
const ZONE_LABEL: Record<PaneZone, string> = { side: "Side panel", main: "Editor", bottom: "Terminal" };

function groupZone(g: DockviewGroupPanel): PaneZone {
  return g.panels.length ? panelZone(g.panels[0]) : "main";
}

function item(p: IDockviewPanel, activeId: string | null): TabItem {
  const spec = p.params as PaneSpec;
  const path = "path" in spec ? spec.path : undefined;
  return { id: p.id, title: p.title ?? paneTitle(spec), icon: paneIcon(spec), kind: spec.kind, path, tip: path ?? ("url" in spec ? spec.url : paneTitle(spec)),
    active: p.id === activeId, shown: p.group.activePanel === p };
}

function refresh(): void {
  const d = getDock();
  if (!d) return;
  const v = vertical();
  const hidden = new Set(v ? tabs.pins.map(pinId) : []);
  const app = (p: IDockviewPanel) => v && isApp(p.id, p.params as PaneSpec);
  const activeId = d.activePanel?.id ?? null;
  // order: terminal, editors left→right / top→bottom (hidden groups measure 0). With vertical tabs the
  // side panel is not a group of tabs: its tools are the row on top of it (SideHead.svelte).
  const all = d.groups.map((g) => ({ g, zone: groupZone(g), r: g.element.getBoundingClientRect() }));
  const gs = all.filter((x) => !v || x.zone !== "side")
    .sort((a, b) => ZONE_RANK[a.zone] - ZONE_RANK[b.zone] || Math.round(a.r.left - b.r.left) || Math.round(a.r.top - b.r.top));
  const mains = gs.filter((x) => x.zone === "main").length;
  let n = 0;
  // same name in two folders: say where each lives (the parent folder, VS Code's way)
  const names = new Map<string, number>();
  for (const p of d.panels) { const t = p.title ?? ""; names.set(t, (names.get(t) ?? 0) + 1); }
  const hint = (t: TabItem): TabItem => (t.path && (names.get(t.title) ?? 0) > 1 ? { ...t, hint: t.path.split("/").slice(-2, -1)[0] ?? "" } : t);
  tabs.groups = gs.map(({ g, zone }) => ({
    id: g.id, zone, visible: g.api.isVisible, active: d.activeGroup === g,
    label: zone === "main" && mains > 1 ? `${ZONE_LABEL.main} ${++n}` : ZONE_LABEL[zone],
    tabs: g.panels.filter((p) => !hidden.has(p.id) && !app(p)).map((p) => hint(item(p, activeId))),
  }));
  tabs.apps = d.panels.filter(app).map((p) => item(p, activeId));
  const sideGroup = all.find((x) => x.zone === "side")?.g;
  tabs.side = sideGroup?.api.isVisible && sideGroup.activePanel ? sideIdOf(sideGroup.activePanel.params as PaneSpec) : null;
  applyHeaders(d);
  tabs.open = d.panels.map((p) => p.id);
  tabs.active = activeId;
  // the tab shown alone closed: back to the pair (as Zen does); the pair gone when one of it closed or nothing is alone
  if (splitPair.ids.length) {
    const pairGone = splitPair.ids.some((pid) => !d.getPanel(pid)), aloneGone = !!splitPair.alone && !d.getPanel(splitPair.alone);
    if (d.hasMaximizedGroup() && (pairGone || aloneGone)) {
      d.exitMaximizedGroup();
      if (!pairGone) for (const pid of splitPair.ids) d.getPanel(pid)?.api.setActive();
    }
    if (pairGone || aloneGone || !d.hasMaximizedGroup()) { splitPair.ids = []; splitPair.alone = ""; }
  }
  // a pinned terminal renamed while open keeps its name on the tile
  let changed = false;
  for (const pin of tabs.pins) {
    const p = d.getPanel(pinId(pin));
    if (pin.spec.kind === "terminal" && p && p.title && p.title !== pin.title) { pin.title = p.title; pin.spec = p.params as PaneSpec; changed = true; }
  }
  if (changed) savePins();
}

let frame = 0;
const schedule = () => { if (!frame) frame = requestAnimationFrame(() => { frame = 0; refresh(); }); };

/** With vertical tabs the groups have no tab strips, but the side column keeps its header: the row of
 *  its tools (dock.ts SideHeadActions), as on top of the side panel in the left bar. */
function applyHeaders(d: DockviewApi): void {
  for (const g of d.groups) {
    const side = groupZone(g) === "side", hide = vertical() && !side;
    if (g.header.hidden !== hide) g.header.hidden = hide;
    g.element.classList.toggle("atlas-side-group", side && vertical());
  }
  halfCloses(d);
}

/** With no strip of tabs (vertical tabs), each half of a split editor carries its own × in its corner (closeHalf). */
function halfCloses(d: DockviewApi): void {
  const halves = d.groups.filter((g) => groupZone(g) === "main" && g.panels.length && g.api.isVisible);
  const split = vertical() && halves.length > 1 && !d.hasMaximizedGroup();
  for (const g of d.groups) {
    let b = g.element.querySelector<HTMLButtonElement>(":scope > .half-close");
    if (!split || !halves.includes(g)) { b?.remove(); continue; }
    if (b) continue;
    b = document.createElement("button");
    b.className = "half-close";
    b.setAttribute("aria-label", "Close this half");
    b.title = "Close this half: its tab closed, the split ended";
    b.innerHTML = iconSvg("close", 12);
    b.onclick = (e) => { e.stopPropagation(); const id = g.activePanel?.id; if (id) void closeHalf(id); };
    g.element.append(b);
  }
}

/** Mirror the dock from now on; called once, right after the dock is created. */
export function attachTabs(d: DockviewApi): void {
  const watchTitle = (p: IDockviewPanel) => p.api.onDidTitleChange(schedule);
  d.panels.forEach(watchTitle);
  d.onDidAddPanel((p) => { watchTitle(p); schedule(); });
  d.onDidAddGroup(() => { applyHeaders(d); schedule(); });
  window.addEventListener("atlas-layout", schedule); // panel shown / hidden (no dockview event for it)
  for (const ev of [d.onDidRemovePanel, d.onDidMovePanel, d.onDidActivePanelChange, d.onDidActiveGroupChange, d.onDidRemoveGroup, d.onDidLayoutChange]) ev(schedule);
  applyHeaders(d);
  trackRecent(d);
  onPins((pins) => { tabs.pins = pins; schedule(); });
  onSettings((c) => {
    if (c.ui.tabs === tabs.layout) return;
    tabs.layout = c.ui.tabs;
    save(KEYS.tabs, c.ui.tabs);
    applyHeaders(d);
    schedule();
  });
  refresh();
}

// --- operations (the sidebar's clicks, menus and keys, and the palette commands) ----------------

const panel = (id: string) => getDock()?.getPanel(id);

/** Zen's split view: a split shows a pair; a tab outside it is shown alone (its group
 *  maximized), the pair kept, and a click on the pair brings it back side by side. The pair's ids while one is alone. */
export const splitPair = $state({ ids: [] as string[], /** the tab shown alone */ alone: "" });

export function activate(id: string): void {
  const p = panel(id), d = getDock();
  if (p && d) {
    const gs = d.groups.filter((g) => g.panels.length && groupZone(g) === panelZone(p));
    if (d.hasMaximizedGroup() && splitPair.ids.includes(id)) {
      // back to the pair, each half showing its own
      d.exitMaximizedGroup();
      for (const pid of splitPair.ids) d.getPanel(pid)?.api.setActive();
      splitPair.ids = [];
      splitPair.alone = "";
    } else if (gs.length > 1 && p.group.activePanel?.id !== id && panelZone(p) === "main") {
      // a tab outside the split: alone, the split remembered as it was
      if (!d.hasMaximizedGroup()) splitPair.ids = gs.map((g) => g.activePanel?.id).filter((x): x is string => !!x);
      else d.exitMaximizedGroup();
      p.api.setActive();
      d.maximizeGroup(p);
      splitPair.alone = id;
    }
    focusPanel(id);
    return;
  }
  const pin = tabs.pins.find((p) => pinId(p) === id);
  if (pin) open(pin.spec);
}

export function closeTab(id: string): void {
  const p = panel(id);
  if (p) void closePanel(p.api);
}

/** A half's ×: its tab closed, the
 *  tabs behind it joining the other half, which goes on showing what it showed. */
export async function closeHalf(id: string): Promise<void> {
  const p = panel(id), d = getDock();
  if (!p || !d) return;
  const zone = panelZone(p);
  const other = d.groups.find((g) => g !== p.group && g.panels.length && groupZone(g) === zone);
  await closePanel(p.api);
  other?.activePanel?.api.setActive(); // unsplit gathers into the active group
  unsplit(zone);
}

function savePins(): void { void writePins($state.snapshot(tabs.pins) as Pin[]); }

/** Pin (at `index`, default last) or move an existing pin there. */
export function pin(id: string, index = tabs.pins.length): void {
  const p = panel(id);
  const existing = tabs.pins.find((x) => pinId(x) === id);
  const entry = existing ?? (p ? { spec: $state.snapshot(p.params) as PaneSpec, title: p.title ?? paneTitle(p.params as PaneSpec) } : null);
  if (!entry) return;
  const rest = tabs.pins.filter((x) => pinId(x) !== id);
  rest.splice(Math.min(index, rest.length), 0, entry);
  tabs.pins = rest;
  savePins();
  refresh();
}

export function unpin(id: string): void {
  tabs.pins = tabs.pins.filter((x) => pinId(x) !== id);
  savePins();
  refresh();
}

export function togglePin(id: string | null = tabs.active): void {
  if (!id) return;
  if (!vertical()) { toast("Pinned tabs live in the vertical tab sidebar", "Settings → Appearance → Tabs: vertical."); return; }
  if (isPinned(id)) unpin(id); else pin(id);
}

// "close" commands close documents, never terminals: a shell or a Claude session is work in progress, not a page
const closable = (o: { id: string; params?: unknown }) => panelZone(o) === "main" && !isPinned(o.id);

/** Closes these tabs, the ones not on screen first: closing the one shown brings its neighbour forward — mounting its
 *  editor or PDF only to close it next. */
function closeTabs(list: IDockviewPanel[]): void {
  const shown = (o: IDockviewPanel) => o.group.activePanel?.id === o.id;
  for (const o of [...list.filter((o) => !shown(o)), ...list.filter(shown)]) void closePanel(o.api);
}

/** Close the other unpinned document tabs of this tab's group (never terminals, never other splits). */
export function closeOthers(id: string): void {
  const p = panel(id);
  if (!p) return;
  p.api.setActive(); // the one kept comes forward first: nothing else is mounted on the way
  closeTabs(p.group.panels.filter((o) => o.id !== id && closable(o)));
}

/** Close every unpinned document tab, in every split; the terminals stay. Home comes back by itself (whenNoTabs). */
export function closeAllTabs(): void {
  closeTabs((getDock()?.panels ?? []).filter(closable));
}

/** `fn` when the last document tab is gone (closed by hand or by closeAllTabs): the window is never left empty. A
 *  layout being replaced removes and adds panes in one go, so the check waits a moment. */
export function whenNoTabs(dock: DockviewApi, fn: () => void): void {
  let t: ReturnType<typeof setTimeout> | undefined;
  dock.onDidRemovePanel(() => {
    clearTimeout(t);
    t = setTimeout(() => { if (!dock.panels.some((o) => panelZone(o) === "main")) fn(); }, 250);
  });
}

/** Move a tab into a group at an index (the sidebar's drag and drop). */
export function moveTab(id: string, groupId: string, index: number): void {
  const p = panel(id), g = getDock()?.groups.find((x) => x.id === groupId);
  if (!p || !g) return;
  p.api.moveTo({ group: g, position: "center", index });
  schedule();
}

/** Moves a tab right before (or after) another one, counted in the dock group's own order: the
 *  left bar draws some of a group's tabs elsewhere (the home page on top), so its rows are not
 *  the group's indices — a drop landed one row too high. */
export function moveTabBeside(id: string, targetId: string, after: boolean): void {
  const target = panel(targetId);
  if (!target || id === targetId) return;
  const order = target.group.panels.map((x) => x.id).filter((x) => x !== id);
  moveTab(id, target.group.id, order.indexOf(targetId) + (after ? 1 : 0));
}

/** Moves a tab to the end of a dock group (counted in the group's own order, as above). */
export function moveTabToEnd(id: string, groupId: string): void {
  const g = getDock()?.groups.find((x) => x.id === groupId);
  if (g) moveTab(id, groupId, g.panels.filter((x) => x.id !== id).length);
}

export const canSplit = (id: string) => (panel(id)?.group.panels.length ?? 0) > 1;
export function splitRight(id: string): void {
  const p = panel(id);
  if (p && canSplit(id)) p.api.moveTo({ group: p.group, position: "right" });
}

/** Unsplit (the split row's button): the tabs of every other group of this zone join one group — the
 *  active one when it is there — which keeps showing what it showed. */
export function unsplit(zone: PaneZone): void {
  const d = getDock();
  if (!d) return;
  if (d.hasMaximizedGroup()) d.exitMaximizedGroup();
  splitPair.ids = [];
  splitPair.alone = "";
  const gs = d.groups.filter((g) => groupZone(g) === zone);
  if (gs.length < 2) return;
  const into = gs.find((g) => g === d.activeGroup) ?? gs[0], keep = into.activePanel;
  for (const g of gs) if (g !== into) for (const p of [...g.panels]) p.api.moveTo({ group: into, position: "center", index: into.panels.length });
  keep?.api.setActive();
  schedule();
}

export function revealInTree(path: string): void {
  open({ kind: "files" });
  // the tree listens once mounted; a first open mounts it a moment later
  const tell = () => window.dispatchEvent(new CustomEvent("atlas-active-file", { detail: path }));
  for (const ms of [60, 500]) setTimeout(tell, ms);
}

export async function copyPath(path: string): Promise<void> {
  try { await navigator.clipboard.writeText(path); toast("Path copied", path); }
  catch { toast("Could not copy", path, "error"); }
}

export function renameTab(id: string, name: string): void {
  const p = panel(id);
  const spec = p?.params as PaneSpec | undefined;
  if (!p || spec?.kind !== "terminal") return;
  const next = { ...spec, title: name.trim() || undefined };
  p.api.updateParameters(next);
  p.api.setTitle(paneTitle(next));
}

/** Every tab in sidebar order: pins first (also resting ones), then the groups top to bottom. */
export function tabOrder(): string[] {
  return [...(vertical() ? tabs.pins.map(pinId) : []), ...tabs.groups.flatMap((g) => g.tabs.map((t) => t.id))];
}

/** Ctrl+Tab / Ctrl+Shift+Tab: the next open tab in sidebar order, wrapping. */
export function cycle(delta: 1 | -1): void {
  refresh();
  const ids = tabOrder().filter((id) => tabs.open.includes(id));
  if (ids.length < 2) return;
  const i = tabs.active ? ids.indexOf(tabs.active) : -1;
  activate(ids[(i + delta + ids.length) % ids.length]);
}

/** Ctrl+Tab: the glance over the focused split (lib/tab-glance.ts), or the older cycle. */
function switchTab(step: 1 | -1): void {
  const d = getDock();
  if (d && (settings.config?.ui.tab_switcher ?? "glance") === "glance") glance(d, step);
  else cycle(step);
}

/** Ctrl+1…8: the nth tab (a resting pin opens); Ctrl+9: the last one — as in browsers. */
export function gotoTab(n: number | "last"): void {
  refresh();
  const ids = tabOrder();
  const id = n === "last" ? ids[ids.length - 1] : ids[n - 1];
  if (id) activate(id);
}

// --- sidebar geometry ------------------------------------------------------------------------------

function saveSidebar(): void { save(KEYS.sidebar, $state.snapshot(tabs.sidebar)); saveShellPrefs(); }
shellPart("sidebar", {
  get: () => $state.snapshot(tabs.sidebar),
  set: (v) => {
    if (typeof v.width === "number") tabs.sidebar.width = Math.round(Math.max(SIDEBAR_MIN, Math.min(SIDEBAR_MAX, v.width)));
    if (typeof v.collapsed === "boolean") tabs.sidebar.collapsed = v.collapsed;
  },
});
export function setSidebarWidth(w: number): void {
  tabs.sidebar.width = Math.round(Math.max(SIDEBAR_MIN, Math.min(SIDEBAR_MAX, w)));
  saveSidebar();
}
export function toggleSidebar(): void {
  tabs.sidebar.collapsed = !tabs.sidebar.collapsed;
  saveSidebar();
}

// --- drag: a sidebar row carries dockview's own drag payload, so dropping it on a pane splits ----

export function startDrag(e: DragEvent, id: string): void {
  const d = getDock(), p = panel(id);
  if (!d || !p || !e.dataTransfer) return;
  LocalSelectionTransfer.getInstance<PanelTransfer>().setData([new PanelTransfer(d.id, p.group.id, id)], PanelTransfer.prototype);
  e.dataTransfer.effectAllowed = "move";
  e.dataTransfer.setData("text/plain", item(p, null).tip);
}
export function endDrag(): void {
  LocalSelectionTransfer.getInstance<PanelTransfer>().clearData(PanelTransfer.prototype);
}

/** Asks the sidebar to take the keyboard (it expands first when collapsed). */
export const focusTabList = () => window.dispatchEvent(new Event("atlas-tabs-focus"));

const nth = (n: number): Action => ({ id: `ui.tabs.${n}`, title: `Go to tab ${n}`, keys: `Ctrl+${n}`, run: () => gotoTab(n) });
export const tabActions: Action[] = [
  { id: "ui.tabs.next", title: "Next tab (glance over this split's tabs)", keys: "Ctrl+Tab", fromTerminal: true, run: () => switchTab(1) },
  { id: "ui.tabs.prev", title: "Previous tab", keys: "Ctrl+Shift+Tab", fromTerminal: true, run: () => switchTab(-1) },
  ...[1, 2, 3, 4, 5, 6, 7, 8].map(nth),
  { id: "ui.tabs.last", title: "Go to the last tab", keys: "Ctrl+9", run: () => gotoTab("last") },
  { id: "ui.tabs.find", title: "Find a tab (tab list: j/k, Enter, / to filter)", keys: "Ctrl+Shift+A", run: focusTabList },
  { id: "ui.tabs.pin", title: "Pin / unpin the current tab", keys: "Ctrl+Alt+P", run: () => togglePin() },
  { id: "ui.tabs.closeOthers", title: "Close the other tabs of this group (not terminals)", run: () => { if (tabs.active) closeOthers(tabs.active); } },
  { id: "ui.tabs.closeAll", title: "Close all tabs (not terminals; Home stays)", run: closeAllTabs },
  { id: "ui.sidebar", title: "Collapse / expand the sidebar", keys: "Super+S", run: toggleSidebar },
];
