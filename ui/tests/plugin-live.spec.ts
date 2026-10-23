import { test, expect, type APIRequestContext } from "@playwright/test";

// `atlas.live.join` (API 8, docs/guides/PLUGIN-API.md; REFACTOR-core-to-plugins.md A4): a plugin's two windows on one
// file's room hear each other, and exactly one of them is the room's writer.
const H = { "x-atlas": "1" };
const put = (r: APIRequestContext, path: string, text: string) => r.put("/api/file", { headers: H, data: { path, text } });
const MAIN = `export function register(atlas) {
  const room = atlas.live.join("notes/shared.md", { message: (from, m) => { document.body.dataset.heard = String(m.text); } });
  window.__room = room;
  window.__pen = atlas.pen;
}
`;

test.beforeAll(async ({ request }) => {
  await put(request, ".atlas/plugins/echo/plugin.toml", 'title = "Echo"\napi = 8\n');
  await put(request, ".atlas/plugins/echo/main.js", MAIN);
});
test.afterAll(async ({ request }) => { await put(request, ".atlas/plugins/echo/main.js", "export function register() {}\n"); });

test("a plugin's live room: a message from one window arrives in the other, one of them writes", async ({ browser }) => {
  const [a, b] = await Promise.all([browser.newPage(), browser.newPage()]);
  for (const p of [a, b]) {
    await p.goto("/");
    await p.getByText("Finish the GW notes.").waitFor();
  }
  for (const p of [a, b]) await expect.poll(() => p.evaluate(() => (window as unknown as { __room?: { others(): number } }).__room?.others() ?? -1)).toBe(1);
  await b.evaluate(() => (window as unknown as { __room: { send(m: unknown): void } }).__room.send({ text: "from b" }));
  await expect.poll(() => a.evaluate(() => document.body.dataset.heard)).toBe("from b");
  const writes = await Promise.all([a, b].map((p) => p.evaluate(() => (window as unknown as { __room: { writes(): boolean } }).__room.writes())));
  expect(writes.filter(Boolean)).toHaveLength(1);
  await Promise.all([a.close(), b.close()]);
});

test("a plugin asks the core's pen recogniser: a held circle comes back as a shape", async ({ page }) => {
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  const wire = await page.evaluate(async () => {
    const xyt: number[] = [];
    for (let i = 0; i <= 60; i++) { const a = (i / 60) * 2 * Math.PI; xyt.push(200 + 80 * Math.cos(a), 200 + 80 * Math.sin(a), i * 12); }
    for (let i = 1; i <= 10; i++) xyt.push(280, 200, 720 + i * 70); // held still at the end
    return (await (window as unknown as { __pen: { shape(x: number[]): Promise<{ wire: number[] }> } }).__pen.shape(xyt)).wire;
  });
  // the wire of an ellipse (atlas-pen shape.rs; lib/pen-shapes.ts wireToSkeleton): [3, cx, cy, width, height, angle]
  expect(wire[0]).toBe(3);
  expect(Math.abs(wire[1] - 200) + Math.abs(wire[2] - 200)).toBeLessThan(10);
  expect(Math.abs(wire[3] - 160) + Math.abs(wire[4] - 160)).toBeLessThan(20);
});
