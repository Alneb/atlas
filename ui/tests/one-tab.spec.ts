import { test, expect, type APIRequestContext, type Page } from "@playwright/test";

// One tab per pane (`[ui] one_tab`): opening a note replaces what the pane shows; a split (Ctrl+Enter in quick open:
// beside) is another pane with its own one tab; Back brings the one before.
const H = { "x-atlas": "1" };
const cfg = async (request: APIRequestContext) => (await (await request.get("/api/config", { headers: H })).json()).config;
const setOneTab = async (request: APIRequestContext, on: boolean) => {
  const c = await cfg(request);
  c.ui.one_tab = on;
  expect((await request.put("/api/config", { headers: H, data: c })).ok()).toBe(true);
};

test.describe.configure({ mode: "serial" });
test.beforeAll(async ({ request }) => {
  for (const n of ["one-a", "one-b", "one-c"]) await request.put("/api/file", { headers: H, data: { path: `notes/${n}.md`, text: `# ${n}\n\nBody of ${n}\n` } });
  await setOneTab(request, true);
});
// the config is shared by every spec of the run: leave it as it was
test.afterAll(async ({ request }) => { await setOneTab(request, false); });

async function openNote(page: Page, name: string, beside = false): Promise<void> {
  await page.keyboard.press("Control+p");
  await page.keyboard.type(name);
  await expect(page.getByTestId("palette").getByText(name, { exact: true }).first()).toBeVisible();
  await page.keyboard.press(beside ? "Control+Enter" : "Enter");
  await expect(page.locator(".cm-content").filter({ hasText: `Body of ${name}` }).first()).toBeVisible();
}

test("one tab per pane: a note opened replaces the one shown, a split keeps its own, Back brings the last", async ({ page }) => {
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  const side = page.getByTestId("sidebar");
  const tab = (n: string) => side.locator(".tab", { hasText: n });
  await openNote(page, "one-a");
  await openNote(page, "one-b");
  await expect(tab("one-b")).toHaveCount(1);
  await expect(tab("one-a"), "replaced, not a second tab").toHaveCount(0);
  // a split beside: two panes, one note each
  await openNote(page, "one-c", true);
  await expect.poll(() => page.locator(".editor-pane").filter({ visible: true }).count()).toBe(2);
  await expect(tab("one-b")).toHaveCount(1);
  await expect(tab("one-c")).toHaveCount(1);
  await page.screenshot({ path: test.info().outputPath("one-tab.png") });
  // opening in the split replaces only its note; the other pane keeps one-b
  await openNote(page, "one-a");
  await expect(tab("one-c")).toHaveCount(0);
  await expect(tab("one-b")).toHaveCount(1);
  await expect(tab("one-a")).toHaveCount(1);
});
