import { test, expect, chromium } from "@playwright/test";
import { createServer, type Server } from "node:http";
import { cpSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// The Windows app's WebView2 extension (crates/atlas-app/webview2/frame-any) checked in Chromium, the same engine: a page
// on the core's address frames a site that forbids framing (X-Frame-Options DENY, CSP frame-ancestors 'none'). Without
// the extension the frame stays empty; with it the site shows. A site framed by any other page keeps its headers.
// Needs a full Chromium (Playwright's headless shell loads no extensions): ATLAS_PW_CHROME=/usr/bin/chromium-browser.
const EXT = join(process.cwd(), "../crates/atlas-app/webview2/frame-any"); // Playwright runs in ui/
const chrome = process.env.ATLAS_PW_CHROME;
let closed: Server, parent: Server, cport = 0, pport = 0;
test.beforeAll(async () => {
  closed = createServer((_q, r) => {
    r.setHeader("x-frame-options", "DENY");
    r.setHeader("content-security-policy", "frame-ancestors 'none'");
    r.setHeader("content-type", "text/html");
    r.end("<h1>closed site</h1>");
  });
  await new Promise<void>((ok) => closed.listen(0, "127.0.0.1", ok));
  cport = (closed.address() as { port: number }).port;
  parent = createServer((_q, r) => { r.setHeader("content-type", "text/html"); r.end(`<iframe src="http://localhost:${cport}/"></iframe>`); });
  await new Promise<void>((ok) => parent.listen(0, "0.0.0.0", ok));
  pport = (parent.address() as { port: number }).port;
});
test.afterAll(() => { closed.close(); parent.close(); });

async function framedText(withExtension: boolean, host: string): Promise<string> {
  const dir = mkdtempSync(join(tmpdir(), "atlas-wv2-"));
  // a copy: Chromium writes its `_metadata/` into an unpacked extension's folder, never into the repository
  const ext = join(dir, "frame-any");
  cpSync(EXT, ext, { recursive: true });
  const profile = join(dir, "profile");
  const args = withExtension ? [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`] : [];
  const ctx = await chromium.launchPersistentContext(profile, { headless: true, executablePath: chrome, args });
  try {
    const page = await ctx.newPage();
    await page.goto(`http://${host}:${pport}/`);
    await page.waitForTimeout(2000);
    const frame = page.frames().find((f) => f.parentFrame());
    return (await frame?.evaluate(() => document.body?.innerText ?? "").catch(() => "")) ?? "";
  } finally { await ctx.close(); rmSync(dir, { recursive: true, force: true }); }
}

test("the WebView2 extension lets Atlas's own page frame a site that forbids it, and no other page", async () => {
  test.skip(!chrome, "needs a full Chromium: set ATLAS_PW_CHROME (the headless shell loads no extensions)");
  test.setTimeout(60_000);
  expect(await framedText(false, "127.0.0.1")).not.toContain("closed site");
  expect(await framedText(true, "127.0.0.1")).toContain("closed site");
  // another page's frames keep the site's headers (initiatorDomains: the core's own address only)
  const lan = Object.values((await import("node:os")).networkInterfaces()).flat().find((a) => a?.family === "IPv4" && !a.internal)?.address;
  if (lan) expect(await framedText(true, lan)).not.toContain("closed site");
});
