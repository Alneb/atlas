// The vault's plugins as the page knows them (docs/guides/PLUGIN-API.md): the list, whether each can run (off, broken,
// a plugin it requires missing), and the ledger of what each registered — every block, view, command… is owned by
// its plugin and undone when it reloads or is switched off. No plugin code runs here: plugins.svelte.ts starts them,
// plugin-host-api.ts is what they are handed.
import { api } from "./api";
import type { Plugin } from "./gen/Plugin";
import type { PaneSpec } from "./panes";
import { settings, updateSettings } from "./settings.svelte";

export type { Plugin };

/** Inside the phone app (its bridge, as native-shell.svelte.ts reads it; not imported: that module imports this one). */
export const inPhoneApp = !!(globalThis as unknown as { AtlasNative?: unknown }).AtlasNative;

export const plugins = $state({ list: [] as Plugin[], loaded: false, /** main.js failures, by plugin id */ errors: {} as Record<string, string> });

/** Why plugin `id` cannot run: off, broken, not for this platform, or a plugin it `requires` (at any depth) missing, broken or off; null when
 *  it can. The page's twin of the core's `plugins::blocked`, which refuses the tools of a blocked plugin. */
export function pluginBlocked(p: Plugin, seen: string[] = []): string | null {
  if (seen.includes(p.id)) return `requires itself through ${seen.join(" → ")}`;
  if (p.error) return `${p.title} cannot load: ${p.error}`;
  if ((settings.config?.plugins.off ?? []).includes(p.id)) return `${p.title} is switched off`;
  const notHere = inPhoneApp ? notOnAndroid(p) : p.not_here;
  if (notHere) return notHere;
  for (const r of p.requires ?? []) {
    const q = plugins.list.find((x) => x.id === r);
    const why = q ? pluginBlocked(q, [...seen, p.id]) : `needs the plugin ${r}, which is not installed`;
    if (why) return q ? `needs ${r}: ${why}` : why;
  }
  return null;
}

/** Inside the phone app the page runs on Android whatever its core is (a server's vault): the plugin's Android entry
 *  decides, as `not_here` does for the core's own platform. An older core's list has only `phone`. */
function notOnAndroid(p: Plugin): string | null {
  const c = p.platforms?.find((x) => x.platform === "android");
  if (!c) return p.phone ? null : `${p.title} is not made for the phone app`;
  return c.support === "no" ? `${p.title} does not run on Android${c.why ? `: ${c.why}` : ""}` : null;
}

/** Loaded and offered (command, button, pane): it parses, is not off, and every plugin it requires is on. */
export const pluginOn = (p: Plugin) => pluginBlocked(p) === null;

/** How deep a plugin sits under the plugins it requires (0: requires none), so those start first. */
export function depth(p: Plugin, seen: string[] = []): number {
  if (seen.includes(p.id)) return 0;
  const under = (p.requires ?? []).map((r) => plugins.list.find((x) => x.id === r)).filter((x): x is Plugin => !!x);
  return under.length ? 1 + Math.max(...under.map((x) => depth(x, [...seen, p.id]))) : 0;
}

export const pluginSpec = (p: Plugin): PaneSpec => ({ kind: "plugin", id: p.id, title: p.title, icon: p.icon });

export const pluginData = (id: string, args?: unknown): Promise<unknown> => api.pluginData(id, args);

// Registrations each plugin made (blocks, views, entities, commands): undone on reload / switch-off.
const owned = new Map<string, (() => void)[]>();
export function own(id: string, undo: () => void): () => void {
  const list = owned.get(id) ?? [];
  owned.set(id, list);
  list.push(undo);
  return () => { const i = list.indexOf(undo); if (i >= 0) list.splice(i, 1); undo(); };
}
export function disposeAll(id: string): void {
  for (const undo of (owned.get(id) ?? []).splice(0).reverse()) { try { undo(); } catch (e) { console.error("[atlas] plugin", id, e); } }
}
/** The plugins that registered something (a deleted plugin's registrations are undone by its id). */
export const ownerIds = (): string[] => [...owned.keys()];

// the start under way of each plugin (plugins.svelte.ts): its commands are gone until it has registered them again
export const starting = new Map<string, Promise<void>>();

export function setPluginOn(id: string, on: boolean): Promise<void> {
  return updateSettings((c) => {
    const off = new Set(c.plugins.off);
    if (on) off.delete(id); else off.add(id);
    c.plugins.off = [...off].sort();
  });
}
