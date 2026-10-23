import { test, expect } from "@playwright/test";
import { shownName } from "../src/lib/paths";

// "Embed in note…" (the plan's phase 1): a tab's menu puts that pane as a live block into the note
// last written in — a ```view block, plain text in the note.
const H = { "x-atlas": "1" };

test("a tab's menu embeds its pane in the note last written in", async ({ page, request }) => {
  await request.put("/api/file", { headers: H, data: { path: "notes/embed-here.md", text: "# Embed here\n\nFirst paragraph.\n\nSecond paragraph.\n" } });
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  for (const name of ["journal.md", "embed-here.md"]) {
    await page.keyboard.press("Control+p");
    await page.keyboard.type(name);
    await expect(page.getByTestId("palette").getByText(shownName(name), { exact: true }).first()).toBeVisible();
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("sidebar").locator(".tab", { hasText: shownName(name) })).toHaveCount(1);
    await page.waitForTimeout(300);
  }
  await page.getByText("First paragraph.").click();
  const sidebar = page.getByTestId("sidebar");
  await sidebar.locator(".tab", { hasText: "journal" }).click({ button: "right" });
  await page.getByRole("menuitem", { name: "Embed in embed-here" }).click();
  const text = () => request.get("/api/file?path=notes/embed-here.md", { headers: H }).then((r) => r.json()).then((j) => String(j.text));
  await expect.poll(text, { timeout: 8000 }).toContain("First paragraph.\n\n```view\ntype: editor\npath: journal.md\n```\n");
  expect(await text()).toContain("Second paragraph.");
  // the note's own tab offers no "embed in itself"; a terminal is not a thing to embed
  await sidebar.locator(".tab", { hasText: "embed-here" }).click({ button: "right" });
  await expect(page.getByRole("menuitem", { name: /^Embed in/ })).toHaveCount(0);
});
