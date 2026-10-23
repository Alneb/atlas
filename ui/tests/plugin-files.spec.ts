import { test, expect, type APIRequestContext } from "@playwright/test";

// `atlas.list(dir)` and `atlas.writeText(path, text, { baseMtime })` (docs/guides/PLUGIN-API.md, "Files and notes"):
// what a library plugin (manga, books) walks its folder and keeps its reading.json with.
const H = { "x-atlas": "1" };
const put = (r: APIRequestContext, path: string, text: string) => r.put("/api/file", { headers: H, data: { path, text } });
const MAIN = `export async function register(atlas) {
  const cell = atlas.shell.statusItem({ id: "files", text: "…" });
  try {
    const rows = await atlas.list("lib");
    const first = await atlas.writeText("lib/series/reading.json", '{"last":"1"}');
    const again = await atlas.writeText("lib/series/reading.json", '{"last":"2"}', { baseMtime: first.mtime });
    let refused = "no";
    try { await atlas.writeText("lib/series/reading.json", '{"last":"3"}', { baseMtime: 1 }); } catch (e) { refused = String(e.status); }
    cell.set(rows.map((r) => r.name + (r.dir ? "/" : ":" + r.size)).sort().join(",") + " | " + (again.mtime >= first.mtime) + " | " + refused);
  } catch (e) { cell.set("error " + e); }
}\n`;

test.beforeAll(async ({ request }) => {
  await put(request, "lib/series/c1.txt", "abc");
  await put(request, "lib/loose.txt", "hello");
  await put(request, ".atlas/plugins/files/plugin.toml", 'title = "Files"\n');
  await put(request, ".atlas/plugins/files/main.js", MAIN);
});
test.afterAll(async ({ request }) => { await put(request, ".atlas/plugins/files/main.js", "export function register() {}\n"); });

test("a plugin lists a folder and writes its own file whole, 409-safe", async ({ page }) => {
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  const cell = page.locator('.status [data-cell="files:files"]');
  await expect(cell).toBeAttached();
  await expect.poll(() => cell.evaluate((el) => el.textContent ?? "")).toBe("loose.txt:5,series/ | true | 409");
  const r = await page.request.get("/api/file?path=lib/series/reading.json", { headers: H });
  expect((await r.json()).text).toBe('{"last":"2"}');
});
