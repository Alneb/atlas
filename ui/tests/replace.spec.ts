import { test, expect } from "@playwright/test";
const H = { "x-atlas": "1" };

// VS Code's replace in files: Ctrl+Shift+H, a preview on every hit, files can be left out, a confirm.
test("replace across files: preview, exclude a file, confirm, written to disk", async ({ page, request }) => {
  await request.put("/api/file", { headers: H, data: { path: "notes/rep-a.md", text: "colour one\ncolour two\n" } });
  await request.put("/api/file", { headers: H, data: { path: "notes/rep-b.md", text: "a colour kept\n" } });
  const text = (f: string) => request.get(`/api/file?path=${f}`, { headers: H }).then((r) => r.json()).then((j) => j.text);
  await page.goto("/");
  await page.keyboard.press("Control+Shift+h");
  await expect(page.getByRole("textbox", { name: "Search", exact: true }), "nothing searched yet: the search box first").toBeFocused();
  await page.getByRole("textbox", { name: "Search", exact: true }).fill("colour");
  await page.getByLabel("Replace with").fill("color");
  await expect(page.locator(".line-hit .new").first()).toHaveText("color");
  await page.getByRole("button", { name: "Exclude notes/rep-b.md" }).click();
  await page.getByRole("button", { name: "Replace all" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Replace 2 matches in 1 file?");
  await dialog.getByRole("button", { name: "Replace all" }).click();
  await expect.poll(() => text("notes/rep-a.md")).toBe("color one\ncolor two\n");
  expect(await text("notes/rep-b.md")).toBe("a colour kept\n");
  await expect(page.locator(".hit-file", { hasText: "rep-a" })).toHaveCount(0); // re-searched
});

// a text hit's right-click: its line copied, its file left out of the replace (and back), its file's rows after
test("a text hit's right-click copies its line and leaves its file out of the replace", async ({ page, request, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await request.put("/api/file", { headers: H, data: { path: "notes/rep-menu.md", text: "intro\n  a flavourful line\n" } });
  await page.goto("/");
  await page.keyboard.press("Control+Shift+h");
  await page.getByRole("textbox", { name: "Search", exact: true }).fill("flavourful");
  await page.getByLabel("Replace with").fill("flavorful");
  const hit = page.locator(".line-hit", { hasText: "flavourful" });
  await hit.click({ button: "right" });
  const menu = page.getByRole("menu");
  await expect(menu.getByRole("menuitem", { name: /Open beside/ })).toBeVisible();
  await page.screenshot({ path: test.info().outputPath("hit-menu.png") });
  await menu.getByRole("menuitem", { name: /Leave out of the replace/ }).click();
  await expect(page.locator(".hit-file", { hasText: "rep-menu" })).toHaveClass(/out/);
  await hit.click({ button: "right" });
  await page.getByRole("menu").getByRole("menuitem", { name: /Include in the replace/ }).click();
  await expect(page.locator(".hit-file", { hasText: "rep-menu" })).not.toHaveClass(/out/);
  await hit.click({ button: "right" });
  await page.getByRole("menu").getByRole("menuitem", { name: /Copy the line/ }).click();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe("a flavourful line");
});
