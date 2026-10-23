// What draws `![[file.ext]]` in a note (docs/guides/PLUGIN-API.md, "registerEmbed"): one registry for the core's own
// embeds (a drawing: builtin-embeds.ts) and plugins'. embeds.ts asks it before its usual viewers; the newest
// registration for a path wins, so a plugin can take over a core embed. Pictures stay the core's (`<img>`).
import { extensionGlob, globTest } from "./glob";

export interface EmbedContext {
  /** The embedded file, resolved as a link is. */
  path: string;
  /** What follows `#`: `Page 2` of `![[x.excalidraw#Page 2]]`; "" when none. */
  anchor: string;
  /** What follows `|`, split: `![[x|600|center]]` → `["600", "center"]`. */
  options: string[];
  /** `|600` or `|600x400` as a width in px, when given. */
  width?: number;
  /** The note the embed is in. */
  note: string;
  /** In a card (Home, the day's log): draw it small, never a whole viewer. */
  compact: boolean;
  /** Open the file as a click on its link does (at `anchor`). */
  open(): void;
}
export type EmbedCleanup = void | (() => void);
export type EmbedRender = (host: HTMLElement, embed: EmbedContext) => EmbedCleanup | Promise<EmbedCleanup>;

export interface Embed {
  /** Unique per registration: an embed drawn by an older one is drawn again. */
  id: number;
  /** `core` or the plugin's id: whose problem a failure is. */
  owner: string;
  accepts(path: string): boolean;
  render: EmbedRender;
}

const embeds: Embed[] = [];
const watchers = new Set<() => void>();
let next = 0;
const changed = () => queueMicrotask(() => { for (const w of [...watchers]) w(); });

/** `patterns`: extensions (`"epub"`, `".excalidraw.md"`) or globs (`"maps/*.json"`). Returns its removal. */
export function registerEmbed(owner: string, patterns: string | string[], render: EmbedRender): () => void {
  const list = (Array.isArray(patterns) ? patterns : [patterns]).map(String).filter(Boolean);
  if (!list.length) throw new Error("registerEmbed: no extension or glob given");
  const e: Embed = { id: ++next, owner, accepts: globTest(list.map(extensionGlob)), render };
  embeds.push(e);
  changed();
  return () => { const i = embeds.indexOf(e); if (i >= 0) { embeds.splice(i, 1); changed(); } };
}

/** What draws `path`, the newest registration first; undefined: the core's usual embed. */
export const embedFor = (path: string): Embed | undefined => embeds.findLast((e) => e.accepts(path));

/** Called (once per batch) after a registration came or went. */
export function onEmbedsChanged(fn: () => void): () => void {
  watchers.add(fn);
  return () => watchers.delete(fn);
}
