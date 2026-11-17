// The player's Read along (docs/design/DESIGN-audiobooks.md, "Read along"): a book whose Audiobookshelf item carries
// its ebook (`media.ebookFile`) gets a button that opens that ebook beside the player — kept with the local copies of
// remote files (abs.js `ebook`), shown by the app's reader (the phone's own reader first, `atlas.open`). Its place is
// the server's (`ebookLocation`, `ebookProgress`) and the readers' (the ebook's note: reading_chapter / reading_page,
// progress, last_read); the newer side wins: the server's seeds the note when the ebook is opened, the note's goes to
// the server every 30 s and when the pane closes. Only properties are written into the note, never its text.
import { newerPlace, notePlace, serverPlace } from "./shelf.js";
import { el } from "./cards.js";

const EVERY_MS = 30_000;

/** The ebook's format ("epub", "pdf"…) and file name, from the expanded item; null when it carries none. */
export function ebookOf(item) {
  const f = item?.media?.ebookFile;
  if (!f) return null;
  const ext = String(f.metadata?.ext ?? "").replace(/^\./, "");
  const format = String(f.ebookFormat || item.media.ebookFormat || ext).toLowerCase();
  return { format, name: f.metadata?.filename || `ebook.${ext || format}` };
}

/** The row's button, added to `row` once the item is known to carry an ebook. `ctx`: { atlas, a, item }. Returns the
 *  pane's cleanup (the last place sent). */
export function readAlong(row, { atlas, a, item }) {
  let gone = false, timer = 0, sync = async () => {};
  void a.item(item).then((it) => {
    const book = ebookOf(it);
    if (!book || gone) return;
    const b = el("button", "atlas-btn", "Read along"), said = el("span", "abs-dim");
    b.title = `The book's ${book.format.toUpperCase()} beside the player, at the place Audiobookshelf keeps`;
    b.onclick = () => void open(book, b, said);
    row.append(b, said);
  }).catch(() => { /* no ebook offered */ });

  async function open(book, b, said) {
    b.disabled = true;
    said.textContent = "Fetching the ebook…";
    try {
      const path = await a.ebook(item, book.name);
      const note = await atlas.companion(path);
      const server = ((await a.me().catch(() => ({}))).mediaProgress ?? []).find((p) => p.libraryItemId === item && !p.episodeId) ?? null;
      let props = await atlas.noteProps(note).catch(() => ({}));
      // what the server is known to hold, so a sync sends only a newer place
      let known = server ? { ebookLocation: server.ebookLocation, ebookProgress: server.ebookProgress, lastUpdate: Number(server.lastUpdate) || 0 } : null;
      if (newerPlace(server, serverPlace(props, book.format)) === "server") {
        const seed = notePlace(server, book.format);
        if (seed) {
          for (const [k, v] of Object.entries(seed)) await atlas.writeProperty(note, k, v);
          if (known?.lastUpdate) await atlas.writeProperty(note, "last_read", new Date(known.lastUpdate).toISOString());
          props = { ...props, ...seed };
        }
      }
      // a PDF at its page (the phone's reader is handed `path#page=N`); an EPUB's reader starts from the note's chapter
      const page = book.format === "pdf" ? Number(props.reading_page) || undefined : undefined;
      atlas.open(path, page, { beside: true });
      said.textContent = "";
      sync = async () => {
        const place = serverPlace(await atlas.noteProps(note).catch(() => ({})), book.format);
        if (!place || newerPlace(known, place) !== "note") return;
        const { at, ...body } = place;
        await a.ebookPlace(item, body);
        known = { ...body, lastUpdate: at || Date.now() };
      };
      clearInterval(timer);
      timer = setInterval(() => void sync().catch(() => { /* tried again in 30 s */ }), EVERY_MS);
    } catch (e) { said.textContent = `Not opened: ${e.message ?? e}`; }
    finally { b.disabled = false; }
  }

  return () => {
    gone = true;
    clearInterval(timer);
    void sync().catch(() => { /* the next opening sends it */ });
  };
}
