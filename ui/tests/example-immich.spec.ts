import { test, expect, type APIRequestContext } from "@playwright/test";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { WS } from "../playwright.config";

// The example Immich plugin installed as it is, against a stand-in Immich: the latest photos as
// thumbnails, each fetched by the core into the plugin's cache (`saveTo`) with the key it keeps.
const H = { "x-atlas": "1" };
const put = (r: APIRequestContext, path: string, text: string) => r.put("/api/file", { headers: H, data: { path, text } });
const example = (f: string) => readFileSync(fileURLToPath(new URL(`../../plugins/examples/immich/${f}`, import.meta.url)), "utf8");
// the smallest PNG there is: one pixel
const PIXEL = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64");
let server: Server, port = 0;
const keys: string[] = [];

test.beforeAll(async ({ request }) => {
  server = createServer((req, res) => {
    keys.push(String(req.headers["x-api-key"] ?? ""));
    if (req.method === "POST" && req.url === "/api/search/metadata") {
      res.writeHead(200, { "content-type": "application/json" });
      return res.end(JSON.stringify({ assets: { items: [{ id: "a1", originalFileName: "beach.jpg" }, { id: "a2", originalFileName: "lab.jpg" }] } }));
    }
    res.writeHead(200, { "content-type": "image/png" });
    res.end(PIXEL);
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  port = (server.address() as AddressInfo).port;
  await put(request, ".atlas/plugins/immich/main.js", example("main.js"));
  await put(request, ".atlas/plugins/immich/plugin.toml", example("plugin.toml"));
  await put(request, "notes/photos-week.md", "# Photos\n\n```view\ntype: immich.recent\ncount: 2\n```\n\nend\n");
});
test.afterAll(async ({ request }) => {
  await put(request, ".atlas/plugins/immich/main.js", "export function register() {}\n");
  await new Promise((done) => server.close(done));
});

test("an Immich block shows the latest photos, fetched by the core into the plugin's cache", async ({ page, request }) => {
  await request.put("/api/plugins/immich/settings", { headers: H, data: { server: `http://127.0.0.1:${port}`, key: "im-key" } });
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await page.keyboard.press("Control+p");
  await page.keyboard.type("photos-week.md");
  await expect(page.getByTestId("palette").getByText("photos-week", { exact: true }).first()).toBeVisible();
  await page.keyboard.press("Enter");
  const imgs = page.locator('.cm-content img[alt="beach.jpg"], .cm-content img[alt="lab.jpg"]');
  await expect(imgs).toHaveCount(2);
  expect(keys.every((k) => k === "im-key"), "the key on every request, put in by the core").toBe(true);
  expect(existsSync(join(WS, ".atlas/cache/plugins/immich/thumbs/a1.jpg"))).toBe(true);
});
