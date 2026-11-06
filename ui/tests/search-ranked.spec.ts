import { test, expect } from "@playwright/test";

// The Search pane's text hits, best first and a page at a time (search.rs `rank`, Search.svelte): a note whose heading
// says the word leads, a file shows a few lines and counts them all, and "Show more" brings the next page.
const H = { "x-atlas": "1" };

test.beforeAll(async ({ request }) => {
  const put = (path: string, text: string) => request.put("/api/file", { headers: H, data: { path, text } });
  for (let i = 0; i < 55; i++) await put(`notes/ranked/passing-${String(i).padStart(2, "0")}.md`, `A line that mentions quasiparticlez once.\n`);
  await put("notes/ranked/about.md", "# Quasiparticlez\n\nWhat they are.\n");
  await put("notes/ranked/many.md", "quasiparticlez\n".repeat(9));
});
test.afterAll(async ({ request }) => { await request.post("/api/fs/trash?path=notes/ranked", { headers: H }); });

test("text hits: the note about it first, a few lines with the count, and the rest a page at a time", async ({ page }) => {
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await page.keyboard.press("Control+Shift+F");
  const pane = page.locator(".search-pane");
  await pane.getByLabel("Search", { exact: true }).fill("quasiparticlez");
  const files = pane.locator(".hit-file .p");
  await expect(files.first()).toContainText("about", { timeout: 15000 });
  await expect(files.nth(1)).toContainText("many");
  await expect(pane.locator(".hit-file", { hasText: "many" }).locator(".count")).toHaveText("9 matches");
  await expect(pane.locator('.line-hit[data-path="notes/ranked/many.md"]')).toHaveCount(5);
  await expect(files).toHaveCount(50);
  await expect(pane.locator(".group-label", { hasText: "In the text" })).toContainText("57 files");
  for (const theme of ["light", "dark"]) {
    await page.evaluate((t) => document.documentElement.setAttribute("data-theme", t), theme);
    await pane.screenshot({ path: `../target/snip/search-ranked-${theme}.png` });
  }
  await pane.getByRole("button", { name: /Show 7 more files of 7/ }).click();
  await expect(files).toHaveCount(57);
});
