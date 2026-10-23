// Fullscreen: the zone that has the keys — the editors with all their splits, or the terminal panel — takes the
// whole window: the other zones' groups are hidden (not closed, nothing reloads) and the sidebar, rail and status
// bar step aside (App.svelte reads `fullscreen.on`). The same command puts everything back. Never saved: a look,
// not a layout. A split stays a split.
// It follows the keys between the editors and the terminal ("keep fullscreen but in the terminal" · "and
// viceversa"); a side tool asked for meanwhile opens beside them without leaving.
// On a phone (`one`) it is one pane at a time: the active tab's group maximized, as before.
import type { DockviewApi, DockviewGroupPanel } from "dockview-core";
import { tick } from "svelte";
import { panelZone, type Zone } from "./dock-instance";
import { setContentVisible } from "./dock-panels";

export const fullscreen = $state({ on: false });
let dock: DockviewApi | undefined, box: HTMLElement | undefined;
/** the zone over the window (desktop), or null */
let zone: Zone | null = null;
/** groups this hid, shown again on the way out (a panel hidden before stays hidden) */
const hid = new Set<string>();
/** phone: F11 was pressed and not yet undone, kept while dockview un-maximizes for another group's tab */
let wanted = false;

const zoneOf = (g: DockviewGroupPanel): Zone => (g.panels.length ? panelZone(g.panels[0]) : "main");
const changed = () => window.dispatchEvent(new Event("atlas-layout")); // dockview emits nothing for visibility

function show(g: DockviewGroupPanel, on: boolean): void { g.api.setVisible(on); setContentVisible(g, on); }

/** Only `z`'s groups on screen: the others hidden, the ones this hid earlier in `z` back. */
function only(d: DockviewApi, z: Zone): void {
  zone = z;
  for (const g of d.groups) {
    if (zoneOf(g) === z) { if (hid.delete(g.id) && !g.api.isVisible) show(g, true); }
    else if (g.api.isVisible) { show(g, false); hid.add(g.id); }
  }
  changed();
}

function leave(d: DockviewApi): void {
  wanted = false;
  if (d.hasMaximizedGroup()) d.exitMaximizedGroup(); // the phone's, or a layout saved by an older build
  for (const g of d.groups) if (hid.has(g.id) && !g.api.isVisible) show(g, true);
  hid.clear();
  zone = null;
  fullscreen.on = false;
  changed();
}

/** Inside the phone app the page is always one pane (`one`, lib/phone): asked for, fullscreen is the app's — its bars
 *  and the system's gone (AtlasActivity.setFull). Older apps lack it. */
const app = (globalThis as unknown as { AtlasNative?: { toggleFullscreen?(): void } }).AtlasNative;

/** The active tab's zone over the whole window (`one`: its group alone), or back to the layout as it was. */
export async function toggleFullscreen(one = false): Promise<void> {
  if (!one && app?.toggleFullscreen) return app.toggleFullscreen();
  if (!dock || !box) return;
  if (fullscreen.on) return leave(dock);
  const p = dock.activePanel;
  if (!p) return;
  // The bars go first and the dock takes its new size BEFORE the zone is alone: a resize while hidden is not
  // shared out again on the way back (the terminal came back taller).
  fullscreen.on = true;
  await tick();
  dock.layout(box.clientWidth, box.clientHeight);
  if (one) { wanted = true; dock.maximizeGroup(p); return; }
  const z = panelZone(p);
  only(dock, z === "side" ? "main" : z);
}

/** Follows the dock, so leaving by any other way (closing the last tab, a layout change) is seen.
 *  `el` is the element the dock fills. */
export function attachFullscreen(d: DockviewApi, el: HTMLElement): void {
  dock = d;
  box = el;
  // phone: the active tab moved to a group that is not the maximized one: that group takes the window
  const follow = () => {
    const p = d.activePanel;
    if (!wanted || !p) { wanted = false; fullscreen.on = d.hasMaximizedGroup() || zone !== null; return; }
    if (p.group.api.isMaximized()) return;
    if (d.hasMaximizedGroup()) d.exitMaximizedGroup();
    if (!p.group.api.isVisible) p.group.api.setVisible(true);
    d.maximizeGroup(p);
  };
  d.onDidActivePanelChange(() => {
    if (wanted) { queueMicrotask(follow); return; }
    const p = d.activePanel, z = p && panelZone(p);
    if (zone && z && z !== "side" && z !== zone) queueMicrotask(() => { if (zone) only(d, z); }); // the keys went to the terminal (or back)
  });
  d.onDidMaximizedGroupChange(() => {
    if (d.hasMaximizedGroup()) fullscreen.on = true;
    else if (wanted) queueMicrotask(follow); // un-maximized on the way to another group: follow it
    else if (!zone) fullscreen.on = false;
  });
  // a restored layout never starts (or switches workspace) locked into one zone with the bars gone
  d.onDidLayoutFromJSON(() => { hid.clear(); zone = null; leave(d); });
  leave(d);
}
