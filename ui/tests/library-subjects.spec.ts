import { test, expect } from "@playwright/test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { WS } from "../playwright.config";

// Libraries of one subject are one tab of the Libraries page (lib/libraries.svelte.ts `subject`, library.ts
// mergeSources): a catalog's book notes and the e-books read here show as "Books", each source a tab inside it, each
// item opened by the plugin that gave it.
const plugin = (id: string, title: string, items: string[], extra = "") => {
  const dir = join(WS, ".atlas/plugins", id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "plugin.toml"), `title = "${id}"\napi = 19\n`);
  writeFileSync(join(dir, "main.js"), `export function register(atlas) {
  atlas.registerLibrary({ id: "${id}", title: "${title}", ${extra} icon: "book", noun: "books", layouts: ["list"], sorts: [{ id: "title", label: "title" }],
    search: "Search…", empty: "None.",
    load: async () => ${JSON.stringify(items)}.map((t) => ({ id: t, title: t, text: t, sort: { title: t } })),
    detail: (item) => ({ title: item.title, kind: "${id}", actions: [{ label: "Open", run: () => atlas.toast("${id} opens " + item.id) }] }),
  });
}\n`);
};
test.beforeAll(() => {
  plugin("subj-notes", "Books", ["Dune", "Solaris"]);
  plugin("subj-files", "E-books", ["qft.epub"], `subject: "books",`);
});
test.afterAll(() => { for (const id of ["subj-notes", "subj-files"]) rmSync(join(WS, ".atlas/plugins", id), { recursive: true, force: true }); });

test("two libraries of one subject are one Books tab, a tab inside per source, each item its own plugin's", async ({ page, request }) => {
  // the plugins were just written: the page loads only once the core lists them, else "Books" is the vault's own alone
  await expect.poll(async () => JSON.stringify(await (await request.get("/api/plugins", { headers: { "x-atlas": "1" } })).json())).toContain("subj-files");
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await page.keyboard.press("F1");
  await page.keyboard.type("Libraries");
  await page.getByTestId("palette").getByText("Libraries (drawings, references, films, comics…)").click();
  const libs = page.locator(".libraries");
  await libs.getByRole("tablist", { name: "Libraries" }).getByRole("tab", { name: "Books" }).click();
  await expect(libs.getByRole("tablist", { name: "Libraries" }).getByRole("tab", { name: "Books" })).toHaveCount(1);
  await expect(libs.getByRole("tablist", { name: "Libraries" }).getByRole("tab", { name: "E-books" })).toHaveCount(0);
  // both plugins' modules were just written: importing and registering them can outlast 5 s on a loaded gate
  await expect(libs.locator(".row, .card")).toHaveCount(3, { timeout: 20_000 });
  await libs.locator(".row, .card", { hasText: "qft.epub" }).click();
  await expect(libs.locator(".detail")).toContainText("subj-files"); // its own plugin's detail
});
