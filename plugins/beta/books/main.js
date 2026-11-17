// Books — the web side's entry: the Libraries page's E-books and a command opening it; the reader is view.js. The
// vault's books and those in folders of a server (the `remote` setting). An .epub opens in the pane by "Open with…" (plugin.toml `opens`).
import { BOOK, booksIn, remoteFolders, bookFacts } from "./view.js";
import { bookOfName } from "./shared/name.js";

/** A book's folders under the library's top folder: `Books/Condensed Matter/x.pdf` → ["Books", "Condensed Matter"]. */
const folders = (path, top) => {
  const rel = path.replace(/^\/+/, "").slice(top.replace(/^\/+|\/+$/g, "").length).replace(/^\/+/, "");
  return rel.split("/").slice(0, -1).filter(Boolean);
};

/** "42%" or "0.42" → 0.42; anything else → undefined. */
const share = (v) => {
  const m = /^\s*([\d.]+)\s*(%?)\s*$/.exec(String(v ?? ""));
  if (!m) return undefined;
  const n = Number(m[1]) / (m[2] ? 100 : 1);
  return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : undefined;
};

/** Where each vault book is, from the books' notes in one query (`progress`, `last_read`, as both readers write them):
 *  `book.epub`'s note is `book.md` beside it, so the map is by the path without its extension. */
async function readingOfAll(atlas) {
  if (!atlas.query) return new Map();
  const keys = ["progress", "last_read"];
  const yaml = `filters:\n  and:\n    - file.hasProperty("book")\nviews:\n  - type: table\n    name: all\n    order:\n${["file.name", ...keys].map((k) => `      - ${JSON.stringify(k)}`).join("\n")}\n`;
  const view = (await atlas.query(yaml).catch(() => null))?.views?.[0];
  if (!view) return new Map();
  const at = (key) => view.columns.findIndex((c) => c.key === key || c.id === key || c.id === `note.${key}`);
  const [pi, li] = keys.map(at);
  return new Map(view.rows.map((r) => {
    const last = Date.parse(String(r.edit?.[li] ?? ""));
    return [r.path.replace(/\.md$/i, ""), { progress: share(r.edit?.[pi]), lastUsed: Number.isFinite(last) ? last : undefined }];
  }));
}

export function register(atlas) {
  // the library is the Libraries page's E-books tab, the one place books are listed; the pane is the reader
  atlas.registerCommand({ id: "library", title: "Books: library", run: () => atlas.openLibrary("books") });
  const covers = [];
  atlas.registerLibrary?.({
    // "E-books": the files read here, a tab of the one Books library beside the catalog's book notes (subject "books")
    id: "books", title: "E-books", subject: "books", icon: "file-text", noun: "books",
    async load() {
      for (const u of covers.splice(0)) URL.revokeObjectURL(u);
      const S = atlas.plugin.settings ?? {};
      const top = String(S.folder || "books").replace(/^\/+|\/+$/g, "");
      const mine = (await booksIn(atlas, top, [], BOOK)).map((b) => ({ ...b, dirs: folders(b.path, top) }));
      // a server's books are not listed: its shelf is its own tab (`homes`), a book there joins once it is yours
      const reading = await readingOfAll(atlas);
      return mine.map((b) => {
        // what its file's name says (title, author, series, year); under it the author, the year and its folder
        const n = bookOfName(b.name);
        const read = reading.get(b.path.replace(/\.[^./]+$/, ""));
        return {
          ...read, // how far, and when last read: the Continue row and the bar under the cover
          id: b.path, note: b.path, title: n.title, sub: [n.author, n.year, b.dirs.at(-1)].filter(Boolean).join(" · "), named: n,
          // the core's EPUB cover or PDF first page (cached in .atlas/cache/thumbs), asked only when the card comes near
          // the view; an older Atlas: read from the EPUB here
          cover: atlas.files?.thumb ? () => atlas.files.thumb("vault", "", b.path).catch(() => null)
            : /\.epub$/i.test(b.path) ? async () => {
              const f = await bookFacts(await atlas.fileUrl(b.path), atlas.zip).catch(() => null);
              if (f?.cover) covers.push(f.cover);
              return f?.cover ?? null;
            } : undefined,
          // the folders kept as they are on disk: the side lists each by its path, and every folder on the way is a tag
          groups: [b.dirs.join(" › ") || "Vault"], tags: b.dirs, text: `${b.name} ${n.title} ${n.author ?? ""} ${n.series ?? ""} ${b.dirs.join(" ")}`,
          sort: { title: n.title, author: n.author ?? "~", year: Number(n.year ?? 0), recent: read?.lastUsed ?? 0 }, book: b,
        };
      });
    },
    // a server's shelf is its own tab (the explorer on that folder, its thumbnails): a book there joins this library
    // when it becomes yours (its note, the catalog's one-note rule)
    get homes() {
      return remoteFolders(atlas.plugin.settings ?? {}).map((r) => ({ from: r.place, label: r.place, run: () => atlas.files.explore({ source: r.source, place: r.place, path: r.folder }) }));
    },
    groupsTitle: "Folders", layouts: ["covers", "list"], sorts: [{ id: "title", label: "title" }, { id: "recent", label: "last read", desc: true }, { id: "author", label: "author" }, { id: "year", label: "year", desc: true }],
    search: "Search the books…", empty: "No books yet: EPUB, PDF or DjVu files in the books folder, or a folder of your server in the plugin's settings.",
    detail: (item) => {
      const n = item.named ?? {}, b = item.book;
      return {
        kind: ["Book", n.year].filter(Boolean).join(" · "), title: item.title,
        lines: [...(n.author ? [{ text: n.author }] : []), ...(n.series ? [{ text: n.series, muted: true }] : [])],
        // where it is: the file's own name (what the title was read from), its folder, the server
        fields: [["File", b.path.split("/").pop()], ["Folder", b.dirs.join(" › ") || "—"]],
        actions: [
          { label: "Read", icon: "file-text", primary: true, run: () => read(item) },
          { label: "Copy file name", icon: "copy", more: true, run: () => navigator.clipboard.writeText(b.path.split("/").pop()) },
        ],
      };
    },
    open: (item) => read(item),
  });
  /** A vault book opens in the reader (a PDF in the app's viewer; a server's opens from the explorer, its own tab).
   *  On the phone the app's own reader takes it (the pen, e-ink paging); the library stays the page's. */
  async function read(item) {
    const b = item.book;
    try {
      const path = b.path;
      if (atlas.openNative?.(path)) return;
      if (/\.epub$/i.test(path)) atlas.openView(path, { title: item.title, icon: "file-text" });
      else if (/\.djvu$/i.test(path)) atlas.open((await atlas.helper.call("as_pdf", { path }, { timeout: 1800 })).path); // made once into a PDF (helper/helper.ts)
      else atlas.open(path); // a PDF: the app's own viewer
    } catch (e) { atlas.toast("Books", `${item.title}: ${e.message ?? e}`, "error"); }
  }
}
