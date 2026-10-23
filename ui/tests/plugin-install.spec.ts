import { test, expect, type APIRequestContext } from "@playwright/test";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Plugins v4, distribution (docs/guides/PLUGINS.md "v4"): a plugin is copied into the vault from a folder
// (or a git address, or an archive), arrives switched off with what it may do said out loud, is
// updated keeping the vault's settings, and is removed to the trash.
const H = { "x-atlas": "1" };
const read = async (r: APIRequestContext, path: string) => ((await (await r.get(`/api/file?path=${encodeURIComponent(path)}`, { headers: H })).json()) as { text?: string }).text ?? "";
let src = "";
const manifest = (v: string) => `title = "Carried"\nversion = "${v}"\n\n[settings]\ncolor = "red"\n\n[[setting]]\nkey = "color"\nkind = "text"\n\n[permissions]\nnet = ["carried.example.org"]\n`;

test.beforeAll(() => {
  src = join(mkdtempSync(join(tmpdir(), "atlas-plugin-src-")), "carried");
  mkdirSync(src);
  writeFileSync(join(src, "plugin.toml"), manifest("1.0.0"));
  writeFileSync(join(src, "main.js"), 'export function register(atlas) { atlas.shell.statusItem({ id: "v", text: "carried " + atlas.plugin.version + " " + atlas.plugin.settings.color }); }\n');
});
test.afterAll(async ({ request }) => { await request.post("/api/plugins/carried/remove", { headers: H }); });

test("install from a folder (off, permissions said), switch on, update keeping settings, remove to the trash", async ({ page, request }) => {
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await page.keyboard.press("F1");
  await page.keyboard.type("Settings");
  await page.getByTestId("palette").getByText("Settings", { exact: true }).first().click();
  await page.getByRole("button", { name: /Plugins & automation/ }).first().click();

  await page.getByRole("button", { name: "Install…" }).click();
  await page.keyboard.type(src);
  await page.keyboard.press("Enter");
  await expect(page.getByText("Installed Carried")).toBeVisible();
  await expect(page.getByText(/It is switched off\. It may talk to carried\.example\.org/)).toBeVisible();
  const sw = page.getByRole("switch", { name: "Plugin Carried" });
  await expect(sw).toHaveAttribute("aria-checked", "false");
  await expect(page.locator('[data-plugin-may="carried"]')).toHaveText("May talk to carried.example.org.");
  const cell = page.locator('.status [data-cell="carried:v"]');
  await expect(cell, "switched off: nothing of it runs").toHaveCount(0);

  await sw.click();
  await expect(cell).toHaveText("carried 1.0.0 red");

  // the vault changes a setting; the author ships 1.1.0; update keeps the setting
  const toml = await read(request, ".atlas/plugins/carried/plugin.toml");
  await request.put("/api/file", { headers: H, data: { path: ".atlas/plugins/carried/plugin.toml", text: toml.replace('color = "red"', 'color = "teal"') } });
  await expect(cell).toHaveText("carried 1.0.0 teal");
  writeFileSync(join(src, "plugin.toml"), manifest("1.1.0"));
  await page.getByRole("button", { name: "Update Carried" }).click();
  await expect(page.getByText("Updated Carried to v1.1.0")).toBeVisible();
  await expect(cell).toHaveText("carried 1.1.0 teal");
  await expect(sw, "still switched on").toHaveAttribute("aria-checked", "true");

  await page.getByRole("button", { name: "Remove Carried" }).click();
  await page.getByTestId("palette").getByText("Remove Carried", { exact: true }).click();
  await expect(page.getByText("Removed Carried")).toBeVisible();
  await expect(cell).toHaveCount(0);
  expect(await read(request, ".atlas/plugins/carried/plugin.toml")).toBe("");
});
