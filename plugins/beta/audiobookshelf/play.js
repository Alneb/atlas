// A book (or a podcast's episode) handed to the app's one player (`atlas.player`): the server's play session — its
// tracks through the core (the token added there), its chapters, where you were — or the kept copy (keep.js) when this
// device has one, the server's session opened beside it when the server answers. The one way this plugin starts
// playing: the pane's ▶ (view.js) and another plugin's request (main.js: the Books reader's ▶, `atlas-audiobook:play`).
import { keptOf, keptPlace } from "./keep.js";
import { keptNotes } from "./bookmarks.js";

export const SPEEDS = [0.8, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5];
/** The speed you last chose, on this device. */
const SPEED_KEY = "atlas-abs-speed";
export const keptSpeed = () => { try { const v = Number(localStorage.getItem(SPEED_KEY)); return SPEEDS.includes(v) ? v : 1; } catch { return 1; } };
export const keepSpeed = (v) => { try { localStorage.setItem(SPEED_KEY, String(v)); } catch { /* this book only */ } };

/** Plays `item` (its `episode`) from `from` (undefined: where the server, else the kept copy, says you were). `cover`:
 *  an address already at hand. → `{ kept, session }` (the kept copy or null, the server's session or null: offline). */
export async function playBook(atlas, a, { item, episode, from, cover, speed = keptSpeed() }) {
  const kept = await keptOf(atlas, item, episode);
  let session = null;
  try { session = await a.play(item, episode); } catch (e) { if (!kept) throw e; }
  const own = (x) => ({ start: Number(x.startOffset ?? x.start) || 0, duration: Number(x.duration) || 0 });
  const tracks = kept
    ? await Promise.all(kept.tracks.map(async (t) => ({ src: await atlas.media({ file: t.file }), ...own(t) })))
    : await Promise.all((session.audioTracks ?? []).map(async (x) => ({ src: await a.src(x), ...own(x) })));
  if (!tracks.length) throw new Error("the server gave no audio for this book");
  const chapters = kept ? kept.chapters : (session.chapters ?? []).map((c) => ({ start: Number(c.start) || 0, end: Number(c.end) || 0, title: c.title ?? "" }));
  const m = session?.libraryItem?.media?.metadata ?? session?.mediaMetadata ?? {};
  const pic = cover || (await a.cover(item).catch(() => null));
  await atlas.player.play({
    key: { item, ...(episode ? { episode } : {}), ...(session ? { session: session.id } : {}), device: a.device() },
    // an episode: its own title, the podcast's name under it
    title: (!session ? kept.title : episode ? session.displayTitle : m.title ?? session.displayTitle) ?? "",
    author: !session ? kept.author : episode ? session.displayAuthor ?? m.title ?? "" : [m.authorName ?? session.displayAuthor, m.narratorName && `read by ${m.narratorName}`].filter(Boolean).join(" · "),
    cover: pic ?? undefined, tracks, chapters, at: from ?? (session ? Number(session.currentTime) || 0 : keptPlace(item, episode)), speed,
    open: episode ? `${item}/${episode}` : item, // the pane's argument for it (shelf.js argOf): the lower bar's click
    note: episode ? undefined : keptNotes()[item], // the book's note once found (bookmarks.js): its time links seek this book
  });
  return { kept, session };
}
