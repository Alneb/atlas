import { test, expect } from "@playwright/test";

// More syntax highlighting: a fence in a language outside highlight.js's common set (Elixir)
// is highlighted once its language has loaded (lib/highlight.ts loads it the first time a fence names it).
const H = { "x-atlas": "1" };

test("a fence in a less common language is highlighted", async ({ page, request }) => {
  await request.put("/api/file", { headers: H, data: { path: "notes/elixir-fence.md", text: "# Fence\n\n```python\ndef known(): return 1\n```\n\n```elixir\ndefmodule Hello do\n  def world, do: :ok\nend\n```\n\nAfter.\n" } });
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await page.keyboard.press("Control+p");
  await page.keyboard.type("elixir-fence");
  await expect(page.getByTestId("palette").getByText(/elixir-fence/).first()).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page.locator(".cm-content").filter({ hasText: "After." })).toBeVisible();
  await expect(page.locator(".cm-content [class*='hljs-keyword']", { hasText: "defmodule" }).first()).toBeVisible({ timeout: 10_000 });
});
