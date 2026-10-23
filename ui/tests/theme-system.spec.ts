import { test, expect } from "@playwright/test";

// `[ui] theme = "system"`: Atlas follows the desktop's light / dark choice, also when it changes
// while the app is open. The settings are served with the value replaced, so the shared test vault's
// config stays as it is. (What this cannot show: that the desktop app's own window reports the
// desktop's choice — that is WebKitGTK's part.)
test("theme = system follows the desktop, live", async ({ page }) => {
  await page.route("**/api/config", async (route) => {
    if (route.request().method() !== "GET") return route.continue();
    const res = await route.fetch(), body = await res.json();
    body.config.ui.theme = "system";
    await route.fulfill({ response: res, json: body });
  });
  const painted = () => page.evaluate(() => document.documentElement.dataset.theme);
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await expect.poll(painted).toBe("light");
  await page.emulateMedia({ colorScheme: "dark" });
  await expect.poll(painted, "the desktop switched while Atlas was open").toBe("dark");
  await page.emulateMedia({ colorScheme: "light" });
  await expect.poll(painted).toBe("light");
});
