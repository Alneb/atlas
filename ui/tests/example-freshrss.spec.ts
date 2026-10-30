import { test, expect, type APIRequestContext } from "@playwright/test";
import { openFile } from "./open";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// The example FreshRSS plugin installed as it is, against a stand-in Fever API: unread articles in a
// block; "Save" makes a note of one in the reading folder.
const H = { "x-atlas": "1" };
const put = (r: APIRequestContext, path: string, text: string) => r.put("/api/file", { headers: H, data: { path, text } });
const read = async (r: APIRequestContext, path: string) => ((await (await r.get(`/api/file?path=${encodeURIComponent(path)}`, { headers: H })).json()) as { text?: string }).text ?? "";
const example = (f: string) => readFileSync(fileURLToPath(new URL(`../../plugins/examples/freshrss/${f}`, import.meta.url)), "utf8");
let server: Server, port = 0;
const bodies: string[] = [];

test.beforeAll(async ({ request }) => {
  server = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      bodies.push(body);
      res.writeHead(200, { "content-type": "application/json" });
      if ((req.url ?? "").includes("unread_item_ids")) return res.end(JSON.stringify({ auth: 1, unread_item_ids: "7,8" }));
      res.end(JSON.stringify({ auth: 1, items: [{ id: 7, title: "Kondo physics today", url: "https://example.org/kondo", html: "<p>The <b>Kondo</b> effect again.</p>" }, { id: 8, title: "Second article", url: "https://example.org/2", html: "" }] }));
    });
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  port = (server.address() as AddressInfo).port;
  await put(request, ".atlas/plugins/freshrss/main.js", example("main.js"));
  await put(request, ".atlas/plugins/freshrss/plugin.toml", example("plugin.toml"));
  await put(request, "notes/feeds.md", "# Feeds\n\n```view\ntype: freshrss.unread\n```\n\nend\n");
});
test.afterAll(async ({ request }) => {
  await put(request, ".atlas/plugins/freshrss/main.js", "export function register() {}\n");
  await new Promise((done) => server.close(done));
});

test("a FreshRSS block lists the unread articles; Save makes a note of one", async ({ page, request }) => {
  await request.put("/api/plugins/freshrss/settings", { headers: H, data: { server: `http://127.0.0.1:${port}`, api_key: "fever-key" } });
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await openFile(page, "feeds.md");
  const row = page.locator(".cm-content li", { hasText: "Kondo physics today" });
  await expect(row).toBeVisible();
  expect(bodies[0]).toBe("api_key=fever-key");
  await row.getByRole("button", { name: "Save" }).click();
  await expect.poll(() => read(request, "notes/reading/Kondo physics today.md")).toContain("The Kondo effect again.");
});
