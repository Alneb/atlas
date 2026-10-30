import { test, expect } from "@playwright/test";

// A notice with the focus in it (a keyboard user on its Close or Undo) stays, as one under the pointer does.
const H = { "x-atlas": "1" };

test("a notice holding the focus stays past its time, and goes once the focus leaves", async ({ page, request }) => {
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await page.mouse.move(5, 5);
  await request.post("/api/cmd/notify", { headers: H, data: { args: { title: "Keep me while focused", body: "" } } });
  const t = page.locator(".toast", { hasText: "Keep me while focused" });
  await t.getByRole("button", { name: "Close" }).focus();
  await page.waitForTimeout(5500); // past the 4.5 s a notice lives
  await expect(t).toBeVisible();
  await page.evaluate(() => (document.activeElement as HTMLElement).blur());
  await expect(t).toHaveCount(0, { timeout: 8000 });
});
