// Rows a plugin adds to the app's right-click menus (`atlas.shell.menu(where, fn)`). One list per
// place; each menu builder ends with `...pluginMenu(place, target)`. A builder that throws loses
// only its own rows (and gets a line in its plugin's log).
import type { MenuItem } from "../components/ContextMenu.svelte";
import { isIconName } from "./icons";
import { guard } from "./plugin-log.svelte";

export type MenuPlace = "file" | "tab" | "editor" | "block" | "terminal";
/** What was right-clicked. `file`: path (+ dir: true for a folder) · `tab`: path?, kind · `editor`: path,
 *  selection · `block`: type, note · `terminal`: nothing (the terminal's "+" menu: what to start). */
export interface MenuTarget { path?: string; dir?: boolean; kind?: string; selection?: string; type?: string; note?: string }
/** A plugin's row: plain data, so the shape survives changes to the menu component. */
export interface PluginMenuItem { label: string; run(): void | Promise<void>; icon?: string; hint?: string; detail?: string; danger?: boolean; disabled?: boolean }
type Builder = { plugin: string; fn: (t: MenuTarget) => PluginMenuItem[] | null | undefined | void };

const PLACES: readonly MenuPlace[] = ["file", "tab", "editor", "block", "terminal"];
const builders = new Map<MenuPlace, Set<Builder>>(PLACES.map((p) => [p, new Set<Builder>()]));

export function registerMenu(plugin: string, where: MenuPlace, fn: Builder["fn"]): () => void {
  const set = builders.get(where);
  if (!set) throw new Error(`menu: unknown place "${String(where)}" (one of ${PLACES.join(", ")})`);
  const b = { plugin, fn };
  set.add(b);
  return () => set.delete(b);
}

const row = (plugin: string, it: PluginMenuItem): MenuItem => ({
  label: String(it.label), hint: it.hint, detail: it.detail, danger: it.danger, disabled: it.disabled,
  icon: it.icon && isIconName(it.icon) ? it.icon : undefined,
  run: () => { void guard(plugin, `menu row “${it.label}”`, () => it.run(), undefined); },
});

/** The plugins' rows for this place and target, after a separator; nothing when no plugin has any. */
export function pluginMenu(where: MenuPlace, target: MenuTarget): MenuItem[] {
  const rows: MenuItem[] = [];
  for (const b of builders.get(where) ?? []) {
    for (const it of guard(b.plugin, `menu("${where}")`, () => b.fn(target), null) ?? []) if (it && typeof it.label === "string" && typeof it.run === "function") rows.push(row(b.plugin, it));
  }
  return rows.length ? ["sep", ...rows] : [];
}
