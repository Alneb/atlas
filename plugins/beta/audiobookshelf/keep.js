// Keeping a book (or a podcast's episode) for listening offline, as Audiobookshelf's own apps download: its tracks
// streamed by the core into the plugin's cache (`kept/<item>[_<episode>]/`, shelf.js `keepPlan`) with a `kept.json`
// beside them — title, author, chapters, each track's file and place in the item's time — so the player plays the kept
// files (`atlas.media({ file })`, the core serving them from disk with ranges) with no server at all. Where you are,
// listened to offline, is kept by the helper and sent as a local session once the server answers (helper.ts
// `progressWith`). The cache is this device's: each device keeps its own downloads.
import { keepPlan } from "./shelf.js";

const dirOf = (atlas, folder) => `.atlas/cache/plugins/${atlas.plugin.id}/${folder}`;
const folderOf = (item, episode) => `kept/${item}${episode ? `_${episode}` : ""}`;

/** The kept copy of a book or an episode (`{ title, author, chapters, tracks: [{ file, start, duration }] }`), or
 *  null when it is not kept, or a file of it is gone. */
export async function keptOf(atlas, item, episode) {
  const dir = dirOf(atlas, folderOf(item, episode));
  try {
    const kept = JSON.parse(await atlas.readText(`${dir}/kept.json`));
    const there = await Promise.all((kept.tracks ?? []).map((t) => atlas.exists(dirOf(atlas, t.file)).catch(() => false)));
    return kept.tracks?.length && there.every(Boolean) ? kept : null;
  } catch { return null; }
}

/** Every track fetched, one after the other (`step(done, of)` after each), then `kept.json` written last: a copy
 *  cut short is never taken for a kept one. */
export async function keep(atlas, a, item, episode, step = () => {}) {
  const plan = keepPlan(await a.item(item), episode);
  if (!plan) throw new Error("the server gave no audio to keep");
  step(0, plan.tracks.length);
  for (const [i, t] of plan.tracks.entries()) {
    await a.download(t.url, t.file);
    step(i + 1, plan.tracks.length);
  }
  const { folder, ...rest } = plan;
  const kept = { ...rest, tracks: plan.tracks.map(({ file, start, duration }) => ({ file, start, duration })), at: new Date().toISOString() };
  await atlas.writeText(`${dirOf(atlas, folder)}/kept.json`, JSON.stringify(kept, null, 1));
  return kept;
}

/** The kept copy given up: to the vault's trash, as every deletion. */
export const forget = (atlas, item, episode) => atlas.trash(dirOf(atlas, folderOf(item, episode)));

// where you were in a kept item on this device, for starting it with no server to ask
const PLACES = "atlas-abs-kept-at";
const places = () => { try { return JSON.parse(localStorage.getItem(PLACES) ?? "{}") ?? {}; } catch { return {}; } };
export const keptPlace = (item, episode) => Number(places()[folderOf(item, episode)]) || 0;
export function rememberPlace(item, episode, at) {
  const all = places(), k = folderOf(item, episode);
  if (Math.abs((all[k] ?? 0) - at) < 10) return; // every 10 s of listening is enough
  all[k] = Math.floor(at);
  try { localStorage.setItem(PLACES, JSON.stringify(all)); } catch { /* the server's place is used then */ }
}
