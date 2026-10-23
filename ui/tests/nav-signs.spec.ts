import { test, expect } from "@playwright/test";

// Travelling the history shows itself (lib/nav-signs.ts): a swipe's arrow at the edge, then a pill
// naming where it went — "← Back · <title> · n of m".
const H = { "x-atlas": "1" };

test("a swipe back shows the edge arrow and the history pill", async ({ page, request }) => {
  for (const n of ["sign-one", "sign-two"]) await request.put("/api/file", { headers: H, data: { path: `notes/${n}.md`, text: `# ${n}\n` } });
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  for (const n of ["sign-one", "sign-two"]) {
    await page.keyboard.press("Control+p");
    await page.keyboard.type(`${n}.md`);
    await expect(page.getByTestId("palette").getByText(`${n}`, { exact: true }).first()).toBeVisible();
    await page.keyboard.press("Enter");
    await expect(page.locator(".cm-content:visible").first()).toContainText(n);
  }
  await page.mouse.move(600, 400);
  await page.mouse.wheel(-60, 0); // two fingers to the right: back
  await expect(page.locator(".nav-edge[data-side=left]")).toBeVisible();
  for (let i = 0; i < 4; i++) await page.mouse.wheel(-60, 0);
  await expect(page.locator(".nav-pill")).toContainText("Back · sign-one");
  await expect(page.locator(".nav-edge")).toBeHidden();
});
