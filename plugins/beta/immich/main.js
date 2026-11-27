// Immich's page side: the Libraries page's Photos (the newest photos and videos by month, people as filters; a photo
// opened in Atlas's image viewer, its file kept with the local copies of remote files), the command to search them by
// what is in them (Immich's smart search), Send to Immich for a vault picture, and the block `immich.recent`. The
// client is client.js; the logic without a page is im.js (im.test.mjs); the agent's tool is the helper's.
import { groupOrderOf, sendable, subOf, withAlbums } from "./im.js";
import { canSend, el, immich, openAsset, sendFile } from "./client.js";

export function register(atlas) {
  const itemOf = (im, r) => ({
    id: r.id, title: r.file, sub: subOf(r),
    cover: () => im.thumb(r.id).catch(() => null),
    groups: [...(r.albums ?? []), ...(r.month ? [r.month] : [])], tags: [...r.people, ...(r.video ? ["video"] : []), ...(r.favorite ? ["favourite"] : [])],
    flags: r.video ? [{ label: "video" }] : [],
    text: [r.file, r.place, r.people.join(" "), r.description, r.camera].join(" "),
    sort: { taken: r.taken, file: r.file }, row: r,
  });

  atlas.registerCommand({ id: "library", title: "Immich: photos", run: () => atlas.openLibrary?.("immich") });
  // the smart search: what is in the picture, in words; the palette asks Immich as typing pauses (API 35), a pick opens it
  atlas.registerCommand({
    id: "search", title: "Immich: search photos by what is in them…",
    run: async () => {
      const im = immich(atlas);
      if (!im.on) return atlas.toast?.("Immich", "Set the Immich address and API key in Settings → Plugins → Immich.");
      const found = new Map();
      const choices = async (q) => {
        const rows = String(q ?? "").trim().length < 3 ? [] : await im.smart(q).catch((e) => { atlas.toast?.("Immich", String(e?.message ?? e), "error"); return []; });
        for (const r of rows) found.set(r.id, r);
        return rows.map((r) => ({ value: r.id, title: r.file, detail: subOf(r) }));
      };
      const open = (id) => { const r = found.get(id); if (r) void openAsset(atlas, r); };
      if (Number(atlas.version ?? 0) >= 35) return atlas.pick({ placeholder: "Search Immich: a dog on the beach, the whiteboard…", tag: "Immich", items: [], search: choices, onpick: open });
      const q = await atlas.input?.("Search Immich", { hint: "what is in the picture: a dog on the beach, the whiteboard…" });
      if (!q) return;
      const items = await choices(q);
      if (!items.length) return atlas.toast?.("Immich", `Nothing found for “${q}”.`);
      atlas.pick({ placeholder: `${items.length} found for “${q}”`, tag: "Immich", items, onpick: open });
    },
  });
  // a vault picture or video sent to Immich: in the file and tab menus, and for the open file
  const row = (path) => (canSend(atlas) && sendable(path) ? [{ label: "Send to Immich", icon: "image", run: () => sendFile(atlas, path) }] : []);
  atlas.shell?.menu?.("file", (t) => (t.dir ? [] : row(t.path)));
  atlas.shell?.menu?.("tab", (t) => row(t.path));
  atlas.registerCommand({ id: "send", title: "Immich: send the open picture", run: () => {
    const path = atlas.context?.().active?.path;
    if (!sendable(path)) return atlas.toast?.("Immich", "Open a picture or a video first.");
    return sendFile(atlas, path);
  } });

  // the side: the albums, then the months newest first. Known only after a load, so one array filled in place: the host
  // copies the source's fields when it first shows it, and a copied array is still this one.
  const order = [];
  atlas.registerLibrary?.({
    id: "immich", title: "Photos", icon: "image", noun: "photos",
    async load() {
      const im = immich(atlas);
      if (!im.on) return [];
      const [recent, albums] = await Promise.all([im.recent(), im.albums().catch(() => ({ albums: [], assetsById: new Map() }))]);
      const rows = withAlbums(recent, albums.albums, albums.assetsById);
      order.splice(0, order.length, ...groupOrderOf(rows));
      return rows.map((r) => itemOf(im, r));
    },
    groupOrder: order,
    groupsTitle: "Albums and months", layouts: ["covers", "list"],
    sorts: [{ id: "taken", label: "taken", desc: true }, { id: "file", label: "file name" }],
    search: "Search the photos (file, place, people)…",
    empty: "No photos yet: your Immich address and API key in Settings → Plugins → Immich.",
    detail: (item) => ({
      kind: item.row.video ? "Video" : "Photo", title: item.title,
      lines: [{ text: item.sub ?? "" }, ...(item.row.description ? [{ text: item.row.description }] : []), ...(item.row.camera ? [{ text: item.row.camera, muted: true }] : [])],
      actions: [
        { label: item.row.video ? "Play in Immich" : "Open", icon: "image", primary: true, run: () => openAsset(atlas, item.row) },
        { label: "In Immich", run: () => atlas.openLink?.(immich(atlas).web(item.row.id), { outside: true }) },
      ],
    }),
    open: (item) => openAsset(atlas, item.row),
  });

  // the latest photos as a strip of thumbnails: ```view / type: immich.recent / count: 8
  atlas.registerBlock("immich.recent", (host, block) => {
    const im = immich(atlas);
    if (!im.on) { host.textContent = "Set the Immich server in Settings → Plugins → Immich."; return; }
    let gone = false;
    void (async () => {
      try {
        const items = (await im.call("/api/search/metadata", { method: "POST", body: { size: Number(block.options.count ?? 8), order: "desc", type: "IMAGE" } }))?.assets?.items ?? [];
        const strip = el("div", "display: flex; gap: 6px; overflow-x: auto; padding: 4px 0");
        for (const a of items) {
          const src = await im.thumb(a.id);
          if (gone) return;
          if (!src) continue;
          const img = el("img", "height: 110px; border-radius: var(--radius-sm); object-fit: cover; flex: none");
          img.alt = a.originalFileName ?? "";
          img.src = src;
          const link = el("a");
          link.href = im.web(a.id);
          link.target = "_blank";
          link.append(img);
          strip.append(link);
        }
        host.replaceChildren(items.length ? strip : el("p", "color: var(--text-faint)", "No photos."));
      } catch (e) {
        if (!gone) host.replaceChildren(el("p", "color: var(--red)", String(e.message ?? e)));
      }
    })();
    return () => { gone = true; };
  }, { title: "Immich photos", options: [{ key: "count", label: "How many", kind: "number" }] });
}
