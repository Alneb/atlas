import { test, expect, type Page } from "@playwright/test";
import { shownName } from "../src/lib/paths";

// "make ctrl + tab like a glance view, and only for the focused tab": Ctrl+Tab shows the focused
// split's tabs, most recent first; letting go of Ctrl switches, Esc keeps the tab you were on.
const H = { "x-atlas": "1" };
const title = (page: Page) => page.evaluate(() => (window as any).__atlas.editor()?.path as string | undefined);

async function openNote(page: Page, name: string) {
  await page.keyboard.press("Control+p");
  await expect(page.getByTestId("palette").getByRole("textbox")).toBeFocused();
  await page.keyboard.type(name);
  await expect(page.getByTestId("palette").getByText(shownName(name), { exact: true }).first()).toBeVisible();
  await page.keyboard.press("Enter");
  await expect.poll(() => title(page)).toContain(name);
}

test("Ctrl+Tab glances over this split's tabs, most recent first", async ({ page, request }) => {
  for (const n of ["one", "two", "three"]) await request.put("/api/file", { headers: H, data: { path: `notes/g-${n}.md`, text: `# ${n}\n` } });
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  for (const n of ["one", "two", "three"]) await openNote(page, `g-${n}.md`);
  // a terminal in the other split is not among them
  await page.keyboard.press("Control+`");
  await page.locator(".cm-content:visible").first().click();

  const glance = page.getByTestId("tab-glance");
  // a quick Ctrl+Tab: straight to the previous tab
  await page.keyboard.press("Control+Tab");
  await expect.poll(() => title(page)).toContain("g-two.md");
  await expect(glance).toHaveCount(0);

  // held: the cards, most recent first (two, three, one…), Tab steps on, letting go switches
  await page.keyboard.down("Control");
  await page.keyboard.press("Tab");
  await expect(glance).toBeVisible();
  const cards = glance.locator(".glance-card");
  await expect(cards.nth(0)).toContainText("g-two");
  await expect(cards.nth(1)).toContainText("g-three");
  await expect(cards.nth(2)).toContainText("g-one");
  await expect(glance).not.toContainText("Shell");
  await expect(cards.nth(1)).toHaveClass(/chosen/);
  // the pane behind already shows the chosen tab, Ctrl still held
  await expect.poll(() => title(page)).toContain("g-three.md");
  await page.keyboard.press("Tab");
  await expect(cards.nth(2)).toHaveClass(/chosen/);
  await page.keyboard.up("Control");
  await expect(glance).toHaveCount(0);
  await expect.poll(() => title(page)).toContain("g-one.md");

  // Esc keeps the tab you were on
  await page.keyboard.down("Control");
  await page.keyboard.press("Tab");
  await expect(glance).toBeVisible();
  await page.keyboard.press("Escape");
  await page.keyboard.up("Control");
  await expect(glance).toHaveCount(0);
  await expect.poll(() => title(page)).toContain("g-one.md");
});
