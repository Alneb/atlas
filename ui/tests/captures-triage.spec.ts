import { test, expect, type APIRequestContext } from "@playwright/test";
import { mkdirSync, writeFileSync, readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { WS } from "../playwright.config";

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

// Triage by keyboard: a row clicked takes the keys; d dismisses, t makes a to-do, x ticks it — and the focus stays in
// place as each answered row moves on, so a run of keys clears the list.
test("captures are triaged by keyboard, the focus staying in place", async ({ page, request }) => {
  const LOG2 = "log/2020-03-04.md";
  await put(request, LOG2, "---\ndate: 2020-03-04\ntype: log\n---\n# Wednesday, 4 March 2020\n\n## Log\n- 09:00 keyed one\n- 09:10 keyed two\n");
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await page.keyboard.press("Control+p");
  await page.keyboard.type(">Captures: triage");
  await page.keyboard.press("Enter");
  const view = page.getByTestId("captures");
  const row = (t: string) => view.locator(".row", { hasText: t });
  await row("keyed two").locator(".time").click();
  await expect(row("keyed two")).toBeFocused();
  await expect(view.locator(".keys")).toBeVisible();
  await page.keyboard.press("d");
  await expect(row("keyed two")).toHaveCount(0); // gone from "To triage"
  await expect(row("keyed one"), "the next capture took its place, and the focus").toBeFocused();
  await page.keyboard.press("t");
  await expect.poll(() => read(request, LOG2)).toContain("- [ ] 09:00 keyed one");
  expect(await read(request, LOG2)).toContain("- [-] 09:10 keyed two");
  await view.getByRole("tab", { name: /Tasks/ }).click();
  await row("keyed one").locator(".time").click();
  await page.keyboard.press("x");
  await expect.poll(() => read(request, LOG2)).toMatch(/- \[x\] 09:00 keyed one/);
  await request.post(`/api/fs/trash?path=${encodeURIComponent(LOG2)}`, { headers: H });
});

// A clipped page's raw HTML in a capture (a frame of a site that takes over the window it is framed in, a script)
// is sanitized in the list as in a note: the list stays, nothing runs.
test("a capture holding a frame or a script is listed without running it", async ({ page, request }) => {
  const log = "log/2020-03-04.md";
  await put(request, log, '---\ndate: 2020-03-04\ntype: log\n---\n## Log\n- 09:00 clip <iframe src="/api/raw?path=x"></iframe><img src="x" onerror="window.__ran=1"> kept\n');
  try {
    await page.goto("/");
    await page.getByText("Finish the GW notes.").waitFor();
    const url = page.url();
    await page.keyboard.press("Control+p");
    await page.keyboard.type(">Captures: triage");
    await page.keyboard.press("Enter");
    const view = page.getByTestId("captures");
    await expect(view.locator("li.row", { hasText: "clip" })).toContainText("kept");
    await expect(view.locator("iframe")).toHaveCount(0);
    expect(await page.evaluate(() => (window as { __ran?: number }).__ran)).toBeUndefined();
    expect(page.url()).toBe(url);
  } finally {
    await request.post(`/api/fs/trash?path=${encodeURIComponent(log)}`, { headers: H });
  }
});

// A capture's picture shows under it (Ctrl over it: large, as in a note); Delete takes the capture and the lines under
// it out of the log, into the vault's trash, and leaves its neighbours.
test("a capture shows its picture, and is deleted into the trash", async ({ page, request }) => {
  const log = "log/2020-03-05.md";
  mkdirSync(join(WS, "log"), { recursive: true });
  // a 1×1 PNG
  writeFileSync(join(WS, "log/capture-board.png"), Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64"));
  await put(request, log, "---\ndate: 2020-03-05\ntype: log\n---\n## Log\n- 09:00 the board\n  ![[capture-board.png]]\n- 09:30 stays\n");
  try {
    await page.goto("/");
    await page.getByText("Finish the GW notes.").waitFor();
    await page.keyboard.press("Control+p");
    await page.keyboard.type(">Captures: triage");
    await page.keyboard.press("Enter");
    const view = page.getByTestId("captures");
    const row = (t: string) => view.locator("li.row", { hasText: t });
    const pic = row("the board").locator("img[data-peek]");
    // a blob: URL (an <img> cannot send /api/raw's header); data-peek names the file Ctrl shows large
    await expect(pic).toHaveAttribute("data-peek", "log/capture-board.png");
    await expect.poll(() => pic.evaluate((i: HTMLImageElement) => i.naturalWidth)).toBeGreaterThan(0);
    await row("the board").getByRole("button", { name: /^Delete/ }).click();
    await expect(row("the board")).toHaveCount(0);
    await expect.poll(() => read(request, log)).toBe("---\ndate: 2020-03-05\ntype: log\n---\n## Log\n- 09:30 stays\n");
    const trash = join(WS, ".atlas/trash");
    const kept = existsSync(trash) ? readdirSync(trash, { recursive: true }).map(String).filter((f) => f.endsWith("2020-03-05.md")) : [];
    expect(kept.map((f) => readFileSync(join(trash, f), "utf8"))).toContain("- 09:00 the board\n  ![[capture-board.png]]\n");
  } finally {
    await request.post(`/api/fs/trash?path=${encodeURIComponent(log)}`, { headers: H });
    await request.post(`/api/fs/trash?path=${encodeURIComponent("log/capture-board.png")}`, { headers: H });
  }
});
