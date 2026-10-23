#!/usr/bin/env node
// The README's screenshots, from a demo vault made here from fixtures (never a real vault), in both themes.
//
//   node scripts/dev/readme-shots.mjs [--bin target/debug/atlas] [--out docs/img/readme]
//
// Builds the vault in the temp folder, serves it with `atlas serve` (locked, its own vault list and secret store),
// opens two notes side by side in Chromium and writes <out>/workspace-{light,dark}.webp (cwebp, quality 82).
// Everything it starts or writes outside <out> is removed at the end.
import { createRequire } from "node:module";
import { spawn, execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, rmSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../..");
const { chromium } = createRequire(join(root, "ui/package.json"))("playwright");
const arg = (n, d) => (process.argv.includes(n) ? process.argv[process.argv.indexOf(n) + 1] : d);
const bin = resolve(arg("--bin", join(root, "target/debug/atlas")));
const out = resolve(arg("--out", join(root, "docs/img/readme")));
const say = (m) => console.log(`[shots] ${m}`);

const recipe = (method, ratio, minutes, rating, body) =>
  `---\ntype: Recipe\nmethod: ${method}\nratio: "${ratio}"\nminutes: ${minutes}\nrating: ${rating}\ntopics: ["[[Coffee]]"]\n---\n${body}`;
const FILES = {
  ".atlas/config.toml": `log_dir = "log"\nvim = false\n\n[ui]\nrestore_layout = false\n\n[editor]\nproperties = "inline"\n`,
  "notes/Coffee.md": `---\ntype: Topic\ntags: [kitchen, reading]\naliases: [coffee brewing]\n---\n# Coffee\n\nNotes on brewing at home: what changes the cup, and the recipes that worked. See [[Extraction]] for the numbers and [[Grinders]] for the gear.\n\n> [!tip] Start here\n> Fix the ratio first, then change one thing at a time: grind, water, time.\n\n## Recipes\n\n![[recipes.base]]\n\n## To try\n\n- [ ] A longer bloom on the V60 📅 2026-11-02\n- [ ] Compare two grind sizes for the AeroPress\n- [x] Weigh the water instead of measuring it ✅ 2026-10-20\n`,
  "notes/Extraction.md": `---\ntype: Concept\ntopics: ["[[Coffee]]"]\nsource: "[[hoffmann2018world]]"\n---\n# Extraction\n\nHow much of the coffee ends up in the cup. The **extraction yield** is the dissolved mass over the dry dose:\n\n$$\nE = \\frac{\\mathrm{TDS} \\cdot m_\\text{beverage}}{m_\\text{dose}}\n$$\n\nA yield of $18$–$22\\,\\%$ tastes balanced; below it the cup is sour, above it bitter.\n\n| Brew | Dose | Water | Yield |\n|---|---|---|---|\n| V60 | 15 g | 250 g | 20 % |\n| Espresso | 18 g | 36 g | 19 % |\n\nRelated: [[Coffee]], [[Grinders]].\n`,
  "notes/Grinders.md": `---\ntype: Concept\ntopics: ["[[Coffee]]"]\n---\n# Grinders\n\nBurrs, not blades: an even grind extracts evenly.\n`,
  "notes/recipes/V60.md": recipe("pour-over", "1:16", 3.5, 5, "# V60\n\n15 g, 250 g of water at 94 °C, a 45 s bloom.\n"),
  "notes/recipes/Espresso.md": recipe("espresso", "1:2", 0.5, 4, "# Espresso\n\n18 g in, 36 g out, 28 s.\n"),
  "notes/recipes/AeroPress.md": recipe("immersion", "1:14", 2, 4, "# AeroPress\n\nInverted, 17 g, two minutes, a slow press.\n"),
  "notes/recipes/French press.md": recipe("immersion", "1:15", 4, 3, "# French press\n\nCoarse, four minutes, skim before plunging.\n"),
  "notes/recipes/recipes.base": `filters:\n  and:\n    - type == "Recipe"\nviews:\n  - type: table\n    name: By rating\n    order: [file.name, method, ratio, minutes, rating]\n    sort:\n      - property: rating\n        direction: DESC\n`,
  "refs/papers/hoffmann2018world/hoffmann2018world.md": "---\ntitle: The World Atlas of Coffee\ntype: book\nauthor:\n  - Hoffmann, J.\ndate: 2018\ncitekey: hoffmann2018world\n---\n# The World Atlas of Coffee\n",
  "log/2026-10-23.md": "# 2026-10-23\n\n- 08:10 Tried the V60 with a longer bloom: sweeter.\n",
  "FOCUS.md": "# Focus\n\nWrite up the brewing notes.\n",
};

const tmp = mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), "atlas-demo-"));
const vault = join(tmp, "Demo");
for (const [p, text] of Object.entries(FILES)) {
  mkdirSync(dirname(join(vault, p)), { recursive: true });
  writeFileSync(join(vault, p), text);
}
say(`demo vault: ${vault} (${Object.keys(FILES).length} files)`);

const PORT = 7741, KEY = `atl_demo${Date.now().toString(16)}`, url = `http://127.0.0.1:${PORT}/`;
const env = { ...process.env, ATLAS_VAULTS: join(tmp, "vaults.toml"), ATLAS_SECRETS_DIR: join(tmp, "secrets"), ATLAS_SERVER_CONFIG: join(tmp, "server.toml"), ATLAS_SERVER_STATE: join(tmp, "server.json"), ATLAS_AGENTS_FILE: join(tmp, "agents.json"), ATLAS_APP: "true", ATLAS_LOCAL_LOCK: "1", ATLAS_LOCAL_KEY: KEY, ATLAS_NO_BROWSER: "1", ATLAS_VAULT_TRASH: "1" };
delete env.ATLAS_UI_DIR;
const core = spawn(bin, ["serve", vault, "--port", String(PORT)], { env, stdio: ["ignore", "inherit", "inherit"] });
say(`core: ${bin} (pid ${core.pid}) on ${url}`);

let browser;
try {
  for (let i = 0; ; i++) {
    try { if ((await fetch(url)).status < 500) break; } catch { /* not up yet */ }
    if (i > 120) throw new Error("the core did not answer in 60 s");
    await new Promise((r) => setTimeout(r, 500));
  }
  mkdirSync(out, { recursive: true });
  browser = await chromium.launch();
  for (const theme of ["light", "dark"]) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 860 }, colorScheme: theme, extraHTTPHeaders: { authorization: `Bearer ${KEY}` } });
    await ctx.addCookies([{ name: "atlas_local", value: KEY, url }]);
    const page = await ctx.newPage();
    await page.goto(url);
    await page.getByText("Write up the brewing notes.").first().waitFor({ timeout: 30_000 });
    const open = async (name, text) => {
      await page.keyboard.press("Control+p");
      await page.keyboard.type(name);
      await page.getByTestId("palette").getByText(name, { exact: true }).first().waitFor();
      await page.keyboard.press("Enter");
      await page.locator(".cm-content").filter({ hasText: text }).first().waitFor();
    };
    await open("Extraction", "How much of the coffee");
    await open("Coffee", "Notes on brewing at home");
    await page.getByTestId("sidebar").locator(".tab", { hasText: "Coffee" }).first().click({ button: "right" });
    await page.getByRole("menuitem", { name: "Split right" }).click();
    await page.locator(".editor-pane").filter({ visible: true }).nth(1).waitFor();
    await page.locator(".cm-content").filter({ hasText: "V60" }).first().waitFor(); // the Base's rows
    for (const h of ["Extraction", "Coffee"]) { // each caret to the blank line under its heading: no revealed `#`
      await page.locator(".cm-line", { hasText: new RegExp(`^#?\\s*${h}$`) }).first().click();
      await page.keyboard.press("End");
      await page.keyboard.press("ArrowDown");
    }
    await page.mouse.move(0, 0);
    await page.evaluate(() => document.activeElement?.blur?.()); // no caret, no revealed `#`
    await page.waitForTimeout(1500); // math, the Base and fonts settle
    const png = join(tmp, `workspace-${theme}.png`);
    await page.screenshot({ path: png });
    execFileSync("cwebp", ["-quiet", "-q", "82", png, "-o", join(out, `workspace-${theme}.webp`)]);
    say(`${theme}: ${join(out, `workspace-${theme}.webp`)}`);
    await ctx.close();
  }
} finally {
  await browser?.close();
  core.kill("SIGTERM");
  rmSync(tmp, { recursive: true, force: true });
  say("core stopped, demo vault removed");
}
