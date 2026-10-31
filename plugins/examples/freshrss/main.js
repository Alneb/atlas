// FreshRSS — the unread articles (docs/guides/PLUGIN-API.md):
//   ```view
//   type: freshrss.unread
//   limit: 15
//   ```
// The reading and saving are the helper's (helper.js: `unread`, `save`, also the freshrss_unread / freshrss_save
// tools); the block only draws the list. "Save" makes a note of the article in the folder of the settings and opens it.
const el = (tag, style, text) => { const e = document.createElement(tag); if (style) e.style.cssText = style; if (text !== undefined) e.textContent = text; return e; };

export function register(atlas) {
  async function save(item) {
    try {
      const r = await atlas.helper.call("save", { id: item.id });
      if (!r.made) atlas.toast("FreshRSS", `${r.path} is already there`);
      atlas.open(r.path);
    } catch (e) { atlas.toast("FreshRSS: not saved", String(e.message ?? e), "error"); }
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
        const items = await atlas.helper.call("unread", { limit: Number(block.options.limit ?? 15) });
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
