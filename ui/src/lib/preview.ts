// Hover previews: resting the pointer on a link in a note — [[wikilink]], [text](url), the reading view's
// links — or on a tab in the left bar shows what it leads to in a small card: a note rendered, a
// picture, a PDF's first page, a code file's first lines, a web address. A tab shows itself as last
// seen (Settings, a Base, a PDF at its page; a terminal as its last lines; a note or a text file as its text). One installer for the whole
// window (like image-peek.ts): an element says what it points at through `targetOf`; the card stays
// while the pointer is on it, so a long preview can be scrolled.
import { dirOf, shownName, IMAGE_RE } from "./paths";
import { api } from "./api";
import { renderMarkdown, stripFrontmatter } from "./markdown";
import { resolveLink } from "./vault";
import { settings } from "./settings.svelte";
import { tabs } from "./tabs.svelte";
import { paneElement } from "./dock-panels";
import { terminals } from "./registry";

export type PreviewTarget =
  | { kind: "file"; path: string; title?: string }
  | { kind: "url"; url: string }
  | { kind: "pane"; title: string; detail: string }
  /** a link to a file the vault does not have: opening it starts a new note there */
  | { kind: "missing"; path: string }
  /** an open tab: drawn from its own pane, else from its file */
  | { kind: "tab"; id: string; title: string; detail: string; path?: string };

const SHOW_MS = 450, HIDE_MS = 250, CARD_W = 420;
const TEXT = /\.(md|txt|py|rs|ts|js|svelte|tex|bib|toml|ya?ml|json|tsv|csv|sh|c|h|cpp|jl|m|lua|css|html|base)$/i;

/** The note an element of a note belongs to: the editor or reading view around it says (`data-note`). */
const noteOf = (el: Element) => el.closest<HTMLElement>("[data-note]")?.dataset.note ?? "";

/** What a hovered element points at, or null when it is not a link or a tab. */
export function targetOf(el: Element): PreviewTarget | null {
  const on = (key: "link_preview" | "tab_preview") => (key === "link_preview" ? settings.config?.editor.link_preview : settings.config?.ui.tab_preview) ?? true;
  const tab = el.closest<HTMLElement>("[data-tab-id]");
  if (tab) {
    if (!on("tab_preview")) return null;
    const t = tabs.groups.flatMap((g) => g.tabs).find((x) => x.id === tab.dataset.tabId);
    // a page (.page) is drawn by its blocks, not its YAML: never previewed from its file
    return t ? { kind: "tab", id: t.id, title: t.title, detail: t.tip, path: t.path?.endsWith(".page") ? undefined : t.path } : null;
  }
  if (!on("link_preview")) return null;
  const wiki = el.closest<HTMLElement>(".cm-hmd-internal-link[data-target], a.internal-link[data-href]");
  if (wiki) {
    const target = (wiki.dataset.target ?? wiki.dataset.href ?? "").replace(/^\[\[|\]\]$/g, "").split(/[|#]/)[0].trim();
    const path = resolveLink(target, dirOf(noteOf(wiki)));
    return path ? { kind: "file", path } : null;
  }
  const md = el.closest<HTMLElement>(".cm-link[data-href], .markdown a[href]:not(.internal-link)");
  if (md) {
    const href = md.dataset.href ?? md.getAttribute("href") ?? "";
    if (/^https?:\/\//i.test(href)) return { kind: "url", url: href };
    if (!href || /^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith("#")) return null;
    const path = resolveLink(decodeURI(href.split("#")[0]), dirOf(noteOf(md)), false);
    return path ? { kind: "file", path } : null;
  }
  return null;
}

const same = (a: PreviewTarget | null, b: PreviewTarget | null) => JSON.stringify(a) === JSON.stringify(b);

/** Fills `card` (`width` px wide: a tab's miniature is scaled to it) with what `t` shows. */
export async function drawPreview(card: HTMLElement, t: PreviewTarget, width = CARD_W): Promise<void> {
  const head = document.createElement("div");
  head.className = "preview-head";
  const body = document.createElement("div");
  body.className = "preview-body";
  card.replaceChildren(head, body);
  if (t.kind === "url") {
    head.textContent = new URL(t.url).host;
    body.textContent = t.url;
    body.classList.add("preview-url");
    return;
  }
  if (t.kind === "tab") {
    const term = terminals.get(t.id), el = paneElement(t.id);
    if (term) {
      head.textContent = t.title;
      const pre = document.createElement("pre");
      pre.className = "preview-term";
      pre.textContent = term.lines(24).join("\n").replace(/\s+$/, "");
      body.append(pre);
      return;
    }
    // a note or a text file is read as a link's preview is: its pane shrunk to the card is text too small to read
    const readable = !!t.path && TEXT.test(t.path);
    const mini = !readable && el && miniature(el, width);
    if (mini) { head.textContent = t.title; body.classList.add("preview-mini"); body.append(mini); return; }
    return drawPreview(card, t.path ? { kind: "file", path: t.path, title: t.title } : { kind: "pane", title: t.title, detail: t.detail });
  }
  if (t.kind === "missing") {
    head.textContent = t.path;
    body.textContent = "Not in the vault yet — a click starts this note.";
    body.classList.add("preview-url", "preview-missing");
    return;
  }
  if (t.kind === "pane") {
    head.textContent = t.title;
    body.textContent = t.detail;
    body.classList.add("preview-url");
    return;
  }
  head.textContent = t.title ?? shownName(t.path);
  if (IMAGE_RE.test(t.path)) {
    const img = document.createElement("img");
    img.src = URL.createObjectURL(await api.thumb(t.path, 360));
    img.alt = "";
    body.append(img);
  } else if (/\.pdf$/i.test(t.path)) {
    const { pageBitmap, paint, dpr } = await import("./pdf-pages");
    const canvas = document.createElement("canvas");
    paint(canvas, await pageBitmap(t.path, 1, 340 * dpr()));
    canvas.style.width = "100%";
    body.append(canvas);
  } else if (/\.md$/i.test(t.path)) {
    const text = stripFrontmatter((await api.file(t.path)).text).slice(0, 4000);
    body.classList.add("markdown");
    body.innerHTML = renderMarkdown(text || "*(empty)*", { dir: dirOf(t.path) });
  } else if (TEXT.test(t.path)) {
    const pre = document.createElement("pre");
    pre.textContent = (await api.file(t.path)).text.split("\n").slice(0, 30).join("\n");
    body.append(pre);
  } else {
    body.textContent = t.path;
    body.classList.add("preview-url");
  }
}

/** the size each pane was last seen at: a background tab is detached and has none */
const seen = new WeakMap<HTMLElement, { w: number; h: number }>();

/** A scaled copy of a pane as it was last drawn: its DOM cloned (inert, no ids), canvases copied. */
function miniature(src: HTMLElement, width: number): HTMLElement | null {
  if (!src.childElementCount) return null; // never drawn yet (a restored tab not shown so far)
  if (src.isConnected && src.offsetWidth > 0) seen.set(src, { w: src.offsetWidth, h: src.offsetHeight });
  const { w, h } = seen.get(src) ?? { w: 900, h: 640 };
  const scale = (width - 2) / w;
  const copy = src.cloneNode(true) as HTMLElement;
  for (const n of [copy, ...copy.querySelectorAll("*")]) for (const a of ["id", "data-testid", "data-tab-id", "autofocus"]) n.removeAttribute(a);
  const from = src.querySelectorAll("canvas"), to = copy.querySelectorAll("canvas");
  from.forEach((c, i) => {
    const d = to[i];
    if (!d || !c.width || !c.height) return;
    d.width = c.width; d.height = c.height;
    try { d.getContext("2d")?.drawImage(c, 0, 0); } catch { /* a WebGL canvas without its buffer: left blank */ }
  });
  Object.assign(copy.style, { width: `${w}px`, height: `${h}px`, transform: `scale(${scale})`, transformOrigin: "0 0", visibility: "visible", position: "relative", inset: "auto" });
  copy.inert = true;
  const frame = document.createElement("div");
  frame.className = "preview-frame";
  Object.assign(frame.style, { height: `${Math.min(h * scale, 266)}px` });
  frame.append(copy);
  return frame;
}

// One card for the whole window; `anchor` says where its source is (an element, or a rectangle of a terminal's cells).
type Anchor = { rect: () => DOMRect; inBar: boolean; within?: Element };
const card = Object.assign(document.createElement("div"), { className: "hover-preview" });
card.dataset.testid = "hover-preview";
let shown: PreviewTarget | null = null, wanted: PreviewTarget | null = null;
let anchor: Anchor | null = null;
let showT: ReturnType<typeof setTimeout> | undefined, hideT: ReturnType<typeof setTimeout> | undefined;
const hide = () => { card.remove(); shown = null; };
const place = (a: Anchor) => {
  const r = a.rect(), w = Math.min(CARD_W, innerWidth - 24);
  card.style.width = `${w}px`;
  const x = a.inBar ? r.right + 8 : Math.min(Math.max(8, r.left), innerWidth - w - 8);
  card.style.left = `${Math.min(x, innerWidth - w - 8)}px`;
  // below the link, or above it when the bottom of the window is near; beside a left-bar tab
  const below = a.inBar ? r.top : r.bottom + 6;
  card.style.top = `${below + 300 > innerHeight ? Math.max(8, (a.inBar ? r.bottom : r.top - 6) - 300) : below}px`;
};
const show = async (t: PreviewTarget, a: Anchor) => {
  shown = t;
  place(a);
  card.replaceChildren();
  if (!card.isConnected) document.body.append(card);
  try { await drawPreview(card, t); }
  catch { if (same(shown, t)) hide(); return; } // a gone file or an unreadable PDF: no card rather than an error card
  if (same(shown, t)) place(a);
};

/** Asks for the card of `t` near `a` (after the usual delay), or, with null, for no card. */
function want(t: PreviewTarget | null, a: Anchor | null): void {
  if (same(t, wanted) && t) { clearTimeout(hideT); return; }
  clearTimeout(showT);
  wanted = t;
  anchor = t ? a : null;
  if (!t) { clearTimeout(hideT); if (shown) hideT = setTimeout(hide, HIDE_MS); return; }
  showT = setTimeout(() => { if (anchor && same(wanted, t)) void show(t, anchor); }, shown ? 120 : SHOW_MS);
}

/** For a source that is not an element (a terminal's cells, drawn inside `within`): the card of `t` beside `rect`;
 *  `previewAt(null)` lets it go. */
export function previewAt(t: PreviewTarget | null, rect?: DOMRect, within?: Element): void {
  want(t, rect ? { rect: () => rect, inBar: false, within } : null);
}

let installed = false;

export function installPreviews(): void {
  if (installed) return;
  installed = true;
  document.addEventListener("mouseover", (e) => {
    const el = e.target as Element;
    if (card.contains(el)) { clearTimeout(hideT); return; }
    const t = el instanceof Element ? targetOf(el) : null;
    if (same(t, wanted) && t) { clearTimeout(hideT); return; }
    if (!t && anchor?.within?.contains(el)) return; // a terminal link's card: xterm says when the link is left
    const at = t ? (el.closest("[data-tab-id]") ?? el) : null; // beside the whole tab row, not the word under the pointer
    want(t, at && { rect: () => at.getBoundingClientRect(), inBar: !!at.closest("[data-tab-id]") });
  });
  // a click, a key or the window losing focus ends it: the preview never stands in the way
  const off = () => { clearTimeout(showT); wanted = null; hide(); };
  document.addEventListener("mousedown", (e) => { if (!card.contains(e.target as Node)) off(); }, true);
  document.addEventListener("keydown", off, true);
  window.addEventListener("blur", off);
}
