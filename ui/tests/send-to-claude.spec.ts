import { test, expect } from "@playwright/test";
import { openFile } from "./open";

// the fixture's "Claude" is `cat` (playwright.config.ts): whatever is typed into it echoes back
test("Ctrl+Alt+Enter types @file#lines for the selection into the Claude terminal", async ({ page }) => {
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await openFile(page, "hubbard.md");
  await expect(page.locator(".cm-content")).toContainText("Energy");
  await page.locator(".cm-line", { hasText: "Energy" }).click();
  await page.keyboard.press("Escape");
  await page.keyboard.type("Vj"); // vim: select this line and the next
  await page.waitForTimeout(400); // the selection is reported debounced
  await page.keyboard.press("Control+Alt+Enter");
  await expect(page.locator(".xterm-rows")).toContainText("@notes/hubbard.md#L3-4", { timeout: 10_000 });
});

test("sending to Claude brings back a hidden terminal panel", async ({ page }) => {
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await page.keyboard.press("Meta+k"); // open Claude (cat)
  await expect(page.locator(".xterm").first()).toBeVisible();
  await page.keyboard.press("Meta+j"); // hide the panel
  await expect(page.locator(".xterm").first()).toBeHidden();
  await openFile(page, "hubbard.md");
  await expect(page.locator(".cm-content")).toContainText("Energy");
  await page.locator(".cm-content").click();
  await page.keyboard.press("Control+Alt+Enter"); // no selection: the whole file
  await expect(page.locator(".xterm").first()).toBeVisible();
  await expect(page.locator(".xterm-rows").first()).toContainText("@notes/hubbard.md");
});

// a plugin's AI agent (`[[agent]]`, lib/agents.ts): the selection is typed in its own words (`send_selection`). The
// plugin's id sorts before the test vault's own Claude plugin, so with no agent tab open it is the one started.
test.describe("a plugin's agent", () => {
  const H = { "x-atlas": "1" };
  const AGENT = `title = "Parrot"\n\n[[agent]]\nid = "parrot"\ntitle = "Parrot"\ncommand = "cat"\nsend_selection = "ASK {path} {from}..{to};"\n`;
  test.beforeAll(async ({ request }) => { await request.put("/api/file", { headers: H, data: { path: ".atlas/plugins/aparrot/plugin.toml", text: AGENT } }); });
  test.afterAll(async ({ request }) => { await request.post("/api/plugins/aparrot/remove", { headers: H }); });

  test("Ctrl+Alt+Enter opens the agent and types the selection in its pattern", async ({ page }) => {
    await page.goto("/");
    await page.getByText("Finish the GW notes.").waitFor();
    await openFile(page, "hubbard.md");
    await expect(page.locator(".cm-content")).toContainText("Energy");
    await page.locator(".cm-line", { hasText: "Energy" }).click();
    await page.keyboard.press("Escape");
    await page.keyboard.type("Vj");
    await page.waitForTimeout(400);
    await page.keyboard.press("Control+Alt+Enter");
    await expect(page.locator(".xterm-rows")).toContainText("ASK notes/hubbard.md 3..4;", { timeout: 10_000 });
    // no selection: the lines are left out of the pattern
    await page.locator(".cm-content").click();
    await page.keyboard.press("Escape");
    await page.waitForTimeout(400);
    await page.keyboard.press("Control+Alt+Enter");
    await expect(page.locator(".xterm-rows")).toContainText("ASK notes/hubbard.md;");
  });
});
