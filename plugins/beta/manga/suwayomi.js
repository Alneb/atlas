// The user's Suwayomi (Tachiyomi's server) for the web side, as android/Suwayomi.java for the phone: its library beside
// the vault's series, chapters read page by page from it (kept in the plugin's cache), where you are written back. Its
// GraphQL API was checked against a real server: reading state under `user`, pages by
// `fetchChapterPages`. Reached through the core's fetch, which offers the sign-in in front (Authelia) when it answers.
// What it answered is kept (`kept`): the library and chapter lists come from there when the server cannot be reached,
// a chapter's page list and pictures are never asked twice, and where you are, when it cannot be sent, waits and goes
// with the next answer. A chapter's page list and pictures and a series' chapters are also kept in the vault's cache for
// the plugin (`.atlas/cache/plugins/manga/suwayomi/`, the layout android/Kept.java gives), which the phone's native
// reader reads: a chapter kept here opens there with the server out of reach.

export const SCHEME = "suwayomi:";
/** A reader's page at most this wide (the core's largest thumbnail): smaller ones are passed through untouched. */
export const PAGE_W = 2048;
export const isRemote = (path) => String(path).startsWith(SCHEME);
/** Suwayomi's error in one line, without its Java stack trace; a source whose extension is gone says what to do.
 *  Suwayomi.java `said` is the phone's same rule. */
export function said(message) {
  const first = String(message).split(/\n\s*\n|\n\s*at |\n?\s*suwayomi\.tachidesk/)[0].trim();
  const gone = /Source not installed: (\d+)/.exec(first);
  if (gone) return `this series' source is not installed in Suwayomi (source ${gone[1]}): install its extension in Suwayomi's Extensions, or migrate the series to another source`;
  return `Suwayomi: ${first}`;
}
/** A Suwayomi series' id for its note (`suwayomi:` of the manga kind): its source and its address at that source —
 *  what stays when the server is set up again, unlike the server's own number. Suwayomi.java `thingId` the same. */
export const suwayomiId = (sourceId, url) => (sourceId && url ? `${sourceId}:${url}` : "");
/** What a reading change makes of a series, for the catalog's `note` tool (thing.rs): the last page of a chapter
 *  finishes it; a page past its first is progress (that far into the chapter); else only looked at. Thing.java the same. */
export function engagement(page, pages, read) {
  if (read || (pages > 0 && page >= pages - 1)) return { why: "finished" };
  return page > 0 && pages > 0 ? { why: "progress", progress: page / pages } : { why: "opened" };
}
const idOf = (chapter) => Number(chapter.slice(SCHEME.length).split("/")[0]);

/** Page lists kept for this many chapters, the last opened first. */
const KEEP_PAGES = 300;
/** What a server answered, kept in the page's storage per server: { library, chapters: {<manga id>: nodes},
 *  pages: {c<chapter id>: urls}, the last opened last, marks: {<chapter id>: { page, read }} not yet sent }. In memory only when storage is off. */
/** When a series was last read, in ms (0: never), from its kept chapters (what the server said, or a place not sent
 *  yet): the phone's Suwayomi.keptLastRead. Suwayomi's `lastReadAt` is seconds, some versions ms. */
export function lastReadOf(nodes) {
  let last = 0;
  for (const c of nodes ?? []) {
    const u = c?.user;
    if (!u || !(u.isRead || Number(u.lastPageRead) > 0)) continue;
    const t = Number(u.lastReadAt) || 0;
    last = Math.max(last, t <= 0 ? 0 : t < 1e11 ? t * 1000 : t);
  }
  return last;
}

export function kept(base, storage = globalThis.localStorage) {
  const key = `atlas.manga.suwayomi:${base}`;
  let data = {};
  try { data = JSON.parse(storage?.getItem(key) ?? "{}") ?? {}; } catch { /* storage off or spoilt: start empty */ }
  data.chapters ??= {}; data.pages ??= {}; data.marks ??= {};
  return {
    data,
    save() {
      const ids = Object.keys(data.pages);
      for (const id of ids.slice(0, Math.max(0, ids.length - KEEP_PAGES))) delete data.pages[id];
      try { storage?.setItem(key, JSON.stringify(data)); } catch { /* full or off: kept for this run */ }
    },
  };
}

/** A failure of the server's own (it answered, with an error) rather than of reaching it. */
class Answered extends Error {}
const MARK = "mutation($id: Int!, $page: Int!, $read: Boolean!) { updateChapter(input: {id: $id, patch: {lastPageRead: $page, isRead: $read}}) { chapter { id } } }";

export function suwayomi(atlas, address, store) {
  const base = String(address || "").trim().replace(/\/+$/, "");
  store ??= kept(base);
  const k = store.data;
  let flushing = null, told = false;
  async function ask(q, variables) {
    const r = await atlas.fetch(`${base}/api/graphql`, { method: "POST", headers: { "Content-Type": "application/json" }, body: { query: q, variables } });
    if (r.signin) throw new Error(`sign in to ${new URL(base).host} first (Atlas offered it)`);
    if (!r.ok) throw new Error(`Suwayomi answered ${r.status}`);
    const d = await r.json();
    if (d.errors?.length) throw new Answered(said(d.errors[0].message));
    return d.data;
  }
  async function query(q, variables = {}) {
    const d = await ask(q, variables);
    if (!flushing && Object.keys(k.marks).length) flushing = flush().finally(() => (flushing = null));
    return d;
  }
  /** The places kept while the server could not be reached, sent now it answers. */
  async function flush() {
    for (const [id, m] of Object.entries(k.marks)) {
      try { await ask(MARK, { id: Number(id), page: m.page, read: m.read }); } catch { return; }
      if (k.marks[id] === m) delete k.marks[id];
      store.save();
    }
  }
  /** `run`'s answer kept under `put`; when the server cannot be reached, the one kept last (`offline` says why). */
  async function keptOr(run, get, put) {
    try { const v = await run(); put(v); store.save(); api.offline = ""; return v; } catch (e) {
      if (e instanceof Answered || get() === undefined) throw e;
      api.offline = String(e.message ?? e);
      return get();
    }
  }
  const cache = (rest) => `.atlas/cache/plugins/${atlas.plugin?.id ?? "manga"}/suwayomi/${rest}`;
  /** `text` into the vault's cache for the native reader (Kept.java); a copy not written is only fetched again there. */
  const share = (rest, text) => Promise.resolve().then(() => atlas.writeText(cache(rest), text)).catch(() => {});
  /** A picture of the server, kept in the plugin's cache: an address the page can show, through the core's thumbnails
   *  (`width` px at most): the server sends JPEG XL too, which WebKit's own decoder can hang the page on. One kept
   *  already is not asked again (a page's picture does not change; a cover rarely). */
  async function picture(url, keep, width) {
    const there = cache(keep);
    if (await atlas.exists?.(there).catch(() => false)) return atlas.thumbUrl(there, width);
    const r = await atlas.fetch(url, { saveTo: `suwayomi/${keep}` });
    if (r.signin) throw new Error(`sign in to ${new URL(base).host} first`);
    if (!r.ok || !r.saved) throw new Error(`Suwayomi answered ${r.status}`);
    return atlas.thumbUrl(r.saved, width);
  }
  const api = {
    on: !!base,
    /** Why the last list came from what was kept rather than from the server ("" when it answered). */
    offline: "",
    /** The server's library: a series each (`suwayomi:<manga id>`) with its categories (Suwayomi's own "Default" left
     *  out), its chapters asked when it is opened. */
    async library() {
      if (!base) return [];
      const nodes = await keptOr(async () => (await query("{ mangas(condition: {inLibrary: true}) { nodes { id title thumbnailUrl downloadCount user { unreadCount } categories { nodes { name default } } } } }")).mangas?.nodes ?? [],
        () => k.library, (v) => (k.library = v));
      return nodes.map((m) => ({ path: SCHEME + m.id, title: m.title, remote: m.id, coverUrl: base + m.thumbnailUrl, unread: m.user?.unreadCount ?? 0, chapters: null, dir: true,
        downloaded: m.downloadCount ?? -1, lastRead: lastReadOf(k.chapters[m.id]),
        categories: (m.categories?.nodes ?? []).filter((c) => !c.default).map((c) => String(c.name)) }));
    },
    /** The series as the catalog's `note` tool takes it: its stable id, what the server says of it. Null when the server
     *  cannot say (out of reach): the note waits for the next change. */
    async thing(s) {
      const m = (await ask("query($id: Int!) { manga(id: $id) { title sourceId url author description } }", { id: s.remote }).catch(() => null))?.manga;
      if (!m) return null;
      const fields = Object.fromEntries(Object.entries({ title: m.title || s.title, author: m.author, description: m.description }).filter(([, v]) => v));
      return { kind: "manga", ids: { suwayomi: suwayomiId(m.sourceId, m.url) }, fields };
    },
    /** Its chapters in reading order, and where you are in them (the screens' shape). */
    async chapters(s) {
      const nodes = await keptOr(async () => (await query("query($id: Int!) { chapters(condition: {mangaId: $id}, order: [{by: CHAPTER_NUMBER}, {by: SOURCE_ORDER}]) { nodes { id name isDownloaded user { isRead lastPageRead lastReadAt } } } }", { id: s.remote })).chapters?.nodes ?? [],
        () => k.chapters[s.remote], (v) => { k.chapters[s.remote] = v; share(`series/${s.remote}.json`, JSON.stringify({ id: s.remote, title: s.title, nodes: v })); });
      const r = { chapters: {} };
      let lastAt = -1;
      s.chapters = nodes.map((c) => {
        const name = String(c.name).replaceAll("/", "∕"), m = k.marks[c.id];
        const u = m ? { ...c.user, isRead: m.read, lastPageRead: m.page, lastReadAt: String(m.at) } : c.user ?? {}; // a place not sent yet wins
        if (u.isRead || u.lastPageRead > 0) {
          r.chapters[name] = { read: !!u.isRead, page: u.isRead ? 0 : u.lastPageRead };
          const at = Number(u.lastReadAt) || 0;
          if (at > lastAt) { lastAt = at; r.last = name; }
        }
        return `${SCHEME}${c.id}/${name}`;
      });
      s.reading = r;
      // the chapters the server keeps itself (its Downloads), by id: they read even when their source is gone
      // (`isDownloaded`, deprecated for `user.isDownloaded` on newer servers but answered by every one)
      s.onServer = new Set(nodes.filter((c) => c.isDownloaded).map((c) => c.id));
    },
    // ---- Browse: the server's sources, what one lists, a series added to the library. The questions are
    // android/Browse.java's (Suwayomi's schema: a source id is a LongString sent as text, `inLibrary` per user,
    // `fetchSourceManga` a mutation answering {mangas, hasNextPage}).
    /** The installed sources: { id, name, lang, label, icon, nsfw, latest }, the server's own order. */
    async sources() {
      const d = await ask("{ sources { nodes { id name lang displayName iconUrl isNsfw supportsLatest } } }", {});
      return (d.sources?.nodes ?? []).filter((n) => n.id != null).map((n) => ({ id: String(n.id), name: n.name ?? String(n.id), lang: n.lang ?? "", label: n.displayName || n.name || String(n.id),
        icon: n.iconUrl ? base + n.iconUrl : null, nsfw: !!n.isNsfw, latest: !!n.supportsLatest }));
    },
    /** One page of what a source lists (`type`: POPULAR, LATEST or SEARCH with `q`) → { mangas: [{id, title, cover, inLibrary}], more }. */
    async listing(source, type, page, q) {
      const d = await ask("mutation($source: LongString!, $type: FetchSourceMangaType!, $page: Int!, $query: String) { fetchSourceManga(input: {source: $source, type: $type, page: $page, query: $query}) { hasNextPage mangas { id title thumbnailUrl user { inLibrary } } } }",
        { source: String(source), type, page, ...(type === "SEARCH" ? { query: String(q ?? "").trim() } : {}) });
      const f = d.fetchSourceManga ?? {};
      return { more: !!f.hasNextPage, mangas: (f.mangas ?? []).filter((m) => m.id > 0).map((m) => ({ id: m.id, title: m.title ?? "", cover: m.thumbnailUrl ? base + m.thumbnailUrl : null, inLibrary: !!m.user?.inLibrary })) };
    },
    /** A series' details, fetched from its source by the server first when a listing only named it. */
    async details(id) {
      const FIELDS = "id title thumbnailUrl author artist description genre status initialized source { displayName } user { inLibrary } chapters { totalCount } categories { nodes { id default } }";
      let m = (await ask(`query($id: Int!) { manga(id: $id) { ${FIELDS} } }`, { id })).manga;
      if (m && (!m.initialized || !m.chapters?.totalCount))
        m = (await ask(`mutation($id: Int!) { fetchMangaAndChapters(input: {id: $id, fetchManga: ${!m.initialized}, fetchChapters: true}) { manga { ${FIELDS} } } }`, { id })).fetchMangaAndChapters?.manga ?? m;
      if (!m) throw new Error(`Suwayomi knows no series ${id}`);
      const status = !m.status || m.status === "UNKNOWN" ? "" : m.status[0] + m.status.slice(1).toLowerCase().replace(/_/g, " ");
      return { id: m.id, title: m.title ?? "", cover: m.thumbnailUrl ? base + m.thumbnailUrl : null, author: m.author ?? "", artist: m.artist ?? "", description: (m.description ?? "").trim(),
        genres: (m.genre ?? []).map((g) => String(g).trim()).filter(Boolean), status, source: m.source?.displayName ?? "", inLibrary: !!m.user?.inLibrary, chapters: m.chapters?.totalCount ?? 0,
        categories: (m.categories?.nodes ?? []).filter((c) => !c.default).map((c) => c.id) };
    },
    /** In the library or out of it. */
    setInLibrary: (id, inLibrary) => ask("mutation($id: Int!, $inLibrary: Boolean!) { updateManga(input: {id: $id, patch: {inLibrary: $inLibrary}}) { clientMutationId } }", { id, inLibrary }),
    /** The server's categories in its own order, its "Default" left out (a series in none is in it). */
    async categories() {
      const d = await ask("{ categories { nodes { id name order default } } }", {});
      return (d.categories?.nodes ?? []).filter((c) => !c.default).sort((a, b) => (a.order ?? 0) - (b.order ?? 0)).map((c) => ({ id: c.id, name: String(c.name) }));
    },
    /** A series put in or taken out of one category. */
    setCategory: (id, category, on) => ask("mutation($id: Int!, $add: [Int!], $remove: [Int!]) { updateMangaCategories(input: {id: $id, patch: {addToCategories: $add, removeFromCategories: $remove}}) { clientMutationId } }",
      { id, add: on ? [category] : [], remove: on ? [] : [category] }),
    /** A source listing's cover, through the core's thumbnails as every picture of the server. */
    found: (m) => (m.cover ? picture(m.cover, `covers/${m.id}`, 300) : Promise.resolve(null)),
    /** Whether the server keeps this chapter itself. */
    onServer: (s, chapter) => !!s.onServer?.has(idOf(chapter)),
    /** These chapters queued in the server's own downloads (Suwayomi's Downloads, kept on the server) → how many. */
    async download(s, chapters) {
      const ids = chapters.map(idOf).filter((id) => !s.onServer?.has(id));
      if (ids.length) await ask("mutation($ids: [Int!]!) { enqueueChapterDownloads(input: {ids: $ids}) { clientMutationId } }", { ids });
      return ids.length;
    },
    /** Suwayomi's download queue: whether its downloader runs, and each queued chapter's series, name, how far (0–1)
     *  and state (QUEUED, DOWNLOADING, ERROR…). */
    async queue() {
      const d = await query("query { downloadStatus { state queue { progress state chapter { id name mangaId } } } }");
      const st = d.downloadStatus ?? {};
      return {
        running: st.state === "STARTED",
        items: (st.queue ?? []).map((q) => ({ id: q.chapter?.id, name: String(q.chapter?.name ?? ""), series: q.chapter?.mangaId, progress: Number(q.progress) || 0, state: String(q.state ?? "") })),
      };
    },
    /** The series' chapters fetched again from its source by the server (new ones found), then asked as `chapters`
     *  does → how many more there are than before. */
    async refresh(s) {
      const before = s.chapters?.length ?? 0;
      await ask("mutation($id: Int!) { fetchMangaAndChapters(input: {id: $id, fetchManga: false, fetchChapters: true}) { clientMutationId } }", { id: s.remote });
      await api.chapters(s);
      return Math.max(0, s.chapters.length - before);
    },
    /** The server's update of its whole library started (it fetches each series' source in the background; new
     *  chapters show in the unread counts as it goes). */
    updateLibrary: () => ask("mutation { updateLibrary(input: {}) { clientMutationId } }", {}),
    /** A chapter's pages: { count, url(i), done() }, as the vault's chapters give them. */
    async pages(chapter) {
      const id = idOf(chapter);
      // keyed `c<id>`: an object orders integer keys by value, which would keep the highest ids, not the last opened
      const key = `c${id}`;
      let list = k.pages[key];
      if (list) delete k.pages[key]; // put back last: the most recently opened are the ones kept
      else {
        // the vault's copy (the native reader's, or this page's in another browser), else the server's, shared
        const there = await Promise.resolve().then(() => atlas.readText(cache(`${id}/pages.json`))).then(JSON.parse).catch(() => null);
        list = Array.isArray(there) && there.length ? there.map(String) : null;
        if (!list) {
          list = (await query("mutation($id: Int!) { fetchChapterPages(input: {chapterId: $id}) { pages } }", { id })).fetchChapterPages?.pages ?? [];
          if (list.length) share(`${id}/pages.json`, JSON.stringify(list));
        }
      }
      if (list.length) { k.pages[key] = list; store.save(); }
      const made = new Map();
      return {
        count: list.length,
        url(i) {
          if (!made.has(i)) {
            const got = picture(base + list[i], `${idOf(chapter)}/${i}`, PAGE_W);
            got.catch(() => made.delete(i)); // a page that failed (the server out of reach a moment) is asked again
            made.set(i, got);
          }
          return made.get(i);
        },
        done() {},
      };
    },
    cover: (s) => picture(s.coverUrl, `covers/${s.remote}`, 300),
    /** Where you are in a chapter, written back to the server; kept and sent with its next answer when it cannot be
     *  reached (said once). */
    async mark(chapter, page, read) {
      const id = idOf(chapter);
      try { await query(MARK, { id, page, read }); delete k.marks[id]; store.save(); } catch (e) {
        if (e instanceof Answered) throw e;
        k.marks[id] = { page, read, at: Date.now() };
        store.save();
        if (!told) { told = true; atlas.toast?.("Manga", `Suwayomi cannot be reached (${e.message ?? e}): where you are is kept and sent when it answers.`); }
      }
    },
  };
  return api;
}
