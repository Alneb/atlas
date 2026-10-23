// A plugin's own files by URL (core plugin_files.rs; docs/guides/PLUGIN-API.md "A plugin's own files"): its modules,
// fonts, pictures and workers at `<api>/plugin-files/<rev>/<vault path>`. The URL is the vault path, so the browser
// resolves a module's relative imports itself — static, dynamic, `new URL("x", import.meta.url)`, a sibling plugin's
// `../zip/zip.js` — and `<rev>` changes on every change under `.atlas/plugins/`: ES modules are kept by URL for the
// page's life, so a reloaded plugin needs new URLs to get its new code.
import { apiBase } from "./api";
import { on } from "./bus";

const PLUGINS = ".atlas/plugins/";
const INIT = ".atlas/init.js";
let rev = 0;
// at module load, before any pane or plugin start listens: they reload on the same event and must see the new rev
on("fs", (e) => { if (e.paths.some((p) => p.startsWith(PLUGINS) || p === INIT)) rev++; });

const encodePath = (path: string) => path.split("/").map(encodeURIComponent).join("/");

/** The URL of a vault file the core serves to plugins (`.atlas/plugins/<id>/…`, `.atlas/init.js`), at this revision. */
export function pluginFileUrl(path: string): string {
  return `${apiBase()}/plugin-files/${rev.toString(36)}/${encodePath(path)}`;
}

/** `rel` inside plugin `id`'s folder → its URL (`fonts/` ending in "/": a folder's, as a base for a library that fetches
 *  its own files); a path leading out of the folder is refused here, as the core does. */
export function pluginAssetUrl(id: string, rel: string): string {
  const clean = String(rel).replace(/^\.\//, "");
  if (!clean || clean.startsWith("/") || clean.replace(/\/$/, "").split("/").some((s) => !s || s.startsWith("."))) {
    throw new Error(`assetUrl(${JSON.stringify(rel)}): a path inside the plugin's folder, without "..", "." or hidden parts`);
  }
  return pluginFileUrl(`${PLUGINS}${id}/${clean}`);
}
