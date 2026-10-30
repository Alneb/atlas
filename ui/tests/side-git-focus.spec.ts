import { test, expect } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { WS } from "../playwright.config";

const git = (...a: string[]) => execFileSync("git", ["-C", WS, ...a], { stdio: "ignore" });
const A = "notes/side-git-a.md", B = "notes/side-git-b.md";

// Staging from the keyboard: the pressed button goes away with its row, and the focus used to fall to
// the page. It now lands on the next change, then the commit message; unstaging brings it back to the file.
test("Git: the focus stays in the list after staging or unstaging with the keys", async ({ page }) => {
  writeFileSync(join(WS, A), "# a\n");
  writeFileSync(join(WS, B), "# b\n");
  try {
    await page.goto("/");
    await page.getByText("Finish the GW notes.").waitFor();
    await page.keyboard.press("Meta+g");
    const btn = (name: string) => page.locator(".side-pane.git").getByRole("button", { name, exact: true });
    await btn(`Stage ${A}`).focus();
    await page.keyboard.press("Enter");
    await expect(btn(`Unstage ${A}`)).toBeVisible();
    await expect(btn(`Stage ${B}`)).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(btn(`Unstage ${B}`)).toBeVisible();
    // other changes are still listed: the focus is on the one now at that place
    await expect(page.locator(".side-pane.git ul[data-group=changes] :focus")).toHaveAttribute("aria-label", /^Stage /);

    await btn(`Unstage ${A}`).focus();
    await page.keyboard.press("Enter");
    await expect(btn(`Unstage ${B}`)).toBeFocused();
    await page.keyboard.press("Enter");
    // the staged list emptied (unless another change is staged): back to the file, never to the page
    await expect(page.locator(".side-pane.git .entry :focus")).toHaveCount(1);
    if (!(await page.locator(".side-pane.git ul[data-group=staged]").count())) await expect(btn(`Stage ${B}`)).toBeFocused();
  } finally {
    git("reset", "-q", "--", A, B);
    rmSync(join(WS, A), { force: true });
    rmSync(join(WS, B), { force: true });
  }
});

// Discarding asks first; once confirmed the row is gone, and the focus went with the dialog to the page.
test("Git: after a discard (or its cancel) the focus is back in the list", async ({ page }) => {
  const C = "notes/side-git-c.md";
  writeFileSync(join(WS, C), "# c\n");
  try {
    await page.goto("/");
    await page.getByText("Finish the GW notes.").waitFor();
    await page.keyboard.press("Meta+g");
    const pane = page.locator(".side-pane.git");
    const discard = pane.getByRole("button", { name: `Discard changes to ${C}`, exact: true });
    await discard.focus();
    await page.keyboard.press("Enter");
    await page.getByRole("dialog").getByRole("button", { name: "Cancel" }).click();
    await expect(discard).toBeFocused();

    await page.keyboard.press("Enter");
    await page.getByRole("dialog").getByRole("button", { name: "Discard" }).click();
    await expect(discard).toHaveCount(0);
    await expect(pane.locator(":focus")).toHaveCount(1); // a neighbour's discard, or the commit message
  } finally {
    rmSync(join(WS, C), { force: true });
  }
});
