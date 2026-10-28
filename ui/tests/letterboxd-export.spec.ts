import { test, expect } from "@playwright/test";
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { crc32 } from "node:zlib";
import { WS } from "../playwright.config";

// catalog-letterboxd's palette command: the vault's export found by its shape, picked, read into the sync's state
// (the helper's `import_export`, in the core), then one sync at once. Its `requires = ["catalog"]` is dropped here: the import itself
// needs no catalog, and the sync with no username says where to set it.
const PLUGIN = join(WS, ".atlas/plugins/catalog-letterboxd");
const ZIP = join(WS, "letterboxd-someone-2026-10-27-utc.zip");
const STATE = join(WS, ".atlas/cache/catalog-letterboxd.json");

test.beforeAll(() => {
  mkdirSync(PLUGIN, { recursive: true });
  for (const f of ["main.js", "helper.js"]) copyFileSync(new URL(`../../plugins/beta/catalog-letterboxd/${f}`, import.meta.url), join(PLUGIN, f));
  const toml = readFileSync(new URL("../../plugins/beta/catalog-letterboxd/plugin.toml", import.meta.url), "utf8");
  writeFileSync(join(PLUGIN, "plugin.toml"), toml.replace(/^requires = .*$/m, ""));
  const files = {
    "watched.csv": "Date,Name,Year,Letterboxd URI\n2019-01-05,The Realm,2018,https://boxd.it/aaaa\n2026-04-01,Dune: Part Two,2024,https://boxd.it/bbbb\n",
    "ratings.csv": "Date,Name,Year,Letterboxd URI,Rating\n2026-05-02,The Realm,2018,https://boxd.it/aaaa,4.5\n",
    "diary.csv": "Date,Name,Year,Letterboxd URI,Rating,Rewatch,Tags,Watched Date\n2026-04-01,Dune: Part Two,2024,https://boxd.it/d3,3.5,,,2026-04-01\n",
  };
  writeFileSync(ZIP, storedZip(files));
  rmSync(STATE, { force: true });
});
/** A zip of `files`, stored (not compressed): the export's shape with nothing to install. */
function storedZip(files: Record<string, string>): Buffer {
  const parts: Buffer[] = [], dir: Buffer[] = [];
  let at = 0;
  for (const [name, text] of Object.entries(files)) {
    const data = Buffer.from(text), n = Buffer.from(name), crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(n.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20); central.writeUInt32LE(data.length, 24); central.writeUInt16LE(n.length, 28); central.writeUInt32LE(at, 42);
    parts.push(local, n, data);
    dir.push(central, n);
    at += 30 + n.length + data.length;
  }
  const size = dir.reduce((s, b) => s + b.length, 0), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(dir.length / 2, 8); end.writeUInt16LE(dir.length / 2, 10);
  end.writeUInt32LE(size, 12); end.writeUInt32LE(at, 16);
  return Buffer.concat([...parts, ...dir, end]);
}
test.afterAll(() => {
  rmSync(PLUGIN, { recursive: true, force: true });
  rmSync(ZIP, { force: true });
  rmSync(STATE, { force: true });
});

test("Letterboxd: import your export… lists the vault's export and reads its films for the syncs", async ({ page }) => {
  const errs: string[] = [];
  page.on("pageerror", (e) => errs.push(e.message));
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  const palette = page.getByTestId("palette");
  await page.keyboard.press("F1");
  await page.keyboard.type("Letterboxd: import your export");
  await page.keyboard.press("Enter");
  const found = palette.locator(".item, [role=option]", { hasText: "letterboxd-someone-2026-10-27-utc.zip" });
  await expect(found).toBeVisible({ timeout: 15_000 });
  await found.click();
  await expect(page.getByText("2 films read from the export")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("no Letterboxd username set")).toBeVisible({ timeout: 30_000 });
  const state = JSON.parse(readFileSync(STATE, "utf8"));
  expect(state.export).toEqual({
    "https://boxd.it/aaaa": { rating: 4.5 },
    "https://boxd.it/bbbb": { watched: "2026-04-01", rating: 3.5 },
  });
  expect(errs).toEqual([]);
});
