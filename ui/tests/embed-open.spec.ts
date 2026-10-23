import { test, expect } from "@playwright/test";

// From an embed to the original: the ↗ over the embed under the pointer, and Ctrl+click in it.
const H = { "x-atlas": "1" };

test.beforeAll(async ({ request }) => {
  await request.put("/api/file", { headers: H, data: { path: "notes/embedder.md", text: "# Embedder\n\nfirst line\n\n![[Embedded note#Second]]\n\nlast line\n" } });
  await request.put("/api/file", { headers: H, data: { path: "notes/Embedded note.md", text: "# Embedded note\n\n## First\n\none\n\n## Second\n\nthe original part\n" } });
});

async function openEmbedder(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await page.keyboard.press("Control+p");
  await page.keyboard.type("embedder.md");
  await expect(page.getByTestId("palette").getByText("embedder", { exact: true }).first()).toBeVisible();
  await page.keyboard.press("Enter");
  const embed = page.locator(".cm-rendered-block .note-embed");
  await expect(embed).toContainText("the original part");
  return embed;
}

const tabs = (page: import("@playwright/test").Page) => page.locator(".dv-tab");

test("the ↗ over an embed opens the original note", async ({ page }) => {
  const embed = await openEmbedder(page);
  await embed.hover();
  const button = page.locator("button.embed-open");
  await expect(button).toBeVisible();
  await button.click();
  await expect(tabs(page).filter({ hasText: "Embedded note" })).toHaveCount(1);
});

test("Ctrl+click in an embed opens the original, and adds no second caret", async ({ page }) => {
  const embed = await openEmbedder(page);
  await embed.getByText("the original part").click({ modifiers: ["Control"] });
  await expect(tabs(page).filter({ hasText: "Embedded note" })).toHaveCount(1);
});
