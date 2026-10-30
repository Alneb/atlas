import { test, expect } from "@playwright/test";

// A toolbar's popover (components/Popover.svelte) lives at the end of <body>: it takes the focus when it opens, keeps
// Tab inside, and Esc gives the focus back to its button.
const H = { "x-atlas": "1" };

test("a popover opened by keyboard is reachable, keeps Tab, and Esc returns to its button", async ({ page, request }) => {
  await request.put("/api/file", { headers: H, data: { path: "db/ux-pop.base", text: "views:\n  - type: table\n    name: All\n" } });
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await page.request.post("/api/cmd/open", { headers: H, data: { args: { path: "db/ux-pop.base" } } });
  const sort = page.getByRole("button", { name: "Sort", exact: true }).last();
  await sort.focus();
  await page.keyboard.press("Enter");
  const pop = page.getByRole("dialog", { name: "Sort" });
  await expect(pop).toBeVisible();
  const inside = () => page.evaluate(() => !!document.activeElement?.closest(".popover"));
  await expect.poll(inside).toBe(true);
  for (let i = 0; i < 12; i++) { await page.keyboard.press("Tab"); expect(await inside()).toBe(true); }
  await page.keyboard.press("Escape");
  await expect(pop).toHaveCount(0);
  await expect(sort).toBeFocused();
  await request.post(`/api/fs/trash?path=${encodeURIComponent("db/ux-pop.base")}`, { headers: H }).catch(() => {});
});
