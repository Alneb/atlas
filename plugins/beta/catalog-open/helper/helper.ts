// Catalog · Open sources: the keyless sources, one method each (a source of the catalog, or Wikipedia's recognizer).
// The `sources` setting says which are used; one left out answers as if it knew nothing. Tests: <source>.test.ts.
import type { Params } from "atlas-helper";
import * as anime from "./anime";
import * as books from "./books";
import * as music from "./music";
import * as wikipedia from "./wikipedia";
import * as youtube from "./youtube";

export const SOURCES = ["anime", "books", "music", "wikipedia", "youtube"] as const;
type Source = (typeof SOURCES)[number];

/** Whether the vault uses `source`: every one while the setting is unset (or not a list). */
export function uses(params: Params, source: Source): boolean {
  const list = params.settings?.sources;
  return !Array.isArray(list) || list.some((s) => String(s).trim().toLowerCase() === source);
}

/** A lookup that answers only while its source is used. */
const lookup = (source: Source, fn: (p: Params) => Promise<unknown>) => (params: Params) =>
  uses(params, source) ? fn(params) : Promise.resolve({ fields: {}, skipped: `${source} is not in Catalog · Open sources' settings` });

atlas.methods({
  anime: lookup("anime", anime.lookup),
  books: lookup("books", books.lookup),
  music: lookup("music", music.lookup),
  youtube: lookup("youtube", youtube.lookup),
  wikipedia: (params: Params) => (uses(params, "wikipedia") ? wikipedia.recognize(params) : Promise.resolve({ candidates: [] })),
});
