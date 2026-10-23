import { test, expect } from "@playwright/test";
const H = { "x-atlas": "1" };

// docs/design/MALLEABLE.md R4 (Embark): a ```view block draws the tasks of its section as a calendar; ticking
// a task in the calendar writes [x] in the note, and the block follows the note as it changes.
test("a view block shows its section's dated tasks as a calendar, and ticks them", async ({ page, request }) => {
  const note = "# Week\n\n## Monday\n\n- [ ] read Georges 📅 2026-10-12\n- [ ] run U=4 sweep 📅 2026-10-13\n- [ ] someday\n\n```view\ntype: calendar\n```\n\n## Other\n\n- [ ] not mine 📅 2026-10-14\n";
  await request.put("/api/file", { headers: H, data: { path: "notes/week.md", text: note } });
  const text = () => request.get("/api/file?path=notes/week.md", { headers: H }).then((r) => r.json()).then((j) => j.text as string);
  await page.goto("/");
  await page.keyboard.press("Control+p");
  await page.keyboard.type("week.md");
  await expect(page.getByTestId("palette").getByText("week", { exact: true }).first()).toBeVisible();
  await page.keyboard.press("Enter");
  const cal = page.locator(".cm-content .atlas-view-calendar");
  await expect(cal).toContainText("October 2026", { ignoreCase: true });
  await expect(cal.locator(".item")).toHaveCount(2); // the section's dated tasks only
  await expect(cal.locator(".undated")).toContainText("someday");
  await expect(cal).not.toContainText("not mine");
  await cal.getByRole("checkbox", { name: "Done: read Georges" }).check();
  await expect.poll(text).toContain("- [x] read Georges 📅 2026-10-12");
  await expect(cal.locator(".item.done")).toHaveCount(1);
  // the note changes elsewhere → the block follows
  await request.put("/api/file", { headers: H, data: { path: "notes/week.md", text: (await text()).replace("- [ ] someday", "- [ ] someday 📅 2026-10-15") } });
  await expect(cal.locator(".item")).toHaveCount(3);
});

// "sometimes the views dont render until i open the code and go out again" (2026-10-21): a hidden tab's DOM is
// detached (dockview onlyWhenVisible); a sweep on isConnected unmounted its views after 4 s, back blank.
test("a view block is still drawn after its tab was hidden a while", async ({ page, request }) => {
  await request.put("/api/file", { headers: H, data: { path: "notes/hidden-week.md", text: "# W\n\n- [ ] one 📅 2026-10-12\n\n```view\ntype: calendar\n```\n" } });
  await request.put("/api/file", { headers: H, data: { path: "notes/hidden-other.md", text: "# other\n" } });
  await page.goto("/");
  for (const name of ["hidden-week", "hidden-other", "hidden-week"]) { // the last brings the existing pane forward
    if (name === "hidden-week" && (await page.locator(".dv-tab", { hasText: "hidden-other" }).count())) await page.waitForTimeout(5000); // past the old sweep
    await page.keyboard.press("Control+p");
    await page.keyboard.type(`${name}.md`);
    await expect(page.getByTestId("palette").getByText(name, { exact: true }).first()).toBeVisible();
    await page.keyboard.press("Enter");
    await expect(page.locator(".dv-tab.dv-active-tab")).toContainText(name);
    await expect(page.locator(".dv-active-group .cm-editor.cm-focused")).toBeVisible(); // else the next Ctrl+P races the focus
  }
  await expect(page.locator(".cm-content .atlas-view-calendar .item")).toHaveCount(1);
});
