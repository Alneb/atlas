// The player's Bookmarks tab: the book's bookmarks on the server (`/api/me`'s bookmarks; added with `POST` and removed
// with `DELETE /api/me/item/<id>/bookmark…`, so Audiobookshelf's own apps show the same ones), one added at the time
// you are at with a note, a click to go there, and — on your click only — the bookmark written into the book's note as
// a time link (`[[Book#t=1:02:03]] note`, the app's one form: `atlas.player.timeLink`), which the player seeks by.
import { clock } from "./abs.js";
import { bookmarksOf, withBookmark } from "./shelf.js";
import { el } from "./cards.js";

/** The book's note, by the catalog's one rule (its `note` tool): found by its Audiobookshelf id wherever it is, made now
 *  since a bookmark written into it makes the book yours; remembered on this device so the player gets it with the book
 *  from then on (its time links seek it). Null when the catalog is off. */
export async function bookNote(atlas, item, title) {
  const known = keptNotes()[item];
  if (known && (await atlas.exists(known).catch(() => false))) return known;
  const r = await atlas.post?.("/api/plugins/@catalog/tools/note", { kind: "book", ids: { audiobookshelf: item }, fields: title ? { title } : {}, why: "wrote" }).catch(() => null);
  if (!r?.path) return null;
  const all = keptNotes();
  all[item] = r.path;
  try { localStorage.setItem(NOTES_KEY, JSON.stringify(all)); } catch { /* found again next time */ }
  return r.path;
}
const NOTES_KEY = "atlas-abs-notes";
/** Item id → the book's note, as found on this device. */
export function keptNotes() { try { return JSON.parse(localStorage.getItem(NOTES_KEY) ?? "{}") ?? {}; } catch { return {}; } }

/** The tab, drawn into `box`. `ctx`: { atlas, a, item, title(), at() → seconds now, go(t) → seek or start there }. */
export function bookmarks(box, ctx) {
  const { atlas, a, item } = ctx;
  const P = atlas.player;
  const add = el("div", "abs-add"), note = el("input"), addBtn = el("button", "atlas-btn", "Bookmark");
  Object.assign(note, { type: "text", placeholder: "A note for this place (optional)" });
  note.setAttribute("aria-label", "Bookmark note");
  add.append(note, addBtn);
  const list = el("ol", "abs-marks"), status = el("div", "abs-empty");
  box.append(add, list, status);
  let marks = [];

  async function load() {
    try { marks = bookmarksOf(await a.me(), item); draw(); }
    catch (e) { status.textContent = `Bookmarks not loaded: ${e.message ?? e}`; }
  }
  function draw() {
    status.textContent = marks.length ? "" : "No bookmarks yet.";
    list.replaceChildren(...marks.map((m) => {
      const li = el("li"), go = el("button", "abs-mark-go");
      go.append(el("span", "abs-mark-at", clock(m.time)), el("span", "abs-mark-title", m.title));
      go.title = "Go there";
      go.onclick = () => ctx.go(m.time);
      const into = el("button", "abs-mini", "Into the note"), del = el("button", "abs-mini", "✕");
      into.title = "Write this bookmark into the book's note as a time link";
      del.title = "Remove this bookmark";
      del.setAttribute("aria-label", `Remove the bookmark at ${clock(m.time)}`);
      into.onclick = () => void intoNote(m);
      del.onclick = async () => {
        try { await a.removeBookmark(item, m.time); marks = marks.filter((x) => x !== m); draw(); }
        catch (e) { atlas.toast?.("Bookmark not removed", String(e?.message ?? e), "error"); }
      };
      li.append(go, into, del);
      return li;
    }));
  }
  addBtn.onclick = async () => {
    const t = Math.floor(ctx.at()), title = note.value.trim() || `Bookmark at ${clock(t)}`;
    try {
      await a.addBookmark(item, t, title);
      marks = [...marks.filter((m) => m.time !== t), { time: t, title, createdAt: Date.now() }].sort((p, q) => p.time - q.time);
      note.value = "";
      draw();
    } catch (e) { atlas.toast?.("Bookmark not added", String(e?.message ?? e), "error"); }
  };
  note.onkeydown = (e) => { if (e.key === "Enter") addBtn.click(); };

  /** The bookmark as a line of the book's note, under its Bookmarks heading; without the catalog, the link is copied. */
  async function intoNote(m) {
    const path = await bookNote(atlas, item, ctx.title());
    const link = P.timeLink ? P.timeLink(m.time, path ?? undefined) : clock(m.time);
    const line = `- ${link} ${m.title}`.trimEnd();
    if (!path) {
      try { await navigator.clipboard.writeText(line); } catch { /* shown in the toast instead */ }
      atlas.toast?.("No note for this book", `The catalog is off, so the bookmark was copied: ${line}`);
      return;
    }
    try {
      const next = withBookmark(await atlas.readText(path).catch(() => ""), line);
      if (next !== null) await atlas.writeText(path, next);
      atlas.toast?.(next === null ? "Already in the note" : "Bookmark written", path);
    } catch (e) { atlas.toast?.("Bookmark not written", String(e?.message ?? e), "error"); }
  }

  void load();
  return { reload: load };
}
