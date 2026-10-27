// Books — the web side's entry: a command opening the library pane (view.js), and the Libraries page's Books: the
// vault's books and those in folders of a server (the `remote` setting). An .epub opens in the pane by "Open with…" (plugin.toml `opens`).
import { BOOK, booksIn, remoteBooks, remoteFolders, bookFacts } from "./view.js";

/** A book's folders under the library's top folder: `Books/Condensed Matter/x.pdf` → ["Books", "Condensed Matter"]. */
const folders = (path, top) => {
  const rel = path.replace(/^\/+/, "").slice(top.replace(/^\/+|\/+$/g, "").length).replace(/^\/+/, "");
  return rel.split("/").slice(0, -1).filter(Boolean);
};

export function register(atlas) {
  atlas.registerCommand({ id: "library", title: "Books: library", run: () => atlas.openView("", { title: "Books", icon: "file-text" }) });
  const covers = [];
  atlas.registerLibrary?.({
    // "E-books": the files read here; the catalog's Books is the book notes (two libraries named alike were two "Books" tabs)
    id: "books", title: "E-books", icon: "file-text", noun: "books",
    async load() {
      for (const u of covers.splice(0)) URL.revokeObjectURL(u);
      const S = atlas.plugin.settings ?? {};
      const top = String(S.folder || "books").replace(/^\/+|\/+$/g, "");
      const mine = (await booksIn(atlas, top, [], BOOK)).map((b) => ({ ...b, where: "Vault", dirs: folders(b.path, top) }));
      const theirs = (await Promise.all(remoteFolders(S).map(async (r) => (atlas.files?.list ? (await remoteBooks(atlas, r)).map((b) => ({ ...b, where: r.place, dirs: folders(b.path, r.folder) })) : [])))).flat();
      return [...mine, ...theirs].map((b) => ({
        id: b.source ? `${b.source}:${b.place}:${b.path}` : b.path, note: b.source ? undefined : b.path, title: b.name, sub: b.source ? b.path : b.path.split("/").slice(0, -1).join("/"),
        // a vault book's own cover and author, read from it when shown; a server's book is fetched only when opened
        // the picture its file source keeps — the core's EPUB cover or PDF first page (cached in .atlas/cache/thumbs),
        // copyparty's thumbnail — asked only when the card comes near the view; an older Atlas: read from the EPUB here
        cover: atlas.files?.thumb ? () => atlas.files.thumb(b.source ?? "vault", b.place ?? "", b.path).catch(() => null)
          : !b.source && /\.epub$/i.test(b.path) ? async () => {
            const f = await bookFacts(await atlas.fileUrl(b.path)).catch(() => null);
            if (f?.cover) covers.push(f.cover);
            return f?.cover ?? null;
          } : undefined,
        // the folders kept as they are on disk: the side lists each folder by its path, and every folder on the way is a tag
        groups: [[b.where, ...b.dirs].join(" › ")], tags: b.dirs, text: `${b.name} ${b.where} ${b.dirs.join(" ")}`, sort: { title: b.name }, book: b,
      }));
    },
    groupsTitle: "Folders", layouts: ["covers", "list"], sorts: [{ id: "title", label: "title" }],
    search: "Search the books…", empty: "No books yet: EPUB, PDF or DjVu files in the books folder, or a folder of your server in the plugin's settings.",
    detail: (item) => ({ kind: "Book", title: item.title, lines: [{ text: item.sub ?? "", muted: true }], actions: [{ label: "Read", icon: "file-text", primary: true, run: () => read(item) }] }),
    open: (item) => read(item),
  });
  /** A vault book opens in the reader (a PDF in the app's viewer); a server's, from its local copy (fetched through its
   *  file source). On the phone the app's own reader takes it (the pen, e-ink paging); the library stays the page's. */
  async function read(item) {
    const b = item.book;
    try {
      const path = b.source ? await atlas.files.local(b.source, b.place, b.path) : b.path;
      if (atlas.openNative?.(path)) return;
      if (/\.epub$/i.test(path)) atlas.openView(path, { title: item.title, icon: "file-text" });
      else if (/\.djvu$/i.test(path)) atlas.open((await atlas.helper.call("as_pdf", { path }, { timeout: 1800 })).path); // made once into a PDF (helper.py)
      else atlas.open(path); // a PDF: the app's own viewer
    } catch (e) { atlas.toast("Books", `${item.title}: ${e.message ?? e}`, "error"); }
  }
}
