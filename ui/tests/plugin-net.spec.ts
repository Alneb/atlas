import { test, expect, type APIRequestContext } from "@playwright/test";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

// Plugins v4, network and secrets (docs/guides/PLUGINS.md "v4"): `atlas.fetch` goes through the core, only to
// hosts the manifest lists, and a header can be a secret the core fills in — the page never sends it.
const H = { "x-atlas": "1" };
const put = (r: APIRequestContext, path: string, text: string) => r.put("/api/file", { headers: H, data: { path, text } });
let server: Server, port = 0;
const seen: { url: string; auth: string }[] = [];

test.beforeAll(async ({ request }) => {
  server = createServer((req, res) => {
    seen.push({ url: req.url ?? "", auth: String(req.headers.authorization ?? "") });
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ hello: "from the server", path: req.url }));
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  port = (server.address() as AddressInfo).port;
  const main = `export function register(atlas) {
  const cell = atlas.shell.statusItem({ id: "out", text: "idle" });
  atlas.registerCommand({ id: "go", title: "Net demo: call the server", run: async () => {
    await atlas.secrets.set("token", "tok-abc");
    const r = await atlas.fetch("http://127.0.0.1:${port}/things?x=1", { headers: { Authorization: { secret: "token", prefix: "Bearer " } } });
    const j = await r.json();
    cell.set(r.status + " " + j.hello + " " + j.path + " has:" + (await atlas.secrets.has("token")));
  } });
  atlas.registerCommand({ id: "stray", title: "Net demo: call a host that is not listed", run: async () => {
    try { await atlas.fetch("http://localhost:${port}/x"); cell.set("went through"); } catch (e) { cell.set("refused: " + e.message); }
  } });
}\n`;
  await put(request, ".atlas/plugins/netdemo/main.js", main);
  await put(request, ".atlas/plugins/netdemo/plugin.toml", 'title = "Net demo"\n\n[permissions]\nnet = ["127.0.0.1"]\nsecrets = true\n');
});
test.afterAll(async ({ request }) => {
  await put(request, ".atlas/plugins/netdemo/main.js", "export function register() {}\n");
  await new Promise((done) => server.close(done));
});

test("a plugin calls a listed host through the core with its secret; another host is refused", async ({ page }) => {
  const fromPage: string[] = [];
  page.on("request", (r) => { if (r.url().includes(`:${port}/`)) fromPage.push(r.url()); });
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  const cell = page.locator('.status [data-cell="netdemo:out"]');
  await expect(cell).toHaveText("idle");
  const run = async (title: string) => { await page.keyboard.press("F1"); await page.keyboard.type(title); await page.keyboard.press("Enter"); };

  await run("Net demo: call the server");
  await expect(cell).toHaveText("200 from the server /things?x=1 has:true");
  expect(seen.at(-1), "the core sent the secret").toEqual({ url: "/things?x=1", auth: "Bearer tok-abc" });
  expect(fromPage, "the page itself never talked to that server").toEqual([]);

  await run("Net demo: call a host that is not listed");
  await expect(cell).toContainText("refused:");
  await expect(cell).toHaveAttribute("data-cell", "netdemo:out");
  expect(seen.length, "nothing was sent to the host that is not listed").toBe(1);
});
