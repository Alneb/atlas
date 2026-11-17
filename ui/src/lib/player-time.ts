// A player's arithmetic over an item's time, without a page (lib/player.svelte.ts uses it; the phone's service has the
// same rules in Java, PlayerTimeline.java; ui/tests/player.spec.ts tests both sides' cases).

/** One file of the item; `start`: where it begins in the item's time (seconds). */
export interface PlayerTrack { src: string; start: number; duration: number }
export interface PlayerChapter { start: number; end: number; title: string }
/** A time in seconds as a player shows it: `1:02:05`, `4:07`. (`long`: a length, `5h 03m`, `42m`.) */
export function clockOf(s: number, long = false): string {
  s = Math.max(0, Math.floor(s));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  if (long) return h ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}m`;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}` : `${m}:${String(sec).padStart(2, "0")}`;
}

/** The track holding time `t` of the item (tracks sorted by start) and where in it; past the end, the last track's end. */
export function placeOf(tracks: PlayerTrack[], t: number): { i: number; offset: number } {
  let i = tracks.findIndex((x) => t >= x.start && t < x.start + x.duration);
  if (i < 0) i = t < (tracks[0]?.start ?? 0) ? 0 : tracks.length - 1;
  return { i, offset: Math.max(0, t - (tracks[i]?.start ?? 0)) };
}
export const chapterAt = (chapters: PlayerChapter[], t: number) => chapters.findIndex((c) => t >= c.start && t < c.end);
/** Where "previous" goes: the chapter's start, or the one before when within its first 3 s (a player's habit). */
export function previousChapter(chapters: PlayerChapter[], t: number): number | null {
  const c = chapterAt(chapters, t);
  if (c < 0) return null;
  return t - chapters[c].start > 3 || c === 0 ? chapters[c].start : chapters[c - 1].start;
}
export function nextChapter(chapters: PlayerChapter[], t: number): number | null {
  const c = chapterAt(chapters, t);
  return c >= 0 && c + 1 < chapters.length ? chapters[c + 1].start : null;
}

/** The time a link's fragment names — `t=1:02:03`, `t=4:07`, `t=83.5` (the media-fragment form Obsidian's media
 *  plugins write) — in seconds, or null when it names no time. */
export function timeOfFragment(fragment: string): number | null {
  const m = /^t=(?:(\d+):)?(?:(\d+):)?(\d+(?:\.\d+)?)$/.exec(fragment.trim());
  if (!m) return null;
  const [h, mi] = m[2] !== undefined ? [Number(m[1]), Number(m[2])] : [0, Number(m[1] ?? 0)];
  return h * 3600 + mi * 60 + Number(m[3]);
}

/** How a link names the playing thing: a note by its name, another file (a film in the vault) with its extension. */
const linkName = (path: string) => (/\.md$/i.test(path) ? path.replace(/\.md$/i, "").split("/").pop()! : path);

/** The time now, as a link into what plays when it has a note or a file; else the bare clock. */
export function timeLink(s: { at: number; note?: string }): string {
  const t = clockOf(s.at);
  return s.note ? `[[${linkName(s.note)}#t=${t}]]` : t;
}

/** Whether typing `inserted` into a line that read `before` starts the line, so it gets the time first
 *  (`[player] stamp_lines`): an empty line, or one that is only a list or quote marker. Not a line break, not a space. */
export function startsLine(before: string, inserted: string): boolean {
  if (!inserted || /^\s/.test(inserted) || inserted.includes("\n")) return false;
  return /^[ \t]*(?:(?:[-*+]|\d+[.)])[ \t]+(?:\[.\][ \t]+)?|>[ \t]?)*$/.test(before);
}
