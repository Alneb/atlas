import { test, expect } from "@playwright/test";

test("markdown: [[ link completion, / slash menu, foldable headings", async ({ page, request }) => {
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await page.keyboard.press("Control+p");
  await page.keyboard.type("aids.md");
  await expect(page.getByTestId("palette").getByText("aids", { exact: true }).first()).toBeVisible();
  await page.keyboard.press("Enter");
  await page.locator(".cm-content").click();
  await page.keyboard.press("Escape");
  await page.keyboard.type("Go"); // vim: new last line, insert mode
  await page.keyboard.type("See [[FOC");
  await expect(page.locator(".cm-tooltip-autocomplete")).toContainText("FOCUS");
  await page.waitForTimeout(120);
  await page.keyboard.press("Enter");
  await expect(page.locator(".cm-line").last()).toHaveText("See [[FOCUS]]");
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await page.keyboard.type("/to-d");
  await expect(page.locator(".cm-tooltip-autocomplete")).toContainText("To-do");
  await page.waitForTimeout(120); // CodeMirror ignores Enter for 75 ms after a list opens (interactionDelay)
  await page.keyboard.press("Enter");
  await page.keyboard.type("buy chalk");
  // what matters is the saved markdown (the live preview hides "- [ ]" while the caret is on the line)
  await expect.poll(async () => (await (await request.get("/api/file?path=notes/aids.md", { headers: { "x-atlas": "1" } })).json()).text)
    .toContain("See [[FOCUS]]\n- [ ] buy chalk");
  // fold the "# Aids" section from its heading line (vim: Escape, gg), then check it collapsed
  await page.keyboard.press("Escape");
  await page.keyboard.type("gg");
  await page.keyboard.press("Control+Shift+BracketLeft");
  await expect(page.locator(".cm-foldPlaceholder")).toBeVisible();
});

// "the [[ autocompletion was a bit lackluster": the core's list (GET /api/link-targets) — an alias
// links as [[name|alias]], the selected note is previewed, a name nothing has is offered as a new note, and
// after #^ come the target's block ids.
test("[[ finds aliases, previews the note, offers a new note, and lists block ids", async ({ page, request }) => {
  const H = { "x-atlas": "1" };
  await request.put("/api/file", { headers: H, data: { path: "notes/lt-impurity.md", text: "---\naliases: [Anderson problem]\n---\nThe zqx impurity text.\n\nA key claim ^claim1\n" } });
  await request.put("/api/file", { headers: H, data: { path: "notes/lt-write.md", text: "# Write\n\n" } });
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await page.request.post("/api/cmd/open", { headers: H, data: { args: { path: "notes/lt-write.md" } } });
  await page.locator(".dv-active-group .cm-content").click();
  await page.keyboard.press("Control+End");
  if (await page.locator(".cm-fat-cursor").count()) await page.keyboard.press("i");
  const list = page.locator(".cm-tooltip-autocomplete");
  const text = () => page.evaluate(() => (window as any).__atlas.editor().text as string);

  await page.keyboard.type("[[anderson pro");
  await expect(list.locator("li").first()).toContainText("Anderson problem");
  await expect(list.locator("li").first()).toContainText("→ lt-impurity");
  await expect(page.locator(".cm-completionInfo")).toContainText("The zqx impurity text."); // the preview, no frontmatter
  await page.waitForTimeout(120);
  await page.keyboard.press("Enter");
  await expect.poll(text).toContain("[[lt-impurity|Anderson problem]]");

  await page.keyboard.type(" [[zzq brand new");
  await expect(list.locator("li", { hasText: "new note" })).toContainText("zzq brand new");
  await page.waitForTimeout(120);
  await page.keyboard.press("Enter");
  await expect.poll(text).toContain("[[zzq brand new]]");

  await page.keyboard.type(" [[lt-impurity#^");
  await expect(list.locator("li").first()).toContainText("^claim1");
  await expect(list.locator("li").first()).toContainText("A key claim");
  await page.waitForTimeout(120);
  await page.keyboard.press("Enter");
  await expect.poll(text).toContain("[[lt-impurity#^claim1]]");
});

// "the [[ autocomplete needs to be smarter not just alphabetical, otherwise all dates just appear first":
// the core ranks by match quality, then use (opened, linked, linked to, changed lately); daily notes wait below
// the rest unless a date is typed (link_targets.rs).
test("[[ ranks by use and keeps daily notes below the rest unless a date is typed", async ({ page, request }) => {
  const H = { "x-atlas": "1" };
  const put = (path: string, text: string) => request.put("/api/file", { headers: H, data: { path, text } });
  await put("notes/rkq gamma.md", "c\n"); // the oldest of the three: newest-first would not put it first
  await put("notes/rkq alpha.md", "a\n");
  await put("notes/rkq beta.md", "b\n");
  await put("notes/zz-src1.md", "see [[rkq gamma]]\n");
  await put("notes/zz-src2.md", "and [[rkq gamma]]\n");
  await put("notes/2026-10-14.md", "# day\n"); // dated by its name; not in log/, which Today's specs browse
  await put("notes/rk-write.md", "# Write\n\n");
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await page.request.post("/api/cmd/open", { headers: H, data: { args: { path: "notes/rk-write.md" } } });
  await page.locator(".dv-active-group .cm-content").click();
  await page.keyboard.press("Control+End");
  if (await page.locator(".cm-fat-cursor").count()) await page.keyboard.press("i");
  const first = page.locator(".cm-tooltip-autocomplete li").first();
  const label = first.locator(".cm-completionLabel");

  await page.keyboard.type("[[");
  await expect(first).toBeVisible();
  await expect(label).not.toHaveText(/^\d{4}-\d{2}/); // the fixture's fresh days no longer lead
  await page.keyboard.type("rkq");
  await expect(first).toContainText("rkq gamma"); // linked to by two notes, the others by none
  for (let i = 0; i < 3; i++) await page.keyboard.press("Backspace");
  await page.keyboard.type("2026-");
  await expect(label).toHaveText(/(^|\/)2026-/); // a date typed: the days come first (one sharing its name shows its folder)
});
