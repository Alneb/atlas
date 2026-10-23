// `[[wikilinks]]` printed in a terminal (Claude's answers, a grep over the notes) become links: found by
// terminal-text.ts, resolved and opened as the editor does (vault.ts, links.ts), previewed by the hover card
// (preview.ts). The terminal is at the vault's root, so a link resolves as from a note at the root.
import type { ILink, ILinkProvider, Terminal } from "@xterm/xterm";
import { linksOn, runAround } from "./terminal-text";
import { resolveLink, vaultReady } from "./vault";
import { openWikilink, resolveWikilink } from "./links";
import { previewAt } from "./preview";
import { settings } from "./settings.svelte";

/** The provider for one terminal; `term.registerLinkProvider(wikilinkProvider(term))`. */
export function wikilinkProvider(term: Terminal): ILinkProvider {
  const resolves = (t: string) => resolveLink(t, "") !== null;
  return {
    provideLinks(y, callback) {
      if (settings.config?.terminal.wikilinks === false) return callback(undefined);
      const buf = term.buffer.active;
      const run = runAround({ line: (i) => buf.getLine(i), cell: buf.getNullCell() }, y - 1);
      if (!run.text.includes("[[")) return callback(undefined);
      void vaultReady().then(async () => {
        const found = linksOn(run, y - 1, resolves);
        const links = await Promise.all(found.map(async (l): Promise<ILink> => {
          const hit = resolveLink(l.target, "");
          const path = hit ?? (await resolveWikilink(l.target, ""));
          return {
            range: { start: { x: l.start.x + 1, y: l.start.row + 1 }, end: { x: l.end.x + l.end.w, y: l.end.row + 1 } },
            text: l.target,
            decorations: { pointerCursor: true, underline: true },
            // a plain click, as the terminal's web links; Ctrl/Cmd+click beside the current tab
            activate: (e) => { previewAt(null); void openWikilink(l.target, "", { beside: e.ctrlKey || e.metaKey }); },
            hover: (e) => {
              if (settings.config?.editor.link_preview === false) return;
              previewAt(hit ? { kind: "file", path, title: path } : { kind: "missing", path }, cellRect(term, e), term.element);
            },
            leave: () => previewAt(null),
          };
        }));
        callback(links.length ? links : undefined);
      }, () => callback(undefined));
    },
  };
}

/** The row of cells under the pointer, as a rectangle on screen (where the card goes). */
function cellRect(term: Terminal, e: MouseEvent): DOMRect {
  const screen = term.element?.querySelector(".xterm-screen")?.getBoundingClientRect();
  if (!screen || !term.rows) return new DOMRect(e.clientX, e.clientY, 1, 1);
  const h = screen.height / term.rows, top = screen.top + Math.floor((e.clientY - screen.top) / h) * h;
  return new DOMRect(e.clientX, top, 1, h);
}
