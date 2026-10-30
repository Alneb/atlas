import { test, expect } from "@playwright/test";

// The phone's floating capture button sits over the bottom of the pane: every pane leaves room for it (--fab-room), so
// the last of anything scrolled can come out from under it.
test.use({ viewport: { width: 400, height: 760 }, hasTouch: true });

test("the end of a long Home scrolls clear of the floating button", async ({ page, request }) => {
  const d = new Date(), day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const lines = Array.from({ length: 40 }, (_, i) => `- 09:${String(i).padStart(2, "0")} capture number ${i + 1}`);
  await request.put("/api/file", { headers: { "x-atlas": "1" }, data: { path: `log/${day}.md`, text: `# ${day}\n\n${lines.join("\n")}\n` } });
  await page.goto("/");
  const fab = page.locator(".fab");
  await expect(fab).toBeVisible();
  const line = page.getByText("capture number 40");
  await expect(line).toBeAttached();
  // Home's own scroller, scrolled to its end: the bottom of what it shows last is above the button
  const end = () => line.evaluate((el) => {
    for (let e: HTMLElement | null = el.parentElement; e; e = e.parentElement) {
      if (e.scrollHeight > e.clientHeight && /auto|scroll/.test(getComputedStyle(e).overflowY)) {
        e.scrollTop = e.scrollHeight;
        return Math.max(...[...e.querySelectorAll<HTMLElement>("*")].map((c) => c.getBoundingClientRect().bottom).filter((b) => b <= e.getBoundingClientRect().bottom + 1));
      }
    }
    return Infinity;
  });
  const top = (await fab.boundingBox())!.y;
  await expect.poll(end).toBeLessThanOrEqual(top);
});
