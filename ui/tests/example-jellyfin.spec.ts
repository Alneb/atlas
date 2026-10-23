import { test, expect, type APIRequestContext } from "@playwright/test";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// The example Jellyfin plugin installed as it is, against a stand-in: the last things watched.
const H = { "x-atlas": "1" };
const put = (r: APIRequestContext, path: string, text: string) => r.put("/api/file", { headers: H, data: { path, text } });
const example = (f: string) => readFileSync(fileURLToPath(new URL(`../../plugins/beta/jellyfin/${f}`, import.meta.url)), "utf8");
let server: Server, port = 0;
const asked: { url: string; token: string }[] = [];

test.beforeAll(async ({ request }) => {
  server = createServer((req, res) => {
    asked.push({ url: req.url ?? "", token: String(req.headers["x-emby-token"] ?? "") });
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ Items: [{ Type: "Episode", SeriesName: "Dark", Name: "Secrets", UserData: { LastPlayedDate: "2026-10-12T21:00:00Z" } }, { Type: "Movie", Name: "Arrival", UserData: { LastPlayedDate: "2026-10-10T20:00:00Z" } }] }));
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  port = (server.address() as AddressInfo).port;
  await put(request, ".atlas/plugins/jellyfin/main.js", example("main.js"));
  await put(request, ".atlas/plugins/jellyfin/plugin.toml", example("plugin.toml"));
  await put(request, "notes/watched.md", "# Watched\n\n```view\ntype: jellyfin.watched\n```\n\nend\n");
});
test.afterAll(async ({ request }) => {
  await put(request, ".atlas/plugins/jellyfin/main.js", "export function register() {}\n");
  await new Promise((done) => server.close(done));
});

test("a Jellyfin block lists the last things watched, newest first", async ({ page, request }) => {
  await request.put("/api/plugins/jellyfin/settings", { headers: H, data: { server: `http://127.0.0.1:${port}`, user: "u1", token: "jf-1" } });
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await page.keyboard.press("Control+p");
  await page.keyboard.type("watched.md");
  await expect(page.getByTestId("palette").getByText("watched", { exact: true }).first()).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page.locator(".cm-content li").first()).toContainText("Dark — Secrets");
  await expect(page.locator(".cm-content li", { hasText: "Arrival" })).toContainText("2026-10-10");
  expect(asked[0].url.startsWith("/Users/u1/Items?Filters=IsPlayed")).toBe(true);
  expect(asked[0].token).toBe("jf-1");
});
