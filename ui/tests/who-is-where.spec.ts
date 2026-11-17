import { test, expect, type Page } from "@playwright/test";

// Who is where (lib/where.svelte.ts, core live.rs `Rooms::places`): each page tells the `where` room the file it shows
// and a note's caret line; the core keeps the last of each for `GET /api/where` (the phone's native Files reads it);
// the status bar's chip opens the other device's note here at that line. `[ui] share_place` off: the device is no
// longer listed, by the core or by the others.
const H = { "x-atlas": "1" };
const atlas = (p: Page) => ({
  open: (path: string, line?: number) => p.evaluate(([x, l]) => (window as unknown as { __atlas: { open(p: string, l?: number): void } }).__atlas.open(x as string, l as number | undefined), [path, line] as const),
});
type Device = { name: string; path: string; line?: number; device?: string };
const where = async (request: import("@playwright/test").APIRequestContext): Promise<Device[]> => (await (await request.get("/api/where", { headers: H })).json()).devices;

test("another device's note and line: listed by the core, a chip here, a click opens it at that line; hidden when it stops sharing", async ({ page, request }, info) => {
  const lines = Array.from({ length: 80 }, (_, i) => `Line ${i + 1} of the long note.`).join("\n");
  await request.put("/api/file", { headers: H, data: { path: "notes/where-long.md", text: `# Where long\n\n${lines}\n` } });
  await request.put("/api/file", { headers: H, data: { path: "notes/where-here.md", text: "# Where here\n\nThis device's own note.\n" } });
  const other = await page.context().newPage();
  for (const p of [page, other]) { await p.goto("/"); await expect(p.getByTestId("sidebar")).toBeVisible({ timeout: 20_000 }); }
  await atlas(page).open("notes/where-here.md");
  await atlas(other).open("notes/where-long.md", 62);
  await expect(other.locator(".cm-content", { hasText: "Line 60 of the long note." })).toBeVisible();
  // the caret moved: its line is said a moment later
  await other.locator(".cm-line", { hasText: "Line 60 of the long note." }).click();

  // the core keeps it: a client without a socket sees the other page's note and line
  await expect.poll(async () => (await where(request)).find((d) => d.path === "notes/where-long.md")?.line, { timeout: 15_000 }).toBe(62);
  expect((await where(request)).every((d) => typeof d.device === "string" && d.device.length > 0), "each place carries its device's id").toBe(true);

  const chip = page.getByTestId("elsewhere").filter({ hasText: "where-long" });
  await expect(chip).toBeVisible({ timeout: 15_000 });
  await expect(chip).toHaveAttribute("title", /line 62/);
  for (const theme of ["light", "dark"]) {
    await page.evaluate((t) => document.documentElement.setAttribute("data-theme", t), theme);
    await page.locator("footer.status").screenshot({ path: info.outputPath(`who-is-where-${theme}.png`) });
  }
  await chip.click();
  await expect(page.locator(".cm-activeLine", { hasText: "Line 60 of the long note." })).toBeVisible({ timeout: 10_000 });

  // the other page stops sharing its place: gone from the core's list and from this page
  await atlas(page).open("notes/where-here.md");
  await expect(page.getByTestId("elsewhere").filter({ hasText: "where-long" })).toBeVisible({ timeout: 15_000 });
  const before = (await (await request.get("/api/config", { headers: H })).json()).config;
  try {
    await request.put("/api/config", { headers: H, data: { ...before, ui: { ...before.ui, share_place: false } } });
    await expect.poll(async () => (await where(request)).some((d) => d.path === "notes/where-long.md"), { timeout: 15_000 }).toBe(false);
    await expect(page.getByTestId("elsewhere").filter({ hasText: "where-long" })).toHaveCount(0, { timeout: 15_000 });
  } finally {
    await request.put("/api/config", { headers: H, data: before });
  }
  for (const p of ["notes/where-long.md", "notes/where-here.md"]) await request.post(`/api/fs/trash?path=${encodeURIComponent(p)}`, { headers: H });
});
