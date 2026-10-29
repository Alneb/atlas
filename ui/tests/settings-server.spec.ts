import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { WS } from "../playwright.config";

// Settings → Server (docs/guides/SERVER.md), on the desktop: it prepares what `atlas serve --listen` starts from. The test
// server writes ${WS}-server.toml / .json (ATLAS_SERVER_CONFIG / _STATE), never ~/.config. The page shows only in server mode; the test server is a local one, so
// /api/auth/me is answered as `atlas serve`'s would be — the panel's own calls are the real ones.
async function serverPage(page: Page) {
  await page.route("**/api/auth/me", (r) => r.fulfill({ json: { server: true, via: "password", signOut: true } }));
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await page.keyboard.press("Meta+,");
  await page.getByRole("navigation", { name: "Settings pages" }).getByRole("button", { name: "Server" }).click();
  return page.getByTestId("server-panel");
}

test("Settings → Server is not listed outside server mode", async ({ page }) => {
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await page.keyboard.press("Meta+,");
  const nav = page.getByRole("navigation", { name: "Settings pages" });
  await expect(nav.getByRole("button", { name: "Appearance" })).toBeVisible();
  await expect(nav.getByRole("button", { name: "Server" })).toHaveCount(0);
});

// Server settings appear only on a server, Advanced (the GPU render options) only on the desktop
// (settings-pages.ts `only`, hostOf)
test("Server shows only in a browser on the server's page; Advanced (the settings file) everywhere", async ({ page }) => {
  const nav = page.getByRole("navigation", { name: "Settings pages" });
  const open = async () => { await page.goto("/"); await page.getByText("Finish the GW notes.").waitFor(); await page.keyboard.press("Meta+,"); await expect(nav.getByRole("button", { name: "Appearance" })).toBeVisible(); };
  await open(); // this machine: Advanced, no Server
  await expect(nav.getByRole("button", { name: "Advanced" })).toBeVisible();
  await expect(nav.getByRole("button", { name: "Server" })).toHaveCount(0);
  await page.route("**/api/auth/me", (r) => r.fulfill({ json: { server: true, via: "proxy", user: "u", signOut: false } }));
  await open(); // a browser on the server: Server, and Advanced with the file (its GPU field is the desktop's only)
  await expect(nav.getByRole("button", { name: "Server" })).toBeVisible();
  await expect(nav.getByRole("button", { name: "Advanced" })).toBeVisible();
  await page.addInitScript(() => { (window as unknown as { AtlasNative: unknown }).AtlasNative = { ready() {}, tabs() {} }; });
  await page.goto("/");
  await page.waitForFunction(() => "atlasShell" in window);
  await page.evaluate(() => (window as unknown as { atlasShell: { view(k: string): void } }).atlasShell.view("settings"));
  await expect(nav.getByRole("button", { name: "Appearance" })).toBeVisible(); // the phone, a server's vault: no Server
  await expect(nav.getByRole("button", { name: "Server" })).toHaveCount(0);
  await expect(nav.getByRole("button", { name: "Advanced" })).toBeVisible();
});

test("Settings → Server: the password, a phone's token shown once and revoked, AI agents off by default", async ({ page }) => {
  const p = await serverPage(page);
  await expect(p).toContainText("Not serving to the network");
  await expect(p).toContainText("no password yet");
  // the password: too short, then set; then a change needs the current one
  await p.getByLabel("New password", { exact: true }).fill("short");
  await p.getByLabel("New password again").fill("short");
  await p.getByRole("button", { name: "Set password" }).click();
  await expect(p).toContainText("at least 10 characters");
  await p.getByLabel("New password", { exact: true }).fill("a long enough password");
  await p.getByLabel("New password again").fill("a long enough password");
  await p.getByRole("button", { name: "Set password" }).click();
  await expect(p).toContainText("Password set.");
  await expect(p.getByRole("button", { name: "Change password" })).toBeVisible();
  expect(readFileSync(`${WS}-server.toml`, "utf8")).toMatch(/password_hash = "\$argon2id\$/);
  await expect(p).not.toContainText("Not ready to serve");

  // a token for the phone: shown once, kept only as a hash
  await p.getByLabel("Device name").fill("phone");
  await p.getByRole("button", { name: "Make a token" }).click();
  const token = (await p.locator(".shown code").textContent())!;
  expect(token).toMatch(/^atl_[0-9a-f]{64}$/);
  await expect(p.locator(".token", { hasText: "phone" })).toContainText("capture");
  const state = readFileSync(`${WS}-server.json`, "utf8");
  expect(state).toContain("phone");
  expect(state).not.toContain(token);
  await p.locator(".token", { hasText: "phone" }).getByRole("button", { name: "Revoke" }).click();
  await expect(p.locator(".token", { hasText: "phone" })).toHaveCount(0);
  await expect(p.locator(".shown")).toHaveCount(0);

  // the sign-in options: Authelia in front, agents still off unless ticked
  await p.getByRole("radio", { name: /Both/ }).check();
  await p.getByLabel("Trusted proxies").fill("10.0.0.2");
  await p.getByRole("button", { name: "Save sign-in options" }).click();
  await expect(p).toContainText("Saved");
  const toml = readFileSync(`${WS}-server.toml`, "utf8");
  expect(toml).toContain('auth = "both"');
  expect(toml).toContain("10.0.0.2");
  expect(toml).toContain("mcp = false");
  expect(toml).toMatch(/password_hash = /); // kept when the options change
});
