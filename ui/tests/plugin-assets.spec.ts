import { test, expect, type Page } from "@playwright/test";
import { copyFileSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { WS } from "../playwright.config";

// A plugin's own files by URL (core plugin_files.rs, lib/plugin-files.ts; PLUGIN-API.md "A plugin's own files", API 9):
// its modules load from `/plugin-files/<rev>/<vault path>`, so a static, a dynamic and a worker's relative import, a
// sibling plugin's module (`../assets-lib/shared.js`), a picture and a font by `atlas.assetUrl` all load; an edited module runs
// its new code; nothing leads out of the folder; and the same under a server vault's `/v/<name>/`.
const ID = "assets-probe";
const DIR = join(WS, ".atlas/plugins", ID);
const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
const VIEW = `import { word } from "./lib/word.js";
import { shared } from "../assets-lib/shared.js";
export default async function mount(host, atlas) {
  const out = (k, v) => { const p = document.createElement("p"); p.className = "probe-" + k; p.textContent = String(v); host.append(p); };
  out("static", word);
  out("dynamic", (await import("./lib/lazy.js")).lazy);
  out("zip", typeof shared);
  const img = new Image();
  img.src = atlas.assetUrl("pics/dot.png");
  out("img", await img.decode().then(() => img.naturalWidth, () => "failed"));
  const font = new FontFace("ProbeFont", "url(" + atlas.assetUrl("fonts/probe.woff2") + ")");
  out("font", await font.load().then(() => "loaded", (e) => "failed " + e));
  const w = new Worker(new URL("./worker.js", import.meta.url), { type: "module" });
  out("worker", await new Promise((ok) => { w.onmessage = (e) => ok(e.data); w.onerror = () => ok("failed"); }));
  w.terminate();
  let escape = "allowed";
  try { atlas.assetUrl("../assets-lib/shared.js"); } catch { escape = "refused"; }
  out("escape", escape);
  out("folder", atlas.assetUrl("fonts/").endsWith("/fonts/")); // a base URL for a library that fetches its own files
  out("meta", new URL(import.meta.url).pathname);
}
`;
const word = (w: string) => writeFileSync(join(DIR, "lib/word.js"), `export const word = ${JSON.stringify(w)};\n`);

test.beforeAll(() => {
  // a library plugin beside it, whose module it imports as a sibling (`exports`)
  mkdirSync(join(WS, ".atlas/plugins/assets-lib"), { recursive: true });
  writeFileSync(join(WS, ".atlas/plugins/assets-lib/plugin.toml"), `title = "Assets library"\napi = 18\nexports = ["shared.js"]\n`);
  writeFileSync(join(WS, ".atlas/plugins/assets-lib/shared.js"), "export function shared() {}\n");
  mkdirSync(join(DIR, "lib"), { recursive: true });
  mkdirSync(join(DIR, "pics"), { recursive: true });
  mkdirSync(join(DIR, "fonts"), { recursive: true });
  writeFileSync(join(DIR, "plugin.toml"), `title = "Assets probe"\napi = 9\n`);
  writeFileSync(join(DIR, "view.js"), VIEW);
  word("one");
  writeFileSync(join(DIR, "lib/lazy.js"), `export const lazy = "lazy";\n`);
  writeFileSync(join(DIR, "worker.js"), `import { word } from "./lib/word.js";\npostMessage("worker " + word);\n`);
  writeFileSync(join(DIR, "pics/dot.png"), Buffer.from(PNG, "base64"));
  copyFileSync(new URL("../node_modules/@excalidraw/excalidraw/dist/prod/fonts/ComicShanns/ComicShanns-Regular-279a7b317d12eb88de06167bd672b4b4.woff2", import.meta.url), join(DIR, "fonts/probe.woff2"));
});
test.afterAll(() => { rmSync(DIR, { recursive: true, force: true }); });

async function openProbe(page: Page) {
  await page.getByText("Finish the GW notes.").waitFor();
  await page.keyboard.press("F1");
  await page.keyboard.type("Assets probe");
  await page.getByTestId("palette").getByText("Assets probe", { exact: true }).click();
  return page.locator(".plugin-host").filter({ has: page.locator(".probe-static") });
}

test("a plugin's modules, worker, picture and font load by URL, an edit runs the new code, nothing leads out", async ({ page, request }) => {
  await page.goto("/");
  const pane = await openProbe(page);
  await expect(pane.locator(".probe-static")).toHaveText("one");
  await expect(pane.locator(".probe-dynamic")).toHaveText("lazy");
  await expect(pane.locator(".probe-zip")).toHaveText("function");
  await expect(pane.locator(".probe-img")).toHaveText("1");
  await expect(pane.locator(".probe-font")).toHaveText("loaded");
  await expect(pane.locator(".probe-worker")).toHaveText("worker one");
  await expect(pane.locator(".probe-escape")).toHaveText("refused");
  await expect(pane.locator(".probe-folder")).toHaveText("true");
  await expect(pane.locator(".probe-meta")).toHaveText(new RegExp(`^/plugin-files/[0-9a-z]+/\\.atlas/plugins/${ID}/view\\.js$`));

  // an imported module edited: the pane mounts again with it (a new revision: ES modules are kept by URL)
  word("two");
  await expect(page.locator(".probe-static")).toHaveText("two", { timeout: 10_000 });
  await expect(page.locator(".probe-worker")).toHaveText("worker two");

  // the core refuses what is not the plugin's own (the `..` escaped, or the client folds it away)
  for (const rest of [`.atlas/plugins/${ID}/%2e%2e/%2e%2e/%2e%2e/FOCUS.md`, "FOCUS.md", ".atlas/config.toml", `.atlas/plugins/${ID}/.hidden`]) {
    expect((await request.get(`/plugin-files/0/${rest}`)).status(), rest).toBe(400);
  }
  const font = await request.get(`/plugin-files/0/.atlas/plugins/${ID}/fonts/probe.woff2`);
  expect(font.headers()["content-type"]).toBe("font/woff2");
});

test("under a server vault's /v/<name>/, every file of the plugin is asked there", async ({ page }) => {
  // the page told its API is at /v/probe (as a server's page is, `__ATLAS_API__`); this core answers for it
  await page.addInitScript(() => { (window as unknown as { __ATLAS_API__: string }).__ATLAS_API__ = "/v/probe"; });
  const asked: string[] = [];
  await page.route("**/v/probe/**", async (r) => {
    const u = new URL(r.request().url());
    if (u.pathname.startsWith("/v/probe/plugin-files/")) asked.push(u.pathname.replace(/^\/v\/probe\/plugin-files\/[0-9a-z]+\//, ""));
    await r.fulfill({ response: await r.fetch({ url: `${u.origin}${u.pathname.replace("/v/probe", "")}${u.search}` }) });
  });
  await page.goto("/");
  const pane = await openProbe(page);
  await expect(pane.locator(".probe-worker")).toHaveText(/^worker /);
  await expect(pane.locator(".probe-font")).toHaveText("loaded");
  await expect(pane.locator(".probe-meta")).toHaveText(new RegExp(`^/v/probe/plugin-files/[0-9a-z]+/\\.atlas/plugins/${ID}/view\\.js$`));
  for (const f of ["view.js", "lib/word.js", "lib/lazy.js", "worker.js", "pics/dot.png", "fonts/probe.woff2"]) expect(asked, f).toContain(`.atlas/plugins/${ID}/${f}`);
  expect(asked).toContain(".atlas/plugins/assets-lib/shared.js");
});
