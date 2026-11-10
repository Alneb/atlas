// The look this screen keeps for itself, over the vault's `[ui]`. One vault is opened on a desktop, a phone and an
// e-ink tablet, and its settings file travels with it: a black scheme chosen for one screen would reach them all.
// With "own" on, the look's settings (LOOK_PATHS) are read and written here, in this browser's storage, and the
// vault's stay as they are; a setting never changed here still follows the vault's.
import { load, save } from "./prefs";
import type { WorkspaceConfig } from "./types";

type Ui = WorkspaceConfig["ui"];
/** The settings that are a screen's look. Settings → Appearance draws them from here when the device keeps its own. */
export const LOOK_PATHS = ["ui.theme", "ui.palette", "ui.palette_dark", "ui.contrast", "ui.shape", "ui.accent", "ui.font_size"] as const;
const LOOK_KEYS = LOOK_PATHS.map((p) => p.slice(3)) as (keyof Ui)[];
const KEY = "atlas.device-look.v1";

interface Kept { own: boolean; ui: Partial<Ui> }
const kept = load<Kept>(KEY, { own: false, ui: {} });
export const deviceLook = $state<Kept>({ own: kept.own === true, ui: kept.ui && typeof kept.ui === "object" ? kept.ui : {} });

let changed: () => void = () => {};
/** settings.svelte.ts: called after every change here, to draw the look again. */
export function onDeviceLook(f: () => void): void { changed = f; }
function keep(): void {
  save(KEY, $state.snapshot(deviceLook));
  changed();
}

/** Whether `path` is kept by this device now (Settings reads and writes it here instead of the vault's file). */
export const deviceKeeps = (path: string): boolean => deviceLook.own && (LOOK_PATHS as readonly string[]).includes(path);
/** Whether this device chose `path` itself (it shows as modified; reset gives it back to the vault). */
export const deviceChose = (path: string): boolean => deviceKeeps(path) && path.slice(3) in deviceLook.ui;

/** The vault's `[ui]` as this device draws it. */
export function lookOf(ui: Ui): Ui {
  if (!deviceLook.own) return ui;
  const out = { ...ui } as Record<string, unknown>;
  for (const k of LOOK_KEYS) if (k in deviceLook.ui) out[k] = (deviceLook.ui as Record<string, unknown>)[k];
  return out as Ui;
}

/** Turns the device's own look on or off. What it chose is kept while off, so on again brings it back. */
export function setOwnLook(on: boolean): void {
  deviceLook.own = on;
  keep();
}
export function setDeviceLook(path: string, value: unknown): void {
  (deviceLook.ui as Record<string, unknown>)[path.slice(3)] = value;
  keep();
}
/** Back to the vault's value. */
export function resetDeviceLook(path: string): void {
  delete (deviceLook.ui as Record<string, unknown>)[path.slice(3)];
  keep();
}
