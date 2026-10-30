import { test, expect } from "@playwright/test";
import { openFile } from "./open";

// A table over hundreds of notes draws only the rows around the view; the scrollbar is the whole table's, and the
// last row is there once scrolled to.
const H = { "x-atlas": "1" };

test("a base's table draws only the rows in view, and scrolling reaches the last", async ({ page, request }) => {
  const N = 400;
  const names = Array.from({ length: N }, (_, i) => `n${String(i).padStart(3, "0")}`);
  for (let i = 0; i < N; i += 50) {
    await Promise.all(names.slice(i, i + 50).map((n, j) => request.put("/api/file", { headers: H, data: { path: `db/many/${n}.md`, text: `---\nk: ${i + j}\n---\n` } })));
  }
  await request.put("/api/file", { headers: H, data: { path: "db/many.base", text: 'filters:\n  and:\n    - file.inFolder("db/many")\nviews:\n  - type: table\n    name: Many\n    order: [file.name, k]\n    sort:\n      - property: file.name\n        direction: ASC\n' } });

  await page.goto("/");
  await openFile(page, "many.base");
  const pane = page.locator(".base-pane");
  await expect(pane.locator("tbody tr:not(.pad)").first()).toContainText("n000");

  const drawn = await pane.locator("tbody tr:not(.pad)").count();
  expect(drawn).toBeLessThan(N / 2);
  // the padding stands for the rows not drawn: the table is as tall as all of them
  const scroll = pane.locator(".scroll");
  const tall = await scroll.evaluate((el) => el.scrollHeight);
  expect(tall).toBeGreaterThan(N * 30);

  await scroll.evaluate((el) => { el.scrollTop = el.scrollHeight; });
  await expect(pane.locator("tbody tr").filter({ hasText: "n399" })).toBeVisible();
  await expect(pane.locator("tbody tr").filter({ hasText: "n000" })).toHaveCount(0);
});
