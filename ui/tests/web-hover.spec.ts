import { test, expect } from "@playwright/test";
import { createServer, type Server } from "node:http";
import { readFileSync } from "node:fs";

// A web tab shows the address of the link under the pointer in its corner, as a browser's status bar. The desktop app
// injects frame_page.js into every frame; here Playwright does the same.
const framePage = readFileSync(new URL("../../crates/atlas-app/src/frame_page.js", import.meta.url), "utf8");
let site: Server, port = 0;
test.beforeAll(async () => {
  site = createServer((_req, res) => {
    res.setHeader("content-type", "text/html");
    res.end(`<h1>A web page</h1><p><a href="/far/away?q=1">a link</a></p><p style="height:200px">plain text</p>`);
  });
  await new Promise<void>((ok) => site.listen(0, "127.0.0.1", ok));
  port = (site.address() as { port: number }).port;
});
test.afterAll(() => site.close());

test("hovering a link in a web tab shows its address, leaving it hides it", async ({ page }) => {
  await page.addInitScript(() => { const w = window as unknown as { __atlasDesktop: boolean; __atlasFramesAnything: boolean }; w.__atlasDesktop = true; w.__atlasFramesAnything = true; });
  await page.addInitScript(framePage);
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await page.evaluate((p) => (window as unknown as { __atlasOpenWeb: (u: string) => void }).__atlasOpenWeb(`http://127.0.0.1:${p}/`), port);
  const frame = page.frameLocator("iframe").first();
  await expect(frame.getByRole("heading", { name: "A web page" })).toBeVisible({ timeout: 10_000 });
  const bubble = page.getByTestId("web-hover");
  await expect(bubble).toHaveCount(0);
  await frame.getByRole("link", { name: "a link" }).hover();
  await expect(bubble).toHaveText(`http://127.0.0.1:${port}/far/away?q=1`);
  await page.evaluate(() => (document.documentElement.dataset.theme = "light"));
  await page.screenshot({ path: "../target/web-hover-light.png" });
  await page.evaluate(() => (document.documentElement.dataset.theme = "dark"));
  await page.screenshot({ path: "../target/web-hover-dark.png" });
  await frame.getByText("plain text").hover();
  await expect(bubble).toHaveCount(0);
});
