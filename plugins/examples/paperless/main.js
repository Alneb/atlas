// Paperless — a block that lists the documents matching a search (docs/guides/PLUGIN-API.md):
//   ```view
//   type: paperless.search
//   query: invoice 2026
//   ```
// One GET to Paperless-ngx's REST API (`/api/documents/?query=…`); the token goes in as
// `Authorization: Token …`, put in by Atlas's core. Check the API against your server's version.
const el = (tag, style, text) => { const e = document.createElement(tag); if (style) e.style.cssText = style; if (text !== undefined) e.textContent = text; return e; };

export function register(atlas) {
  const base = () => String(atlas.plugin.settings.server ?? "").trim().replace(/\/+$/, "");
  const get = async (path) => {
    const res = await atlas.fetch(`${base()}${path}`, { headers: { Authorization: { secret: "token", prefix: "Token " }, Accept: "application/json" } });
    if (!res.ok) throw new Error(`Paperless answered ${res.status}`);
    return res.json();
  };
  // a document named in a note: `@paperless:12` shows its title, its date, and opens it in Paperless
  atlas.registerEntities({
    prefix: "paperless",
    get: async (id) => {
      try { const d = await get(`/api/documents/${encodeURIComponent(id)}/`); return { title: d.title ?? `document ${id}`, subtitle: String(d.created_date ?? d.created ?? "").slice(0, 10) }; }
      catch { return null; }
    },
    list: async () => ((await get("/api/documents/?page_size=50&ordering=-added")).results ?? []).map((d) => ({ id: String(d.id), title: d.title ?? `document ${d.id}` })),
  });
  atlas.registerBlock("paperless.search", (host, block) => {
    const s = atlas.plugin.settings, base = String(s.server ?? "").trim().replace(/\/+$/, "");
    const query = String(block.options.query ?? "").trim();
    if (!base) { host.textContent = "Set the Paperless server in Settings → Plugins → Paperless."; return; }
    host.replaceChildren(el("p", "color: var(--text-faint)", "Searching Paperless…"));
    let gone = false;
    void (async () => {
      try {
        const res = await atlas.fetch(`${base}/api/documents/?page_size=${Number(block.options.limit ?? 10)}${query ? `&query=${encodeURIComponent(query)}` : ""}`, {
          headers: { Authorization: { secret: "token", prefix: "Token " }, Accept: "application/json" },
        });
        if (!res.ok) throw new Error(`Paperless answered ${res.status}`);
        const docs = (await res.json()).results ?? [];
        if (gone) return;
        const list = el("ul", "list-style: none; margin: 0; padding: 4px 0");
        for (const d of docs) {
          const li = el("li", "display: flex; gap: 10px; padding: 2px 0");
          const a = el("a", "color: var(--text); flex: 1", d.title ?? `document ${d.id}`);
          a.href = `${base}/documents/${d.id}/details`;
          a.target = "_blank";
          li.append(a, el("span", "color: var(--text-faint); font-variant-numeric: tabular-nums", String(d.created_date ?? d.created ?? "").slice(0, 10)));
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
