import { test, expect } from "@playwright/test";
import { openFile } from "./open";

// Tags: frontmatter `tags:` and inline #tags, nested with "/". A `tags` block lists them with their
// notes; `tag:<name>` in quick open (and the Search pane) lists a tag's notes.
const H = { "x-atlas": "1" };

test("the tags block nests tags and opens a tag's notes; tag: works in quick open", async ({ page, request }) => {
  const put = (path: string, text: string) => request.put("/api/file", { headers: H, data: { path, text } });
  await put("notes/tag-a.md", "# A\n\nabout #zoology/birds and `#notatag`\n");
  await put("notes/tag-b.md", "---\ntags: [zoology]\n---\n# B\n");
  await put("Tags.page", "title: Tags\nrows:\n  - [tags]\n");
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await openFile(page, "Tags.page");
  const block = page.locator(".tags-block");
  const zoo = block.getByRole("button", { name: /zoology\s*2/ });
  await expect(zoo).toBeVisible();
  await expect(block.getByRole("button", { name: /birds\s*1/ })).toBeVisible();
  await expect(block.getByText("notatag")).toHaveCount(0);
  await zoo.click();
  await expect(block.locator(".notes .note")).toHaveText(["tag-a", "tag-b"]);
  await block.locator(".notes .note", { hasText: "tag-b" }).click();
  await expect(page.getByTestId("sidebar").locator(".tab", { hasText: "tag-b" })).toHaveCount(1);

  // the note just opened takes the focus a moment later: typed before, the query went into the note
  await expect(page.locator(".cm-editor.cm-focused")).toHaveCount(1);
  await page.keyboard.press("Control+p");
  const palette = page.getByTestId("palette");
  await expect(palette.getByRole("textbox")).toBeFocused();
  await page.keyboard.type("tag:zoology/birds");
  await expect(palette.getByRole("textbox")).toHaveValue("tag:zoology/birds");
  await expect(palette.getByText("tag-a", { exact: true }).first()).toBeVisible({ timeout: 15_000 }); // the index answers; slower under load
  await expect(palette.getByText("tag-b", { exact: true })).toHaveCount(0);
});
