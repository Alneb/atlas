import { test, expect, type APIRequestContext } from "@playwright/test";

// The sidebar's width / collapsed state and the left-bar side panel's choice are a file of the vault
// (.atlas/cache/shell.json), not the browser's storage: the desktop app and a browser tab agree.
const H = { "x-atlas": "1" };
const FILE = ".atlas/cache/shell.json";
async function restore(request: APIRequestContext, on: boolean) {
  const d = await (await request.get("/api/config", { headers: H })).json();
  d.config.ui.restore_layout = on;
  expect((await request.put("/api/config", { headers: H, data: d.config })).ok()).toBeTruthy();
}
const saved = async (request: APIRequestContext) => JSON.parse((await (await request.get(`/api/file?path=${FILE}`, { headers: H })).json()).text ?? "{}");
test.afterEach(async ({ request }) => {
  await restore(request, false);
  await request.put("/api/file", { headers: H, data: { path: FILE, text: "{}" } });
  await request.put("/api/file", { headers: H, data: { path: ".atlas/cache/layout.json", text: "null" } });
});

test("a fresh window takes the sidebar's state from the vault's file and writes changes back", async ({ page, request }) => {
  await restore(request, true);
  await request.put("/api/file", { headers: H, data: { path: FILE, text: JSON.stringify({ sidebar: { width: 300, collapsed: true } }) } });
  await page.goto("/"); // a new browser profile: nothing in its own storage
  const slot = page.getByTestId("sidebar").locator("xpath=..");
  await expect.poll(async () => (await slot.boundingBox())!.width).toBeLessThan(80); // collapsed, as the file says
  await page.getByTestId("sidebar-toggle").click();
  await expect.poll(async () => (await slot.boundingBox())!.width).toBe(300);
  await expect.poll(async () => (await saved(request)).sidebar?.collapsed).toBe(false);
  expect((await saved(request)).sidePanel).toMatchObject({ kind: "files" });
});
