import { test, expect } from "@playwright/test";

// Settings → Sign-ins (components/settings/SigninsPanel.svelte, core service_signin.rs): the three ways past a sign-in
// on one page — a gate's session, an OpenID provider's token, a key that skips the gate. The bypass key is the real
// core's (`/api/signin/bypass`, kept in the test vault's secrets): listed by its hosts and header, never its value;
// a rule naming a whole top-level domain is refused by the form before anything is sent.
test("Settings → Sign-ins: a bypass key is kept, listed without its value, a *.org refused, then forgotten", async ({ page }) => {
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  // a key an earlier, failed run left behind would hide the empty state
  await page.evaluate(() => fetch("/api/signin/bypass", { method: "DELETE", headers: { "x-atlas": "1", "content-type": "application/json" }, body: JSON.stringify({ hosts: ["*.example.org"], header: "X-Api-Key" }) }));
  await page.keyboard.press("Meta+,");
  await page.getByRole("navigation", { name: "Settings pages" }).getByRole("button", { name: "Sign-ins", exact: true }).click();
  const p = page.getByTestId("signins-panel");
  // first what the vault's plugins point at, then the sessions kept; the rest folded as Advanced
  for (const h of ["Your services", "Login sessions kept"]) await expect(p.getByRole("heading", { name: h })).toBeVisible();
  await expect(p.getByRole("heading", { name: "Keys that skip the login" })).toBeHidden();
  await expect(p).toContainText("None yet");
  await p.getByText(/^Advanced:/).click();
  for (const h of ["An OpenID provider for plugins", "Keys that skip the login"]) await expect(p.getByRole("heading", { name: h })).toBeVisible();
  await expect(p).toContainText("No OpenID sign-in yet");
  await expect(p).toContainText("No key.");

  // a key for the subdomains of example.org
  await p.getByLabel("Hosts").fill("*.example.org");
  await p.getByLabel("Header").fill("X-Api-Key");
  await p.getByLabel("Key", { exact: true }).fill("k");
  await p.getByRole("button", { name: "Keep key" }).click();
  await expect(p.getByRole("status")).toContainText("Key kept for *.example.org");
  const row = p.getByRole("list", { name: "Bypass keys" }).locator("li");
  await expect(row).toHaveCount(1);
  await expect(row).toContainText("*.example.org");
  await expect(row).toContainText("X-Api-Key");
  await expect(row).toContainText("key kept");
  await expect(p.getByLabel("Key", { exact: true })).toHaveValue("");
  // the core lists hosts and header only
  const listed = await page.evaluate(() => fetch("/api/signin/bypass", { headers: { "x-atlas": "1" } }).then((r) => r.json()));
  expect(listed).toEqual([{ hosts: ["*.example.org"], header: "X-Api-Key" }]);

  // a whole top-level domain: refused with the reason, nothing sent
  let puts = 0;
  page.on("request", (r) => { if (r.method() === "PUT" && r.url().endsWith("/api/signin/bypass")) puts++; });
  await p.getByLabel("Hosts").fill("*.org");
  await p.getByLabel("Key", { exact: true }).fill("k");
  await p.getByRole("button", { name: "Keep key" }).click();
  await expect(p.getByRole("alert")).toContainText("“*.org” would send the key to every site under it");
  expect(puts).toBe(0);
  await expect(row).toHaveCount(1);

  // light and dark, for the eye (UI-STYLE.md)
  await page.evaluate(() => (document.documentElement.dataset.theme = "light"));
  await page.screenshot({ path: "test-results/settings-signins-light.png", fullPage: true });
  await page.evaluate(() => (document.documentElement.dataset.theme = "dark"));
  await page.screenshot({ path: "test-results/settings-signins-dark.png", fullPage: true });

  // forgotten, after a confirmation (the key cannot be shown again)
  await row.getByRole("button", { name: "Forget the key for *.example.org" }).click();
  await row.getByRole("button", { name: "Forget key" }).click();
  await expect(row).toHaveCount(0);
  await expect(p).toContainText("No key.");
  const after = await page.evaluate(() => fetch("/api/signin/bypass", { headers: { "x-atlas": "1" } }).then((r) => r.json()));
  expect(after).toEqual([]);
});

// A plugin pointing at a server is listed under "Your services" with what it is missing: the login page's session and,
// for one with a secret, its own login — each a button, nothing to type.
test("Settings → Sign-ins: a plugin's server is listed with a Sign in for each missing login", async ({ page, request }) => {
  const H = { "x-atlas": "1" };
  await request.put("/api/file", { headers: H, data: { path: ".atlas/plugins/svcdemo/plugin.toml", text: 'title = "Service demo"\n\n[[setting]]\nkey = "server"\nlabel = "Server"\nkind = "text"\ndefault = "https://svc.example.org"\n\n[[setting]]\nkey = "token"\nlabel = "Token"\nkind = "secret"\n' } });
  try {
    await page.goto("/");
    await page.getByText("Finish the GW notes.").waitFor();
    await page.keyboard.press("Meta+,");
    await page.getByRole("navigation", { name: "Settings pages" }).getByRole("button", { name: "Sign-ins", exact: true }).click();
    const row = page.getByTestId("signins-panel").locator('[data-service="svcdemo"]');
    await expect(row).toContainText("Service demo");
    await expect(row).toContainText("svc.example.org");
    await expect(row).toContainText("Its own login: not yet");
    await expect(row.getByRole("button", { name: "Sign in", exact: true })).toBeVisible();
    await expect(row.getByRole("button", { name: "Open its settings" })).toBeVisible();
  } finally {
    await request.post("/api/fs/trash?path=.atlas/plugins/svcdemo", { headers: H });
  }
});
