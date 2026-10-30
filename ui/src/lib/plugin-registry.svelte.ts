// The vault's plugins as the page knows them (docs/guides/PLUGIN-API.md): the list, whether each can run (off, broken,
// a plugin it requires missing), and the ledger of what each registered — every block, view, command… is owned by
// its plugin and undone when it reloads or is switched off. No plugin code runs here: plugins.svelte.ts starts them,
// plugin-host-api.ts is what they are handed.
import { api } from "./api";
import type { Plugin } from "./gen/Plugin";
import type { PaneSpec } from "./panes";
import { updateSettings } from "./settings.svelte";

export type { Plugin };

/** Inside the phone app (its bridge, as native-shell.svelte.ts reads it; not imported: that module imports this one). */
/** The id of `.atlas/init.js`, run as a plugin without a folder (plugins.svelte.ts). */
export const INIT_ID = "init";
export const inPhoneApp = !!(globalThis as unknown as { AtlasNative?: unknown }).AtlasNative;

export const plugins = $state({ list: [] as Plugin[], loaded: false, /** main.js failures, by plugin id */ errors: {} as Record<string, string> });

/** Why plugin `p` cannot run (off, broken, not for this platform, a plugin it `requires` missing, off or too old); null
 *  when it can. The core's answer (`plugins::blocked`, filled in every `GET /api/plugins`), never worked out here:
 *  one rule, also the phone app's. The list is read again when `[plugins] off` changes (plugins.svelte.ts). */
export function pluginBlocked(p: Plugin): string | null {
  return p.blocked ?? (p.error ? `${p.title} cannot load: ${p.error}` : null);
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
