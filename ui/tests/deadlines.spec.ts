import { test, expect, type APIRequestContext } from "@playwright/test";
import { openFile, runCommand } from "./open";

// Deadlines (docs/design/DESIGN-calendar-tasks-nudges.md §2.4): the core's `from: deadlines` — dated tasks and notes
// with `due:` — drawn by the `deadlines` block Home carries, grouped Overdue · Today · This week · Later. A task row
// ticks its line through the one tick path; a note row has no box. The Deadlines page is made once, from its template.
const H = { "x-atlas": "1" };
const put = (r: APIRequestContext, path: string, text: string) => r.put("/api/file", { headers: H, data: { path, text } });
const read = async (r: APIRequestContext, path: string) => ((await (await r.get(`/api/file?path=${encodeURIComponent(path)}`, { headers: H })).json()) as { text?: string }).text ?? "";
// the local calendar day (the core groups by the local day)
const day = (offset: number) => { const d = new Date(); d.setDate(d.getDate() + offset); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

test.beforeAll(async ({ request }) => {
  await put(request, "notes/dl/errands.md", `# Errands\n\n- [ ] dl renew the passport 📅 ${day(-1)}\n- [ ] dl send the abstract ⏫ 📅 ${day(0)}\n- [ ] dl undated errand\n`);
  await put(request, "notes/dl/dl grant report.md", `---\ndue: ${day(4)}\n---\n# Grant report\n`);
  await put(request, "notes/dl/dl finished.md", `---\ndue: ${day(2)}\nstatus: done\n---\n`);
  await put(request, "notes/dl/Box.page", "title: Box\nrows:\n  - [{ view: deadlines, title: Deadlines }]\n");
});
test.afterAll(async ({ request }) => {
  await request.post("/api/fs/trash?path=notes/dl", { headers: H });
  await request.post("/api/fs/trash?path=Deadlines.page", { headers: H });
});

test("the deadlines box groups what is due, ticks a task in its note, shows a note without a box", async ({ page, request }) => {
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await openFile(page, "Box.page");
  const box = page.locator(".atlas-pane-page .tasks");
  const row = (text: string) => box.locator(".task", { hasText: text });
  await expect(row("dl renew the passport")).toBeVisible();
  // ours only (the vault is shared by the specs): each in its group, in order, the done note and the undated task left out
  await expect(box.locator(".task .title").filter({ hasText: /^dl / })).toHaveText(["dl renew the passport", "dl send the abstract", "dl grant report"]);
  const groupOf = (text: string) => row(text).evaluate((li) => { let e = li.previousElementSibling; while (e && !e.classList.contains("head")) e = e.previousElementSibling; return e?.firstElementChild?.textContent ?? null; });
  expect(await groupOf("dl renew the passport")).toBe("Overdue");
  expect(await groupOf("dl send the abstract")).toBe("Today");
  expect(await groupOf("dl grant report")).toBe("This week");
  await expect(row("dl finished")).toHaveCount(0);
  await expect(row("dl undated errand")).toHaveCount(0);
  await expect(row("dl send the abstract")).toHaveAttribute("data-priority", "high");

  // a note's deadline: a mark where a task's box would be, nothing to tick
  const note = row("dl grant report");
  await expect(note).toHaveAttribute("data-from", "note");
  await expect(note.locator("input[type=checkbox]")).toHaveCount(0);
  await expect(note.locator(".kind svg")).toHaveCount(1);

  // ticking a task writes its line ([x] + ✅ today) and the row leaves the box
  await row("dl send the abstract").getByRole("checkbox").check();
  await expect.poll(() => read(request, "notes/dl/errands.md")).toContain(`- [x] dl send the abstract ⏫ 📅 ${day(0)} ✅ ${day(0)}`);
  await expect(row("dl send the abstract")).toHaveCount(0);
  await expect(row("dl renew the passport")).toBeVisible();

  // the Deadlines page: made from its template on first use, the same rows
  await runCommand(page, "Deadlines: what is due", "Deadlines: what is due, overdue first");
  await expect.poll(() => read(request, "Deadlines.page")).toContain("view: deadlines");
  await expect(page.locator(".atlas-pane-page .tasks .task", { hasText: "dl renew the passport" }).first()).toBeVisible();
});

// What is due is Home's: no button of its own in the left bar, and a home document without the box is offered it once.
test("deadlines have no left-bar button; Home offers their box once and adds it on the click", async ({ page, request }) => {
  const cfg = async () => (await (await request.get("/api/config", { headers: H })).json()).config;
  const before = await cfg();
  await put(request, "notes/dl/Home.page", "title: Home\nrows:\n  - [{ view: greeting }]\n");
  await request.put("/api/config", { headers: H, data: { ...before, home: "notes/dl/Home.page" } });
  try {
    await page.goto("/");
    await page.getByText("Finish the GW notes.").waitFor();
    await expect(page.getByRole("navigation", { name: "Activity" }).getByRole("button", { name: "Deadlines" })).toHaveCount(0);
    await page.evaluate(() => { for (const k of Object.keys(localStorage)) if (k.startsWith("atlas-deadlines-offered")) localStorage.removeItem(k); });
    await runCommand(page, "Home", "Home (your home document)");
    const offer = page.locator(".toast", { hasText: "What is due is on Home now" });
    await expect(offer).toBeVisible();
    for (const scheme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme: scheme });
      await offer.screenshot({ path: `test-results/deadlines-on-home-${scheme}.png` });
    }
    await offer.getByRole("button", { name: "Add the box" }).click();
    await expect.poll(() => read(request, "notes/dl/Home.page")).toContain("deadlines");
  } finally {
    await request.put("/api/config", { headers: H, data: before });
  }
});
