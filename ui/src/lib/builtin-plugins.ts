// Built-in plugins: parts of Atlas that are not for every vault (the Library is for science, not for
// a personal vault). Each one is switched like a vault plugin — its id in `[plugins] off` — and while
// off it has no toolbar button, no commands, no completions, and its native part in the core is not
// started. The native code stays in the core (it has to be fast: PDF import, the browser connector);
// what makes it a plugin is that nothing of it exists in a vault that switched it off.
// docs/guides/PLUGINS.md ("Built-in plugins").
import type { IconName, PaneSpec } from "./panes";
import { settings } from "./settings.svelte";

export interface Builtin {
  id: string;
  title: string;
  description: string;
  icon: IconName;
  /** The command its toolbar button runs (an action marked `plugin: id`). */
  command: string;
  /** The pane that command opens: an app at the top of the left bar (lib/apps.svelte.ts). */
  pane: PaneSpec;
  /** What it adds, for Settings → Plugins. */
  parts: string;
}

export const BUILTINS: Builtin[] = [
  {
    // id "library" kept: vaults switch it off by that name. The view is the Library page, References its first library.
    id: "library", title: "Library", icon: "library", command: "ui.library", pane: { kind: "libraries", at: "references" },
    description: "The Library page — References (your papers, books, theses and lecture notes) first, then the vault's other libraries — \\cite completion and the PDF reader's paper actions. The references themselves — their notes, refs.bib, the Zotero connector, PDF sources — are the Catalog · Science plugin's.",
    parts: "the Library page · commands · \\cite completion",
  },
];

export const builtinOn = (id: string): boolean => !(settings.config?.plugins.off ?? []).includes(id);
