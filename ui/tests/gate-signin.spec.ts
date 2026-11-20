import { test, expect } from "@playwright/test";

// A page behind a sign-in gate (Authelia's forward-auth) whose session ended: every call is redirected to the gate's
// domain and the browser refuses it as "Failed to fetch". The page loads itself again (through the sign-in), once a
// minute at most — never a loop.
test("calls redirected to a sign-in gate load the page again, once", async ({ page }) => {
  await page.route("**/api/workspace**", (r) => r.fulfill({ status: 302, headers: { location: "https://auth.example.org/?rd=x" } }));
  let loads = 0;
  page.on("load", () => loads++);
  await page.goto("/");
  await expect.poll(() => loads, { timeout: 15_000 }).toBe(2); // the first load, then once more for the sign-in
  await page.waitForTimeout(3000);
  expect(loads, "not again within the minute").toBe(2);
});
