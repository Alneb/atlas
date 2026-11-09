// The Zstandard plugin's helper: `open` decompresses a vault's `x.tsv.zst` with the machine's zstd (run by the core,
// `atlas.exec`) into `.atlas/cache/plugins/<id>/x.tsv`, the same folders as the original, and answers that path for the
// page to open. Always made afresh (zstd reads ~1 GB/s); the .zst is never written. After each open the cache is pruned
// (copies not opened for `cache_hours`, then the oldest past `cache_mb`) with find/rm/touch: the core's file API has no
// stat and deletes only into the trash. Tests: helper.test.ts.
import type { Params } from "atlas-helper";

const HOUR = 3600;
const MB = 1024 * 1024;

/** The plugin's cache folder, vault-relative. Nothing outside it is ever deleted. */
export function cacheDir(id: string): string {
  return `.atlas/cache/plugins/${id}`;
}

/** Where `x/y.tsv.zst` is read from: `.atlas/cache/plugins/<id>/x/y.tsv` (the name without `.zst` keeps its view). */
export function copyPath(id: string, path: string): string {
  return `${cacheDir(id)}/${path.replace(/\.zst$/i, "")}`;
}

/** A cached copy: its path inside the cache folder, its last open (seconds since the epoch) and its size in bytes. */
export interface Cached { rel: string; mtime: number; size: number }

/** A path that stays inside the cache folder: relative, no empty, `.` or `..` step. */
const inside = (rel: string) => rel !== "" && !rel.split("/").some((p) => p === "" || p === "." || p === "..");

/** `find -printf '%T@\t%s\t%P\0'` read into copies (a malformed or escaping entry is skipped, so never deleted). */
export function parseListing(out: string): Cached[] {
  const files: Cached[] = [];
  for (const entry of out.split("\0")) {
    const [t, s, ...name] = entry.split("\t");
    const rel = name.join("\t");
    const mtime = Number(t), size = Number(s);
    if (inside(rel) && t !== "" && s !== "" && Number.isFinite(mtime) && Number.isFinite(size)) files.push({ rel, mtime, size });
  }
  return files;
}

/** Which copies to delete: those last opened more than `maxAge` seconds before `now`, then the oldest until the rest
 *  weighs at most `maxBytes`. `keep` (the copy just made) is never among them. */
export function victims(files: Cached[], keep: string, now: number, maxAge: number, maxBytes: number): string[] {
  const out: string[] = [];
  const left: Cached[] = [];
  for (const f of files) (f.rel !== keep && now - f.mtime > maxAge ? out.push(f.rel) : left.push(f));
  let total = left.reduce((n, f) => n + f.size, 0);
  for (const f of left.filter((f) => f.rel !== keep).sort((a, b) => a.mtime - b.mtime)) {
    if (total <= maxBytes) break;
    out.push(f.rel);
    total -= f.size;
  }
  return out;
}

/** A limit from the settings: a non-negative number, else its default. */
const limit = (v: unknown, dflt: number) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : dflt);

/** Runs a program for the pruning; its output, or an error with its message. */
async function run(program: string, args: string[]): Promise<string> {
  const r = await atlas.exec(program, args, { locale: "C", timeout: 120 });
  if (r.status !== 0) throw new Error((r.stderr || r.stdout).trim() || `${program} failed (${r.status ?? "killed"})`);
  return r.stdout;
}

/** Deletes old and surplus copies from the cache, then the folders left empty; never `keep` (cache-relative). */
async function prune(keep: string, settings: Record<string, unknown>) {
  const dir = `./${cacheDir(atlas.id)}`;
  // no trailing slash: a cache folder that is a symlink is not followed (find -P), nor one below it
  const files = parseListing(await run("find", [dir, "-type", "f", "-printf", "%T@\\t%s\\t%P\\0"]));
  const gone = victims(files, keep, Date.now() / 1000, limit(settings.cache_hours, 24) * HOUR, limit(settings.cache_mb, 500) * MB);
  for (let i = 0; i < gone.length; i += 200) await run("rm", ["-f", ...gone.slice(i, i + 200).map((rel) => `${dir}/${rel}`)]);
  if (gone.length) await run("find", [dir, "-mindepth", "1", "-type", "d", "-empty", "-delete"]);
}

async function open(params: Params) {
  const path = String(params.path ?? "").trim().replace(/^\/+/, "");
  if (!/[^/]\.zst$/i.test(path)) throw new Error(`not a .zst file: ${path || "(none)"}`);
  if (path.split("/").some((p) => p === ".." || p === ".")) throw new Error(`not a vault path: ${path}`);
  const out = copyPath(atlas.id, path);
  await atlas.write(out, ""); // makes its folders (zstd does not)
  // `./` so a name starting with "-" is never read as an option
  const r = await atlas.exec("zstd", ["-d", "-q", "-f", "-o", `./${out}`, `./${path}`], { locale: "C", timeout: 600 }).catch((e: Error) => {
    throw new Error(/not installed/.test(e.message) ? "zstd is not installed on the machine running Atlas" : e.message);
  });
  if (r.status !== 0) throw new Error((r.stderr || r.stdout).trim() || `zstd failed (${r.status ?? "killed"})`);
  // zstd gives the copy the .zst's mtime: touched, the mtime is the last open, which the pruning goes by. A failure
  // here costs only the pruning, never the open.
  try {
    await run("touch", ["-c", `./${out}`]);
    await prune(out.slice(cacheDir(atlas.id).length + 1), params.settings ?? {});
  } catch (e) {
    console.warn(`zstd: the cache was not pruned: ${(e as Error).message}`);
  }
  return { path: out };
}

atlas.methods({ open });
