import { test, expect } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { WS } from "../playwright.config";
import { textPdf } from "./fixtures/pdf";

// A PDF dragged with the mouse: the select tool drags the page from its
// blank parts (lib/pdf-pan.ts), the middle button drags anywhere.
test("a PDF is dragged with the mouse: left button on its blank parts, middle button anywhere", async ({ page }) => {
  // its own PDF: the vault's first one may be another spec's stand-in that does not render
  const pdf = "pdfs/pan.pdf";
  mkdirSync(join(WS, "pdfs"), { recursive: true });
  writeFileSync(join(WS, pdf), textPdf([1, 2, 3].map((n) => ({ lines: [`Page ${n}`] }))));
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await page.evaluate((p) => (window as unknown as { __atlas: { open(p: string): void } }).__atlas.open(p), pdf);
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
