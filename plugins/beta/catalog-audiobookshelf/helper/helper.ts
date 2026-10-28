// Audiobookshelf for the catalog: `lookup` finds a book's audiobook on the user's server (by its Audiobookshelf id, its
// ISBN, else its exact title) and `sync` files the server's book libraries as book notes. Requests go through Atlas's
// core, which puts the API token in; the logic takes its transport, so helper.test.ts runs it on cut-down copies of
// Audiobookshelf's answers (its API: /api/libraries, /api/libraries/<id>/items, …/search, /api/items/<id>).
import type { Params } from "atlas-helper";

const STATE = `.atlas/cache/${atlas.id}.json`;
const PER_RUN = 30; // books filed per sync run: a first run over a big library spreads over a few runs
const RUN_MS = 240_000; // and never longer than this (the tool's timeout is 300 s)

export type Get = (path: string) => Promise<any>;
interface Item { id: string; media?: { duration?: number; metadata?: Record<string, any> } }

/** 3725.4 → "1h 02m": the catalog's legible listening time. */
export function duration(seconds: unknown): string | undefined {
  if (!seconds) return undefined;
  const m = Math.round(Number(seconds) / 60);
  return m >= 60 ? `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m` : `${m}m`;
}

/** Authors or narrators, expanded (`[{name}]`, `["…"]`) or minified (`"A, B"`) → one name, or a list. */
function names(v: unknown): string | string[] | undefined {
  const items = (typeof v === "string" ? v.split(",").map((n) => n.trim()) : ((v as unknown[]) ?? []).map((n) => (n && typeof n === "object" ? (n as { name?: string }).name : n)))
    .filter((n): n is string => typeof n === "string" && !!n.trim());
  return items.length === 1 ? items[0] : items.length ? items : undefined;
}

const isbnOf = (v: unknown) => [...String(v ?? "")].filter((c) => /[\dXx]/.test(c)).join("");

/** A library item → the catalog's {ids, fields}: the audiobook's own details and the link to it. */
export function bookOf(item: Item, server: string) {
  const media = item.media ?? {}, m = media.metadata ?? {};
  const year = String(m.publishedYear ?? "").slice(0, 4);
  const fields: Record<string, unknown> = {
    title: m.title,
    author: names(m.authors ?? m.authorName),
    narrator: names(m.narrators ?? m.narratorName),
    year: /^\d{4}$/.test(year) ? Number(year) : undefined,
    publisher: m.publisher,
    genres: ((m.genres as unknown[]) ?? []).filter((g) => typeof g === "string"),
    description: m.description,
    duration: duration(media.duration),
    audiobook: `${server}/item/${item.id}`,
  };
  const ids: Record<string, string> = { audiobookshelf: item.id };
  const isbn = isbnOf(m.isbn);
  if (isbn.length === 10 || isbn.length === 13) ids.isbn = isbn;
  return { ids, fields: Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined && v !== null && v !== "" && !(Array.isArray(v) && !v.length))) };
}

async function bookLibraries(get: Get): Promise<string[]> {
  return ((await get("/api/libraries"))?.libraries ?? []).filter((l: { mediaType?: string }) => (l.mediaType ?? "book") === "book").map((l: { id: string }) => l.id);
}

/** The item for this book: by its id; else a search per library, kept only on the same ISBN or the same title. */
async function find(get: Get, ids: Record<string, string>, hints: Record<string, unknown>): Promise<Item | null> {
  if (ids.audiobookshelf) return get(`/api/items/${ids.audiobookshelf}?expanded=1`);
  const isbn = ids.isbn, title = String(hints.title ?? "").trim();
  for (const lib of await bookLibraries(get)) {
    for (const q of [isbn, title].filter(Boolean)) {
      for (const hit of (await get(`/api/libraries/${lib}/search?q=${atlas.url.quote(q)}&limit=10`))?.book ?? []) {
        const item: Item = hit.libraryItem ?? {}, m = item.media?.metadata ?? {};
        if ((isbn && isbnOf(m.isbn) === isbn) || (title && String(m.title ?? "").toLowerCase() === title.toLowerCase())) return item;
      }
    }
  }
  return null;
}

const serverOf = (params: Params) => String(params.settings?.server ?? "").replace(/\/+$/, "");
const configured = (params: Params) => Boolean(serverOf(params) && params.secrets?.token);
const NOT_SET = "no Audiobookshelf server or token set (Settings → Catalog · Audiobookshelf)";

export async function lookupWith(get: Get, params: Params) {
  if (!configured(params)) return { fields: {}, skipped: NOT_SET };
  const item = await find(get, (params.ids ?? {}) as Record<string, string>, (params.hints ?? {}) as Record<string, unknown>);
  return item ? bookOf(item, serverOf(params)) : { fields: {}, skipped: "not on your Audiobookshelf" };
}

interface State { done?: Record<string, unknown> }
export interface Sync { get: Get; add(body: object): Promise<unknown>; load(): Promise<State>; save(s: State): Promise<unknown>; clock?: () => number }

/** Files every book of the server's book libraries, PER_RUN at most a run: what is new, or newly finished. `done`:
 *  item id → what was sent, so a run sends only what changed. */
export async function syncWith(io: Sync, params: Params) {
  if (!configured(params)) return { summary: NOT_SET, filed: 0 };
  const clock = io.clock ?? (() => Date.now());
  const server = serverOf(params);
  const shelf = String(params.settings?.finished ?? "[[read]]").trim();
  const finished = new Set(((await io.get("/api/me"))?.mediaProgress ?? []).filter((p: { isFinished?: boolean }) => p.isFinished).map((p: { libraryItemId: string }) => p.libraryItemId));
  const state = (await io.load()) ?? {};
  const done = (state.done ??= {});
  const started = clock(), failed: string[] = [];
  let filed = 0, more = false;
  const outOfRun = () => filed >= PER_RUN || clock() - started >= RUN_MS;
  for (const lib of await bookLibraries(io.get)) {
    let page = 0, hasMore = true;
    while (hasMore && !outOfRun()) {
      const r = (await io.get(`/api/libraries/${lib}/items?limit=50&page=${page}`)) ?? {};
      hasMore = (page + 1) * 50 < Number(r.total ?? 0);
      page++;
      for (const item of (r.results ?? []) as Item[]) {
        if (outOfRun()) { more = true; break; }
        const own = shelf && finished.has(item.id) ? { status: shelf } : {};
        const sent = JSON.stringify({ own });
        if (JSON.stringify(done[item.id]) === sent && !params.all) continue;
        const book = bookOf(item, server);
        try {
          await io.add({ text: book.fields.title ?? book.fields.audiobook, kind: "book", ids: book.ids, own });
          done[item.id] = { own };
          filed++;
        } catch (e) { // one book failing never stops the others; said in the summary
          failed.push(`${book.fields.title ?? item.id}: ${e instanceof Error ? e.message : e}`);
        }
      }
    }
    more = more || hasMore;
  }
  await io.save(state);
  const summary = `${filed} audiobook${filed === 1 ? "" : "s"} filed from Audiobookshelf${more ? ", more next run" : ""}${failed.length ? `; ${failed.length} failed (${failed[0]})` : ""}`;
  return { summary, filed, failed };
}

/** The server's API, the token put in by the core (the helper never holds it). */
const transport = (params: Params): Get => (path) => atlas.fetchJson(`${serverOf(params)}${path}`, { headers: { Authorization: { secret: "token", prefix: "Bearer " } } });

atlas.methods({
  lookup: (params) => lookupWith(transport(params), params),
  sync: (params) => syncWith({
    get: transport(params),
    add: (body) => atlas.post("/api/plugins/catalog/tools/add", body),
    load: async () => { try { return JSON.parse(await atlas.read(STATE)); } catch { return {}; } },
    save: (s) => atlas.write(STATE, JSON.stringify(s, null, 1)),
  }, params),
});
