import { test, expect } from "@playwright/test";

// The file tree used to reload on every file event: an autosave rewrote a known file and the tree
// re-read itself and every open folder. Now it re-reads only when files appear or go (`gone` events); the git
// marks still follow a save.
const H = { "x-atlas": "1" };

test("a save does not reload the file tree; a new or deleted file does, and the git mark follows the save", async ({ page, request }) => {
  await request.post("/api/fs/trash?path=notes/tree-new.md", { headers: H }).catch(() => {});
  await request.put("/api/file", { headers: H, data: { path: "notes/tree-keep.md", text: "# keep\n" } });
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await page.keyboard.press("Meta+Shift+F");
  // opened, so the tree reveals it (scrolled to its row): the tree draws the rows near the screen only, and a test
  // vault late in a run has more in notes/ than one screen
  await page.evaluate(() => (window as unknown as { __atlas: { open(p: string): void } }).__atlas.open("notes/tree-keep.md"));
  const keep = page.locator('.row[data-path="notes/tree-keep.md"]');
  await expect(keep).toBeVisible();
  await page.waitForTimeout(1500); // the opening's own reads settle

  let reads = 0;
  page.on("request", (r) => { if (new URL(r.url()).pathname === "/api/tree") reads++; });
  for (let i = 0; i < 3; i++) {
    await request.put("/api/file", { headers: H, data: { path: "notes/tree-keep.md", text: `# keep\n\nedit ${i}\n` } });
    await page.waitForTimeout(400);
  }
  await page.waitForTimeout(1500);
  expect(reads, "saves of a listed file re-read the tree").toBe(0);

  await expect(keep).toBeVisible();

  await request.put("/api/file", { headers: H, data: { path: "notes/tree-new.md", text: "# new\n" } });
  await expect(page.locator('.row[data-path="notes/tree-new.md"]')).toBeVisible();
  await request.post("/api/fs/trash?path=notes/tree-new.md", { headers: H });
  await expect(page.locator('.row[data-path="notes/tree-new.md"]')).toHaveCount(0);
  expect(reads).toBeGreaterThan(0);
  await request.post("/api/fs/trash?path=notes/tree-keep.md", { headers: H });
});

test("the tree's git mark follows a save of a committed file", async ({ page, request }) => {
  const before = await request.get("/api/file?path=FOCUS.md", { headers: H }).then((r) => r.json()) as { text: string };
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await page.keyboard.press("Meta+Shift+F");
  const focus = page.locator('.row[data-path="FOCUS.md"]');
  await expect(focus.locator(".glet")).toHaveCount(0);
  try {
    await request.put("/api/file", { headers: H, data: { path: "FOCUS.md", text: `${before.text}\nA line.\n` } });
    await expect(focus.locator(".glet")).toHaveText("M", { timeout: 8000 });
  } finally {
    await request.put("/api/file", { headers: H, data: { path: "FOCUS.md", text: before.text } });
  }
  await expect(focus.locator(".glet")).toHaveCount(0, { timeout: 8000 });
});
