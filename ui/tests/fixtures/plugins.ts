import { copyFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { WS } from "../../playwright.config";

/** The Zip archives library plugin (plugins/beta/zip), which Books and Manga import (`../zip/zip.js`, `requires`).
 *  Copied in and never removed: the specs that need it run in parallel against one vault. */
export function installZipPlugin(): void {
  const dir = join(WS, ".atlas/plugins/zip");
  mkdirSync(dir, { recursive: true });
  for (const f of ["plugin.toml", "zip.js"]) copyFileSync(new URL(`../../../plugins/beta/zip/${f}`, import.meta.url), join(dir, f));
}
