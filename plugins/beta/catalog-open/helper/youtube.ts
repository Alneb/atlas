// YouTube for the catalog: `lookup` from a video id (oEmbed through the core's fetch; no key). The page itself, read by
// the catalog, adds what oEmbed lacks (upload date, duration, description). Tests: youtube.test.ts.
import type { Params } from "atlas-helper";

type Kind = "video" | "song";

/** The watch address with nothing else: what TubeArchivist or a music downloader is handed. */
const cleanUrl = (vid: string, kind: Kind) => `https://${kind === "song" ? "music.youtube.com" : "www.youtube.com"}/watch?v=${vid}`;

const TOPIC = " - Topic"; // YouTube Music's auto-generated channels are "<artist> - Topic"

function fromOembed(o: { title?: string; author_name?: string }, vid: string, kind: Kind) {
  const channel = String(o.author_name ?? "").trim();
  const fields: Record<string, string | undefined> = { title: o.title, cover: `https://i.ytimg.com/vi/${vid}/hqdefault.jpg` };
  if (kind === "song") fields.artist = (channel.endsWith(TOPIC) ? channel.slice(0, -TOPIC.length) : channel) || undefined;
  else fields.channel = channel || undefined;
  return { ids: { youtube: vid, url: cleanUrl(vid, kind) }, fields: Object.fromEntries(Object.entries(fields).filter(([, v]) => v)) };
}

export async function lookup(params: Params) {
  const vid = (params.ids as Record<string, string> | undefined)?.youtube;
  if (!vid) return { fields: {}, skipped: "no YouTube id" };
  const kind: Kind = params.kind === "song" ? "song" : "video";
  const watch = encodeURIComponent(`https://www.youtube.com/watch?v=${vid}`);
  // 401/403: private, removed or age-restricted — as gone as a 404
  const o = await atlas.fetchJson(`https://www.youtube.com/oembed?format=json&url=${watch}`, { timeout: 15, missing: [401, 403, 404] });
  if (!o) return { ids: { youtube: vid, url: cleanUrl(vid, kind) }, fields: {}, skipped: "YouTube does not show this video (private, removed or age-restricted)" };
  return fromOembed(o, vid, kind);
}
