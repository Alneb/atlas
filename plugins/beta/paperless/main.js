// Paperless-ngx's page side: the Libraries page's Documents (every document, with its tags, correspondent and type;
// opened in Atlas's PDF reader, its file kept with the local copies of remote files), a document's note made on asking
// (the catalog's `paperwork` kind: the note links the document, the document stays in Paperless), `@paperless:12` in a
// note, and the block `paperless.search`. The client is client.js; the logic without a page is pl.js (pl.test.mjs);
// the agent's tools are the helper's (helper/helper.ts).
import { sendable, subOf } from "./pl.js";
import { canSend, el, noteOf, openDoc, paperless, sendFile } from "./client.js";

export function register(atlas) {
  // a document named in a note: `@paperless:12` shows its title and its date
  atlas.registerEntities({
    prefix: "paperless",
    get: async (id) => {
      try { const r = await paperless(atlas).one(id); return { title: r.title, subtitle: subOf(r) }; }
      catch { return null; }
    },
    list: async () => (await paperless(atlas).call("/api/documents/?page_size=50&ordering=-added")).results?.map((d) => ({ id: String(d.id), title: d.title ?? `document ${d.id}` })) ?? [],
  });

  atlas.registerCommand({ id: "library", title: "Paperless: documents", run: () => atlas.openLibrary?.("paperless") });
  // a scan, a PDF, a picture of the vault sent to Paperless: in the file and tab menus, and for the open file
  const row = (path) => (canSend(atlas) && sendable(path) ? [{ label: "Send to Paperless", icon: "file-text", run: () => sendFile(atlas, path) }] : []);
  atlas.shell?.menu?.("file", (t) => (t.dir ? [] : row(t.path)));
  atlas.shell?.menu?.("tab", (t) => row(t.path));
  atlas.registerCommand({ id: "send", title: "Paperless: send the open file", run: () => {
    const path = atlas.context?.().active?.path;
    if (!sendable(path)) return atlas.toast?.("Paperless", "Open a PDF, a picture or a document first.");
    return sendFile(atlas, path);
  } });
  atlas.registerLibrary?.({
    id: "paperless", title: "Documents", icon: "file-text", noun: "documents",
    async load() {
      const p = paperless(atlas);
      if (!p.on) return [];
      return (await p.all()).map((r) => ({
        id: String(r.id), title: r.title, sub: subOf(r),
        cover: () => p.thumb(r.id).catch(() => null),
        groups: r.tags, tags: [r.type, r.correspondent].filter(Boolean),
        text: [r.title, r.correspondent, r.type, r.tags.join(" "), r.asn ?? "", r.content].join(" "),
        sort: { date: r.date, added: r.added, title: r.title }, row: r,
        lastUsed: r.added || undefined,
      }));
    },
    groupsTitle: "Tags", layouts: ["covers", "list"],
    sorts: [{ id: "date", label: "date", desc: true }, { id: "added", label: "added", desc: true }, { id: "title", label: "title" }],
    search: "Search the documents…",
    empty: "No documents yet: your Paperless address and API token in Settings → Plugins → Paperless.",
    detail: (item) => ({
      kind: item.row.type || "Document", title: item.title,
      lines: [{ text: item.sub ?? "" }, ...(item.row.asn != null ? [{ text: `Archive number ${item.row.asn}`, muted: true }] : []), ...(item.row.pages ? [{ text: `${item.row.pages} pages`, muted: true }] : [])],
      actions: [
        { label: "Open", icon: "file-text", primary: true, run: () => openDoc(atlas, item.row) },
        { label: "Its note", run: async () => { const p = await noteOf(atlas, item.row, paperless(atlas).base); if (p) atlas.open(p); } },
        { label: "In Paperless", run: () => atlas.openLink?.(paperless(atlas).details(item.row.id), { outside: true }) },
      ],
    }),
    open: (item) => openDoc(atlas, item.row),
  });

  // a block of the documents a search finds: ```view / type: paperless.search / query: invoice 2026
  atlas.registerBlock("paperless.search", (host, block) => {
    const p = paperless(atlas);
    const query = String(block.options.query ?? "").trim();
    if (!p.on) { host.textContent = "Set the Paperless server in Settings → Plugins → Paperless."; return; }
    host.replaceChildren(el("p", "color: var(--text-faint)", "Searching Paperless…"));
    let gone = false;
    void (async () => {
      try {
        const docs = (await p.call(`/api/documents/?page_size=${Number(block.options.limit ?? 10)}${query ? `&query=${encodeURIComponent(query)}` : ""}`)).results ?? [];
        if (gone) return;
        const list = el("ul", "list-style: none; margin: 0; padding: 4px 0");
        for (const d of docs) {
          const li = el("li", "display: flex; gap: 10px; padding: 2px 0");
          const a = el("a", "color: var(--text); flex: 1", d.title ?? `document ${d.id}`);
          a.href = p.details(d.id);
          a.target = "_blank";
          li.append(a, el("span", "color: var(--text-faint); font-variant-numeric: tabular-nums", String(d.created ?? d.created_date ?? "").slice(0, 10)));
          list.append(li);
        }
        host.replaceChildren(docs.length ? list : el("p", "color: var(--text-faint)", `No document matches “${query}”.`));
      } catch (e) {
        if (!gone) host.replaceChildren(el("p", "color: var(--red)", String(e.message ?? e)));
      }
    })();
    return () => { gone = true; };
  }, { title: "Paperless search", options: [{ key: "query", label: "Search for", kind: "text" }, { key: "limit", label: "At most", kind: "number" }] });
}
