import { test, expect, type APIRequestContext } from "@playwright/test";

// The notices (components/Toasts.svelte): the same one again
// is counted on it, × closes it, and the pointer on it keeps it while it is read.
const H = { "x-atlas": "1" };
const notify = (r: APIRequestContext, title: string, body = "") => r.post("/api/cmd/notify", { headers: H, data: { args: { title, body } } });

test("the same notice twice shows once with ×2, and × closes it", async ({ page, request }) => {
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await notify(request, "Synced", "three files");
  await notify(request, "Synced", "three files");
  const t = page.locator(".toast", { hasText: "Synced" });
  await expect(t).toHaveCount(1);
  await expect(t.locator(".count")).toHaveText("×2");
  await t.getByRole("button", { name: "Close" }).click();
  await expect(t).toHaveCount(0);
});

test("a notice under the pointer stays past its time, and goes once the pointer leaves", async ({ page, request }) => {
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await notify(request, "Read me slowly", "a long message");
  const t = page.locator(".toast", { hasText: "Read me slowly" });
  await t.hover();
  await page.waitForTimeout(5500); // past the 4.5 s a notice lives
  await expect(t).toBeVisible();
  await page.mouse.move(5, 5);
  await expect(t).toHaveCount(0, { timeout: 8000 });
});
