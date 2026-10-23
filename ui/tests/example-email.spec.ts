import { test, expect, type APIRequestContext } from "@playwright/test";
import { rmSync } from "node:fs";
import { join } from "node:path";
import { WS } from "../playwright.config";
import { installEmailPlugin } from "./fixtures/plugins";

// The Email plugin's Outlook sign-in through Atlas's sign-in window (engine/src/oauth.rs, ui/src/signin.ts): the
// window's return address finishes it; Microsoft's refusal is said in plain words.
const H = { "x-atlas": "1" };
const SETTINGS = ".atlas/plugin-settings/email.toml";
const put = (r: APIRequestContext, path: string, text: string) => r.put("/api/file", { headers: H, data: { path, text } });

test.beforeAll(async ({ request }) => {
  test.setTimeout(300_000); // the engine is built once
  installEmailPlugin(); // the plugin as shipped, its helper built from this checkout
  await put(request, SETTINGS, `[[accounts]]\nname = "uni"\nauth = "outlook"\nuser = "me@uni.example.org"\nflow = "window"\ntenant = "uni.example.org"\n`);
  await request.post("/api/plugins/email/helper/stop", { headers: H });
});
test.afterAll(async ({ request }) => {
  await request.post("/api/plugins/email/helper/stop", { headers: H });
  rmSync(join(WS, ".atlas/plugins/email"), { recursive: true, force: true });
});

test("the sign-in window's return address finishes the sign-in, and a refusal says why", async ({ page, request }) => {
  test.setTimeout(60_000);
  await page.addInitScript(() => { (window as unknown as { opened: string[] }).opened = []; window.open = (u) => { (window as unknown as { opened: string[] }).opened.push(String(u)); return null; }; });
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  const palette = page.getByTestId("palette");
  await expect(async () => {
    if (await palette.isVisible()) await page.keyboard.press("Escape");
    await page.keyboard.press("F1");
    await page.keyboard.type("Email: sign in to Outlook");
    await expect(palette.getByText("Email: sign in to Outlook…", { exact: true }).first()).toBeVisible({ timeout: 1000 });
    await page.keyboard.press("Enter");
    await expect(palette.getByPlaceholder(/Sign in as uni in the window that opened/)).toBeVisible({ timeout: 5000 });
  }).toPass({ timeout: 20_000 });
  const opened = await page.evaluate(() => (window as unknown as { opened: string[] }).opened);
  expect(opened.at(-1)).toMatch(/^https:\/\/login\.microsoftonline\.com\/uni\.example\.org\/oauth2\/v2\.0\/authorize\?.*redirect_uri=https%3A%2F%2Flocalhost/);
  expect(opened.at(-1)).toContain("login_hint=me%40uni.example.org");

  // another address is not this sign-in's answer: the box stays
  await request.post("/api/signin", { headers: H, data: { url: "http://127.0.0.1:9/cb?code=x" } });
  await page.waitForTimeout(300);
  await expect(palette).toBeVisible();
  const r = await request.post("/api/signin", { headers: H, data: { url: "https://localhost/?error=consent_required&error_description=AADSTS65001%3A+The+user+or+administrator+has+not+consented.%0D%0ATrace+ID%3A+1" } });
  expect(((await r.json()) as { delivered: number }).delivered).toBeGreaterThan(0);
  await expect(palette).toBeHidden();
  await expect(page.locator(".toast", { hasText: /Outlook said no: your organisation must approve this mail app first/ })).toBeVisible();
});
