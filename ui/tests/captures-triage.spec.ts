import { test, expect, type APIRequestContext } from "@playwright/test";

// The Captures view (docs/design/DESIGN-capture-triage.md): every capture of the day logs by day, and the answers that
// triage one — each written into the capture's own line by the core, and a filed one added to its note.
const H = { "x-atlas": "1" };
const LOG = "log/2020-03-03.md";
const TARGET = "notes/capture-target.md";
const put = (request: APIRequestContext, path: string, text: string) => request.put("/api/file", { headers: H, data: { path, text } });
const read = async (request: APIRequestContext, path: string) => ((await (await request.get(`/api/file?path=${encodeURIComponent(path)}`, { headers: H })).json()) as { text: string }).text;

test.beforeAll(async ({ request }) => {
  await put(request, LOG, "---\ndate: 2020-03-03\ntype: log\n---\n# Tuesday, 3 March 2020\n\n## Journal\n- not a capture\n\n## Log\n- 09:00 seed capture alpha\n- [ ] 10:00 seed task beta\n- 11:00 seed thought gamma\n");
  await put(request, TARGET, "# Capture target\n");
});
test.afterAll(async ({ request }) => {
  for (const p of [LOG, TARGET]) await request.post(`/api/fs/trash?path=${encodeURIComponent(p)}`, { headers: H });
});

test("captures are listed by day and triaged in their own lines: a task, dismissed, filed into a note", async ({ page, request }) => {
  const listed = await (await request.get("/api/captures", { headers: H })).json();
  const mine = listed.items.filter((c: { path: string }) => c.path === LOG);
  expect(mine.map((c: { text: string; state: string }) => `${c.state} ${c.text}`)).toEqual(["open seed thought gamma", "task seed task beta", "open seed capture alpha"]);

  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await page.keyboard.press("Control+p");
  await page.keyboard.type(">Captures: triage");
  await page.keyboard.press("Enter");
  const view = page.getByTestId("captures");
  await expect(view).toBeVisible();
  const row = (text: string) => view.locator("li.row", { hasText: text });
  await expect(row("seed capture alpha")).toBeVisible();
  await expect(row("seed task beta")).toHaveCount(0); // a task is not waiting to be triaged
  await expect(view.getByText("not a capture")).toHaveCount(0); // the journal is not the log

  await row("seed capture alpha").getByRole("button", { name: "Task" }).click();
  await expect.poll(() => read(request, LOG)).toContain("\n- [ ] 09:00 seed capture alpha\n");
  await expect(row("seed capture alpha")).toHaveCount(0);

  await row("seed thought gamma").getByRole("button", { name: "Dismiss" }).click();
  await expect.poll(() => read(request, LOG)).toContain("\n- [-] 11:00 seed thought gamma\n");

  await view.getByRole("tab", { name: /Tasks/ }).click();
  await row("seed task beta").getByRole("button", { name: /File/ }).click();
  const palette = page.getByTestId("palette");
  await expect(palette).toBeVisible();
  await page.keyboard.type("capture-target");
  await expect(palette.getByTestId("palette-item").first()).toContainText("capture-target");
  await page.keyboard.press("Enter");
  await expect.poll(() => read(request, TARGET)).toBe("# Capture target\n- seed task beta ([[2020-03-03]])\n");
  await expect.poll(() => read(request, LOG)).toContain("\n- [ ] 10:00 seed task beta → [[capture-target]]\n");

  // reopened: back to a plain capture, the box gone
  await view.getByRole("tab", { name: /All/ }).click();
  await row("seed thought gamma").getByRole("button", { name: "Reopen" }).click();
  await expect.poll(() => read(request, LOG)).toContain("\n- 11:00 seed thought gamma\n");
  expect(await read(request, LOG)).toContain("## Journal\n- not a capture\n");
});
