// Books — an EPUB library and reader (docs/design/DESIGN-pen-eink-reader.md). Library (covers, titles,
// authors, how far) → Reader: the book's chapters reflowed in your typography inside a sandboxed frame (a book's own
// scripts never run), paged by columns (always on e-ink) or scrolled, the table of contents, read from where you left.
// Where you are is in the book's note (`quantum.epub` → `quantum.md`, beside its highlights): progress, reading_chapter,
// reading_at, last_read — the same properties the native reader writes, so the phone and the desktop carry on from each
// other (an old `<folder>/reading.json` is still read for a book not yet moved). An .epub is unzipped here, in the page.
const EPUB = /\.epub$/i;
const READING = "reading.json";
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };

// the zip itself: the Zip archives plugin's, shared with Manga (manifest `requires = ["zip"]`)
import { zipIndex, zipBlob } from "../zip/zip.js";

/** `rel` resolved against the folder of `base` (zip paths: no leading slash, "a/../b" folded, #fragment kept apart). */
export function resolve(base, rel) {
  const [path, frag] = decodeURIComponent(rel).split("#");
  const parts = path.startsWith("/") ? [] : base.split("/").slice(0, -1);
  for (const p of path.split("/")) { if (p === "..") parts.pop(); else if (p && p !== ".") parts.push(p); }
  return { path: parts.join("/"), frag: frag ?? "" };
}

// ---- highlights: the book's companion note (docs/PHILOSOPHY.md §1: a thing that is not Markdown gets a note) --------
/** The note beside the book that holds its highlights: `quantum.epub` → `quantum.md`. */
export const notePathOf = (book) => book.replace(EPUB, ".md");
const squash = (t) => t.replace(/\s+/g, " ").trim();
/** A new companion note: the book's properties and a Highlights heading the reader appends under. */
export function newNote(book, meta) {
  const name = book.split("/").pop();
  const q = (v) => JSON.stringify(v ?? "");
  return `---\nbook: ${q(`[[${name}]]`)}\ntitle: ${q(meta.title || name.replace(EPUB, ""))}\nauthor: ${q(meta.author)}\n---\n# ${meta.title || name.replace(EPUB, "")}\n\n## Highlights\n`;
}
/** One highlight as Markdown: the passage quoted, then where it is (`— <chapter>`). */
export const highlightBlock = (text, where) => `\n> ${squash(text)}\n> — ${where}\n`;
/** The passages a note quotes (each `>` block without its `— where` line), to mark them in the book again. */
export function highlightsIn(md) {
  const out = [];
  let cur = [];
  for (const line of `${md}\n`.split("\n")) {
    const m = /^>\s?(.*)$/.exec(line);
    if (m && !/^—\s/.test(m[1])) { cur.push(m[1]); continue; }
    if (!m && cur.length) { out.push(squash(cur.join(" "))); cur = []; }
  }
  return out.filter(Boolean);
}
// ---- the pen (a Boox, atlas.eink.pen): ink cannot stay on reflowed pages, so a pen line marks the text it runs along
/** What a pen stroke over the page means, its samples in the frame's own px: a `tap` (a dot: a link, a page turn), a
 *  `line` along a line of text (under it or through it: from its left end to its right end, at its middle height), a
 *  `bar` down the margin (every line beside it, top to bottom), or null (a scribble: nothing). */
export function penGesture(pts) {
  if (!pts.length) return null;
  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const w = x1 - x0, h = y1 - y0;
  if (Math.hypot(w, h) < 12) return { kind: "tap", x: (x0 + x1) / 2, y: (y0 + y1) / 2 };
  const mid = [...ys].sort((a, b) => a - b)[ys.length >> 1];
  if (w >= 3 * h) return { kind: "line", from: { x: x0, y: mid }, to: { x: x1, y: mid } };
  const midX = [...xs].sort((a, b) => a - b)[xs.length >> 1];
  if (h >= 3 * w) return { kind: "bar", x: midX, top: y0, bottom: y1 };
  return null;
}
// textMap, wrap, markPassages, occurrences, markFound: shared/marks.js (the native reader uses the same file)
import "./shared/marks.js";
export const { markPassages, occurrences, markFound } = globalThis.atlasMarks;
const { textMap, wrap } = globalThis.atlasMarks;

// ---- an EPUB: its package (metadata, manifest, spine) and table of contents ---------------------------------
/** → { title, author, spine: [path], toc: [{ label, path, frag, depth }], cover: path | null, text(path), blob(path) } */
export async function openEpub(buf) {
  const zip = zipIndex(buf);
  const file = (path) => { const e = zip.get(path); if (!e) throw new Error(`missing in the EPUB: ${path}`); return e; };
  const text = async (path) => (await zipBlob(buf, file(path))).text();
  const xml = async (path) => new DOMParser().parseFromString(await text(path), "application/xml");
  const container = await xml("META-INF/container.xml");
  const opfPath = container.querySelector("rootfile")?.getAttribute("full-path");
  if (!opfPath) throw new Error("not an EPUB (no package in META-INF/container.xml)");
  const opf = await xml(opfPath);
  const items = new Map();
  for (const it of opf.querySelectorAll("manifest > item")) {
    items.set(it.getAttribute("id"), { path: resolve(opfPath, it.getAttribute("href") ?? "").path, type: it.getAttribute("media-type") ?? "", props: it.getAttribute("properties") ?? "" });
  }
  const spine = [...opf.querySelectorAll("spine > itemref")].map((r) => items.get(r.getAttribute("idref"))?.path).filter((p) => p && zip.has(p));
  const meta = (name) => opf.getElementsByTagNameNS("*", name)[0]?.textContent?.trim() ?? "";
  const coverId = opf.querySelector('meta[name="cover"]')?.getAttribute("content");
  const cover = [...items.values()].find((i) => i.props.split(/\s+/).includes("cover-image"))?.path ?? (coverId && items.get(coverId)?.path) ?? null;
  const toc = [];
  const nav = [...items.values()].find((i) => i.props.split(/\s+/).includes("nav"));
  if (nav && zip.has(nav.path)) {
    const doc = new DOMParser().parseFromString(await text(nav.path), "application/xhtml+xml");
    const list = [...doc.getElementsByTagNameNS("*", "nav")].find((n) => (n.getAttribute("epub:type") ?? n.getAttributeNS("http://www.idpf.org/2007/ops", "type") ?? "").includes("toc")) ?? doc.getElementsByTagNameNS("*", "nav")[0];
    const walk = (ol, depth) => {
      for (const li of [...(ol?.children ?? [])].filter((c) => c.localName === "li")) {
        const a = [...li.children].find((c) => c.localName === "a" || c.localName === "span");
        const href = a?.getAttribute("href");
        if (href) toc.push({ label: a.textContent.trim().replace(/\s+/g, " "), ...resolve(nav.path, href), depth });
        walk([...li.children].find((c) => c.localName === "ol"), depth + 1);
      }
    };
    walk([...(list?.children ?? [])].find((c) => c.localName === "ol"), 0);
  } else {
    const ncxId = opf.querySelector("spine")?.getAttribute("toc");
    const ncx = ncxId && items.get(ncxId);
    if (ncx && zip.has(ncx.path)) {
      const doc = await xml(ncx.path);
      const walk = (parent, depth) => {
        for (const p of [...parent.children].filter((c) => c.localName === "navPoint")) {
          const src = p.querySelector("content")?.getAttribute("src");
          if (src) toc.push({ label: p.querySelector("navLabel")?.textContent.trim().replace(/\s+/g, " ") ?? "", ...resolve(ncx.path, src), depth });
          walk(p, depth + 1);
        }
      };
      const map = doc.getElementsByTagNameNS("*", "navMap")[0];
      if (map) walk(map, 0);
    }
  }
  const typeOf = (path) => [...items.values()].find((i) => i.path === path)?.type ?? "";
  return {
    title: meta("title"), author: meta("creator"), spine, toc, cover,
    has: (path) => zip.has(path), text, blob: (path) => zipBlob(buf, file(path), typeOf(path)),
  };
}

/** A chapter as a self-contained page for the frame: its pictures and styles as blob URLs (also urls inside its CSS),
 *  its scripts removed, its links kept (followed by the reader). `made` collects the URLs to revoke. */
/** A chapter as a document, its scripts gone: what the reader shows and what the search reads, so a find's place in
 *  one is its place in the other. */
export async function chapterDoc(book, path) {
  const src = await book.text(path);
  let doc = new DOMParser().parseFromString(src, "application/xhtml+xml");
  if (doc.querySelector("parsererror")) doc = new DOMParser().parseFromString(src, "text/html"); // a loose chapter
  for (const s of [...doc.querySelectorAll("script")]) s.remove();
  return doc;
}
export async function chapterHtml(book, path, made) {
  const doc = await chapterDoc(book, path);
  const url = async (p) => { const blob = await book.blob(p); const u = URL.createObjectURL(blob); made.push(u); return u; };
  const cssUrls = async (css, from) => {
    const found = [...css.matchAll(/url\(\s*['"]?([^'")]+)['"]?\s*\)/g)].map((m) => m[1]).filter((u) => !/^(data:|https?:|#)/.test(u));
    for (const u of new Set(found)) { const r = resolve(from, u).path; if (book.has(r)) css = css.split(u).join(await url(r)); }
    return css;
  };
  for (const img of doc.querySelectorAll("img[src]")) { const r = resolve(path, img.getAttribute("src")).path; if (book.has(r)) img.setAttribute("src", await url(r)); }
  for (const im of doc.getElementsByTagNameNS("http://www.w3.org/2000/svg", "image")) {
    const h = im.getAttributeNS("http://www.w3.org/1999/xlink", "href") ?? im.getAttribute("href");
    const r = h && resolve(path, h).path;
    if (r && book.has(r)) { const u = await url(r); im.setAttributeNS("http://www.w3.org/1999/xlink", "href", u); im.setAttribute("href", u); }
  }
  for (const link of [...doc.querySelectorAll('link[rel~="stylesheet"][href]')]) {
    const r = resolve(path, link.getAttribute("href")).path;
    if (!book.has(r)) { link.remove(); continue; }
    const style = doc.createElement("style");
    style.textContent = await cssUrls(await book.text(r), r);
    link.replaceWith(style);
  }
  for (const st of doc.querySelectorAll("style")) st.textContent = await cssUrls(st.textContent ?? "", path);
  return "<!doctype html>" + doc.documentElement.outerHTML;
}

/** What the Libraries page lists as a book: an EPUB reads in this plugin's reader, the rest in the app's viewer (a PDF)
 *  or the phone's reader (android `opens`). The Books pane's own library stays EPUB. */
export const BOOK = /\.(epub|pdf|djvu|mobi|azw3?|fb2)$/i;
const bookName = (name) => name.replace(BOOK, "");

/** Every book (`match`, EPUB by default) under a vault folder (subfolders too): `{ path, name }`. */
export async function booksIn(atlas, dir, out = [], match = EPUB) {
  for (const e of await atlas.list(dir).catch(() => [])) {
    if (e.dir) await booksIn(atlas, e.path, out, match);
    else if (match.test(e.name)) out.push({ path: e.path, name: e.name.replace(match, "") });
  }
  return out;
}

/** Every book under a folder of a server, through its file source (the copyparty plugin's): `{ source, place, path, name }`. A few levels down (a shelf per
 *  subject, a folder per book), hidden folders (copyparty's `.hist`) skipped, at most `MAX_REMOTE` books; a folder
 *  that cannot be read is skipped. Folders are listed `WIDTH` at a time: one by one, the user's 100 took ~20 s. */
const MAX_REMOTE = 3000, WIDTH = 6;
export async function remoteBooks(atlas, { source, place, folder }, depth = 4) {
  const out = [], queue = [];
  // the top folder first, and loudly: the source's plugin may still be starting (plugins load in no fixed order), and
  // a refusal (no VPN, a password) is said rather than shown as an empty library
  let top;
  for (let n = 0; ; n++) {
    try { top = await atlas.files.list(source, place, folder); break; }
    catch (e) { if (n >= 20 || !/no file source/.test(String(e?.message ?? e))) throw e; await new Promise((r) => setTimeout(r, 500)); }
  }
  const take = (listed, at) => {
    for (const e of listed?.entries ?? []) {
      if (e.name.startsWith(".")) continue;
      const path = `${listed.path.replace(/\/+$/, "")}/${e.name}`;
      if (e.kind === "dir" && at.depth > 0) queue.push({ folder: path, depth: at.depth - 1 });
      else if (e.kind === "file" && BOOK.test(e.name) && out.length < MAX_REMOTE) out.push({ source, place, path, name: bookName(e.name) });
    }
  };
  take(top, { depth });
  let busy = 0;
  await new Promise((done) => {
    const next = () => {
      while (busy < WIDTH && queue.length && out.length < MAX_REMOTE) {
        const at = queue.shift();
        busy++;
        atlas.files.list(source, place, at.folder).catch(() => null).then((listed) => take(listed, at)).finally(() => { busy--; next(); });
      }
      if (!busy) done();
    };
    next();
  });
  return out;
}

/** The plugin's `remote` setting: the server folders whose books are in the library (copyparty's when no source). */
export const remoteFolders = (S) => (Array.isArray(S.remote) ? S.remote : [])
  .map((r) => ({ source: String(r?.source || "copyparty").trim(), place: String(r?.server ?? "").trim(), folder: `/${String(r?.folder ?? "").trim().replace(/^\/+|\/+$/g, "")}` }))
  .filter((r) => r.place);

/** An EPUB's title, author and cover (an object URL, null when it has none), read from the book itself. */
export async function bookFacts(url) {
  const book = await openEpub(await (await fetch(url)).arrayBuffer());
  const cover = book.cover && book.has(book.cover) ? URL.createObjectURL(await book.blob(book.cover)) : null;
  return { title: book.title, author: book.author, cover };
}

export default function mount(host, atlas) {
  const S = atlas.plugin.settings ?? {};
  const folder = String(S.folder || "books").replace(/^\/+|\/+$/g, "");
  const eink = !!atlas.eink?.on;
  const paged = eink || S.flow !== "scrolled";
  const root = el("div", "books");
  root.tabIndex = 0;
  host.append(style(), root);
  const stack = [];
  let leave = () => {};
  let gone = false;
  const show = (draw) => { leave(); leave = () => {}; root.replaceChildren(); leave = draw() ?? (() => {}); root.focus({ preventScroll: true }); };
  const push = (screen) => { stack.push(screen); show(screen); };
  const back = () => { if (stack.length > 1) { stack.pop(); show(stack.at(-1)); } };

  // ---- where you are: one file per library, read again before each write (another device may have written) ----
  // Where you are lives in the book's note, as the native reader writes it (android/Shelf.java): progress: 42% · reading_chapter: 4 ·
  // reading_at: 25.12% · last_read: <ISO>. A book only in an old reading.json is read from there.
  // the book's one note (the core says which: a paper's PDF has the paper's note, else `<name>.md` beside it — the user,
  // 2026-10-18: one note per thing); an Atlas without `companion`: beside it
  const notes = new Map();
  const noteOf = (book) => {
    if (!notes.has(book)) notes.set(book, Promise.resolve(atlas.companion ? atlas.companion(book, { find: true }) : notePathOf(book)).catch(() => notePathOf(book)));
    return notes.get(book);
  };
  const readingPath = `${folder}/${READING}`;
  const oldReading = async () => { try { return JSON.parse(await atlas.readText(readingPath)); } catch { return {}; } };
  const pct = (v) => { const t = String(v ?? "").trim(); const n = parseFloat(t); return Number.isFinite(n) ? (t.includes("%") ? n / 100 : n) : 0; };
  const entryOf = async (book) => {
    try {
      const p = await atlas.noteProps(await noteOf(book));
      if (p.reading_chapter != null) return { spine: Math.max(0, Number(p.reading_chapter) - 1), at: pct(p.reading_at), progress: pct(p.progress), updated: String(p.last_read ?? "") };
    } catch { /* no note yet */ }
    return (await oldReading()).books?.[book];
  };
  /** `{ books: { <path>: entry } }` for the library's list. */
  const reading = async (books) => {
    const out = {};
    await Promise.all(books.map(async (b) => { const e = await entryOf(b.path); if (e) out[b.path] = e; }));
    return { books: out };
  };
  let writes = Promise.resolve();
  const saveAt = (book, spine, at) => {
    writes = writes.then(async () => {
      const note = await noteOf(book);
      const name = book.split("/").pop();
      await atlas.createFile(note, newNote(book, { title: name.replace(EPUB, "") })); // a note of its own when none (false when there is)
      const r = (n, d) => `${Math.round(n * 100 * 10 ** d) / 10 ** d}%`;
      await atlas.writeProperty(note, "reading_chapter", String(spine + 1));
      await atlas.writeProperty(note, "reading_at", r(at, 2));
      await atlas.writeProperty(note, "last_read", new Date().toISOString().replace(/\.\d+Z$/, "Z"));
    }).catch((e) => atlas.toast("Books", `Not saved: ${e.message ?? e}`, "error"));
  };

  const opened = new Map(); // path → Promise<book>
  const load = (path) => {
    if (!opened.has(path)) opened.set(path, Promise.resolve(atlas.fileUrl(path)).then((u) => fetch(u)).then((r) => r.arrayBuffer()).then(openEpub));
    return opened.get(path);
  };
  const scan = () => booksIn(atlas, folder);

  // ---- Library ------------------------------------------------------------------------------------------
  function library() {
    const head = el("div", "b-bar");
    head.append(el("div", "b-title", "Books"));
    const grid = el("div", "b-grid");
    root.append(head, grid);
    grid.append(el("div", "atlas-empty", "Reading the library…"));
    const covers = [];
    void scan().then(async (all) => [all, await reading(all)]).then(([all, r]) => {
      if (gone) return;
      grid.replaceChildren();
      if (!all.length) {
        const n = el("div", "atlas-notice");
        n.append(el("strong", "", "No books yet. "), `Put .epub files in “${folder}/”, or change the folder in the plugin's settings.`);
        const a = el("div", "actions"), b = el("button", "atlas-btn", "Settings…");
        b.onclick = () => atlas.plugin.openSettings();
        a.append(b); n.append(a); grid.replaceWith(n);
        return;
      }
      all.sort((a, b) => (r.books?.[b.path]?.updated ?? "").localeCompare(r.books?.[a.path]?.updated ?? "") || a.name.localeCompare(b.name));
      for (const b of all) {
        const card = el("button", "b-card");
        const pic = el("div", "b-cover"), img = el("img"), name = el("div", "b-name", b.name), who = el("div", "b-who", "");
        img.alt = "";
        pic.append(img);
        const pos = r.books?.[b.path];
        if (pos) pic.append(el("span", "b-badge", "reading"));
        card.append(pic, name, who);
        card.onclick = () => push(() => reader(b.path));
        grid.append(card);
        void load(b.path).then(async (book) => {
          if (book.title) name.textContent = book.title;
          who.textContent = book.author;
          if (book.cover && book.has(book.cover)) { const u = URL.createObjectURL(await book.blob(book.cover)); covers.push(u); img.src = u; }
        }).catch(() => { who.textContent = "cannot be read"; });
      }
    });
    return () => { for (const u of covers) URL.revokeObjectURL(u); };
  }

  // ---- Reader -------------------------------------------------------------------------------------------
  // `anchor`: a link's `#Chapter 3` (atlas.anchor, API 7) — that entry of the contents instead of where you were
  function reader(path, anchor = "") {
    const bar = el("div", "b-bar");
    const backBtn = el("button", "atlas-btn", "‹ Library"), title = el("div", "b-title", path.split("/").pop().replace(EPUB, ""));
    const tocBtn = el("button", "atlas-btn", "Contents"), findBtn = el("button", "atlas-btn", "Search"), where = el("span", "b-where", "");
    findBtn.title = "Search the whole book (/ or Ctrl+F)";
    const hlBtn = el("button", "atlas-btn", "Highlight");
    hlBtn.title = "Keep the selected passage in the book's note (beside the book)";
    hlBtn.disabled = true;
    backBtn.onclick = back;
    if (stack.length < 2) backBtn.hidden = true; // opened straight from a file
    bar.append(backBtn, title, where, hlBtn, findBtn, tocBtn);
    const frame = el("iframe", "b-frame");
    frame.setAttribute("sandbox", "allow-same-origin"); // the book's own scripts never run
    frame.title = "The book";
    const toc = el("div", "b-toc");
    toc.hidden = true;
    // the search: a panel like the contents, every place the words occur in the book, chapter by chapter
    const finder = el("div", "b-toc b-find"), query = el("input"), found = el("div", "b-found"), count = el("div", "b-count");
    query.type = "search";
    query.placeholder = "Search the book";
    query.setAttribute("aria-label", "Search the book");
    finder.append(query, count, found);
    finder.hidden = true;
    root.append(bar, frame, toc, finder);
    let book = null, spine = 0, made = [], turns = 0, chapterReady = Promise.resolve();
    const doc = () => frame.contentDocument;
    const width = () => frame.clientWidth;
    const pages = () => (paged ? Math.max(1, Math.round(doc().documentElement.scrollWidth / width())) : 1);
    const fraction = () => {
      const d = doc()?.documentElement;
      if (!d) return 0;
      return paged ? d.scrollLeft / Math.max(1, d.scrollWidth - width()) : d.scrollTop / Math.max(1, d.scrollHeight - d.clientHeight);
    };
    const say = () => {
      const d = doc()?.documentElement;
      if (!d) return;
      where.textContent = paged ? `${Math.round(d.scrollLeft / width()) + 1} / ${pages()} · chapter ${spine + 1} of ${book.spine.length}` : `chapter ${spine + 1} of ${book.spine.length}`;
    };
    let saving = 0;
    const remember = () => { clearTimeout(saving); saving = setTimeout(() => saveAt(path, spine, fraction()), 600); };
    const typography = () => {
      const font = S.font === "the book's own" ? "" : S.font === "the app's" ? "font-family: var(--atlas-font, system-ui, sans-serif) !important;" : `font-family: ${S.font === "sans-serif" ? "system-ui, sans-serif" : "Georgia, 'Noto Serif', serif"} !important;`;
      const size = Number(S.size ?? 19), line = Number(S.line ?? 1.55);
      // a readable measure: on a wide window the text keeps ~36 em (about 70 characters) and centres; narrower, the setting's margins
      const m = Math.max(Number(S.margin ?? 28), Math.round((width() - size * 36) / 2));
      const colors = getComputedStyle(root);
      // paged: the side margins are the column gap (and the page's own padding), so a page is exactly the frame's width
      // and page n starts at n × width — the margins never drift across pages
      const page = paged
        ? `html { height: 100vh; overflow: hidden; padding: 0 ${m}px; box-sizing: border-box; }
           body { height: 100vh; box-sizing: border-box; padding: 24px 0 !important; column-width: ${Math.max(100, width() - 2 * m)}px; column-gap: ${2 * m}px; column-fill: auto; }`
        : `body { padding: 24px ${m}px !important; }`;
      return `html { background: ${colors.getPropertyValue("--bg") || "#fff"}; color: ${colors.getPropertyValue("--text") || "#000"}; }
        body { margin: 0 !important; font-size: ${size}px !important; line-height: ${line} !important; ${font}
               ${S.justify === false ? "" : "text-align: justify; hyphens: auto;"} overflow-wrap: break-word; }
        img, svg, video { max-width: 100% !important; max-height: 88vh !important; height: auto; }
        a { color: inherit; }
        mark.atlas-found { background: ${eink ? "transparent" : "color-mix(in srgb, #4a9eff 40%, transparent)"}; color: inherit; ${eink ? "outline: 2px solid currentColor; outline-offset: 1px;" : ""} }
        mark.atlas-hl { background: ${eink ? "transparent" : "color-mix(in srgb, #f5c542 45%, transparent)"}; color: inherit; ${eink ? "text-decoration: underline 2px; text-underline-offset: 3px;" : ""} }
        ${page}`;
    };
    async function open(i, at = 0, frag = "") {
      for (const u of made) URL.revokeObjectURL(u);
      made = [];
      spine = Math.max(0, Math.min(book.spine.length - 1, i));
      const html = await chapterHtml(book, book.spine[spine], made);
      chapterReady = new Promise((done) => { frame.onload = () => done(); });
      frame.srcdoc = html.replace(/<\/head>/i, `<style>${typography()}</style></head>`);
      await chapterReady;
      const d = doc();
      d.addEventListener("keydown", keys);
      d.addEventListener("click", click);
      d.addEventListener("selectionchange", () => { hlBtn.disabled = !squash(d.getSelection()?.toString() ?? ""); });
      void readNote().then((md) => markPassages(d, highlightsIn(md)));
      d.defaultView?.addEventListener("scroll", () => { say(); remember(); }, { passive: true });
      await d.fonts?.ready;
      const target = frag && d.getElementById(frag);
      if (target && paged) d.documentElement.scrollLeft = Math.floor(target.offsetLeft / width()) * width();
      else if (target) target.scrollIntoView();
      else if (paged) d.documentElement.scrollLeft = Math.round((at < 0 ? 1 : at) * (pages() - 1)) * width();
      else d.documentElement.scrollTop = (at < 0 ? 1 : at) * (d.documentElement.scrollHeight - d.documentElement.clientHeight);
      say();
      remember();
    }
    const readNote = async () => atlas.readText(await noteOf(path)).catch(() => "");
    /** The selection kept in the book's note (made with the book's properties the first time) and marked here. */
    async function highlight() {
      const d = doc(), sel = d?.getSelection(), text = squash(sel?.toString() ?? "");
      if (!text) return;
      const label = book.toc.find((t) => t.path === book.spine[spine])?.label;
      const whereText = `${label ? `${label}, ` : ""}chapter ${spine + 1}`;
      try {
        let md = await readNote();
        if (!md) md = newNote(path, book);
        const notePath = await noteOf(path);
        await atlas.writeText(notePath, md.replace(/\n*$/, "\n") + highlightBlock(text, whereText));
        sel.removeAllRanges();
        hlBtn.disabled = true;
        markPassages(d, [text]);
        atlas.toast("Books", `Kept in ${notePath.split("/").pop()}`);
      } catch (e) { atlas.toast("Books", `Not kept: ${e.message ?? e}`, "error"); }
    }
    hlBtn.onclick = () => void highlight();
    // the pen: a tap is a tap, a line under or through words keeps them, a bar down the margin keeps the lines beside it
    const caret = (d, x, y) => {
      if (d.caretPositionFromPoint) { const c = d.caretPositionFromPoint(x, y); return c && { node: c.offsetNode, at: c.offset }; }
      const r = d.caretRangeFromPoint?.(x, y);
      return r && { node: r.startContainer, at: r.startOffset };
    };
    /** The caret in the text at (x, y), or a little above (a line drawn under the words lies below them). */
    const textCaret = (d, x, y) => {
      const size = Number(S.size ?? 19);
      for (const dy of [0, -0.45 * size, -0.9 * size, 0.3 * size]) {
        const c = caret(d, x, y + dy);
        if (c?.node?.nodeType === 3) return c;
      }
      return null;
    };
    /** The words between two carets, whole (a line rarely starts and ends exactly on a word's edges). */
    const wordsBetween = (d, a, b) => {
      const r = d.createRange();
      r.setStart(a.node, a.at);
      r.setEnd(b.node, b.at);
      if (r.collapsed) { r.setStart(b.node, b.at); r.setEnd(a.node, a.at); } // drawn right to left
      const s = r.startContainer, e = r.endContainer;
      if (s.nodeType === 3) { let i = r.startOffset; while (i > 0 && /\S/.test(s.data[i - 1])) i--; r.setStart(s, i); }
      if (e.nodeType === 3) { let i = r.endOffset; while (i < e.data.length && /\S/.test(e.data[i])) i++; r.setEnd(e, i); }
      return r;
    };
    function fromPen(samples) {
      const d = doc(), f = frame.getBoundingClientRect();
      if (!d || !book) return;
      const g = penGesture(samples.map((p) => ({ x: p.clientX - f.left, y: p.clientY - f.top })));
      if (!g) return;
      if (g.kind === "tap") {
        const target = d.elementFromPoint(g.x, g.y);
        if (target) click({ target, clientX: g.x, clientY: g.y, preventDefault() {} });
        return;
      }
      const m = Math.max(Number(S.margin ?? 28), Math.round((width() - Number(S.size ?? 19) * 36) / 2));
      const [a, b] = g.kind === "line"
        ? [textCaret(d, g.from.x, g.from.y), textCaret(d, g.to.x, g.to.y)]
        : [textCaret(d, m + 2, g.top), textCaret(d, width() - m - 2, g.bottom)]; // a bar, either margin: its lines, whole
      if (!a || !b) return;
      const sel = d.getSelection();
      sel.removeAllRanges();
      sel.addRange(wordsBetween(d, a, b));
      if (squash(sel.toString()).length < 2) { sel.removeAllRanges(); return; }
      void highlight().then(() => atlas.eink.refresh()); // the firmware's quick line off the page with the mark in
    }
    const pen = atlas.eink.pen?.(frame, fromPen, { line: () => [3, 2] });
    function turn(dir) {
      const d = doc()?.documentElement;
      if (!d || !book) return;
      if (paged) {
        const page = Math.round(d.scrollLeft / width());
        if (page + dir < 0) { if (spine > 0) void open(spine - 1, -1); return; }
        if (page + dir >= pages()) { if (spine < book.spine.length - 1) void open(spine + 1, 0); return; }
        d.scrollLeft = (page + dir) * width();
        if (eink && ++turns % 6 === 0) atlas.eink.refresh(); // Mihon's "flash on page change", every few pages
      } else {
        const atEnd = d.scrollTop + d.clientHeight >= d.scrollHeight - 2, atTop = d.scrollTop <= 0;
        if (dir > 0 && atEnd && spine < book.spine.length - 1) return void open(spine + 1, 0);
        if (dir < 0 && atTop && spine > 0) return void open(spine - 1, -1);
        d.scrollBy({ top: dir * d.clientHeight * 0.9 });
      }
      say();
      remember();
    }
    // ---- search: each chapter's text read once (chapterDoc + textMap, as the frame has it), every occurrence listed
    const texts = new Map();
    const chapterText = async (i) => {
      if (!texts.has(i)) texts.set(i, chapterDoc(book, book.spine[i]).then((d) => textMap(d).text, () => ""));
      return texts.get(i);
    };
    let asked = 0;
    async function search() {
      const q = query.value, mine = ++asked, max = 200;
      found.replaceChildren();
      count.textContent = "";
      if (!squash(q) || !book) return;
      let n = 0;
      for (let i = 0; i < book.spine.length && n < max; i++) {
        const hits = occurrences(await chapterText(i), q, max - n);
        if (mine !== asked) return; // typed on meanwhile
        if (!hits.length) continue;
        const label = book.toc.find((t) => t.path === book.spine[i])?.label || `Chapter ${i + 1}`;
        found.append(el("div", "b-found-head", label));
        hits.forEach((h, nth) => {
          const b = el("button", "b-entry b-hit");
          b.append(h.snippet[0], el("b", "", h.snippet[1]), h.snippet[2]);
          b.onclick = () => void goTo(i, q, nth);
          found.append(b);
        });
        n += hits.length;
      }
      count.textContent = n ? `${n}${n >= max ? "+" : ""} found` : "Not in this book.";
    }
    /** Opens chapter `i` at the `nth` occurrence of `q`, marked. */
    async function goTo(i, q, nth) {
      finder.hidden = true;
      if (i !== spine) await open(i, 0);
      const d = doc(), m = d && markFound(d, q, nth);
      if (!m) return;
      if (paged) d.documentElement.scrollLeft = Math.floor((m.getBoundingClientRect().left + d.documentElement.scrollLeft) / width()) * width();
      else m.scrollIntoView({ block: "center" });
      say();
      remember();
    }
    let typing = 0;
    query.oninput = () => { clearTimeout(typing); typing = setTimeout(() => void search(), 250); };
    query.onkeydown = (e) => {
      if (e.key === "Escape") { e.preventDefault(); finder.hidden = true; frame.focus(); }
      else if (e.key === "Enter") { e.preventDefault(); found.querySelector(".b-hit")?.click(); }
      e.stopPropagation(); // typing here never turns a page
    };
    const showFinder = () => { toc.hidden = true; finder.hidden = false; query.focus(); query.select(); };
    findBtn.onclick = () => { if (finder.hidden) showFinder(); else finder.hidden = true; };

    function keys(e) {
      if (e.key === "/" || (e.key === "f" && (e.ctrlKey || e.metaKey))) { e.preventDefault(); showFinder(); }
      else if (["ArrowRight", "PageDown", " "].includes(e.key)) { e.preventDefault(); turn(1); }
      else if (["ArrowLeft", "PageUp"].includes(e.key)) { e.preventDefault(); turn(-1); }
      else if ((e.key === "Escape" || e.key === "Backspace") && (!toc.hidden || !finder.hidden)) { toc.hidden = true; finder.hidden = true; }
      else if (e.key === "Escape" || e.key === "Backspace") back();
    }
    /** A link inside the book is followed inside it; a tap at the sides turns the page (paged). */
    function click(e) {
      const a = e.target.closest?.("a[href]");
      if (a) {
        e.preventDefault();
        const href = a.getAttribute("href");
        if (/^https?:/.test(href)) return void window.open(href, "_blank", "noopener"); // the app's browsing window or the browser
        const r = resolve(book.spine[spine], href), i = book.spine.indexOf(r.path || book.spine[spine]);
        if (i >= 0) void open(i, 0, r.frag);
        return;
      }
      if (!paged) return;
      const x = e.clientX / width();
      if (x < 0.3) turn(-1); else if (x > 0.7) turn(1);
    }
    root.addEventListener("keydown", keys);
    tocBtn.onclick = () => { finder.hidden = true; toc.hidden = !toc.hidden; };
    void (async () => {
      try {
        book = await load(path);
        if (gone) return;
        title.textContent = book.title || title.textContent;
        for (const t of book.toc) {
          const b = el("button", "b-entry", t.label || t.path);
          b.style.paddingLeft = `${12 + t.depth * 16}px`;
          b.onclick = () => { toc.hidden = true; const i = book.spine.indexOf(t.path); if (i >= 0) void open(i, 0, t.frag); };
          toc.append(b);
        }
        if (!book.toc.length) toc.append(el("div", "atlas-empty", "This book has no table of contents."));
        const named = anchor && book.toc.find((t) => t.label.toLowerCase() === anchor.toLowerCase() && book.spine.includes(t.path));
        if (named) { await open(book.spine.indexOf(named.path), 0, named.frag); return; }
        const pos = await entryOf(path);
        await open(pos?.spine ?? 0, pos?.at ?? 0);
      } catch (e) {
        frame.replaceWith(el("div", "atlas-notice", `This book cannot be read: ${e.message ?? e}`));
      }
    })();
    const resize = new ResizeObserver(() => { if (book && paged && doc()) { const f = fraction(); doc().documentElement.scrollLeft = Math.round(f * (pages() - 1)) * width(); say(); } });
    resize.observe(frame);
    return () => { clearTimeout(saving); if (book) saveAt(path, spine, fraction()); resize.disconnect(); pen?.off(); root.removeEventListener("keydown", keys); for (const u of made) URL.revokeObjectURL(u); };
  }

  if (atlas.path && EPUB.test(atlas.path)) {
    stack.push(library);
    push(() => reader(atlas.path, atlas.anchor));
    // a later link to the book at another chapter, while it is open here (API 7)
    atlas.pane?.onAnchor((a) => { stack[stack.length - 1] = () => reader(atlas.path, a); show(stack.at(-1)); });
  }
  else push(library);
  return () => { gone = true; leave(); };
}

function style() {
  const s = document.createElement("style");
  s.textContent = `
  .books { position: relative; height: 100%; display: flex; flex-direction: column; outline: none; background: var(--bg); color: var(--text); font-size: calc(13px * var(--ui-scale, 1)); }
  .books .b-bar { display: flex; align-items: center; gap: 10px; padding: 8px 14px; border-bottom: 1px solid var(--border); background: var(--bg); flex: none; }
  .books .b-title { font-weight: 600; font-size: 1.1em; flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .books .b-where { color: var(--text-muted); font-variant-numeric: tabular-nums; white-space: nowrap; }
  .books .b-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(calc(130px * var(--ui-scale, 1)), 1fr)); gap: 18px; padding: 18px; overflow: auto; }
  .books .b-card { display: flex; flex-direction: column; gap: 6px; text-align: left; background: none; border: 0; padding: 0; color: inherit; cursor: pointer; }
  .books .b-cover { position: relative; aspect-ratio: 2 / 3; border-radius: 6px; overflow: hidden; background: var(--bg-elev); box-shadow: 0 0 0 1px var(--border); }
  .books .b-cover img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .books .b-badge { position: absolute; top: 6px; left: 6px; padding: 0 6px; border-radius: 6px; background: var(--accent); color: var(--accent-fg, #fff); font-size: .85em; }
  .books .b-name { font-weight: 600; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; line-height: 1.3; }
  .books .b-who { color: var(--text-muted); font-size: .92em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .books .b-frame { flex: 1; min-height: 0; width: 100%; border: 0; background: var(--bg); }
  .books .b-toc { position: absolute; top: 46px; right: 0; bottom: 0; width: min(380px, 100%); overflow: auto; background: var(--bg); border-left: 1px solid var(--border); padding: 6px 0; z-index: 3; }
  .books .b-entry { display: block; width: 100%; text-align: left; background: none; border: 0; padding: 9px 12px; color: inherit; font-size: 1.05em; cursor: pointer; }
  .books .b-entry:hover { background: var(--bg-hover); }
  :root.eink .books .b-toc { border-left-width: 2px; }
  .books .b-find { display: flex; flex-direction: column; padding: 10px 0 0; }
  .books .b-find[hidden] { display: none; }
  .books .b-find input { margin: 0 12px 6px; font: inherit; color: var(--text); background: var(--bg-elev); border: 1px solid var(--border-strong); border-radius: var(--radius-sm); padding: 6px 9px; outline: none; }
  .books .b-find input:focus { border-color: var(--accent); }
  .books .b-count { padding: 0 12px 6px; color: var(--text-faint); font-size: 0.9em; }
  .books .b-found { overflow: auto; flex: 1; }
  .books .b-found-head { padding: 10px 12px 4px; color: var(--text-muted); font-weight: 600; font-size: 0.9em; }
  .books .b-hit { font-size: 0.95em; line-height: 1.4; color: var(--text-muted); }
  .books .b-hit b { color: var(--text); background: color-mix(in srgb, var(--accent) 22%, transparent); border-radius: 2px; }
  :root.eink .books .b-hit b { background: none; text-decoration: underline 2px; }
  `;
  return s;
}
