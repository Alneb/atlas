import { test, expect } from "@playwright/test";

// Git blame beside a file's lines (lib/editor/blame.ts): the test vault's hubbard note is one commit of "Tester" plus a
// line not committed yet. Each commit's run is labelled on its first line; a click opens the commit; the command again
// takes it away.
test("blame shows who changed each line, opens the commit, and goes away again", async ({ page }, info) => {
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await page.keyboard.press("Control+p");
  await page.keyboard.type("hubbard.md");
  await expect(page.getByTestId("palette").getByText("hubbard", { exact: true }).first()).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page.locator(".cm-content").filter({ hasText: "An uncommitted line." })).toBeVisible();
  const command = async () => {
    await page.keyboard.press("F1");
    await expect(page.getByTestId("palette").getByRole("textbox")).toBeFocused(); // else the keys reach the note
    await page.keyboard.type("who changed each line");
    await page.getByTestId("palette").getByText("Git: who changed each line (blame)").first().click();
  };
  await command();
  const gutter = page.locator(".cm-blame-gutter");
  await expect(gutter.locator(".cm-blame:not(.cm-blame-new)").first()).toHaveText(/^Tester · \d{4}-\d{2}-\d{2}$/);
  await expect(gutter.locator(".cm-blame-new")).toHaveText(["not committed"]);
  for (const theme of ["light", "dark"]) {
    await page.evaluate((t) => document.documentElement.setAttribute("data-theme", t), theme);
    await page.locator(".cm-editor").filter({ visible: true }).first().screenshot({ path: info.outputPath(`blame-${theme}.png`) });
  }
  await expect(gutter.locator(".cm-blame:not(.cm-blame-new)").first()).toHaveAttribute("title", /My own hubbard note/);
  await gutter.locator(".cm-blame:not(.cm-blame-new)").first().click();
  await expect(page.getByTestId("sidebar").locator(".tab", { hasText: "My own hubbard note" })).toHaveCount(1);
  await page.getByTestId("sidebar").locator(".tab", { hasText: "hubbard" }).first().click();
  const content = page.locator(".cm-content").filter({ hasText: "An uncommitted line." });
  await content.click();
  await expect(content).toBeFocused();
  await page.keyboard.press("Escape"); // vim: normal mode, nothing typed
  await command();
  await expect(page.locator(".cm-blame-gutter")).toHaveCount(0);
});
