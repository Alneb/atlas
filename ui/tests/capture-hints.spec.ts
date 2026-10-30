import { test, expect } from "@playwright/test";

// "the capture box's short forms documented in the box itself": empty, the box lists them; while
// typing it says what the text will become — a to-do, and for which day — before Enter.
test("the capture box names its short forms and says what the text will become", async ({ page }) => {
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  const box = page.getByTestId("capture"), what = page.getByTestId("capture-what");
  // the same four guides as every other box (lib/capture-guides.ts); a click starts the text with one
  await expect(what).toHaveText(/\[\]\s*to-do\s*@fri\s*date\s*\[\[\s*link\s*#\s*tag/);
  await what.getByRole("button", { name: "@fri" }).click();
  await expect(box).toHaveValue("@");
  await expect(box).toBeFocused();
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


// The capture box behaves as a note does:
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

// The capture popup over any pane (components/QuickCapture.svelte): Super+C opens it over the note being edited, with no
// navigation, the editor's selection in it; Enter saves to the day's log and closes. Super+E twice carries what was
// typed in the command bar into it; Esc keeps a draft for the next time.
test("Super+C and Super+E twice open the capture popup over the current pane, Enter saves it", async ({ page, request }) => {
  const H = { "x-atlas": "1" };
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await request.post("/api/cmd/open", { headers: H, data: { args: { path: "notes/hubbard.md" } } });
  const cm = page.locator(".cm-content:visible").first();
  await expect(cm).toBeVisible();
  await cm.click();
  await page.keyboard.press("Meta+c");
  const box = page.getByTestId("quick-capture");
  await expect(box).toBeFocused();
  await expect(page.locator(".cm-content:visible").first()).toBeVisible(); // still over the note: nothing navigated
  await box.fill("[] call the lab @tomorrow");
  await expect(page.getByRole("dialog", { name: "Capture" }).locator(".where")).not.toHaveText("to today's log");
  await expect(page.getByRole("button", { name: "To-do" })).toHaveAttribute("aria-pressed", "true");
  for (const scheme of ["light", "dark"] as const) { // judged in both themes (docs/guides/UI-STYLE.md)
    await page.emulateMedia({ colorScheme: scheme });
    await page.screenshot({ path: test.info().outputPath(`capture-popup-${scheme}.png`) });
  }
  await page.keyboard.press("Enter");
  await expect(box).toHaveCount(0);
  await expect(page.getByText(/^Captured/).first()).toBeVisible();
  // Super+E, a few words, Super+E again: the popup with them; Esc keeps them as a draft
  await page.keyboard.press("Meta+e");
  await page.keyboard.type("an idea about vortices");
  await page.keyboard.press("Meta+e");
  await expect(box).toHaveValue("an idea about vortices");
  await page.keyboard.press("Escape");
  await expect(box).toHaveCount(0);
  await page.keyboard.press("Meta+c");
  await expect(box).toHaveValue("an idea about vortices");
  await box.fill("");
  await page.keyboard.press("Escape");
});

// The command bar closes before its capture answers: a failure brings the text back in the capture popup (its draft).
test("a capture from the command bar that fails comes back in the capture popup", async ({ page }) => {
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await page.route(/\/api\/capture$/, (r) => r.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "the disk is full" }) }));
  await page.keyboard.press("Meta+e");
  await page.keyboard.type("+ a thought not to lose");
  await page.keyboard.press("Enter");
  await expect(page.getByText(/^Not captured/).first()).toBeVisible();
  const box = page.getByTestId("quick-capture");
  await expect(box).toHaveValue("a thought not to lose");
  await page.unroute(/\/api\/capture$/);
  await box.fill("");
  await page.keyboard.press("Escape");
});

// A picture pasted or dropped into the popup goes beside today's log, its embed into the text; Enter saves both.
test("a picture pasted into the capture popup is attached beside today's log and embedded in the capture", async ({ page, request }) => {
  const H = { "x-atlas": "1" };
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await page.keyboard.press("Meta+c");
  const box = page.getByTestId("quick-capture");
  await box.fill("the whiteboard after the meeting");
  await box.evaluate((el) => {
    const b64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
    const dt = new DataTransfer();
    dt.items.add(new File([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))], "image.png", { type: "image/png" }));
    el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
  });
  await expect(box).toHaveValue(/^the whiteboard after the meeting\n!\[\[Pasted image \d{14}\.png(\|\d+)?\]\]$/);
  const thumb = page.getByLabel("Attached pictures").locator("img");
  await expect(thumb).toHaveCount(1);
  await expect.poll(() => thumb.evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth > 0)).toBe(true); // served, not broken
  for (const scheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    await page.screenshot({ path: test.info().outputPath(`capture-popup-picture-${scheme}.png`) });
  }
  await page.keyboard.press("Enter");
  await expect(box).toHaveCount(0);
  const log = (await (await request.post("/api/log/today", { headers: H })).json()).path as string;
  const text = () => request.get(`/api/file?path=${encodeURIComponent(log)}`, { headers: H }).then((r) => r.json()).then((j) => j.text as string);
  await expect.poll(text).toMatch(/the whiteboard after the meeting\n {2}!\[\[Pasted image \d{14}\.png(\|\d+)?\]\]/);
  // the capture and its picture out of today's log again: later specs' Home would draw it (a 404 in their console)
  await request.put("/api/file", { headers: H, data: { path: log, text: (await text()).replace(/^.*the whiteboard after the meeting\n(?: {2}.*\n?)*/m, "") } });
});

// The thumbnail's × takes the embed out of the text (the file stays beside the log).
test("a pasted picture's thumbnail takes its embed out of the capture", async ({ page }) => {
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await page.keyboard.press("Meta+c");
  const box = page.getByTestId("quick-capture");
  await box.fill("one line");
  await box.evaluate((el) => {
    const b64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
    const dt = new DataTransfer();
    dt.items.add(new File([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))], "image.png", { type: "image/png" }));
    el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
  });
  const thumbs = page.getByLabel("Attached pictures");
  await thumbs.locator("figure").hover();
  await thumbs.getByRole("button").click();
  await expect(box).toHaveValue("one line");
  await expect(thumbs).toHaveCount(0);
  await expect(box).toBeFocused();
  await page.keyboard.press("Escape");
});
