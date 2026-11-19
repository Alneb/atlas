import { test, expect } from "@playwright/test";

// A terminal docked on the right sits in the same row as the editors: a new split among them (a file or an
// explorer opened beside) must take its room from the editors, not narrow the terminal (its TUI reflowed).
const H = { "x-atlas": "1" };

test("a split among the editors leaves a right-docked terminal's width alone", async ({ page, request }) => {
  const cfg = async () => (await (await request.get("/api/config", { headers: H })).json()).config;
  const c = await cfg();
  const was = c.terminal.position;
  c.terminal.position = "right";
  await request.put("/api/config", { headers: H, data: c });
  try {
    await request.put("/api/file", { headers: H, data: { path: "tsw/a.md", text: "# A\n" } });
    await page.goto("/");
    await page.getByText("Finish the GW notes.").waitFor();
    await page.evaluate(() => (window as any).__atlas.open("tsw/a.md"));
    await page.keyboard.press("Control+`");
    const term = page.locator(".term-pane").first();
    await expect(term.locator(".xterm")).toBeVisible();
    await page.locator(".editor-pane .crumbs button", { hasText: "tsw" }).click();
    const pane = page.locator(".explorer").first();
    await expect(pane.locator(".crumbs")).toContainText("tsw");
    const before = (await term.boundingBox())!.width;
    const splitBtn = pane.getByRole("button", { name: "Split" });
    if (await splitBtn.isVisible()) await splitBtn.click();
    else {
      await pane.getByRole("button", { name: "More" }).click();
      await page.getByRole("menuitem", { name: "Split: another explorer beside" }).click();
    }
    await expect(page.locator(".explorer")).toHaveCount(2);
    await expect.poll(async () => Math.abs((await term.boundingBox())!.width - before)).toBeLessThan(3);
  } finally {
    const back = await cfg();
    back.terminal.position = was;
    await request.put("/api/config", { headers: H, data: back });
  }
});
