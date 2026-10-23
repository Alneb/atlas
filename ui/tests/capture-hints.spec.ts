import { test, expect } from "@playwright/test";

// "the capture box's short forms documented in the box itself": empty, the box lists them; while
// typing it says what the text will become — a to-do, and for which day — before Enter.
test("the capture box names its short forms and says what the text will become", async ({ page }) => {
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  const box = page.getByTestId("capture"), what = page.getByTestId("capture-what");
  await expect(what).toContainText("makes a to-do");
  await expect(what).toContainText("@tomorrow");
  await box.fill("an idea about the bath");
  await expect(what).toHaveText("a line in today's log");
  await box.fill("[] call Ana @tomorrow");
  await expect(what).toHaveText("a to-do, due tomorrow");
  await box.fill("todo send the abstract @+3d");
  await expect(what).toHaveText(/^a to-do, due \w+ \d+ \w+|^a to-do, due \w+, \w+ \d+|^a to-do, due /);
  await box.fill("todo");
  await expect(what, "nothing after the word yet: not a to-do").toHaveText("a line in today's log");
  await box.fill("");
});

// "also with completions there": `[[` a note, `#` a tag, `@` a day — in the capture box of Today and in the quick-capture window.
test("the capture box completes a note's name, a tag and a day; Enter takes the suggestion, not the capture", async ({ page }) => {
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  const box = page.getByTestId("capture"), list = page.locator(".ta-complete");
  await box.click();
  await page.keyboard.type("read [[hub");
  await expect(list.getByRole("option", { name: "hubbard" })).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(box).toHaveValue("read [[hubbard]] ");
  await expect(list).toBeHidden();
  await page.keyboard.type("@tom");
  await expect(list.getByRole("option", { name: "@tomorrow" })).toBeVisible();
  await page.keyboard.press("Enter"); // Tab walks the list (as in the editor), Enter takes
  await expect(box).toHaveValue("read [[hubbard]] @tomorrow ");
  await page.keyboard.type("@fr");
  await page.keyboard.press("Escape");
  await expect(list, "Esc closes the list only").toBeHidden();
  await expect(box).toHaveValue("read [[hubbard]] @tomorrow @fr");
  await box.fill("");
});


// "make sure you fix these bugs in notes, but also in capture boxes … and that thay behave the same" (2026-10-15):
// a to-do in the box offers the task fields as a note does (Obsidian Tasks' list), with Enter still saving.
test("a to-do in the capture box offers the task fields as in a note; Enter still saves", async ({ page }) => {
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  const box = page.getByTestId("capture"), list = page.locator(".ta-complete");
  await box.click();
  await page.keyboard.type("TODO water the plants ");
  await expect(list).toContainText("due date");
  await expect(list).toContainText("recurring (repeat)");
  await expect(list.locator('[aria-selected="true"]')).toContainText("new line");
  await box.fill("");
  await expect(list).toBeHidden();
});

// the agent's own files (`editor.index_exclude`, docs/memory here) are never offered to link to, as in a
// note's `[[`; and the list is drawn
// in the window's coordinates, over whatever block comes next ("shows hidden below the other things")
test("the box's [[ list leaves out the agent's files and is drawn over the next block", async ({ page, request }) => {
  await request.put("/api/file", { headers: { "x-atlas": "1" }, data: { path: "docs/memory/hubbard-agent-note.md", text: "# agent\n" } });
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  const box = page.getByTestId("capture"), list = page.locator(".ta-complete");
  await box.click();
  await page.keyboard.type("see [[hubb");
  await expect(list.getByRole("option", { name: "hubbard" }).first()).toBeVisible();
  expect(await list.innerText(), "the agent's note is not offered").not.toContain("agent");
  const r = (await list.boundingBox())!;
  const top = await page.evaluate(({ x, y }) => !!document.elementFromPoint(x, y)?.closest(".ta-complete"), { x: r.x + 20, y: r.y + r.height - 6 });
  expect(top, "the list's last row is not under another block").toBe(true);
  await box.fill("");
});

// "super c does not work" (2026-10-15): a second capture box (another page with a capture block) that went
// away cleared Super+C's one slot while the Home page's box was still there.
test("Super+C reaches the Home box after another page's capture box was closed", async ({ page, request }) => {
  const H = { "x-atlas": "1" };
  await request.put("/api/file", { headers: H, data: { path: "notes/second.page", text: "title: Second\nrows:\n  - [capture]\n" } });
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await request.post("/api/cmd/open", { headers: H, data: { args: { path: "notes/second.page" } } });
  await expect(page.getByTestId("sidebar").locator(".tab", { hasText: "Second" })).toBeVisible();
  await expect(page.getByTestId("capture").first()).toBeVisible();
  // closing it shows Home again: Home's box registers, then the closed page's box unregisters (it used to
  // clear the one slot after Home had taken it)
  await page.getByTestId("sidebar").locator(".tab", { hasText: "Second" }).getByRole("button", { name: /Close/ }).click();
  await expect(page.getByTestId("sidebar").locator(".tab", { hasText: "Second" })).toHaveCount(0);
  await request.post("/api/cmd/open", { headers: H, data: { args: { path: "notes/hubbard.md" } } });
  await expect(page.locator(".cm-content:visible").first()).toBeVisible();
  await page.locator(".cm-content:visible").first().click();
  await page.keyboard.press("Meta+c");
  await expect(page.getByTestId("capture")).toBeFocused();
});
