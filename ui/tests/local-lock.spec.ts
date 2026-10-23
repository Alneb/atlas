import { test, expect } from "@playwright/test";

// The tests' core runs locked (playwright.config.ts, DESIGN-local-lock.md): another program without the key is
// refused, and "Open Atlas in the browser" hands a new window a link that works once and becomes its cookie.
test("a request without the key is refused; the browser link opens the app once", async ({ page, playwright, baseURL }) => {
  const stranger = await playwright.request.newContext({ baseURL, extraHTTPHeaders: { "x-atlas": "1" }, storageState: { cookies: [], origins: [] } });
  expect((await stranger.get("/api/workspace")).status()).toBe(401);
  const locked = await stranger.get("/");
  expect(locked.status()).toBe(401);
  expect(await locked.text()).toContain("Atlas is locked");
  await stranger.dispose();

  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  const link: string = await page.evaluate(() => fetch("/api/local/link", { method: "POST", headers: { "x-atlas": "1" } }).then((r) => r.json()).then((j) => j.url));
  expect(link).toMatch(/\/\?k=[0-9a-f]{32}$/);
  // a fresh browser with nothing but the link
  const fresh = await page.context().browser()!.newContext({ storageState: { cookies: [], origins: [] }, extraHTTPHeaders: {} });
  const tab = await fresh.newPage();
  await tab.goto(link);
  await expect(tab).toHaveURL(/\/$/); // the code left out of the address
  await tab.getByText("Finish the GW notes.").waitFor(); // the app, its API and its events through the cookie
  const again = await fresh.newPage();
  await again.context().clearCookies();
  const reused = await again.goto(link);
  expect(reused?.status()).toBe(401); // a link works once
  await fresh.close();
});
