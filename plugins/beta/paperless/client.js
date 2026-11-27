// Paperless-ngx's client for the page side (main.js): every document with its tags, correspondent and type named, its
// thumbnail, its PDF kept with the local copies of remote files and opened in Atlas's PDF reader, its note. The shapes
// are pl.js's; the token goes in as `Authorization: Token …`, put in by the core (the page never sees it).
import { MULTIPART_API, detailsUrl, downloadPath, fileName, listPath, namesOf, rowOf, thingOf, uploadRequest } from "./pl.js";

export const el = (tag, style, text) => { const e = document.createElement(tag); if (style) e.style.cssText = style; if (text !== undefined) e.textContent = text; return e; };

/** At most this many documents in the library (a page of 100 each): an archive past it is searched in Paperless's
 *  own search (the library's search box asks it). */
const MAX_PAGES = 50;

export function paperless(atlas) {
  const S = atlas.plugin.settings ?? {};
  const base = String(S.server ?? "").trim().replace(/\/+$/, "");
  const auth = { Authorization: { secret: "token", prefix: "Token " } };
  async function call(path, init = {}) {
    if (!base) throw new Error("no Paperless address yet (Settings → Plugins → Paperless)");
    const r = await atlas.fetch(base + path, { ...init, headers: { ...auth, Accept: "application/json", ...(init.headers ?? {}) } });
    if (r.signin) throw new Error(`sign in to ${new URL(base).host} first (Atlas offered it)`);
    if (!r.ok) throw new Error(`Paperless answered ${r.status}${r.status === 401 || r.status === 403 ? ": check the API token (Paperless → your profile → API auth token)" : ""}`);
    return r.json();
  }
  /** Tags, correspondents and document types by number, asked once per load. */
  const names = async () => {
    const [tags, correspondents, types] = await Promise.all(["tags", "correspondents", "document_types"].map((l) => call(`/api/${l}/?page_size=1000`).catch(() => ({}))));
    return { tags: namesOf(tags), correspondents: namesOf(correspondents), types: namesOf(types) };
  };
  return {
    base, on: !!base, call, names,
    /** Every document (newest first, up to MAX_PAGES pages), or those Paperless's full-text search finds for `query`. */
    async all(query = "") {
      const n = await names();
      const out = [];
      for (let page = 1; page <= MAX_PAGES; page++) {
        const r = await call(listPath(page, query));
        out.push(...(r.results ?? []).map((d) => rowOf(d, n)));
        if (!r.next) break;
      }
      return out;
    },
    /** One document with its whole text. */
    async one(id) {
      const [d, n] = await Promise.all([call(`/api/documents/${encodeURIComponent(id)}/`), names()]);
      return rowOf(d, n);
    },
    /** Its thumbnail, kept in the plugin's cache: an address the page can show (null when it has none). */
    async thumb(id) {
      const r = await atlas.fetch(`${base}/api/documents/${encodeURIComponent(id)}/thumb/`, { headers: auth, saveTo: `thumbs/${id}` });
      return r.ok && r.saved ? atlas.fileUrl(r.saved) : null;
    },
    /** The document's file, kept with the local copies of remote files (`.atlas/remote/paperless/documents/<id>/…`,
     *  which the explorer and the readers open): its vault path. Fetched again only when it is not kept yet. */
    async file(r) {
      const name = fileName(r);
      const kept = `.atlas/remote/${atlas.plugin.id}/documents/${r.id}/${name}`;
      if (await atlas.exists?.(kept).catch(() => false)) return kept;
      const got = await atlas.fetch(base + downloadPath(r), { headers: auth, saveTo: `documents/${r.id}/${name}`, saveIn: "remote", timeout: 120 });
      if (got.signin) throw new Error(`sign in to ${new URL(base).host} first (Atlas offered it)`);
      if (!got.ok || !got.saved) throw new Error(`Paperless answered ${got.status} for the file`);
      return got.saved;
    },
    details: (id) => detailsUrl(base, id),
    /** A vault file sent to Paperless's upload; the answer is its consumption task's id. */
    async send(path) {
      const { path: at, init } = uploadRequest(path);
      return call(at, { ...init, timeout: 120 });
    },
  };
}

/** Whether this Atlas sends a file form (plugin API 37); an older one would drop it and post nothing. */
export const canSend = (atlas) => Number(atlas.version ?? 0) >= MULTIPART_API;

/** Sends a vault file to Paperless, saying what happened: Paperless reads it in the background (OCR, matching), so the
 *  document shows in the library a little later. */
export async function sendFile(atlas, path) {
  const name = path.split("/").pop();
  if (!canSend(atlas)) return atlas.toast?.("Not sent", "Sending a file needs a newer Atlas (plugin API 37).", "error");
  try {
    const task = await paperless(atlas).send(path);
    atlas.toast?.(`Sent ${name} to Paperless`, `Paperless is reading it${typeof task === "string" ? ` (task ${task.slice(0, 8)})` : ""}; it appears in Documents once done.`);
  } catch (e) {
    atlas.toast?.(`${name} not sent`, String(e?.message ?? e), "error");
  }
}

/** The document's note, by the catalog's one rule (its `note` tool, the `paperwork` kind this plugin adds): found by
 *  its Paperless id wherever it is, made when asked. Its path, or null (no catalog in this vault: said once). */
export async function noteOf(atlas, row, base) {
  const r = await atlas.post?.("/api/plugins/@catalog/tools/note", thingOf(row, base, "asked")).catch((e) => {
    atlas.toast?.("No note", /role|catalog/i.test(String(e?.message ?? e)) ? "A document's note is the Catalog's: switch the Catalog plugin on." : String(e?.message ?? e), "error");
    return null;
  });
  return r?.path ?? null;
}

/** Opens the document's file in Atlas (the PDF reader for a PDF), fetched first when it is not kept. */
export async function openDoc(atlas, row) {
  try {
    atlas.open(await paperless(atlas).file(row));
  } catch (e) {
    atlas.toast?.("Not opened", String(e?.message ?? e), "error");
  }
}
