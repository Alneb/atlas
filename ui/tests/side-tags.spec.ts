import { test, expect } from "@playwright/test";

const H = { "x-atlas": "1" };
const LONG = "a-note-whose-name-goes-on-and-on-without-a-single-space-to-break-it-anywhere-at-all";

// A tag's notes: a long name is cut with an ellipsis inside the list, and a slow answer for a tag
// clicked before never lands under the tag clicked after.
test("Tags: long note names stay in the list; a stale answer does not list under another tag", async ({ page, request }) => {
  const put = (path: string, text: string) => request.put("/api/file", { headers: H, data: { path, text } });
  await put(`notes/${LONG}.md`, "# Long\n\n#sidelong\n");
  await put("notes/side-quick.md", "# Quick\n\n#sidequick\n");
  await put("SideTags.page", "title: Side tags\nrows:\n  - [tags]\n");
  await page.setViewportSize({ width: 900, height: 700 });
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await page.keyboard.press("Control+p");
  await page.keyboard.type("SideTags.page");
  await expect(page.getByTestId("palette").getByText(/^Side ?tags$/i).first()).toBeVisible();
  await page.keyboard.press("Enter");
  const block = page.locator(".tags-block");

  await block.getByRole("button", { name: /sidelong\s*1/ }).click();
  const note = block.locator(".notes .note").first();
  await expect(note).toHaveText(LONG);
  const fits = await note.evaluate((b) => b.scrollWidth <= b.clientWidth + 1);
  expect(fits).toBe(true);
  await block.getByRole("button", { name: /sidelong\s*1/ }).click(); // folded again

  // sidelong's answer is held back; sidequick is clicked meanwhile and answers first
  let release!: () => void;
  const held = new Promise<void>((r) => (release = r));
  await page.route(/\/api\/search\?.*sidelong/, async (route) => { await held; await route.continue(); });
  await block.getByRole("button", { name: /sidelong\s*1/ }).click();
  await block.getByRole("button", { name: /sidequick\s*1/ }).click();
  await expect(block.locator(".notes .note")).toHaveText(["side-quick"]);
  release();
  await page.waitForTimeout(500);
  await expect(block.locator(".notes .note")).toHaveText(["side-quick"]);
});

// A tag whose notes cannot be read says so above the list, which stays.
test("Tags: a failed read is said inline, the tags stay", async ({ page, request }) => {
  await request.put("/api/file", { headers: H, data: { path: "notes/side-fail.md", text: "# F\n\n#sidefail\n" } });
  await request.put("/api/file", { headers: H, data: { path: "SideTags.page", text: "title: Side tags\nrows:\n  - [tags]\n" } });
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await page.keyboard.press("Control+p");
  await page.keyboard.type("SideTags.page");
  await expect(page.getByTestId("palette").getByText(/^Side ?tags$/i).first()).toBeVisible();
  await page.keyboard.press("Enter");
  const block = page.locator(".tags-block");
  await page.route(/\/api\/search\?.*sidefail/, (r) => r.fulfill({ status: 500, body: "the index is busy" }));
  await block.getByRole("button", { name: /sidefail\s*1/ }).click();
  await expect(block.locator(".view-error")).toBeVisible();
  await expect(block.getByRole("button", { name: /sidefail\s*1/ })).toBeVisible();
  await page.unroute(/\/api\/search\?.*sidefail/);
  await block.getByRole("button", { name: /sidefail\s*1/ }).click(); // fold
  await block.getByRole("button", { name: /sidefail\s*1/ }).click(); // and again: read now
  await expect(block.locator(".notes .note")).toHaveText(["side-fail"]);
  await expect(block.locator(".view-error")).toHaveCount(0);
});
