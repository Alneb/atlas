import { test, expect, type Page } from "@playwright/test";

// The task fields while a `- [ ]` line is typed ("the task modal": "the date, priority deadline
// for tasks etc, and make it pretier than obsidian the icons are a bit ugly"), and the line that
// "behaved very weirdly deleting and duplicating things": a word that only looked like a field
// ("fix the low") was replaced by the field's emoji on Enter, and the Enter made no new line.
// The user's settings: vim on, desktop keys, typewriter, the format bar.
const H = { "x-atlas": "1" };
const text = (page: Page) => page.evaluate(() => (window as any).__atlas.editor().text as string);

async function note(page: Page, name: string) {
  await page.request.put("/api/file", { headers: H, data: { path: `notes/${name}.md`, text: "# Todo\n\n" } });
  await page.keyboard.press("Control+p");
  await expect(page.getByTestId("palette").getByRole("textbox")).toBeFocused();
  await page.keyboard.type(`${name}.md`);
  await expect(page.getByTestId("palette").getByText(`${name}`, { exact: true }).first()).toBeVisible();
  await page.keyboard.press("Enter");
  await expect.poll(() => page.evaluate(() => (window as any).__atlas.editor()?.path)).toContain(name);
  const content = page.locator(".cm-content:visible").first();
  await content.click();
  await page.keyboard.press("Control+End");
  if (await page.locator(".cm-fat-cursor").count()) await page.keyboard.press("i"); // vim: into insert mode, as a user would
}

test.beforeEach(async ({ page }) => {
  await page.route("**/api/config", async (route) => {
    if (route.request().method() !== "GET") return route.continue();
    const res = await route.fetch(), body = await res.json();
    Object.assign(body.config.editor, { vim_keys: "desktop", typewriter: true, format_bar: true });
    await route.fulfill({ response: res, json: body });
  });
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
});

test("a word that looks like a field never eats Enter: the line goes on, the word stays", async ({ page }) => {
  await note(page, "todo-words");
  const list = page.locator(".cm-tooltip-autocomplete");
  await page.keyboard.type("- [ ] fix the low", { delay: 25 });
  await expect(list).toContainText("low priority");
  await expect(list.locator("li[aria-selected]")).toContainText("new line");
  await page.waitForTimeout(150); // CodeMirror ignores an Enter in the first 75 ms after the list opens
  await page.keyboard.press("Enter");
  await page.keyboard.type("next", { delay: 25 });
  await expect.poll(() => text(page)).toBe("# Todo\n\n- [ ] fix the low\n- [ ] next");
});

test("a field by name, then a day as typed; the list draws icons and plain names, no emoji", async ({ page }) => {
  await note(page, "todo-fields");
  const list = page.locator(".cm-tooltip-autocomplete");
  await page.keyboard.type("- [ ] pay the rent du", { delay: 25 });
  await expect(list).toContainText("due date");
  await expect(list.locator(".task-sugg-icon svg").first()).toBeVisible();
  expect(await list.innerText()).not.toMatch(/📅|⏳|⏫/);
  await page.waitForTimeout(150);
  await page.keyboard.press("Tab"); // past the "new line" row
  await page.keyboard.press("Enter");
  await expect(list).toContainText("tomorrow");
  await page.keyboard.type("in 3 days", { delay: 25 });
  await expect(list.locator("li[aria-selected]")).toContainText("in 3 days");
  await page.waitForTimeout(150);
  await page.keyboard.press("Enter");
  const want = new Date(); want.setDate(want.getDate() + 3);
  const iso = `${want.getFullYear()}-${String(want.getMonth() + 1).padStart(2, "0")}-${String(want.getDate()).padStart(2, "0")}`;
  await expect.poll(() => text(page)).toBe(`# Todo\n\n- [ ] pay the rent 📅 ${iso} `);
  // a priority, then a rule
  await page.keyboard.type("hig", { delay: 25 });
  await expect(list).toContainText("high priority");
  await page.waitForTimeout(150);
  await page.keyboard.press("Tab"); // new line → high (Obsidian Tasks' order: high, then highest)
  await expect(list.locator("li[aria-selected]")).toContainText("high priority");
  await page.keyboard.press("Enter");
  await page.keyboard.type("rep", { delay: 25 });
  await expect(list).toContainText("recurring (repeat)");
  await page.waitForTimeout(150);
  await page.keyboard.press("Tab"); await page.keyboard.press("Enter");
  await expect(list).toContainText("every week");
  await page.keyboard.type("every mo", { delay: 25 });
  await page.waitForTimeout(150);
  await page.keyboard.press("Enter");
  await expect.poll(() => text(page)).toBe(`# Todo\n\n- [ ] pay the rent 📅 ${iso} ⏫ 🔁 every month `);
});

// "the tab and the autocompletion are still kind of broken": a Tab typed before the field list had
// come back from the core indented the line, and the list never showed
test("a Tab typed before the list arrives waits for it and moves down; no indent", async ({ page }) => {
  await note(page, "todo-tab");
  const list = page.locator(".cm-tooltip-autocomplete");
  await page.keyboard.type("- [ ] call bob d", { delay: 10 });
  await page.keyboard.press("Tab"); // at once
  await expect(list.locator("li[aria-selected]")).toContainText("due date");
  await expect.poll(() => text(page)).toBe("# Todo\n\n- [ ] call bob d");
  // with no list coming, Tab still indents a list line
  await page.keyboard.press("Escape");
  await page.keyboard.press("End");
  await page.keyboard.press("Enter"); // the list goes on: a new "- [ ] "
  await expect.poll(() => text(page)).toBe("# Todo\n\n- [ ] call bob d\n- [ ] ");
  await page.keyboard.press("Tab");
  await expect.poll(() => text(page)).toMatch(/\n\s+- \[ \] $/);
});

// "the suggester does not trigger … i just dont see the task suggester", "todo and [] do nothing", "trying to
// delete a character deletes the whole task thing", "the @ … just shows a random set of keywords" (2026-10-15):
// Obsidian Tasks' list on every task line, the capture box's short forms in a
// note, Backspace one step at a time, and `@` the task's, not a citation.
test("on a task line the fields are always offered, as in Obsidian Tasks; Tab there indents", async ({ page }) => {
  await note(page, "todo-always");
  const list = page.locator(".cm-tooltip-autocomplete");
  await page.keyboard.type("- [ ] buy milk ", { delay: 25 });
  await expect(list).toContainText("due date");
  await expect(list).toContainText("recurring (repeat)");
  await expect(list.locator("li[aria-selected]")).toContainText("new line");
  await page.waitForTimeout(150);
  await page.keyboard.press("Tab");
  await expect.poll(() => text(page)).toMatch(/^# Todo\n\n(\t| {2,})- \[ \] buy milk $/);
  await page.keyboard.press("Enter");
  await page.keyboard.type("next", { delay: 25 });
  await expect.poll(() => text(page)).toMatch(/\n(\t| {2,})- \[ \] next$/);
  // the list is on every task line: one Escape closes it and leaves vim's insert mode
  await expect(list).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(list).toBeHidden();
  await expect(page.locator(".cm-fat-cursor")).toHaveCount(1);
});

test("[] and TODO start a task; Backspace takes the box back one step; @ offers the fields, not citations", async ({ page }) => {
  await note(page, "todo-short");
  const list = page.locator(".cm-tooltip-autocomplete");
  await page.keyboard.type("[] call ana", { delay: 25 });
  await expect.poll(() => text(page)).toBe("# Todo\n\n- [ ] call ana");
  for (let i = 0; i < 8; i++) await page.keyboard.press("Backspace");
  await expect.poll(() => text(page)).toBe("# Todo\n\n- [ ] ");
  await page.keyboard.press("Backspace");
  await expect.poll(() => text(page), "the box goes, the list item stays").toBe("# Todo\n\n- ");
  await page.keyboard.press("Backspace");
  await expect.poll(() => text(page)).toBe("# Todo\n\n");
  await page.keyboard.type("TODO mail bob @", { delay: 25 });
  await expect.poll(() => text(page)).toBe("# Todo\n\n- [ ] mail bob @");
  await expect(list).toContainText("due date");
  expect(await list.innerText(), "no citation keys on a task line").not.toMatch(/\d{4}[a-z]/);
  await page.waitForTimeout(150);
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect.poll(() => text(page), "the @ is replaced by the field").toBe("# Todo\n\n- [ ] mail bob 📅 ");
  await expect(list).toContainText("tomorrow");
});
