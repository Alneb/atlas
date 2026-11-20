import { test, expect, type APIRequestContext, type Page } from "@playwright/test";

// New tabs on top (`[ui] new_tabs_first`): a note opened goes first in the tab list instead of last.
const H = { "x-atlas": "1" };
const setFirst = async (request: APIRequestContext, on: boolean) => {
  const c = (await (await request.get("/api/config", { headers: H })).json()).config;
  c.ui.new_tabs_first = on;
  expect((await request.put("/api/config", { headers: H, data: c })).ok()).toBe(true);
};

test.describe.configure({ mode: "serial" });
test.beforeAll(async ({ request }) => {
  for (const n of ["first-a", "first-b", "first-c"]) await request.put("/api/file", { headers: H, data: { path: `notes/${n}.md`, text: `# ${n}\n\nBody of ${n}\n` } });
});
// the config is shared by every spec of the run: leave it as it was
test.afterAll(async ({ request }) => { await setFirst(request, false); });

async function openNote(page: Page, name: string): Promise<void> {
  await page.keyboard.press("Control+p");
  await page.keyboard.type(name);
  await expect(page.getByTestId("palette").getByText(name, { exact: true }).first()).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page.locator(".cm-content").filter({ hasText: `Body of ${name}` }).first()).toBeVisible();
}

/** The `first-*` tabs in the order the side list shows them. */
const order = (page: Page) => page.getByTestId("sidebar").locator(".tab", { hasText: "first-" }).allInnerTexts().then((t) => t.map((s) => s.match(/first-\w/)?.[0]));

for (const on of [false, true]) {
  test(`new tabs go ${on ? "first" : "last"} with new_tabs_first ${on ? "on" : "off"}`, async ({ page, request }) => {
    await setFirst(request, on);
    await page.goto("/");
    await page.getByText("Finish the GW notes.").waitFor();
    for (const n of ["first-a", "first-b", "first-c"]) await openNote(page, n);
    await expect.poll(() => order(page)).toEqual(on ? ["first-c", "first-b", "first-a"] : ["first-a", "first-b", "first-c"]);
  });
}
