import { test, expect, type APIRequestContext } from "@playwright/test";
import { openFile, runCommand } from "./open";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { WS } from "../playwright.config";

// The Immich plugin installed as it is, against a stand-in Immich: the block's latest photos as thumbnails, each
// fetched by the core into the plugin's cache (`saveTo`) with the key it keeps; the Photos library by month, Open
// keeping the photo in the local copies of remote files; the agent's smart search; Send to Immich's upload form.
const H = { "x-atlas": "1" };
const put = (r: APIRequestContext, path: string, text: string) => r.put("/api/file", { headers: H, data: { path, text } });
const shipped = (f: string) => readFileSync(fileURLToPath(new URL(`../../plugins/beta/immich/${f}`, import.meta.url)), "utf8");
const FILES = ["main.js", "client.js", "im.js", "helper.js", "plugin.toml"];
// the smallest PNG there is: one pixel
const PIXEL = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64");
let server: Server, port = 0;
const keys: string[] = [];
const asked: string[] = [];
const uploads: { type: string; body: string }[] = [];
const ITEMS = [
  { id: "a1", type: "IMAGE", originalFileName: "beach.jpg", localDateTime: "2026-03-14T16:20:00.000Z", exifInfo: { city: "Lisbon", country: "Portugal" }, people: [{ id: "p1", name: "Ana" }] },
  { id: "a2", type: "IMAGE", originalFileName: "lab.jpg", localDateTime: "2026-02-02T09:00:00.000Z", exifInfo: {}, people: [] },
];

test.beforeAll(async ({ request }) => {
  server = createServer((req, res) => {
    keys.push(String(req.headers["x-api-key"] ?? ""));
    asked.push(`${req.method} ${req.url}`);
    const json = (v: unknown) => { res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify(v)); };
    if (req.method === "POST" && req.url === "/api/search/metadata") return json({ assets: { items: ITEMS, nextPage: null } });
    if (req.method === "POST" && req.url === "/api/search/smart") return json({ assets: { items: [ITEMS[0]], nextPage: null } });
    if (req.method === "POST" && req.url === "/api/assets") {
      const chunks: Buffer[] = [];
      req.on("data", (c: Buffer) => chunks.push(c));
      req.on("end", () => { uploads.push({ type: String(req.headers["content-type"] ?? ""), body: Buffer.concat(chunks).toString("latin1") }); json({ id: "n1", status: "created" }); });
      return;
    }
    res.writeHead(200, { "content-type": "image/png" });
    res.end(PIXEL);
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  port = (server.address() as AddressInfo).port;
  for (const f of FILES) await put(request, `.atlas/plugins/immich/${f}`, shipped(f));
  await request.put("/api/plugins/immich/settings", { headers: H, data: { server: `http://127.0.0.1:${port}`, key: "im-key", device: "test-laptop" } });
  await put(request, "notes/photos-week.md", "# Photos\n\n```view\ntype: immich.recent\ncount: 2\n```\n\nend\n");
});
test.afterAll(async ({ request }) => {
  await put(request, ".atlas/plugins/immich/main.js", "export function register() {}\n");
  await new Promise((done) => server.close(done));
});

test("an Immich block shows the latest photos, fetched by the core into the plugin's cache", async ({ page }) => {
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await openFile(page, "photos-week.md");
  const imgs = page.locator('.cm-content img[alt="beach.jpg"], .cm-content img[alt="lab.jpg"]');
  await expect(imgs).toHaveCount(2);
  expect(keys.every((k) => k === "im-key"), "the key on every request, put in by the core").toBe(true);
  expect(existsSync(join(WS, ".atlas/cache/plugins/immich/thumbs/a1.jpg"))).toBe(true);
});


test("the Photos library lists the newest photos by month; Open keeps one and opens it", async ({ page }) => {
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await runCommand(page, "Immich: photos", "Immich: photos");
  const lib = page.locator('.library[data-source="immich"]');
  await expect(lib.locator(".card")).toHaveCount(2, { timeout: 15_000 });
  await expect(lib.locator(".side")).toContainText("2026 March");
  await lib.locator(".card", { hasText: "beach.jpg" }).click();
  const detail = lib.locator(".detail");
  await expect(detail).toContainText("2026-03-14 · Lisbon, Portugal · Ana");
  await detail.getByRole("button", { name: "Open" }).click();
  await expect.poll(() => existsSync(join(WS, ".atlas/remote/immich/photos/a1/beach.jpg")), { timeout: 15_000 }).toBe(true);
  expect(asked).toContain("GET /api/assets/a1/original");
});

test("an agent finds a photo by what is in it", async ({ request }) => {
  const r = await (await request.post("/api/plugins/immich/tools/search", { headers: H, data: { query: "beach" }, timeout: 60_000 })).json();
  expect(r.photos).toEqual([{ id: "a1", type: "photo", file: "beach.jpg", taken: "2026-03-14T16:20:00.000Z", place: "Lisbon, Portugal", people: ["Ana"], url: `http://127.0.0.1:${port}/photos/a1` }]);
});

test("Send to Immich posts the open picture as Immich's upload form", async ({ page }) => {
  mkdirSync(join(WS, "pictures"), { recursive: true });
  writeFileSync(join(WS, "pictures/dot.png"), PIXEL);
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await openFile(page, "dot.png");
  await runCommand(page, "Immich: send the open", "Immich: send the open picture");
  await expect.poll(() => uploads.length, { timeout: 15_000 }).toBe(1);
  expect(uploads[0].type).toMatch(/^multipart\/form-data; boundary=/);
  expect(uploads[0].body).toContain('name="assetData"; filename="dot.png"');
  expect(uploads[0].body).toMatch(/name="deviceAssetId"\r\n\r\natlas:pictures\/dot\.png\r\n/);
  expect(uploads[0].body).toMatch(/name="deviceId"\r\n\r\ntest-laptop\r\n/);
  await expect(page.getByText("Sent dot.png to Immich")).toBeVisible();
});
