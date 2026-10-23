import { test, expect } from "@playwright/test";

// The icon (docs/guides/ICON.md): the tab's icon is served and linked, and the badge atop the sidebar is the vault's initial.
test("the browser tab has Atlas's icon", async ({ page, request }) => {
  for (const [path, type] of [["/favicon.svg", "image/svg+xml"], ["/favicon.ico", "image/"], ["/apple-touch-icon.png", "image/png"]]) {
    const res = await request.get(path);
    expect(res.status(), path).toBe(200);
    expect(res.headers()["content-type"], path).toContain(type);
  }
  await page.goto("/");
  await expect(page.locator('link[rel="icon"][type="image/svg+xml"]')).toHaveAttribute("href", "/favicon.svg");
});

test("the badge is the open vault's initial", async ({ page }) => {
  await page.goto("/");
  const badge = page.getByTestId("sidebar").getByTestId("vault-badge");
  await expect(badge).toBeVisible();
  const name = (await badge.getAttribute("title")) ?? "";
  expect(name).not.toBe("");
  const initial = ([...name].find((c) => /[\p{L}\p{N}]/u.test(c)) ?? name[0]).toLocaleUpperCase();
  await expect(badge).toHaveText(initial);
});
