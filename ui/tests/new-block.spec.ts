import { test, expect } from "@playwright/test";

// Settings → Plugins → "New block": a plugin folder with one block from a template, live at once —
// usable in a note without a restart (docs/guides/EXTENDING.md).
const H = { "x-atlas": "1" };

test("a block made from the template works in a note straight away", async ({ page, request }) => {
  await request.put("/api/file", { headers: H, data: { path: "notes/uses-block.md", text: "---\nstate: open\n---\n# Uses a block\n\n```view\ntype: reading-streak.block\ntext: Hi there\n```\n\nafter\n" } });
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await page.keyboard.press("Meta+,");
  await page.getByRole("navigation", { name: "Settings pages" }).getByRole("button", { name: /^Plugins( \d+)?$/ }).click();
  await page.getByRole("button", { name: "New block", exact: true }).click();
  await page.keyboard.type("Reading streak");
  await page.keyboard.press("Enter");
  // its code opens, ready to edit; the folder holds a manifest and the block
  await expect(page.locator(".cm-content")).toContainText('atlas.registerBlock("reading-streak.block"');
  const toml = await request.get("/api/file?path=.atlas/plugins/reading-streak/plugin.toml", { headers: H }).then((r) => r.json());
  expect(toml.text).toContain('title = "Reading streak"');

  await page.keyboard.press("Control+p");
  await page.keyboard.type("uses-block.md");
  await expect(page.getByTestId("palette").getByText("uses-block", { exact: true }).first()).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page.locator(".cm-content")).toContainText("Hi there — 1 properties in notes/uses-block.md");
});
