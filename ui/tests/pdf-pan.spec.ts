import { test, expect } from "@playwright/test";

// A PDF dragged with the mouse: the select tool drags the page from its
// blank parts (lib/pdf-pan.ts), the middle button drags anywhere.
test("a PDF is dragged with the mouse: left button on its blank parts, middle button anywhere", async ({ page }) => {
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  const files = await page.evaluate(async () => (await (await fetch("/api/files", { headers: { "x-atlas": "1" } })).json()) as string[]);
  const pdf = files.find((f) => f.endsWith(".pdf"));
  test.skip(!pdf, "no PDF in the test vault");
  await page.evaluate((p) => (window as unknown as { __atlas: { open(p: string): void } }).__atlas.open(p), pdf!);
  const viewer = page.locator(".atlas-pane-pdf .viewer-container").first();
  await expect(viewer.locator(".page").first()).toBeVisible({ timeout: 15_000 });
  const room = await viewer.evaluate((el) => el.scrollHeight - el.clientHeight);
  test.skip(room < 300, "the PDF is too short to drag");
  const box = (await viewer.boundingBox())!;
  const top = () => viewer.evaluate((el) => el.scrollTop);

  // the left button on the grey beside the page
  const x = box.x + 6, y = box.y + box.height * 0.7;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y - 200, { steps: 6 });
  await page.mouse.up();
  const afterLeft = await top();
  expect(afterLeft).toBeGreaterThan(150);

  // the middle button, over the page itself
  const cx = box.x + box.width / 2, cy = box.y + box.height * 0.7;
  await page.mouse.move(cx, cy);
  await page.mouse.down({ button: "middle" });
  await page.mouse.move(cx, cy - 150, { steps: 6 });
  await page.mouse.up({ button: "middle" });
  expect(await top()).toBeGreaterThan(afterLeft + 100);
  // nothing was selected by the drags
  expect(await page.evaluate(() => String(getSelection() ?? ""))).toBe("");
});
