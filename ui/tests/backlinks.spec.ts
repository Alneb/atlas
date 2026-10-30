import { test, expect } from "@playwright/test";
import { openFile } from "./open";

test("a note lists the notes that link to it, and a mention jumps to its line", async ({ page }) => {
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await openFile(page, "hubbard.md");
  const bl = page.locator(".backlinks");
  await expect(bl.locator(".head")).toContainText("Linked mentions 2");
  if (!(await bl.locator(".list").isVisible())) await bl.locator(".head").click(); // folded by default
  await expect(bl.locator(".src .name")).toHaveText(["journal", "related"]);
  await expect(bl.locator(".ctx mark").first()).toHaveText("[the model](notes/hubbard.md)");
  await bl.locator(".ctx", { hasText: "See the" }).click();
  await expect(page.locator(".cm-activeLine")).toContainText("See the");
  await expect(page.locator(".cm-content")).toContainText("Related");
});

test("unlinked mentions: the note's name in another note, linked with one click", async ({ page, request }) => {
  const h = { "x-atlas": "1" };
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await openFile(page, "Topic.md");
  const bl = page.locator(".backlinks");
  await expect(bl.locator(".head")).toContainText("unlinked 1");
  if (!(await bl.locator(".list").isVisible())) await bl.locator(".head").click();
  await expect(bl.locator(".urow")).toContainText("mentions the topic");
  await bl.locator(".urow").getByRole("button", { name: "Link" }).click();
  await expect(bl.locator(".urow")).toHaveCount(0);
  const text = (await (await request.get("/api/file?path=db/other.md", { headers: h })).json()).text;
  expect(text).toContain("mentions the [[Topic|topic]] in passing");
});
