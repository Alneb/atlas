import { test, expect, type APIRequestContext } from "@playwright/test";
import { storedSecret } from "./fixtures/secrets";

// Plugins v4, settings from a schema (docs/refactor/REFACTOR-plugins-v4.md, 3.7): `[[setting]]` in plugin.toml
// gives the plugin a form in Settings — "no more TOML by hand" — and the values are written back into
// the same file, comments kept.
const H = { "x-atlas": "1" };
const put = (r: APIRequestContext, path: string, text: string) => r.put("/api/file", { headers: H, data: { path, text } });
const read = async (r: APIRequestContext, path: string) => ((await (await r.get(`/api/file?path=${encodeURIComponent(path)}`, { headers: H })).json()) as { text: string }).text;
const TOML = `# a plugin with a form
title = "Dice"
version = "0.2.0"

[settings]
sides = 20 # the classic

[[setting]]
key = "sides"
label = "Sides"
kind = "number"
hint = "of the die rolled by default"
default = 6

[[setting]]
key = "system"
label = "Rules"
kind = "choice"
choices = ["dnd5e", "pf2e"]
default = "dnd5e"

[[setting]]
key = "loud"
label = "Announce every roll"
kind = "toggle"

[[setting]]
key = "greeting"
label = "Greeting"
kind = "longtext"

[[setting]]
key = "token"
label = "Server token"
kind = "secret"

[permissions]
secrets = true
`;
const MAIN = `export function register(atlas) {
  const s = atlas.plugin.settings;
  atlas.shell.statusItem({ id: "now", text: "d" + s.sides + " " + s.system + (s.loud ? " loud" : "") });
}\n`;

test.beforeAll(async ({ request }) => {
  await put(request, ".atlas/plugins/dice/plugin.toml", TOML);
  await put(request, ".atlas/plugins/dice/main.js", MAIN);
});
test.afterAll(async ({ request }) => { await put(request, ".atlas/plugins/dice/main.js", "export function register() {}\n"); });

test("a plugin's declared settings are a form; saving writes plugin.toml and the plugin sees the values", async ({ page, request }) => {
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  const cell = page.locator('.status [data-cell="dice:now"]');
  await expect(cell, "the file's value, and a default for what it does not say").toHaveText("d20 dnd5e");

  await page.keyboard.press("F1");
  await page.keyboard.type("Settings");
  await page.getByTestId("palette").getByText("Settings", { exact: true }).first().click();
  await page.getByRole("button", { name: /^Plugins( \d+)?$/ }).first().click();
  await expect(page.locator("li", { hasText: "Dice" }).getByText("v0.2.0")).toBeVisible();
  await page.getByRole("button", { name: "Settings of Dice" }).click();
  const form = page.getByRole("form", { name: /Dice — settings/ });
  await expect(form.getByText("of the die rolled by default")).toBeVisible();
  const sides = form.getByLabel("Sides");
  await expect(sides).toHaveValue("20");
  await sides.fill("12");
  await form.getByLabel("Announce every roll").check();
  // a longtext is a box: Enter is a new line, not "Save"
  const greeting = form.getByLabel("Greeting");
  await expect(greeting).toHaveJSProperty("tagName", "TEXTAREA");
  await greeting.fill("Hello");
  await greeting.press("Enter");
  await greeting.pressSequentially("friend");
  await expect(form).toBeVisible();
  await form.screenshot({ path: test.info().outputPath("settings-form.png") });
  await page.evaluate(() => document.documentElement.setAttribute("data-theme", document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark"));
  await form.screenshot({ path: test.info().outputPath("settings-form-other-theme.png") });
  await page.evaluate(() => document.documentElement.setAttribute("data-theme", document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark"));
  await expect(form.getByText("Not set yet.")).toBeVisible();
  await expect(form.getByLabel("Server token")).toHaveAttribute("type", "password");
  await form.getByLabel("Server token").fill("tok-xyz");
  await form.getByRole("button", { name: "Save" }).click();
  await expect(form.getByRole("status")).toHaveCount(0); // saved: a page now, the save bar goes

  await expect(cell, "the plugin was reloaded with the new values").toHaveText("d12 dnd5e loud");
  // its row in the list names what was changed, not the defaults (2026-10-20: every value printed made a paragraph per plugin)
  await page.getByRole("button", { name: /^Plugins( \d+)?$/ }).first().click();
  const row = page.locator("li", { hasText: "Dice" }).locator(".props");
  await expect(row).toContainText(/Announce every roll\s*on/);
  await expect(row).not.toContainText("dnd5e");
  // the values are in the vault's settings file (2026-10-18: not in plugin.toml), comments kept; the manifest keeps none
  const manifest = await read(request, ".atlas/plugins/dice/plugin.toml");
  expect(manifest).toContain("# a plugin with a form");
  expect(manifest).not.toContain("[settings]");
  const text = await read(request, ".atlas/plugin-settings/dice.toml");
  expect(text).toContain("sides = 12 # the classic");
  expect(text).toContain("loud = true");
  expect(text, "several lines stay lines in the file").toContain('greeting = """\nHello\nfriend"""');
  expect(text, "a default that was not changed is not written").not.toMatch(/^system = /m);
  // the secret is in the store outside the vault, not in the file; the form only says that it is set
  expect(text).not.toContain("tok-xyz");
  expect(storedSecret("dice", "token")).toBe("tok-xyz");

  // emptied: the key leaves the file and the default is back (its page, from the Settings bar)
  await page.locator("nav button.plugin", { hasText: "Dice" }).click();
  await expect(form.getByText(/Set\. Type to replace it/)).toBeVisible();
  await expect(form.getByLabel("Server token"), "never shown back").toHaveValue("");
  await form.getByLabel("Sides").fill("");
  await form.getByRole("button", { name: "Save" }).click();
  await expect(cell).toHaveText("d6 dnd5e loud");
  expect(storedSecret("dice", "token"), "left empty: kept").toBe("tok-xyz");
});
