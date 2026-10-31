// The user's Suwayomi (Tachiyomi's server) for the web side, as android/Suwayomi.java for the phone: its library beside
// the vault's series, chapters read page by page from it (kept in the plugin's cache), where you are written back. Its
// GraphQL API was checked against a real server: reading state under `user`, pages by
// `fetchChapterPages`. Reached through the core's fetch, which offers the sign-in in front (Authelia) when it answers.
// What it answered is kept (`kept`): the library and chapter lists come from there when the server cannot be reached,
// a chapter's page list and pictures are never asked twice, and where you are, when it cannot be sent, waits and goes
// with the next answer.

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
const idOf = (chapter) => Number(chapter.slice(SCHEME.length).split("/")[0]);

/** Page lists kept for this many chapters, the last opened first. */
const KEEP_PAGES = 300;
/** What a server answered, kept in the page's storage per server: { library, chapters: {<manga id>: nodes},
 *  pages: {<chapter id>: urls}, marks: {<chapter id>: { page, read }} not yet sent }. In memory only when storage is off. */
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
  /** A picture of the server, kept in the plugin's cache: an address the page can show, through the core's thumbnails
   *  (`width` px at most): the server sends JPEG XL too, which WebKit's own decoder can hang the page on. One kept
   *  already is not asked again (a page's picture does not change; a cover rarely). */
  async function picture(url, keep, width) {
    const there = `.atlas/cache/plugins/${atlas.plugin?.id ?? "manga"}/suwayomi/${keep}`;
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
      const nodes = await keptOr(async () => (await query("{ mangas(condition: {inLibrary: true}) { nodes { id title thumbnailUrl user { unreadCount } categories { nodes { name default } } } } }")).mangas?.nodes ?? [],
        () => k.library, (v) => (k.library = v));
      return nodes.map((m) => ({ path: SCHEME + m.id, title: m.title, remote: m.id, coverUrl: base + m.thumbnailUrl, unread: m.user?.unreadCount ?? 0, chapters: null, dir: true,
        categories: (m.categories?.nodes ?? []).filter((c) => !c.default).map((c) => String(c.name)) }));
    },
    /** Its chapters in reading order, and where you are in them (the screens' shape). */
    async chapters(s) {
      const nodes = await keptOr(async () => (await query("query($id: Int!) { chapters(condition: {mangaId: $id}, order: [{by: CHAPTER_NUMBER}, {by: SOURCE_ORDER}]) { nodes { id name user { isRead lastPageRead lastReadAt } } } }", { id: s.remote })).chapters?.nodes ?? [],
        () => k.chapters[s.remote], (v) => (k.chapters[s.remote] = v));
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
      let list = k.pages[id];
      if (list) delete k.pages[id]; // put back last: the most recently opened are the ones kept
      else list = (await query("mutation($id: Int!) { fetchChapterPages(input: {chapterId: $id}) { pages } }", { id })).fetchChapterPages?.pages ?? [];
      if (list.length) { k.pages[id] = list; store.save(); }
      const made = new Map();
      return {
        count: list.length,
        url(i) { if (!made.has(i)) made.set(i, picture(base + list[i], `${idOf(chapter)}/${i}`, PAGE_W)); return made.get(i); },
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
