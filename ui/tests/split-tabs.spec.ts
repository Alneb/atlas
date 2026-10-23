import { test, expect, type Page } from "@playwright/test";

// Zen's split view: a tab outside the split is shown alone, the split row stays, a click on
// it brings the pair back side by side (lib/tabs.svelte.ts splitPair).
const H = { "x-atlas": "1" };

async function openNote(page: Page, name: string): Promise<void> {
  await page.keyboard.press("Control+p");
  await page.keyboard.type(name);
  await expect(page.getByTestId("palette").getByText(name, { exact: true }).first()).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page.locator(".cm-content").filter({ hasText: `Body of ${name}` }).first()).toBeVisible();
}

test("a tab outside the split shows alone; the split row brings the pair back", async ({ page, request }) => {
  for (const n of ["split-a", "split-b", "split-c"]) await request.put("/api/file", { headers: H, data: { path: `notes/${n}.md`, text: `# ${n}\n\nBody of ${n}\n` } });
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  for (const n of ["split-a", "split-b", "split-c"]) await openNote(page, n);
  const side = page.getByTestId("sidebar");
  await side.locator(".tab", { hasText: "split-c" }).first().click({ button: "right" });
  await page.getByRole("menuitem", { name: "Split right" }).click();
  const row = side.getByTestId("split-row");
  await expect(row.locator(".tab")).toHaveCount(2);
  const visible = () => page.locator(".editor-pane").filter({ visible: true }).count();
  await expect.poll(visible).toBe(2);
  const pair = (await row.locator(".tab").allInnerTexts()).join(" ");
  const outside = ["split-a", "split-b"].find((n) => !pair.includes(n))!;
  // a tab outside the pair: alone on screen, the pair still a row
  await side.locator(".tab", { hasText: outside }).first().click();
  await expect.poll(visible).toBe(1);
  await expect(page.locator(".cm-content").filter({ hasText: `Body of ${outside}` }).filter({ visible: true })).toHaveCount(1);
  await expect(row.locator(".tab")).toHaveCount(2);
  expect((await row.locator(".tab").allInnerTexts()).join(" ")).toBe(pair);
  // the split row: both halves again
  await row.locator(".tab").first().click();
  await expect.poll(visible).toBe(2);
});

// "an × on each half closes that half; and ends the split" (2026-10-19): the half's × in the split row, and the one in
// the corner of each half on screen, close that half's tab; the tabs behind it join the other half, one editor again.
async function splitThree(page: Page, names: string[]): Promise<void> {
  for (const n of names) await page.request.put("/api/file", { headers: H, data: { path: `notes/${n}.md`, text: `# ${n}\n\nBody of ${n}\n` } });
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  for (const n of names) await openNote(page, n);
  await page.getByTestId("sidebar").locator(".tab", { hasText: names[2] }).first().click({ button: "right" });
  await page.getByRole("menuitem", { name: "Split right" }).click();
  await expect(page.getByTestId("split-row").locator(".tab")).toHaveCount(2);
}
const shown = (page: Page) => page.locator(".editor-pane").filter({ visible: true }).count();

test("a half's × in the split row closes that half and ends the split", async ({ page }) => {
  await splitThree(page, ["half-a", "half-b", "half-c"]);
  const side = page.getByTestId("sidebar"), row = side.getByTestId("split-row");
  const half = row.locator(".tab", { hasText: "half-c" });
  await half.hover();
  await half.getByRole("button", { name: "Close half-c" }).dispatchEvent("mousedown", { button: 0 });
  await expect(row).toHaveCount(0);
  await expect.poll(() => shown(page)).toBe(1);
  await expect(side.locator(".tab", { hasText: "half-c" })).toHaveCount(0);
  await expect(side.locator(".tab", { hasText: "half-a" })).toHaveCount(1); // the other tabs kept
  await expect(side.locator(".tab", { hasText: "half-b" })).toHaveCount(1);
});

test("the × in a half's corner closes that half and ends the split", async ({ page }) => {
  await splitThree(page, ["corner-a", "corner-b", "corner-c"]);
  const closes = page.locator(".dv-groupview > .half-close");
  await expect(closes).toHaveCount(2);
  const right = page.locator(".dv-groupview", { has: page.locator(".cm-content", { hasText: "Body of corner-c" }) });
  await right.hover();
  await right.locator("> .half-close").click();
  await expect(page.getByTestId("split-row")).toHaveCount(0);
  await expect.poll(() => shown(page)).toBe(1);
  await expect(closes).toHaveCount(0);
  await expect(page.getByTestId("sidebar").locator(".tab", { hasText: "corner-c" })).toHaveCount(0);
});
