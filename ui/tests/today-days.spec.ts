import { test, expect } from "@playwright/test";

test("Today's log browses earlier days that have a log, and comes back", async ({ page }) => {
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  const card = page.locator(".card", { has: page.getByRole("heading", { name: /log/i }) });
  await card.getByRole("button", { name: "Previous day" }).click();
  await expect(card.getByRole("heading")).toContainText("Log —");
  await expect(card).toContainText("Read the DCA review.");
  await card.getByRole("button", { name: "Previous day" }).click(); // skips days without a log
  await expect(card).toContainText("First day of the year.");
  await card.getByRole("button", { name: "Next day" }).click();
  await expect(card).toContainText("Read the DCA review.");
  await card.getByRole("button", { name: "Today" }).click();
  await expect(card.getByRole("heading")).toHaveText("Today's log");
});

// logs filed by year and month (`log_folders`) are browsed as the others; a template's heading
// with nothing under it ("## Dreams" on a day without dreams) is not shown
test("Today's log reaches a day filed in a year/month folder and shows its Log section, one button to open it", async ({ page, request }) => {
  const h = { "x-atlas": "1" };
  const old = "log/2019/12-December/2019-12-31.md";
  await request.put("/api/file", { headers: h, data: { path: old, text: "# Tuesday, 31 December 2019\n\n## Dreams\n\n## Log\n\n- 09:00 Last day of 2019.\n" } });
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  const card = page.locator(".card", { has: page.getByRole("heading", { name: /log/i }) });
  for (let i = 0; i < 6 && !(await card.textContent())?.includes("Last day of 2019."); i++) await card.getByRole("button", { name: "Previous day" }).click();
  await expect(card).toContainText("Last day of 2019.");
  // the card shows the Log section only; one button on its title opens the day's note
  await expect(card.locator(".log-md")).not.toContainText("Dreams");
  await expect(card.locator(".log-open")).toBeVisible();
  await request.post(`/api/fs/trash?path=log/2019`, { headers: h });
});

test("ticking a task on Today writes [x] in its note and drops it from the list", async ({ page, request }) => {
  const h = { "x-atlas": "1" };
  await request.put("/api/file", { headers: h, data: { path: "notes/tick.md", text: "# Tick\n\n- [ ] tick me from Today\n" } });
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  const box = page.getByRole("button", { name: "Mark done: tick me from Today" });
  // its source is the note's name, without a line number that reads as a time ("2026-10-28:15")
  await expect(page.locator(".task-li", { has: box }).locator(".task-src")).toHaveText("tick");
  await box.click();
  await expect(box).toHaveCount(0);
  const text = (await (await request.get("/api/file?path=notes/tick.md", { headers: h })).json()).text;
  expect(text).toContain("- [x] tick me from Today");
});

// the user's log, 2026-10-09: a task holding a long `code` path wrapped one word per line, since the
// flex task item made each text run and the code its own column
test("a log task with inline code wraps as one paragraph, not as columns", async ({ page, request }) => {
  const h = { "x-atlas": "1" };
  const log = (await (await request.get("/api/today", { headers: h })).json()).log.path;
  await request.put("/api/file", { headers: h, data: { path: log, text: "- [x] Submit the matched all-sector sweep (`runs/Outgoing/CDMFT_2x2_sb_irrep_allsec_4nsb_4nb_1PHS`) on iq\n  - a nested note\n" } });
  await page.goto("/");
  const li = page.locator(".log-md li.task-list-item").first();
  await li.waitFor();
  const lineH = parseFloat(await li.evaluate((e) => getComputedStyle(e).lineHeight));
  const box = (await li.boundingBox())!;
  const code = (await li.locator("code").boundingBox())!;
  const nested = (await li.locator("li").boundingBox())!;
  expect(nested.y).toBeGreaterThan(code.y); // the sub-list sits below, not beside
  expect(box.height).toBeLessThan(lineH * 5); // 2–3 wrapped lines + the sub-item, not a word per line
});
