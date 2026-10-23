// Things that happen in Atlas, told to plugins (`atlas.on(type, fn)`). The events are sent from the
// few places everything passes through (the API client for saves, moves and deletes; `open` for
// tabs), so no pane has to remember to announce what it did. They are about what is done IN Atlas:
// a change made by another program arrives through `onFilesChanged` as before.
import { guard } from "./plugin-log.svelte";
import { isBookkeeping } from "./bus";

export type PluginEvent =
  | { type: "file:open"; path: string }
  | { type: "file:save"; path: string }
  | { type: "file:create"; path: string }
  | { type: "file:rename"; from: string; to: string }
  | { type: "file:delete"; path: string }
  | { type: "capture"; path: string; text: string }
  /** A command was run (by a key, the palette, a toolbar button, a bookmark). */
  | { type: "command"; id: string };
export type PluginEventType = PluginEvent["type"];
export const PLUGIN_EVENTS: readonly PluginEventType[] = ["file:open", "file:save", "file:create", "file:rename", "file:delete", "capture", "command"];

type Listener = { plugin: string; fn: (e: PluginEvent) => void | Promise<void> };
const listeners = new Map<PluginEventType, Set<Listener>>(PLUGIN_EVENTS.map((t) => [t, new Set<Listener>()]));

export function onPluginEvent<T extends PluginEventType>(plugin: string, type: T, fn: (e: Extract<PluginEvent, { type: T }>) => void | Promise<void>): () => void {
  const set = listeners.get(type);
  if (!set) throw new Error(`on: unknown event "${String(type)}" (one of ${PLUGIN_EVENTS.join(", ")})`);
  const l: Listener = { plugin, fn: fn as Listener["fn"] };
  set.add(l);
  return () => set.delete(l);
}

// the app's own bookkeeping (layout, recent files, journals, the trash) is not something a plugin asked about
export function emitPluginEvent(e: PluginEvent): void {
  const path = "path" in e ? e.path : "from" in e ? e.from : "";
  if (isBookkeeping(path)) return;
  // after the caller has finished its own work: a listener never delays or breaks a save
  queueMicrotask(() => { for (const l of listeners.get(e.type) ?? []) void guard(l.plugin, `on("${e.type}")`, () => l.fn(e), undefined); });
}
