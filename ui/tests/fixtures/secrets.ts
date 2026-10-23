import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { WS } from "../../playwright.config";

/** A plugin's secret as the core stored it — read from the store's files (`${WS}-secrets`, outside the vault), since a
 *  page may not read a secret's value back (403: docs/refactor/REFACTOR-plugins-server-side.md, step 1). */
export function storedSecret(plugin: string, name: string): string | null {
  const dir = `${WS}-secrets`;
  let files: string[] = [];
  try { files = readdirSync(dir).filter((f) => f.endsWith(".json")); } catch { return null; }
  for (const f of files) {
    const table = JSON.parse(readFileSync(join(dir, f), "utf8")) as Record<string, Record<string, string>>;
    const v = table[plugin]?.[name];
    if (v !== undefined) return v;
  }
  return null;
}
