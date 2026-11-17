import { test, expect } from "@playwright/test";

// The row above the phone's keyboard (components/KeyboardBar.svelte): it shows while a note is typed in with the keyboard up, its keys
// keep the keyboard (the note keeps the focus), Indent / To-do / [[ do what Tab, the to-do key and typing do, Dictate
// hands the phone's words to the caret, and Hide the keyboard takes it away.
test.use({ viewport: { width: 412, height: 760 }, hasTouch: true });

test("the keyboard bar: shown while typing, its keys edit the note and keep the focus", async ({ page, request }) => {
  await request.put("/api/file", { headers: { "x-atlas": "1" }, data: { path: "phone-kbar.md", text: "buy milk\n" } });
  await page.addInitScript(() => {
    const w = window as unknown as { AtlasNative: unknown; atlasDictated?: (t: string) => void };
    w.AtlasNative = { ready() {}, tabs() {}, dictate() { setTimeout(() => w.atlasDictated?.("and bread"), 10); } };
  });
  await page.goto("/");
  await page.waitForFunction(() => "atlasShell" in window);
  await page.evaluate(() => (window as unknown as { atlasShell: { view(k: string): void } }).atlasShell.view("files"));
  await page.locator(".pf .row", { hasText: "phone-kbar" }).click();
  const content = page.locator(".cm-content").filter({ hasText: "buy milk" }).first();
  await expect(content).toBeVisible();
  const bar = page.getByTestId("keyboard-bar");
  await expect(bar).toHaveCount(0); // a note opens to be read
  await page.locator(".cm-line", { hasText: "buy milk" }).click(); // the line itself: the content's middle is the empty line under it
  await page.keyboard.press("End");
  await expect(bar).toHaveCount(0); // focused, but no keyboard yet
  // the keyboard comes up: the app's window shrinks under it
  await page.setViewportSize({ width: 412, height: 460 });
  await expect(bar).toBeVisible();

  await bar.getByRole("button", { name: "To-do (again: done)" }).click();
  await expect(content).toContainText("- [ ] buy milk");
  await bar.getByRole("button", { name: "Indent" }).click();
  await expect.poll(() => page.evaluate(() => document.querySelector(".cm-line")?.textContent ?? "")).toMatch(/^\s+- \[ \] buy milk$/);
  await bar.getByRole("button", { name: "Dictate" }).click();
  await expect(content).toContainText("buy milk and bread");
  await expect.poll(() => page.evaluate(() => !!document.activeElement?.closest(".cm-editor"))).toBe(true);
  await bar.getByRole("button", { name: "Link to a note" }).click();
  await expect(content).toContainText("and bread[[");

  // the note above ends at the bar's top: nothing of it under the bar
  const editorBottom = await page.locator(".cm-editor").first().evaluate((e) => e.getBoundingClientRect().bottom);
  const barTop = await bar.evaluate((e) => e.getBoundingClientRect().top);
  expect(editorBottom).toBeLessThanOrEqual(barTop + 1);

  // Back hides the keyboard and leaves the focus: the row goes with the keyboard
  await page.setViewportSize({ width: 412, height: 760 });
  await expect(bar).toHaveCount(0);
  expect(await page.evaluate(() => !!document.activeElement?.closest(".cm-editor"))).toBe(true);
  await page.setViewportSize({ width: 412, height: 460 });
  await expect(bar).toBeVisible();
  await page.keyboard.press("Escape"); // the [[ picker
  await bar.getByRole("button", { name: "Hide the keyboard" }).click();
  await expect(bar).toHaveCount(0);
});
