import { test, expect } from "@playwright/test";

// Files and Search on a phone (docs/guides/MOBILE.md, "Files and Search on a phone"): in the phone app's note view (a fake
// AtlasNative bridge) Files is one folder at a time — in, Back up, open — and Search a large field with wrapping hits; the
// ⋮ menu's file actions (atlasShell.rename / trash / openers) work; an SVG opens as a picture.
test.use({ viewport: { width: 412, height: 760 }, hasTouch: true });

const put = (request: import("@playwright/test").APIRequestContext, path: string, text: string) =>
  request.put("/api/file", { headers: { "x-atlas": "1" }, data: { path, text } });
type Shell = { view(k: string): void; dismiss(): boolean; rename(p: string, n: string): Promise<void>; trash(p: string): Promise<void>; openers(p: string): string };

test.beforeEach(async ({ page, request }) => {
  await put(request, "birds/raptors/kestrel.md", "# kestrel\n\nhovers over the field\n");
  await put(request, "birds/raptors/osprey.md", "# osprey\n\nfishes in the lake\n");
  await put(request, "birds/mark.svg", '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>');
  await page.addInitScript(() => { (window as unknown as { AtlasNative: unknown }).AtlasNative = { ready() {}, tabs() {} }; });
  await page.goto("/");
  await page.waitForFunction(() => "atlasShell" in window);
});

test("Files goes into folders, Back goes up, a tap opens", async ({ page }) => {
  await page.evaluate(() => (window as unknown as { atlasShell: Shell }).atlasShell.view("files"));
  const pf = page.locator(".pf");
  await expect(pf).toBeVisible();
  await pf.locator(".row", { hasText: "birds" }).click();
  await expect(pf.locator(".title")).toHaveText("birds");
  await expect(pf.locator(".row.is-dir").first()).toContainText("raptors"); // folders first
  await pf.locator(".row", { hasText: "raptors" }).click();
  await expect(pf.locator(".row", { hasText: "kestrel" })).toBeVisible();
  const row = await pf.locator(".row", { hasText: "kestrel" }).boundingBox();
  expect(row!.height).toBeGreaterThanOrEqual(56); // a finger's row
  // Back: up a folder, then up again, then nothing left to close
  expect(await page.evaluate(() => (window as unknown as { atlasShell: Shell }).atlasShell.dismiss())).toBe(true);
  await expect(pf.locator(".title")).toHaveText("birds");
  await pf.locator(".row", { hasText: "raptors" }).click();
  await pf.locator(".row", { hasText: "osprey" }).click();
  await expect(page.locator(".cm-content")).toContainText("fishes in the lake");
});

test("Search on a phone: a large field, no expert switches, wrapping hits", async ({ page }) => {
  await page.evaluate(() => (window as unknown as { atlasShell: Shell }).atlasShell.view("search"));
  const box = page.locator(".search-box");
  await expect(box).toBeVisible();
  expect((await box.boundingBox())!.height).toBeGreaterThanOrEqual(46);
  await expect(page.locator(".search-box .opts")).toBeHidden();
  await box.locator("input").fill("hovers");
  await expect(page.locator(".line-hit").first()).toContainText("hovers over the field");
  await expect(page.locator(".line-hit .ln").first()).toBeHidden();
});

test("the ⋮ menu's file actions: rename, open with, trash; an SVG opens as a picture", async ({ page, request }) => {
  const openers = JSON.parse(await page.evaluate(() => (window as unknown as { atlasShell: Shell }).atlasShell.openers("birds/mark.svg"))) as { id: string; isDefault: boolean }[];
  expect(openers.find((o) => o.isDefault)?.id).toBe("image");
  expect(openers.map((o) => o.id)).toContain("editor");
  await page.evaluate(() => (window as unknown as { atlasShell: Shell }).atlasShell.rename("birds/raptors/kestrel.md", "falcon.md"));
  await expect.poll(async () => (await request.get("/api/file?path=birds/raptors/falcon.md", { headers: { "x-atlas": "1" } })).status()).toBe(200);
  await page.evaluate(() => (window as unknown as { atlasShell: Shell }).atlasShell.trash("birds/raptors/falcon.md"));
  await expect.poll(async () => (await request.get("/api/file?path=birds/raptors/falcon.md", { headers: { "x-atlas": "1" } })).status()).toBe(404);
});

test("the phone's Home is the vault's home document (`home` in its config), as on the desktop", async ({ page, request }) => {
  // the phone used to open the built-in Today pane whatever the vault's `home` said
  await put(request, "notes/the-home.md", "# the vault's own home\n\nshown on the phone too\n");
  await page.route("**/api/home", (r) => r.fulfill({ json: { path: "notes/the-home.md", title: null } }));
  await page.reload();
  await page.waitForFunction(() => "atlasShell" in window);
  await page.evaluate(() => (window as unknown as { atlasShell: { home(): void } }).atlasShell.home());
  await expect(page.locator(".dv-active-group .cm-content")).toContainText("shown on the phone too");
});
