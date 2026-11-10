// Rendered markdown gets its live parts here — pictures, Base tables, embeds, view blocks, inline expressions —
// for the reading view (components/Markdown.svelte) and the editor's rendered blocks (editor/create.ts) alike.
// → undoes them all: each mounted part pins its element, and through it the closed note, until it is unmounted.
import { hydrateImages } from "./raw";
import { hydrateEmbeds } from "./embeds";
import { hydrateBlocks } from "./blocks";
import { hydrateExprs } from "./expr";
import { equationLabel, equationTarget, forgetEquations, linkText } from "./equations";
import { onVaultChange, resolveLink } from "./vault";
import { readText } from "./vault-files";
import { markDoiLinks } from "./doi-links";
import { dirOf } from "./paths";

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
  hydrateEquationRefs(root, notePath);
  markDoiLinks(root); // a cited paper not in the library yet looks it
  return () => { for (const u of undo) u(); };
}


onVaultChange(forgetEquations); // a note's equations may have moved

/** A link to another note's numbered equation reads "(3)" once that note is read (lib/equations.ts). */
function hydrateEquationRefs(root: HTMLElement, notePath: string): void {
  for (const a of root.querySelectorAll<HTMLAnchorElement>("a.internal-link[data-eq]")) {
    const eq = equationTarget(a.dataset.href ?? "");
    if (!eq || !eq[0]) continue; // this note's own: drawn with the note
    const path = resolveLink(eq[0], dirOf(notePath));
    if (path) void equationLabel(path, eq[1], readText).then((n) => { if (n) a.textContent = linkText(eq[0], n); });
  }
}
