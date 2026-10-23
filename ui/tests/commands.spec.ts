import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { WS } from "../playwright.config";

test("Commands pane: create a command, run it, give it a shortcut, rebind a built-in", async ({ page }) => {
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await page.keyboard.press("Meta+Shift+K");
  const pane = page.locator(".commands");
  await expect(pane.getByRole("heading", { name: /Commands/ })).toBeVisible();

  // a new command is a file in .atlas/commands/, listed as not yet committed
  await pane.getByRole("button", { name: "New command", exact: true }).click();
  await pane.getByLabel("Title").fill("Say hello");
  await pane.getByLabel("Command line").fill("echo hello from atlas");
  await pane.getByRole("button", { name: "Create", exact: true }).click();
  const row = pane.locator(".cmd", { hasText: "Say hello" });
  await expect(row.locator(".origin")).toHaveText("not committed yet");
  expect(readFileSync(join(WS, ".atlas/commands/say.hello.toml"), "utf8")).toContain('run = "echo hello from atlas"');

  await row.getByRole("button", { name: "Run" }).click();
  await expect(row.locator(".out")).toHaveText("hello from atlas");

  // record a shortcut, then use it from anywhere
  await row.locator(".keys").click();
  await page.keyboard.press("Control+Alt+H");
  await expect(row.locator(".keys kbd")).toHaveText(["Ctrl", "Alt", "H"]);
  expect(readFileSync(join(WS, ".atlas/keys.toml"), "utf8")).toContain('"say.hello" = "Ctrl+Alt+H"');
  await page.keyboard.press("Control+Alt+H");
  await expect(page.locator(".toast", { hasText: "hello from atlas" })).toBeVisible();

  // rebind a built-in UI action and reset it
  await pane.getByPlaceholder(/Filter commands/).fill("git: changes");
  const git = pane.locator(".cmd", { hasText: "Git: changes and history" });
  await git.locator(".keys").click();
  await page.keyboard.press("Control+Alt+Y");
  await expect(git.locator(".keys kbd")).toHaveText(["Ctrl", "Alt", "Y"]); // saved before it is used
  await page.keyboard.press("Control+Alt+Y");
  await expect(page.locator(".side-pane.git")).toBeVisible();
  await page.keyboard.press("Meta+Shift+K");
  await git.getByTitle(/Back to the default/).click();
  await expect(git.locator(".keys kbd")).toHaveText(["Super", "G"]);
  await pane.getByPlaceholder(/Filter commands/).fill("say hello");
  await row.locator(".keys").click();
  await page.keyboard.press("Backspace");
  await expect(row.locator(".keys .add")).toBeVisible();
});

test("a new command can get a schedule; a nonsense schedule is refused with the accepted forms", async ({ page }) => {
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await page.keyboard.press("Meta+Shift+K");
  const pane = page.locator(".commands");
  await pane.getByRole("button", { name: "New command", exact: true }).click();
  await pane.getByLabel("Title").fill("Nightly tidy");
  await pane.getByLabel("Command line").fill("echo tidy");
  await pane.getByLabel("Schedule").fill("nightly");
  await pane.getByRole("button", { name: "Create", exact: true }).click();
  await expect(page.locator(".toast", { hasText: "daily HH:MM" })).toBeVisible();
  await pane.getByLabel("Schedule").fill("daily 03:00");
  await pane.getByRole("button", { name: "Create", exact: true }).click();
  const row = pane.locator(".cmd", { hasText: "Nightly tidy" });
  await expect(row.locator(".sched")).toContainText("daily 03:00");
});
