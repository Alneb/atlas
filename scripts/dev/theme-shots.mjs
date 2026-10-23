#!/usr/bin/env node
// Screenshots of the panes of a RUNNING Atlas in one theme, without writing anything to its vault.
//
//   node scripts/dev/theme-shots.mjs light /tmp/shots            # the dev server (dev.sh) on :5173
//   node scripts/dev/theme-shots.mjs dark  /tmp/shots http://localhost:5173/
//
// How it stays read-only: every request that is not a GET (a save, the layout, the journal) is
// answered here with `{}` and never reaches the core — except the few POSTs that only read (a Base
// query, a view). The settings are served with `ui.theme` replaced, so the vault's config is not
// touched either. The list of what was held back is printed at the end.
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const { chromium } = createRequire(resolve(here, "../../ui/package.json"))("playwright");

const [theme = "light", out = "/tmp/atlas-theme-shots", url = "http://localhost:5173/"] = process.argv.slice(2);
if (theme !== "light" && theme !== "dark") { console.error("theme: light or dark"); process.exit(2); }
mkdirSync(out, { recursive: true });

// POSTs that only read
const READS = ["/api/base/query", "/api/view", "/api/link-mention"];
// [file name, the command's title as the palette shows it]
const PANES = [
  ["02-home", "Home (your home document)"], ["03-files", "Show files"], ["04-search", "Search in workspace"],
  ["05-git", "Git: changes and history"], ["06-library", "Library (papers)"], ["07-settings", "Settings"],
  ["08-commands", "Commands & keyboard shortcuts"], ["09-graph", "Graph of notes"], ["10-outline", "Outline of the current note"],
];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 900 } });
const held = new Set();
await page.route("**/api/**", async (route) => {
  const req = route.request(), path = new URL(req.url()).pathname;
  if (req.method() === "GET" && path === "/api/config") {
    const res = await route.fetch(), body = await res.json();
    body.config.ui.theme = theme;
    return route.fulfill({ response: res, json: body });
  }
  if (req.method() === "GET" || READS.includes(path)) return route.continue();
  held.add(`${req.method()} ${path}`);
  return route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
});

console.log(`[theme-shots] ${url} in ${theme} → ${out}`);
await page.goto(url);
await page.waitForTimeout(3500); // the layout, the plugins and the first panes
const shot = async (name) => {
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${out}/${name}.png` });
  const painted = await page.evaluate(() => document.documentElement.dataset.theme);
  console.log(`[theme-shots] ${name}.png${painted === theme ? "" : `  !! the page is painted ${painted}, not ${theme}`}`);
};
const run = async (title) => { await page.keyboard.press("F1"); await page.waitForTimeout(250); await page.keyboard.type(title); await page.waitForTimeout(350); await page.keyboard.press("Enter"); };

await shot("01-start");
for (const [name, title] of PANES) { await run(title); await shot(name); }
await page.keyboard.press("F1"); await page.waitForTimeout(250); await shot("11-palette"); await page.keyboard.press("Escape");
console.log(`[theme-shots] held back (never sent to the vault): ${[...held].join(", ") || "nothing"}`);
await browser.close();
