// Immich's API as this plugin uses it, without a page or a helper around it: its assets turned into what Atlas shows
// (the library's rows, what an agent reads) and the requests it makes (im.test.mjs runs these on cut-down copies of its
// answers). Written from Immich's v1.1xx–v2 API: POST /api/search/metadata and /api/search/smart (paged, `withPeople`,
// `withExif`), an asset's /thumbnail and /original, POST /api/assets (the upload, a file form). The key goes in as
// `x-api-key`, put in by the core.

/** How many assets one page of a search asks for, and how many pages the library reads: the newest 2 000 photos and
 *  videos; older ones are found by the smart search (the library's command, the agent's tool). */
export const PAGE = 250;
export const MAX_PAGES = 8;

/** The body of one page of the library's listing: newest first, with places and people. */
export const listBody = (page = 1) => ({ page, size: PAGE, order: "desc", withExif: true, withPeople: true });

/** The body of a smart search (Immich's CLIP search: "a dog on the beach", "whiteboard with equations"). */
export const smartBody = (query, size = 50) => ({ query: String(query ?? "").trim(), size: Math.min(250, Math.max(1, Number(size) || 50)), withExif: true });

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** When it was taken, as Immich keeps it: the camera's local time (`localDateTime`), else the file's. */
export const takenOf = (a) => String(a?.localDateTime ?? a?.fileCreatedAt ?? "");

/** An asset of a search → the library's row. */
export function rowOf(a) {
  const taken = takenOf(a);
  const ex = a.exifInfo ?? {};
  const month = /^\d{4}-\d{2}/.test(taken) ? `${taken.slice(0, 4)} ${MONTHS[Number(taken.slice(5, 7)) - 1] ?? ""}`.trim() : "";
  return {
    id: String(a.id), video: a.type === "VIDEO", file: String(a.originalFileName ?? a.id), date: taken.slice(0, 10), taken,
    month, monthKey: taken.slice(0, 7), place: [ex.city, ex.country].filter(Boolean).join(", "),
    people: (a.people ?? []).map((p) => String(p.name ?? "")).filter(Boolean), favorite: !!a.isFavorite,
    description: String(ex.description ?? ""), camera: [ex.make, ex.model].filter(Boolean).join(" "),
  };
}

/** How many albums the library reads the photos of (one request each): the rest are listed by Immich's own pages. */
export const MAX_ALBUMS = 40;

/** `GET /api/albums` → the albums, biggest first, those with something in them: { id, name, count }. */
export function albumsOf(answer) {
  return (Array.isArray(answer) ? answer : [])
    .map((a) => ({ id: String(a.id), name: String(a.albumName ?? "").trim() || "(untitled album)", count: Number(a.assetCount) || 0 }))
    .filter((a) => a.count > 0)
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

/** An album's photos: `GET /api/albums/<id>`'s `assets` (null when this Immich no longer lists them there, and the
 *  client asks the search for `albumIds` instead). */
export const albumAssetsOf = (answer) => (Array.isArray(answer?.assets) ? answer.assets : null);

/** The search for one album's photos, for an Immich whose album answer has no assets. */
export const albumBody = (id, page = 1) => ({ albumIds: [id], page, size: PAGE, order: "desc", withExif: true, withPeople: true });

/** The rows of the listing and of the albums as one list: each photo once, with the names of the albums it is in (`albums`),
 *  the albums' older photos added to the newest ones (`assetsById`: an album's id → its assets). */
export function withAlbums(rows, albums, assetsById) {
  const byId = new Map(rows.map((r) => [r.id, { ...r, albums: [] }]));
  for (const al of albums) {
    for (const a of assetsById.get(al.id) ?? []) {
      const id = String(a.id);
      if (!byId.has(id)) byId.set(id, { ...rowOf(a), albums: [] });
      const r = byId.get(id);
      if (!r.albums.includes(al.name)) r.albums.push(al.name);
    }
  }
  return [...byId.values()];
}

/** The side's order: the albums first (by name), then the months, newest first (a month's name does not sort by itself). */
export function groupOrderOf(rows) {
  const albums = [...new Set(rows.flatMap((r) => r.albums ?? []))].sort((a, b) => a.localeCompare(b));
  const months = [...new Map(rows.filter((r) => r.month).map((r) => [r.monthKey, r.month]))].sort((a, b) => b[0].localeCompare(a[0])).map(([, m]) => m);
  return [...albums, ...months];
}

/** The items of a search's answer, and whether there is a next page. */
export const itemsOf = (answer) => ({ items: answer?.assets?.items ?? [], more: answer?.assets?.nextPage != null });

/** The line under a photo's file name: when, where, who. */
export const subOf = (r) => [r.date, r.place, r.people.join(", ")].filter(Boolean).join(" · ");

/** Where it opens in Immich's own pages. */
export const webUrl = (base, id) => `${base}/photos/${id}`;

/** The original kept with the local copies of remote files: `.atlas/remote/immich/originals/<id>/<file name>`, the
 *  name made safe (no folder, nothing hidden). */
export function keptName(r) {
  const safe = String(r.file).replace(/[\\/:*?"<>|\x00-\x1f]/g, "_").replace(/^\.+/, "").trim().slice(0, 120);
  return safe || `${r.id}${r.video ? ".mp4" : ".jpg"}`;
}

/** An asset as an agent reads it (the `search` tool). */
export function forAgent(r, base) {
  return {
    id: r.id, type: r.video ? "video" : "photo", file: r.file, taken: r.taken || null, place: r.place || null, people: r.people,
    ...(r.description ? { description: r.description } : {}), ...(r.favorite ? { favorite: true } : {}), url: base ? webUrl(base, r.id) : null,
  };
}

/** The kinds of file Immich takes (pictures, videos and the raw formats it reads). */
export const SENDABLE = ["jpg", "jpeg", "png", "heic", "heif", "webp", "gif", "tif", "tiff", "avif", "jxl", "dng", "cr2", "cr3", "nef", "arw", "orf", "rw2", "raf", "mp4", "mov", "m4v", "webm", "mkv", "3gp", "avi"];
export const sendable = (path) => !!path && !String(path).endsWith("/") && SENDABLE.includes(String(path).split(".").pop().toLowerCase());

/** Immich's upload (`POST /api/assets`): the file as `assetData`; `deviceAssetId` names it for this device (the vault
 *  path, so sending it again is a duplicate Immich recognises), the times now (Immich dates a photo by its EXIF anyway). */
export function uploadRequest(path, device, now = new Date().toISOString()) {
  return {
    path: "/api/assets",
    init: { method: "POST", multipart: { file: path, field: "assetData", fields: { deviceAssetId: `atlas:${path}`, deviceId: String(device || "atlas"), fileCreatedAt: now, fileModifiedAt: now } } },
  };
}

/** The plugin API version that sends `multipart` (older apps drop it). */
export const MULTIPART_API = 37;

/** Originals a web page cannot draw (Apple's HEIC, cameras' raw files): opened as Immich's preview (a JPEG, about
 *  1440 px) instead, kept under the same name with `.jpg`. */
const UNDRAWABLE = ["heic", "heif", "dng", "cr2", "cr3", "nef", "arw", "orf", "rw2", "raf"];

/** What Open fetches for a photo, and the name it is kept under. */
export function viewOf(r) {
  const ext = r.file.split(".").pop().toLowerCase();
  if (UNDRAWABLE.includes(ext)) return { path: `/api/assets/${encodeURIComponent(r.id)}/thumbnail?size=preview`, name: `${keptName(r).replace(/\.[^.]+$/, "")}.jpg` };
  return { path: `/api/assets/${encodeURIComponent(r.id)}/original`, name: keptName(r) };
}
