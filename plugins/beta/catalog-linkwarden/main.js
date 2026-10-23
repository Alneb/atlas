// Catalog · Linkwarden, in the page: your Linkwarden links to browse and search (a block, and the side panel's "Links").
// Saving each catalogued link there is the helper's (helper.py). Moved from the Clip plugin, which the catalog replaced
//.

/** Linkwarden's links: a search (`q`), or the newest. Newer servers answer /api/v1/search, older
 *  ones /api/v1/links — both are tried, and both answer shapes read. */
async function links(atlas, q) {
  const base = String(atlas.plugin.settings.address ?? "").trim().replace(/\/+$/, "");
  if (!base) throw new Error("Set the Linkwarden address in this plugin's settings.");
  const headers = { Authorization: { secret: "token", prefix: "Bearer " } };
  const query = `searchQueryString=${encodeURIComponent(q ?? "")}&sort=0`;
  for (const path of [`/api/v1/search?${query}`, `/api/v1/links?${query}`]) {
    const res = await atlas.fetch(`${base}${path}`, { headers });
    if (res.status === 404) continue;
    if (!res.ok) throw new Error(`Linkwarden answered ${res.status}`);
    const j = await res.json();
    return { base, items: j?.data?.links ?? j?.response ?? [] };
  }
  throw new Error("Linkwarden has neither /api/v1/search nor /api/v1/links");
}

// an empty state or an error in Atlas's shared look (ui base.css .atlas-notice / .atlas-btn): the reason and the way out
const notice = (text, { error = false, actions = [] } = {}) => {
  const box = document.createElement("div");
  box.className = `atlas-notice${error ? " error" : ""}`;
  box.append(Object.assign(document.createElement("span"), { textContent: String(text).replace(/^POST \S+: \d+ [^:]*: plugin [\w-]+: (\w+: )?/, "").replace(/^(Runtime|Value)Error: /, "") }));
  if (actions.length) {
    const row = Object.assign(document.createElement("div"), { className: "actions" });
    for (const [label, run, primary] of actions) row.append(Object.assign(document.createElement("button"), { className: `atlas-btn${primary ? " primary" : ""}`, textContent: label, onclick: (e) => { e.stopPropagation(); void run(); } }));
    box.append(row);
  }
  return box;
};
const quiet = (text) => Object.assign(document.createElement("div"), { className: "atlas-empty", textContent: text });
const el = (tag, style, text) => { const e = document.createElement(tag); if (style) e.style.cssText = style; if (text !== undefined) e.textContent = text; return e; };

export function register(atlas) {
  // ```view type: linkwarden.links (query: …) — also the side panel's "Links"; a search box over it
  atlas.registerBlock("linkwarden.links", (host, block) => {
    let gone = false, timer;
    const box = el("input", "width: 100%; box-sizing: border-box; margin-bottom: 4px; padding: 3px 6px; background: var(--bg); color: var(--text); border: 1px solid var(--border); border-radius: var(--radius-sm)");
    box.placeholder = "Search Linkwarden…";
    box.value = String(block.options.query ?? "");
    const list = el("div");
    host.replaceChildren(box, list);
    const draw = async () => {
      list.replaceChildren(el("p", "color: var(--text-faint)", "Asking Linkwarden…"));
      try {
        const { base, items } = await links(atlas, box.value.trim());
        if (gone) return;
        if (!items.length) return list.replaceChildren(quiet("No links."));
        const ul = el("ul", "list-style: none; margin: 0; padding: 0");
        for (const l of items.slice(0, Number(block.options.limit ?? 30))) {
          const li = el("li", "display: flex; gap: 8px; align-items: baseline; padding: 2px 0");
          const a = el("a", "color: var(--text); flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap", l.name || l.url);
          a.href = l.url; a.target = "_blank"; a.title = `${l.url}${l.collection?.name ? ` · ${l.collection.name}` : ""}${(l.tags ?? []).length ? ` · ${l.tags.map((t) => t.name).join(", ")}` : ""}`;
          const keep = el("button", "color: var(--accent); flex: none", "Note");
          keep.title = "Into the catalog as a note (captured: the catalog files it in its library)";
          keep.onclick = () => void atlas.capture(l.url).then(() => atlas.toast("Sent to the catalog", l.url, "success"), (e) => atlas.toast("Not sent", String(e.message ?? e), "error"));
          const open = el("a", "color: var(--text-faint); flex: none", "↗");
          open.href = `${base}/links/${l.id}`; open.target = "_blank"; open.title = "Open in Linkwarden";
          li.append(a, keep, open);
          ul.append(li);
        }
        list.replaceChildren(ul);
      } catch (e) {
        if (gone) return;
        const why = String(e.message ?? e), unset = /Set the Linkwarden address/.test(why);
        list.replaceChildren(notice(unset ? "Linkwarden is not set up yet: its address and a token go in this plugin's settings." : why, { error: !unset, actions: [[unset ? "Set it up…" : "Settings…", () => atlas.plugin.openSettings(), unset]] }));
      }
    };
    box.oninput = () => { clearTimeout(timer); timer = setTimeout(() => void draw(), 300); };
    void draw();
    return () => { gone = true; clearTimeout(timer); };
  }, { title: "Linkwarden links", options: [{ key: "query", label: "Search", kind: "text" }, { key: "limit", label: "At most", kind: "number" }] });
  atlas.shell.sideTool({ id: "links", title: "Links", icon: "link", mount: (host) => atlas.mountBlock(host, { type: "linkwarden.links" }) });

}
