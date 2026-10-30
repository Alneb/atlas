import { test, expect } from "@playwright/test";

// The middle button on a link opens it
// beside (a browser's new tab) and pastes nothing into the note; on a tab it closes it without bringing it forward.
const H = { "x-atlas": "1" };

test("middle click: a link opens beside and the note is unchanged; a tab closes", async ({ page, request }) => {
  await request.put("/api/file", { headers: H, data: { path: "mid/target.md", text: "# Target\n" } });
  const text = "# Middle\n\nGo to [[target]] now.\n";
  await request.put("/api/file", { headers: H, data: { path: "mid/source.md", text } });
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await page.evaluate(() => (window as unknown as { __atlas: { open(p: string): void } }).__atlas.open("mid/source.md"));
  const link = page.locator(".cm-editor .cm-hmd-internal-link", { hasText: "target" }).first();
  await expect(link).toBeVisible();
  // a word selected by hand is X11's primary selection: a middle click must not paste it, on a link or outside text
  await page.locator(".cm-editor:visible .cm-line", { hasText: "now." }).getByText("now.").dblclick().catch(() => {});
  await link.click({ button: "middle" });
  // opened, as another tab beside this one
  await expect(page.locator(".cm-editor:visible", { hasText: "Target" }).first()).toBeVisible();
  const panes = await page.evaluate(() => (window as unknown as { __atlas: { panes(): { id: string }[] } }).__atlas.panes().map((p) => p.id));
  expect(panes.some((id) => id.includes("source.md"))).toBe(true);
  // nothing pasted, nothing typed: the file is as it was
  await page.waitForTimeout(1200); // past an autosave
  const after = await request.get("/api/file?path=mid/source.md", { headers: H }).then((r) => r.json()) as { text: string };
  expect(after.text).toBe(text);

  // again, before closing its tab with the middle button
  await page.evaluate(() => (window as unknown as { __atlas: { open(p: string): void } }).__atlas.open("mid/source.md"));
  await page.locator(".cm-editor:visible .cm-line", { hasText: "now." }).getByText("now.").dblclick().catch(() => {});
  // a middle click on its tab (the sidebar's list) closes it
  const tab = page.getByTestId("sidebar").locator(".tab", { hasText: "source" }).first();
  await tab.click({ button: "middle" });
  await expect.poll(() => page.evaluate(() => (window as unknown as { __atlas: { panes(): { id: string }[] } }).__atlas.panes().some((p) => p.id.includes("source.md")))).toBe(false);
  await page.waitForTimeout(1200);
  const end = await request.get("/api/file?path=mid/source.md", { headers: H }).then((r) => r.json()) as { text: string };
  expect(end.text, "the selection was not pasted on closing").toBe(text);
});

// The guard drops a paste only right after a stray middle click; with none yet, a paste in the page's first half
// second went too (a capture's pasted picture lost on a fast machine). The page's clock is held at its start.
test("a paste in the page's first moments is not taken for a middle click's", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-10-01T09:00:00") });
  await page.clock.pauseAt(new Date("2026-10-01T09:00:00"));
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  const got = await page.evaluate(() => {
    const t = document.body.appendChild(document.createElement("textarea"));
    let seen = false;
    t.addEventListener("paste", () => (seen = true));
    const dt = new DataTransfer();
    dt.setData("text/plain", "hello");
    t.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
    t.remove();
    return { seen, now: performance.now() };
  });
  expect(got.now, "the clock is held near the page's start").toBeLessThan(500);
  expect(got.seen).toBe(true);
});
