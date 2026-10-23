import { test, expect } from "@playwright/test";

// The explorer on a touch screen (the Boox: "the file explorer from the web also needs some tweaking for
// touchscreens"): a tap opens, rows a finger can hit, and the places as a menu when the pane is too narrow for them.
const H = { "x-atlas": "1" };
test.use({ hasTouch: true });

test("touch: a tap goes into a folder and opens a file; narrow, the places are a menu", async ({ page, request }) => {
  await request.put("/api/file", { headers: H, data: { path: "touch-test/inner/tapped.md", text: "# Tapped\n\nopened by a tap\n" } });
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await page.keyboard.press("F1");
  await page.keyboard.type("the explorer");
  await page.getByTestId("palette").getByText("Files: the explorer (vault, SSH hosts, servers)", { exact: true }).first().click();
  const pane = page.locator(".explorer");
  const row = (name: string) => pane.locator(".x-row", { has: page.locator(".label", { hasText: new RegExp(`^${name.replace(/[.]/g, "\\.")}$`) }) });
  expect((await row("touch-test").boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await row("touch-test").tap();
  await row("inner").tap();
  expect(await row("tapped.md").getAttribute("draggable")).toBe("false");

  await page.setViewportSize({ width: 560, height: 900 });
  await expect(pane.locator(".places")).toBeHidden();
  await pane.locator(".places-btn").tap();
  await expect(page.getByRole("menuitem").first()).toBeVisible();
  await page.keyboard.press("Escape");

  await row("tapped.md").tap();
  await expect(page.getByText("opened by a tap")).toBeVisible();
});
