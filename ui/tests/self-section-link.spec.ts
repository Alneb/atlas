import { test, expect } from "@playwright/test";
import { openFile } from "./open";

// `[[#section]]` names a place in the note itself: opened beside (a middle click, a new tab) it is that note at that
// heading, never a new empty note named ".md".
const H = { "x-atlas": "1" };

test("a link to a heading of the same note opens that note in a new tab, making no file", async ({ page, request }) => {
  const body = "# Self\n\nsee [[#Far below]]\n\n" + "filler\n\n".repeat(60) + "## Far below\n\nthe place\n";
  await request.put("/api/file", { headers: H, data: { path: "notes/self-link.md", text: body } });
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await openFile(page, "self-link.md");
  await page.locator(".cm-hmd-internal-link", { hasText: "Far below" }).first().click({ button: "middle" });
  await expect(page.locator(".cm-content:visible").first()).toContainText("the place");
  for (const p of [".md", "notes/.md"]) {
    const r = await request.get(`/api/file?path=${encodeURIComponent(p)}`, { headers: H });
    expect(r.ok(), `${p} must not exist`).toBe(false);
  }
});
