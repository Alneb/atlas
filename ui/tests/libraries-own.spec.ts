import { test, expect, type Page } from "@playwright/test";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { WS } from "../playwright.config";

// The vault's own libraries (`[ui] libraries`, libraries.rs; docs/design/DESIGN-android-native-app.md §4): a folder
// shown as a library through the core (`POST /api/libraries/add`, the explorer's "Show as a library"), its kind guessed,
// its things and their Continue row from the core (`GET /api/library`). A plugin's library of the same kind joins it;
// the server's things it brings (`from`) are not listed — only what is yours — and the service's own app is a button in
// the header, its own tab; a library
// that is a server's alone is listed after the vault's ("On your servers"). Settings → Libraries edits the list.
// Screenshots, light and dark: "before" — a server's things given as the vault's (as plugins did before `from`), all
// in one grid — and "after", the same with `from`.
const H = { "x-atlas": "1" };
const CONFIG = join(WS, ".atlas/config.toml");
const SHELF = join(WS, "Bookshelf");
let config = "";

const plugin = (id: string, body: string) => {
  const dir = join(WS, ".atlas/plugins", id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "plugin.toml"), `title = "${id}"\napi = 33\n`);
  writeFileSync(join(dir, "main.js"), `export function register(atlas) {\n${body}\n}\n`);
};
// a server's books, beside the vault's: with `from` they are the server's (after), without it they read as the vault's (before)
const serverBooks = (from: boolean) => `atlas.registerLibrary({ id: "lib-server", title: "Server books", subject: "books", icon: "server", noun: "books",
    layouts: ["covers", "list"], sorts: [{ id: "title", label: "title" }], search: "Search…", empty: "None.",
    ${from ? `homes: [{ from: "Example server", label: "Open Example server", run: () => atlas.toast("server app") }],` : ""}
    load: async () => ["Foundation", "Ubik"].map((t) => ({ id: t, title: t, text: t, sort: { title: t }${from ? `, from: "Example server"` : ""} })),
    detail: (item) => ({ title: item.title, actions: [] }) });`;
const films = `atlas.registerLibrary({ id: "lib-films", title: "Films", icon: "film", noun: "films", from: "Example films",
    layouts: ["covers"], sorts: [{ id: "title", label: "title" }], search: "Search…", empty: "None.",
    load: async () => [{ id: "f", title: "Arrival", text: "Arrival", sort: { title: "Arrival" } }],
    detail: (item) => ({ title: item.title, actions: [] }) });`;

test.beforeAll(() => {
  config = readFileSync(CONFIG, "utf8");
  rmSync(SHELF, { recursive: true, force: true });
  mkdirSync(join(SHELF, "Sci-fi"), { recursive: true });
  for (const [path, fm] of [["Dune", "author: Frank Herbert\nprogress: 42%\nlast_read: 2026-11-15T10:00:00Z"], ["Sci-fi/Solaris", "author: Stanisław Lem\nprogress: 100%\nlast_read: 2026-11-16T11:00:00Z"], ["Hyperion", null]] as const) {
    writeFileSync(join(SHELF, `${path}.epub`), "x"); // listed, never opened here
    if (fm) writeFileSync(join(SHELF, `${path}.md`), `---\nbook: "[[${path.split("/").pop()}.epub]]"\n${fm}\n---\n`);
  }
});
test.afterAll(() => {
  writeFileSync(CONFIG, config);
  rmSync(SHELF, { recursive: true, force: true });
  for (const id of ["lib-server", "lib-films"]) rmSync(join(WS, ".atlas/plugins", id), { recursive: true, force: true });
});

async function openLibraries(page: Page) {
  await page.goto("/");
  await page.waitForFunction(() => "__atlas" in window);
  await page.evaluate(() => (window as unknown as { __atlas: { run(id: string): void } }).__atlas.run("ui.libraries"));
  return page.locator(".libraries");
}
const shoot = async (page: Page, name: string) => {
  for (const scheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: scheme }); // judged in both themes (docs/guides/UI-STYLE.md)
    await page.screenshot({ path: `test-results/${name}-${scheme}.png` });
  }
};

test("a folder shown as a library: its kind guessed, its things and Continue from the core", async ({ request }) => {
  const added = await (await request.post("/api/libraries/add", { headers: H, data: { folder: "Bookshelf" } })).json();
  expect(added).toMatchObject({ id: "bookshelf", kind: "books", folder: "Bookshelf", layout: "covers", sort: "-last_read" });
  const view = await (await request.get("/api/library?id=bookshelf", { headers: H })).json();
  expect(view.items.map((t: { title: string }) => t.title)).toEqual(["Solaris", "Dune", "Hyperion"]);
  expect(view.continue.map((t: { title: string }) => t.title)).toEqual(["Dune"]);
  expect(view.items[1]).toMatchObject({ sub: "Frank Herbert", progress: 0.42, note: "Bookshelf/Dune.md" });
});

test("before and after: a server's books in its own tab behind its button, a server's own library after the vault's", async ({ page, request }) => {
  await request.post("/api/libraries/add", { headers: H, data: { folder: "Bookshelf" } });
  await page.setViewportSize({ width: 1280, height: 820 });

  // before: the server's books given as the vault's — one grid, nothing says where they live
  plugin("lib-server", serverBooks(false));
  await expect.poll(async () => JSON.stringify(await (await request.get("/api/plugins", { headers: H })).json())).toContain("lib-server");
  let libs = await openLibraries(page);
  await libs.getByRole("tab", { name: "Bookshelf" }).click();
  await expect(libs.locator(".card")).toHaveCount(5, { timeout: 20_000 });
  await expect(libs.locator(".from-head")).toHaveCount(0);
  await shoot(page, "libraries-own-before");

  // after: the same with `from`, and a library that is a server's alone
  plugin("lib-server", serverBooks(true));
  plugin("lib-films", films);
  await expect.poll(async () => JSON.stringify(await (await request.get("/api/plugins", { headers: H })).json())).toContain("lib-films");
  libs = await openLibraries(page);
  await libs.getByRole("tab", { name: "Bookshelf" }).click();
  // only what is yours is listed: the server's books are in its own tab, its button in the header
  await expect(libs.getByRole("button", { name: /Open Example server/ })).toBeVisible({ timeout: 20_000 });
  await expect(libs.locator(".from-head")).toHaveCount(0);
  await expect(libs.locator("section.continue .go .t")).toHaveText(["Dune"]);
  await expect(libs.locator(".list > .card .t")).toHaveText(["Solaris", "Dune", "Hyperion"]);
  // a server's own library is a tab after the vault's
  const tabs = libs.getByRole("tablist", { name: "Libraries" });
  await expect(tabs.locator(".label")).toHaveText("On your servers");
  await expect(tabs.getByRole("tab").last()).toHaveText("Films");
  await shoot(page, "libraries-own-after");

  // phone width: the same separation
  await page.setViewportSize({ width: 412, height: 860 });
  await shoot(page, "libraries-own-phone");
});

test("Settings → Libraries lists the vault's own with their kind, order and layout, the servers' apart", async ({ page, request }) => {
  await request.post("/api/libraries/add", { headers: H, data: { folder: "Bookshelf" } });
  plugin("lib-films", films);
  await expect.poll(async () => JSON.stringify(await (await request.get("/api/plugins", { headers: H })).json())).toContain("lib-films");
  await page.setViewportSize({ width: 1100, height: 900 });
  await page.goto("/");
  await page.waitForFunction(() => "__atlas" in window);
  await page.evaluate(() => (window as unknown as { __atlas: { run(id: string): void } }).__atlas.run("ui.settings"));
  await page.getByRole("button", { name: /^Libraries$/ }).first().click();
  const panel = page.locator(".libraries-panel");
  await expect(panel.getByRole("list", { name: "Libraries" }).locator(".row", { hasText: "Bookshelf" })).toContainText("Bookshelf/");
  await expect(panel.getByRole("list", { name: "Server libraries" })).toContainText("Films");
  await shoot(page, "libraries-settings");
});
