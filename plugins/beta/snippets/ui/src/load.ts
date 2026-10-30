// Reading what a vault says: its modules in .atlas/snippets/, the old file until it is converted, the packs switched on.
import type { PluginApi } from "../../../../../ui/src/lib/plugin-api";
import { builders, compileAll, readLegacy, type Entry, type Loaded, type Problem } from "./format";
import { PACKS } from "./packs";
import * as std from "./std";

export const FOLDER = ".atlas/snippets";
export const CONVERTED = `${FOLDER}/converted.js`;
const dsl = { ...builders, std };

/** A file's text as a module the browser can import, its relative imports pointing at their own. */
async function moduleUrl(atlas: PluginApi, path: string, seen: Map<string, Promise<string>>): Promise<string> {
  const known = seen.get(path);
  if (known) return known;
  const made = (async () => {
    const text = await atlas.readText(path);
    const dir = path.slice(0, path.lastIndexOf("/"));
    const parts: string[] = [];
    let at = 0;
    for (const m of text.matchAll(/(\bfrom\s*|\bimport\s*\(?\s*)(["'])(\.\.?\/[^"']+)\2/g)) {
      const target = new URL(m[3], `file:///${dir}/`).pathname.slice(1);
      parts.push(text.slice(at, m.index), m[1], JSON.stringify(await moduleUrl(atlas, decodeURI(target), seen)));
      at = m.index + m[0].length;
    }
    parts.push(text.slice(at));
    return URL.createObjectURL(new Blob(parts, { type: "text/javascript" }));
  })();
  seen.set(path, made);
  return made;
}

/** One module's entries; a list, or a function given the builders. */
async function readModule(atlas: PluginApi, path: string, seen: Map<string, Promise<string>>): Promise<Entry[]> {
  const url = await moduleUrl(atlas, path, seen);
  const mod = await import(/* @vite-ignore */ url);
  const made = typeof mod.default === "function" ? mod.default(dsl) : mod.default;
  if (!Array.isArray(made)) throw new Error("its default export gives no list of snippets");
  return made.flat(Infinity) as Entry[];
}

export interface Read extends Loaded { fromOldFile: boolean; modules: string[]; oldFile: { sources: string[]; variables: string } | null }

export async function loadAll(atlas: PluginApi): Promise<Read> {
  const files: { source: string; entries: Entry[] }[] = [], problems: Problem[] = [];
  let names: string[] = [];
  // asked first: listing a folder that is not there is a 404 in the page's console
  if (await atlas.exists(FOLDER).catch(() => false)) names = (await atlas.list(FOLDER).catch(() => [])).filter((f) => !f.dir && f.name.endsWith(".js")).map((f) => f.path).sort();
  const seen = new Map<string, Promise<string>>(), modules: string[] = [];
  for (const path of names) {
    // a file with no `export default` is not of this format: an old array of snippets kept in the same folder
    if (!/\bexport\s+default\b/.test(await atlas.readText(path).catch(() => ""))) continue;
    modules.push(path);
    try { files.push({ source: path, entries: await readModule(atlas, path, seen) }); }
    catch (e) { problems.push({ source: path, what: `could not be read: ${String((e as Error).message ?? e)}` }); }
  }
  // the old file until the vault has converted it; route gone or nothing set: none
  const oldFile = await atlas.editor.legacySnippets().catch(() => null);
  const hasOld = !!oldFile?.sources.some((s) => s.trim());
  // converting ends it; a module of your own beside it does not
  const fromOldFile = hasOld && !modules.includes(CONVERTED);
  if (fromOldFile) {
    const legacy = readLegacy(oldFile!);
    files.push({ source: legacy.source, entries: legacy.entries });
    problems.push(...legacy.problems);
  }
  const on = String(atlas.plugin.settings.packs ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  for (const p of PACKS) if (on.includes(p.id)) files.push({ source: `the ${p.title} pack`, entries: p.entries(builders) });
  const compiled = compileAll(files);
  return { ...compiled, problems: [...problems, ...compiled.problems], fromOldFile, modules, oldFile: hasOld ? oldFile : null };
}
