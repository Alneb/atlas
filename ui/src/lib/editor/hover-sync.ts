// Hover sync (docs/guides/MALLEABLE.md, R3 — Embark's map ↔ outline): pointing at a [[link]] in a note
// publishes the linked note as the shared hover; when another pane (a Base row, a board card) hovers
// a note, the links to it in this note light up. DOM-only and transient: nothing enters the document.
import { ViewPlugin, type EditorView, type ViewUpdate } from "@codemirror/view";
import { context, onContext, setHover } from "../context.svelte";
import { resolveLink } from "../vault";

const LINK = ".cm-hmd-internal-link[data-target], a.internal-link[data-href]";
const targetOf = (el: HTMLElement) => (el.dataset.target ?? el.dataset.href ?? "").replace(/^\[\[|\]\]$/g, "").split(/[|#]/)[0].trim();

export function hoverSync(dir: string) {
  return ViewPlugin.fromClass(class {
    off: () => void;
    constructor(readonly view: EditorView) {
      this.off = onContext(() => this.paint());
      this.paint();
    }
    update(u: ViewUpdate) { if (u.docChanged || u.viewportChanged) this.paint(); }
    destroy() { this.off(); }
    paint() {
      const h = context.hover;
      const want = h && h.source !== "editor" ? h.path : null;
      for (const el of this.view.contentDOM.querySelectorAll<HTMLElement>(LINK)) {
        el.classList.toggle("atlas-hover-link", !!want && resolveLink(targetOf(el), dir) === want);
      }
    }
  }, {
    eventHandlers: {
      mouseover(e) {
        const el = (e.target as HTMLElement).closest<HTMLElement>(LINK);
        const path = el && resolveLink(targetOf(el), dir);
        if (path) setHover({ path, source: "editor" });
      },
      mouseout(e) {
        if ((e.target as HTMLElement).closest(LINK) && context.hover?.source === "editor") setHover(null);
      },
    },
  });
}
