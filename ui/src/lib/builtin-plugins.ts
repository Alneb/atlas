// Built-in plugins: parts of Atlas that are not for every vault (the Library is for science, not for
// a personal vault). Each one is switched like a vault plugin — its id in `[plugins] off` — and while
// off it has no toolbar button, no commands, no completions, and its native part in the core is not
// started. The native code stays in the core (it has to be fast: PDF import, the browser connector);
// what makes it a plugin is that nothing of it exists in a vault that switched it off.
// docs/guides/PLUGINS.md ("Built-in plugins").
import type { IconName, PaneSpec } from "./panes";
import type { PageId } from "./settings-pages";
import { settings } from "./settings.svelte";

/** The built-in plugins' ids — the core's `BuiltinPlugin` (config.rs) has the same; a typo is a type error. */
export type BuiltinId = "library" | "latex";

export interface Builtin {
  id: BuiltinId;
  title: string;
  description: string;
  icon: IconName;
  /** A button at the top of the left bar (lib/apps.svelte.ts) running `command` (an action marked `plugin: id`),
   *  which opens `pane`. A plugin that only adds to the editor has none. */
  button?: { command: string; pane: PaneSpec };
  /** Its own page in Settings (lib/settings-pages.ts, a page with `plugin: id`), listed under Plugins. */
  page?: PageId;
  /** What it adds, for Settings → Plugins. */
  parts: string;
}

export const BUILTINS: Builtin[] = [
  {
    // id "library" kept: vaults switch it off by that name. The view is the Library page, References its first library.
    id: "library", title: "Library", icon: "library", button: { command: "ui.library", pane: { kind: "libraries", at: "references" } },
    description: "The Library page — References (your papers, books, theses and lecture notes) first, then the vault's other libraries — \\cite completion and the PDF reader's paper actions. The references themselves — their notes, refs.bib, the Zotero connector, PDF sources — are the Catalog · Science plugin's.",
    parts: "the Library page · commands · \\cite completion",
  },
  {
    // the core keeps rendering $…$ in notes (Obsidian fidelity); everything about typing LaTeX is this plugin's
    id: "latex", title: "LaTeX", icon: "sigma", page: "latex",
    description: "Typing LaTeX: symbol completions and .tex files. Snippets are the Snippets plugin's; while a vault has not converted its old snippet file, that plugin reads the file named here. Math in notes is rendered either way.",
    parts: "LaTeX completions · /api/snippets",
  },
];

export const builtinOn = (id: BuiltinId): boolean => !(settings.config?.plugins.off ?? []).includes(id);
