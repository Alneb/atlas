import { test, expect } from "@playwright/test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { WS } from "../playwright.config";
import { installBooks } from "./epub-fixture";

// The Libraries page's Continue row (catalog's Library.svelte, `continueRow`): items a source reports with `progress`
// and `lastUsed` (the Books plugin reads both from the books' notes) are listed above the grid, most recent first;
// a finished one (100 %) is left out; every cover with a progress gets a bar under it. Phone width, both themes.
const PLUGIN = join(WS, ".atlas/plugins/books");
// in the plugin's own folder (its `folder` setting's default, `books`), a subfolder of this spec's alone: other specs'
// books live beside it
const SHELF = join(WS, "books/continue");
const BOOKS: [string, string | null][] = [
  // [title, note front matter or null for a book never opened]
  ["Dune", "progress: 42%\nlast_read: 2026-11-15T10:00:00Z"],
  ["Hyperion", "progress: 10%\nlast_read: 2026-11-16T09:00:00Z"],
  ["Solaris", "progress: 100%\nlast_read: 2026-11-16T11:00:00Z"],
  ["Neuromancer", null],
];

test.beforeAll(() => {
  installBooks(PLUGIN);
  rmSync(SHELF, { recursive: true, force: true });
  mkdirSync(SHELF, { recursive: true });
  for (const [title, fm] of BOOKS) {
    writeFileSync(join(SHELF, `${title}.epub`), "x"); // the library lists files; nothing here opens them
    if (fm) writeFileSync(join(SHELF, `${title}.md`), `---\nbook: "[[${title}.epub]]"\n${fm}\n---\n`);
  }
});
test.afterAll(() => { rmSync(PLUGIN, { recursive: true, force: true }); rmSync(SHELF, { recursive: true, force: true }); });

test("Continue lists the books being read, latest first, finished ones left out; covers carry a progress bar", async ({ page }) => {
  await page.setViewportSize({ width: 412, height: 860 });
  await page.goto("/");
  await page.waitForFunction(() => "__atlas" in window);
  await page.evaluate(() => (window as unknown as { __atlas: { run(id: string): void } }).__atlas.run("ui.libraries"));
  await page.getByText(/^E-books$/).first().click();

  const row = page.locator("section.continue");
  await expect(row.locator(".go .t")).toHaveText(["Hyperion", "Dune"]);
  // Dune, Hyperion and Solaris have a progress; Neuromancer was never opened
  await expect(page.locator(".list .card .bar")).toHaveCount(3);

  for (const scheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: scheme }); // judged in both themes (docs/guides/UI-STYLE.md)
    await page.screenshot({ path: `test-results/libraries-continue-${scheme}.png` });
  }
});
