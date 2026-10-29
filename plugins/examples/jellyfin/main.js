// Jellyfin — the last things watched (docs/guides/PLUGIN-API.md):
//   ```view
//   type: jellyfin.watched
//   limit: 10
//   ```
// One GET of the user's played items, newest first; the key goes in as `X-Emby-Token`, put in by
// Atlas's core. Written from Jellyfin's 10.x API; check it against your server's version.
const el = (tag, style, text) => { const e = document.createElement(tag); if (style) e.style.cssText = style; if (text !== undefined) e.textContent = text; return e; };

export function register(atlas) {
  atlas.registerBlock("jellyfin.watched", (host, block) => {
    const s = atlas.plugin.settings, base = String(s.server ?? "").trim().replace(/\/+$/, ""), user = String(s.user ?? "").trim();
    if (!base || !user) { host.textContent = "Set the Jellyfin server and user in Settings → Plugins → Jellyfin."; return; }
    let gone = false;
    void (async () => {
      try {
        const q = `Filters=IsPlayed&SortBy=DatePlayed&SortOrder=Descending&Recursive=true&IncludeItemTypes=Movie,Episode&Fields=UserData&Limit=${Number(block.options.limit ?? 10)}`;
        const res = await atlas.fetch(`${base}/Users/${encodeURIComponent(user)}/Items?${q}`, { headers: { "X-Emby-Token": { secret: "token" } } });
        if (!res.ok) throw new Error(`Jellyfin answered ${res.status}`);
        const items = (await res.json()).Items ?? [];
        if (gone) return;
        const list = el("ul", "list-style: none; margin: 0; padding: 4px 0");
        for (const it of items) {
          const name = it.Type === "Episode" ? `${it.SeriesName ?? ""} — ${it.Name}` : it.Name;
          const li = el("li", "display: flex; gap: 10px; padding: 2px 0");
          li.append(el("span", "flex: 1; color: var(--text)", name), el("span", "color: var(--text-faint); font-variant-numeric: tabular-nums", String(it.UserData?.LastPlayedDate ?? "").slice(0, 10)));
          list.append(li);
        }
        host.replaceChildren(items.length ? list : el("p", "color: var(--text-faint)", "Nothing watched yet."));
      } catch (e) {
        if (!gone) host.replaceChildren(el("p", "color: var(--red)", String(e.message ?? e)));
      }
    })();
    return () => { gone = true; };
  }, { title: "Jellyfin: watched", options: [{ key: "limit", label: "At most", kind: "number" }] });
}
