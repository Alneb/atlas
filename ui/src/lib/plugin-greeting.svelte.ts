// What plugins add to Today's greeting (`atlas.shell.greetingItem`): short chips under the date — the weather and the
// place (Weather), the week and the moon, what is due (Home). The greeting draws this list, in `order`.
import { guard } from "./plugin-log.svelte";
export interface GreetingChip { key: string; plugin: string; text: string; icon?: string; title?: string; order: number; run?: () => void | Promise<void> }
export const greetingChips = $state<GreetingChip[]>([]);

type Item = { id: string; text: string; icon?: string; title?: string; order?: number; run?: () => void | Promise<void> };

/** Adds (or replaces, same plugin and id) a chip; the handle changes its text or takes it away. */
export function addGreetingChip(plugin: string, it: Item): { set(text: string, title?: string): void; remove(): void } {
  const key = `${plugin}:${it.id}`;
  const remove = () => { const i = greetingChips.findIndex((c) => c.key === key); if (i >= 0) greetingChips.splice(i, 1); };
  remove();
  greetingChips.push({ key, plugin, text: String(it.text), icon: it.icon, title: it.title, order: it.order ?? 50,
    run: it.run && (() => guard(plugin, `greeting chip “${it.id}”`, () => it.run!(), undefined)) });
  greetingChips.sort((a, b) => a.order - b.order);
  return {
    set: (text, title) => { const c = greetingChips.find((x) => x.key === key); if (c) { c.text = String(text); if (title !== undefined) c.title = title; } },
    remove,
  };
}
