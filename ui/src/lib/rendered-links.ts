// A click on a link the reader drew (an <a> in renderMarkdown's HTML): a vault link opens in Atlas, beside for the
// middle button as a browser's new tab; a web link is left to its own handling. The one rule for the reading view
// (components/Markdown.svelte) and the blocks the editor shows rendered (tables, nested callouts, embeds).
import { openWikilink } from "./links";
import { openPath } from "./dock";

/** Follows the link under `e` from note `notePath`; whether it was one of the vault's. */
export function followRenderedLink(e: MouseEvent, notePath: string, beside: boolean): boolean {
  const a = (e.target as HTMLElement | null)?.closest?.<HTMLAnchorElement>("a");
  if (!a) return false;
  const href = a.getAttribute("href") ?? "";
  if (a.classList.contains("internal-link")) {
    e.preventDefault();
    void openWikilink(a.dataset.href ?? "", notePath, { beside });
    return true;
  }
  if (href.startsWith("#")) {
    e.preventDefault();
    return false;
  }
  if (/^[a-z]+:/i.test(href)) return false;
  e.preventDefault(); // a relative markdown link: the vault's file, inside Atlas
  const dir = notePath.includes("/") ? notePath.slice(0, notePath.lastIndexOf("/")) : "";
  const rel = decodeURI(href);
  openPath(dir ? `${dir}/${rel}`.replace(/\/\.\//g, "/") : rel, undefined, { beside });
  return true;
}

/** Links in `host` (a rendered block of the editor) followed on a click, and beside on the middle button. */
export function followLinksIn(host: HTMLElement, notePath: string): void {
  host.addEventListener("click", (e) => { if (e.button === 0) followRenderedLink(e, notePath, false); });
  host.addEventListener("auxclick", (e) => { if (e.button === 1) followRenderedLink(e, notePath, true); });
}
