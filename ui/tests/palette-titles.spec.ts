import { test, expect } from "@playwright/test";

// Open file (Ctrl+P) finds a note by its title too, as the [[ list does: a paper by the words of its title.
const H = { "x-atlas": "1" };

test("open file finds a note by its title, tags shown as text", async ({ page, request }) => {
  await request.put("/api/file", { headers: H, data: { path: "refs/papers/smith2020x/smith2020x.md", text: "---\ntitle: Quantum <i>spin</i> liquids on kagome lattices\n---\n\nnotes\n" } });
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await page.keyboard.press("Control+p");
  await page.keyboard.type("kagome lattices");
  const row = page.getByTestId("palette").getByText("Quantum spin liquids on kagome lattices");
  await expect(row).toBeVisible();
  await row.click();
  await expect(page.getByText("notes", { exact: true }).first()).toBeVisible();
});

test("the Search pane lists a note found by its title, under the names", async ({ page, request }) => {
  await request.put("/api/file", { headers: H, data: { path: "refs/papers/doe2021y/doe2021y.md", text: "---\ntitle: Frustrated magnets in pyrochlore oxides\n---\n" } });
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await page.keyboard.press("Control+Shift+F");
  // typed at once, before the pane has mounted: held for its box, not left in Home's capture box (lib/pane-host.ts)
  await page.keyboard.type("pyrochlore oxides");
  const hit = page.locator(".file-hit", { hasText: "Frustrated magnets in pyrochlore oxides" });
  await expect(hit).toBeVisible();
  await expect(hit.locator(".fdir")).toHaveText("doe2021y");
});
