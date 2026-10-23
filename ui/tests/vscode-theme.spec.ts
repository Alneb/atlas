import { test, expect } from "@playwright/test";
import { WS } from "../playwright.config";

test("a VS Code theme (JSONC) dresses the UI and the syntax colours", async ({ page, request }) => {
  const h = { "x-atlas": "1" };
  const cfg = (await (await request.get("/api/config", { headers: h })).json()).config;
  await request.put("/api/config", { headers: h, data: { ...cfg, ui: { ...cfg.ui, vscode_theme: `${WS}/themes/test-color-theme.json` } } });
  try {
    await page.goto("/");
    await page.getByText("Finish the GW notes.").waitFor();
    const v = (n: string) => page.evaluate((n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim(), n);
    await expect.poll(() => v("--bg")).toBe("#050505");
    expect(await v("--accent")).toBe("#7de486");
    expect(await v("--syn-keyword")).toBe("#c678dd");
    expect(await v("--syn-variable-weight")).toBe("700");
  } finally {
    await request.put("/api/config", { headers: h, data: cfg });
  }
});
