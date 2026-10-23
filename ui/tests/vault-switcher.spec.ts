import { test, expect } from "@playwright/test";
import { mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { WS } from "../playwright.config";

// The vault switcher: a dialog of its own — every vault with what it is, searched as typed, a folder linked to its copy on a
// server (one row for the pair), a vault taken off the list. Nothing is opened: an open would leave this page.
const LIST = `${WS}-vaults.toml`;
const OTHER = `${WS}-other/Other Notes`;
const SERVER = "https://notes.invalid/v/other/"; // .invalid: the probes fail at once, never on the network

test.beforeEach(() => {
  mkdirSync(OTHER, { recursive: true });
  writeFileSync(LIST, [
    `[[vault]]\nname = "Other Notes"\npath = ${JSON.stringify(OTHER)}\nlast_opened = 3\n`,
    `[[vault]]\nname = "notes.invalid · other"\npath = "${SERVER}"\nurl = "${SERVER}"\nlast_opened = 2\n`,
    `[[vault]]\nname = "Gone"\npath = ${JSON.stringify(`${WS}-nowhere`)}\nlast_opened = 1\n`,
  ].join("\n"));
});

test("the vault switcher lists every vault with what it is, links a folder to its mirror and takes one off the list", async ({ page }) => {
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await page.keyboard.press("Control+Alt+v");
  const dlg = page.getByTestId("vault-switcher");
  await expect(dlg.locator(".row")).toHaveCount(4);
  await expect(dlg.locator(".row").first()).toContainText("this window");
  await expect(dlg.locator('[data-vault="Gone"]')).toContainText("folder not found");
  await expect(dlg.locator('[data-vault="notes.invalid · other"]')).toContainText("server");

  // searched as typed; a typed folder is offered to open
  await dlg.getByRole("textbox", { name: "Search vaults" }).fill("other");
  await expect(dlg.locator(".row")).toHaveCount(2);
  await dlg.getByRole("textbox", { name: "Search vaults" }).fill("~/Elsewhere");
  await expect(dlg.getByText("Open the folder ~/Elsewhere")).toBeVisible();
  await dlg.getByRole("textbox", { name: "Search vaults" }).fill("");

  // the folder linked to the server vault: the pair is one row, the mirror a badge on it
  const other = dlg.locator('[data-vault="Other Notes"]');
  await other.hover();
  await other.getByRole("button", { name: "Link mirror…" }).click();
  await other.getByRole("textbox", { name: "Mirror address" }).fill(SERVER);
  await other.getByRole("button", { name: "Link", exact: true }).click();
  await expect(other).toContainText("⇄ notes.invalid");
  await expect(dlg.locator('[data-vault="notes.invalid · other"]')).toHaveCount(0);
  expect(readFileSync(LIST, "utf8")).toContain(`mirror = "${SERVER}"`);

  // taken off the list with a second click; its folder is not touched
  const gone = dlg.locator('[data-vault="Gone"]');
  await gone.hover();
  await gone.getByRole("button", { name: "Remove" }).click();
  await gone.getByRole("button", { name: "Remove?" }).click();
  await expect(dlg.locator('[data-vault="Gone"]')).toHaveCount(0);
  expect(readFileSync(LIST, "utf8")).not.toContain("nowhere");

  await page.keyboard.press("Escape");
  await expect(dlg).toHaveCount(0);
});

test("the vault whose page loads in a window with the focus is the one opened last: the capture box starts on it", async ({ page }) => {
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  // no focus event after a switch (the window had it already): the page says so as it loads
  await expect.poll(() => /\[\[vault\]\]\s*name = "[^"]*"\s*path = "([^"]*)"/.exec(readFileSync(LIST, "utf8"))?.[1]).toBe(realpathSync(WS));
});
