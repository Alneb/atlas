import { test, expect, type Page } from "@playwright/test";
import { shownName } from "../src/lib/paths";
import { mkdirSync } from "node:fs";

// Vertical tabs (docs/design/VERTICAL-TABS.md), driven the way a person would: Ctrl+P to open notes, the
// sidebar to find, pin, reorder, split, close and collapse, a reload to see it all come back —
// then once by keyboard only. Screenshots of each step go to ATLAS_SHOTS (looked at by hand).
const SHOTS = process.env.ATLAS_SHOTS ?? "test-results/vtabs";
mkdirSync(SHOTS, { recursive: true });
const shot = (page: Page, name: string) => page.screenshot({ path: `${SHOTS}/${name}.png` });

const side = (page: Page) => page.getByTestId("sidebar");
const row = (page: Page, text: string) => side(page).locator(".tab", { hasText: shownName(text) }); // a note reads without ".md"
const rowTitles = (page: Page) => side(page).locator('.group[aria-label^="Tabs"]').first().locator(".tab-title").allInnerTexts();
const activeRow = (page: Page) => side(page).locator(".tab.active, .pin.active");
/** Home (Today) is an app at the top, not a row */
const homeOn = (page: Page) => side(page).getByTestId("apps").locator(".app.active[aria-label=Home]");

async function openFile(page: Page, q: string, name: string) {
  await page.keyboard.press("Control+p");
  const palette = page.getByTestId("palette");
  await expect(palette.getByRole("textbox")).toBeFocused();
  await page.keyboard.type(q);
  await expect(palette.getByText(shownName(name), { exact: true }).first()).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(row(page, name)).toBeVisible();
  await expect(page.locator(".cm-editor.cm-focused")).toBeVisible(); // the note takes the keys once loaded
}

// pins live in a file of the vault (shared by every test): each test starts without any
test.beforeEach(async ({ page, request }) => {
  await request.put("/api/file", { headers: { "x-atlas": "1" }, data: { path: ".atlas/bookmarks.yaml", text: "pins: []\nbookmarks: []\n" } });
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
});

test("vertical tabs: open, find, pin, drag to reorder, middle-click close, split, collapse + hover, restored after reload", async ({ page }) => {
  // the sidebar lists every open tab; the strip above the pane is gone
  await expect(side(page)).toBeVisible();
  await expect(page.locator(".dv-tabs-and-actions-container").first()).toBeHidden();
  for (const [q, name] of [["hubbard", "hubbard.md"], ["journal", "journal.md"], ["run.py", "run.py"], ["FOCUS", "FOCUS.md"]]) await openFile(page, q, name);
  await expect(activeRow(page)).toHaveText(/FOCUS/);
  await shot(page, "01-open");

  // find a tab: Ctrl+Shift+A takes the list, / filters, Enter opens
  await page.keyboard.press("Control+Shift+A");
  await expect(side(page).locator(".tab.cursor")).toBeFocused();
  await page.keyboard.press("/");
  await page.keyboard.type("jour");
  await expect(side(page).locator(".tab")).toHaveCount(1);
  await shot(page, "02-find");
  await page.keyboard.press("Enter");
  await expect(activeRow(page)).toHaveText(/journal/);
  await expect(page.locator(".cm-content").filter({ hasText: "Talked about" })).toBeVisible();
  await expect(side(page).locator(".tab")).toHaveCount(4); // filter cleared (Home is an app, not a row)

  // pin from the context menu: it becomes a tile on top and leaves the list
  await row(page, "hubbard.md").click({ button: "right" });
  await page.getByRole("menuitem", { name: /^Pin/ }).click();
  const pins = page.getByTestId("pins");
  await expect(pins.locator(".pin", { hasText: "hubbard" })).toBeVisible();
  await expect(row(page, "hubbard.md")).toHaveCount(0);
  await shot(page, "03-pinned");

  // drag run.py above journal.md
  expect(await rowTitles(page)).toEqual(["journal", "run.py", "FOCUS"]);
  await row(page, "run.py").dragTo(row(page, "journal.md"), { targetPosition: { x: 40, y: 4 } });
  await expect.poll(() => rowTitles(page)).toEqual(["run.py", "journal", "FOCUS"]);
  await shot(page, "04-reordered");

  // middle-click closes
  await row(page, "journal.md").click({ button: "middle" });
  await expect(row(page, "journal.md")).toHaveCount(0);

  // split right from the menu: one Editor section, the two halves one split row (Zen)
  await row(page, "FOCUS.md").click({ button: "right" });
  await page.getByRole("menuitem", { name: "Split right" }).click();
  await expect(side(page).locator(".group-head")).toHaveText(["Terminal", "Tabs"]);
  await expect(side(page).getByTestId("split-row").locator(".tab")).toHaveCount(2);
  await expect(page.locator(".dv-groupview")).toHaveCount(2);
  await shot(page, "05-split");

  // collapse to icons; hovering shows the full list over the panes
  await page.getByTestId("sidebar-toggle").click();
  await page.mouse.move(900, 450);
  await expect.poll(() => side(page).evaluate((el) => el.getBoundingClientRect().width)).toBeLessThan(60);
  await expect(side(page).locator(".tab-title")).toHaveCount(0);
  await shot(page, "06-collapsed");
  await page.mouse.move(26, 450);
  await expect(side(page)).toHaveClass(/peek/);
  await expect(side(page).locator(".tab-title").first()).toBeVisible();
  await shot(page, "07-hover");
  await page.mouse.move(900, 450);
  await expect(side(page)).not.toHaveClass(/peek/);

  // reload: pin, order, split and the collapsed sidebar come back
  await page.waitForTimeout(800); // the layout save is debounced
  await page.reload();
  // the text shows twice once both splits have loaded: on Today, and in FOCUS.md in the other split
  await page.getByText("Finish the GW notes.").first().waitFor();
  await expect(side(page).locator(".pin")).toHaveCount(1);
  await page.keyboard.press("Meta+s"); // expand again
  await expect(pins.locator(".pin", { hasText: "hubbard" })).toBeVisible();
  await expect(side(page).locator(".group-head")).toHaveText(["Terminal", "Tabs"]);
  await expect(side(page).getByTestId("split-row").locator(".tab", { hasText: "FOCUS" })).toHaveCount(1);
  await expect(row(page, "run.py")).toHaveCount(1);
  await shot(page, "08-restored");

  // a pinned tab survives being closed: the tile stays and reopens it
  await pins.locator(".pin", { hasText: "hubbard" }).click();
  await expect(page.locator(".cm-content").filter({ hasText: "Hubbard" })).toBeVisible();
  await page.keyboard.press("Control+w");
  await expect(pins.locator(".pin.resting", { hasText: "hubbard" })).toBeVisible();
  await pins.locator(".pin", { hasText: "hubbard" }).click();
  await expect(pins.locator(".pin.active", { hasText: "hubbard" })).toBeVisible();
});

test("vertical tabs by keyboard only: Ctrl+Tab, Ctrl+1..9, pin, the tab list with j/k/x/Enter/Esc", async ({ page }) => {
  for (const [q, name] of [["hubbard", "hubbard.md"], ["journal", "journal.md"], ["run.py", "run.py"]]) await openFile(page, q, name);
  // order: hubbard.md, journal.md, run.py (active); Home is an app, not counted. Ctrl+Tab is the glance
  // (tab-glance.spec.ts): a quick press goes to the tab used before, Ctrl+Shift+Tab to the one used longest ago
  await page.keyboard.press("Control+Tab");
  await expect(activeRow(page)).toHaveText(/journal/);
  await page.keyboard.press("Control+Shift+Tab");
  await expect(homeOn(page)).toHaveCount(1);
  await page.keyboard.press("Control+1");
  await expect(activeRow(page)).toHaveText(/hubbard/);
  await page.keyboard.press("Control+9");
  await expect(activeRow(page)).toHaveText(/run\.py/);

  // pin the current tab: it moves to the tiles and counts first for Ctrl+1
  await page.keyboard.press("Control+Alt+p");
  await expect(page.getByTestId("pins").locator(".pin.active")).toHaveText(/run/);
  await page.keyboard.press("Control+2");
  await expect(activeRow(page)).toHaveText(/hubbard/);
  await page.keyboard.press("Control+1");
  await expect(activeRow(page)).toHaveText(/run/);

  // the tab list: Ctrl+Shift+A, j/k move, x closes, Enter opens and gives the pane the keys
  await page.keyboard.press("Control+Shift+A");
  const cur = side(page).locator(".cursor");
  await expect(cur).toHaveText(/run/);
  await page.keyboard.press("j");
  await expect(cur).toHaveText(/hubbard/);
  await page.keyboard.press("j");
  await expect(cur).toHaveText(/journal/);
  await shot(page, "k1-list");
  await page.keyboard.press("x");
  await expect(row(page, "journal.md")).toHaveCount(0);
  await expect(cur).toHaveText(/hubbard/); // the cursor stays in the list, on the neighbour
  await page.keyboard.press("k");
  await expect(cur).toHaveText(/run/);
  await page.keyboard.press("j");
  await page.keyboard.press("Enter");
  await expect(activeRow(page)).toHaveText(/hubbard/);
  await expect(page.locator(".cm-content").filter({ hasText: "Hubbard" })).toBeFocused();

  // Esc leaves the list back into the pane; collapsed, the list opens over the panes and closes after
  await page.keyboard.press("Meta+s");
  await page.keyboard.press("Control+Shift+A");
  await expect(side(page)).toHaveClass(/peek/);
  await shot(page, "k2-collapsed-list");
  await page.keyboard.press("Escape");
  await expect(side(page)).not.toHaveClass(/peek/);
  await expect(page.locator(".cm-content").filter({ hasText: "Hubbard" })).toBeFocused();
  await page.keyboard.press("Meta+s");
});

test("horizontal tabs (setting) keep the classic strips and the activity rail", async ({ page, request }) => {
  const h = { "x-atlas": "1" };
  const cfg = (await (await request.get("/api/config", { headers: h })).json()).config;
  await request.put("/api/config", { headers: h, data: { ...cfg, ui: { ...cfg.ui, tabs: "horizontal" } } });
  try {
    await page.reload();
    await expect(page.getByRole("navigation", { name: "Activity" })).toBeVisible();
    await expect(side(page)).toHaveCount(0);
    await expect(page.locator(".dv-tab", { hasText: "Today" })).toBeVisible();
    await page.keyboard.press("Control+Alt+p");
    await expect(page.getByText("Pinned tabs live in the vertical tab sidebar")).toBeVisible();
  } finally {
    await request.put("/api/config", { headers: h, data: cfg });
  }
  await expect(side(page)).toBeVisible(); // back without a reload
  await expect(page.locator(".dv-tabs-and-actions-container").first()).toBeHidden();
});

// "draging tabs on the side panel does not work too well": dropped in the middle of the list, a tab
// landed one row above where the line showed (only a drop on the very top row was tested)
test("a tab dropped on a row's top half lands right above it, on its bottom half right below it", async ({ page }) => {
  // the home page first, as in the user's layout: a tab of the group that the bar draws on top, not as a row
  await page.keyboard.press("F1");
  await page.keyboard.type("Home (your home document)");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(500);
  for (const [q, name] of [["journal", "journal.md"], ["run.py", "run.py"], ["FOCUS", "FOCUS.md"], ["hubbard", "hubbard.md"]]) await openFile(page, q, name);
  const start = await rowTitles(page);
  const at = (n: string) => start.indexOf(n);
  expect(at("FOCUS")).toBeGreaterThan(at("run.py"));
  // the last row onto the top half of run.py: just above run.py
  const last = start.at(-1)!;
  await row(page, last).dragTo(row(page, "run.py"), { targetPosition: { x: 40, y: 4 } });
  await expect.poll(async () => { const t = await rowTitles(page); return t.indexOf("run.py") - t.indexOf(last); }).toBe(1);
  // the first row onto the bottom half of FOCUS.md: just below it
  const first = (await rowTitles(page))[0];
  const h = (await row(page, "FOCUS.md").boundingBox())!.height;
  await row(page, first).dragTo(row(page, "FOCUS.md"), { targetPosition: { x: 40, y: h - 4 } });
  await expect.poll(async () => { const t = await rowTitles(page); return t.indexOf(first) - t.indexOf("FOCUS"); }).toBe(1);
});
