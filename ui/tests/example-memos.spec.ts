import { test, expect, type APIRequestContext } from "@playwright/test";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// The example memos plugin installed as it is, against a stand-in memos server.
const H = { "x-atlas": "1" };
const put = (r: APIRequestContext, path: string, text: string) => r.put("/api/file", { headers: H, data: { path, text } });
const example = (f: string) => readFileSync(fileURLToPath(new URL(`../../plugins/examples/memos/${f}`, import.meta.url)), "utf8");
let server: Server, port = 0;
const got: { url: string; auth: string; body: { content: string; visibility: string } }[] = [];

test.beforeAll(async ({ request }) => {
  server = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => { got.push({ url: req.url ?? "", auth: String(req.headers.authorization ?? ""), body: JSON.parse(body || "{}") }); res.writeHead(200, { "content-type": "application/json" }); res.end("{}"); });
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  port = (server.address() as AddressInfo).port;
  await put(request, ".atlas/plugins/memos/main.js", example("main.js"));
  await put(request, ".atlas/plugins/memos/plugin.toml", example("plugin.toml"));
});
test.afterAll(async ({ request }) => {
  await put(request, ".atlas/plugins/memos/main.js", "export function register() {}\n");
  await new Promise((done) => server.close(done));
});

test("the example memos plugin saves a typed line as a private memo, with the token", async ({ page, request }) => {
  await request.put("/api/plugins/memos/settings", { headers: H, data: { server: `http://127.0.0.1:${port}`, token: "mt-1" } });
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await page.keyboard.press("F1");
  await page.keyboard.type("memos: new memo");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("palette").getByRole("textbox")).toBeFocused();
  await page.keyboard.type("an idea for the talk");
  await page.keyboard.press("Enter");
  await expect.poll(() => got.length).toBe(1);
  expect(got[0]).toEqual({ url: "/api/v1/memos", auth: "Bearer mt-1", body: { content: "an idea for the talk", visibility: "PRIVATE" } });
});
