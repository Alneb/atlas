// Immich — the latest photos as a strip of thumbnails (docs/guides/PLUGIN-API.md):
//   ```view
//   type: immich.recent
//   count: 8
//   ```
// The list is one search (`POST /api/search/metadata`, newest first) and each thumbnail is fetched
// by Atlas's core into this plugin's cache (`saveTo`), then shown from there — the key never reaches
// the page. Written from Immich's v1 API; check it against your server's version.
const el = (tag, style) => { const e = document.createElement(tag); if (style) e.style.cssText = style; return e; };

export function register(atlas) {
  atlas.registerBlock("immich.recent", (host, block) => {
    const base = String(atlas.plugin.settings.server ?? "").trim().replace(/\/+$/, "");
    if (!base) { host.textContent = "Set the Immich server in Settings → Plugins → Immich."; return; }
    const auth = { "x-api-key": { secret: "key" } };
    let gone = false;
    void (async () => {
      try {
        const res = await atlas.fetch(`${base}/api/search/metadata`, { method: "POST", headers: auth, body: { size: Number(block.options.count ?? 8), order: "desc", type: "IMAGE" } });
        if (!res.ok) throw new Error(`Immich answered ${res.status}`);
        const items = (await res.json())?.assets?.items ?? [];
        const strip = el("div", "display: flex; gap: 6px; overflow-x: auto; padding: 4px 0");
        for (const a of items) {
          const shot = await atlas.fetch(`${base}/api/assets/${encodeURIComponent(a.id)}/thumbnail`, { headers: auth, saveTo: `thumbs/${a.id}.jpg` });
          if (gone) return;
          const img = el("img", "height: 110px; border-radius: var(--radius-sm); object-fit: cover; flex: none");
          img.alt = a.originalFileName ?? "";
          img.src = await atlas.fileUrl(shot.saved);
          const link = el("a");
          link.href = `${base}/photos/${a.id}`;
          link.target = "_blank";
          link.append(img);
          strip.append(link);
        }
        host.replaceChildren(items.length ? strip : Object.assign(el("p", "color: var(--text-faint)"), { textContent: "No photos." }));
      } catch (e) {
        if (!gone) host.replaceChildren(Object.assign(el("p", "color: var(--red)"), { textContent: String(e.message ?? e) }));
      }
    })();
    return () => { gone = true; };
  }, { title: "Immich photos", options: [{ key: "count", label: "How many", kind: "number" }] });
}
