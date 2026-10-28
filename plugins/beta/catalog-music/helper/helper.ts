// MusicBrainz for the catalog: `lookup` finds an album (release group), a song (recording) or an artist by its id, by
// the link it was captured from (MusicBrainz keeps links to Spotify, Bandcamp, Apple Music… on its entries), or by the
// artist and title a page gave (`hints`), and answers the catalog's fields. Requests go through Atlas's core.
// Tests: helper.test.ts.
import type { Params } from "atlas-helper";

const API = "https://musicbrainz.org/ws/2";
const COVERS = "https://coverartarchive.org";
const SURE = 90; // a search hit below this score is not filed: a wrong album is worse than none

type Kind = "album" | "song" | "artist";
const ENTITY: Record<Kind, string> = { album: "release-group", song: "recording", artist: "artist" };
const INC: Record<Kind, string> = { album: "artist-credits+genres+releases+media", song: "artist-credits+genres+releases+release-groups", artist: "genres" };
const FIELD: Record<Kind, string> = { album: "releasegroup", song: "recording", artist: "artist" };

// MusicBrainz asks for one request a second and a User-Agent saying who asks; 400 is its "no such id"
const get = (url: string) => atlas.fetchJson(url, { headers: { "User-Agent": "Atlas/0.1 (personal notes app; catalog-music)" }, every: 1, missing: [400, 404] });

interface Credit { name?: string; artist?: { name?: string } }
interface Release { title?: string; date?: string; status?: string; media?: { "track-count"?: number }[]; "release-group"?: { "primary-type"?: string; "secondary-types"?: string[] } }
interface Entity { id: string; title?: string; name?: string; country?: string; disambiguation?: string; length?: number; "first-release-date"?: string;
  "artist-credit"?: Credit[]; genres?: { name: string; count?: number }[]; releases?: Release[] }

/** MusicBrainz's artist credit → one name, or several as a list. */
function artists(credit: Credit[] | undefined): string | string[] | undefined {
  const names = (credit ?? []).map((c) => c.name || c.artist?.name).filter((n): n is string => !!n);
  return names.length === 1 ? names[0] : names.length ? names : undefined;
}

const yearOf = (date: unknown) => (typeof date === "string" && /^\d{4}/.test(date) ? Number(date.slice(0, 4)) : undefined);

function genres(e: Entity): string[] | undefined {
  const gs = [...(e.genres ?? [])].sort((a, b) => (b.count ?? 0) - (a.count ?? 0));
  return gs.length ? gs.slice(0, 5).map((g) => atlas.text.title(g.name)) : undefined;
}

function duration(length: number | undefined): string | undefined {
  if (!length) return undefined;
  const s = Math.floor(length / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** What a video or a shop calls a song → the song's name: "(Official Video Remastered)", "[Lyrics]" and the like
 *  dropped, and an "Artist - " before it. */
export function cleanTitle(title: string): string {
  const t = (title ?? "").replace(/\s*[([][^)\]]*\b(official|video|audio|lyrics?|visuali[sz]er|remaster(ed)?|hd|4k|mv)\b[^)\]]*[)\]]/gi, "");
  return t.replace(/^.{1,60}?\s[-–—]\s/, "").trim() || (title ?? "").trim();
}

/** A channel's name → the artist's: "Queen - Topic", "QueenVEVO", "Queen Official" → "Queen"; a VEVO channel glues the
 *  words together ("RickAstleyVEVO"), so they are parted again at their capitals ("Rick Astley"). */
export function cleanArtist(name: unknown): string | undefined {
  const raw = String(name ?? "").trim();
  const vevo = /VEVO$/i.test(raw);
  let n = raw.replace(/\s*-\s*Topic$|VEVO$|\s+Official$|\s+Official Channel$/i, "").trim();
  if (vevo && !n.includes(" ")) n = n.replace(/(?<=[a-z])(?=[A-Z])/g, " ");
  return n || undefined;
}

/** A song's album: the earliest official release whose group is a studio album (not a live one or a compilation). */
export function firstAlbum(releases: Release[] | undefined): string | undefined {
  const studio = (r: Release) => r["release-group"]?.["primary-type"] === "Album" && !r["release-group"]?.["secondary-types"]?.length && r.status === "Official";
  return (releases ?? []).filter(studio).sort((a, b) => (a.date || "9999").localeCompare(b.date || "9999"))[0]?.title;
}

function fieldsOf(kind: Kind, e: Entity): Record<string, unknown> {
  if (kind === "album") {
    const withMedia = (e.releases ?? []).find((r) => r.media?.length);
    const tracks = withMedia?.media?.reduce((n, m) => n + (m["track-count"] ?? 0), 0);
    return { title: e.title, artist: artists(e["artist-credit"]), year: yearOf(e["first-release-date"]), genres: genres(e), tracks: tracks || undefined, cover: `${COVERS}/release-group/${e.id}/front-500` };
  }
  if (kind === "song") {
    return { title: e.title, artist: artists(e["artist-credit"]), album: firstAlbum(e.releases), year: yearOf(e["first-release-date"]), duration: duration(e.length), genres: genres(e) };
  }
  return { title: e.name, genres: genres(e), country: e.country, description: e.disambiguation || undefined };
}

/** The entity MusicBrainz has linked to this address (a Spotify album, a Bandcamp page), if any. */
async function byLink(kind: Kind, url: string | undefined): Promise<string | undefined> {
  if (!url || url.includes("musicbrainz.org")) return undefined;
  const r = (await get(`${API}/url?resource=${atlas.url.quote(url, "")}&inc=release-group-rels+release-rels+recording-rels+artist-rels&fmt=json`)) ?? {};
  const want = ENTITY[kind];
  for (const rel of r.relations ?? []) {
    if (rel[want]) return rel[want].id;
    if (kind === "album" && rel.release) {
      const rg = (await get(`${API}/release/${rel.release.id}?inc=release-groups&fmt=json`))?.["release-group"];
      if (rg) return rg.id;
    }
  }
  return undefined;
}

/** The best hit for the artist and title a page gave; only a sure one (score ≥ SURE). */
async function bySearch(kind: Kind, hints: Record<string, unknown>): Promise<string | undefined> {
  const title = cleanTitle(String(hints.title ?? ""));
  const named = typeof hints.artist === "string" ? hints.artist : (hints.artist as string[] | undefined)?.[0];
  const artist = cleanArtist(named) ?? cleanArtist(hints.channel);
  if (!title || (kind === "song" && !artist)) return undefined; // a song's name alone matches covers and karaoke
  const q = `${FIELD[kind]}:"${title}"` + (artist && kind !== "artist" ? ` AND artist:"${artist}"` : "");
  const r = (await get(`${API}/${ENTITY[kind]}?query=${atlas.url.quote(q)}&limit=50&fmt=json`)) ?? {};
  let sure: (Entity & { score?: number })[] = (r[`${ENTITY[kind]}s`] ?? []).filter((h: { score?: number }) => Number(h.score ?? 0) >= SURE);
  if (kind === "song") {
    // a famous song has dozens of recordings (live, remasters, covers): the one with this very name, out first
    const exact = sure.filter((h) => (h.title ?? "").toLowerCase() === title.toLowerCase() && !h.disambiguation);
    sure = (exact.length ? exact : sure).sort((a, b) => (a["first-release-date"] || "9999").localeCompare(b["first-release-date"] || "9999"));
  }
  return sure[0]?.id;
}

async function lookup(params: Params) {
  const kind = String(params.kind || "album");
  if (!(kind in ENTITY)) return { fields: {}, skipped: `MusicBrainz has no ${kind}s` };
  const k = kind as Kind;
  const ids = (params.ids ?? {}) as Record<string, string>, hints = (params.hints ?? {}) as Record<string, unknown>;
  let mbid: string | undefined = ids.musicbrainz;
  if (!mbid && ids.mb_release && k === "album") mbid = (await get(`${API}/release/${ids.mb_release}?inc=release-groups&fmt=json`))?.["release-group"]?.id;
  mbid = mbid || (await byLink(k, params.url as string | undefined)) || (await bySearch(k, hints));
  if (!mbid) {
    // nothing to go on yet: asked again once the page (catalog-web) has said the artist and title
    return hints.title ? { fields: {}, skipped: "MusicBrainz has no sure match" } : { later: true };
  }
  const e: Entity | null = await get(`${API}/${ENTITY[k]}/${mbid}?inc=${INC[k]}&fmt=json`);
  if (!e) return { fields: {}, skipped: `MusicBrainz has no ${ENTITY[k]} ${mbid}` };
  const fields = Object.fromEntries(Object.entries(fieldsOf(k, e)).filter(([, v]) => v !== undefined && v !== null && v !== ""));
  return { ids: { musicbrainz: mbid }, fields };
}

atlas.methods({ lookup });
