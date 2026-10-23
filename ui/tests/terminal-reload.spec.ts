import { test, expect, type Page } from "@playwright/test";

// "it reset": every installed interface reloads the window, and a reload killed every shell and
// Claude session in the terminals (the pty died with its socket). Now the reloaded tab takes over
// its terminal, still running, with the output it missed; closing the tab is what ends it.
const pane = (page: Page) => page.locator(".term-pane:visible").first();
const pidOf = async (page: Page, tag: string) => {
  await page.keyboard.type(`echo ${tag}=$$=`);
  await page.keyboard.press("Enter");
  await expect(pane(page)).toContainText(new RegExp(`${tag}=\\d+=`));
  return [...(await pane(page).innerText()).matchAll(new RegExp(`${tag}=(\\d+)=`, "g"))].pop()?.[1];
};

test("a terminal outlives a reload of the page, and ends when its tab is closed", async ({ page }) => {
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await page.keyboard.press("Control+`");
  await expect(pane(page).locator(".xterm-helper-textarea")).toBeFocused();
  const pid = await pidOf(page, "before");
  expect(pid).toMatch(/^\d+$/);
  // still running while the page goes away, and printing after it went
  await page.keyboard.type("sleep 2; echo alive-$((6*7))");
  await page.keyboard.press("Enter");

  await page.reload();
  await page.getByText("Finish the GW notes.").waitFor();
  await page.keyboard.press("Control+`"); // the same tab again (the test vault keeps no layout)
  await expect(pane(page)).toContainText("alive-42", { timeout: 10_000 });
  await pane(page).click();
  expect(await pidOf(page, "after"), "the same shell").toBe(pid);

  // closing the tab ends it: the next terminal is a new shell
  await page.keyboard.press("Meta+q");
  await expect(page.locator(".term-pane:visible")).toHaveCount(0);
  await page.keyboard.press("Control+`");
  await expect(pane(page).locator(".xterm-helper-textarea")).toBeFocused();
  const fresh = await pidOf(page, "fresh");
  expect(fresh).not.toBe(pid);
});
