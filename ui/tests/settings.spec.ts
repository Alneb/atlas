import { test, expect, type Page, type APIRequestContext } from "@playwright/test";

// Settings as pages (docs/guides/SETTINGS.md): an overview of what Atlas can do, a page per area with
// features to try and options, search across pages, modified/reset, look options applied live,
// a page as a block in a .page file, and plugins switched off from Settings.
const H = { "x-atlas": "1" };
const cfg = async (request: APIRequestContext) => (await (await request.get("/api/config", { headers: H })).json()).config;
const nav = (page: Page) => page.getByRole("navigation", { name: "Settings pages" });

async function openSettings(page: Page) {
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await page.keyboard.press("Meta+,");
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
}

test("the overview maps areas to pages; a page has features to try and its options", async ({ page }) => {
  await openSettings(page);
  await nav(page).getByRole("button", { name: "Overview" }).click();
  const cards = page.getByRole("region", { name: "Areas" }).locator(".card");
  await expect(cards.filter({ hasText: "References & PDF" })).toBeVisible();
  await cards.filter({ hasText: "Terminal & agents" }).click();
  await expect(page.locator('article[data-page="terminal"]')).toBeVisible();
  // a feature with its shortcut, runnable from here
  const feats = page.getByRole("region", { name: "What you can do here" });
  await expect(feats.getByRole("button", { name: /AI agent terminal/ })).toContainText("Super");
  await expect(page.getByText("Where the terminal panel docks")).toBeVisible();
  // every page reachable from the sidebar draws without an error
  for (const name of ["Appearance", "Writing", "Home & Today", "Code", "Files & search", "References & PDF", "Drawing", "Keyboard", "Plugins", "Automation", "Advanced"]) {
    await nav(page).getByRole("button", { name: new RegExp(`^${name.replace(/[&]/g, "\\$&")}`) }).click();
    await expect(page.locator("main article h2")).toContainText(name);
  }
});

test("search spans pages and matches descriptions", async ({ page }) => {
  await openSettings(page);
  await page.getByPlaceholder("Search settings…").fill("in code files"); // words of line_numbers' description
  await expect(page.locator('.row[data-path="editor.line_numbers"]')).toBeVisible();
  await page.getByPlaceholder("Search settings…").fill("agent");
  await expect(page.getByRole("button", { name: /AI agent terminal/ }).first()).toBeVisible(); // features match too
});

test("accent colour applies live and resets to the theme's", async ({ page, request }) => {
  await openSettings(page);
  await nav(page).getByRole("button", { name: "Appearance" }).click();
  const accent = () => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--accent").trim());
  const before = await accent();
  const box = page.locator('[id="ui.accent"]');
  await box.fill("#ff5500");
  await box.press("Enter");
  await box.blur();
  await expect.poll(accent).toBe("#ff5500");
  await expect.poll(async () => (await cfg(request)).ui.accent).toBe("#ff5500");
  await page.locator('.row[data-path="ui.accent"]').getByRole("button", { name: /reset/ }).click();
  await expect.poll(accent).toBe(before);
  await expect.poll(async () => (await cfg(request)).ui.accent).toBe("");
});

test("the keyboard page lists every command with a rebindable shortcut", async ({ page }) => {
  await openSettings(page);
  await nav(page).getByRole("button", { name: "Keyboard" }).click();
  await page.getByLabel("Filter shortcuts").fill("command palette");
  await expect(page.getByRole("button", { name: "Shortcut for Command palette" })).toContainText("Super");
});

test("a settings page is a block in a .page file", async ({ page, request }) => {
  await request.put("/api/file", { headers: H, data: { path: "notes/tune.page", text: "title: Tune\nrows:\n  - [{ view: settings, page: terminal }]\n" } });
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await page.keyboard.press("Control+p");
  await page.keyboard.type("tune.page");
  await expect(page.getByTestId("palette").getByText("tune", { exact: true }).first()).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page.locator(".settings-block").getByText("Where the terminal panel docks")).toBeVisible();
  await request.put("/api/file", { headers: H, data: { path: "notes/tune.page", text: "" } });
});

test("a plugin switched off in Settings loses its command and button", async ({ page, request }) => {
  await request.put("/api/file", { headers: H, data: { path: ".atlas/plugins/offable/plugin.toml", text: 'title = "Offable"\nicon = "table"\nrail = true\n' } });
  await request.put("/api/file", { headers: H, data: { path: ".atlas/plugins/offable/view.js", text: "export default (host) => { host.textContent = 'offable'; };\n" } });
  await openSettings(page);
  await expect(page.getByRole("button", { name: "Offable", exact: true })).toBeVisible(); // rail
  await nav(page).getByRole("button", { name: "Plugins", exact: true }).click();
  const sw = page.getByRole("switch", { name: "Plugin Offable" });
  await expect(sw).toHaveAttribute("aria-checked", "true");
  await sw.click();
  await expect.poll(async () => (await cfg(request)).plugins.off).toContain("offable");
  await expect(page.getByRole("button", { name: "Offable", exact: true })).toHaveCount(0);
  await sw.click();
  await expect.poll(async () => (await cfg(request)).plugins.off).not.toContain("offable");
  await expect(page.getByRole("button", { name: "Offable", exact: true })).toBeVisible();
});

// Found by clicking every button of every page: a choice detected twice (or "" both as Default and as
// a detected value) gave the list duplicate keys, and the control stopped answering. (The detected lists were the
// Terminal page's Claude installs; since the agent is a plugin's, they are the fonts of Appearance.)
test("the detected-choice lists open without an error", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await openSettings(page);
  await nav(page).getByRole("button", { name: /^Appearance/ }).click();
  const art = page.locator('article[data-page="appearance"]');
  const lists = art.locator("button", { hasText: /^\s*Default\s*$/ });
  await expect(lists.first()).toBeVisible({ timeout: 15000 }); // the detected choices arrive after the page
  for (let i = 0; i < await lists.count(); i++) {
    await lists.nth(i).click();
    await page.waitForTimeout(150);
    await page.keyboard.press("Escape");
  }
  expect(errors).toEqual([]);
});

// the settings added on 2026-10-14 each have their place on a page (a setting nobody can find does not exist)
test("the vim keys, the formatting bar, the formula preview, the code bar and the git gutter are on their pages", async ({ page }) => {
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await page.keyboard.press("Meta+,");
  await page.getByRole("button", { name: /^Writing/ }).first().click();
  for (const name of [/Vim keys/i, /Format bar/i, /Math preview/i, /^Notes folder$/]) await expect(page.getByText(name).first()).toBeVisible();
  await page.getByRole("button", { name: /^Code/ }).first().click();
  for (const name of [/Tool bar above code files/i, /Git gutter/i]) await expect(page.getByText(name).first()).toBeVisible();
});

test("the options of the last features are on their pages, named so they read; a drawing's pages set skip the question", async ({ page, request }) => {
  await openSettings(page);
  const labels: [RegExp, string[]][] = [
    [/^Writing/, ["Live editing between devices", "Default template (a plain note starts from it)", "Notes folder"]],
    [/^Home & Today/, ["Daily log folder", "Daily log template"]],
    [/^Drawing/, ["Drawings folder", "A new drawing's pages"]],
    [/^Web/, ["Web links open in"]],
  ];
  for (const [p, names] of labels) {
    await nav(page).getByRole("button", { name: p }).first().click();
    for (const n of names) await expect(page.locator("label", { hasText: new RegExp(`^${n.replace(/[()]/g, "\\$&")}$`) })).toBeVisible();
  }
  // no field left to an automatic page of its section ("Editor" held live editing alone)
  await expect(nav(page).getByRole("button", { name: /^Editor$/ })).toHaveCount(0);

  const before = await cfg(request);
  try {
    expect((await request.put("/api/config", { headers: H, data: { ...before, draw: { ...before.draw, page_format: "a5" } } })).ok()).toBeTruthy();
    await page.reload();
    await page.getByText("Finish the GW notes.").waitFor();
    await page.keyboard.press("Meta+Shift+D");
    // "a5" was taken out (2026-10-20) and reads as A4: the size is not asked, the paper still is
    await expect(page.getByPlaceholder("New drawing: its pages…")).toHaveCount(0);
    await page.getByTestId("palette").getByText("Blank", { exact: true }).click();
    await expect(page.locator(".excalidraw").first()).toBeVisible({ timeout: 20000 });
  } finally {
    await request.put("/api/config", { headers: H, data: before });
  }
});
