// Cells a plugin puts in the status bar (`atlas.shell.statusItem`). The bar draws this list; a cell
// with `run` is a button.
import { guard } from "./plugin-log.svelte";
export interface StatusCell { key: string; plugin: string; text: string; title?: string; run?: () => void | Promise<void> }
export const statusCells = $state<StatusCell[]>([]);

/** Adds (or replaces, same plugin and id) a cell; the handle changes its text or takes it away. */
export function addStatusCell(plugin: string, it: { id: string; text: string; title?: string; run?: () => void | Promise<void> }): { set(text: string, title?: string): void; remove(): void } {
  const key = `${plugin}:${it.id}`;
  const remove = () => { const i = statusCells.findIndex((c) => c.key === key); if (i >= 0) statusCells.splice(i, 1); };
  remove();
  statusCells.push({ key, plugin, text: String(it.text), title: it.title, run: it.run && (() => guard(plugin, `status cell “${it.id}”`, () => it.run!(), undefined)) });
  return {
    set: (text, title) => { const c = statusCells.find((x) => x.key === key); if (c) { c.text = String(text); if (title !== undefined) c.title = title; } },
    remove,
  };
}
