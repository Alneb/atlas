import { test, expect } from "@playwright/test";

// "it takes too long to write the task syntax": Ctrl+L makes the line a to-do, then done, then open;
// and a capture typed as `[] …` or `todo …` is a task in the day's log, not a timed line.
const H = { "x-atlas": "1" };
// fixture notes with open tasks carry <!-- atlas:no-tasks -->: the shared test vault's Home list must not grow (smoke, page-arrange)

test("Ctrl+L cycles a line through to-do and done; a quick capture can be a task", async ({ page, request }) => {
  await request.put("/api/file", { headers: H, data: { path: "notes/todo-keys.md", text: "# Keys\n\nbuy milk\n- call Ana\n" } });
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await page.keyboard.press("Control+p");
  await page.keyboard.type("todo-keys.md");
  await expect(page.getByTestId("palette").getByText("todo-keys", { exact: true }).first()).toBeVisible();
  await page.keyboard.press("Enter");
  await page.locator(".cm-content").getByText("buy milk").click();
  const text = () => page.evaluate(() => (window as any).__atlas.editor().text as string);
  await page.keyboard.press("Control+l");
  await expect.poll(text).toContain("- [ ] buy milk\n");
  await page.keyboard.press("Control+l");
  await expect.poll(text).toContain("- [x] buy milk\n");
  await page.keyboard.press("Control+l");
  await expect.poll(text).toContain("- [ ] buy milk\n");
  await page.locator(".cm-content").getByText("call Ana").click();
  await page.keyboard.press("Control+l");
  await expect.poll(text).toContain("- [ ] call Ana");

  // Obsidian Tasks' suggestions on a to-do line: a field by name, then a date by name
  await page.keyboard.press("Escape");
  await page.keyboard.type("A due");
  const list = page.locator(".cm-tooltip-autocomplete");
  await expect(list.getByText("due date")).toBeVisible();
  await page.waitForTimeout(400);
  await page.keyboard.press("Tab"); // past the "new line" row
  await page.keyboard.press("Enter");
  await expect(list.getByText("tomorrow", { exact: true })).toBeVisible();
  await page.keyboard.type("tom");
  await page.waitForTimeout(400);
  await page.keyboard.press("Enter");
  await expect.poll(text).toMatch(/- \[ \] call Ana 📅 \d{4}-\d{2}-\d{2} /);

  const r = await request.post("/api/capture", { headers: H, data: { text: "todo water the plants @tomorrow" } });
  expect(r.ok()).toBeTruthy();
  const { path } = await r.json();
  const log = await request.get(`/api/file?path=${encodeURIComponent(path)}`, { headers: H }).then((x) => x.json());
  expect(log.text).toMatch(/^- \[ \] water the plants @\d{4}-\d{2}-\d{2}$/m);
});

// "the tasks completion only works in the home capture box, not in notes": a box in a note ticks the way Home's
// list does — `✅ day` on a line with the Tasks fields, the next occurrence of a recurring one; opened again, the
// date goes; Ctrl+L on a to-do does the same.
test("a task's box in a note ticks as on Home: done date, next occurrence, and back", async ({ page, request }) => {
  await request.put("/api/file", { headers: H, data: { path: "notes/tick-box.md", text: "# Ticks\n\n- [ ] pay 📅 2026-10-20\n- [ ] water 🔁 every day\n- [ ] plain\n\n<!-- atlas:no-tasks -->\n" } });
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await page.request.post("/api/cmd/open", { headers: H, data: { args: { path: "notes/tick-box.md" } } });
  const ed = page.locator(".dv-active-group .cm-editor").first();
  await ed.waitFor();
  const text = () => page.evaluate(() => (window as any).__atlas.editor().text as string);
  const day = await page.evaluate(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; });
  const box = (label: string) => ed.locator(".cm-line", { hasText: label }).locator(".cm-task-mark");

  await box("pay").dispatchEvent("mousedown");
  await expect.poll(text).toContain(`- [x] pay 📅 2026-10-20 ✅ ${day}\n`);
  await box("water").dispatchEvent("mousedown");
  await expect.poll(text).toMatch(/- \[ \] water 🔁 every day 📅 \d{4}-\d{2}-\d{2}\n- \[x\] water 🔁 every day ✅ \d{4}-\d{2}-\d{2}\n/);
  await box("pay").dispatchEvent("mousedown"); // opened again: the date goes
  await expect.poll(text).toContain("- [ ] pay 📅 2026-10-20\n");
  await box("plain").dispatchEvent("mousedown"); // no fields: only ticked
  await expect.poll(text).toContain("- [x] plain\n");

  await ed.locator(".cm-line", { hasText: "pay" }).click({ position: { x: 200, y: 5 } });
  await page.keyboard.press("Control+l");
  await expect.poll(text).toContain(`- [x] pay 📅 2026-10-20 ✅ ${day}\n`);
});

// "render the emojis in a nicer way": the chips were drawn with their text over their own icon ("Tue📅sday") —
// a list line's hanging text-indent (-28px) was inherited by the inline-flex chip. A done task is never "late".
test("a task's fields are chips with their text after the icon; a done task's dates are not late", async ({ page, request }) => {
  await request.put("/api/file", { headers: H, data: { path: "notes/chip-look.md", text: "# Chips\n\n- [ ] pay 📅 2026-01-20 ⏫\n- [x] sent 📅 2026-01-10 ✅ 2026-01-11\n\n<!-- atlas:no-tasks -->\n" } });
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await page.request.post("/api/cmd/open", { headers: H, data: { args: { path: "notes/chip-look.md" } } });
  const chips = page.locator(".dv-active-group .cm-editor .task-chip");
  await expect(chips).toHaveCount(4);
  const overlaps = await chips.evaluateAll((els) => els.map((c) => {
    const svg = c.querySelector("svg")!.getBoundingClientRect(), r = document.createRange();
    r.selectNodeContents([...c.childNodes].find((n) => n.nodeType === 3)!);
    const t = r.getBoundingClientRect(), box = c.getBoundingClientRect();
    return t.left < svg.right || t.right > box.right + 0.5;
  }));
  expect(overlaps).toEqual([false, false, false, false]);
  await expect(chips.nth(0)).toHaveClass(/tone-late/);
  await expect(chips.nth(2)).not.toHaveClass(/tone-late/); // the done task's due date
});
