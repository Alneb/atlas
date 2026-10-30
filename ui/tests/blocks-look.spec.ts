import { test, expect, type Page } from "@playwright/test";

// Blocks drawn inside a note look as they do on their own: the note's markdown styles stay out of them, and a block
// lays itself out by its own width.
const H = { "x-atlas": "1" };

async function openNote(page: Page, name: string) {
  await page.goto("/");
  await page.keyboard.press("Control+p");
  await page.keyboard.type(`${name}.md`);
  await expect(page.getByTestId("palette").getByText(name, { exact: true }).first()).toBeVisible();
  await page.keyboard.press("Enter");
}

test("a tags block in a note lists its tags as rows, not as the note's tag pills", async ({ page, request }) => {
  await request.put("/api/file", { headers: H, data: { path: "notes/look-tags.md", text: "# T\n\n```view\ntype: tags\n```\n" } });
  await openNote(page, "look-tags");
  const row = page.locator(".cm-content .tags-block li > button").first();
  await expect(row).toBeVisible();
  await expect(row).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await expect(row).toHaveCSS("border-radius", await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--radius-sm").trim()));
});

test("the captures block stacks its answers under the text when the block is narrow, whatever the window", async ({ page, request }) => {
  await request.put("/api/file", { headers: H, data: { path: "log/2026-10-28.md", text: "# 2026-10-28\n\n- 09:00 a narrow capture\n" } });
  await request.put("/api/file", { headers: H, data: { path: "notes/look-captures.md", text: "# C\n\n```view\ntype: captures\n```\n" } });
  await page.setViewportSize({ width: 1300, height: 800 });
  await openNote(page, "look-captures");
  const row = page.locator(".cm-content [data-testid=captures] li", { hasText: "a narrow capture" });
  await expect(row).toBeVisible();
  // wide: the answers sit on the text's line
  const one = async () => { const t = (await row.locator(".text").boundingBox())!, a = (await row.locator(".acts").boundingBox())!; return a.y < t.y + t.height; };
  expect(await one()).toBe(true);
  // the block narrowed by its column, the window still wide
  await page.locator(".cm-content [data-testid=captures]").evaluate((el) => { (el as HTMLElement).style.width = "420px"; });
  await expect.poll(one).toBe(false);
});

test("a search block names its files as its lines do, and keeps its rows tight inside a note", async ({ page, request }) => {
  await request.put("/api/file", { headers: H, data: { path: "notes/look-search.md", text: "# S\n\n```view\ntype: search\nq: Hubbard\n```\n" } });
  await openNote(page, "look-search");
  const block = page.locator(".cm-content .search-block");
  await expect(block.getByRole("button", { name: "notes/hubbard", exact: true })).toHaveAttribute("title", "notes/hubbard.md");
  await expect(block.locator("li").first()).toHaveCSS("margin-top", "0px");
});

test("a search block in a note does not find its own query line", async ({ page, request }) => {
  await request.put("/api/file", { headers: H, data: { path: "notes/look-self.md", text: "# Self\n\n```view\ntype: search\nq: zebrafish\n```\n" } });
  await request.put("/api/file", { headers: H, data: { path: "notes/look-zebra.md", text: "# Z\n\nA zebrafish line.\n" } });
  await openNote(page, "look-self");
  const block = page.locator(".cm-content .search-block");
  await expect(block).toContainText("A zebrafish line.");
  await expect(block).toContainText("1 lines");
  await expect(block).not.toContainText("q: zebrafish");
});

test("task lists in blocks tick the note's own checkbox, and a framed base gets no hover band", async ({ page, request }) => {
  await request.put("/api/file", { headers: H, data: { path: "notes/look-checks.md", text: "# C\n\n- [ ] a block task 📅 2026-10-12\n\n```view\ntype: list\n```\n\n![[all.base]]\n" } });
  await openNote(page, "look-checks");
  const box = page.locator(".cm-content .atlas-block input[type=checkbox]").first();
  await expect(box).toHaveClass(/atlas-check/);
  await expect(box).toHaveCSS("appearance", "none");
  const host = page.locator(".cm-content .cm-rendered-block", { has: page.locator(".base.embedded") });
  await host.hover();
  await expect(host).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
});
