// The one dockview instance (dock.ts creates it) and the questions the dock's modules ask of it.
import type { DockviewApi, DockviewGroupPanel } from "dockview-core";
import { paneZone, specZone, type PaneKind, type PaneSpec } from "./panes";

export type Zone = ReturnType<typeof paneZone>;

let dock: DockviewApi | null = null;
export const getDock = () => dock;
export const setDock = (d: DockviewApi): void => { dock = d; };

export function kindOf(api: { id: string }): PaneKind {
  return api.id.split(":")[0] as PaneKind;
}

/** The zone of an open panel: from what it shows (a block may be a side tool), else from its kind. */
export const panelZone = (p: { id: string; params?: unknown }): Zone => { const s = p.params as PaneSpec | undefined; return s?.kind ? specZone(s) : paneZone(kindOf(p)); };
export const inZone = (g: DockviewGroupPanel, zone: Zone) => g.panels.some((p) => panelZone(p) === zone);
/** The group holding the panes of a zone (main: the first of its splits). */
export const zoneGroup = (zone: Zone) => dock?.groups.find((g) => inZone(g, zone));
