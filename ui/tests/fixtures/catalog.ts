import { readFileSync } from "node:fs";
import type { APIRequestContext } from "@playwright/test";

// The Catalog plugin as the test vault holds it (playwright.config.ts): its pane, the Libraries page (view.js, built
// from its ui/), under its manifest's top keys — no helper, no tools, no main.js, so it asks nothing of a helper the
// tests do not have. A spec that needs its kinds or blocks puts main.js and a stand-in helper with `withCatalog`, and
// gives the vault's copy back with `restoreCatalog`. No import of the config: the config imports this.
const H = { "x-atlas": "1" };
export const CATALOG_DIR = ".atlas/plugins/catalog";
export const catalogFile = (f: string): string => readFileSync(new URL(`../../../plugins/beta/catalog/${f}`, import.meta.url), "utf8");
/** The manifest's keys before its first table (title, rail, provides…), then `more`. */
export const catalogManifest = (more = ""): string => `${catalogFile("plugin.toml").split(/\n\[/)[0].trimEnd()}\n${more}`;
/** The vault's copy: the page's role only — as "catalog" it would file every capture's link through a helper the tests
 *  do not have (catalog_hint.rs, `@catalog` calls). */
const pageManifest = (): string => catalogManifest().replace(/^provides = .*$/m, 'provides = ["libraries"]');
/** The files the test vault starts with. */
export const catalogFixture = (): Record<string, string> => ({ [`${CATALOG_DIR}/plugin.toml`]: pageManifest(), [`${CATALOG_DIR}/view.js`]: catalogFile("view.js") });

const put = (request: APIRequestContext, path: string, text: string) => request.put("/api/file", { headers: H, data: { path, text } });

/** The plugin with its main.js (and `files`, by name) and a Python stand-in for its helper. */
export async function withCatalog(request: APIRequestContext, helperPy: string, files: string[] = ["main.js"]): Promise<void> {
  await put(request, `${CATALOG_DIR}/helper.py`, helperPy);
  for (const f of files) await put(request, `${CATALOG_DIR}/${f}`, catalogFile(f));
  await put(request, `${CATALOG_DIR}/plugin.toml`, catalogManifest(`\n[helper]\nrun = "python3 -u \\"$ATLAS_PLUGIN_DIR/helper.py\\""\n`));
}

/** Back to the vault's copy: the helper stopped, what `withCatalog` added gone (left, main.js asked a missing helper on
 *  every later page). */
export async function restoreCatalog(request: APIRequestContext, files: string[] = ["main.js"]): Promise<void> {
  await request.post("/api/plugins/catalog/helper/stop", { headers: H });
  await put(request, `${CATALOG_DIR}/plugin.toml`, pageManifest());
  for (const f of ["helper.py", ...files]) await request.post(`/api/fs/trash?path=${encodeURIComponent(`${CATALOG_DIR}/${f}`)}`, { headers: H });
}
