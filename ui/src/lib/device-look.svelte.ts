// The look this screen keeps for itself, over the vault's `[ui]`. One vault is opened on a desktop, a phone and an
// e-ink tablet, and its settings file travels with it: a black scheme chosen for one screen would reach them all.
// With "own" on, the look's settings (LOOK_PATHS) are read and written here, in this browser's storage, and the
// vault's stay as they are. Every vault of a device opens on one origin (`/v/<name>/`, a server's through `/r/…`), so
// this one look is the device's in all of them: on by default, seeded once from the first vault drawn (so the look in
// use stays), and from then on no vault's own `[ui]` changes how this screen looks — the same theme in every vault.
import { load, save } from "./prefs";
import type { WorkspaceConfig } from "./types";

type Ui = WorkspaceConfig["ui"];
/** The settings that are a screen's look. Settings → Appearance draws them from here when the device keeps its own. */
export const LOOK_PATHS = ["ui.theme", "ui.palette", "ui.palette_dark", "ui.contrast", "ui.shape", "ui.accent", "ui.font_size"] as const;
const LOOK_KEYS = LOOK_PATHS.map((p) => p.slice(3)) as (keyof Ui)[];
const KEY = "atlas.device-look.v1";

interface Kept { own: boolean; ui: Partial<Ui>; seeded?: boolean }
const kept = load<Partial<Kept>>(KEY, {});
// kept before the look became the device's by default (no `seeded`): on now, filled from the next vault drawn
export const deviceLook = $state<Kept>({ own: kept.seeded ? kept.own === true : true, ui: kept.ui && typeof kept.ui === "object" ? kept.ui : {}, seeded: kept.seeded === true });

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
export function lookOf(ui: Ui, phone = false): Ui {
  if (!deviceLook.own) return ui;
  if (!deviceLook.seeded) seed(ui, phone);
  const out = { ...ui } as Record<string, unknown>;
  for (const k of LOOK_KEYS) if (k in deviceLook.ui) out[k] = (deviceLook.ui as Record<string, unknown>)[k];
  return out as Ui;
}

/** The first vault drawn gives the device its look, what it had not chosen itself (the phone's theme stays
 *  unchosen: it follows the phone's dark mode until picked). Saved without a redraw: the caller is drawing it. */
function seed(ui: Ui, phone: boolean): void {
  const mine = deviceLook.ui as Record<string, unknown>, theirs = ui as Record<string, unknown>;
  for (const k of LOOK_KEYS) if (!(k in mine) && theirs[k] !== undefined && !(phone && k === "theme")) mine[k] = theirs[k];
  deviceLook.seeded = true;
  save(KEY, $state.snapshot(deviceLook));
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
