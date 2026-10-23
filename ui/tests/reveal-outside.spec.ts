import { test, expect } from "@playwright/test";

// A tab's menu shows its file in Atlas's explorer and in the system's file manager; the
// latter is the desktop core's alone (the test core runs with ATLAS_NO_BROWSER: nothing is launched).
const H = { "x-atlas": "1" };

test("a tab's menu: show in the explorer, show in the system's file manager", async ({ page, request }) => {
  await request.put("/api/file", { headers: H, data: { path: "reveal/out.md", text: "# out\n" } });
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await page.evaluate(() => (window as unknown as { __atlas: { open(p: string): void } }).__atlas.open("reveal/out.md"));
  await page.getByTestId("sidebar").locator(".tab", { hasText: "out" }).first().click({ button: "right" });
  await expect(page.getByRole("menuitem", { name: "Show in the explorer" })).toBeVisible();
  const outside = page.getByRole("menuitem", { name: "Show in the system's file manager" });
  await expect(outside).toBeVisible();
  const call = page.waitForResponse((r) => r.url().includes("/api/fs/reveal-outside"));
  await outside.click();
  expect((await call).status()).toBe(204);
  await request.post("/api/fs/trash?path=reveal", { headers: H });
});
