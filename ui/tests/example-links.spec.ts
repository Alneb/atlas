import { test, expect, type APIRequestContext } from "@playwright/test";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Catalog · Linkwarden's links block (moved there from the Clip plugin), against a stand-in Linkwarden: the links listed (an
// older server: /api/v1/search is a 404, /api/v1/links answers), the search typed reaches the server.
const H = { "x-atlas": "1" };
const put = (r: APIRequestContext, path: string, text: string) => r.put("/api/file", { headers: H, data: { path, text } });
const example = (f: string) => readFileSync(fileURLToPath(new URL(`../../plugins/beta/catalog-linkwarden/${f}`, import.meta.url)), "utf8");
let server: Server, port = 0;
const asked: string[] = [];

test.beforeAll(async ({ request }) => {
  server = createServer((req, res) => {
    asked.push(`${req.url} ${req.headers.authorization ?? ""}`);
    if ((req.url ?? "").startsWith("/api/v1/search")) { res.writeHead(404); return res.end(); }
    const q = new URL(req.url ?? "/", "http://x").searchParams.get("searchQueryString") ?? "";
    const all = [{ id: 3, name: "Kondo lattice review", url: "https://example.org/kondo", tags: [{ name: "physics" }] }, { id: 4, name: "Recipe", url: "https://example.org/food", tags: [] }];
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ response: all.filter((l) => l.name.toLowerCase().includes(q.toLowerCase())) }));
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  port = (server.address() as AddressInfo).port;
  await put(request, ".atlas/plugins/catalog-linkwarden/main.js", example("main.js"));
  // without the catalog here (the block is the page's own; `requires` would keep it from loading)
  await put(request, ".atlas/plugins/catalog-linkwarden/plugin.toml", example("plugin.toml").replace(/^requires = .*$/m, ""));
  await put(request, "notes/links.md", "# Links\n\n```view\ntype: linkwarden.links\n```\n\nend\n");
});
test.afterAll(async ({ request }) => {
  await put(request, ".atlas/plugins/catalog-linkwarden/main.js", "export function register() {}\n");
  await new Promise((done) => server.close(done));
});

test("a Linkwarden block lists the links and searches them", async ({ page, request }) => {
  await request.put("/api/plugins/catalog-linkwarden/settings", { headers: H, data: { address: `http://127.0.0.1:${port}`, token: "lw-token" } });
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await page.keyboard.press("Control+p");
  await page.keyboard.type("links.md");
  await expect(page.getByTestId("palette").getByText("links", { exact: true }).first()).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("link", { name: "Kondo lattice review" })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole("link", { name: "Recipe" })).toBeVisible();
  expect(asked.some((a) => a.includes("Bearer lw-token")), "the token is put in by the core").toBe(true);
  await page.getByPlaceholder("Search Linkwarden…").fill("kondo");
  await expect(page.getByRole("link", { name: "Recipe" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Kondo lattice review" })).toBeVisible();
});
