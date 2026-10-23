import { test, expect } from "@playwright/test";

// A note can be deleted from its tab: the tab's menu moves it to the Trash.
const H = { "x-atlas": "1" };

test("a note's tab moves it to the Trash, after a yes, and closes", async ({ page, request }) => {
  await request.put("/api/file", { headers: H, data: { path: "notes/to-trash-from-tab.md", text: "# Bye\n" } });
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await page.keyboard.press("Control+p");
  await page.keyboard.type("to-trash-from-tab");
  await expect(page.getByTestId("palette").getByText(/to-trash-from-tab/).first()).toBeVisible();
  await page.keyboard.press("Enter");
  const tab = page.getByTestId("sidebar").locator(".tab", { hasText: "to-trash-from-tab" });
  await expect(tab).toHaveCount(1);
  await tab.click({ button: "right" });
  await page.getByRole("menuitem", { name: "Move to Trash…" }).click();
  await page.getByTestId("palette").getByText("Move notes/to-trash-from-tab.md to the Trash").click();
  await expect(tab).toHaveCount(0);
  await expect.poll(async () => (await request.get("/api/file?path=notes/to-trash-from-tab.md", { headers: H })).status()).toBe(404);
});
