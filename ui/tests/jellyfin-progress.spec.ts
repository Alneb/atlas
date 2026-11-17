import { test, expect, type APIRequestContext } from "@playwright/test";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// The Jellyfin plugin's reports (`[media] progress`): the core calls its helper with the plugin's token put in, and the
// helper tells a stand-in Jellyfin — the play session opened once, then progress, then stopped on close.
const H = { "x-atlas": "1" };
const put = (r: APIRequestContext, path: string, text: string) => r.put("/api/file", { headers: H, data: { path, text } });
const file = (f: string) => readFileSync(fileURLToPath(new URL(`../../plugins/beta/jellyfin/${f}`, import.meta.url)), "utf8");
let server: Server, port = 0;
const asked: { path: string; token: string; body: { ItemId?: string; PositionTicks?: number; IsPaused?: boolean } }[] = [];

test.beforeAll(async ({ request }) => {
  server = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      asked.push({ path: req.url ?? "", token: String(req.headers["x-emby-token"] ?? ""), body: body ? JSON.parse(body) : {} });
      res.writeHead(204).end();
    });
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  port = (server.address() as AddressInfo).port;
  for (const f of ["plugin.toml", "main.js", "jf.js", "helper.js"]) await put(request, `.atlas/plugins/jellyfin/${f}`, file(f));
  await request.put("/api/plugins/jellyfin/settings", { headers: H, data: { server: `http://127.0.0.1:${port}`, token: "jf-1" } });
});
test.afterAll(async ({ request }) => {
  await request.post("/api/plugins/jellyfin/remove", { headers: H });
  await new Promise((done) => server.close(done));
});

test("where you are goes to Jellyfin's play session: opened once, kept up, stopped", async ({ request }) => {
  const report = (body: object) => request.post("/api/plugins/jellyfin/media/progress", { headers: H, data: body });
  const first = await (await report({ key: { item: "f1" }, at: 10, duration: 6960, listened: 10, state: "playing" })).json();
  expect(first.key).toEqual({ item: "f1", started: true });
  await (await report({ key: first.key, at: 25, duration: 6960, listened: 15, state: "paused" })).json();
  const last = await (await report({ key: first.key, at: 26, duration: 6960, listened: 1, state: "closed" })).json();
  expect(last.key).toEqual({ item: "f1" });
  expect(asked.map((a) => a.path)).toEqual(["/Sessions/Playing", "/Sessions/Playing/Progress", "/Sessions/Playing/Progress", "/Sessions/Playing/Stopped"]);
  expect(asked.every((a) => a.token === "jf-1")).toBe(true);
  expect(asked[1].body).toMatchObject({ ItemId: "f1", PositionTicks: 100_000_000, IsPaused: false });
  expect(asked[2].body.IsPaused).toBe(true);
});
