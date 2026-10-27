// Manga — the library pane on the desktop and the web, the same library and reading.json as the Android screens
// (android/Library.java): each folder of the library folder is a series, its .cbz files or picture folders the chapters,
// and where you are is in the series' note (its folder's own `<series>/<name>.md`), so the phone and the desktop carry
// on from each other. Screens as Mihon's: Library (covers, unread counts) → Series (Continue, chapters) →
// Reader (paged right to left / left to right / vertical, or webtoon). A .cbz is unzipped here, in the page.
import { suwayomi, isRemote, PAGE_W } from "./suwayomi.js";

const PICTURE = /\.(jpe?g|png|webp|gif|avif|bmp)$/i;
const ZIP = /\.cb[zr7t]$/i; // a chapter archive; only a .cbz is read in the page, the others made into one (helper.py)
const CBZ = /\.cbz$/i;
const READING = "reading.json"; // the older place file: read once, the note is written from then on

// ---- where you are, in the series' note: reading_chapter · reading_page · last_read
// · chapter_progress (each chapter's page, or "read": JSON text) · reader_options. The screens keep their shape,
// `{ chapters: { <name>: { read, page } }, last, options }` (android/Library.java the same).
export function readingOf(p) {
  let progress = {};
  try { progress = JSON.parse(String(p.chapter_progress ?? "{}")); } catch { /* hand-edited: what the rest says */ }
  const chapters = Object.fromEntries(Object.entries(progress).map(([name, v]) => [name, v === "read" ? { read: true, page: 0 } : { page: Number(v) || 0 }]));
  const last = p.reading_chapter ? String(p.reading_chapter) : undefined;
  if (last && !chapters[last]?.read) chapters[last] = { ...chapters[last], page: Number(p.reading_page) || 0 };
  let options;
  try { options = p.reader_options ? JSON.parse(String(p.reader_options)) : undefined; } catch { /* left out */ }
  return { chapters, ...(last ? { last } : {}), ...(options ? { options } : {}) };
}
export function readingProps(r) {
  const progress = Object.fromEntries(Object.entries(r.chapters ?? {}).filter(([, c]) => c.read || c.page).map(([name, c]) => [name, c.read ? "read" : c.page]));
  return {
    reading_chapter: r.last ?? null, reading_page: r.last ? String(r.chapters?.[r.last]?.page ?? 0) : null,
    last_read: new Date().toISOString().replace(/\.\d+Z$/, "Z"), chapter_progress: JSON.stringify(progress),
    reader_options: r.options ? JSON.stringify(r.options) : null,
  };
}
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };

/** Chapter.natural: digit runs compared as numbers ("ch 9" before "ch 10"), the rest as text. */
export function natural(a, b) {
  const x = a.toLowerCase().match(/\d+|\D+/g) ?? [], y = b.toLowerCase().match(/\d+|\D+/g) ?? [];
  for (let i = 0; i < Math.min(x.length, y.length); i++) {
    const p = x[i], q = y[i];
    const c = /^\d/.test(p) && /^\d/.test(q) ? (BigInt(p) < BigInt(q) ? -1 : BigInt(p) > BigInt(q) ? 1 : 0) : p < q ? -1 : p > q ? 1 : 0;
    if (c) return c;
  }
  return a.length - b.length;
}
/** Library.name: a chapter's key in reading.json, its last path segment (a folder keeps its "/"). */
export const nameOf = (ch) => ch.slice(ch.lastIndexOf("/", ch.length - 2) + 1);
// ---- a .cbz, read in the page: the central directory, then each picture inflated on demand -----------------
// the zip itself: the Zip archives plugin's, shared with Books (manifest `requires = ["zip"]`)
import { zipIndex, zipBlob } from "../zip/zip.js";
/** The zip's pictures, in reading order → [{ name, method, size, at }]. */
export function zipEntries(buf) {
  return [...zipIndex(buf)].filter(([name]) => PICTURE.test(name) && !name.includes("__MACOSX")).map(([name, e]) => ({ name, ...e })).sort((a, b) => natural(a.name, b.name));
}

export default function mount(host, atlas) {
  const S = atlas.plugin.settings ?? {};
  const folder = String(S.folder || "manga").replace(/^\/+|\/+$/g, "");
  const root = el("div", "manga");
  root.tabIndex = 0;
  host.append(style(), root);
  const stack = []; // the screens under the one shown: Back (Escape, Backspace) goes down one
  let leave = () => {}; // the shown screen's cleanup (object URLs, observers)
  let gone = false;

  const show = (draw) => { leave(); leave = () => {}; root.replaceChildren(); leave = draw() ?? (() => {}); root.focus({ preventScroll: true }); };
  const push = (screen) => { stack.push(screen); show(screen); };
  const back = () => { if (stack.length > 1) { stack.pop(); show(stack.at(-1)); } };

  // ---- the library on disk ------------------------------------------------------------------------------
  const entries = (dir) => atlas.list(dir).catch(() => []);
  const chapters = (path) => chaptersOf(atlas, path);
  const suw = suwayomi(atlas, S.suwayomi);
  let remoteTrouble = "";
  /** The folder's series, then the user's Suwayomi library (its chapters asked when a series is opened). */
  async function scan() {
    const out = await seriesIn(atlas, folder);
    remoteTrouble = "";
    if (suw.on) try { out.push(...(await suw.library()).sort((a, b) => natural(a.title, b.title))); } catch (e) { remoteTrouble = String(e.message ?? e); }
    return out;
  }
  /** A Suwayomi series' chapters and where you are, asked of the server once it is opened. */
  const ready = (s) => (s.remote && !s.chapters ? suw.chapters(s) : Promise.resolve());
  // the series' note: the core says which (its folder's own note); an Atlas without `companion`: `<series>/<name>.md`
  const notes = new Map();
  const noteOf = (s) => {
    if (!notes.has(s.path)) notes.set(s.path, Promise.resolve(atlas.companion ? atlas.companion(`${s.path}/`, { find: true }) : `${s.path}/${s.path.split("/").pop()}.md`).catch(() => `${s.path}/${s.path.split("/").pop()}.md`));
    return notes.get(s.path);
  };
  const migrated = new Set();
  async function reading(s) {
    if (s.remote) return s.reading ?? {};
    if (!s.dir) return {};
    try {
      const p = await atlas.noteProps(await noteOf(s));
      if (p.chapter_progress != null || p.reading_chapter != null) return readingOf(p);
    } catch { /* no note yet */ }
    let old;
    try { old = JSON.parse(await atlas.readText(`${s.path}/${READING}`)); } catch { return {}; }
    if (!migrated.has(s.path)) { migrated.add(s.path); void saveReading(s, (r) => Object.assign(r, old)); } // into the note once; `atlas companions` then retires the file
    return old;
  }
  /** Library.mark / setRead: read again just before writing, so what the phone wrote meanwhile is kept. */
  let writes = Promise.resolve(); // one at a time: two read-change-writes at once would each drop the other's change
  function saveReading(s, change) {
    if (s.remote) { // kept here at once, each chapter that changed written back to the server
      const r = (s.reading ??= { chapters: {} }), before = JSON.stringify(r.chapters);
      r.chapters ??= {};
      change(r);
      const was = JSON.parse(before);
      writes = writes.then(() => Promise.all(s.chapters.filter((ch) => JSON.stringify(r.chapters[nameOf(ch)]) !== JSON.stringify(was[nameOf(ch)])).map((ch) => suw.mark(ch, r.chapters[nameOf(ch)]?.page ?? 0, !!r.chapters[nameOf(ch)]?.read))))
        .catch((e) => atlas.toast("Manga", `Not saved on Suwayomi: ${e.message ?? e}`, "error"));
      return writes;
    }
    if (!s.dir) return Promise.resolve();
    writes = writes.then(async () => {
      const r = await reading(s);
      r.chapters ??= {};
      change(r);
      const note = await noteOf(s), title = s.title ?? s.path.split("/").pop();
      await atlas.createFile(note, `---\ntitle: ${JSON.stringify(title)}\n---\n# ${title}\n`); // false when it is there
      for (const [k, v] of Object.entries(readingProps(r))) if (v != null) await atlas.writeProperty(note, k, v);
    }).catch((e) => atlas.toast("Manga", `Not saved: ${e.message ?? e}`, "error"));
    return writes;
  }
  const isRead = (r, ch) => !!r.chapters?.[nameOf(ch)]?.read;
  const pageOf = (r, ch) => r.chapters?.[nameOf(ch)]?.page ?? 0;
  const unread = (s, r) => (s.remote && !s.chapters ? s.unread : s.chapters.filter((ch) => !isRead(r, ch)).length);

  // ---- a chapter's pages: { count, url(i), done() } --------------------------------------------------------
  async function pages(ch) {
    if (isRemote(ch)) return suw.pages(ch);
    if (ch.endsWith("/")) {
      const pics = (await entries(ch.slice(0, -1))).filter((e) => !e.dir && PICTURE.test(e.name)).map((e) => e.path).sort(natural);
      return { count: pics.length, url: (i) => atlas.thumbUrl(pics[i], PAGE_W), done() {} };
    }
    const cbz = CBZ.test(ch) ? ch : (await atlas.helper.call("as_cbz", { path: ch }, { timeout: 600 })).path;
    const buf = await (await fetch(await atlas.fileUrl(cbz))).arrayBuffer();
    const list = zipEntries(buf), made = new Map();
    return {
      count: list.length,
      url(i) { if (!made.has(i)) made.set(i, zipBlob(buf, list[i]).then((b) => URL.createObjectURL(b))); return made.get(i); },
      done() { for (const p of made.values()) void p.then((u) => URL.revokeObjectURL(u)); made.clear(); },
    };
  }
  /** A cover: the series' cover.* picture (Mihon's convention), else its first chapter's first page. */
  async function cover(s) {
    if (s.remote) return suw.cover(s);
    if (s.dir) {
      const own = (await entries(s.path)).find((e) => !e.dir && /^cover\.(jpe?g|png|webp)$/i.test(e.name));
      if (own) return atlas.thumbUrl(own.path, 300);
    }
    const ch = s.chapters[0];
    if (ch.endsWith("/")) {
      const first = (await entries(ch.slice(0, -1))).filter((e) => !e.dir && PICTURE.test(e.name)).map((e) => e.path).sort(natural)[0];
      return first ? atlas.thumbUrl(first, 300) : null;
    }
    const p = await pages(ch);
    return p.count ? p.url(0) : null; // kept for the pane's life: the grid shows it again on Back
  }
  const covers = new Map(); // series path → Promise<url | null>
  const coverOf = (s) => { if (!covers.has(s.path)) covers.set(s.path, cover(s).catch(() => null)); return covers.get(s.path); };

  // ---- Library ------------------------------------------------------------------------------------------
  function library() {
    const head = el("div", "m-bar");
    head.append(el("div", "m-title", "Library"));
    const grid = el("div", "m-grid");
    root.append(head, grid);
    grid.append(el("div", "atlas-empty", "Reading the library…"));
    const seen = new IntersectionObserver((xs) => { for (const x of xs) if (x.isIntersecting) { seen.unobserve(x.target); x.target.load(); } }, { root, rootMargin: "300px" });
    void scan().then(async (all) => {
      if (gone) return;
      grid.replaceChildren();
      if (remoteTrouble) grid.append(el("div", "atlas-notice", `Suwayomi: ${remoteTrouble}`));
      if (!all.length && !remoteTrouble) {
        const n = el("div", "atlas-notice");
        n.append(el("strong", "", "No series yet. "), `Put a folder per series in “${folder}/” (its chapters as .cbz files or folders of pictures), or change the folder in the plugin's settings.`);
        const a = el("div", "actions"), b = el("button", "atlas-btn", "Settings…");
        b.onclick = () => atlas.plugin.openSettings();
        a.append(b); n.append(a); grid.replaceWith(n);
        return;
      }
      for (const s of all) {
        const card = el("button", "m-card");
        card.title = s.title;
        const pic = el("div", "m-cover"), img = el("img");
        img.alt = "";
        const badge = el("span", "m-badge");
        pic.append(img, badge);
        card.append(pic, el("div", "m-name", s.title));
        card.load = () => void coverOf(s).then((u) => { if (u) img.src = u; });
        card.onclick = () => void ready(s).then(() => push(() => series(s)), (e) => atlas.toast("Manga", `${s.title}: ${e.message ?? e}`, "error"));
        grid.append(card);
        seen.observe(card);
        void reading(s).then((r) => { const n = unread(s, r); badge.textContent = n ? String(n) : ""; badge.hidden = !n; });
      }
    });
    return () => seen.disconnect();
  }

  // ---- Series -------------------------------------------------------------------------------------------
  /** SeriesView.resume: the chapter last read if unfinished, else the first unread one, else the first. */
  function resume(s, r) {
    const i = s.chapters.findIndex((ch) => nameOf(ch) === r.last && !isRead(r, ch));
    if (i >= 0) return [i, pageOf(r, s.chapters[i])];
    const j = s.chapters.findIndex((ch) => !isRead(r, ch));
    return j >= 0 ? [j, pageOf(r, s.chapters[j])] : [0, 0];
  }
  function series(s) {
    const head = el("div", "m-bar");
    const backBtn = el("button", "atlas-btn", "‹ Library");
    backBtn.onclick = back;
    head.append(backBtn, el("div", "m-title", s.title));
    const top = el("div", "m-series"), pic = el("div", "m-cover big"), img = el("img"), side = el("div", "m-side");
    img.alt = "";
    pic.append(img);
    void coverOf(s).then((u) => { if (u) img.src = u; });
    const count = el("div", "m-count"), go = el("button", "atlas-btn primary");
    side.append(el("h2", "", s.title), count, go);
    top.append(pic, side);
    const list = el("div", "m-chapters");
    root.append(head, top, list);
    const draw = (r) => {
      const n = unread(s, r);
      count.textContent = `${s.chapters.length} chapter${s.chapters.length === 1 ? "" : "s"} · ${n ? `${n} unread` : "all read"}`;
      go.textContent = n === s.chapters.length && !r.last ? "Start" : n === 0 ? "Read again" : "Continue";
      go.onclick = () => { const [i, p] = resume(s, r); read(s, i, p); };
      list.replaceChildren();
      s.chapters.forEach((ch, i) => {
        const row = el("button", "m-ch");
        row.classList.toggle("read", isRead(r, ch));
        row.title = "Click: read · right-click: mark read / unread";
        const page = pageOf(r, ch);
        row.append(el("span", "m-ch-name", ch.endsWith("/") ? nameOf(ch).slice(0, -1) : nameOf(ch).replace(ZIP, "")), el("span", "m-ch-at", isRead(r, ch) ? "read" : page ? `page ${page + 1}` : ""));
        row.onclick = () => read(s, i, isRead(r, ch) ? 0 : page);
        row.oncontextmenu = (e) => {
          e.preventDefault();
          const read = !isRead(r, ch);
          void saveReading(s, (x) => { const c = (x.chapters[nameOf(ch)] ??= {}); c.read = read; if (!read) c.page = 0; }).then(refresh);
        };
        list.append(row);
      });
    };
    const refresh = () => reading(s).then((r) => { if (!gone) draw(r); });
    void refresh();
    show.refresh = refresh;
    return () => { show.refresh = null; };
  }

  // ---- Reader -------------------------------------------------------------------------------------------
  /** On the phone the app's own reader takes the chapter (the pen, e-ink paging; it keeps its place itself); here, the
   *  page's. A folder chapter is handed with its trailing slash, which is how the app tells it from any other path. */
  function read(s, i, page) {
    if (!atlas.openNative?.(s.chapters[i])) push(() => reader(s, i, page));
  }
  function reader(s, index, start) {
    const mode = String(S.mode || "right to left"), webtoon = mode === "webtoon", rtl = mode === "right to left";
    const fit = String(S.scale || "fit screen").replace(/\s+/g, "-");
    const view = el("div", `m-reader ${webtoon ? "webtoon" : "paged"} ${fit} bg-${String(S.background || "automatic")}`);
    const bar = el("div", "m-bar m-over");
    const backBtn = el("button", "atlas-btn", "‹ " + s.title);
    backBtn.onclick = back;
    const where = el("div", "m-title");
    bar.append(backBtn, where);
    const num = el("div", "m-num");
    num.hidden = S.page_number === false;
    root.append(view, bar, num);
    let ch = null, page = 0, saveT = 0, pending = null, barOn = false;
    const setBar = (on) => { barOn = on; bar.classList.toggle("on", on); };
    const label = () => `${nameOf(s.chapters[index]).replace(/\/$/, "").replace(ZIP, "")} · ${page + 1} / ${ch?.count ?? "…"}`;
    // the page shown, saved once the reader rests on it; flushed at once on a chapter change and on leaving
    const flush = () => { clearTimeout(saveT); const f = pending; pending = null; if (f) void saveReading(s, f); };
    const remember = () => {
      clearTimeout(saveT);
      const at = page, of = ch.count, name = nameOf(s.chapters[index]);
      pending = (r) => { const c = (r.chapters[name] ??= {}); c.page = at; if (at >= of - 1) c.read = true; r.last = name; };
      saveT = setTimeout(flush, 400);
    };
    // e-ink: a full refresh every N page turns (Mihon's option) clears the ghosts of the last pages
    let turns = 0;
    const every = Number(S.flash_every ?? 1);
    const shown = () => {
      num.textContent = `${page + 1} / ${ch.count}`; where.textContent = label(); remember();
      if (!webtoon && atlas.eink?.on && every > 0 && ++turns % every === 0) atlas.eink.refresh(); // webtoon: eink.ts refreshes when a scroll rests
    };

    async function open(i, at) {
      flush();
      ch?.done();
      index = i;
      view.replaceChildren(el("div", "atlas-empty", "Opening the chapter…"));
      try { ch = await pages(s.chapters[i]); } catch (e) { view.replaceChildren(el("div", "atlas-notice error", `This chapter did not open: ${e.message ?? e}`)); return; }
      if (gone) return ch.done();
      if (!ch.count) { view.replaceChildren(el("div", "atlas-notice", "This chapter has no pictures.")); return; }
      page = Math.max(0, Math.min(at === -1 ? ch.count - 1 : at, ch.count - 1));
      ink = webtoon ? [] : await readInk();
      view.replaceChildren();
      if (webtoon) strip(); else void draw();
    }
    // the pen's ink over the page (written on the phone: the app's PageInk), kept by the core in the series' note (a
    // block per chapter, pages from 1) and drawn as Atlas draws a PDF's marks; an Atlas before API 14: none
    const over = el("div", "m-ink");
    let ink = [], inkNote = null;
    const readInk = () => (isRemote(s.chapters[index]) || !atlas.marks ? Promise.resolve({ note: null, marks: [] }) : atlas.marks(s.chapters[index]))
      .then((r) => { inkNote = r.note; return r.marks; }, () => []);
    function drawInk() {
      over.replaceChildren();
      if (webtoon || !img.naturalWidth || !atlas.marksSvg) return;
      Object.assign(over.style, { left: `${img.offsetLeft}px`, top: `${img.offsetTop}px`, width: `${img.offsetWidth}px`, height: `${img.offsetHeight}px` });
      if (ink.some((m) => m.page === page + 1)) over.append(atlas.marksSvg(ink, page + 1));
    }
    const offInk = atlas.onFilesChanged((paths) => { if (ch && inkNote && paths.includes(inkNote)) void readInk().then((k) => { ink = k; drawInk(); }); });
    const sized = new ResizeObserver(() => drawInk());
    // paged: one picture, the next one fetched ahead
    const img = el("img", "m-page");
    img.alt = "";
    img.onload = () => drawInk();
    sized.observe(view);
    async function draw() {
      if (!img.isConnected) view.replaceChildren(img, over);
      img.src = await ch.url(page);
      view.scrollTop = 0;
      shown();
      if (page + 1 < ch.count) void ch.url(page + 1);
    }
    function turn(d) {
      if (!ch) return;
      if (webtoon) { view.scrollBy({ top: d * view.clientHeight * 0.85 }); return; }
      const p = page + d;
      if (p >= 0 && p < ch.count) { page = p; void draw(); return; }
      if (p < 0 && index > 0) void open(index - 1, -1);
      else if (p >= ch.count && index + 1 < s.chapters.length) void open(index + 1, 0);
      else atlas.toast("Manga", p < 0 ? "This is the first chapter." : "That was the last chapter.");
    }
    // webtoon: every picture under the other, the page in view is where you are
    let watch = null;
    function strip() {
      watch?.disconnect();
      const load = new IntersectionObserver((xs) => { for (const x of xs) if (x.isIntersecting) { load.unobserve(x.target); void ch.url(+x.target.dataset.i).then((u) => (x.target.src = u)); } }, { root: view, rootMargin: "150% 0px" });
      const at = new IntersectionObserver((xs) => { for (const x of xs) if (x.isIntersecting) { page = +x.target.dataset.i; shown(); } }, { root: view, threshold: 0.5 });
      watch = { disconnect: () => { load.disconnect(); at.disconnect(); } };
      for (let i = 0; i < ch.count; i++) {
        const p = el("img", "m-page");
        p.alt = ""; p.dataset.i = String(i);
        view.append(p); load.observe(p); at.observe(p);
      }
      const goto = view.children[page];
      if (goto) requestAnimationFrame(() => goto.scrollIntoView());
      const next = el("button", "atlas-btn m-next", index + 1 < s.chapters.length ? "Next chapter ›" : "The last chapter");
      next.disabled = index + 1 >= s.chapters.length;
      next.onclick = () => void open(index + 1, 0);
      view.append(next);
      shown();
    }

    // Mihon's tap zones, as ReaderView.zone (x, y from 0 to 1): +1 next, -1 previous (left to right), 0 the bar, null nothing
    function zone(x, y) {
      const kind = String(S.taps || "default");
      let t;
      switch (kind) {
        case "off": t = x > 0.33 && x < 0.66 && y > 0.33 && y < 0.66 ? 0 : null; break;
        case "Kindle": t = x < 0.33 ? -1 : x < 0.66 && y < 0.33 ? 0 : 1; break;
        case "edge": t = x < 0.15 || x > 0.85 ? 1 : y > 0.33 && y < 0.66 ? 0 : -1; break;
        case "right and left": t = x < 0.4 ? -1 : x > 0.6 ? 1 : 0; break;
        case "L-shaped": t = (x < 0.33 && y < 0.66) || (y < 0.33 && x < 0.66) ? -1 : x > 0.33 && x < 0.66 && y > 0.33 && y < 0.66 ? 0 : 1; break;
        default: t = x < 0.33 ? -1 : x > 0.66 ? 1 : 0;
      }
      if (mode === "vertical" && kind === "default") t = y < 0.33 ? -1 : y > 0.66 ? 1 : 0;
      if (S.invert_taps && t) t = -t;
      return t;
    }
    view.onclick = (e) => {
      if (webtoon) { setBar(!barOn); return; }
      const r = view.getBoundingClientRect();
      let t = zone((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
      if (t === null) return;
      if (t === 0) { setBar(!barOn); return; }
      if (barOn) { setBar(false); return; } // as ReaderView.act: a tap with the bar up only puts it away
      if (rtl) t = -t; // right to left: the left side goes on
      turn(t);
    };
    const keys = (e) => {
      const k = e.key;
      const fwd = rtl ? "ArrowLeft" : "ArrowRight", bwd = rtl ? "ArrowRight" : "ArrowLeft";
      if (k === fwd || k === " " || k === "PageDown" || (!webtoon && k === "ArrowDown")) turn(1);
      else if (k === bwd || k === "PageUp" || (!webtoon && k === "ArrowUp")) turn(-1);
      else return;
      e.preventDefault(); e.stopPropagation();
    };
    root.addEventListener("keydown", keys);
    void open(index, start);
    return () => { flush(); offInk(); sized.disconnect(); root.removeEventListener("keydown", keys); watch?.disconnect(); ch?.done(); };
  }

  root.addEventListener("keydown", (e) => {
    if ((e.key === "Escape" || e.key === "Backspace") && stack.length > 1 && !(e.target instanceof HTMLInputElement)) { e.preventDefault(); back(); show.refresh?.(); }
  });

  // what the pane was opened on: a .cbz ("Open with…") reads it at once, its series under it
  if (atlas.path && ZIP.test(atlas.path)) {
    const dir = atlas.path.slice(0, atlas.path.lastIndexOf("/"));
    stack.push(library);
    void chapters(dir).then((list) => {
      const inSeries = list.includes(atlas.path);
      const s = inSeries ? { path: dir, title: dir.split("/").pop(), chapters: list, dir: true } : { path: atlas.path, title: atlas.path.split("/").pop().replace(ZIP, ""), chapters: [atlas.path], dir: false };
      stack.push(() => series(s));
      void reading(s).then((r) => push(() => reader(s, s.chapters.indexOf(atlas.path), isRead(r, atlas.path) ? 0 : pageOf(r, atlas.path))));
    });
  } else if (atlas.arg) { // a series of the Libraries page's Comics
    stack.push(library);
    void scan().then((all) => {
      const s = all.find((x) => x.path === atlas.arg);
      if (s) void ready(s).then(() => push(() => series(s))); else show(library);
    });
  } else push(library);
  return () => { gone = true; leave(); };
}

function style() {
  const s = document.createElement("style");
  s.textContent = `
  .manga { position: relative; height: 100%; overflow: auto; outline: none; background: var(--bg); color: var(--text); font-size: calc(13px * var(--ui-scale, 1)); }
  .manga .m-bar { display: flex; align-items: center; gap: 10px; padding: 8px 14px; border-bottom: 1px solid var(--border); position: sticky; top: 0; background: var(--bg); z-index: 2; }
  .manga .m-title { font-weight: 600; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .manga .m-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(130px, 1fr)); gap: 14px; padding: 14px; }
  .manga .m-card { display: flex; flex-direction: column; gap: 6px; text-align: left; background: none; border: 0; padding: 0; color: inherit; font: inherit; cursor: pointer; }
  .manga .m-cover { position: relative; aspect-ratio: 2 / 3; border-radius: 8px; overflow: hidden; background: var(--bg-elev); box-shadow: 0 0 0 1px var(--border); }
  .manga .m-cover img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .manga .m-cover img:not([src]) { visibility: hidden; }
  .manga .m-badge { position: absolute; top: 6px; left: 6px; min-width: 1.6em; padding: 0 5px; border-radius: 6px; background: var(--accent); color: var(--accent-fg, #fff); font-weight: 600; text-align: center; font-size: .9em; }
  .manga .m-name { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; line-height: 1.3; }
  .manga .m-series { display: flex; gap: 18px; padding: 18px; align-items: flex-end; }
  .manga .m-cover.big { width: 140px; flex: none; }
  .manga .m-side h2 { margin: 0 0 6px; font-size: 1.35em; }
  .manga .m-count { color: var(--text-muted); margin-bottom: 12px; }
  .manga .m-chapters { display: flex; flex-direction: column; padding: 0 10px 20px; }
  .manga .m-ch { display: flex; justify-content: space-between; gap: 12px; padding: 10px 8px; border: 0; border-bottom: 1px solid var(--border); background: none; color: var(--text); font: inherit; text-align: left; cursor: pointer; }
  .manga .m-ch:hover { background: var(--bg-hover); }
  .manga .m-ch.read .m-ch-name { color: var(--text-faint); }
  .manga .m-ch-at { color: var(--text-muted); white-space: nowrap; }
  .manga .m-reader { position: absolute; inset: 0; overflow: auto; display: flex; align-items: center; justify-content: center; background: var(--bg); }
  .manga .m-reader.bg-black { background: #000; } .manga .m-reader.bg-white { background: #fff; } .manga .m-reader.bg-grey { background: #888; }
  .manga .m-reader.webtoon { flex-direction: column; justify-content: flex-start; }
  .manga .m-ink { position: absolute; pointer-events: none; }
  .manga .m-reader.webtoon .m-page { width: min(100%, 900px); min-height: 40vh; display: block; }
  .manga .m-reader.paged.fit-screen .m-page { max-width: 100%; max-height: 100%; object-fit: contain; }
  .manga .m-reader.paged.fit-width { align-items: flex-start; } .manga .m-reader.paged.fit-width .m-page { width: 100%; }
  .manga .m-reader.paged.fit-height .m-page { height: 100%; }
  .manga .m-next { margin: 20px auto 40px; }
  .manga .m-over { position: absolute; left: 0; right: 0; top: 0; visibility: hidden; }
  .manga .m-over.on { visibility: visible; }
  .manga .m-num { position: absolute; bottom: 6px; left: 50%; transform: translateX(-50%); padding: 1px 8px; border-radius: 6px; background: var(--bg-elev); color: var(--text-muted); font-size: .9em; pointer-events: none; }
  .manga .atlas-notice { margin: 18px; }
  `;
  return s;
}

/** A series' chapters: its .cbz files and picture folders; a folder of pictures alone is one chapter. */
export async function chaptersOf(atlas, path) {
  const list = await atlas.list(path).catch(() => []), out = [];
  let pictures = false;
  for (const e of list) {
    if (e.dir) out.push(e.path + "/");
    else if (ZIP.test(e.name)) out.push(e.path);
    else if (PICTURE.test(e.name)) pictures = true;
  }
  if (!out.length && pictures) out.push(path + "/");
  return out.sort(natural);
}

/** The library folder's series: each folder holding chapters, and each loose .cbz. */
export async function seriesIn(atlas, folder) {
  const out = [];
  if (atlas.exists && !(await atlas.exists(folder))) return out; // a vault with only Suwayomi: no 404 for the folder
  for (const e of await atlas.list(folder).catch(() => [])) {
    if (e.dir) { const ch = await chaptersOf(atlas, e.path); if (ch.length) out.push({ path: e.path, title: e.name, chapters: ch, dir: true }); }
    else if (ZIP.test(e.name)) out.push({ path: e.path, title: e.name.replace(ZIP, ""), chapters: [e.path], dir: false });
  }
  return out.sort((a, b) => natural(a.title, b.title));
}
