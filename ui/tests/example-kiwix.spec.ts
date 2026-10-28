import { test, expect, type APIRequestContext } from "@playwright/test";
import { createServer, type Server } from "node:http";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { AddressInfo } from "node:net";

// The Kiwix plugin's pane against a stand-in kiwix-serve (its catalog, /suggest and /search as libkiwix answers them):
// a book chosen among the server's, titles while typing, the full text on Enter, an article's link and its Save.
const H = { "x-atlas": "1" };
const DIR = ".atlas/plugins/kiwix";
const put = (r: APIRequestContext, path: string, text: string) => r.put("/api/file", { headers: H, data: { path, text } });
const plugin = (f: string) => readFileSync(fileURLToPath(new URL(`../../plugins/beta/kiwix/${f}`, import.meta.url)), "utf8");
const BOOK = "wikipedia_es_all_maxi_2026-05";
const entry = (id: string, name: string, title: string, lang: string) =>
  `<entry><id>urn:uuid:${id}</id><title>${title}</title><language>${lang}</language><name>${name}</name><articleCount>1000</articleCount>` +
  `<link type="text/html" href="/content/${id}" /></entry>`;
const CATALOG = `<?xml version="1.0" encoding="UTF-8"?><feed xmlns="http://www.w3.org/2005/Atom">` +
  entry(BOOK, "wikipedia_es_all", "Wikipedia", "spa") + entry("devdocs_en_python_2025-07", "devdocs_en_python", "Python Docs", "eng") + `</feed>`;
const SEARCH = `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0" xmlns:opensearch="http://a9.com/-/spec/opensearch/1.1/"><channel>
  <opensearch:totalResults>70,000</opensearch:totalResults>
  <item><title>Relatividad general</title><link>/content/${BOOK}/Relatividad_general</link><description>...la teoría &lt;b&gt;general&lt;/b&gt; de la gravitación...</description></item>
  <item><title>Einstein (cráter)</title><link>/content/${BOOK}/Einstein_(cr%C3%A1ter)</link><description>un cráter lunar</description></item>
</channel></rss>`;
let server: Server;
const asked: string[] = [];

test.beforeAll(async ({ request }) => {
  server = createServer((req, res) => {
    const u = new URL(req.url ?? "/", "http://x");
    asked.push(`${u.pathname}?${u.searchParams}`);
    if (u.pathname === "/catalog/v2/entries") return res.end(CATALOG);
    if (u.pathname === "/suggest" && u.searchParams.get("content") === BOOK)
      return res.end(JSON.stringify([{ value: "Einstein", label: "<b>Einstein</b>", kind: "path", path: "Einstein" }, { value: "containing 'ein'…", kind: "pattern" }]));
    if (u.pathname === "/search" && u.searchParams.get("content") === BOOK) return res.end(SEARCH);
    res.statusCode = 404;
    res.end("no");
  });
  await new Promise<void>((ok) => server.listen(0, "127.0.0.1", ok));
  const { port } = server.address() as AddressInfo;
  await put(request, `${DIR}/main.js`, plugin("main.js"));
  await put(request, `${DIR}/view.js`, plugin("view.js"));
  // the vault's values in their own file, never in the manifest
  await put(request, ".atlas/plugin-settings/kiwix.toml", `server = "http://127.0.0.1:${port}/"\nbooks = "wikipedia"\n`);
  await put(request, `${DIR}/plugin.toml`, plugin("plugin.toml"));
});
test.afterAll(async ({ request }) => {
  server?.close();
  await request.post("/api/plugins/kiwix/remove", { headers: H });
});

test("Kiwix: a book of the server, titles while typing, the full text on Enter, an article's link and its Save", async ({ page }) => {
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await expect(async () => {
    if (await page.getByTestId("palette").isVisible()) await page.keyboard.press("Escape");
    await page.keyboard.press("F1");
    await page.keyboard.type("Kiwix: search");
    await page.getByTestId("palette").getByText("Kiwix: search the offline library").first().click({ timeout: 1000 });
    await expect(page.locator(".kx")).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 10_000 });
  const pane = page.locator(".kx");
  // only the books the setting names ("wikipedia")
  await expect(pane.locator(".kx-status")).toHaveText("1 books on 127.0.0.1:" + (server.address() as AddressInfo).port);
  await expect(pane.locator(".kx-book option")).toHaveText(["Wikipedia (spa) · maxi 2026-05"]);

  await pane.locator(".kx-q").fill("Ein");
  const first = pane.locator(".kx-hit .kx-title").first();
  await expect(first).toHaveText("Einstein");
  await expect(pane.locator(".kx-hit"), "a pattern suggestion is not an article").toHaveCount(1);
  await expect(first).toHaveAttribute("href", /\/content\/wikipedia_es_all_maxi_2026-05\/Einstein$/);

  await pane.locator(".kx-q").press("Enter");
  await expect(pane.locator(".kx-status")).toHaveText("70,000 articles — the first 2");
  await expect(pane.locator(".kx-hit .kx-title")).toHaveText(["Relatividad general", "Einstein (cráter)"]);
  await expect(pane.locator(".kx-snip").first()).toHaveText("...la teoría general de la gravitación...");
  await expect(pane.locator(".kx-hit .kx-title").nth(1)).toHaveAttribute("href", /\/Einstein_\(cr%C3%A1ter\)$/);

  await pane.locator(".kx-save").first().click();
  await expect(page.getByText(/Relatividad general — captured/)).toBeVisible();
});
