// Audiobookshelf's catalog side (the library and the player are the page's: main.js, view.js): `lookup` finds a book's
// audiobook on the user's server (by its Audiobookshelf id, its ISBN, else its exact title) and `sync` files the books
// you started or finished there as book notes (the catalog's one-note rule). Requests go through Atlas's core, which puts the API token in; the logic takes
// its transport, so helper.test.ts runs it on cut-down copies of Audiobookshelf's answers (its API: /api/libraries,
// /api/libraries/<id>/items, …/search, /api/items/<id>).
import type { Params } from "atlas-helper";
import { playBody } from "../abs.js";

const STATE = `.atlas/cache/${atlas.id}.json`;
/** Player reports the server could not take (offline), kept until it answers again: a file of their own, so the
 *  catalog's `sync` and the player's reports never write over each other. */
const PENDING = `.atlas/cache/${atlas.id}-pending.json`;
/** The books a report has already sent to the catalog's `note` (noteWhenYours). */
const NOTED = `.atlas/cache/${atlas.id}-noted.json`;
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
const NOT_SET = "no Audiobookshelf server or token set (Settings → Plugins → Audiobookshelf)";

export async function lookupWith(get: Get, params: Params) {
  if (!configured(params)) return { fields: {}, skipped: NOT_SET };
  const item = await find(get, (params.ids ?? {}) as Record<string, string>, (params.hints ?? {}) as Record<string, unknown>);
  return item ? bookOf(item, serverOf(params)) : { fields: {}, skipped: "not on your Audiobookshelf" };
}

interface State { done?: Record<string, unknown> }
/** The catalog's two tools: `note` (the one-note rule: found, or made once the book is yours) and `add` (only to put
 *  the finished shelf on a note that was already there: `note` gives a found note its IDs, nothing of the user's). */
export interface Sync { get: Get; note(body: object): Promise<{ path?: string | null; made?: boolean } | unknown>; add(body: object): Promise<unknown>; load(): Promise<State>; save(s: State): Promise<unknown>; clock?: () => number }
/** Past its start, as the catalog counts it (thing.rs `PAST_START`): asked only of what can already be yours. */
const PAST_START = 0.01;
interface Progress { libraryItemId: string; episodeId?: string | null; progress?: number; isFinished?: boolean }

/** Files the books you have made yours on the server — listened past the start, or finished — PER_RUN at most a run,
 *  through the catalog's one-note rule (DESIGN-server-libraries.md §3): a book you never started gets no note. `done`:
 *  item id → what was sent, so a run sends only what changed (a book newly finished is sent again). */
export async function syncWith(io: Sync, params: Params) {
  if (!configured(params)) return { summary: NOT_SET, filed: 0 };
  const clock = io.clock ?? (() => Date.now());
  const server = serverOf(params);
  const shelf = String(params.settings?.finished ?? "[[read]]").trim();
  // a podcast's episodes are not books; what is barely begun is not yours yet
  const yours = (((await io.get("/api/me"))?.mediaProgress ?? []) as Progress[])
    .filter((p) => p.libraryItemId && !p.episodeId && (p.isFinished || Number(p.progress ?? 0) >= PAST_START));
  const state = (await io.load()) ?? {};
  const done = (state.done ??= {});
  const started = clock(), failed: string[] = [];
  let filed = 0, more = false;
  for (const p of yours) {
    if (filed >= PER_RUN || clock() - started >= RUN_MS) { more = true; break; }
    const own = shelf && p.isFinished ? { status: shelf } : {};
    const why = p.isFinished ? "finished" : "progress";
    const sent = { own, why };
    if (JSON.stringify(done[p.libraryItemId]) === JSON.stringify(sent) && !params.all) continue;
    let title = p.libraryItemId;
    try {
      const item = (await io.get(`/api/items/${atlas.url.quote(p.libraryItemId)}?expanded=1`)) as Item | null;
      if (!item?.id) { done[p.libraryItemId] = sent; continue; } // gone from the server: nothing to file
      const book = bookOf(item, server);
      title = String(book.fields.title ?? title);
      const got = (await io.note({ kind: "book", ids: book.ids, fields: book.fields, own, why, ...(why === "progress" ? { progress: Number(p.progress) } : {}) })) as { path?: string | null; made?: boolean } | null;
      if (got?.path && !got.made && Object.keys(own).length) await io.add({ text: title, kind: "book", ids: book.ids, own });
      done[p.libraryItemId] = sent;
      filed++;
    } catch (e) { // one book failing never stops the others; said in the summary
      failed.push(`${title}: ${e instanceof Error ? e.message : e}`);
    }
  }
  await io.save(state);
  const summary = `${filed} audiobook${filed === 1 ? "" : "s"} you started or finished filed from Audiobookshelf${more ? ", more next run" : ""}${failed.length ? `; ${failed.length} failed (${failed[0]})` : ""}`;
  return { summary, filed, failed };
}

/** What the app's player reports while it plays a book (`atlas.player`, the manifest's `[media] progress`), every 15 s,
 *  on pause, at the end and when closed — also with no page open (the phone's player plays on with the screen off).
 *  `key`: what the page gave the player (the item, a podcast's episode, the play session, this device); `listened`: seconds of listening
 *  by the clock since the last report this answered (the player keeps them until one is answered). */
export interface Report { key?: { item?: string; episode?: string; session?: string; device?: string }; at?: number; duration?: number; listened?: number; state?: "playing" | "paused" | "ended" | "closed" }
/** A POST to the server: its text, or null when it answered 404 (a session it no longer knows). */
export type Post = (path: string, body: object) => Promise<string | null>;

/** A listening the server did not get (offline), in the shape of Audiobookshelf's local sessions
 *  (`POST /api/session/local`, what its own apps send after listening to a download): the place, the time listened,
 *  when it began and ended. Kept per item (or episode) until sent. */
export interface LocalSession {
  id: string; libraryItemId: string; episodeId?: string; mediaType: "book" | "podcast"; playMethod: 3; mediaPlayer: "html5";
  deviceInfo: { clientName: string; deviceId: string }; duration: number; currentTime: number; timeListening: number; startedAt: number; updatedAt: number;
}
export type Pending = Record<string, LocalSession>;
/** Where the pending sessions are kept (the helper's cache file; the tests' memory). */
export interface Queue { load(): Promise<Pending>; save(p: Pending): Promise<void>; clock?: () => number }

/** An error of the way to the server (no network, no answer), not one of the server's answers: the report is kept. */
export const unreachable = (e: unknown) => /error sending request|connect|dns|timed? ?out|unreachable|network/i.test(String((e as Error)?.message ?? e));

/** The report added to its item's pending session (made when none): the time listened summed, the place the last. */
async function queued(queue: Queue, of: { item: string; episode?: string }, device: string, body: { currentTime: number; timeListened: number; duration: number }) {
  const now = (queue.clock ?? Date.now)(), all = await queue.load(), k = `${of.item}/${of.episode ?? ""}`, was = all[k];
  all[k] = {
    id: was?.id ?? `${device}-${of.item}-${now}`, libraryItemId: of.item, ...(of.episode ? { episodeId: of.episode } : {}),
    mediaType: of.episode ? "podcast" : "book", playMethod: 3, mediaPlayer: "html5", deviceInfo: { clientName: "Atlas", deviceId: device },
    duration: body.duration || was?.duration || 0, currentTime: body.currentTime, timeListening: (was?.timeListening ?? 0) + body.timeListened,
    startedAt: was?.startedAt ?? now - body.timeListened * 1000, updatedAt: now,
  };
  await queue.save(all);
}

/** The kept sessions sent, once the server answers again; one it refuses (404: an item gone) is dropped, one it
 *  cannot be reached for stays. */
async function flush(post: Post, queue: Queue) {
  const all = await queue.load();
  const keys = Object.keys(all);
  if (!keys.length) return;
  for (const k of keys) {
    try { await post("/api/session/local", all[k]); delete all[k]; }
    catch (e) { if (unreachable(e)) break; delete all[k]; }
  }
  await queue.save(all);
}

/** Where you are, to the server's play session: synced (closed at the end of the player's run). A session the server no
 *  longer knows (it ended it, or restarted) — or none yet — is opened again and the report sent there; the answer's
 *  `key` then carries the new session, and the player sends that from then on. With the server out of reach (a kept
 *  download played offline) the report is kept in `queue` and sent as a local session once a later report gets
 *  through. */
export async function progressWith(post: Post, params: Params & Report, queue?: Queue) {
  if (!configured(params)) return { skipped: NOT_SET };
  const { item, episode, device = "atlas" } = params.key ?? {};
  if (!item) throw new Error("a report with no book (key.item)");
  const of = episode ? { item, episode } : { item }; // a podcast's episode is played (and opened again) as itself
  const body = {
    currentTime: Math.max(0, Number(params.at) || 0),
    timeListened: Math.max(0, Math.round(Number(params.listened) || 0)),
    duration: Math.max(0, Number(params.duration) || 0),
  };
  const closing = params.state === "closed";
  try {
    const answer = await reported(post, closing, body, of, device, params.key?.session);
    if (queue) await flush(post, queue);
    return answer;
  } catch (e) {
    if (!queue || !unreachable(e)) throw e;
    await queued(queue, of, device, body);
    return { key: { ...of, device }, queued: true }; // no session: the next report opens one when the server is back
  }
}

/** What files a played book's note: the catalog's `note` tool, and the items already sent to it (kept per vault). */
export interface Noting { note(body: object): Promise<unknown>; get: Get; /** the catalog runs here */ ready(): Promise<boolean>; load(): Promise<string[]>; save(ids: string[]): Promise<unknown> }

/** The book's note, made the moment a report says it became yours — listened past the start, or played to the end —
 *  through the catalog's one-note rule, on the desktop and the phone alike (both players report here). Once per book:
 *  later reports ask nothing. A podcast's episode is not a book; a failure waits for the next report (or `sync`). */
export async function noteWhenYours(io: Noting, params: Params & Report): Promise<string | null> {
  const { item, episode } = params.key ?? {};
  const length = Number(params.duration) || 0, at = Number(params.at) || 0;
  const ended = params.state === "ended";
  if (!item || episode || !configured(params) || !(ended || (length > 0 && at / length >= PAST_START))) return null;
  const sent = await io.load().catch(() => [] as string[]);
  if (sent.includes(item) || !(await io.ready())) return null;
  const got = await io.get(`/api/items/${atlas.url.quote(item)}?expanded=1`).catch(() => null) as Item | null;
  if (!got?.id) return null;
  const book = bookOf(got, serverOf(params));
  const why = ended ? { why: "finished" } : { why: "progress", progress: at / length };
  const r = await io.note({ kind: "book", ids: book.ids, fields: book.fields, ...why }) as { path?: string | null } | null;
  await io.save([...sent, item].slice(-500));
  return r?.path ?? null;
}

/** One report sent to its session, opened again when the server lost it: the key the player sends from then on. */
async function reported(post: Post, closing: boolean, body: { currentTime: number; timeListened: number; duration: number }, of: { item: string; episode?: string }, device: string, known?: string) {
  const { item, episode } = of;
  const send = (session: string) => post(`/api/session/${atlas.url.quote(session)}/${closing ? "close" : "sync"}`, body);
  let session = known;
  if (session && (await send(session)) !== null) return { key: { ...of, session, device } };
  if (closing) return { key: { ...of, device } }; // gone already: nothing left to close
  const play = `/api/items/${atlas.url.quote(item)}/play${episode ? `/${atlas.url.quote(episode)}` : ""}`;
  const opened = JSON.parse((await post(play, playBody(device))) ?? "null");
  if (!opened?.id) throw new Error("Audiobookshelf opened no play session");
  session = String(opened.id);
  if ((await send(session)) === null) throw new Error("Audiobookshelf lost the session it just opened");
  return { key: { ...of, session, device } };
}

/** The server's API, the token put in by the core (the helper never holds it). */
const transport = (params: Params): Get => (path) => atlas.fetchJson(`${serverOf(params)}${path}`, { headers: { Authorization: { secret: "token", prefix: "Bearer " } } });

/** Whether the catalog can run in this vault: the library and the player work without it, `sync` files nothing then. */
async function catalogRuns(): Promise<boolean> {
  const all = ((await atlas.get("/api/plugins").catch(() => [])) ?? []) as { provides?: string[]; blocked?: string | null; error?: string | null }[];
  return all.some((p) => (p.provides ?? []).includes("catalog") && !p.blocked && !p.error);
}

const poster = (params: Params): Post => (path, body) =>
  atlas.fetch(`${serverOf(params)}${path}`, { method: "POST", body, headers: { Authorization: { secret: "token", prefix: "Bearer " } } });

const noting = (params: Params): Noting => ({
  note: (body) => atlas.post("/api/plugins/@catalog/tools/note", body),
  get: transport(params),
  ready: catalogRuns,
  load: async () => { try { return JSON.parse(await atlas.read(NOTED)) as string[]; } catch { return []; } },
  save: (ids) => atlas.write(NOTED, JSON.stringify(ids)),
});

/** The player's reports kept while the server is out of reach. */
const pending: Queue = {
  load: async () => { try { return JSON.parse(await atlas.read(PENDING)) as Pending; } catch { return {}; } },
  save: async (p) => { await atlas.write(PENDING, JSON.stringify(p, null, 1)); },
};

atlas.methods({
  progress: async (params) => {
    const answer = await progressWith(poster(params), params as Params & Report, pending);
    await noteWhenYours(noting(params), params as Params & Report).catch(() => null); // never fails the report
    return answer;
  },
  lookup: (params) => lookupWith(transport(params), params),
  sync: async (params) => (!(await catalogRuns()) ? { summary: "the catalog is not on: nothing filed", filed: 0 } : syncWith({
    get: transport(params),
    // whichever plugin is the catalog (its role)
    note: (body) => atlas.post("/api/plugins/@catalog/tools/note", body),
    add: (body) => atlas.post("/api/plugins/@catalog/tools/add", body),
    load: async () => { try { return JSON.parse(await atlas.read(STATE)); } catch { return {}; } },
    save: (s) => atlas.write(STATE, JSON.stringify(s, null, 1)),
  }, params)),
});
