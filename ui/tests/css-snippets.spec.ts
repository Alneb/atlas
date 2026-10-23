import { test, expect } from "@playwright/test";
const H = { "x-atlas": "1" };

// docs/design/MALLEABLE.md rung 2 (Stylish / Obsidian snippets): a .css file in .atlas/snippets restyles
// Atlas on save, a switch in Settings turns it off, "New snippet" starts one and opens it.
test("CSS snippets: live on save, switch off in Settings, new snippet", async ({ page, request }) => {
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  const outline = () => page.evaluate(() => getComputedStyle(document.querySelector(".status")!).outlineColor);
  await request.put("/api/file", { headers: H, data: { path: ".atlas/snippets/pink.css", text: ".status { outline: 2px solid rgb(255, 0, 255); }\n" } });
  await expect.poll(outline).toBe("rgb(255, 0, 255)");
  await request.put("/api/file", { headers: H, data: { path: ".atlas/snippets/pink.css", text: ".status { outline: 2px solid rgb(0, 128, 0); }\n" } });
  await expect.poll(outline).toBe("rgb(0, 128, 0)"); // edited → re-applied, no reload
  await page.keyboard.press("Meta+,");
  await page.getByRole("navigation", { name: "Settings pages" }).getByRole("button", { name: "Appearance" }).click();
  const sw = page.getByRole("checkbox", { name: "Snippet pink" });
  await expect(sw).toBeChecked();
  await sw.uncheck();
  await expect.poll(outline).not.toBe("rgb(0, 128, 0)");
  await sw.check();
  await expect.poll(outline).toBe("rgb(0, 128, 0)");
  await page.getByRole("button", { name: "New snippet" }).click();
  await page.getByRole("dialog").getByRole("textbox").fill("wide notes");
  await page.keyboard.press("Enter");
  await expect(page.locator(".dv-tab.dv-active-tab")).toContainText("wide-notes.css");
  await request.put("/api/file", { headers: H, data: { path: ".atlas/snippets/pink.css", text: "" } });
});
