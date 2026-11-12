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

/** copyparty's `pw` header from the server's password (filled in by the core), when it has one. */
async function password(s: Server) {
  return (await atlas.secret(`servers.${s.name}.password`)) ? { pw: { secret: `servers.${s.name}.password` } } : undefined;
}

async function ls(s: Server, dir: string): Promise<Entry[]> {
  const at = abs(dir).replace(/\/*$/, "/");
  const pw = await password(s);
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

/** The plugin that keeps the references (`provides = ["references"]`), as the page finds it; null without one. */
async function referencesPlugin(): Promise<string | null> {
  const all = await atlas.get<{ id: string; provides?: string[]; has_helper?: boolean; blocked?: boolean }[]>("/api/plugins").catch(() => []);
  return all.find((p) => p.provides?.includes("references") && p.has_helper && !p.blocked)?.id ?? null;
}

/** A PDF on a server with a password: the catalog's own fetch has no key to it (the password is this plugin's secret),
 *  so it is downloaded here with the password, moved into the references plugin's cache and filed by its `import`, as
 *  a PDF dropped on the page is (read for its identifiers, named by its file, the address kept as `url`). */
async function fileBehindPassword(s: Server, path: string, url: string, pw: object, refs: string) {
  const name = path.slice(path.lastIndexOf("/") + 1);
  const got = await atlas.download(url, `file-${Date.now()}.pdf`, { headers: pw as Record<string, never>, timeout: 300 });
  if (!got.ok || !got.saved) throw new Error(`${s.name}: ${path}: ${got.status === 403 || got.status === 401 ? "the password was refused" : `HTTP ${got.status}`}`);
  if (!got.head.startsWith("%PDF")) throw new Error(`${s.name}: ${path} did not come back as a PDF (a sign-in in front of it?)`);
  const at = `.atlas/cache/plugins/${refs}/import-${Date.now()}-${name.replace(/[^\w.-]+/g, "_")}`;
  await atlas.post("/api/fs/move", { from: got.saved, to: at });
  const r = await atlas.post<{ paper: { dir: string; kind: string }; created: boolean }>(
    `/api/plugins/${refs}/helper`, { method: "import", params: { path: at, name, url, keep_name: true }, timeout_secs: 300 });
  const dir = r.paper.dir.replace(/\/+$/, ""); // an entry's note: <dir>/<its folder's name>.md
  return { url, note: `${dir}/${dir.slice(dir.lastIndexOf("/") + 1)}.md`, kind: r.paper.kind, outcome: r.created ? "filed" : "already in the library" };
}

async function file(params: Params) {
  const s = serverOf(params);
  if (typeof params.path !== "string" || !params.path.trim()) throw new Error("`path`: the file on the server, as `list` shows it");
  const url = fileUrl(s, params.path);
  const pw = await password(s), refs = pw && /\.pdf$/i.test(params.path) ? await referencesPlugin() : null;
  if (pw && refs) return fileBehindPassword(s, params.path, url, pw, refs);
  const r = await atlas.post<{ path?: string; outcome?: string; kind?: string; steps?: unknown }>("/api/plugins/catalog/tools/add", { text: url });
  return { url, note: r.path, kind: r.kind, outcome: r.outcome, steps: r.steps };
}

atlas.methods({ list, file });
