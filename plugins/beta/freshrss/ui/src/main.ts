// FreshRSS's page side: the reader pane (the command "FreshRSS: read", view.js) and the block of unread articles:
//   ```view
//   type: freshrss.unread
//   limit: 15
//   ```
// The reading, marking and saving are the helper's (helper/helper.ts: also the freshrss_unread / freshrss_read /
// freshrss_save tools, the phone); the block only draws the list. "Save" makes a note of the article in the folder of
// the settings and opens it.
import type { PluginApi } from "../../../../../ui/src/lib/plugin-api";

type Item = { id: string; title: string; url: string | null; feed: string };
const el = (tag: string, style?: string, text?: string) => { const e = document.createElement(tag); if (style) e.style.cssText = style; if (text !== undefined) e.textContent = text; return e; };

export function register(atlas: PluginApi) {
  atlas.registerCommand({ id: "read", title: "FreshRSS: read", run: () => atlas.openView("reader", { title: "FreshRSS", icon: "globe" }) });

  async function save(item: Item) {
    try {
      const r = (await atlas.helper.call("save", { id: item.id })) as { path: string; made: boolean };
      if (!r.made) atlas.toast("FreshRSS", `${r.path} is already there`);
      atlas.open(r.path);
    } catch (e) { atlas.toast("FreshRSS: not saved", String((e as Error)?.message ?? e), "error"); }
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
        const items = (await atlas.helper.call("unread", { limit: Number(block.options.limit ?? 15) })) as Item[];
        if (gone) return;
        const list = el("ul", "list-style: none; margin: 0; padding: 4px 0");
        for (const it of items) {
          const li = el("li", "display: flex; gap: 8px; align-items: baseline; padding: 2px 0");
          const a = el("a", "color: var(--text); flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap", it.title) as HTMLAnchorElement;
          a.href = it.url ?? "#";
          a.target = "_blank";
          const feed = el("span", "color: var(--text-faint); flex: none; font-size: .85em", it.feed);
          const keep = el("button", "color: var(--accent); flex: none", "Save");
          keep.title = "Make a note of this article";
          keep.onclick = () => void save(it);
          li.append(a, feed, keep);
          list.append(li);
        }
        const open = el("button", "color: var(--accent); margin-top: 4px", "Open the reader");
        open.onclick = () => atlas.openView("reader", { title: "FreshRSS", icon: "globe" });
        host.replaceChildren(items.length ? list : el("p", "color: var(--text-faint)", "Nothing unread."), open);
      } catch (e) {
        if (!gone) host.replaceChildren(el("p", "color: var(--red)", String((e as Error)?.message ?? e)));
      }
    })();
    return () => { gone = true; };
  }, { title: "FreshRSS unread", options: [{ key: "limit", label: "At most", kind: "number" }] });
}
