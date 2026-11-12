// copyparty for agents (the `list` and `file` tools): the same servers as the explorer (Settings → copyparty), read
// through copyparty's own HTTP API in the core (`?ls` answers a folder as JSON). `list` shows a folder, or finds files
// by the words of their names under it (a walk of at most WALK folders, nearest first); `file` hands a file's address
// to the catalog, which files it as it files any link (a PDF: downloaded, read for its identifiers or its first page,
// a paper or a book with its file). Tests: helper.test.ts.
import type { Params } from "atlas-helper";

interface Server { name: string; url: string }
interface Entry { name: string; kind: "dir" | "file"; size?: number; path: string }

/** The most folders a search walks: a library of books is a few hundred. */
export const WALK = 300;

export function servers(params: Params): Server[] {
  const list = params.settings?.servers;
  return (Array.isArray(list) ? list : [])
    .filter((s): s is Server => !!s && typeof s.name === "string" && typeof s.url === "string" && !!s.url.trim())
    .map((s) => ({ name: s.name, url: s.url.trim().replace(/\/+$/, "") }));
}

function serverOf(params: Params): Server {
  const all = servers(params), want = typeof params.server === "string" ? params.server : "";
  const s = want ? all.find((x) => x.name === want) : all[0];
  if (!s) throw new Error(all.length ? `no copyparty server “${want}”: ${all.map((x) => x.name).join(", ")}` : "no copyparty server in Settings → copyparty");
  return s;
}

const enc = (p: string) => p.split("/").map(encodeURIComponent).join("/");
const abs = (p: string) => `/${p.replace(/^\/+/, "")}`;
/** A file's address on its server (what the catalog fetches, and what a note links to). */
export const fileUrl = (s: Server, path: string) => `${s.url}${enc(abs(path))}`;

async function ls(s: Server, dir: string): Promise<Entry[]> {
  const at = abs(dir).replace(/\/*$/, "/");
  const pw = (await atlas.secret(`servers.${s.name}.password`)) ? { pw: { secret: `servers.${s.name}.password` } } : undefined;
  const text = await atlas.fetch(`${s.url}${enc(at)}?ls&dots`, { headers: { accept: "application/json", ...pw }, timeout: 60 });
  let j: { dirs?: { href?: string; sz?: number }[]; files?: { href?: string; sz?: number }[] };
  try { j = JSON.parse(text ?? ""); } catch { throw new Error(`${s.name}: ${at} did not answer with a folder listing (a sign-in in front of it?)`); }
  const name = (href = "") => { const h = href.split("?")[0].replace(/\/+$/, ""); const last = h.slice(h.lastIndexOf("/") + 1); try { return decodeURIComponent(last); } catch { return last; } };
  const entry = (e: { href?: string; sz?: number }, kind: Entry["kind"]): Entry => ({ name: name(e.href), kind, size: kind === "file" ? e.sz : undefined, path: `${at}${name(e.href)}` });
  return [...(j.dirs ?? []).map((e) => entry(e, "dir")), ...(j.files ?? []).map((e) => entry(e, "file"))].filter((e) => e.name && e.name !== "." && e.name !== "..");
}

/** Whether a name has every word of the query (case and accents aside; `_`, `-`, `.` count as spaces). */
export function matches(name: string, query: string): boolean {
  const plain = (t: string) => t.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[_\-.]+/g, " ");
  const n = plain(name);
  return plain(query).split(/\s+/).filter(Boolean).every((w) => n.includes(w));
}

async function list(params: Params) {
  const s = serverOf(params), path = typeof params.path === "string" && params.path ? params.path : "/";
  const query = typeof params.query === "string" ? params.query.trim() : "";
  const shown = (e: Entry) => ({ ...e, url: e.kind === "file" ? fileUrl(s, e.path) : undefined });
  if (!query) return { server: s.name, path: abs(path), entries: (await ls(s, path)).map(shown) };
  // nearest first: a folder's own files before its subfolders'
  const found: Entry[] = [], queue = [abs(path)];
  let walked = 0;
  while (queue.length && walked < WALK && found.length < 50) {
    const dir = queue.shift()!;
    walked++;
    let entries: Entry[];
    try { entries = await ls(s, dir); } catch { continue; } // a folder it may not read: the others still answer
    for (const e of entries) {
      if (matches(e.name, query)) found.push(e);
      if (e.kind === "dir") queue.push(e.path);
    }
  }
  return { server: s.name, path: abs(path), query, found: found.map(shown), walked, ...(queue.length && walked >= WALK ? { more: `stopped after ${WALK} folders: search under a narrower path` } : {}) };
}

async function file(params: Params) {
  const s = serverOf(params);
  if (typeof params.path !== "string" || !params.path.trim()) throw new Error("`path`: the file on the server, as `list` shows it");
  const url = fileUrl(s, params.path);
  const r = await atlas.post<{ path?: string; outcome?: string; kind?: string; steps?: unknown }>("/api/plugins/catalog/tools/add", { text: url });
  return { url, note: r.path, kind: r.kind, outcome: r.outcome, steps: r.steps };
}

atlas.methods({ list, file });
