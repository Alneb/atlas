// The vault's property spec (`[editor] properties_spec`), loaded once and kept current: read again
// when that file changes on disk or the setting names another one. `null` until loaded or when the
// vault has none (the panel then guesses kinds from the values).
import { api } from "./api";
import { on } from "./bus";
import { onSettings } from "./settings.svelte";
import type { PropertySpecs } from "./types";

export const propertySpec = $state<{ spec: PropertySpecs | null; /** bumped on every load */ version: number }>({ spec: null, version: 0 });
const listeners = new Set<() => void>();
/** Called after the spec was (re)loaded: drawings made from it (the inline table) redraw. */
export function onPropertySpec(fn: () => void): () => void { listeners.add(fn); return () => listeners.delete(fn); }

let path: string | null = null;
let started = false;

async function load(): Promise<void> {
  try {
    const s = await api.propertySpec();
    propertySpec.spec = s.found ? s : null;
    propertySpec.version++;
    for (const fn of listeners) fn();
    if (s.problems.length) console.warn("[atlas] property spec", s.path, s.problems);
  } catch (e) { console.warn("[atlas] property spec", e); }
}

/** Start following the spec (idempotent: every panel calls it). */
export function watchPropertySpec(): void {
  if (started) return;
  started = true;
  onSettings((cfg) => {
    const p = cfg.editor.properties_spec.trim();
    if (p !== path) { path = p; void load(); }
  });
  on("fs", (e) => { if (path && e.paths.some((x) => x === path || x.endsWith(`/${path}`))) void load(); });
}
