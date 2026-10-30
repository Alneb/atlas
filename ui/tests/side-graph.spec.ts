import { test, expect, type Page } from "@playwright/test";

async function openNote(page: Page, name: string, shows: string) {
  await page.keyboard.press("Control+p");
  await page.keyboard.type(name);
  await expect(page.getByTestId("palette").getByText(name.replace(/\.md$/, ""), { exact: true }).first()).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page.locator(".cm-content").first()).toContainText(shows);
}

// Local follows the note in front of the reader, not the one open when it was ticked.
test("Graph: Local follows the active note; Enter in the filter opens the match", async ({ page }) => {
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await openNote(page, "hubbard.md", "Energy");
  await page.keyboard.press("Meta+Shift+G");
  const pane = page.locator(".graph-pane");
  await expect(pane.locator(".meta")).toHaveText(/[1-9]\d* notes/);
  await pane.getByLabel("Local (active note)").check();
  await expect(pane.locator(".meta")).toHaveText("3 notes · 2 links");

  // a typed depth past the field's max is brought back to it
  await pane.getByLabel("Depth").fill("9");
  await pane.getByLabel("Depth").press("Tab");
  await expect(pane.getByLabel("Depth")).toHaveValue("4");
  await pane.getByLabel("Depth").fill("1");
  await pane.getByLabel("Depth").press("Tab");
  await expect(pane.locator(".meta")).toHaveText("3 notes · 2 links");

  await openNote(page, "related.md", "See the");
  await page.keyboard.press("Meta+Shift+G");
  await expect(pane.locator(".meta")).toHaveText("2 notes · 1 link");

  // the filter's Enter opens the note it names; Esc empties it
  await pane.getByLabel("Filter notes").fill("hubbard");
  await pane.getByLabel("Filter notes").press("Enter");
  await expect(page.locator(".cm-content").first()).toContainText("Energy");
  await page.keyboard.press("Meta+Shift+G");
  await pane.getByLabel("Filter notes").press("Escape");
  await expect(pane.getByLabel("Filter notes")).toHaveValue("");
});

// Nothing drawn: the canvas says why instead of staying blank.
test("Graph: an empty drawing explains itself", async ({ page }) => {
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await page.route("**/api/graph*", (r) => r.fulfill({ json: { nodes: [], edges: [] } }));
  await page.keyboard.press("Meta+Shift+G");
  await expect(page.locator(".graph-pane .empty")).toContainText("No notes yet");
});
