// Rendered markdown gets its live parts here — pictures, Base tables, embeds, view blocks, inline expressions —
// for the reading view (components/Markdown.svelte) and the editor's rendered blocks (editor/create.ts) alike.
// → undoes them all: each mounted part pins its element, and through it the closed note, until it is unmounted.
import { hydrateImages } from "./raw";
import { hydrateEmbeds } from "./embeds";
import { hydrateBlocks } from "./blocks";
import { hydrateExprs } from "./expr";

export interface HydrateOptions {
  /** A card on Home, the day's log: embeds drawn as cards. */
  compact?: boolean;
  /** The note's text, for its inline `= expressions` (the reading view; the editor computes them itself). */
  exprText?: string;
}

export function hydrateRendered(root: HTMLElement, notePath: string, opts: HydrateOptions = {}): () => void {
  void hydrateImages(root);
  const undo = [hydrateEmbeds(root, notePath, opts.compact), hydrateBlocks(root, notePath)];
  if (opts.exprText !== undefined) hydrateExprs(root, notePath, opts.exprText);
  return () => { for (const u of undo) u(); };
}
