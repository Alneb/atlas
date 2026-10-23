// Where a pane goes, and the two tool panels (side: files/search/outline/git; bottom: terminals):
// shown and hidden without closing anything, the terminal docked at the bottom or on the right.
import type { AddPanelOptions, DockviewGroupPanel } from "dockview-core";
import { getDock, inZone, kindOf, zoneGroup, type Zone } from "./dock-instance";
import { editors } from "./registry";
import { settings, updateSettings } from "./settings.svelte";

/** Where "beside the active tab" is: another main split, or a new one to its right. Null when
 *  nothing main is open (the pane then goes where it usually would). */
export function besideActive(): Partial<AddPanelOptions> | null {
  const dock = getDock(), active = dock?.activeGroup;
  if (!dock || !active || !inZone(active, "main")) return null;
  const other = dock.groups.find((g) => g !== active && inZone(g, "main") && g.api.isVisible);
  return { position: other ? { referenceGroup: other } : { referenceGroup: active, direction: "right" } };
}

/** The tool panels' sizes while editors are open, so both get them back when the editors return. */
const kept = { side: 290, bottom: 300 };
const alongRight = () => settings.config?.terminal.position === "right";
export function noteToolSizes(): void {
  const side = zoneGroup("side"), bottom = zoneGroup("bottom");
  if (!zoneGroup("main")) return;
  if (side?.api.isVisible && !inZone(side, "main")) kept.side = side.api.width;
  if (bottom?.api.isVisible && !inZone(bottom, "main")) kept.bottom = alongRight() ? bottom.api.width : bottom.api.height;
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
