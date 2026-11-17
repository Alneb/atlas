// A library of the vault's own list (`[ui] libraries`: a folder or a Base with a kind, libraries.rs) as a source of the
// Libraries page: the core decides what is in it, its order and its Continue row (`GET /api/library`); this only turns
// its items into the page's. The same answer feeds the phone's native Library (LibraryScreen.java).
import { api } from "./api";
import { on, touches } from "./bus";
import { openPath } from "./dock";
import { thumbUrl } from "./raw";
import type { LibraryInfo } from "./gen/LibraryInfo";
import type { LibraryKind } from "./gen/LibraryKind";
import type { LibraryThing } from "./gen/LibraryThing";
import type { LibraryItem, LibrarySource } from "./plugin-api";

/** What a library of each kind is about: the subject the page makes one library of (a plugin's library of the same
 *  subject — the Books plugin's e-books, Manga's comics — joins it; their server's items in "From <service>"). */
export const SUBJECT: Record<LibraryKind, string | null> = {
  any: null, notes: null, books: "books", comics: "comics", audio: "audiobooks", video: "films-and-series",
  pictures: "pictures", papers: "references", drawings: "drawings",
};

const NOUN: Record<LibraryKind, string> = {
  any: "files", notes: "notes", books: "books", comics: "series", audio: "albums", video: "films",
  pictures: "pictures", papers: "papers", drawings: "drawings",
};

/** An item's picture: an address as it is; a vault file through the core's thumbnails (an EPUB's cover, a PDF's or
 *  a CBZ's first page, a picture made small), asked only when its card comes near the view. */
const coverOf = (c: string | null): LibraryItem["cover"] =>
  !c ? undefined : /^https?:/.test(c) ? c : () => thumbUrl(c, 320).catch(() => null);

function item(t: LibraryThing): LibraryItem {
  const last = t.last_read ?? undefined;
  return {
    id: t.path, title: t.title, sub: t.sub || undefined, note: t.path, cover: coverOf(t.cover),
    progress: t.progress ?? undefined, lastUsed: last, groups: t.group ? [t.group.split("/").join(" › ")] : undefined,
    text: `${t.title} ${t.sub} ${t.path}`, sort: { title: t.title, last_read: last ?? 0, modified: t.modified },
  };
}

/** The page's sort orders with the library's own first (`-last_read`: newest first). */
function sorts(sort: string): LibrarySource["sorts"] {
  const all = [{ id: "title", label: "title" }, { id: "last_read", label: "last read", desc: true }, { id: "modified", label: "changed", desc: true }];
  const want = sort.replace(/^-/, "") || "title";
  const first = all.find((s) => s.id === want);
  return first ? [first, ...all.filter((s) => s !== first)] : all;
}

/** The page's source for one of the vault's libraries. */
export function folderSource(lib: LibraryInfo): LibrarySource {
  const noun = NOUN[lib.kind];
  const where = lib.folder || lib.base;
  return {
    id: lib.id, title: lib.title, icon: lib.icon, noun,
    async load() { return (await api.library(lib.id)).items.map(item); },
    layouts: lib.layout === "list" ? ["list", "covers"] : ["covers", "list"],
    sorts: sorts(lib.sort),
    groupsTitle: "Folders",
    search: `Search the ${noun}…`,
    empty: lib.source === "base" ? `No note matches ${where}.` : `No ${noun} in ${where || "the vault"} yet: put them in that folder.`,
    detail: (i) => ({
      kind: lib.title, title: i.title, lines: [{ text: i.sub ?? "" }, { text: i.id, muted: true }],
      actions: [{ label: "Open", icon: "external-link", primary: true, run: () => openPath(i.id) }],
    }),
    open: (i) => openPath(i.id),
    watch: (reload) => on("fs", (e) => { if (touches(e.paths, (p) => !where || p.startsWith(`${where}/`) || p.endsWith(".md"))) reload(); }),
  };
}
