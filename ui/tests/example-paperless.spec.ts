import { test, expect, type APIRequestContext } from "@playwright/test";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// The example Paperless plugin installed as it is, against a stand-in Paperless API: a block in a
// note lists the documents matching its query, each a link into Paperless.
const H = { "x-atlas": "1" };
const put = (r: APIRequestContext, path: string, text: string) => r.put("/api/file", { headers: H, data: { path, text } });
const example = (f: string) => readFileSync(fileURLToPath(new URL(`../../plugins/beta/paperless/${f}`, import.meta.url)), "utf8");
let server: Server, port = 0;
const asked: { url: string; auth: string }[] = [];

test.beforeAll(async ({ request }) => {
  server = createServer((req, res) => {
    asked.push({ url: req.url ?? "", auth: String(req.headers.authorization ?? "") });
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ results: [{ id: 12, title: "Invoice March", created_date: "2026-03-02" }, { id: 15, title: "Invoice April", created_date: "2026-04-01" }] }));
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  port = (server.address() as AddressInfo).port;
  await put(request, ".atlas/plugins/paperless/main.js", example("main.js"));
  await put(request, ".atlas/plugins/paperless/plugin.toml", example("plugin.toml"));
  await put(request, "notes/papers-office.md", "# Office\n\n```view\ntype: paperless.search\nquery: invoice\n```\n\nend\n");
});
test.afterAll(async ({ request }) => {
  await put(request, ".atlas/plugins/paperless/main.js", "export function register() {}\n");
  await new Promise((done) => server.close(done));
});

test("a Paperless block lists the documents of its search, with links into Paperless", async ({ page, request }) => {
  await request.put("/api/plugins/paperless/settings", { headers: H, data: { server: `http://127.0.0.1:${port}`, token: "pl-1" } });
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await page.keyboard.press("Control+p");
  await page.keyboard.type("papers-office.md");
  await expect(page.getByTestId("palette").getByText("papers-office", { exact: true }).first()).toBeVisible();
  await page.keyboard.press("Enter");
  const link = page.locator(".cm-content a", { hasText: "Invoice March" });
  await expect(link).toHaveAttribute("href", `http://127.0.0.1:${port}/documents/12/details`);
  await expect(page.locator(".cm-content a", { hasText: "Invoice April" })).toBeVisible();
  expect(asked[0]).toEqual({ url: "/api/documents/?page_size=10&query=invoice", auth: "Token pl-1" });
});
