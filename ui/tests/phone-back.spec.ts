import { test, expect, type Page } from "@playwright/test";

// A phone's Back (lib/back.ts): what is open over the page closes first, then Atlas goes back a place, and only then
// does Back leave — in a phone's browser (its history) and in the phone app (AtlasActivity asks atlasShell.dismiss()).
test.use({ viewport: { width: 390, height: 760 }, hasTouch: true });

const openNote = async (page: Page, name: string) => {
  // the palette from anywhere (in a note, Ctrl+P is the editor's); right after the load the keymap may not be in yet
  const palette = page.getByTestId("palette");
  await expect(async () => {
    if (!(await palette.isVisible())) await page.keyboard.press("Meta+e"); // again on an open one: capture mode
    await expect(palette).toBeVisible({ timeout: 800 });
  }).toPass({ timeout: 8000 });
  const input = palette.locator("input");
  await input.fill(name); // into the palette's box, whatever has the focus a moment after a note opened
  await expect(page.locator("[data-testid=palette-item].sel")).toContainText(name.replace(/\.md$/, "")); // the file found, chosen
  await input.press("Enter");
  await expect(page.locator(".phone-top .title")).toContainText(name.replace(/\.md$/, ""));
};

test("in a phone's browser, Back closes the palette, then returns to the previous note, before leaving Atlas", async ({ page, request }) => {
  for (const n of ["kestrel", "osprey"]) await request.put("/api/file", { headers: { "x-atlas": "1" }, data: { path: `notes/${n}.md`, text: `# ${n}\n\nbody\n` } });
  await page.goto("/");
  await expect(page.locator(".phone-bar")).toBeVisible();
  const app = page.url();
  await openNote(page, "kestrel.md");
  await openNote(page, "osprey.md");
  await page.locator(".phone-bar button", { hasText: "Commands" }).click(); // a touch: the guard entry is in place
  await expect(page.getByTestId("palette")).toBeVisible();

  await page.goBack();
  await expect(page.getByTestId("palette")).toBeHidden();
  expect(page.url()).toBe(app);
  await page.locator(".phone-top").click();
  await page.goBack();
  await expect(page.locator(".phone-top .title")).toContainText("kestrel");
  expect(page.url()).toBe(app);
});

test("in the phone app, the system Back asks the page first: the palette, a Settings area, then nothing", async ({ page }) => {
  await page.addInitScript(() => { (window as unknown as { AtlasNative: unknown }).AtlasNative = { ready() {}, tabs() {} }; });
  await page.goto("/");
  await page.waitForFunction(() => "atlasShell" in window);
  const dismiss = () => page.evaluate(() => (window as unknown as { atlasShell: { dismiss(): boolean } }).atlasShell.dismiss());
  expect(await dismiss()).toBe(false); // nothing open: the app goes back a place itself

  await page.keyboard.press("Control+p");
  await expect(page.getByTestId("palette")).toBeVisible();
  expect(await dismiss()).toBe(true);
  await expect(page.getByTestId("palette")).toBeHidden();

  await page.evaluate(() => (window as unknown as { atlasShell: { view(k: string): void } }).atlasShell.view("settings"));
  const areas = page.locator(".settings nav");
  await expect(areas).toBeVisible();
  await areas.locator("button").nth(1).click();
  await expect(areas).toBeHidden(); // one area as its own page
  expect(await dismiss()).toBe(true);
  await expect(areas).toBeVisible(); // back to the list of areas
  expect(await dismiss()).toBe(false);
});

test("in a phone's browser, a sideways swipe on the top bar shows the next tab, and back", async ({ page, request }) => {
  for (const n of ["heron", "plover"]) await request.put("/api/file", { headers: { "x-atlas": "1" }, data: { path: `notes/${n}.md`, text: `# ${n}\n` } });
  await page.goto("/");
  await expect(page.locator(".phone-bar")).toBeVisible();
  await openNote(page, "heron.md");
  await openNote(page, "plover.md");
  const swipe = (dx: number) => page.locator(".phone-top").evaluate((bar, dx) => {
    const at = (x: number) => [new Touch({ identifier: 1, target: bar, clientX: x, clientY: 20 })];
    bar.dispatchEvent(new TouchEvent("touchstart", { touches: at(200), changedTouches: at(200), bubbles: true }));
    bar.dispatchEvent(new TouchEvent("touchend", { touches: [], changedTouches: at(200 + dx), bubbles: true }));
  }, dx);
  await swipe(120); // to the right: the tab before
  await expect(page.locator(".phone-top .title")).toContainText("heron");
  await swipe(-120);
  await expect(page.locator(".phone-top .title")).toContainText("plover");
  await swipe(20); // too short: nothing
  await expect(page.locator(".phone-top .title")).toContainText("plover");
});

// An app (Home, Library) is not one of the groups' tabs: the top bar names it all the same, not "Atlas".
test("the phone's top bar names an open app as it names a note", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".phone-bar")).toBeVisible();
  await page.locator(".phone-bar button", { hasText: "Home" }).click();
  await expect(page.locator(".phone-top .title")).toHaveText("Home");
});
