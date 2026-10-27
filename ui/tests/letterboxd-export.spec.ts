import { test, expect } from "@playwright/test";
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { WS } from "../playwright.config";

// catalog-letterboxd's palette command: the vault's export found by its shape, picked, read into the sync's state
// (helper.py `import_export`), then one sync at once. Its `requires = ["catalog"]` is dropped here: the import itself
// needs no catalog, and the sync with no username says where to set it.
const PLUGIN = join(WS, ".atlas/plugins/catalog-letterboxd");
const ZIP = join(WS, "letterboxd-someone-2026-10-27-utc.zip");
const STATE = join(WS, ".atlas/cache/catalog-letterboxd.json");

test.beforeAll(() => {
  mkdirSync(PLUGIN, { recursive: true });
  for (const f of ["main.js", "helper.py"]) copyFileSync(new URL(`../../plugins/beta/catalog-letterboxd/${f}`, import.meta.url), join(PLUGIN, f));
  const toml = readFileSync(new URL("../../plugins/beta/catalog-letterboxd/plugin.toml", import.meta.url), "utf8");
  writeFileSync(join(PLUGIN, "plugin.toml"), toml.replace(/^requires = .*$/m, ""));
  const files = {
    "watched.csv": "Date,Name,Year,Letterboxd URI\n2019-01-05,The Realm,2018,https://boxd.it/aaaa\n2026-04-01,Dune: Part Two,2024,https://boxd.it/bbbb\n",
    "ratings.csv": "Date,Name,Year,Letterboxd URI,Rating\n2026-05-02,The Realm,2018,https://boxd.it/aaaa,4.5\n",
    "diary.csv": "Date,Name,Year,Letterboxd URI,Rating,Rewatch,Tags,Watched Date\n2026-04-01,Dune: Part Two,2024,https://boxd.it/d3,3.5,,,2026-04-01\n",
  };
  execFileSync("python3", ["-c", "import json,sys,zipfile\nwith zipfile.ZipFile(sys.argv[1],'w') as z:\n  [z.writestr(k,v) for k,v in json.loads(sys.argv[2]).items()]", ZIP, JSON.stringify(files)]);
  rmSync(STATE, { force: true });
});
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
