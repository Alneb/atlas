// Audiobookshelf's API as the library and the player need it (checked against its docs: /api/libraries, the items of a
// library, /api/me's mediaProgress, a play session's tracks and chapters, its sync and close). Every call through the
// core's fetch with the token as a secret header; the audio through `atlas.media`, the token added by the core.
/** Covers by item id, for the page's life: a promise of an address the page can show, or null. */
const covers = new Map();

export function abs(atlas) {
  const S = atlas.plugin.settings ?? {};
  const base = String(S.server || "").trim().replace(/\/+$/, "");
  const auth = { Authorization: { secret: "token", prefix: "Bearer " } };
  /** One request; its JSON answer (`json` false: an answer that is only "OK"). */
  async function call(path, init = {}, json = true) {
    if (!base) throw new Error("no Audiobookshelf address yet (Settings → Plugins → Audiobookshelf)");
    const r = await atlas.fetch(base + path, { ...init, headers: { ...auth, accept: "application/json", ...(init.headers ?? {}) } });
    if (r.signin) throw new Error(`sign in to ${new URL(base).host} first (Atlas offered it)`);
    if (!r.ok) throw new Error(`Audiobookshelf answered ${r.status}${r.status === 401 ? ": the API token (Settings → Plugins → Audiobookshelf)" : ""}`);
    return json ? r.json() : r.text();
  }
  /** Every item of a library, a page at a time to its total (one capped page left a big library's tail out). */
  async function itemsOf(lib) {
    const PAGE = 500, out = [];
    for (let page = 0, more = true; more; page++) {
      const r = await call(`/api/libraries/${encodeURIComponent(lib)}/items?limit=${PAGE}&page=${page}`);
      const items = r.results ?? [];
      out.push(...items);
      more = items.length > 0 && (page + 1) * PAGE < Number(r.total ?? 0);
    }
    return out;
  }
  let libs = null;
  return {
    on: !!base,
    /** Every audiobook of the server's book libraries, with where you are in it. */
    async books() {
      const libs = ((await call("/api/libraries")).libraries ?? []).filter((l) => (l.mediaType ?? "book") === "book");
      const me = await call("/api/me").catch(() => ({}));
      const progress = new Map((me.mediaProgress ?? []).map((p) => [p.libraryItemId, p]));
      const out = [];
      // the collections and playlists an item is in: groups of the library beside its series
      const inGroups = new Map();
      const into = (id, name) => { if (!inGroups.has(id)) inGroups.set(id, []); inGroups.get(id).push(name); };
      await Promise.all(libs.map(async (l) => {
        const lib = encodeURIComponent(l.id);
        const [cols, lists] = await Promise.all([call(`/api/libraries/${lib}/collections`).catch(() => ({})), call(`/api/libraries/${lib}/playlists`).catch(() => ({}))]);
        for (const c of cols.results ?? []) for (const b of c.books ?? []) into(b.id, `Collection · ${c.name}`);
        for (const p of lists.results ?? []) for (const x of p.items ?? []) if (!x.episodeId) into(x.libraryItemId, `Playlist · ${p.name}`);
      }));
      for (const l of libs) {
        for (const it of await itemsOf(l.id)) {
          const m = it.media?.metadata ?? {};
          out.push({ id: it.id, library: l.name, title: m.title ?? it.id, author: m.authorName ?? "", narrator: m.narratorName ?? "", series: m.seriesName ?? "",
            duration: Number(it.media?.duration) || 0, progress: progress.get(it.id) ?? null, groups: inGroups.get(it.id) ?? [] });
        }
      }
      return out;
    },
    /** Every podcast of the server's podcast libraries, with when you last listened to one of its episodes. */
    async shows() {
      const libs = ((await call("/api/libraries")).libraries ?? []).filter((l) => l.mediaType === "podcast");
      const me = await call("/api/me").catch(() => ({}));
      const last = new Map(); // item → the newest lastUpdate of its episodes
      for (const p of me.mediaProgress ?? []) if (p.episodeId) last.set(p.libraryItemId, Math.max(last.get(p.libraryItemId) ?? 0, Number(p.lastUpdate) || 0));
      const out = [];
      for (const l of libs) {
        for (const it of await itemsOf(l.id)) {
          const m = it.media?.metadata ?? {};
          out.push({ id: it.id, library: l.name, title: m.title ?? it.id, author: m.author ?? m.authorName ?? "", episodes: Number(it.media?.numEpisodes ?? it.media?.episodes?.length) || 0, lastUsed: last.get(it.id) ?? 0 });
        }
      }
      return out;
    },
    /** The server's libraries ({ id, name, mediaType: "book" | "podcast" }), asked once per client. */
    libraries: () => (libs ??= call("/api/libraries").then((r) => r.libraries ?? [])),
    /** The user: mediaProgress (where you are in each item and episode), bookmarks. */
    me: () => call("/api/me"),
    /** Your listening: the total, per day, per item, the recent sessions (`/api/me/listening-stats`). */
    stats: () => call("/api/me/listening-stats"),
    /** A library's home shelves as the server makes them for the user: Continue listening, Recently added, series… */
    personalized: (lib) => call(`/api/libraries/${encodeURIComponent(lib)}/personalized?limit=12`),
    collections: (lib) => call(`/api/libraries/${encodeURIComponent(lib)}/collections`),
    playlists: (lib) => call(`/api/libraries/${encodeURIComponent(lib)}/playlists`),
    /** The server's own search of a library: books, podcasts, series, authors. */
    search: (lib, q) => call(`/api/libraries/${encodeURIComponent(lib)}/search?q=${encodeURIComponent(q)}&limit=12`),
    /** An author and their books. */
    author: (id) => call(`/api/authors/${encodeURIComponent(id)}?include=items`),
    /** A bookmark at `time` (seconds) with its note, on the server (`POST /api/me/item/<id>/bookmark`). */
    addBookmark: (item, time, title) => call(`/api/me/item/${encodeURIComponent(item)}/bookmark`, { method: "POST", body: { time: Math.floor(time), title } }),
    /** A bookmark removed: the server knows it by its time. */
    removeBookmark: (item, time) => call(`/api/me/item/${encodeURIComponent(item)}/bookmark/${encodeURIComponent(String(time))}`, { method: "DELETE" }, false),
    /** One item, expanded: its media's tracks, chapters and `ebookFile` (the ebook it carries, for read-along). */
    item: (id) => call(`/api/items/${encodeURIComponent(id)}?expanded=1`),
    /** The item's ebook, kept with the local copies of remote files (`.atlas/remote/<plugin>/ebooks/<id>/<name>`, which
     *  the readers open): its vault path. Fetched again only when it is not kept yet. */
    async ebook(id, name) {
      const safe = String(name || "ebook").replace(/[\\/]/g, "_");
      const kept = `.atlas/remote/${atlas.plugin.id}/ebooks/${id}/${safe}`;
      if (await atlas.exists?.(kept).catch(() => false)) return kept;
      const r = await atlas.fetch(`${base}/api/items/${encodeURIComponent(id)}/ebook`, { headers: auth, saveTo: `ebooks/${id}/${safe}`, saveIn: "remote", timeout: 120 });
      if (r.signin) throw new Error(`sign in to ${new URL(base).host} first (Atlas offered it)`);
      if (!r.ok || !r.saved) throw new Error(`Audiobookshelf answered ${r.status} for the ebook`);
      return r.saved;
    },
    /** A file of the server (a track's `contentUrl`) streamed by the core into the plugin's cache at `saveTo` (`kept/…`),
     *  to be played offline (`atlas.media({ file })`). The core's limits hold: 300 s and 512 MB a file. */
    async download(contentUrl, saveTo) {
      const r = await atlas.fetch(base + contentUrl, { headers: auth, saveTo, timeout: 300 });
      if (r.signin) throw new Error(`sign in to ${new URL(base).host} first (Atlas offered it)`);
      if (!r.ok || !r.saved) throw new Error(`Audiobookshelf answered ${r.status} for ${saveTo.split("/").pop()}`);
      return saveTo;
    },
    /** The ebook's place on the server (`{ ebookLocation, ebookProgress }`), what Audiobookshelf's own reader resumes from. */
    ebookPlace: (id, place) => call(`/api/me/progress/${encodeURIComponent(id)}`, { method: "PATCH", body: place }, false),
    /** The book's cover, kept in the plugin's cache: an address the page can show (null when it has none). */
    cover(id) {
      if (!base) return Promise.resolve(null);
      // asked once per page (a shelf shows the same book on several rows); a cover already kept is not fetched again
      if (!covers.has(id)) covers.set(id, (async () => {
        const kept = `.atlas/cache/plugins/${atlas.plugin.id}/covers/${id}`;
        if (await atlas.exists?.(kept).catch(() => false)) return atlas.fileUrl(kept);
        const r = await atlas.fetch(`${base}/api/items/${encodeURIComponent(id)}/cover`, { headers: auth, saveTo: `covers/${id}` });
        return r.ok && r.saved ? atlas.fileUrl(r.saved) : null;
      })().catch(() => null));
      return covers.get(id);
    },
    /** A play session: its id, tracks (contentUrl, startOffset, duration), chapters, where you were; a podcast's
     *  `episode` played as itself (`/play/<episode>`). */
    play: (id, episode) => call(`/api/items/${encodeURIComponent(id)}/play${episode ? `/${encodeURIComponent(episode)}` : ""}`, { method: "POST", body: playBody(deviceId()) }),
    /** This device's id, for a session the helper opens again (the player's reports, helper.ts `progressWith`). */
    device: () => deviceId(),
    /** A track's address for `<audio src>` (the token added by the core). */
    src: (track) => atlas.media(base + track.contentUrl, { headers: auth }),
  };
}

/** What a play session is opened with (here and by the helper, which opens one again when the server ended it): the
 *  device (its listening stats are per device) and the audio played as the files are — the app's player takes them all. */
export function playBody(device) {
  return {
    deviceInfo: { clientName: "Atlas", deviceId: device }, mediaPlayer: "html5", forceDirectPlay: true, forceTranscode: false,
    supportedMimeTypes: ["audio/mpeg", "audio/mp4", "audio/x-m4b", "audio/aac", "audio/ogg", "audio/flac", "audio/wav", "audio/webm"],
  };
}

/** This device's id for Audiobookshelf's sessions (its listening stats per device): made once, kept in the page's
 *  storage of this device. */
function deviceId() {
  try {
    let id = localStorage.getItem("atlas-abs-device");
    if (!id) { id = `atlas-${Math.random().toString(36).slice(2, 10)}`; localStorage.setItem("atlas-abs-device", id); }
    return id;
  } catch { return "atlas"; }
}

/** `5h 03m`, `42m`, `0:05` for a time in seconds. */
export function clock(s, long = false) {
  s = Math.max(0, Math.floor(s));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  if (long) return h ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}m`;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}` : `${m}:${String(sec).padStart(2, "0")}`;
}

// ── signing in through the server's own OpenID (Authelia, Authentik…) instead of a pasted token ────────────────────
// Audiobookshelf checks only its own tokens, so the provider's token is no use to it: the app signs in the way its
// own mobile apps do — `/auth/openid` with PKCE and a redirect the server allows (`audiobookshelf://oauth` by
// default, Settings → Authentication → Allowed Mobile Redirect URIs), then `/auth/openid/callback` with the code and
// the verifier answers the user, whose token is kept as the plugin's `token` secret.

// (no URL / URLSearchParams: this module is the helper's too, and QuickJS has neither)
const query = (o) => Object.entries(o).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join("&");
/** An address's query as {name: value} (the first of each). */
const params = (url) => {
  const out = {};
  for (const part of (url.split("#")[0].split("?")[1] ?? "").split("&")) {
    const i = part.indexOf("="), k = decodeURIComponent((i < 0 ? part : part.slice(0, i)).replace(/\+/g, " "));
    if (k && !(k in out)) out[k] = i < 0 ? "" : decodeURIComponent(part.slice(i + 1).replace(/\+/g, " "));
  }
  return out;
};

/** The address that starts the sign-in on server `base`. */
export function openidUrl(base, { challenge, state, redirect }) {
  return `${base}/auth/openid?${query({ code_challenge: challenge, code_challenge_method: "S256", redirect_uri: redirect, client_id: "Atlas", response_type: "code", state })}`;
}

/** The address that trades the code the redirect carried for the user (null when it carries none, or another state). */
export function callbackUrl(base, returned, { state, verifier }) {
  const q = params(String(returned ?? ""));
  if (!q.code || q.state !== state) return null;
  return `${base}/auth/openid/callback?${query({ state, code: q.code, code_verifier: verifier })}`;
}

/** The user's token in the callback's answer: the long-lived `token` (older servers, and the API's own), else the
 *  newer access token. */
export function tokenOf(answer) {
  const u = answer?.user ?? {};
  return u.token || u.accessToken || answer?.accessToken || null;
}

/** 43–128 characters of [A-Za-z0-9-._~] (RFC 7636), and its S256 challenge. */
async function pkce() {
  const b64 = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const verifier = b64(crypto.getRandomValues(new Uint8Array(48)));
  const challenge = b64(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))));
  return { verifier, challenge, state: b64(crypto.getRandomValues(new Uint8Array(16))) };
}

/** The sign-in: the server's page (and the provider's behind it) in the app's sign-in window, the token kept. */
export async function openidSignIn(atlas) {
  const S = atlas.plugin.settings ?? {};
  const base = String(S.server || "").trim().replace(/\/+$/, "");
  if (!base) throw new Error("no Audiobookshelf address yet (Settings → Plugins → Audiobookshelf)");
  const redirect = String(S.openid_redirect || "audiobookshelf://oauth").trim();
  const p = await pkce();
  const back = await atlas.signIn(openidUrl(base, { ...p, redirect }), redirect);
  const url = callbackUrl(base, back, p);
  if (!url) throw new Error("the sign-in did not come back with a code");
  const r = await atlas.fetch(url, { headers: { accept: "application/json" } });
  if (!r.ok) throw new Error(`Audiobookshelf refused the sign-in (${r.status}): is OpenID on in its Settings → Authentication?`);
  const token = tokenOf(await r.json());
  if (!token) throw new Error("Audiobookshelf's answer had no token");
  await atlas.secrets.set("token", token);
}
