// Immich's client for the page side (main.js): the newest photos and videos, a smart search, thumbnails kept in the
// plugin's cache, a photo kept with the local copies of remote files and opened in Atlas's image viewer, a vault
// picture sent to Immich. The shapes are im.js's; the key goes in as `x-api-key`, put in by the core (never the page).
import { MAX_PAGES, MULTIPART_API, itemsOf, listBody, rowOf, smartBody, uploadRequest, viewOf, webUrl } from "./im.js";

export const el = (tag, style, text) => { const e = document.createElement(tag); if (style) e.style.cssText = style; if (text !== undefined) e.textContent = text; return e; };

export function immich(atlas) {
  const S = atlas.plugin.settings ?? {};
  const base = String(S.server ?? "").trim().replace(/\/+$/, "");
  const auth = { "x-api-key": { secret: "key" } };
  async function call(path, init = {}) {
    if (!base) throw new Error("no Immich address yet (Settings → Plugins → Immich)");
    const r = await atlas.fetch(base + path, { ...init, headers: { ...auth, Accept: "application/json", ...(init.headers ?? {}) } });
    if (r.signin) throw new Error(`sign in to ${new URL(base).host} first (Atlas offered it)`);
    if (!r.ok) throw new Error(`Immich answered ${r.status}${r.status === 401 ? ": check the API key (Immich → Account settings → API keys)" : ""}`);
    return r.json();
  }
  return {
    base, on: !!base, call,
    /** The newest photos and videos, up to MAX_PAGES pages. */
    async recent() {
      const out = [];
      for (let page = 1; page <= MAX_PAGES; page++) {
        const { items, more } = itemsOf(await call("/api/search/metadata", { method: "POST", body: listBody(page) }));
        out.push(...items.map(rowOf));
        if (!more) break;
      }
      return out;
    },
    /** Immich's smart search (what is in the picture, in words). */
    smart: async (query, size) => itemsOf(await call("/api/search/smart", { method: "POST", body: smartBody(query, size) })).items.map(rowOf),
    /** The thumbnail, kept in the plugin's cache: an address the page can show (null when it has none). */
    async thumb(id) {
      const r = await atlas.fetch(`${base}/api/assets/${encodeURIComponent(id)}/thumbnail`, { headers: auth, saveTo: `thumbs/${id}.jpg` });
      return r.ok && r.saved ? atlas.fileUrl(r.saved) : null;
    },
    /** The photo as Atlas can show it, kept with the local copies of remote files (`.atlas/remote/immich/photos/<id>/…`):
     *  its vault path, fetched once. */
    async file(r) {
      const v = viewOf(r);
      const kept = `.atlas/remote/${atlas.plugin.id}/photos/${r.id}/${v.name}`;
      if (await atlas.exists?.(kept).catch(() => false)) return kept;
      const got = await atlas.fetch(base + v.path, { headers: auth, saveTo: `photos/${r.id}/${v.name}`, saveIn: "remote", timeout: 120 });
      if (got.signin) throw new Error(`sign in to ${new URL(base).host} first (Atlas offered it)`);
      if (!got.ok || !got.saved) throw new Error(`Immich answered ${got.status} for the photo`);
      return got.saved;
    },
    web: (id) => webUrl(base, id),
    /** A vault file sent to Immich's upload: `{ id, status }` (`duplicate` when Immich has it already). */
    async send(path) {
      const { path: at, init } = uploadRequest(path, S.device);
      return call(at, { ...init, timeout: 300 });
    },
  };
}

/** Whether this Atlas sends a file form (plugin API 37); an older one would drop it and post nothing. */
export const canSend = (atlas) => Number(atlas.version ?? 0) >= MULTIPART_API;

/** Opens a photo in Atlas's image viewer; a video in Immich, which plays it. */
export async function openAsset(atlas, row) {
  const im = immich(atlas);
  if (row.video) return atlas.openLink?.(im.web(row.id), { outside: true });
  try {
    atlas.open(await im.file(row));
  } catch (e) {
    atlas.toast?.("Not opened", String(e?.message ?? e), "error");
  }
}

/** Sends a vault picture or video to Immich, saying what happened. */
export async function sendFile(atlas, path) {
  const name = path.split("/").pop();
  if (!canSend(atlas)) return atlas.toast?.("Not sent", "Sending a file needs a newer Atlas (plugin API 37).", "error");
  try {
    const r = await immich(atlas).send(path);
    atlas.toast?.(r?.status === "duplicate" ? `${name} is in Immich already` : `Sent ${name} to Immich`, r?.status === "duplicate" ? "Immich recognised it: nothing was added." : "It shows in Photos once Immich has read it.");
  } catch (e) {
    atlas.toast?.(`${name} not sent`, String(e?.message ?? e), "error");
  }
}
