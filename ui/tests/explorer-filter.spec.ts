import { test, expect, type Page } from "@playwright/test";

// The explorer like a file manager (panes/Explorer.svelte): a filter over the folder (Ctrl+F), "Below" for every
// folder under it, a preview of the selected file drawn as a note embeds it, and Split — a second explorer beside.
const H = { "x-atlas": "1" };

async function explorer(page: Page) {
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await page.keyboard.press("F1");
  await page.keyboard.type("the explorer");
  await expect(page.getByTestId("palette").getByText("Files: the explorer (vault, SSH hosts, servers)", { exact: true }).first()).toBeVisible();
  await page.keyboard.press("Enter");
  const pane = page.locator(".explorer").first();
  await expect(pane.locator(".place.on")).toBeVisible();
  return pane;
}

test("filter the folder, then every folder below it; the selected file previewed; Split opens a second explorer", async ({ page, request }) => {
  await request.put("/api/file", { headers: H, data: { path: "xf/apple notes.md", text: "# Apple notes\n\nRed and green.\n" } });
  await request.put("/api/file", { headers: H, data: { path: "xf/banana.md", text: "# Banana\n" } });
  await request.put("/api/file", { headers: H, data: { path: "xf/deep/apple pie.md", text: "# Apple pie\n" } });
  const pane = await explorer(page);
  const labels = pane.locator(".x-row .label");
  await pane.locator(".x-row", { hasText: "xf" }).first().dblclick();
  await expect(labels).toHaveText(["deep", "apple notes.md", "banana.md"]);
  // Ctrl+F from the list: the filter, as you type
  await pane.locator(".list").focus();
  await page.keyboard.press("Control+f");
  await expect(pane.getByLabel("Filter this folder")).toBeFocused();
  await page.keyboard.type("apple");
  await expect(labels).toHaveText(["apple notes.md"]);
  // Below: the folders under it too, by their path from here
  await pane.getByRole("button", { name: "Below" }).click();
  await expect(labels).toHaveText(["apple notes.md", "deep/apple pie.md"]);
  // the preview: the note drawn as an embed draws it
  await pane.getByRole("button", { name: "Preview" }).click();
  await labels.filter({ hasText: "apple notes.md" }).click();
  await expect(pane.getByRole("complementary", { name: "Preview" })).toContainText("Red and green.");
  // Escape in the filter: everything back
  await pane.getByLabel("Filter this folder").press("Escape");
  await expect(labels).toHaveText(["deep", "apple notes.md", "banana.md"]);
  // Split: another explorer, at the same folder
  await pane.getByRole("button", { name: "Split" }).click();
  await expect(page.locator(".explorer")).toHaveCount(2);
  await expect(page.locator(".explorer").nth(1).locator(".crumbs")).toContainText("xf");
});
