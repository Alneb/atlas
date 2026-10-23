// Tiny typed event bus: server events fan out to panes without coupling them to the socket.
import type { ServerEvent } from "./types";

type Handlers = { [K in ServerEvent["type"]]: Set<(e: Extract<ServerEvent, { type: K }>) => void> };
const handlers: Handlers = { fs: new Set(), gone: new Set(), open: new Set(), notify: new Set(), focus: new Set(), signin: new Set(), signinneeded: new Set(), signedin: new Set(), plugin: new Set() };

/** Atlas's own bookkeeping (`.atlas/cache/`: the layout, recent files; `.atlas/trash/`): written all the time, never
 *  a file a note, the tree, Today or git review shows — `fs` listeners skip it. */
export const isBookkeeping = (path: string): boolean => /^\.atlas\/(cache|trash)\//.test(path);

export function on<K extends ServerEvent["type"]>(type: K, fn: (e: Extract<ServerEvent, { type: K }>) => void): () => void {
  const set = handlers[type] as Set<typeof fn>;
  set.add(fn);
  return () => set.delete(fn);
}

export function emit(e: ServerEvent): void {
  const set = handlers[e.type] as Set<(e: ServerEvent) => void> | undefined;
  if (!set) {
    console.warn("[atlas] unknown server event", e);
    return;
  }
  for (const fn of set) {
    try { fn(e); } catch (err) { console.error("[atlas] event handler failed", e.type, err); }
  }
}
