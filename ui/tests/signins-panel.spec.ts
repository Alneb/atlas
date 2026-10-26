import { test, expect } from "@playwright/test";

// Settings → Accounts, "Sign-ins for plugins" (components/settings/SigninsPanel.svelte, core service_signin.rs): each
// kept sign-in with the plugins it is sent for, and a sign-in started ahead of any plugin from a typed address.
test("a kept sign-in says which plugins it is sent for; one can be started from an address", async ({ page }) => {
  await page.route("**/api/signin/doors", (route) => route.fulfill({ json: [
    { host: "links.example.org", at: 1761354000, cookies: 2, renewed: 1761400000, ended: false, plugins: ["linkwarden", "jellyfin"] },
    { host: "old.example.net", at: 1761354000, cookies: 1, ended: true, plugins: [] },
  ] }));
  await page.addInitScript(() => { (window as unknown as { opened: string[] }).opened = []; window.open = ((u: string) => { (window as unknown as { opened: string[] }).opened.push(u); return null; }) as typeof window.open; });
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await page.keyboard.press("F1");
  await page.keyboard.type("Settings");
  await page.getByTestId("palette").getByText("Settings", { exact: true }).first().click();
  await page.locator(".nav.accounts").click();
  const panel = page.getByTestId("signins-panel");
  await expect(panel.locator("li").nth(0)).toContainText("for linkwarden, jellyfin");
  await expect(panel.locator("li").nth(1)).toContainText("ended");
  await expect(panel.locator("li").nth(1)).toContainText("no plugin names it yet");
  await panel.getByLabel("Sign in at a service's address").fill("media.example.org");
  await panel.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { opened: string[] }).opened)).toEqual([expect.stringContaining("/signin/door?url=https%3A%2F%2Fmedia.example.org")]);
});
