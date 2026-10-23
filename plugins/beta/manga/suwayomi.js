// The user's Suwayomi (Tachiyomi's server) for the web side, as android/Suwayomi.java for the phone: its library beside
// the vault's series, chapters read page by page from it (kept in the plugin's cache), where you are written back. Its
// GraphQL API was checked against a real server: reading state under `user`, pages by
// `fetchChapterPages`. Reached through the core's fetch, which offers the sign-in in front (Authelia) when it answers.

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

export function suwayomi(atlas, base) {
  base = String(base || "").trim().replace(/\/+$/, "");
  async function query(q, variables = {}) {
    const r = await atlas.fetch(`${base}/api/graphql`, { method: "POST", headers: { "Content-Type": "application/json" }, body: { query: q, variables } });
    if (r.signin) throw new Error(`sign in to ${new URL(base).host} first (Atlas offered it)`);
    if (!r.ok) throw new Error(`Suwayomi answered ${r.status}`);
    const d = await r.json();
    if (d.errors?.length) throw new Error(said(d.errors[0].message));
    return d.data;
  }
  /** A picture of the server, kept in the plugin's cache: an address the page can show, through the core's thumbnails
   *  (`width` px at most): the server sends JPEG XL too, which WebKit's own decoder can hang the page on. */
  async function picture(url, keep, width) {
    const r = await atlas.fetch(url, { saveTo: `suwayomi/${keep}` });
    if (r.signin) throw new Error(`sign in to ${new URL(base).host} first`);
    if (!r.ok || !r.saved) throw new Error(`Suwayomi answered ${r.status}`);
    return atlas.thumbUrl(r.saved, width);
  }
  return {
    on: !!base,
    /** The server's library: a series each (`suwayomi:<manga id>`), its chapters asked when it is opened. */
    async library() {
      if (!base) return [];
      const d = await query("{ mangas(condition: {inLibrary: true}) { nodes { id title thumbnailUrl user { unreadCount } } } }");
      return (d.mangas?.nodes ?? []).map((m) => ({ path: SCHEME + m.id, title: m.title, remote: m.id, coverUrl: base + m.thumbnailUrl, unread: m.user?.unreadCount ?? 0, chapters: null, dir: true }));
    },
    /** Its chapters in reading order, and where you are in them (the screens' shape). */
    async chapters(s) {
      const d = await query("query($id: Int!) { chapters(condition: {mangaId: $id}, order: [{by: CHAPTER_NUMBER}, {by: SOURCE_ORDER}]) { nodes { id name user { isRead lastPageRead lastReadAt } } } }", { id: s.remote });
      const r = { chapters: {} };
      let lastAt = -1;
      s.chapters = (d.chapters?.nodes ?? []).map((c) => {
        const name = String(c.name).replaceAll("/", "∕"), u = c.user ?? {};
        if (u.isRead || u.lastPageRead > 0) {
          r.chapters[name] = { read: !!u.isRead, page: u.isRead ? 0 : u.lastPageRead };
          const at = Number(u.lastReadAt) || 0;
          if (at > lastAt) { lastAt = at; r.last = name; }
        }
        return `${SCHEME}${c.id}/${name}`;
      });
      s.reading = r;
    },
    /** A chapter's pages: { count, url(i), done() }, as the vault's chapters give them. */
    async pages(chapter) {
      const d = await query("mutation($id: Int!) { fetchChapterPages(input: {chapterId: $id}) { pages } }", { id: idOf(chapter) });
      const list = d.fetchChapterPages?.pages ?? [], made = new Map();
      return {
        count: list.length,
        url(i) { if (!made.has(i)) made.set(i, picture(base + list[i], `${idOf(chapter)}/${i}`, PAGE_W)); return made.get(i); },
        done() {},
      };
    },
    cover: (s) => picture(s.coverUrl, `covers/${s.remote}`, 300),
    /** Where you are in a chapter, written back to the server. */
    mark: (chapter, page, read) => query("mutation($id: Int!, $page: Int!, $read: Boolean!) { updateChapter(input: {id: $id, patch: {lastPageRead: $page, isRead: $read}}) { chapter { id } } }", { id: idOf(chapter), page, read }),
  };
}
