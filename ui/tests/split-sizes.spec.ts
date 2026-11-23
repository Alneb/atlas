import { test, expect, type Page } from "@playwright/test";
import { openPalette } from "./open";
import { shownName } from "../src/lib/paths";

// The tool panels keep the size the person set: closing a split among the editors gives its room to the editors, not
// to the terminal panel (which used to grow, and keep that size as its own).
async function open(page: Page, name: string) {
  await openPalette(page);
  await page.keyboard.type(name);
  await expect(page.getByTestId("palette").locator(".item.sel")).toContainText(shownName(name));
  await page.keyboard.press("Enter");
}
const shown = (page: Page) => page.locator(".editor-pane").filter({ visible: true }).count();
const termHeight = (page: Page) => page.locator(".term-pane").first().evaluate((el) => Math.round((el.closest(".dv-groupview") ?? el).getBoundingClientRect().height));

test("the terminal panel keeps its dragged height when a split beside closes", async ({ page }) => {
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await open(page, "journal.md");
  await open(page, "paste.md");
  await page.keyboard.press("Control+`");
  await expect(page.locator(".term-pane .xterm-screen").first()).toBeVisible();
  // drag the bar above the terminal 120 px up
  const term = (await page.locator(".term-pane").first().boundingBox())!;
  const bars = await page.locator(".dv-sash:visible").evaluateAll((s) => s.map((x) => x.getBoundingClientRect()).map((r) => ({ x: r.x, y: r.y, w: r.width, h: r.height })));
  const bar = bars.filter((b) => b.w > b.h).sort((a, b) => Math.abs(a.y - term.y) - Math.abs(b.y - term.y))[0];
  expect(bar, "a horizontal bar above the terminal").toBeTruthy();
  await page.mouse.move(bar.x + bar.w / 2, bar.y + bar.h / 2);
  await page.mouse.down();
  await page.mouse.move(bar.x + bar.w / 2, bar.y + bar.h / 2 - 120, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(300);
  const set = await termHeight(page);
  // split the editors (a new group among them), then close that half
  const side = page.getByTestId("sidebar");
  await side.locator(".tab", { hasText: "paste" }).first().click({ button: "right" });
  await page.getByRole("menuitem", { name: "Split right" }).click();
  await expect.poll(() => shown(page)).toBe(2);
  const half = side.getByTestId("split-row").locator(".tab", { hasText: "paste" });
  await half.hover();
  await half.getByRole("button", { name: "Close paste" }).dispatchEvent("mousedown", { button: 0 });
  await expect.poll(() => shown(page)).toBe(1);
  await expect.poll(() => termHeight(page)).toBeLessThanOrEqual(set + 3);
  expect(await termHeight(page)).toBeGreaterThanOrEqual(set - 3);
});
