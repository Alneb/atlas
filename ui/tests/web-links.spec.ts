import { test, expect } from "@playwright/test";
import { createServer, type Server } from "node:http";

// Web links open as a tab of Atlas when the site allows being shown inside a page, else in a window.
const H = { "x-atlas": "1" };
let site: Server, port = 0;
test.beforeAll(async () => {
  site = createServer((req, res) => {
    if (req.url?.startsWith("/closed")) res.setHeader("x-frame-options", "DENY");
    res.setHeader("content-type", "text/html");
    res.end("<h1>A web page</h1>");
  });
  await new Promise<void>((ok) => site.listen(0, "127.0.0.1", ok));
  port = (site.address() as { port: number }).port;
});
test.afterAll(() => site.close());
// the desktop app's window says so before the page runs (atlas-app main.rs); these tests are that window
const asDesktop = (page: import("@playwright/test").Page) => page.addInitScript(() => { (window as unknown as { __atlasDesktop: boolean }).__atlasDesktop = true; });

test("a web link opens as a tab when the site allows it, else in a window", async ({ page, request }) => {
  await asDesktop(page);
  await request.put("/api/file", { headers: H, data: { path: "notes/web-links.md", text: `# Links\n\n[open site](http://127.0.0.1:${port}/open)\n\n[closed site](http://127.0.0.1:${port}/closed)\n` } });
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await page.keyboard.press("Control+p");
  await page.keyboard.type("web-links");
  await expect(page.getByTestId("palette").getByText(/web-links/).first()).toBeVisible();
  await page.keyboard.press("Enter");
  // the reading of the link: in the editor a click on a link's text follows it with Ctrl; the reading view by a click
  const tabs = page.getByTestId("sidebar").locator(".tab");
  await page.evaluate((p) => { const a = document.createElement("a"); a.href = `http://127.0.0.1:${p}/open`; a.textContent = "x"; document.body.append(a); a.click(); a.remove(); }, port);
  await expect(tabs.filter({ hasText: `127.0.0.1:${port}` })).toHaveCount(1, { timeout: 10_000 });
  await expect(page.frameLocator("iframe").first().getByRole("heading", { name: "A web page" })).toBeVisible();
  // another site (localhost, not 127.0.0.1): the answer is kept per site
  const popup = page.waitForEvent("popup", { timeout: 10_000 });
  await page.evaluate((p) => { const a = document.createElement("a"); a.href = `http://localhost:${p}/closed`; a.textContent = "y"; document.body.append(a); a.click(); a.remove(); }, port);
  expect((await popup).url()).toContain("/closed");
});

test("Browse the web… opens an address in a tab, and words as a search", async ({ page }) => {
  await asDesktop(page);
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await page.keyboard.press("F1");
  await page.keyboard.type("Browse the web");
  await page.getByTestId("palette").getByText(/^Browse the web/).first().click();
  await page.keyboard.type(`http://127.0.0.1:${port}/open`); // a bare address would be https://, which this site is not
  await expect(page.getByTestId("palette").getByText(`Open http://127.0.0.1:${port}/open`)).toBeVisible();
  await page.keyboard.press("Enter");
  const tabs = page.getByTestId("sidebar").locator(".tab");
  await expect(tabs.filter({ hasText: `127.0.0.1:${port}` })).toHaveCount(1, { timeout: 10_000 });
  await expect(page.frameLocator("iframe").first().getByRole("heading", { name: "A web page" })).toBeVisible();
  // words: a search, offered as one
  await page.keyboard.press("F1");
  await page.keyboard.type("Browse the web");
  await page.getByTestId("palette").getByText(/^Browse the web/).first().click();
  await page.keyboard.type("hubbard model");
  await expect(page.getByTestId("palette").getByText("Search the web for “hubbard model”")).toBeVisible();
});

test("Shift+click, or a link marked data-outside, opens in the system's browser through the core, not as a tab", async ({ page }) => {
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  const asked: string[] = [];
  await page.route("**/api/open-outside", async (r) => { asked.push(r.request().postDataJSON().url); await r.fulfill({ status: 204 }); });
  const click = (href: string, shift: boolean, outside = false) => page.evaluate(([h, s, o]) => {
    const a = document.createElement("a"); a.href = h as string; a.textContent = "x";
    if (o) a.setAttribute("data-outside", "");
    document.body.append(a); a.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, shiftKey: s as boolean })); a.remove();
  }, [href, shift, outside] as const);
  await click(`http://127.0.0.1:${port}/open?shift`, true);
  await click(`http://127.0.0.1:${port}/open?join`, false, true);
  await expect.poll(() => [...asked].sort()).toEqual([`http://127.0.0.1:${port}/open?join`, `http://127.0.0.1:${port}/open?shift`]); // each opens after its own import: any order
  await expect(page.getByTestId("sidebar").locator(".tab").filter({ hasText: `127.0.0.1:${port}` })).toHaveCount(0);
});

test("the core opens only web and mail addresses outside", async ({ request }) => {
  const r = await request.post("/api/open-outside", { headers: H, data: { url: "file:///etc/hosts" } });
  expect(r.status()).toBe(400);
  expect((await request.post("/api/open-outside", { headers: H, data: { url: "https://example.org/" } })).status()).toBe(204); // ATLAS_NO_BROWSER: nothing opens
});

test("Atlas in a plain browser (a vault on a server) opens a web link in a new tab of that browser", async ({ page }) => {
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  const popup = page.waitForEvent("popup", { timeout: 10_000 });
  await page.evaluate((p) => { const a = document.createElement("a"); a.href = `http://127.0.0.1:${p}/open`; a.textContent = "x"; document.body.append(a); a.click(); a.remove(); }, port);
  expect((await popup).url()).toContain("/open");
  await expect(page.getByTestId("sidebar").locator(".tab").filter({ hasText: `127.0.0.1:${port}` })).toHaveCount(0);
});
