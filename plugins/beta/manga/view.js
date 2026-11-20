// Manga — the series and reader pane on the desktop and the web (the library is the Libraries page's Comics, main.js),
// over the same files as the Android screens (android/Library.java): each folder of the library folder is a series, its .cbz files or picture folders the chapters,
// and where you are is in the series' note (its folder's own `<series>/<name>.md`), so the phone and the desktop carry
// on from each other. Screens as Mihon's: Series (Continue, chapters) →
// Reader (paged right to left / left to right / vertical, or webtoon). A .cbz is unzipped here, in the page.
import { suwayomi, isRemote, PAGE_W, engagement } from "./suwayomi.js";

const PICTURE = /\.(jpe?g|png|webp|gif|avif|jxl|bmp)$/i;
const ZIP = /\.cb[zr7t]$/i; // a chapter archive; only a .cbz is read in the page, the others made into one (helper/helper.ts)
const CBZ = /\.cbz$/i;
const READING = "reading.json";
/** What the pane is opened on to browse the server's sources (main.js's command; on the phone `manga:browse`). */
export const BROWSE = "suwayomi:browse";
/** The pane on the server's own library (Suwayomi's): its own tab, apart from the Libraries page's Comics (what is yours). */
export const SERVER = "suwayomi:library";
const MODES = ["right to left", "left to right", "vertical", "webtoon"], SCALES = ["fit screen", "fit width", "fit height", "original"]; // plugin.toml's choices
const KEEP = 5; // chapters a Suwayomi series keeps for offline at a click // the older place file: read once, the note is written from then on

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
/** The zip's pictures, in reading order → [{ name, method, size, at }]; `index` is `atlas.zip.index(buf)`. */
export function zipEntries(index) {
  return [...index].filter(([name]) => PICTURE.test(name) && !name.includes("__MACOSX")).map(([name, e]) => ({ name, ...e })).sort((a, b) => natural(a.name, b.name));
}
/** Whether a picture needs the core's decoder → "jxl" | "avif" | null, by its name or its first bytes (a page named
 *  .jpg that is a JPEG XL is common in scanlation archives). Browsers and Android's WebView show no JPEG XL, WebKitGTK
 *  can hang on one, and AVIF is not decoded everywhere: those go through the core (`thumbs.rs`), as a Suwayomi page does. */
export function coreDecodes(name, head) {
  const b = head ?? new Uint8Array(0), at = (i, text) => [...text].every((c, j) => b[i + j] === c.charCodeAt(0));
  if ((b[0] === 0xff && b[1] === 0x0a) || (at(4, "JXL ") && b[3] === 0x0c)) return "jxl";
  if (at(4, "ftyp") && at(8, "avif")) return "avif";
  const ext = /\.(jxl|avif)$/i.exec(name)?.[1]?.toLowerCase();
  return b.length >= 12 ? null : ext ?? null; // bytes that say otherwise win over the name
}
/** A short stable key for a path (FNV-1a), naming a chapter's folder in the cache. */
const keyOf = (text) => { let h = 0x811c9dc5; for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193); return (h >>> 0).toString(36); };

export default function mount(host, atlas) {
  const S = atlas.plugin.settings ?? {};
  const folder = String(S.folder || "manga").replace(/^\/+|\/+$/g, "");
  const root = el("div", "manga");
  root.tabIndex = 0;
  host.append(style(), root);
  const stack = []; // the screens under the one shown: Back (Escape, Backspace) goes down one, from the series to the library
  let leave = () => {}; // the shown screen's cleanup (object URLs, observers)
  let gone = false;

  const show = (draw) => { leave(); leave = () => {}; root.replaceChildren(); leave = draw() ?? (() => {}); root.focus({ preventScroll: true }); };
  const push = (screen) => { stack.push(screen); show(screen); };
  const toLibrary = () => atlas.openLibrary("comics");
  const back = () => { if (stack.length > 1) { stack.pop(); show(stack.at(-1)); } else toLibrary(); };

  // ---- the library on disk ------------------------------------------------------------------------------
  const entries = (dir) => atlas.list(dir).catch(() => []);
  const chapters = (path) => chaptersOf(atlas, path);
  const suw = suwayomi(atlas, S.suwayomi);
  let remoteTrouble = "";
  /** The folder's series, then the user's Suwayomi library (its chapters asked when a series is opened). */
  async function scan() {
    const out = await seriesIn(atlas, folder);
    remoteTrouble = "";
    if (suw.on) try { out.push(...(await suw.library()).sort((a, b) => natural(a.title, b.title))); remoteTrouble = suw.offline; } catch (e) { remoteTrouble = String(e.message ?? e); }
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
  /** The series' one note by the catalog's rule (its `note` tool, DESIGN-server-libraries §3): found, or made once the
   *  series is yours (`why`: engagement()). A vault series' note is its folder's (made by the core), a server's in the
   *  catalog's Manga folder. Without the catalog, a vault series still gets its folder's note from the core once read. */
  async function thingNote(s, why) {
    const title = s.title ?? s.path.split("/").pop();
    const thing = s.remote ? await suw.thing(s) : { kind: "manga", file: `${s.path}/`, fields: { title } };
    if (!thing) return null;
    try {
      const r = await atlas.post("/api/plugins/@catalog/tools/note", { ...thing, ...why });
      if (r?.path) notes.set(s.path, Promise.resolve(r.path));
      return r?.path ?? null;
    } catch {
      if (s.remote || why.why === "opened" || !atlas.companion) return null;
      const p = await atlas.companion(`${s.path}/`, { find: false, title });
      notes.set(s.path, Promise.resolve(p));
      return p;
    }
  }
  /** A server series' note told where you are (`reading_chapter`, `last_read`; the place itself is the server's), the
   *  note asked for once it is yours and remembered for the pane's life. */
  const remoteNotes = new Map(), remoteTold = new Map();
  async function remoteNote(s, r, why) {
    let note = remoteNotes.get(s.path);
    if (note === null) return; // asked once this pane and none could be made (no catalog, the server out of reach)
    if (note === undefined) {
      if (why.why === "opened") return;
      note = await thingNote(s, why).catch(() => null);
      remoteNotes.set(s.path, note);
      if (!note) return;
    }
    if (!r.last || remoteTold.get(s.path) === r.last) return;
    remoteTold.set(s.path, r.last);
    await atlas.writeProperty(note, "reading_chapter", r.last);
    await atlas.writeProperty(note, "last_read", new Date().toISOString().replace(/\.\d+Z$/, "Z"));
  }
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
    if (!migrated.has(s.path)) { migrated.add(s.path); void saveReading(s, (r) => Object.assign(r, old), { why: "progress", progress: 1 }); } // into the note once; `atlas companions` then retires the file
    return old;
  }
  /** Library.mark / setRead: read again just before writing, so what the phone wrote meanwhile is kept. */
  let writes = Promise.resolve(); // one at a time: two read-change-writes at once would each drop the other's change
  function saveReading(s, change, why = { why: "opened" }) {
    if (s.remote) { // kept here at once, each chapter that changed written back to the server
      const r = (s.reading ??= { chapters: {} }), before = JSON.stringify(r.chapters);
      r.chapters ??= {};
      change(r);
      const was = JSON.parse(before);
      writes = writes.then(() => Promise.all(s.chapters.filter((ch) => JSON.stringify(r.chapters[nameOf(ch)]) !== JSON.stringify(was[nameOf(ch)])).map((ch) => suw.mark(ch, r.chapters[nameOf(ch)]?.page ?? 0, !!r.chapters[nameOf(ch)]?.read))))
        .then(() => remoteNote(s, r, why).catch(() => {}))
        .catch((e) => atlas.toast("Manga", `Not saved on Suwayomi: ${e.message ?? e}`, "error"));
      return writes;
    }
    if (!s.dir) return Promise.resolve();
    writes = writes.then(async () => {
      const r = await reading(s);
      r.chapters ??= {};
      change(r);
      // the note made only once the series is yours, by the catalog's rule (never written here)
      const note = (await atlas.exists(await noteOf(s)).catch(() => false)) ? await noteOf(s) : await thingNote(s, why);
      if (!note) return;
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
    const list = zipEntries(atlas.zip.index(buf)), made = new Map(), key = `${keyOf(cbz)}-${buf.byteLength}`;
    const mine = new Set(); // the blob: URLs made here, let go with the chapter (the core's thumbnails are the app's, kept)
    return {
      count: list.length,
      url(i) {
        if (!made.has(i)) { const got = zipPage(buf, list[i], `${key}/${i}`, mine); got.catch(() => made.delete(i)); made.set(i, got); }
        return made.get(i);
      },
      done() { for (const u of mine) URL.revokeObjectURL(u); mine.clear(); made.clear(); },
    };
  }
  /** One picture of a .cbz as an address for `<img>`: a JPEG XL or an AVIF written once into the plugin's cache and
   *  shown through the core's thumbnails (decoded there, `coreDecodes`); any other as a blob. An Atlas without
   *  `writeBytes` (before API 23) shows the blob as it is. */
  async function zipPage(buf, entry, rest, mine) {
    const blob = await atlas.zip.blob(buf, entry);
    const ext = coreDecodes(entry.name, new Uint8Array(await blob.slice(0, 16).arrayBuffer()));
    const own = () => { const u = URL.createObjectURL(blob); mine.add(u); return u; };
    if (!ext || !atlas.writeBytes) return own();
    const there = `.atlas/cache/plugins/${atlas.plugin?.id ?? "manga"}/pages/${rest}.${ext}`;
    try {
      if (!(await atlas.exists?.(there).catch(() => false))) await atlas.writeBytes(there, blob);
      return await atlas.thumbUrl(there, PAGE_W);
    } catch { return own(); }
  }
  /** A cover: the series' cover.* picture (Mihon's convention), else its first chapter's first page. */
  const cover = (s) => (s.remote ? suw.cover(s) : coverOf(atlas, s));
  const covers = new Map(); // series path → Promise<url | null>
  const coverFor = (s) => { if (!covers.has(s.path)) covers.set(s.path, cover(s).catch(() => null)); return covers.get(s.path); };

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
    // back where it was opened from: the server's library (its own tab), else the Libraries page's Comics
    const backBtn = el("button", "atlas-btn", stack.length > 1 ? "‹ Back" : "‹ Library");
    backBtn.title = stack.length > 1 ? "Back to the list it was opened from" : "The comics, on the Libraries page";
    backBtn.onclick = back;
    head.append(backBtn, el("div", "m-title", s.title));
    const top = el("div", "m-series"), pic = el("div", "m-cover big"), img = el("img"), side = el("div", "m-side");
    img.alt = "";
    pic.append(img);
    void coverFor(s).then((u) => { if (u) img.src = u; });
    const count = el("div", "m-count"), go = el("button", "atlas-btn primary");
    side.append(el("h2", "", s.title), count, go);
    if (s.remote) {
      const fresh = el("button", "atlas-btn", "New chapters?");
      fresh.title = "Ask Suwayomi to look for new chapters at this series' source";
      fresh.onclick = async () => {
        fresh.disabled = true; fresh.textContent = "Looking…";
        try {
          const n = await suw.refresh(s);
          atlas.toast("Manga", n ? `${n} new chapter${n === 1 ? "" : "s"} of ${s.title}` : `No new chapters of ${s.title}`, n ? "success" : undefined);
          if (n) { show(() => series(s)); return; }
        } catch (e) { atlas.toast("Manga", String(e.message ?? e), "error"); }
        fresh.disabled = false; fresh.textContent = "New chapters?";
      };
      // the next unread chapters fetched now into the plugin's cache, so they read with the server out of reach
      const keep = el("button", "atlas-btn", `Keep ${KEEP} for offline`);
      keep.title = `Fetch the pages of the next ${KEEP} unread chapters now: they open without the server`;
      keep.onclick = async () => {
        keep.disabled = true;
        const r = await reading(s), [from] = resume(s, r);
        const next = s.chapters.slice(from).filter((ch) => !isRead(r, ch)).slice(0, KEEP);
        let done = 0;
        try {
          for (const ch of next) {
            keep.textContent = `Keeping ${done + 1} of ${next.length}…`;
            const pg = await suw.pages(ch), all = [...Array(pg.count).keys()];
            for (let i = 0; i < all.length; i += 4) await Promise.all(all.slice(i, i + 4).map((j) => pg.url(j)));
            done++;
          }
          atlas.toast("Manga", done ? `${done} chapter${done === 1 ? "" : "s"} of ${s.title} kept for offline` : "Nothing unread to keep", done ? "success" : undefined);
        } catch (e) { atlas.toast("Manga", `Kept ${done} of ${next.length}: ${e.message ?? e}`, "error"); }
        keep.disabled = false; keep.textContent = `Keep ${KEEP} for offline`;
      };
      // the unread chapters downloaded by the server itself: kept there, they read even once their source is gone
      const onServer = el("button", "atlas-btn", "Download on the server");
      // while the server downloads this series' chapters: how many are left and the one under way, every few seconds
      const queued = el("div", "m-queue");
      queued.hidden = true;
      let watching = 0;
      const watchQueue = () => {
        clearTimeout(watching);
        const look = async () => {
          if (gone || !queued.isConnected) return;
          let q;
          try { q = await suw.queue(); } catch { queued.hidden = true; return; }
          const mine = q.items.filter((i) => i.series === s.remote);
          if (!mine.length) {
            if (!queued.hidden) { queued.hidden = true; await suw.chapters(s).catch(() => {}); }
            return;
          }
          const now = mine.find((i) => i.state === "DOWNLOADING") ?? mine[0];
          const failed = mine.filter((i) => i.state === "ERROR").length;
          queued.hidden = false;
          queued.textContent = `${q.running ? "Downloading on the server" : "Queued on the server (its downloader is stopped)"}: ${mine.length} left · ${now.name} ${Math.round(now.progress * 100)} %${failed ? ` · ${failed} failed` : ""}`;
          watching = setTimeout(look, 3000);
        };
        void look();
      };
      onServer.title = "Queue the unread chapters in Suwayomi's own Downloads: the server keeps them";
      onServer.onclick = async () => {
        onServer.disabled = true;
        try {
          const r = await reading(s), n = await suw.download(s, s.chapters.filter((ch) => !isRead(r, ch)));
          atlas.toast("Manga", n ? `${n} chapter${n === 1 ? "" : "s"} of ${s.title} queued in Suwayomi's downloads` : "Every unread chapter is on the server already", n ? "success" : undefined);
          if (n) watchQueue();
        } catch (e) { atlas.toast("Manga", String(e.message ?? e), "error"); }
        onServer.disabled = false;
      };
      side.append(fresh, keep, onServer, queued);
      watchQueue(); // a queue started earlier (here or in Suwayomi) shows too
    }
    // the series' one note: opened, made when it has none (asking makes it yours)
    const noteBtn = el("button", "atlas-btn", "Its note");
    noteBtn.title = "The series' note in the vault — your review, rating, what you write; made now if it has none";
    noteBtn.onclick = async () => {
      noteBtn.disabled = true;
      const have = !s.remote && (await atlas.exists(await noteOf(s)).catch(() => false)) ? await noteOf(s) : await thingNote(s, { why: "asked" }).catch(() => null);
      noteBtn.disabled = false;
      if (have) atlas.open(have, undefined, { beside: true });
      else atlas.toast("Manga", s.remote && suw.offline ? "Suwayomi cannot be reached: the series' note waits for it." : "No note made: a series' note is the Catalog's (switch the Catalog plugin on).", "error");
    };
    side.append(noteBtn);
    if (s.remote && suw.offline) side.append(el("div", "m-offline", `Suwayomi cannot be reached (${suw.offline}): the chapters as last seen; the ones opened before read from the copies kept.`));
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
        row.append(el("span", "m-ch-name", chapterName(ch)), el("span", "m-ch-at", isRead(r, ch) ? "read" : page ? `page ${page + 1}` : ""));
        if (s.remote && suw.onServer(s, ch)) { const d = el("span", "m-ch-kept", "⤓"); d.title = "Downloaded on the server"; row.lastChild.append(d); }
        row.onclick = () => read(s, i, isRead(r, ch) ? 0 : page);
        row.oncontextmenu = (e) => {
          e.preventDefault();
          const read = !isRead(r, ch);
          void saveReading(s, (x) => { const c = (x.chapters[nameOf(ch)] ??= {}); c.read = read; if (!read) c.page = 0; }, engagement(0, 0, read)).then(refresh);
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
   *  page's, with the series' own reader options (its note's `reader_options`, as the phone keeps them). A folder
   *  chapter is handed with its trailing slash, which is how the app tells it from any other path. */
  const ownOptions = new Map(); // series path → options changed in this pane (a server's series has no note to keep them)
  async function read(s, i, page) {
    if (atlas.openNative?.(s.chapters[i])) return;
    const r = await reading(s).catch(() => ({}));
    push(() => reader(s, i, page, { ...(r.options ?? {}), ...(ownOptions.get(s.path) ?? {}) }));
  }
  const chapterName = (ch) => nameOf(ch).replace(/\/$/, "").replace(ZIP, "");
  /** Mihon's reader: pages fetched and decoded ahead (the next ones, the next chapter near the end), a page between
   *  chapters (what was finished, what comes: a turn past a chapter's edge never lands in the other by accident), a
   *  progress bar to click, keys, the wheel and taps; the mode and the scale changed from its bar. */
  function reader(s, index, start, own = {}) {
    const O = { ...S, ...own };
    const mode = MODES.includes(O.mode) ? O.mode : MODES[0], webtoon = mode === "webtoon", rtl = mode === "right to left";
    const scale = SCALES.includes(O.scale) ? O.scale : SCALES[0];
    const view = el("div", `m-reader ${webtoon ? "webtoon" : "paged"} ${scale.replace(/\s+/g, "-")} bg-${String(O.background || "automatic")}`);
    const bar = el("div", "m-bar m-over");
    const backBtn = el("button", "atlas-btn", "‹ " + s.title);
    backBtn.onclick = back;
    const where = el("div", "m-title");
    bar.append(backBtn, where, pick("Reading mode", MODES, mode, "mode"));
    if (!webtoon) bar.append(pick("Scale", SCALES, scale, "scale"));
    const num = el("div", "m-num");
    num.hidden = O.page_number === false;
    // how far into the chapter: a bar along the bottom (from the right when reading right to left), a click goes there
    const progress = el("div", `m-progress${rtl ? " rtl" : ""}`), fill = el("i");
    progress.append(fill);
    progress.title = "Go to a page";
    progress.onclick = (e) => {
      if (!ch || webtoon) return;
      const r = progress.getBoundingClientRect(), f = (e.clientX - r.left) / r.width;
      page = Math.max(0, Math.min(ch.count - 1, Math.floor((rtl ? 1 - f : f) * ch.count)));
      void draw();
    };
    const spin = el("div", "m-spin");
    spin.hidden = true;
    root.append(view, bar, num, progress, spin);

    /** A choice of the bar, for this series: kept in its note (a server's series: the plugin's settings, as the phone
     *  does), and the reader made again at the same page. */
    function pick(label, list, now, key) {
      const sel = el("select", "atlas-input m-pick");
      sel.title = label; sel.setAttribute("aria-label", label);
      for (const x of list) { const o = el("option", "", x); o.value = x; o.selected = x === now; sel.append(o); }
      sel.onchange = () => {
        own = { ...own, [key]: sel.value };
        ownOptions.set(s.path, { ...(ownOptions.get(s.path) ?? {}), [key]: sel.value });
        if (s.remote) void atlas.plugin.saveSettings?.({ [key]: sel.value })?.catch?.((e) => atlas.toast("Manga", `Not saved: ${e.message ?? e}`, "error"));
        else void saveReading(s, (r) => { r.options = { ...(r.options ?? {}), [key]: sel.value }; });
        const again = () => reader(s, index, page, own);
        stack[stack.length - 1] = again;
        show(again);
      };
      return sel;
    }

    let ch = null, page = 0, gap = null, seq = 0, saveT = 0, pending = null, barOn = false, img = null;
    const setBar = (on) => { barOn = on; bar.classList.toggle("on", on); };
    const loading = (on) => { spin.hidden = !on; };
    // the page shown, saved once the reader rests on it; flushed at once on a chapter change and on leaving
    const flush = () => { clearTimeout(saveT); const f = pending; pending = null; if (f) void saveReading(s, f.change, f.why); };
    const remember = () => {
      clearTimeout(saveT);
      const at = page, of = ch.count, name = nameOf(s.chapters[index]);
      pending = { change: (r) => { const c = (r.chapters[name] ??= {}); c.page = at; if (at >= of - 1) c.read = true; r.last = name; }, why: engagement(at, of, false) };
      saveT = setTimeout(flush, 400);
    };
    const shown = () => {
      num.textContent = `${page + 1} / ${ch.count}`;
      where.textContent = `${chapterName(s.chapters[index])} · ${page + 1} / ${ch.count}`;
      fill.style.width = `${((page + 1) / ch.count) * 100}%`;
      remember();
    };
    // e-ink: a full refresh every N page turns (Mihon's option) clears the ghosts of the last pages
    let turns = 0;
    const every = Number(O.flash_every ?? 1);
    const flash = () => { if (!webtoon && atlas.eink?.on && every > 0 && ++turns % every === 0) atlas.eink.refresh(); }; // webtoon: eink.ts refreshes when a scroll rests

    // the chapters open now: the one read and its neighbours, opened ahead (a .cbz fetched, a server's page list asked)
    const near = new Map();
    const chapterAt = (i) => {
      if (!near.has(i)) { const p = pages(s.chapters[i]); p.catch(() => near.delete(i)); near.set(i, p); }
      return near.get(i);
    };
    const keepNear = (keep) => { for (const [i, p] of near) if (!keep.includes(i)) { near.delete(i); void p.then((c) => c.done(), () => {}); } };
    // a page as a decoded picture, asked once: a turn onto a page asked ahead shows it at once
    const pics = new WeakMap();
    function picture(c, i) {
      let m = pics.get(c);
      if (!m) pics.set(c, (m = new Map()));
      if (!m.has(i)) {
        const got = c.url(i).then(async (u) => { const im = new Image(); im.alt = ""; im.src = u; await im.decode(); return im; });
        got.catch(() => m.delete(i)); // asked again at the next turn onto it (the server out of reach a moment)
        m.set(i, got);
      }
      return m.get(i);
    }
    const AHEAD = 4;
    /** The pages after the one shown (and the one before), then the next chapter's first ones once its end is near;
     *  pictures far behind are let go. */
    function ahead() {
      if (!ch) return;
      for (let d = 1; d <= AHEAD && page + d < ch.count; d++) void picture(ch, page + d).catch(() => {});
      if (page > 0) void picture(ch, page - 1).catch(() => {});
      const m = pics.get(ch);
      if (m) for (const i of [...m.keys()]) if (i < page - 3 || i > page + AHEAD + 3) m.delete(i);
      if (index + 1 < s.chapters.length && page >= ch.count - AHEAD)
        void chapterAt(index + 1).then((c) => { if (!webtoon) for (let i = 0; i < Math.min(2, c.count); i++) void picture(c, i).catch(() => {}); }, () => {});
    }

    async function open(i, at) {
      flush();
      const mine = ++seq;
      index = i; gap = null;
      loading(true);
      let c;
      try { c = await chapterAt(i); } catch (e) {
        if (mine !== seq) return;
        loading(false);
        view.replaceChildren(el("div", "atlas-notice error", `This chapter did not open: ${e.message ?? e}`));
        return;
      }
      if (gone || mine !== seq) return;
      keepNear([i - 1, i, i + 1]);
      ch = c;
      if (!ch.count) { loading(false); view.replaceChildren(el("div", "atlas-notice", "This chapter has no pictures.")); return; }
      page = Math.max(0, Math.min(at === -1 ? ch.count - 1 : at, ch.count - 1));
      ink = webtoon ? [] : await readInk();
      if (gone || mine !== seq) return;
      loading(false);
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
      if (webtoon || gap || !img?.naturalWidth || !img.isConnected || !atlas.marksSvg) return;
      Object.assign(over.style, { left: `${img.offsetLeft}px`, top: `${img.offsetTop}px`, width: `${img.offsetWidth}px`, height: `${img.offsetHeight}px` });
      if (ink.some((m) => m.page === page + 1)) over.append(atlas.marksSvg(ink, page + 1));
    }
    const offInk = atlas.onFilesChanged((paths) => { if (ch && inkNote && paths.includes(inkNote)) void readInk().then((k) => { ink = k; drawInk(); }); });
    const sized = new ResizeObserver(() => drawInk());
    sized.observe(view);

    /** Paged: the page's number at once, its picture when it is ready (at once when asked ahead; "Loading" only for one
     *  that takes a moment); a turn made meanwhile wins over a slower answer. */
    async function draw() {
      const mine = ++seq, c = ch, at = page;
      gap = null;
      shown();
      const slow = setTimeout(() => { if (mine === seq) loading(true); }, 120);
      let pic;
      try { pic = await picture(c, at); } catch (e) {
        clearTimeout(slow);
        if (mine !== seq) return;
        loading(false);
        const box = el("div", "atlas-notice error m-failed", `Page ${at + 1} did not load: ${e?.message ?? "the picture could not be read"} `), again = el("button", "atlas-btn", "Try again");
        again.onclick = (ev) => { ev.stopPropagation(); void draw(); };
        box.append(again);
        view.replaceChildren(box);
        return;
      }
      clearTimeout(slow);
      if (mine !== seq || gone) return;
      loading(false);
      pic.className = "m-page";
      img = pic;
      view.replaceChildren(img, over);
      view.scrollTop = 0;
      drawInk();
      flash();
      ahead();
    }
    /** The page between two chapters (Mihon's transition): what was finished and what comes next (or came before), so
     *  one more turn is needed to cross; at the last chapter, that it was the last. */
    function transition(which) {
      seq++; gap = which;
      loading(false);
      const box = el("div", "m-gap");
      const row = (what, i) => { const r = el("div", "m-gap-row"); r.append(el("span", "m-gap-what", what), el("span", "m-gap-name", chapterName(s.chapters[i]))); return r; };
      if (which === "next") {
        box.append(row("Finished", index));
        if (index + 1 < s.chapters.length) {
          const next = row("Next", index + 1), count = el("span", "m-gap-pages");
          next.append(count);
          void chapterAt(index + 1).then((c) => { count.textContent = `${c.count} page${c.count === 1 ? "" : "s"}`; for (let i = 0; i < Math.min(2, c.count); i++) void picture(c, i).catch(() => {}); }, () => {});
          box.append(next);
        } else {
          box.append(el("div", "m-gap-end", "That was the last chapter."));
          const toSeries = el("button", "atlas-btn", "‹ " + s.title);
          toSeries.onclick = (e) => { e.stopPropagation(); back(); show.refresh?.(); };
          box.append(toSeries);
        }
      } else {
        box.append(row("Previous", index - 1), row("Current", index));
        void chapterAt(index - 1).then((c) => { if (c.count) void picture(c, c.count - 1).catch(() => {}); }, () => {});
      }
      view.replaceChildren(box);
      num.textContent = which === "next" ? "end" : "start";
      fill.style.width = which === "next" ? "100%" : "0%";
    }
    function turn(d) {
      if (!ch) return;
      if (webtoon) { view.scrollBy({ top: d * view.clientHeight * 0.85 }); return; }
      if (gap === "next") {
        if (d < 0) void draw();
        else if (index + 1 < s.chapters.length) void open(index + 1, 0);
        else atlas.toast("Manga", "That was the last chapter.");
        return;
      }
      if (gap === "prev") { if (d > 0) void draw(); else void open(index - 1, -1); return; }
      const p = page + d;
      if (p >= 0 && p < ch.count) { page = p; void draw(); }
      else if (p >= ch.count) transition("next");
      else if (index > 0) transition("prev");
      else atlas.toast("Manga", "This is the first chapter.");
    }
    // webtoon: every picture under the other, the page in view is where you are (one that failed asked again a moment
    // later, while it is still near the view); the next chapter opened ahead near the end
    let watch = null;
    function strip() {
      watch?.disconnect();
      const load = new IntersectionObserver((xs) => { for (const x of xs) if (x.isIntersecting) { load.unobserve(x.target); void ch.url(+x.target.dataset.i).then((u) => (x.target.src = u), () => setTimeout(() => load.observe(x.target), 5000)); } }, { root: view, rootMargin: "150% 0px" });
      const at = new IntersectionObserver((xs) => { for (const x of xs) if (x.isIntersecting) { page = +x.target.dataset.i; shown(); ahead(); } }, { root: view, threshold: 0.5 });
      watch = { disconnect: () => { load.disconnect(); at.disconnect(); } };
      for (let i = 0; i < ch.count; i++) {
        const p = el("img", "m-page");
        p.alt = ""; p.dataset.i = String(i);
        view.append(p); load.observe(p); at.observe(p);
      }
      const goto = view.children[page];
      if (goto) requestAnimationFrame(() => goto.scrollIntoView());
      const end = el("div", "m-gap m-gap-strip");
      end.append(el("div", "m-gap-row", `Finished ${chapterName(s.chapters[index])}`));
      const next = el("button", "atlas-btn primary m-next", index + 1 < s.chapters.length ? `Next: ${chapterName(s.chapters[index + 1])} ›` : "That was the last chapter");
      next.disabled = index + 1 >= s.chapters.length;
      next.onclick = (e) => { e.stopPropagation(); void open(index + 1, 0); };
      end.append(next);
      view.append(end);
      shown();
    }

    // Mihon's tap zones, as ReaderView.zone (x, y from 0 to 1): +1 next, -1 previous (left to right), 0 the bar, null nothing
    function zone(x, y) {
      const kind = String(O.taps || "default");
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
      if (O.invert_taps && t) t = -t;
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
    /** A page taller than the view (fit width) scrolls before it turns: → whether it moved. */
    const scrolls = (d, by) => {
      const room = d > 0 ? view.scrollHeight - view.clientHeight - view.scrollTop : view.scrollTop;
      if (room <= 2) return false;
      view.scrollBy({ top: d * by });
      return true;
    };
    // the wheel turns pages in the paged modes: one turn per gesture (a touchpad sends many), a tall page scrolled to
    // its edge first, and a pause there before it turns (a scroll that reaches the bottom does not turn by itself)
    let wheelSum = 0, wheelRest = 0, scrolledAt = 0;
    view.addEventListener("wheel", (e) => {
      if (webtoon || e.ctrlKey) return; // webtoon scrolls; Ctrl+wheel zooms
      const dy = e.deltaY * (e.deltaMode === 1 ? 40 : e.deltaMode === 2 ? view.clientHeight : 1), now = performance.now();
      const room = dy > 0 ? view.scrollHeight - view.clientHeight - view.scrollTop : view.scrollTop;
      if (!gap && room > 2) { scrolledAt = now; return; } // the page scrolls itself
      e.preventDefault();
      if (now - scrolledAt < 250) { scrolledAt = now; return; } // still the stream that scrolled: it must stop first
      if (now < wheelRest) return;
      wheelSum += dy;
      if (Math.abs(wheelSum) < 40) return;
      turn(wheelSum > 0 ? 1 : -1);
      wheelSum = 0; wheelRest = now + 350;
    }, { passive: false });
    const keys = (e) => {
      if (e.target instanceof HTMLSelectElement || e.target instanceof HTMLInputElement || e.ctrlKey || e.metaKey || e.altKey) return;
      const k = e.key;
      const fwd = rtl ? "ArrowLeft" : "ArrowRight", bwd = rtl ? "ArrowRight" : "ArrowLeft";
      const big = k === " " || k === "PageDown" || k === "PageUp", down = (k === " " && !e.shiftKey) || k === "PageDown" || k === "ArrowDown";
      const up = (k === " " && e.shiftKey) || k === "PageUp" || k === "ArrowUp";
      if (webtoon && (down || up) && !big) view.scrollBy({ top: (down ? 1 : -1) * view.clientHeight * 0.2 });
      else if (!webtoon && !gap && (down || up) && scrolls(down ? 1 : -1, view.clientHeight * (big ? 0.85 : 0.2))) { /* scrolled */ }
      else if (k === fwd || down) turn(1);
      else if (k === bwd || up) turn(-1);
      else if ((k === "Home" || k === "End") && ch && !webtoon) { page = k === "Home" ? 0 : ch.count - 1; void draw(); }
      else return;
      e.preventDefault(); e.stopPropagation();
    };
    root.addEventListener("keydown", keys);
    void open(index, start);
    return () => {
      seq++; flush(); offInk(); sized.disconnect(); root.removeEventListener("keydown", keys); watch?.disconnect();
      keepNear([]);
    };
  }

  // ---- Browse: the server's sources (android/SourcesView.java, SourceView.java, the series' Add to library) ---------
  const bar = (title, backLabel) => {
    const head = el("div", "m-bar"), b = el("button", "atlas-btn", backLabel);
    b.onclick = back;
    head.append(b, el("div", "m-title", title));
    return head;
  };
  /** The installed sources by language (the reader's own first, then all-language ones), a filter over their names. */
  function browse() {
    const filter = el("input", "atlas-input m-filter");
    filter.placeholder = "Filter the sources…";
    const head = bar("Browse Suwayomi", "‹ Back");
    head.append(filter);
    const list = el("div", "m-sources");
    root.append(head, list);
    const mine = (navigator.language || "en").slice(0, 2).toLowerCase();
    const rank = (lang) => (lang === mine ? 0 : lang === "all" ? 1 : lang === "localsourcelang" ? 2 : 3);
    const words = { all: "All languages", localsourcelang: "On the server" };
    const name = (code) => words[code] ?? (() => { try { return new Intl.DisplayNames([navigator.language || "en"], { type: "language" }).of(code) ?? code; } catch { return code; } })();
    let all = [];
    const draw = () => {
      const f = filter.value.trim().toLowerCase();
      const shown = all.filter((x) => !f || `${x.label} ${x.name}`.toLowerCase().includes(f));
      list.replaceChildren();
      if (!shown.length) { list.append(el("div", "atlas-notice", all.length ? "No source by that name." : "No sources: install extensions in Suwayomi.")); return; }
      const langs = [...new Set(shown.map((x) => x.lang))].sort((a, b) => rank(a) - rank(b) || name(a).localeCompare(name(b)));
      for (const lang of langs) {
        list.append(el("h3", "m-lang", name(lang)));
        for (const x of shown.filter((y) => y.lang === lang)) {
          const row = el("button", "m-ch m-source");
          const icon = el("img");
          icon.alt = "";
          if (x.icon) void suw.found({ id: `source-${x.id}`, cover: x.icon }).then((u) => { if (u) icon.src = u; }, () => {});
          row.append(icon, el("span", "m-ch-name", x.label), el("span", "m-ch-at", x.nsfw ? "18+" : ""));
          row.onclick = () => push(() => source(x));
          list.append(row);
        }
      }
    };
    filter.oninput = draw;
    void suw.sources().then((x) => { all = x; if (!gone) draw(); }, (e) => list.append(el("div", "atlas-notice", String(e.message ?? e))));
    setTimeout(() => filter.focus(), 0);
  }
  /** The library's order, the phone's setting (`library_order`, `library_descending`): what the server says of a series
   *  here is its title and its unread chapters, so "unread" orders by them, "auto" puts the series with chapters left
   *  first, and the orders the server cannot say here (last read, chapters) fall back to the title. */
  function ordered(list) {
    const by = String(S.library_order ?? "auto"), turn = S.library_descending === true ? -1 : 1;
    const title = (a, b) => natural(a.title, b.title);
    const cmp = by === "unread" ? (a, b) => (b.unread - a.unread) || title(a, b)
      : by === "auto" ? (a, b) => (Number(b.unread > 0) - Number(a.unread > 0)) || title(a, b)
      : title;
    return [...list].sort((a, b) => turn * cmp(a, b));
  }
  /** Suwayomi's library — the server's, not the vault's: its series by category as covers, unread counts, the way
   *  into Browse. A series opened here reads as any; it joins the Libraries page once it is yours (its note). */
  function serverLibrary() {
    const head = bar("Suwayomi", "‹ Comics");
    const go = el("button", "atlas-btn", "Browse sources");
    go.onclick = () => push(browse);
    const filter = el("input", "atlas-input m-filter");
    filter.placeholder = "Filter the series…";
    // only the series with chapters left to read: a chip beside the filter, as the phone's library has
    const unreadOnly = el("button", "atlas-btn", "Unread");
    unreadOnly.title = "Only the series with chapters left to read";
    let onlyUnread = false;
    unreadOnly.onclick = () => { onlyUnread = !onlyUnread; unreadOnly.classList.toggle("on", onlyUnread); draw(); };
    head.append(filter, unreadOnly, go);
    const tabs = el("div", "m-tabs"), grid = el("div", "m-grid");
    root.append(head, tabs, grid);
    let all = [], cat = "";
    const draw = () => {
      const f = filter.value.trim().toLowerCase();
      grid.replaceChildren();
      // a search looks on every shelf, not only the tab shown (the phone's library the same)
      const shown = ordered(all.filter((x) => (f || !cat || (x.categories ?? []).includes(cat)) && (!f || x.title.toLowerCase().includes(f)) && (!onlyUnread || x.unread > 0)));
      tabs.classList.toggle("searching", !!f);
      for (const x of shown) {
        const card = el("button", "m-found"), pic = el("div", "m-cover"), img = el("img");
        img.alt = "";
        pic.append(img);
        void coverFor(x).then((u) => { if (u) img.src = u; });
        card.append(pic, el("div", "m-found-title", x.title), el("div", "m-found-in", x.unread ? `${x.unread} unread` : "all read"));
        card.onclick = () => void ready(x).then(() => push(() => series(x)));
        grid.append(card);
      }
      if (!shown.length) grid.append(el("div", "atlas-notice", all.length ? "Nothing matches." : "Nothing in Suwayomi's library yet: Browse sources to add series."));
    };
    const drawTabs = () => {
      tabs.replaceChildren();
      const cats = [...new Set(all.flatMap((x) => x.categories ?? []))];
      if (!cats.length) return;
      for (const [c, label] of [["", "All"], ...cats.map((x) => [x, x])]) {
        const b = el("button", "atlas-btn", label);
        b.classList.toggle("on", c === cat);
        b.onclick = () => { cat = c; drawTabs(); draw(); };
        tabs.append(b);
      }
    };
    filter.oninput = draw;
    void suw.library().then((x) => { if (gone) return; all = x.sort((a, b) => natural(a.title, b.title)); drawTabs(); draw(); },
      (e) => grid.append(el("div", "atlas-notice", `Suwayomi: ${e.message ?? e}`)));
  }
  /** A source's Popular, Latest or a search, as covers; More asks the next page; a series appears once. */
  function source(src) {
    const head = bar(src.label, "‹ Sources");
    const tabs = el("div", "m-tabs"), q = el("input", "atlas-input m-filter");
    q.placeholder = `Search ${src.label}…`;
    const grid = el("div", "m-grid"), more = el("button", "atlas-btn m-more", "More");
    root.append(head, tabs, grid, more);
    let type = "POPULAR", page = 0, asked = 0;
    const seen = new Set();
    const load = async () => {
      const mine = ++asked; // an answer for a list left meanwhile is dropped
      more.disabled = true; more.textContent = "Loading…";
      try {
        const r = await suw.listing(src.id, type, page + 1, q.value);
        if (mine !== asked || gone) return;
        page++;
        for (const m of r.mangas) {
          if (seen.has(m.id)) continue;
          seen.add(m.id);
          const card = el("button", "m-found"), pic = el("div", "m-cover"), img = el("img");
          img.alt = "";
          pic.append(img);
          void suw.found(m).then((u) => { if (u) img.src = u; }, () => {});
          card.append(pic, el("div", "m-found-title", m.title));
          if (m.inLibrary) card.append(el("div", "m-found-in", "In your library"));
          card.onclick = () => push(() => found(m.id));
          grid.append(card);
        }
        more.hidden = !r.more;
        if (!seen.size) grid.append(el("div", "atlas-notice", type === "SEARCH" ? "Nothing found." : "This source lists nothing."));
      } catch (e) { if (mine === asked) grid.append(el("div", "atlas-notice", String(e.message ?? e))); }
      more.disabled = false; more.textContent = "More";
    };
    const restart = (t) => { type = t; page = 0; seen.clear(); grid.replaceChildren(); more.hidden = true; for (const b of tabs.querySelectorAll("button")) b.classList.toggle("on", b.dataset.type === t); if (t !== "SEARCH" || q.value.trim()) void load(); };
    for (const [t, label] of [["POPULAR", "Popular"], ...(src.latest ? [["LATEST", "Latest"]] : [])]) {
      const b = el("button", "atlas-btn", label);
      b.dataset.type = t;
      b.onclick = () => restart(t);
      tabs.append(b);
    }
    tabs.append(q);
    q.onkeydown = (e) => { if (e.key === "Enter" && q.value.trim()) { e.stopPropagation(); restart("SEARCH"); } };
    more.onclick = () => void load();
    restart("POPULAR");
  }
  /** A series found in a source: who made it, how it stands, its description; Add to library (or Remove), then Read. */
  function found(id) {
    const head = bar("…", "‹ Back");
    const top = el("div", "m-series"), pic = el("div", "m-cover big"), img = el("img"), side = el("div", "m-side");
    img.alt = "";
    pic.append(img);
    top.append(pic, side);
    const about = el("p", "m-about");
    root.append(head, top, about);
    side.append(el("div", "m-count", "Asking the server…"));
    const draw = (d) => {
      head.querySelector(".m-title").textContent = d.title;
      const who = [d.author, d.artist && d.artist !== d.author ? d.artist : ""].filter(Boolean).join(", ");
      side.replaceChildren(el("h2", "", d.title), el("div", "m-count", [who, d.status, d.source, d.chapters ? `${d.chapters} chapter${d.chapters === 1 ? "" : "s"}` : ""].filter(Boolean).join(" · ")));
      const add = el("button", d.inLibrary ? "atlas-btn" : "atlas-btn primary", d.inLibrary ? "Remove from library" : "Add to library");
      add.onclick = async () => {
        add.disabled = true;
        try {
          await suw.setInLibrary(d.id, !d.inLibrary);
          d.inLibrary = !d.inLibrary;
          atlas.toast("Manga", d.inLibrary ? `${d.title} is in your library` : `${d.title} left your library`, "success");
          draw(d);
        } catch (e) { atlas.toast("Manga", String(e.message ?? e), "error"); add.disabled = false; }
      };
      side.append(add);
      if (d.inLibrary) {
        // its categories, as the phone's Add to library asks them: a chip each, on or off at a click
        const cats = el("div", "m-cats");
        side.append(cats);
        void suw.categories().then((all) => {
          for (const c of all) {
            const chip = el("button", "atlas-btn m-cat", c.name);
            const paint = () => { chip.classList.toggle("on", d.categories.includes(c.id)); chip.setAttribute("aria-pressed", String(d.categories.includes(c.id))); };
            chip.title = "In this category or not (Suwayomi's categories: the library's tabs)";
            chip.onclick = async () => {
              const on = !d.categories.includes(c.id);
              try { await suw.setCategory(d.id, c.id, on); d.categories = on ? [...d.categories, c.id] : d.categories.filter((x) => x !== c.id); paint(); }
              catch (e) { atlas.toast("Manga", String(e.message ?? e), "error"); }
            };
            paint();
            cats.append(chip);
          }
        }, () => {});
        const go = el("button", "atlas-btn primary", "Read");
        go.onclick = () => void scan().then((all) => {
          const s = all.find((x) => x.remote === d.id);
          if (s) void ready(s).then(() => push(() => series(s)));
          else atlas.toast("Manga", `${d.title} is not in the library the server lists yet.`, "error");
        });
        side.append(go);
      }
      about.textContent = [d.genres.join(", "), d.description].filter(Boolean).join("\n\n");
    };
    void suw.details(id).then((d) => {
      if (gone) return;
      if (d.cover) void suw.found({ id: d.id, cover: d.cover }).then((u) => { if (u) img.src = u; }, () => {});
      draw(d);
    }, (e) => side.replaceChildren(el("div", "atlas-notice", String(e.message ?? e))));
  }

  root.addEventListener("keydown", (e) => {
    if ((e.key === "Escape" || e.key === "Backspace") && stack.length > 1 && !(e.target instanceof HTMLInputElement)) { e.preventDefault(); back(); show.refresh?.(); }
  });

  // what the pane was opened on: a .cbz ("Open with…") reads it at once, its series under it
  if (atlas.path && ZIP.test(atlas.path)) {
    const dir = atlas.path.slice(0, atlas.path.lastIndexOf("/"));
    void chapters(dir).then((list) => {
      const inSeries = list.includes(atlas.path);
      const s = inSeries ? { path: dir, title: dir.split("/").pop(), chapters: list, dir: true } : { path: atlas.path, title: atlas.path.split("/").pop().replace(ZIP, ""), chapters: [atlas.path], dir: false };
      stack.push(() => series(s));
      void reading(s).then((r) => push(() => reader(s, s.chapters.indexOf(atlas.path), isRead(r, atlas.path) ? 0 : pageOf(r, atlas.path), r.options ?? {})));
    });
  } else if (atlas.arg === SERVER) { // the server's library, its own tab (the Comics library's Suwayomi button)
    if (suw.on) push(serverLibrary);
    else root.append(el("div", "atlas-notice", "No Suwayomi server set: Settings → Plugins → Manga."));
  } else if (atlas.arg === BROWSE) { // Browse Suwayomi's sources (the command, the series screen's +)
    if (suw.on) push(browse);
    else root.append(el("div", "atlas-notice", "No Suwayomi server set: Settings → Plugins → Manga."));
  } else if (atlas.arg) { // a series of the Libraries page's Comics
    void scan().then((all) => {
      const s = all.find((x) => x.path === atlas.arg);
      if (s) void ready(s).then(() => push(() => series(s)));
      else root.append(el("div", "atlas-notice", remoteTrouble ? `Suwayomi: ${remoteTrouble}` : `No series “${atlas.arg}” any more.`));
    });
  } else {
    // no series (a tab kept from an older version): the library is the Libraries page's
    toLibrary();
    atlas.pane?.close();
  }
  return () => { gone = true; leave(); };
}

function style() {
  const s = document.createElement("style");
  s.textContent = `
  .manga { position: relative; height: 100%; overflow: auto; outline: none; background: var(--bg); color: var(--text); font-size: calc(13px * var(--ui-scale, 1)); }
  .manga .m-bar { display: flex; align-items: center; gap: 10px; padding: 8px 14px; border-bottom: 1px solid var(--border); position: sticky; top: 0; background: var(--bg); z-index: 2; }
  .manga .m-title { font-weight: 600; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .manga .m-cover { position: relative; aspect-ratio: 2 / 3; border-radius: 8px; overflow: hidden; background: var(--bg-elev); box-shadow: 0 0 0 1px var(--border); }
  .manga .m-cover img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .manga .m-cover img:not([src]) { visibility: hidden; }
  .manga .m-series { display: flex; gap: 18px; padding: 18px; align-items: flex-end; }
  .manga .m-cover.big { width: 140px; flex: none; }
  .manga .m-side { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
  .manga .m-side > :is(h2, .m-count, .m-offline) { flex-basis: 100%; }
  .manga .m-side h2 { margin: 0 0 6px; font-size: 1.35em; }
  .manga .m-count { color: var(--text-muted); margin-bottom: 12px; }
  .manga .m-chapters { display: flex; flex-direction: column; padding: 0 10px 20px; }
  .manga .m-ch { display: flex; justify-content: space-between; gap: 12px; padding: 10px 8px; border: 0; border-bottom: 1px solid var(--border); background: none; color: var(--text); font: inherit; text-align: left; cursor: pointer; }
  .manga .m-ch:hover { background: var(--bg-hover); }
  .manga .m-ch.read .m-ch-name { color: var(--text-faint); }
  .manga .m-ch-at { color: var(--text-muted); white-space: nowrap; }
  .manga .m-queue { color: var(--text-muted); font-size: .92em; font-variant-numeric: tabular-nums; max-width: 260px; }
  .manga .m-filter { flex: 1; min-width: 120px; max-width: 320px; margin-left: auto; }
  .manga .m-sources { padding: 4px 14px 18px; display: flex; flex-direction: column; }
  .manga .m-lang { margin: 14px 0 4px; font-size: 0.85em; text-transform: uppercase; letter-spacing: .04em; color: var(--text-muted); }
  .manga .m-source { align-items: center; justify-content: flex-start; }
  .manga .m-source img { width: 28px; height: 28px; border-radius: 6px; flex: none; object-fit: cover; }
  .manga .m-source img:not([src]) { visibility: hidden; }
  .manga .m-source .m-ch-name { flex: 1; }
  .manga .m-tabs { display: flex; gap: 6px; padding: 10px 14px; align-items: center; flex-wrap: wrap; }
  .manga .m-tabs .on { background: var(--accent-soft); border-color: var(--accent); }
  .manga .m-tabs.searching .on { background: none; border-color: var(--border); } /* a search shows every shelf */
  .manga .m-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(130px, 1fr)); gap: 14px; padding: 4px 14px 14px; }
  .manga .m-found { display: flex; flex-direction: column; gap: 6px; padding: 0; border: 0; background: none; color: var(--text); font: inherit; text-align: left; cursor: pointer; }
  .manga .m-found-title { font-size: 0.92em; line-height: 1.25; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  .manga .m-found-in { font-size: 0.8em; color: var(--accent); }
  .manga .m-cats { display: flex; flex-wrap: wrap; gap: 6px; flex-basis: 100%; }
  .manga .m-cat.on { background: var(--accent-soft); border-color: var(--accent); }
  .manga .m-more { margin: 0 14px 18px; }
  .manga .m-about { padding: 0 18px 18px; margin: 0; white-space: pre-wrap; color: var(--text-muted); max-width: 70ch; line-height: 1.5; }
  .manga .m-ch-kept { color: var(--accent); margin-left: 6px; font-size: 0.95em; }
  .manga .m-reader { position: absolute; inset: 0; overflow: auto; display: flex; align-items: center; justify-content: center; background: var(--bg); }
  .manga .m-reader.bg-black { background: #000; } .manga .m-reader.bg-white { background: #fff; } .manga .m-reader.bg-grey { background: #888; }
  .manga .m-reader.webtoon { flex-direction: column; justify-content: flex-start; }
  .manga .m-ink { position: absolute; pointer-events: none; }
  .manga .m-reader.webtoon .m-page { width: min(100%, 900px); display: block; }
  .manga .m-reader.webtoon .m-page:not([src]) { min-height: 40vh; } /* room for a page not loaded yet; a loaded one keeps its shape */
  .manga .m-reader.paged.fit-screen .m-page { max-width: 100%; max-height: 100%; object-fit: contain; }
  .manga .m-reader.paged.fit-width { align-items: flex-start; } .manga .m-reader.paged.fit-width .m-page { width: 100%; }
  .manga .m-reader.paged.fit-height .m-page { height: 100%; }
  .manga .m-over { position: absolute; left: 0; right: 0; top: 0; visibility: hidden; }
  .manga .m-over.on { visibility: visible; }
  .manga .m-num { position: absolute; bottom: 10px; left: 50%; transform: translateX(-50%); padding: 1px 8px; border-radius: 6px; background: var(--bg-elev); color: var(--text-muted); font-size: .9em; pointer-events: none; }
  .manga .m-pick { width: auto; flex: none; }
  .manga .m-over .m-title { flex: 1; }
  .manga .m-progress { position: absolute; left: 0; right: 0; bottom: 0; height: 4px; background: color-mix(in srgb, var(--text) 12%, transparent); cursor: pointer; transition: height .12s; }
  .manga .m-progress:hover { height: 8px; }
  .manga .m-progress > i { display: block; height: 100%; width: 0; background: var(--accent); }
  .manga .m-progress.rtl > i { margin-left: auto; }
  .manga .m-spin { position: absolute; left: 50%; top: 50%; width: 28px; height: 28px; margin: -14px 0 0 -14px; border-radius: 50%; border: 3px solid color-mix(in srgb, var(--text) 18%, transparent); border-top-color: var(--accent); animation: m-spin .8s linear infinite; pointer-events: none; }
  @keyframes m-spin { to { transform: rotate(360deg); } }
  :root.eink .manga .m-spin { animation: none; }
  .manga .m-gap { display: flex; flex-direction: column; gap: 12px; padding: 22px 26px; max-width: 440px; margin: auto; border-radius: 10px; background: var(--bg-elev); color: var(--text); box-shadow: 0 0 0 1px var(--border); }
  .manga .m-gap-row { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 10px; }
  .manga .m-gap-what { flex-basis: 100%; font-size: .8em; text-transform: uppercase; letter-spacing: .05em; color: var(--text-muted); }
  .manga .m-gap-name { font-weight: 600; font-size: 1.1em; }
  .manga .m-gap-pages { color: var(--text-muted); font-size: .9em; }
  .manga .m-gap-end { color: var(--text-muted); }
  .manga .m-gap-strip { margin: 24px auto 48px; align-items: center; text-align: center; }
  .manga .m-gap-strip .m-next { margin: 0; }
  .manga .atlas-notice { margin: 18px; }
  .manga .m-offline { color: var(--text-muted); font-size: .85em; max-width: 42ch; }
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
/** A vault series' cover: its folder's own cover picture, else its first chapter's first page (a .cbz's drawn by the
 *  core's thumbnails). */
export async function coverOf(atlas, s) {
  const list = (dir) => atlas.list(dir).catch(() => []);
  const own = s.dir && (await list(s.path)).find((e) => !e.dir && /^cover\.(jpe?g|png|webp|avif|jxl)$/i.test(e.name));
  if (own) return atlas.thumbUrl(own.path, 300);
  const ch = s.chapters[0];
  if (!ch.endsWith("/")) return CBZ.test(ch) ? atlas.thumbUrl(ch, 300) : null;
  const first = (await list(ch.slice(0, -1))).filter((e) => !e.dir && PICTURE.test(e.name)).map((e) => e.path).sort(natural)[0];
  return first ? atlas.thumbUrl(first, 300) : null;
}

export async function seriesIn(atlas, folder) {
  const out = [];
  if (atlas.exists && !(await atlas.exists(folder))) return out; // a vault with only Suwayomi: no 404 for the folder
  for (const e of await atlas.list(folder).catch(() => [])) {
    if (e.dir) { const ch = await chaptersOf(atlas, e.path); if (ch.length) out.push({ path: e.path, title: e.name, chapters: ch, dir: true }); }
    else if (ZIP.test(e.name)) out.push({ path: e.path, title: e.name.replace(ZIP, ""), chapters: [e.path], dir: false });
  }
  return out.sort((a, b) => natural(a.title, b.title));
}
