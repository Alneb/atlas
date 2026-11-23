import { test, expect } from "@playwright/test";
import { openFile } from "./open";

// Closing the terminal's tab removes its group, and dockview re-parents the note beside it: the browser drops the
// note's scroll. The note keeps its place (pane-scroll.ts `putBackScrolls`, called when a group comes or goes).
const H = { "x-atlas": "1" };

test("a note keeps its scroll when the terminal tab below it closes", async ({ page, request }) => {
  const text = "# Long\n\n" + Array.from({ length: 300 }, (_, i) => `Line ${i} of a long note.`).join("\n\n") + "\n";
  await request.put("/api/file", { headers: H, data: { path: "notes/long-scroll.md", text } });
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await openFile(page, "long-scroll.md");
  const scroller = page.locator(".cm-scroller").filter({ visible: true }).first();
  await scroller.evaluate((el) => { el.scrollTop = 3000; });
  await page.waitForTimeout(300);
  await page.keyboard.press("Control+`");
  await expect(page.locator(".term-pane .xterm-screen").first()).toBeVisible();
  const before = await scroller.evaluate((el) => el.scrollTop);
  expect(before, "scrolled well down").toBeGreaterThan(1000);
  await page.locator(".term-pane").first().click();
  await page.keyboard.press("Meta+w");
  await expect(page.locator(".term-pane")).toHaveCount(0);
  await page.waitForTimeout(300);
  expect(Math.abs((await scroller.evaluate((el) => el.scrollTop)) - before)).toBeLessThan(40);
});
