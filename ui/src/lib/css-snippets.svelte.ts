// CSS snippets (docs/design/MALLEABLE.md, rung 2): every `.atlas/snippets/*.css` applies live — on save,
// with no reload — unless `[ui] css_snippets_off` names it. Settings lists them with switches.
import { api } from "./api";
import { on } from "./bus";
import { onSettings, settings } from "./settings.svelte";
import type { CssSnippet } from "./gen/CssSnippet";

export const cssSnippets = $state({ list: [] as CssSnippet[] });

const off = () => new Set(settings.config?.ui.css_snippets_off ?? []);
function apply(): void {
  document.querySelectorAll("style[data-atlas-snippet]").forEach((el) => el.remove());
  const skip = off();
  for (const s of cssSnippets.list) {
    if (skip.has(s.name)) continue;
    const el = document.createElement("style");
    el.dataset.atlasSnippet = s.name;
    el.textContent = s.css;
    document.head.append(el); // after the app's own styles: snippets win ties
  }
}

export async function reloadCssSnippets(): Promise<void> {
  cssSnippets.list = await api.cssSnippets().catch(() => []);
  apply();
}

export function initCssSnippets(): void {
  void reloadCssSnippets();
  let t: ReturnType<typeof setTimeout> | undefined;
  on("fs", (e) => { if (e.paths.some((p) => p.startsWith(".atlas/snippets/"))) { clearTimeout(t); t = setTimeout(reloadCssSnippets, 150); } });
  onSettings(() => apply());
}

export const SNIPPET_TEMPLATE = `/* A CSS snippet: it restyles Atlas as soon as you save it.
   Switch it off in Settings → CSS snippets. Useful hooks:
   colours  var(--accent) var(--bg) var(--bg-alt) var(--text) var(--heading) var(--border)
   notes    .markdown (the live-preview editor)   headings  .cm-header-1 … .cm-header-6
   panes    .atlas-pane-<kind> (editor, today, library…)   status bar  .status            */

`;
