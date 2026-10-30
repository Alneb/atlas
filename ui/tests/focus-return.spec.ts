import { test, expect } from "@playwright/test";

// What opens over the page gives the focus back when it closes: the keys typed next go to the note again, not nowhere.
test("the command bar and the capture popup give the focus back to the note when they close", async ({ page, request }) => {
  const H = { "x-atlas": "1" };
  await request.put("/api/file", { headers: H, data: { path: "notes/focus-return.md", text: "start\n" } });
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await request.post("/api/cmd/open", { headers: H, data: { args: { path: "notes/focus-return.md" } } });
  const cm = page.locator(".cm-content:visible").first();
  await expect(cm).toContainText("start");
  await cm.click();
  await page.keyboard.type("ggA"); // the test vault has vim keys: insert at the end of the first line
  for (const [open, typed] of [["Meta+e", "1"], ["Meta+c", "2"]] as const) {
    await page.keyboard.press(open);
    await expect(page.locator("input:focus, textarea:focus")).toHaveCount(1);
    await page.keyboard.press("Escape");
    await expect(cm).toBeFocused();
    // CodeMirror puts its caret back a moment after the focus (a key typed within a frame, faster than any hand, is lost)
    await expect.poll(() => page.evaluate(() => {
      const n = getSelection()?.anchorNode;
      return !!n && !!document.querySelector(".cm-content:focus")?.contains(n);
    })).toBe(true);
    await page.keyboard.type(typed);
  }
  await expect(cm).toContainText("start12");
});
