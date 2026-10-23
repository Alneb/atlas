import type { Page } from "@playwright/test";

/** Serve the settings with `[editor] properties = inline` (config.toml is not touched): the audits
 *  compare with Obsidian, which shows a note's properties in the note; Atlas hides them by default. */
export async function propertiesInline(page: Page): Promise<void> {
  await page.route("**/api/config", async (route) => {
    if (route.request().method() !== "GET") return route.continue();
    const res = await route.fetch(), body = await res.json();
    body.config.editor.properties = "inline";
    await route.fulfill({ response: res, json: body });
  });
}
