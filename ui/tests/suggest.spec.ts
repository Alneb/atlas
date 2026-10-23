import { test, expect } from "@playwright/test";

// Ephemeral suggestions (docs/guides/MALLEABLE.md R4): a section with dated tasks offers a calendar; nothing is
// inserted until the user accepts, and the offer leaves with the caret.
const H = { "x-atlas": "1" };

test("a section of dated tasks offers a calendar; accepting inserts a concrete view block", async ({ page, request }) => {
  await request.put("/api/file", { headers: H, data: { path: "notes/zz-plan.md", text: "# Plan\n\n## This week\n- [ ] Draft intro 📅 2026-10-12\n- [ ] Send figures 📅 2026-10-14\n\n## Ideas\nnothing dated here\n" } });
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await page.keyboard.press("Control+p");
  await page.keyboard.type("zz-plan.md");
  await expect(page.getByTestId("palette").getByText("zz-plan", { exact: true }).first()).toBeVisible();
  await page.keyboard.press("Enter");
  const offer = page.locator(".atlas-suggest");
  await page.locator(".cm-line", { hasText: "nothing dated here" }).click();
  await page.waitForTimeout(700);
  await expect(offer).toHaveCount(0); // not in a section without dated tasks
  await page.locator(".cm-line", { hasText: "Send figures" }).click();
  await expect(offer).toContainText("Show these 2 dated tasks as a calendar");
  expect((await (await request.get("/api/file?path=notes/zz-plan.md", { headers: H })).json()).text).not.toContain("```view"); // only offered
  await offer.getByRole("button").click();
  await expect(page.locator(".cm-content .atlas-view-calendar")).toBeVisible();
  await expect.poll(async () => (await (await request.get("/api/file?path=notes/zz-plan.md", { headers: H })).json()).text).toContain("```view\ntype: calendar\nfrom: section\n```");
  await request.put("/api/file", { headers: H, data: { path: "notes/zz-plan.md", text: "" } });
});
