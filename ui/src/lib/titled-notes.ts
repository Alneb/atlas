// Notes found by their title or an alias (a paper by the words of its title), from the core's [[ list
// (link_targets.rs): what a search by file name misses. Ctrl+P and the Search pane both list them.
import { api } from "./api";

export type Titled = { path: string; title: string };

/** Notes whose title or alias matches `query` (asked beside the name search; `besides` drops what it found). */
export async function titledNotes(query: string): Promise<Titled[]> {
  if (query.trim().length < 3 || /^tag:/i.test(query.trim())) return [];
  const hits = await api.linkTargets(query).catch(() => []);
  // a title as written in Zotero may carry <i>…</i>: shown as text
  return hits.flatMap((x) => (x.alias ? [{ path: x.path, title: x.alias.replace(/<[^>]+>/g, "") }] : []));
}

/** The first `n` of `titled` that the name search did not already list. */
export const besides = (titled: Titled[], found: readonly string[], n = 8): Titled[] => titled.filter((x) => !found.includes(x.path)).slice(0, n);
