import { test, expect } from "@playwright/test";

// Two Claude tabs read "Claude" and "Claude 2", each with a session id of its own kept in the tab
// (the core resumes it when the layout comes back).
test("two Claude sessions are numbered and each keeps its own session id", async ({ page, request }) => {
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  for (let i = 0; i < 2; i++) {
    await page.keyboard.press("F1");
    await page.keyboard.type("New AI agent session");
    await page.keyboard.press("Enter");
  }
  await expect(page.getByRole("option", { name: /^Claude 2/ }).first()).toBeVisible();
  await expect(page.getByRole("option", { name: /^Claude(?! 2)/ }).first()).toBeVisible();
  // the saved layout (a file, .atlas/cache/layout.json) carries a different session for each tab
  const sessions = async () => {
    const r = await request.get(`/api/file?path=${encodeURIComponent(".atlas/cache/layout.json")}`, { headers: { "x-atlas": "1" } });
    const text = r.ok() ? (((await r.json()) as { text?: string }).text ?? "") : "";
    return new Set(text.match(/"session":"[0-9a-f-]{36}"/g) ?? []).size;
  };
  await expect.poll(sessions, { timeout: 10_000 }).toBeGreaterThanOrEqual(2);
});
