import { test, expect } from "@playwright/test";

// "what is this this is confusing" (a wall of near-identical "Drafted for you" cards): the list is one
// line until opened, says that nothing is written without Keep, and alike sibling folders are one
// suggestion, not a card each.
const H = { "x-atlas": "1" };

test("drafted tools: one line until opened; sibling folders are one suggestion", async ({ page, request }) => {
  for (const course of ["qm", "em", "topo"]) for (let i = 0; i < 4; i++) {
    await request.put("/api/file", { headers: H, data: { path: `notes/courses/${course}/l${i}.md`, text: `---\ntype: lecture\ncourse: ${course}\ndate: 2025-01-0${i + 1}\n---\n` } });
  }
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await page.keyboard.press("Meta+,");
  await page.getByRole("navigation", { name: "Settings pages" }).getByRole("button", { name: /^Plugins & automation/ }).click();
  const drafts = page.locator(".drafts").first();
  const line = drafts.locator(".summary");
  // the line names the first suggestion and why; the section says what suggestions are (2026-10-18: "what is this")
  await expect(line).toContainText("A database of");
  await expect(page.getByText("Nothing is created until you press Keep")).toBeVisible();
  await expect(drafts.getByRole("button", { name: "Keep", exact: true })).toHaveCount(0);
  await line.click();
  await expect(drafts.locator("li", { hasText: "A database of courses" })).toHaveCount(1);
  await expect(drafts.locator("li", { hasText: "the 3 folders of notes/courses/" })).toHaveCount(1);
  await expect(drafts.locator("li", { hasText: "A database of qm" })).toHaveCount(0);
  // dismissed: gone for good, nothing written
  await drafts.locator("li", { hasText: "A database of courses" }).getByRole("button", { name: "Dismiss" }).click();
  await expect(drafts.locator("li", { hasText: "A database of courses" })).toHaveCount(0);
  expect((await request.get("/api/file?path=notes/courses.base", { headers: H })).ok()).toBeFalsy();
});
