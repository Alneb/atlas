import { test, expect } from "@playwright/test";

// Obsidian's default ("Strict line breaks" off, as in the user's vault): a newline inside a paragraph shows in rendered
// Markdown — here the OCR plugin's callout under a capture in Today's log, whose lines ran together before.
test("a newline inside a paragraph shows in rendered Markdown, as in Obsidian", async ({ page, request }) => {
  const H = { "x-atlas": "1" };
  const d = new Date(), pad = (n: number) => String(n).padStart(2, "0");
  const day = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const log = await request.get(`/api/file?path=log/${day}.md`, { headers: H });
  const before = log.ok() ? ((await log.json()) as { text: string }).text : `# ${day}\n`;
  const text = `${before.trimEnd()}\n\n- 12:00 from a friend\n  > [!ocr] Text in shot.png\n  > line one of the screenshot\n  > line two of the screenshot\n`;
  await request.put("/api/file", { headers: H, data: { path: `log/${day}.md`, text } });
  await page.goto("/");
  const body = page.locator(".callout-body", { hasText: "line one of the screenshot" });
  await expect(body).toBeVisible({ timeout: 15_000 });
  await expect(body.locator("br")).toHaveCount(1);
  await request.put("/api/file", { headers: H, data: { path: `log/${day}.md`, text: before } });
});

// `> [!x]-` is folded in Obsidian's reading view (and `+` open but foldable): the OCR plugin's text stays out of the way
test("a callout marked - is folded and opens by its title", async ({ page, request }) => {
  const H = { "x-atlas": "1" };
  const d = new Date(), pad = (n: number) => String(n).padStart(2, "0");
  const day = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const log = await request.get(`/api/file?path=log/${day}.md`, { headers: H });
  const before = log.ok() ? ((await log.json()) as { text: string }).text : `# ${day}\n`;
  const text = `${before.trimEnd()}\n\n- 12:05 a folded one\n  > [!ocr]- Text in fold.png\n  > the folded words\n`;
  await request.put("/api/file", { headers: H, data: { path: `log/${day}.md`, text } });
  await page.goto("/");
  const title = page.locator("summary.callout-title", { hasText: "Text in fold.png" });
  await expect(title).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("the folded words")).toBeHidden();
  await title.click();
  await expect(page.getByText("the folded words")).toBeVisible();
  await request.put("/api/file", { headers: H, data: { path: `log/${day}.md`, text: before } });
});
