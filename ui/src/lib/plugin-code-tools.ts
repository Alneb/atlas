// Tools a plugin adds to the bar above a code file (`atlas.editor.toolbar(fn)`): run, build, test —
// whatever the file's language wants. One list; the bar asks it for the file it shows.
import { guard } from "./plugin-log.svelte";

export interface CodeTool { label: string; title?: string; run(): void | Promise<void> }
type Builder = { plugin: string; fn: (file: { path: string }) => CodeTool[] | null | undefined | void };
const builders = new Set<Builder>();
/** Bumped when a plugin's tools come or go, so an open bar redraws. */
export const codeToolsVersion = { n: 0, listeners: new Set<() => void>() };
const changed = () => { codeToolsVersion.n++; for (const l of codeToolsVersion.listeners) l(); };

export function registerCodeTools(plugin: string, fn: Builder["fn"]): () => void {
  const b = { plugin, fn };
  builders.add(b);
  changed();
  return () => { builders.delete(b); changed(); };
}

export function pluginCodeTools(path: string): CodeTool[] {
  const out: CodeTool[] = [];
  for (const b of builders) {
    for (const t of guard(b.plugin, "editor.toolbar", () => b.fn({ path }), null) ?? []) {
      if (t && typeof t.label === "string" && typeof t.run === "function") out.push({ label: t.label, title: t.title, run: () => guard(b.plugin, `tool “${t.label}”`, () => t.run(), undefined) });
    }
  }
  return out;
}
