import { test, expect, type Page } from "@playwright/test";

// Live notes: two windows on one note — each says who else is there, what one types shows in the other as it is
// typed, the note's text is never doubled, and the file holds both once they have saved (lib/note-live.ts).
const H = { "x-atlas": "1" };
const PATH = "notes/live-shared-note.md";

async function open(page: Page): Promise<void> {
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await page.keyboard.press("Control+p");
  await page.keyboard.type("live-shared-note");
  await expect(page.getByTestId("palette").getByText(/live-shared-note/).first()).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page.locator(".cm-content").filter({ hasText: "Shared line." })).toBeVisible({ timeout: 15_000 });
}

test("two windows on one note: typing in either shows in both, nothing doubled, the file holds both", async ({ page, context, request }) => {
  test.setTimeout(90_000);
  await request.put("/api/file", { headers: H, data: { path: PATH, text: "# Live\n\nShared line.\n" } });
  const other = await context.newPage();
  await open(page);
  await open(other);
  await expect(page.locator(".live-chip")).toHaveText(/Live · desktop/, { timeout: 10_000 });
  await expect(other.locator(".live-chip")).toHaveText(/Live · desktop/, { timeout: 10_000 });

  const editor = (p: Page) => p.locator(".cm-content");
  // to the end of the line, typing (vim: `A`, as code-save.spec does)
  const typeAtEnd = async (p: Page) => { if (await p.locator(".cm-fat-cursor").count()) await p.keyboard.press("A"); else await p.keyboard.press("End"); };
  await editor(page).locator(".cm-line", { hasText: "Shared line." }).click();
  await typeAtEnd(page);
  await page.keyboard.type(" From the first.");
  await expect(editor(other)).toContainText("Shared line. From the first.", { timeout: 5_000 });

  await editor(other).locator(".cm-line", { hasText: "From the first." }).click();
  await typeAtEnd(other);
  await other.keyboard.press("Enter");
  await other.keyboard.type("From the second.");
  await expect(editor(page)).toContainText("From the second.", { timeout: 5_000 });

  // the note once, not twice (the second window took the first's text instead of seeding its own)
  const text = await editor(page).innerText();
  expect(text.split("Shared line.").length - 1).toBe(1);
  // both saved: the file holds both edits
  await expect.poll(async () => ((await (await request.get(`/api/file?path=${encodeURIComponent(PATH)}`, { headers: H })).json()) as { text: string }).text, { timeout: 10_000 })
    .toMatch(/Shared line\. From the first\.\nFrom the second\./);
  await page.close();
  await expect(other.locator(".live-chip")).toHaveCount(0, { timeout: 10_000 });
});
