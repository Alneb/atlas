import { test, expect, type Page, type APIRequestContext } from "@playwright/test";

// The explorer's tools beyond browsing: Quick look (Space: the file large over the list, ← → through the folder's
// files, Esc back to the list) and Move to… (a folder of the vault chosen in the palette).
const H = { "x-atlas": "1" };
const put = (r: APIRequestContext, path: string, text = `# ${path}\n`) => r.put("/api/file", { headers: H, data: { path, text } });
const xrow = (page: Page, name: string) => page.locator(".explorer .x-row", { has: page.locator(".label", { hasText: new RegExp(`^${name.replace(/[.[\]]/g, "\\$&")}$`) }) });

async function explorerAt(page: Page, note: string, folder: string) {
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await page.evaluate((p) => (window as any).__atlas.open(p), note);
  await page.locator(".editor-pane .crumbs button", { hasText: folder }).click();
  await expect(page.locator(".explorer .crumbs")).toContainText(folder);
}

test("Quick look: Space shows the file over the list, → the next one, Esc back to the list", async ({ page, request }) => {
  await put(request, "ql/a.md", "# Alpha\n\nfirst file\n");
  await put(request, "ql/b.md", "# Beta\n\nsecond file\n");
  await explorerAt(page, "ql/a.md", "ql");
  await xrow(page, "a.md").click();
  await page.keyboard.press(" ");
  const look = page.getByRole("dialog", { name: /Quick look/ });
  await expect(look).toBeVisible();
  await expect(look.locator(".ql-meta")).toContainText("1 of 2");
  await page.keyboard.press("ArrowRight");
  await expect(look).toHaveAttribute("aria-label", "Quick look: b.md");
  await page.keyboard.press("Escape");
  await expect(look).toHaveCount(0);
  await expect(page.locator(".explorer .x-row.sel")).toContainText("b.md"); // the list follows the look
});

test("Move to…: a row's menu moves it into a folder chosen in the palette", async ({ page, request }) => {
  await put(request, "mv-from/note.md", "# Note\n");
  await put(request, "mv-to/keep.md", "# Keep\n");
  await explorerAt(page, "mv-from/note.md", "mv-from");
  await xrow(page, "note.md").click({ button: "right" });
  await page.getByRole("menuitem", { name: "Move to… a folder of the vault" }).click();
  const palette = page.getByTestId("palette");
  await page.keyboard.type("mv-to");
  await palette.getByText("mv-to", { exact: true }).first().click();
  await expect.poll(async () => (await request.get("/api/file?path=mv-to/note.md", { headers: H })).status()).toBe(200);
  await expect(xrow(page, "note.md")).toHaveCount(0);
});
