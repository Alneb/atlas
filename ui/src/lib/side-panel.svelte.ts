// The side panel's second home (ui.side_panel = "sidebar"): the left bar, right under the tab list,
// instead of a dock column. Which tool it shows, whether it shows and how tall it is (kept in the
// vault's shell.json — shell-prefs.ts).
import { phone } from "./phone.svelte";
import { paneZone, type PaneKind } from "./panes";
import { load, save, KEYS } from "./prefs";
import { settings, updateSettings } from "./settings.svelte";
import { saveShellPrefs, shellPart } from "./shell-prefs";
import { TOOL } from "./side-tools.svelte";
import type { SidePanelPlace } from "./gen/SidePanelPlace";

export const SIDE_KINDS = ["files", "search", "outline", "git"] as const satisfies readonly PaneKind[];
export type SideKind = (typeof SIDE_KINDS)[number];
/** The commands that open the side tools: the bar's toolbar leaves them out while the panel, with
 *  its own row of the same four, is in the bar. */
export const SIDE_COMMANDS: ReadonlySet<string> = new Set(SIDE_KINDS.map((k) => `ui.${k}`));
export const isSideKind = (k: PaneKind): k is SideKind => paneZone(k) === "side";

/** What the panel shows: one of the four built-in tools, or a plugin's (`tool:<block type>`). */
export type SideId = SideKind | `tool:${string}`;
type Prefs = { kind: SideId; visible: boolean; height: number };
/** The panel's height in the bar is the user's: it does not give way as tabs open. */
export const SIDE_HEIGHT = { min: 120, start: 320 } as const;
/** `focus` counts the requests to put the keys in the panel (Ctrl+Shift+F while it is in the bar). */
export const sidePanel = $state({ kind: "files", visible: true, height: SIDE_HEIGHT.start, ...load<Partial<Prefs>>(KEYS.sidePanel, {}), focus: 0 } as Prefs & { focus: number });
const prefs = (): Prefs => ({ kind: sidePanel.kind, visible: sidePanel.visible, height: sidePanel.height });
const keep = (): void => { save(KEYS.sidePanel, prefs()); saveShellPrefs(); };
shellPart("sidePanel", {
  get: prefs,
  set: (v) => {
    if (typeof v.height === "number" && v.height >= SIDE_HEIGHT.min) sidePanel.height = v.height;
    // a plugin's tool is taken on trust: its plugin may load after this file is read (the panel waits for it)
    if ((SIDE_KINDS as readonly unknown[]).includes(v.kind) || (typeof v.kind === "string" && v.kind.startsWith(TOOL))) sidePanel.kind = v.kind as SideId;
    if (typeof v.visible === "boolean") sidePanel.visible = v.visible;
  },
});

/** True while the side panel lives in the left bar (which exists only with vertical tabs). */
/** On a phone there is no left bar (lib/phone.svelte.ts): the side tools open as panes there. */
export const sideInBar = (): boolean => !phone.on && settings.config?.ui.side_panel === "sidebar" && settings.config.ui.tabs === "vertical";

export function showSide(kind: SideId): void {
  sidePanel.kind = kind;
  sidePanel.visible = true;
  sidePanel.focus++;
  keep();
  window.dispatchEvent(new Event("atlas-side-needed")); // a bar shrunk to icons (fullscreen) opens to show it
}
/** Set the height (the drag on the panel's top edge); `room` is the most the bar can give. */
export function sizeSide(px: number, room: number): void {
  sidePanel.height = Math.round(Math.max(SIDE_HEIGHT.min, Math.min(px, room)));
  keep();
}
export function toggleSide(): void { sidePanel.visible = !sidePanel.visible; keep(); }
export function placeSidePanel(place: SidePanelPlace): void { void updateSettings((c) => { c.ui.side_panel = place; }); }
