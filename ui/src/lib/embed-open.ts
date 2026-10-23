// Going from an embed to the original: over any mounted embed (`![[note]]`, a PDF, a drawing, a file: `[data-embed-path]`, embeds.ts)
// a small ↗ button shows beside its first line, and Ctrl/⌘+click anywhere in it opens the file. One button
// for the whole page, placed over the embed under the pointer, since an embed's own children are redrawn at will.
import { openWikilink } from "./links";
import { iconSvg } from "./icons";

const SEL = "[data-embed-path]";
let button: HTMLButtonElement | null = null;
let over: HTMLElement | null = null;

/** What the embed shows, as a link: its file, and the heading or page it was embedded with. */
function targetOf(el: HTMLElement): { link: string; note: string } {
  const section = (el.dataset.target ?? "").split("#").slice(1).join("#").trim();
  const path = el.dataset.embedPath ?? "";
  return { link: section ? `${path}#${section}` : path, note: el.dataset.embedNote ?? "" };
}

function open(el: HTMLElement) {
  const { link, note } = targetOf(el);
  if (link) void openWikilink(link, note);
}

function place(el: HTMLElement | null) {
  over = el;
  if (!button) {
    button = document.createElement("button");
    button.className = "embed-open";
    button.title = "Open the original (or Ctrl+click the embed)";
    button.setAttribute("aria-label", "Open the original");
    button.innerHTML = iconSvg("external-link", 14);
    button.addEventListener("mousedown", (e) => { e.preventDefault(); e.stopPropagation(); }); // the editor keeps its caret
    button.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); if (over) open(over); });
    button.addEventListener("mouseleave", (e) => { if (!over?.contains(e.relatedTarget as Node | null)) place(null); });
    document.body.append(button);
  }
  if (!el) { button.hidden = true; return; }
  // beside the embed's first line, in the margin to its left: an embed's box can be the pane's whole width, its text a
  // narrow column (the editor's readable width), so its right edge may be far from anything it shows
  const r = el.getBoundingClientRect(), text = el.querySelector<HTMLElement>(".markdown, .block-body") ?? el;
  const left = Math.max(r.left, text.getBoundingClientRect().left);
  Object.assign(button.style, { top: `${Math.max(0, r.top + 2)}px`, left: `${Math.max(2, left - 30)}px` });
  button.hidden = false;
}

if (typeof document !== "undefined") {
  document.addEventListener("mouseover", (e) => {
    const t = e.target as HTMLElement | null;
    if (!t || t === button || button?.contains(t)) return;
    const el = t.closest<HTMLElement>(SEL);
    if (el !== over) place(el);
  });
  // capture: before the editor, which takes Ctrl+click for another caret
  window.addEventListener("mousedown", (e) => {
    if (e.button !== 0 || !(e.ctrlKey || e.metaKey)) return;
    const el = (e.target as HTMLElement | null)?.closest<HTMLElement>(SEL);
    if (!el) return;
    e.preventDefault();
    e.stopPropagation();
    open(el);
  }, true);
  window.addEventListener("scroll", () => { if (over && button && !button.hidden) place(over.isConnected ? over : null); }, true);
}
