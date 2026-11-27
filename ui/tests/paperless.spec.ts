import { test, expect, type APIRequestContext } from "@playwright/test";
import { openFile, runCommand } from "./open";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// The Paperless plugin installed as it is, against a stand-in of Paperless-ngx's API: the block lists a search's
// documents with links into Paperless; the Documents library lists every document with its names, and Open fetches
// the PDF into the local copies of remote files; the agent's tools search and read one.
const H = { "x-atlas": "1" };
const put = (r: APIRequestContext, path: string, text: string) => r.put("/api/file", { headers: H, data: { path, text } });
const shipped = (f: string) => readFileSync(fileURLToPath(new URL(`../../plugins/beta/paperless/${f}`, import.meta.url)), "utf8");
const FILES = ["main.js", "client.js", "pl.js", "helper.js", "plugin.toml"];
let server: Server, port = 0;
const asked: { url: string; auth: string }[] = [];
const uploads: { type: string; body: string }[] = [];

const DOCS = [
  { id: 12, title: "Electricity March", created: "2026-03-02", correspondent: 7, document_type: 3, tags: [1], page_count: 2, archived_file_name: "a.pdf", content: "Amount due 42.10", added: "2026-03-03T09:00:00Z" },
  { id: 15, title: "Invoice April", created_date: "2026-04-01", correspondent: null, document_type: 3, tags: [], archived_file_name: "b.pdf", content: "", added: "2026-04-02T09:00:00Z" },
];
const PDF = "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj 3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n";

test.beforeAll(async ({ request }) => {
  server = createServer((req, res) => {
    const url = req.url ?? "";
    asked.push({ url, auth: String(req.headers.authorization ?? "") });
    const json = (v: unknown) => { res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify(v)); };
    if (url === "/api/documents/post_document/" && req.method === "POST") {
      const chunks: Buffer[] = [];
      req.on("data", (c: Buffer) => chunks.push(c));
      req.on("end", () => { uploads.push({ type: String(req.headers["content-type"] ?? ""), body: Buffer.concat(chunks).toString("latin1") }); json("b7c3e1f0-task"); });
      return;
    }
    if (url.startsWith("/api/tags/")) return json({ results: [{ id: 1, name: "power" }] });
    if (url.startsWith("/api/correspondents/")) return json({ results: [{ id: 7, name: "City Power" }] });
    if (url.startsWith("/api/document_types/")) return json({ results: [{ id: 3, name: "Invoice" }] });
    if (url.startsWith("/api/documents/12/download/")) { res.writeHead(200, { "content-type": "application/pdf" }); return void res.end(PDF); }
    if (url.startsWith("/api/documents/12/thumb/")) { res.writeHead(404); return void res.end(); }
    if (url.startsWith("/api/documents/12/")) return json({ ...DOCS[0], content: "Amount due 42.10, the whole text" });
    if (url.startsWith("/api/documents/?page_size=10&query=invoice")) return json({ results: [{ id: 12, title: "Invoice March", created_date: "2026-03-02" }, { id: 15, title: "Invoice April", created_date: "2026-04-01" }] });
    if (url.startsWith("/api/documents/?page=1")) return json({ count: 2, next: null, results: url.includes("query=power") ? [DOCS[0]] : DOCS });
    res.writeHead(404); res.end();
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  port = (server.address() as AddressInfo).port;
  for (const f of FILES) await put(request, `.atlas/plugins/paperless/${f}`, shipped(f));
  await put(request, "inbox/scan March.pdf", PDF);
  await put(request, "notes/papers-office.md", "# Office\n\n```view\ntype: paperless.search\nquery: invoice\n```\n\nend\n");
  await request.put("/api/plugins/paperless/settings", { headers: H, data: { server: `http://127.0.0.1:${port}`, token: "pl-1" } });
});
test.afterAll(async ({ request }) => {
  await put(request, ".atlas/plugins/paperless/main.js", "export function register() {}\n");
  await new Promise((done) => server.close(done));
});

test("a Paperless block lists the documents of its search, with links into Paperless", async ({ page }) => {
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await openFile(page, "papers-office.md");
  const link = page.locator(".cm-content a", { hasText: "Invoice March" });
  await expect(link).toHaveAttribute("href", `http://127.0.0.1:${port}/documents/12/details`);
  await expect(page.locator(".cm-content a", { hasText: "Invoice April" })).toBeVisible();
  expect(asked.find((a) => a.url.startsWith("/api/documents/?page_size=10"))).toEqual({ url: "/api/documents/?page_size=10&query=invoice", auth: "Token pl-1" });
});

test("the Documents library lists every document with its names; Open keeps its PDF and opens it", async ({ page }) => {
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await runCommand(page, "Paperless: documents", "Paperless: documents");
  const lib = page.locator('.library[data-source="paperless"]');
  await expect(lib.locator(".card")).toHaveCount(2, { timeout: 15_000 });
  await lib.locator(".card", { hasText: "Electricity March" }).click();
  const detail = lib.locator(".detail");
  await expect(detail.locator("h2")).toHaveText("Electricity March");
  await expect(detail).toContainText("City Power · Invoice · 2026-03-02");
  await detail.getByRole("button", { name: "Open" }).click();
  await expect.poll(() => asked.some((a) => a.url === "/api/documents/12/download/" && a.auth === "Token pl-1")).toBe(true);
  await expect(page.getByTestId("sidebar").locator(".tab", { hasText: "Electricity March" })).toBeVisible({ timeout: 15_000 });
});

test("an agent searches the archive and reads one document whole", async ({ request }) => {
  const found = await (await request.post("/api/plugins/paperless/tools/search", { headers: H, data: { query: "power" }, timeout: 60_000 })).json();
  const docs = found.documents;
  expect(docs.map((d: { title: string }) => d.title)).toEqual(["Electricity March"]);
  expect(docs[0]).toMatchObject({ id: 12, correspondent: "City Power", type: "Invoice", tags: ["power"], url: `http://127.0.0.1:${port}/documents/12/details` });
  const one = await (await request.post("/api/plugins/paperless/tools/get", { headers: H, data: { id: 12 }, timeout: 60_000 })).json();
  expect(one.text).toBe("Amount due 42.10, the whole text");
});

test("Send to Paperless posts the open file as Paperless's upload form, titled by its name", async ({ page }) => {
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await openFile(page, "scan March.pdf");
  await runCommand(page, "Paperless: send the open", "Paperless: send the open file");
  await expect.poll(() => uploads.length, { timeout: 15_000 }).toBe(1);
  expect(uploads[0].type).toMatch(/^multipart\/form-data; boundary=/);
  expect(uploads[0].body).toContain('name="document"; filename="scan March.pdf"');
  expect(uploads[0].body).toContain("%PDF-1.4");
  expect(uploads[0].body).toMatch(/name="title"\r\n\r\nscan March\r\n/);
  await expect(page.getByText("Sent scan March.pdf to Paperless")).toBeVisible();
});
