import { test, expect, type Page } from "@playwright/test";

// "sometimes its hard to put the terminal on focus": every way of going to a terminal must leave
// the keys in it — a click on its text, its tab in the left bar, its key, the panel
// shown again, another terminal's tab, and back from the editor.
const typed = (page: Page) => page.locator(".term-pane .xterm-helper-textarea:focus");

async function openNote(page: Page) {
  await page.keyboard.press("Control+p");
  await expect(page.getByTestId("palette").getByRole("textbox")).toBeFocused();
  await page.keyboard.type("hubbard.md");
  await expect(page.getByTestId("palette").getByText("hubbard", { exact: true }).first()).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page.locator(".cm-content").first()).toContainText("Hubbard");
}

test("the terminal takes the keys however it is reached", async ({ page }) => {
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await openNote(page);
  await page.keyboard.press("Control+`");
  const pane = page.locator(".term-pane").first();
  await expect(pane.locator(".xterm-screen")).toBeVisible();
  await expect(typed(page)).toHaveCount(1);
  const toEditor = async () => {
    await page.locator(".cm-content:visible").first().click();
    await expect(page.locator(".cm-content:focus")).toHaveCount(1);
  };

  // a click on the terminal's text
  await toEditor();
  await pane.locator(".xterm-screen").click({ position: { x: 60, y: 30 } });
  await expect(typed(page), "a click on the text").toHaveCount(1);

  // its tab in the left bar
  await toEditor();
  await page.getByTestId("sidebar").locator(".tab", { hasText: /Shell/ }).first().click();
  await expect(typed(page), "its tab in the left bar").toHaveCount(1);

  // its key from the editor
  await toEditor();
  await page.keyboard.press("Control+`");
  await expect(typed(page), "Ctrl+` from the editor").toHaveCount(1);

  // the panel hidden and shown again
  await page.keyboard.press("Meta+j");
  await expect(typed(page)).toHaveCount(0);
  await page.keyboard.press("Meta+j");
  await expect(typed(page), "the panel shown again").toHaveCount(1);

  // a second terminal, then back to the first by its tab
  await page.getByTestId("sidebar").getByRole("button", { name: "New terminal" }).click();
  await page.getByRole("menuitem", { name: "Shell" }).click();
  await expect(page.getByTestId("sidebar").locator(".tab", { hasText: /Shell/ })).toHaveCount(2);
  await expect(typed(page), "the new terminal").toHaveCount(1);
  await page.getByTestId("sidebar").locator(".tab", { hasText: /Shell/ }).first().click();
  await expect(typed(page), "back to the first terminal").toHaveCount(1);

  // what is typed reaches the shell
  await page.keyboard.type("echo focus-$((40+2))");
  await page.keyboard.press("Enter");
  await expect(page.locator(".term-pane:visible").first()).toContainText("focus-42");
});
