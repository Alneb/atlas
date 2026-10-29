// FreshRSS — the unread articles (docs/guides/PLUGIN-API.md):
//   ```view
//   type: freshrss.unread
//   limit: 15
//   ```
// Through FreshRSS's Fever API (`/api/fever.php?api&items`). Fever wants its key as a form field, not a header:
// `atlas.fetch`'s `form` lets the core fill that field in (`{ secret: "api_key" }`), so the key never reaches the page.
// "Save" makes a note of the article in the folder of the settings.
const el = (tag, style, text) => { const e = document.createElement(tag); if (style) e.style.cssText = style; if (text !== undefined) e.textContent = text; return e; };
const fileName = (t) => String(t).replace(/[\\/:*?"<>|#^[\]]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80) || "Article";

export function register(atlas) {
  const fever = async (query) => {
    const s = atlas.plugin.settings, base = String(s.server ?? "").trim().replace(/\/+$/, "");
    const res = await atlas.fetch(`${base}/api/fever.php?api&${query}`, { method: "POST", form: { api_key: { secret: "api_key" } } });
    if (!res.ok) throw new Error(`FreshRSS answered ${res.status}`);
    const j = await res.json();
    if (j.auth === 0) throw new Error("FreshRSS did not accept the API key");
    return j;
  };
  async function save(item) {
    const s = atlas.plugin.settings, day = new Date().toISOString().slice(0, 10);
    const path = `${String(s.folder).replace(/\/+$/, "")}/${fileName(item.title)}.md`;
    const text = `---\ntype: article\nsource: ${JSON.stringify(item.url ?? "")}\nsaved: ${day}\n---\n# ${item.title}\n\n${new DOMParser().parseFromString(item.html ?? "", "text/html").body.textContent?.trim() ?? ""}\n`;
    if (!(await atlas.createFile(path, text))) atlas.toast("FreshRSS", `${path} is already there`);
    atlas.open(path);
  }
  atlas.registerBlock("freshrss.unread", (host, block) => {
    let gone = false;
    if (!String(atlas.plugin.settings.server ?? "").trim()) {
      host.replaceChildren(el("p", "color: var(--text-faint)", "Set the FreshRSS server in Settings → Plugins → FreshRSS."));
      return () => {};
    }
    host.replaceChildren(el("p", "color: var(--text-faint)", "Reading FreshRSS…"));
    void (async () => {
      try {
        const unread = String((await fever("unread_item_ids")).unread_item_ids ?? "").split(",").filter(Boolean).slice(0, Number(block.options.limit ?? 15));
        const items = unread.length ? ((await fever(`items&with_ids=${unread.join(",")}`)).items ?? []) : [];
        if (gone) return;
        const list = el("ul", "list-style: none; margin: 0; padding: 4px 0");
        for (const it of items) {
          const li = el("li", "display: flex; gap: 8px; align-items: baseline; padding: 2px 0");
          const a = el("a", "color: var(--text); flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap", it.title);
          a.href = it.url ?? "#";
          a.target = "_blank";
          const keep = el("button", "color: var(--accent); flex: none", "Save");
          keep.title = "Make a note of this article";
          keep.onclick = () => void save(it);
          li.append(a, keep);
          list.append(li);
        }
        host.replaceChildren(items.length ? list : el("p", "color: var(--text-faint)", "Nothing unread."));
      } catch (e) {
        if (!gone) host.replaceChildren(el("p", "color: var(--red)", String(e.message ?? e)));
      }
    })();
    return () => { gone = true; };
  }, { title: "FreshRSS unread", options: [{ key: "limit", label: "At most", kind: "number" }] });
}
