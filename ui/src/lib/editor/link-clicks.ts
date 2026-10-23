// Links in the editor, clicked or tapped: a plain click on a rendered link (or Ctrl+click on a [[wikilink]] being
// edited) follows it, the middle button opens it beside — never the X11 paste at the click —, Ctrl+click on a picture
// opens it in a tab, and a finger's tap on a link is taken at touchend, before the caret moves under it.
import { EditorView } from "@codemirror/view";
import { syntaxTree } from "@codemirror/language";
import type { SyntaxNode } from "@lezer/common";

/** The URL of the markdown link `[text](url)` at `pos`, if there is one. */
function markdownLinkAt(view: EditorView, pos: number): string | null {
  for (let n: SyntaxNode | null = syntaxTree(view.state).resolveInner(pos, 1); n; n = n.parent) {
    if (n.name !== "Link") continue;
    const u = n.getChild("URL");
    return u ? view.state.sliceDoc(u.from, u.to) : null;
  }
  return null;
}

type OpenLink = (target: string, opts?: { beside?: boolean }) => void;

/** The link under a click or a tap, as what to open (a URL or a vault path), or null: [text](url), a rendered internal
 *  link, a [[wikilink]] in the live preview. Without `onOpenLink` (a capture box) only web links count. */
function linkTarget(view: EditorView, el: HTMLElement | null, onOpenLink?: OpenLink): string | null {
  if (!el) return null;
  const mdLink = el.closest<HTMLElement>(".cm-link");
  const url = mdLink ? markdownLinkAt(view, view.posAtDOM(mdLink)) : null;
  if (url) return /^[a-z][a-z0-9+.-]*:/i.test(url) ? url : onOpenLink ? decodeURI(url).replace(/^<|>$/g, "") : null;
  if (!onOpenLink) return null; // an editor that opens no files: the click edits
  const rendered = el.closest<HTMLElement>("a.internal-link");
  if (rendered) return rendered.dataset.href ?? "";
  const link = el.closest<HTMLElement>(".cm-hmd-internal-link");
  // the label goes along: a PDF link's label is the words to select on its page (lib/pdf-place.ts)
  if (link) return link.dataset.target ? link.dataset.target + (link.dataset.label ? `|${link.dataset.label}` : "")
    : (link.textContent ?? "").replace(/^\[\[|\]\]$/g, "");
  return null;
}

export function linkClicks(onOpenLink?: OpenLink) {
  // the web in the browser, a file of the vault in Atlas
  const follow = (target: string, opts?: { beside?: boolean }) => {
    if (/^[a-z][a-z0-9+.-]*:/i.test(target)) void import("../web-links").then((m) => m.openWeb(target));
    else onOpenLink?.(target, opts);
  };
  const at = (view: EditorView, el: EventTarget | Element | null) => linkTarget(view, el as HTMLElement | null, onOpenLink);
  let tap: { x: number; y: number; at: number } | null = null;
  return EditorView.domEventHandlers({
    mousedown: (e, view) => {
      // the middle button on a link opens it beside (auxclick, below) — never the X11 paste at the click
      if (e.button === 1) { if (at(view, e.target) === null) return false; e.preventDefault(); return true; }
      if (e.button !== 0) return false;
      // a picture: Ctrl+click opens it in a tab of its own (Ctrl alone shows it large, image-peek.ts); a plain click edits
      const img = (e.target as HTMLElement).closest<HTMLImageElement>("img.cm-embed-image");
      if (img && (e.ctrlKey || e.metaKey) && onOpenLink) { e.preventDefault(); onOpenLink(img.alt); return true; }
      if (e.altKey) return false; // Obsidian: Alt+click puts the caret in a link to edit it
      const target = at(view, e.target);
      if (target === null) return false;
      e.preventDefault();
      follow(target);
      return true;
    },
    auxclick: (e, view) => {
      if (e.button !== 1) return false;
      const target = at(view, e.target);
      if (target === null) return false;
      e.preventDefault();
      follow(target, { beside: true });
      return true;
    },
    // a finger: the tap would first move the caret onto the link's line, which then shows its markup and moves the
    // link away from under the finger (links were hard to tap on a phone) — so a tap on a
    // link is taken at touchend, before any caret moves or the keyboard opens
    touchstart: (e) => { const t = e.touches[0]; tap = e.touches.length === 1 && t ? { x: t.clientX, y: t.clientY, at: Date.now() } : null; return false; },
    touchend: (e, view) => {
      const t = e.changedTouches[0], start = tap;
      tap = null;
      if (!start || !t || Date.now() - start.at > 600 || Math.hypot(t.clientX - start.x, t.clientY - start.y) > 10) return false;
      const target = at(view, document.elementFromPoint(t.clientX, t.clientY));
      if (target === null) return false;
      e.preventDefault(); // no click, no caret, no keyboard
      follow(target);
      return true;
    },
  });
}
