import { test, expect, type Page } from "@playwright/test";

// A page that missed file events (its socket was down, or it fell behind the core's bus) looks at everything again
// once it is back: an `fs` event naming nothing (bus.ts `touches`).
const H = { "x-atlas": "1" };
const text = (page: Page) => page.evaluate(() => (window as unknown as { __atlas: { editor(): { text: string } | null } }).__atlas.editor()?.text);

test("an open note shows a change made while the events socket was down", async ({ page }) => {
  let pass = true;
  let current: { close(): Promise<void> } | undefined;
  await page.routeWebSocket("**/api/events", (ws) => {
    const server = ws.connectToServer();
    server.onMessage((m) => { if (pass) ws.send(m); });
    current = ws;
  });
  const path = "notes/resync.md";
  await page.request.put("/api/file", { headers: H, data: { path, text: "# Resync\n\nBefore.\n" } });
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await page.request.post("/api/cmd/open", { headers: H, data: { args: { path } } });
  await expect.poll(() => text(page)).toContain("Before.");

  pass = false; // the change below is never told to the page
  await page.request.put("/api/file", { headers: H, data: { path, text: "# Resync\n\nAfter.\n" } });
  await page.waitForTimeout(1000); // the watcher's batch has gone by, unseen
  expect(await text(page)).toContain("Before.");

  pass = true;
  await current!.close(); // the page reconnects and looks again
  await expect.poll(() => text(page), { timeout: 10_000 }).toContain("After.");
});
