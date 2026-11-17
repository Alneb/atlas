import { test, expect } from "@playwright/test";
import { flingOf, sideways, type Box } from "../src/lib/place-swipe";

// The phone app's places swiped between from their pages (lib/place-swipe.ts): a quick sideways fling on Files or
// Search asks the app (a stand-in AtlasNative here) for the place beside; one that begins in a field or in a box that
// scrolls sideways is that box's. The bottom bar's own fling and the step itself are AtlasActivity's (the device).
test.use({ viewport: { width: 412, height: 760 }, hasTouch: true });

test("what counts as a fling, and what keeps its own sideways gesture", () => {
  expect(flingOf(300, 400, 150, 410, 200)).toBe(1); // to the left: the next place
  expect(flingOf(100, 400, 250, 390, 200)).toBe(-1);
  expect(flingOf(300, 400, 260, 400, 200)).toBe(0); // too short
  expect(flingOf(300, 400, 150, 500, 200)).toBe(0); // as much down as sideways: a scroll
  expect(flingOf(300, 400, 150, 400, 900)).toBe(0); // too slow: a drag, a selection
  const el = (over: Partial<Box> = {}, parent: Box | null = null): Box => ({ parentElement: parent, scrollWidth: 100, clientWidth: 100, tagName: "DIV", ...over });
  const style = new Map<Box, string>();
  const wide = el({ scrollWidth: 400 });
  style.set(wide, "auto");
  expect(sideways(el({}, el()), (b) => style.get(b) ?? "visible")).toBe(false);
  expect(sideways(el({}, wide), (b) => style.get(b) ?? "visible")).toBe(true); // inside a table that scrolls
  const clipped = el({ scrollWidth: 400 }); // wider inside but not scrolling (overflow hidden): not its gesture
  expect(sideways(el({}, clipped), () => "hidden")).toBe(false);
  expect(sideways(el({ tagName: "INPUT" }), () => "visible")).toBe(true);
  expect(sideways(el({ isContentEditable: true }), () => "visible")).toBe(true);
});

test("a fling on Files asks for the next place; one that begins in Search's field does not", async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as { AtlasNative: unknown; swiped: string[] };
    w.swiped = [];
    w.AtlasNative = { ready() {}, tabs() {}, swipe(by: string) { w.swiped.push(by); } };
  });
  await page.goto("/");
  await page.waitForFunction(() => "atlasShell" in window);
  type Shell = { view(k: string): void };
  // a touch from (x0, y) to (x1, y) on the element under `sel`, as a finger makes it
  const fling = (sel: string, x0: number, x1: number, y: number) => page.evaluate(({ sel, x0, x1, y }) => {
    const el = document.querySelector(sel)!;
    const at = (x: number) => new Touch({ identifier: 1, target: el, clientX: x, clientY: y });
    el.dispatchEvent(new TouchEvent("touchstart", { touches: [at(x0)], changedTouches: [at(x0)], bubbles: true }));
    el.dispatchEvent(new TouchEvent("touchmove", { touches: [at(x1)], changedTouches: [at(x1)], bubbles: true }));
    el.dispatchEvent(new TouchEvent("touchend", { touches: [], changedTouches: [at(x1)], bubbles: true }));
  }, { sel, x0, x1, y });
  const swiped = () => page.evaluate(() => (window as unknown as { swiped: string[] }).swiped.slice());

  await page.evaluate(() => (window as unknown as { atlasShell: Shell }).atlasShell.view("files"));
  await expect(page.locator(".pf .row").first()).toBeVisible();
  await fling(".pf .row", 330, 120, 300);
  await expect.poll(swiped).toEqual(["1"]);
  await fling(".pf .row", 80, 300, 300);
  await expect.poll(swiped).toEqual(["1", "-1"]);

  await page.evaluate(() => (window as unknown as { atlasShell: Shell }).atlasShell.view("search"));
  await expect(page.locator(".search-box input")).toBeVisible();
  await fling(".search-box input", 330, 120, 100); // the field's own: moving the caret, selecting
  await page.waitForTimeout(200);
  expect(await swiped()).toEqual(["1", "-1"]);
});
