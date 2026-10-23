import { test, expect } from "@playwright/test";

// A to-do in today's log is ticked from the log panel (Markdown.svelte, tickable): the file says [x].
const H = { "x-atlas": "1" };

test("a to-do in today's log can be ticked from the panel", async ({ page, request }) => {
  const today = await (await request.get("/api/today", { headers: H })).json() as { log: { path: string } };
  const path = today.log.path;
  const read = async () => ((await (await request.get(`/api/file?path=${encodeURIComponent(path)}`, { headers: H })).json()) as { text?: string }).text ?? "";
  const before = await read().catch(() => "");
  await request.put("/api/file", { headers: H, data: { path, text: `# ${path.split("/").pop()!.replace(/\.md$/, "")}\n\n- 09:00 a note\n- [ ] 09:05 buy milk for the log test\n` } });
  try {
    await page.goto("/");
    const row = page.locator(".log-md li", { hasText: "buy milk for the log test" });
    await expect(row).toBeVisible();
    await row.locator("input.task-checkbox").click();
    await expect.poll(read).toContain("- [x] 09:05 buy milk for the log test");
  } finally {
    await request.put("/api/file", { headers: H, data: { path, text: before } }); // the shared vault as it was
  }
});
