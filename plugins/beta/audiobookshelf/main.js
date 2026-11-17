// Audiobookshelf's page side — the Libraries page's Audiobooks and Podcasts (the user's Audiobookshelf) and a command
// opening it; a book opens in the player (view.js), a podcast on its episodes (podcast.js). The catalog side is the helper (helper/). docs/design/DESIGN-audiobooks.md.
import { abs, clock, openidSignIn } from "./abs.js";
import { playBook } from "./play.js";

/** Another plugin's ▶ on a book of this server (the Books reader's, when the book's note has `audiobookshelf: <id>`):
 *  window events, answered only while a server is set. `atlas-audiobook:ask` `{ item }` gets `plugin` (this plugin's
 *  id, which the app's player names in its state) set while it is dispatched; `atlas-audiobook:play` `{ item, from? }`
 *  gets `started`, the promise of the playing (play.js, the pane's own path); `atlas-audiobook:ready` tells readers
 *  opened before this plugin to ask again. */
function answerReaders(atlas) {
  const ask = (ev) => { const d = ev.detail; if (d && abs(atlas).on) d.plugin = atlas.plugin.id; };
  const play = (ev) => {
    const d = ev.detail, a = abs(atlas);
    if (d?.item && a.on) d.started = playBook(atlas, a, { item: String(d.item), from: Number.isFinite(d.from) ? d.from : undefined });
  };
  window.addEventListener("atlas-audiobook:ask", ask);
  window.addEventListener("atlas-audiobook:play", play);
  window.dispatchEvent(new CustomEvent("atlas-audiobook:ready"));
  return () => { window.removeEventListener("atlas-audiobook:ask", ask); window.removeEventListener("atlas-audiobook:play", play); };
}

export function register(atlas) {
  const listen = (id, title) => atlas.openView(id, { title, icon: "headphones" });
  // the library is the Libraries page's Audiobooks; the pane is the player
  atlas.registerCommand({ id: "library", title: "Audiobooks: library", run: () => atlas.openLibrary("audiobooks") });
  // the pane with no book: the server's shelves, search, collections, playlists and your listening
  const home = () => atlas.openView(undefined, { title: "Audiobookshelf", icon: "headphones" });
  atlas.registerCommand({ id: "home", title: "Audiobooks: shelves and search", run: home });
  // the server's own sign-in (Authelia or any OpenID provider in front of it), instead of pasting an API token
  atlas.registerCommand({
    id: "signin", title: "Audiobookshelf: sign in (OpenID, Authelia…)",
    run: async () => {
      try { await openidSignIn(atlas); atlas.toast?.("Signed in to Audiobookshelf", "Its token is kept with the plugin's secrets."); }
      catch (e) { atlas.toast?.("Not signed in to Audiobookshelf", String(e?.message ?? e), "error"); }
    },
  });
  atlas.registerLibrary?.({
    id: "audiobooks", title: "Audiobooks", icon: "headphones", noun: "audiobooks",
    async load() {
      const a = abs(atlas);
      if (!a.on) return [];
      return (await a.books()).map((b) => {
        const done = b.progress?.isFinished, pct = b.progress ? Math.round((b.progress.progress ?? 0) * 100) : 0;
        return {
          id: b.id, title: b.title, sub: [b.author, b.narrator && `read by ${b.narrator}`, clock(b.duration, true)].filter(Boolean).join(" · "),
          cover: () => a.cover(b.id).catch(() => null),
          flags: done ? [{ label: "finished" }] : [], // how far is the bar under the cover
          groups: [b.series || b.author || b.library, ...b.groups].filter(Boolean), tags: done ? ["finished"] : pct ? ["listening"] : [],
          text: [b.title, b.author, b.narrator, b.series].join(" "),
          sort: { title: b.title, recent: b.progress?.lastUpdate ?? 0, author: b.author }, book: b,
          // the Continue row and the bar under the cover: how far, and when last listened
          progress: done ? 1 : b.progress ? b.progress.progress ?? 0 : undefined, lastUsed: b.progress?.lastUpdate || undefined,
          // yours once started (past the start, as its note is made) or finished; the rest is the server's, in its own tab
          ...(done || pct >= 1 ? {} : { from: "Audiobookshelf" }),
        };
      });
    },
    groupsTitle: "Series, authors, collections", layouts: ["covers", "list"],
    // the server's own shelves (Continue listening, Recently added, series…) and its search: the pane's home, its own
    // tab — the library lists only what you have started; on the phone the app's own Audiobooks screen
    homes: [{ from: "Audiobookshelf", label: "Audiobookshelf", run: () => atlas.openNative?.("audiobookshelf:home") || home() }],
    sorts: [{ id: "recent", label: "last listened", desc: true }, { id: "title", label: "title" }, { id: "author", label: "author" }],
    search: "Search the audiobooks…", empty: "No audiobooks: your Audiobookshelf's address in Settings → Plugins → Audiobookshelf, then the command “Audiobookshelf: sign in” (or an API token there).",
    detail: (item) => ({
      kind: "Audiobook", title: item.title, lines: [{ text: item.sub ?? "" }, ...(item.book.series ? [{ text: item.book.series, muted: true }] : [])],
      actions: [{ label: item.book.progress && !item.book.progress.isFinished ? "Go on listening" : "Listen", icon: "headphones", primary: true, run: () => listen(item.id, item.title) }],
    }),
    open: (item) => listen(item.id, item.title),
  });
  // the server's podcasts beside its audiobooks: a podcast opens on its episodes (podcast.js)
  const episodes = (id, title) => atlas.openView(`show:${id}`, { title, icon: "headphones" });
  atlas.registerLibrary?.({
    id: "podcasts", title: "Podcasts", icon: "headphones", noun: "podcasts",
    async load() {
      const a = abs(atlas);
      if (!a.on) return [];
      return (await a.shows()).map((p) => ({
        id: p.id, title: p.title, sub: [p.author, p.episodes ? `${p.episodes} episodes` : ""].filter(Boolean).join(" · "),
        cover: () => a.cover(p.id).catch(() => null), groups: [p.author || p.library].filter(Boolean), tags: p.lastUsed ? ["listening"] : [],
        text: [p.title, p.author].join(" "), sort: { title: p.title, recent: p.lastUsed, author: p.author }, lastUsed: p.lastUsed || undefined, show: p,
        ...(p.lastUsed ? {} : { from: "Audiobookshelf" }), // yours once listened to; the rest in the server's own tab
      }));
    },
    groupsTitle: "Authors", layouts: ["covers", "list"],
    homes: [{ from: "Audiobookshelf", label: "Audiobookshelf", run: () => atlas.openNative?.("audiobookshelf:home") || home() }],
    sorts: [{ id: "recent", label: "last listened", desc: true }, { id: "title", label: "title" }],
    search: "Search the podcasts…", empty: "No podcasts: none in your Audiobookshelf's podcast libraries (or its address is not set: Settings → Plugins → Audiobookshelf).",
    detail: (item) => ({ kind: "Podcast", title: item.title, lines: [{ text: item.sub ?? "" }], actions: [{ label: "Episodes", icon: "headphones", primary: true, run: () => episodes(item.id, item.title) }] }),
    open: (item) => episodes(item.id, item.title),
  });
  return answerReaders(atlas); // undone when the plugin reloads or is switched off
}
