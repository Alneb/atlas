// Jellyfin's client, shared by the page side (main.js: the library, the commands) and the server's own tab (view.js):
// the server's films and series, a film played in the app's player with its note beside it.
import { playItem, rowOf, streamPath, subtitlePaths, thingOf } from "./jf.js";

export const el = (tag, style, text) => { const e = document.createElement(tag); if (style) e.style.cssText = style; if (text !== undefined) e.textContent = text; return e; };
const FIELDS = "Fields=ProviderIds,Overview,Genres,UserData,RunTimeTicks,ProductionYear";

export function jellyfin(atlas) {
  const S = atlas.plugin.settings ?? {};
  const base = String(S.server ?? "").trim().replace(/\/+$/, "");
  const auth = { "X-Emby-Token": { secret: "token" } };
  let me = null;
  async function call(path, init = {}) {
    if (!base) throw new Error("no Jellyfin address yet (Settings → Plugins → Jellyfin)");
    const r = await atlas.fetch(base + path, { ...init, headers: { ...auth, accept: "application/json", ...(init.headers ?? {}) } });
    if (r.signin) throw new Error(`sign in to ${new URL(base).host} first (Atlas offered it)`);
    if (!r.ok) throw new Error(`Jellyfin answered ${r.status}${r.status === 401 ? ": sign in again (the command “Jellyfin: sign in”)" : ""}`);
    return r.json();
  }
  const user = async () => (me ??= (await call("/Users/Me")).Id);
  return {
    base, on: !!base, call, user,
    /** Every film and series of the user's libraries, with where they are in them. */
    async all() {
      const uid = await user();
      const out = [];
      for (let start = 0, more = true; more; start += 500) {
        const r = await call(`/Users/${uid}/Items?IncludeItemTypes=Movie,Series&Recursive=true&SortBy=SortName&${FIELDS}&StartIndex=${start}&Limit=500`);
        out.push(...(r.Items ?? []).map(rowOf));
        more = (r.Items ?? []).length > 0 && start + 500 < Number(r.TotalRecordCount ?? 0);
      }
      return out;
    },
    /** What a series goes on with: its next episode (or its first). */
    async nextOf(seriesId) {
      const uid = await user();
      const next = (await call(`/Shows/NextUp?UserId=${uid}&SeriesId=${encodeURIComponent(seriesId)}&${FIELDS}&Limit=1`)).Items?.[0];
      if (next) return rowOf(next);
      const first = (await call(`/Shows/${encodeURIComponent(seriesId)}/Episodes?UserId=${uid}&${FIELDS}&Limit=1`)).Items?.[0];
      return first ? rowOf(first) : null;
    },
    /** A series' episodes, in order. */
    async episodes(seriesId) {
      const uid = await user();
      return ((await call(`/Shows/${encodeURIComponent(seriesId)}/Episodes?UserId=${uid}&${FIELDS}`)).Items ?? []).map(rowOf);
    },
    /** The poster, kept in the plugin's cache: an address the page can show (null when it has none). */
    async cover(id) {
      const r = await atlas.fetch(`${base}/Items/${encodeURIComponent(id)}/Images/Primary?maxHeight=480`, { headers: auth, saveTo: `covers/${id}` });
      return r.ok && r.saved ? atlas.fileUrl(r.saved) : null;
    },
    src: async (id) => (await atlas.media(base + streamPath(id), { headers: auth })).src,
    /** The item's external subtitle files, as addresses the player can reach (none when it has none or the ask fails). */
    async subtitles(id) {
      const item = await call(`/Users/${await user()}/Items/${encodeURIComponent(id)}`).catch(() => null);
      return Promise.all(subtitlePaths(item).map(async (p) => (await atlas.media(base + p, { headers: auth })).src));
    },
  };
}

/** A film or series is yours once watched or started: the library lists it; the rest is the server's own tab. */
export const yours = (r) => !!(r.played || r.lastPlayed || (r.progress ?? 0) > 0);

/** The thing's note, by the catalog's one rule (its `note` tool): found by its ids wherever it is, made only once it is
 *  yours — watched past the start, or asked for (`why`). Its path, or null: none yet, or no catalog in this vault. */
export async function noteOf(atlas, row, base, why = "opened") {
  const r = await atlas.post?.("/api/plugins/@catalog/tools/note", thingOf(row, base, why)).catch((e) => {
    if (why === "asked") atlas.toast?.("No note", /role|catalog/i.test(String(e?.message ?? e)) ? "A film's note is the Catalog's: switch the Catalog plugin on." : String(e?.message ?? e), "error");
    return null;
  });
  return r?.path ?? null;
}

/** A series' episodes in the chooser: which were watched, how far the one under way is; a pick plays it. */
export async function chooseEpisode(atlas, series) {
  const j = jellyfin(atlas);
  const eps = await j.episodes(series.id).catch((e) => { atlas.toast?.("No episodes", String(e?.message ?? e), "error"); return []; });
  if (!eps.length) return;
  const byId = new Map(eps.map((e) => [e.id, e]));
  atlas.pick({
    placeholder: `${series.title}: which episode?`, tag: "Episodes",
    items: eps.map((e) => ({ value: e.id, title: e.title.replace(`${e.series} — `, ""), detail: e.played ? "watched" : e.at ? `${Math.round(e.at / 60)} of ${Math.round(e.length / 60)} min` : `${Math.round(e.length / 60)} min` })),
    onpick: (id) => void watch(atlas, byId.get(id)),
  });
}

export async function watch(atlas, row) {
  const j = jellyfin(atlas);
  try {
    const it = row.type === "Series" ? await j.nextOf(row.id) : row;
    if (!it) { atlas.toast?.("Nothing to watch", "This series has no episodes on the server."); return; }
    const note = await noteOf(atlas, it, j.base).catch(() => undefined);
    await atlas.player.play({ ...playItem(it, await j.src(it.id), note, await j.subtitles(it.id).catch(() => [])), cover: (await j.cover(it.id).catch(() => null)) ?? undefined });
    if (note) atlas.open(note, undefined, { beside: true });
  } catch (e) {
    atlas.toast?.("Not played", String(e?.message ?? e), "error");
  }
}
