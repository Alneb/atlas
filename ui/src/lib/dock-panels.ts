// Where a pane goes, and the two tool panels (side: files/search/outline/git; bottom: terminals):
// shown and hidden without closing anything, the terminal docked at the bottom or on the right.
import type { AddPanelOptions, DockviewGroupPanel } from "dockview-core";
import { getDock, inZone, kindOf, zoneGroup, type Zone } from "./dock-instance";
import { editors } from "./registry";
import { settings, updateSettings } from "./settings.svelte";
import { saveShellPrefs, shellPart } from "./shell-prefs";

/** Where "beside the active tab" is: another main split, or a new one to its right. Null when
 *  nothing main is open (the pane then goes where it usually would). */
export function besideActive(): Partial<AddPanelOptions> | null {
  const dock = getDock(), active = dock?.activeGroup;
  if (!dock || !active || !inZone(active, "main")) return null;
  const other = dock.groups.find((g) => g !== active && inZone(g, "main") && g.api.isVisible);
  return { position: other ? { referenceGroup: other } : { referenceGroup: active, direction: "right" } };
}

/** The side panel's width and the terminal panel's size now, and a function that puts them back. A new split
 *  among the editors (a file opened beside) sits in the same row as a terminal docked on the right, and the
 *  grid shares the room out among all of them: the terminal narrowed (its TUI reflowing) for an editor's split. */
export function holdToolSizes(): () => void {
  // with no editor open the tool panels fill the window: the first editor gets their kept sizes back (keepShape,
  // noteToolSizes), and holding the stretched ones would leave the side panel across most of the window
  if (!zoneGroup("main")) return () => {};
  const side = zoneGroup("side"), bottom = zoneGroup("bottom"), right = alongRight();
  const held = (g: typeof side) => (g && g.api.isVisible && !inZone(g, "main") ? g : null);
  const s = held(side), t = held(bottom);
  const sw = s?.api.width, tw = t?.api.width, th = t?.api.height;
  return () => {
    if (s && sw && s.api.width !== sw) s.api.setSize({ width: sw });
    if (t && right && tw && t.api.width !== tw) t.api.setSize({ width: tw });
    if (t && !right && th && t.api.height !== th) t.api.setSize({ height: th });
  };
}

/** The tool panels' sizes as the person last set them (a split bar dragged), kept in shell.json: the editors coming
 *  back, a split closed and a restart all give them back. Noted only after a drag — noted on every layout change, a
 *  closed split's room handed to the terminal became its new size. */
const kept = { side: 290, bottom: 300 };
const alongRight = () => settings.config?.terminal.position === "right";
shellPart("toolSizes", {
  get: () => ({ ...kept }),
  set: (v) => { for (const k of ["side", "bottom"] as const) if (typeof v[k] === "number" && v[k] > 80) kept[k] = v[k] as number; },
});
const toolGroup = (zone: "side" | "bottom") => { const g = zoneGroup(zone); return g && g.api.isVisible && !inZone(g, "main") ? g : null; };
export function noteToolSizes(): void {
  if (!zoneGroup("main")) return;
  const side = toolGroup("side"), bottom = toolGroup("bottom"), before = JSON.stringify(kept);
  if (side) kept.side = side.api.width;
  if (bottom) kept.bottom = alongRight() ? bottom.api.width : bottom.api.height;
  if (JSON.stringify(kept) !== before) saveShellPrefs("toolSizes");
}
/** The tool panels back at their kept sizes (after a split among the editors closed: its room stays with the editors). */
export function restoreToolSizes(): void {
  if (!zoneGroup("main")) return;
  const side = toolGroup("side"), bottom = toolGroup("bottom"), right = alongRight();
  if (side && Math.abs(side.api.width - kept.side) > 2) side.api.setSize({ width: kept.side });
  if (bottom && right && Math.abs(bottom.api.width - kept.bottom) > 2) bottom.api.setSize({ width: kept.bottom });
  if (bottom && !right && Math.abs(bottom.api.height - kept.bottom) > 2) bottom.api.setSize({ height: kept.bottom });
}

/** The shape every placement keeps: the terminal along the window's whole bottom (or right) edge,
 *  the side panel left of the editors, both above (left of) the terminal. */
function split(zone: Zone): Partial<AddPanelOptions> {
  const dock = getDock()!, right = alongRight();
  const main = zoneGroup("main"), side = zoneGroup("side"), bottom = zoneGroup("bottom");
  const offTerminal = bottom && { referenceGroup: bottom, direction: right ? "left" as const : "above" as const };
  if (zone === "bottom") return { position: { direction: right ? "right" : "below" }, ...(right ? { initialWidth: 520 } : { initialHeight: 300 }) };
  if (zone === "side") {
    const position = main ? { referenceGroup: main, direction: "left" as const } : offTerminal || { direction: "left" as const };
    return { position, ...(main ? { initialWidth: kept.side } : {}) };
  }
  // main, with no editor open: back between the tool panels, which keep their sizes
  if (side) return { position: { referenceGroup: side, direction: "right" }, initialWidth: Math.max(200, side.api.width - kept.side) };
  if (offTerminal) return { position: offTerminal, ...(right ? { initialWidth: Math.max(200, dock.width - kept.bottom) } : { initialHeight: Math.max(120, dock.height - kept.bottom) }) };
  return {};
}

/** The group a new pane of this zone joins, or how to split one off. */
export function placement(zone: Zone): Partial<AddPanelOptions> {
  const dock = getDock();
  if (!dock) return {};
  const active = dock.activeGroup;
  const target = active && inZone(active, zone) ? active : zoneGroup(zone);
  return target ? { position: { referenceGroup: target } } : split(zone);
}

const contentOf = (p: DockviewGroupPanel["panels"][number]) => (p.view.content as { element?: HTMLElement }).element;

/** An open pane's own element, in the page or detached while its tab is in the background. */
export const paneElement = (id: string): HTMLElement | undefined => {
  const p = getDock()?.panels.find((x) => x.id === id);
  return p && contentOf(p);
};

/** The pane holding `el` (its id and spec), if any: what a right-click inside it is about (lib/pane-menu.ts). */
export function panelAt(el: Element): { id: string; spec: import("./panes").PaneSpec | undefined } | null {
  const p = getDock()?.panels.find((x) => contentOf(x)?.contains(el));
  return p ? { id: p.id, spec: p.params as import("./panes").PaneSpec | undefined } : null;
}

/** Always-rendered panes (terminals) live in an overlay that keeps a min height even when their
 *  group is hidden, so their content is hidden explicitly. */
export function setContentVisible(g: DockviewGroupPanel, on: boolean): void {
  for (const p of g.panels) { const el = contentOf(p); if (el) el.style.visibility = on ? "" : "hidden"; }
}

export function reveal(g: DockviewGroupPanel): void {
  if (g.api.isVisible) return;
  g.api.setVisible(true);
  setContentVisible(g, true);
  keepShape();
  window.dispatchEvent(new Event("atlas-layout")); // dockview emits nothing for visibility: the tab sidebar listens
}

/** Hide a tool panel (its panes stay open, shells keep running); the keys go back to the editor. */
export function hidePanel(g: DockviewGroupPanel): void {
  g.api.setVisible(false);
  setContentVisible(g, false);
  window.dispatchEvent(new Event("atlas-layout"));
  const main = zoneGroup("main")?.activePanel;
  main?.api.setActive();
  // keyboard focus leaves the hidden panel (a hidden terminal kept eating Ctrl+P / Ctrl+K — UX audit);
  // always-rendered panes live in an overlay, outside g.element
  const holdsFocus = g.panels.some((p) => contentOf(p)?.contains(document.activeElement));
  if (holdsFocus || g.element.contains(document.activeElement)) {
    (document.activeElement as HTMLElement).blur();
    if (main) editors.get(main.id)?.focus();
  }
}

export function nextTerminalN(): number {
  const ns = (getDock()?.panels ?? []).filter((p) => kindOf(p) === "terminal").map((p) => Number(p.id.split(":")[2]) || 0);
  return (ns.length ? Math.max(...ns) : 0) + 1;
}

/** Keeps the terminal group from being squeezed out of sight (terminal.min_size). */
export function constrainTerminal(): void {
  const g = zoneGroup("bottom");
  if (!g || g === zoneGroup("main")) return;
  const min = settings.config?.terminal.min_size ?? 280;
  const right = settings.config?.terminal.position === "right";
  g.api.setConstraints(right ? { minimumWidth: min, minimumHeight: 0 } : { minimumHeight: Math.min(min, 400), minimumWidth: 0 });
}

/** Dock the terminal panel at the bottom or on the right (the setting; applied live, kept). */
export function dockTerminal(pos: "bottom" | "right"): void {
  void updateSettings((c) => { c.terminal.position = pos; });
}

/** Move the terminal panel to an edge: a new group along the whole edge takes its panes. */
export function placeTerminalPanel(pos: "bottom" | "right", size = pos === "right" ? 520 : 300): void {
  const dock = getDock(), g = zoneGroup("bottom");
  if (!dock || !g || inZone(g, "main") || dock.groups.length < 2) return;
  const edge = dock.addGroup({ direction: pos === "right" ? "right" : "below" });
  g.api.moveTo({ group: edge });
  edge.api.setSize(pos === "right" ? { width: size } : { height: size });
  constrainTerminal();
}

/** A layout from a file (or from before a panel was shown) may have the terminal beside the side
 *  panel instead of along the whole edge: put it back, at the size it had. */
export function keepShape(): void {
  const dock = getDock(), g = zoneGroup("bottom");
  if (!dock || !g?.api.isVisible || inZone(g, "main")) return;
  const right = alongRight();
  const spans = right ? g.api.height >= dock.height - 4 : g.api.width >= dock.width - 4;
  if (!spans) placeTerminalPanel(right ? "right" : "bottom", right ? g.api.width : g.api.height);
}
