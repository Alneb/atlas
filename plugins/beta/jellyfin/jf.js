// Jellyfin's API as this plugin uses it, without a page or a helper around it: the shapes of its answers turned into
// what Atlas shows and plays, and the reports it takes (jf.test.mjs runs these on cut-down copies of its answers).
// Written from Jellyfin 10.9–10.10's API (/Users/Me, /Users/<id>/Items, /Shows/NextUp, /Videos/<id>/stream,
// /Sessions/Playing…).

/** Jellyfin counts time in ticks of 100 ns. */
export const TICKS = 10_000_000;
export const seconds = (ticks) => Math.max(0, Number(ticks) || 0) / TICKS;
export const ticks = (s) => Math.round(Math.max(0, Number(s) || 0) * TICKS);

/** The `Authorization` Jellyfin asks of a client signing in (no token yet): who is asking, from which device. */
export function clientHeader(device, version) {
  return `MediaBrowser Client="Atlas", Device="Atlas", DeviceId="${String(device).replace(/"/g, "")}", Version="${version}"`;
}

/** An item of /Users/<id>/Items (a film, a series, an episode) → the library's row. */
export function rowOf(it) {
  const u = it.UserData ?? {};
  const length = seconds(it.RunTimeTicks);
  const at = seconds(u.PlaybackPositionTicks);
  const episode = it.Type === "Episode";
  const title = episode ? `${it.SeriesName ?? ""} — ${seasonEpisode(it)}${it.Name ?? ""}` : it.Name ?? it.Id;
  return {
    id: it.Id, type: it.Type, title, name: it.Name ?? "", series: it.SeriesName ?? "", seriesId: it.SeriesId ?? "",
    year: it.ProductionYear ?? null, length, at, played: !!u.Played, genres: it.Genres ?? [],
    overview: it.Overview ?? "", ids: providerIds(it.ProviderIds), lastPlayed: u.LastPlayedDate ? Date.parse(u.LastPlayedDate) : 0,
    // how far, for the Continue row and the bar under the cover
    progress: u.Played ? 1 : length && at ? Math.min(1, at / length) : u.PlayedPercentage ? u.PlayedPercentage / 100 : undefined,
    unplayed: Number(u.UnplayedItemCount) || 0,
  };
}

const seasonEpisode = (it) => (it.ParentIndexNumber != null && it.IndexNumber != null ? `S${String(it.ParentIndexNumber).padStart(2, "0")}E${String(it.IndexNumber).padStart(2, "0")} ` : "");

/** ProviderIds ({ Tmdb, Imdb, Tvdb }) → the catalog's ids ({ tmdb, imdb, tvdb }), the empty ones left out. */
export function providerIds(p) {
  const out = {};
  for (const [k, v] of Object.entries(p ?? {})) if (v) out[k.toLowerCase()] = String(v);
  return out;
}

/** The address mpv plays: the file as it is on the server (no transcoding: mpv plays every codec). */
export const streamPath = (id) => `/Videos/${encodeURIComponent(id)}/stream?static=true&mediaSourceId=${encodeURIComponent(id)}`;

/** The external subtitle files of an item (its first media source's): the paths to ask Jellyfin for, in its order.
 *  The ones inside the file need nothing: mpv reads them from the stream. */
export function subtitlePaths(item) {
  const src = item?.MediaSources?.[0];
  if (!src) return [];
  const ext = (codec) => ({ subrip: "srt", webvtt: "vtt", ass: "ass", ssa: "ssa" })[String(codec ?? "").toLowerCase()] ?? String(codec ?? "srt").toLowerCase();
  return (src.MediaStreams ?? [])
    .filter((m) => m.Type === "Subtitle" && m.IsExternal && m.Index != null)
    .map((m) => `/Videos/${encodeURIComponent(item.Id)}/${encodeURIComponent(src.Id ?? item.Id)}/Subtitles/${m.Index}/Stream.${ext(m.Codec)}`);
}

/** The player's item for a row: the stream as its one track, where it was left (unless finished), the note to link. */
export function playItem(row, src, note, subtitles = []) {
  return {
    ...(subtitles.length ? { subtitles } : {}),
    key: { item: row.id }, title: row.title, author: row.year ? String(row.year) : row.series, tracks: [{ src, start: 0, duration: row.length }],
    at: row.played || row.length - row.at < 60 ? 0 : row.at, video: true, note, open: row.id,
  };
}

/** A player's report (`[media] progress`) → the requests that tell Jellyfin, in order, and the key for the next one.
 *  The first report opens the play session (`/Sessions/Playing`); a pause or a tick is a progress; the end and a
 *  close stop it (Jellyfin marks a film played when it stopped near its end). */
export function reportRequests(report) {
  const key = report.key ?? {};
  if (!key.item) throw new Error("a report with no item (key.item)");
  const base = { ItemId: key.item, MediaSourceId: key.item, PositionTicks: ticks(report.at), PlayMethod: "DirectPlay", CanSeek: true };
  const out = [];
  const stopping = report.state === "closed" || report.state === "ended";
  if (!key.started && !stopping) out.push(["/Sessions/Playing", base]);
  if (stopping) out.push(["/Sessions/Playing/Stopped", base]);
  else out.push(["/Sessions/Playing/Progress", { ...base, IsPaused: report.state === "paused", EventName: report.state === "paused" ? "Pause" : "TimeUpdate" }]);
  return { requests: out, key: stopping ? { item: key.item } : { item: key.item, started: true } };
}

/** What the catalog's `note` tool asks to find (or make) a film's or a series' note — the one rule for every thing a
 *  server keeps (docs/design/DESIGN-server-libraries.md §3): the series for an episode; its kind, its TMDB/IMDb ids,
 *  what Jellyfin says of it below every source; `why` what just happened (`opened`, `asked`) — watching past the
 *  start makes it yours ("progress", how far). */
export function thingOf(row, server, why = "opened") {
  const ep = row.type === "Episode" && row.seriesId;
  const t = ep ? { ...row, type: "Series", title: row.series, ids: {}, id: row.seriesId, overview: "", genres: [] } : row;
  const fields = { title: t.title, ...(t.year && !ep ? { year: t.year } : {}), ...(t.genres?.length ? { genres: t.genres } : {}), ...(t.overview ? { description: t.overview } : {}), ...(server ? { jellyfin: `${server}/web/#/details?id=${t.id}` } : {}) };
  const progress = row.played ? 1 : row.length ? row.at / row.length : 0;
  return { kind: t.type === "Movie" ? "movie" : "show", ids: t.ids ?? {}, fields, why: why === "opened" && progress > 0 ? "progress" : why, ...(why === "opened" && progress > 0 ? { progress } : {}) };
}
