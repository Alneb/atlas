// Audiobookshelf's answers as the pane draws them, pure (helper/helper.test.ts tests them on cut-down copies of the
// server's answers): a library item — minified or expanded, from a shelf, a search, a collection or a playlist — as one
// card; the home's shelves (`/api/libraries/<id>/personalized`), collections, playlists and search hits as rows of
// cards; the pane's argument (a book, a podcast, an episode, or the home). No DOM and no URL class here: the helper
// bundles this module too, and QuickJS has neither.

/** Where you are in an item (or one episode of a podcast): the key `/api/me`'s mediaProgress is looked up by. */
export const progressKey = (item, episode) => (episode ? `${item}/${episode}` : String(item));

/** `/api/me`'s mediaProgress as a map by `progressKey`. */
export function progressMap(me) {
  return new Map((me?.mediaProgress ?? []).map((p) => [progressKey(p.libraryItemId, p.episodeId), p]));
}

/** Authors, narrators: expanded (`[{ name }]`, `["…"]`) or minified (`"A, B"`) → one line. */
export function namesOf(v) {
  if (typeof v === "string") return v.trim();
  return (Array.isArray(v) ? v : []).map((n) => (n && typeof n === "object" ? n.name : n)).filter((n) => typeof n === "string" && n.trim()).join(", ");
}

/** The series line: minified `seriesName` ("Dune #1"), else the expanded `series` ([{ name, sequence }]). */
function seriesOf(m) {
  if (typeof m.seriesName === "string" && m.seriesName) return m.seriesName;
  const s = Array.isArray(m.series) ? m.series[0] : m.series && typeof m.series === "object" ? m.series : null;
  return s?.name ? (s.sequence ? `${s.name} #${s.sequence}` : s.name) : "";
}

/** What the card's bar says: 0–1, 1 finished, undefined never begun. */
function howFar(p) {
  if (!p) return undefined;
  if (p.isFinished) return 1;
  const v = Number(p.progress);
  return Number.isFinite(v) && v > 0 ? Math.min(1, v) : undefined;
}

/** One card: a book, a podcast (its episodes in the pane) or one episode. `progress`: `progressMap`'s map. */
export function cardOf(item, progress = new Map(), episode = null) {
  const media = item?.media ?? {}, m = media.metadata ?? {};
  const show = item?.mediaType === "podcast" || (!!media.episodes && !media.tracks) || typeof media.numEpisodes === "number";
  const ep = episode ?? item?.recentEpisode ?? null;
  const id = String(item?.id ?? item?.libraryItemId ?? "");
  if (ep) {
    const p = progress.get(progressKey(id, ep.id));
    return {
      kind: "episode", id, episode: String(ep.id), title: ep.title ?? "", sub: m.title ?? "",
      duration: Number(ep.duration ?? ep.audioFile?.duration ?? ep.audioTrack?.duration) || 0,
      progress: howFar(p), at: Number(p?.currentTime) || 0, lastUsed: Number(p?.lastUpdate) || 0, open: `${id}/${ep.id}`,
    };
  }
  const p = progress.get(id);
  return {
    kind: show ? "show" : "book", id, title: m.title ?? id, author: namesOf(m.authors ?? m.authorName ?? m.author),
    narrator: namesOf(m.narrators ?? m.narratorName), series: seriesOf(m), duration: Number(media.duration) || 0,
    episodes: show ? Number(media.numEpisodes ?? media.episodes?.length) || 0 : undefined,
    ebook: !!(media.ebookFile || media.ebookFormat), progress: howFar(p), lastUsed: Number(p?.lastUpdate) || 0,
    open: show ? `show:${id}` : id,
  };
}

/** A group of cards opened as one (a series, a collection, a playlist): its own card on a shelf. */
const groupOf = (kind, id, title, cards) => ({ kind, id: String(id), title: String(title ?? ""), cards });

/** `/api/libraries/<id>/personalized` → shelves: `{ id, label, cards }`, a card being a book, a podcast, an episode or
 *  a group (a series, its books inside). Authors' shelves are left out (the pane has no author page; search finds
 *  their books); empty shelves too. */
export function shelvesOf(personalized, progress = new Map()) {
  const out = [];
  for (const s of Array.isArray(personalized) ? personalized : []) {
    const entities = Array.isArray(s?.entities) ? s.entities : [];
    let cards = [];
    if (s.type === "series") cards = entities.map((x) => groupOf("series", x.id, x.name, (x.books ?? []).map((b) => cardOf(b, progress))));
    else if (s.type === "book" || s.type === "podcast" || s.type === "episode") cards = entities.map((x) => cardOf(x, progress));
    if (cards.length) out.push({ id: String(s.id ?? ""), label: String(s.label ?? s.id ?? ""), cards });
  }
  return out;
}

/** `/api/libraries/<id>/collections` → groups of books. */
export function collectionsOf(answer, progress = new Map()) {
  return (answer?.results ?? []).map((c) => groupOf("collection", c.id, c.name, (c.books ?? []).map((b) => cardOf(b, progress)))).filter((g) => g.cards.length);
}

/** `/api/libraries/<id>/playlists` → groups: books and episodes, in the playlist's order. */
export function playlistsOf(answer, progress = new Map()) {
  return (answer?.results ?? []).map((p) => groupOf("playlist", p.id, p.name, (p.items ?? []).filter((x) => x.libraryItem).map((x) => cardOf(x.libraryItem, progress, x.episode ?? null)))).filter((g) => g.cards.length);
}

/** `/api/libraries/<id>/search` → `{ cards, groups, authors }`: the books and podcasts found, the series (their books
 *  inside), the authors (each opened by its id: `/api/authors/<id>?include=items`). */
export function hitsOf(answer, progress = new Map()) {
  const items = [...(answer?.book ?? []), ...(answer?.podcast ?? [])].map((h) => h?.libraryItem).filter(Boolean);
  return {
    cards: items.map((it) => cardOf(it, progress)),
    groups: (answer?.series ?? []).map((s) => groupOf("series", s.series?.id, s.series?.name, (s.books ?? []).map((b) => cardOf(b, progress)))).filter((g) => g.cards.length),
    authors: (answer?.authors ?? []).map((a) => ({ id: String(a.id), name: String(a.name ?? ""), books: Number(a.numBooks) || 0 })),
  };
}

/** The pane's argument: "" the home; `<item>` a book; `show:<item>` a podcast's episodes; `<item>/<episode>` an episode
 *  (Audiobookshelf's ids carry neither `:` nor `/`). */
export function argOf(arg) {
  const a = String(arg ?? "").trim();
  if (!a) return { kind: "home" };
  if (a.startsWith("show:")) return { kind: "show", item: a.slice(5) };
  const i = a.indexOf("/");
  return i > 0 ? { kind: "episode", item: a.slice(0, i), episode: a.slice(i + 1) } : { kind: "book", item: a };
}

/** A podcast's episodes (its expanded item's `media.episodes`) as episode cards, newest first, each with how far you
 *  are in it and `published` (ms; 0 unknown). */
export function episodesOf(item, progress = new Map()) {
  const eps = Array.isArray(item?.media?.episodes) ? item.media.episodes : [];
  const when = (e) => Number(e.publishedAt) || 0;
  return [...eps].sort((p, q) => when(q) - when(p) || (Number(q.index) || 0) - (Number(p.index) || 0))
    .map((e) => ({ ...cardOf(item, progress, e), published: when(e), finished: !!progress.get(progressKey(item.id, e.id))?.isFinished }));
}

/** What keeping a book (or one episode) for offline means, from its expanded item: the folder of the plugin's cache it
 *  goes in (`kept/<item>` or `kept/<item>_<episode>`), and per track the server's address, the file it is kept as
 *  (`<folder>/<n><ext>`) and where it sits in the item's time; with the title, author and chapters the player shows.
 *  Null when the item has no audio (or no such episode). */
export function keepPlan(item, episode) {
  const media = item?.media ?? {}, m = media.metadata ?? {};
  const ep = episode ? (media.episodes ?? []).find((e) => String(e.id) === String(episode)) : null;
  if (episode && !ep) return null;
  const tracks = ep ? [ep.audioTrack ?? ep.audioFile].filter((t) => t?.contentUrl) : (media.tracks ?? []).filter((t) => t?.contentUrl);
  if (!tracks.length) return null;
  const folder = `kept/${item.id}${ep ? `_${ep.id}` : ""}`;
  const extOf = (t) => { const e = String(t.metadata?.ext ?? "").toLowerCase(); return /^\.[a-z0-9]{1,5}$/.test(e) ? e : /\.[a-z0-9]{1,5}$/i.exec(String(t.metadata?.filename ?? ""))?.[0].toLowerCase() ?? ""; };
  let at = 0;
  return {
    folder, title: (ep ? ep.title : m.title) ?? "", author: ep ? m.title ?? "" : namesOf(m.authors ?? m.authorName ?? m.author),
    chapters: (ep ? ep.chapters ?? [] : media.chapters ?? []).map((c) => ({ start: Number(c.start) || 0, end: Number(c.end) || 0, title: String(c.title ?? "") })),
    tracks: tracks.map((t, i) => {
      const start = Number.isFinite(Number(t.startOffset)) ? Number(t.startOffset) : at, duration = Number(t.duration) || 0;
      at = start + duration;
      return { url: t.contentUrl, file: `${folder}/${i + 1}${extOf(t)}`, start, duration };
    }),
  };
}

/** A local day as Audiobookshelf keys its listening days: "2026-11-17". */
export const dayKey = (ms) => { const d = new Date(ms); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

/** `/api/me/listening-stats` as the home shows it: the total and today's time (seconds), the last seven days (oldest
 *  first, `{ day, seconds }`, a day with none at 0), this week's sum, and the five items listened to most. */
export function statsOf(answer, now = Date.now()) {
  const days = answer?.days && typeof answer.days === "object" ? answer.days : {};
  const week = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(now); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() - (6 - i)); // noon: no DST edge
    const day = dayKey(d.getTime());
    return { day, seconds: Number(days[day]) || 0 };
  });
  const top = Object.values(answer?.items ?? {}).map((x) => ({ id: String(x?.id ?? ""), title: String(x?.mediaMetadata?.title ?? x?.id ?? ""), seconds: Number(x?.timeListening) || 0 }))
    .filter((x) => x.seconds > 0).sort((p, q) => q.seconds - p.seconds).slice(0, 5);
  return { total: Number(answer?.totalTime) || 0, today: Number(answer?.today) || week[6].seconds, week, weekTotal: week.reduce((n, d) => n + d.seconds, 0), top };
}

/** An item's bookmarks from `/api/me` (`bookmarks: [{ libraryItemId, time, title, createdAt }]`; every server version
 *  has them there), in the book's order. */
export function bookmarksOf(me, item) {
  return (me?.bookmarks ?? []).filter((b) => b.libraryItemId === item).map((b) => ({ time: Number(b.time) || 0, title: String(b.title ?? ""), createdAt: Number(b.createdAt) || 0 })).sort((p, q) => p.time - q.time);
}

/** A note's text with `line` added at the end of its `## Bookmarks` section (made at the end when it has none). The
 *  same line twice is written once. Only the owner's click writes it (view.js, "Into the note"). */
export function withBookmark(text, line) {
  const lines = String(text ?? "").replace(/\s+$/, "").split("\n");
  if (lines.some((l) => l.trim() === line.trim())) return null; // there already
  const h = lines.findIndex((l) => /^##\s+bookmarks\s*$/i.test(l.trim()));
  if (h < 0) return `${lines.join("\n")}${lines.join("").trim() ? "\n\n" : ""}## Bookmarks\n\n${line}\n`;
  let end = lines.length;
  for (let i = h + 1; i < lines.length; i++) if (/^#{1,2}\s/.test(lines[i])) { end = i; break; }
  while (end > h + 1 && !lines[end - 1].trim()) end--; // after the section's last line, not its blank tail
  const out = [...lines.slice(0, end), ...(end === h + 1 ? [""] : []), line, ...(end < lines.length ? [""] : []), ...lines.slice(end).filter((l, i) => i > 0 || l.trim())];
  return `${out.join("\n")}\n`;
}

// ---- read-along: the item's ebook beside the player, its place in Audiobookshelf's terms and the app readers' ----
// Audiobookshelf keeps an ebook's place as `ebookLocation` — an EPUB CFI from its epub.js reader, a page number for a
// PDF — and `ebookProgress` (0–1). The app's readers keep theirs in the book's note: `reading_chapter` (from 1) and
// `reading_at` (in the chapter) for an EPUB, `reading_page` for a PDF, `progress` and `last_read` (Books' Shelf.java /
// view.js). The two meet at the chapter (an EPUB) or the page (a PDF): finer places do not translate.

/** The spine position (from 1) an EPUB CFI starts in: `epubcfi(/6/14!/4/2…)` → 7 (the package's spine is its 3rd
 *  child, `/6`; an itemref's step is twice its position). Null for anything else. */
export function cfiChapter(cfi) {
  const m = /^epubcfi\(\/6\/(\d+)(?:\[[^\]]*\])?!/.exec(String(cfi ?? "").trim());
  const step = m ? Number(m[1]) : NaN;
  return Number.isInteger(step) && step >= 2 && step % 2 === 0 ? step / 2 : null;
}

const pct = (v) => { const t = String(v ?? "").trim(), n = parseFloat(t); return Number.isFinite(n) ? (t.includes("%") ? n / 100 : n) : null; };

/** The note's place as Audiobookshelf's `{ ebookLocation, ebookProgress }` (what it can say of it), with `at`: when it
 *  was read (ms; 0 unknown). Null when the note has no place. `format`: "epub" or "pdf". */
export function serverPlace(props, format) {
  const at = Date.parse(String(props?.last_read ?? "")) || 0, progress = pct(props?.progress);
  const out = {};
  if (format === "pdf" && Number(props?.reading_page) > 0) out.ebookLocation = String(Math.floor(Number(props.reading_page)));
  if (format === "epub" && Number(props?.reading_chapter) > 0) out.ebookLocation = `epubcfi(/6/${2 * Math.floor(Number(props.reading_chapter))}!/4/2)`;
  if (progress !== null && progress >= 0 && progress <= 1) out.ebookProgress = progress;
  return Object.keys(out).length ? { ...out, at } : null;
}

/** The server's place as the note's properties (what a reader there starts from), or null when it has none. */
export function notePlace(p, format) {
  const loc = String(p?.ebookLocation ?? "").trim(), progress = Number(p?.ebookProgress);
  const props = {};
  if (format === "pdf" && /^\d+$/.test(loc) && Number(loc) > 0) props.reading_page = loc;
  const ch = format === "epub" ? cfiChapter(loc) : null;
  if (ch) { props.reading_chapter = String(ch); props.reading_at = "0%"; }
  if (Number.isFinite(progress) && progress > 0) props.progress = `${Math.round(progress * 1000) / 10}%`;
  return Object.keys(props).length ? props : null;
}

/** Which side is newer: "server" (its place goes into the note), "note" (the note's goes to the server), or null. */
export function newerPlace(server, note) {
  const s = Number(server?.lastUpdate) || 0, n = Number(note?.at) || 0;
  if (note && (!server?.ebookLocation && server?.ebookProgress == null || n > s)) return "note";
  if (!note && (server?.ebookLocation || Number(server?.ebookProgress) > 0)) return "server";
  return s > n ? "server" : null;
}
