import { test, expect, type Page, type APIRequestContext } from "@playwright/test";
import { shownName } from "../src/lib/paths";
import { openFile as openInPalette } from "./open";

// Back / forward like a browser: the mouse's side buttons and a horizontal two-finger swipe (nav-input.ts).
const H = { "x-atlas": "1" };
const put = (r: APIRequestContext, path: string, text: string) => r.put("/api/file", { headers: H, data: { path, text } });

async function openFile(page: Page, name: string) {
  await openInPalette(page, name);
  await expect(page.locator(".dv-tab.dv-active-tab")).toContainText(shownName(name));
  await expect(page.locator(".dv-active-group .cm-editor.cm-focused")).toBeVisible(); // else the next Ctrl+P races the focus
}
// Playwright's mouse has no side buttons: send what the webview delivers for them
const sideButton = (page: Page, button: 3 | 4) =>
  page.evaluate((b) => window.dispatchEvent(new MouseEvent("mouseup", { button: b, bubbles: true })), button);
const swipe = (page: Page, dx: number) =>
  page.evaluate((d) => {
    const el = document.querySelector(".dv-active-group .cm-content") ?? document.body;
    for (let i = 0; i < 6; i++) el.dispatchEvent(new WheelEvent("wheel", { deltaX: d / 6, deltaY: 0, bubbles: true }));
  }, dx);
const active = (page: Page) => page.locator(".dv-tab.dv-active-tab");

test("mouse side buttons go back and forward over visited panes", async ({ page, request }) => {
  await put(request, "notes/nav-one.md", "# one\n");
  await put(request, "notes/nav-two.md", "# two\n");
  await page.goto("/");
  await openFile(page, "nav-one.md");
  await openFile(page, "nav-two.md");
  await sideButton(page, 3);
  await expect(active(page)).toContainText("nav-one");
  await sideButton(page, 4);
  await expect(active(page)).toContainText("nav-two");
});

test("a horizontal swipe goes back; a closed pane is reopened", async ({ page, request }) => {
  await put(request, "notes/nav-three.md", "# three\n");
  await put(request, "notes/nav-four.md", "# four\n");
  await page.goto("/");
  await openFile(page, "nav-three.md");
  await openFile(page, "nav-four.md");
  // visit nav-three again and close it (Ctrl+W): going back from nav-four must reopen it
  await openFile(page, "nav-three.md"); // the existing pane comes forward
  await page.keyboard.press("Control+w");
  await expect(page.locator(".dv-tab", { hasText: "nav-three" })).toHaveCount(0);
  await expect(active(page)).toContainText("nav-four");
  await swipe(page, -300);
  await expect(active(page)).toContainText("nav-three");
});

test("a two-finger swipe on a drawing pans it and never goes back", async ({ page, request }) => {
  await put(request, "notes/nav-five.md", "# five\n");
  await put(request, "notes/nav-pan.excalidraw", JSON.stringify({ type: "excalidraw", version: 2, source: "atlas", elements: [], appState: {}, files: {} }));
  await page.goto("/");
  await openFile(page, "nav-five.md");
  await page.keyboard.press("Control+p");
  await page.keyboard.type("nav-pan");
  await expect(page.getByTestId("palette").getByText("nav-pan.excalidraw").first()).toBeVisible();
  await page.keyboard.press("Enter");
  const canvas = page.locator(".excalidraw canvas").last();
  await canvas.waitFor({ timeout: 20000 });
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  for (let i = 0; i < 8; i++) await page.mouse.wheel(-60, 0); // fingers to the right: "back" anywhere else
  await page.waitForTimeout(300);
  await expect(active(page)).toContainText("nav-pan");
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).overscrollBehaviorX)).toBe("none"); // nor the browser's own
});

// "the pinch touchpad gesture zooms the whole app, that should not happen, specially in excalidraw" (2026-10-19): a pinch
// (a wheel with Ctrl, or WebKit's gesture events) is cancelled at the window, after the view under it had it
test("a pinch never zooms the app itself; a plain wheel is left alone", async ({ page }) => {
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  const cancelled = (ctrlKey: boolean) => page.evaluate((ctrl) => {
    const e = new WheelEvent("wheel", { deltaY: -40, ctrlKey: ctrl, bubbles: true, cancelable: true });
    document.body.dispatchEvent(e);
    return e.defaultPrevented;
  }, ctrlKey);
  expect(await cancelled(true)).toBe(true);
  expect(await cancelled(false)).toBe(false);
  expect(await page.evaluate(() => { const e = new Event("gesturechange", { bubbles: true, cancelable: true }); document.body.dispatchEvent(e); return e.defaultPrevented; })).toBe(true);
});
