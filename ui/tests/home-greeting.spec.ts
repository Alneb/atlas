import { test, expect, type APIRequestContext } from "@playwright/test";
import { openFile } from "./open";
import { readFileSync } from "node:fs";

// Home:
// plugins add chips under the date (`atlas.shell.greetingItem`); Activity lists what was made; the Today plugin's map.
const H = { "x-atlas": "1" };
const put = (r: APIRequestContext, path: string, text: string) => r.put("/api/file", { headers: H, data: { path, text } });
const today = (f: string) => readFileSync(new URL(`../../plugins/beta/today/${f}`, import.meta.url), "utf8");

test.beforeAll(async ({ request }) => {
  await put(request, ".atlas/plugins/greet-test/plugin.toml", 'title = "Greet test"\napi = 4\n');
  await put(request, ".atlas/plugins/greet-test/main.js", 'export function register(atlas) { atlas.shell.greetingItem({ id: "sky", icon: "⛅", text: "12 °C · Oslo", order: 1 }); }\n');
  await put(request, ".atlas/plugins/today/plugin.toml", 'title = "Today"\napi = 4\n');
  await put(request, ".atlas/plugin-settings/today.toml", 'language = "en"\n'); // the vault's values, never in the manifest
  for (const f of ["home.js", "daily.js", "main.js"]) await put(request, `.atlas/plugins/today/${f}`, today(f)); // main.js last: it imports the others
  await put(request, "notes/map/Physics.md", "# Physics\n");
  await put(request, "notes/map/Optics.md", "---\ntopics: [\"[[Physics]]\"]\n---\n# Optics\n");
  await put(request, "notes/map/Lasers.md", "---\ntopics: [\"[[Physics]]\", \"[[Optics]]\"]\n---\n# Lasers\n");
  await put(request, "notes/map/Fibers.md", "---\ntopics: [\"[[Optics]]\"]\n---\n# Fibers\n");
  await put(request, "notes/map/Mechanics.md", "---\ntopics: [\"[[Physics]]\"]\n---\n# Mechanics\n");
});
test.afterAll(async ({ request }) => {
  for (const p of ["greet-test", "today"]) await request.post(`/api/fs/trash?path=.atlas/plugins/${p}`, { headers: H });
  await request.post("/api/fs/trash?path=notes/map", { headers: H });
});

test("plugins put chips under the date; Activity says what was made; the map is the vault's topics as a tree", async ({ page, request }) => {
  await put(request, "notes/fresh idea.md", "# A fresh idea\n");
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  const chips = page.locator(".greet-chips");
  await expect(chips.locator(".greet-chip").first()).toHaveText("⛅12 °C · Oslo");
  await expect(chips).toContainText(/Week \d+ · day \d+/);
  await expect(chips).toContainText(/due today|nothing due today/);
  // the week's chip draws the app's calendar icon (API 21), not an emoji
  await expect(chips.locator(".greet-chip", { hasText: /Week \d+/ }).locator("svg")).toHaveCount(1);
  // Focus: the file's own "# Focus" is not repeated under the card's label
  const focus = page.locator(".card", { has: page.getByRole("heading", { name: "Focus", exact: true }) });
  await expect(focus).toContainText("Finish the GW notes.");
  await expect(focus.locator(".focus-md h1")).toHaveCount(0);

  // Activity: what was made first, what else changed beside it, day by day
  const activity = page.locator(".card", { has: page.getByRole("heading", { name: /^Activity/ }) });
  await expect(activity.getByRole("tab", { name: /Created/ })).toHaveAttribute("aria-selected", "true");
  await expect(activity.locator(".changed-row", { hasText: "fresh idea" }).first()).toBeVisible();
  await activity.getByRole("tab", { name: /Changed/ }).click();
  await expect(activity.locator(".changed-row", { hasText: "fresh idea" })).toHaveCount(0); // made today: listed once, as made
  await activity.getByRole("tab", { name: /Created/ }).click();
  await activity.getByRole("button", { name: "Activity of the day before" }).click();
  await expect(activity.getByRole("heading")).toContainText("Activity —");
  await expect(activity.locator(".changed-row", { hasText: "fresh idea" })).toHaveCount(0);
  await activity.getByRole("button", { name: "Today", exact: true }).click();
  await expect(activity.getByRole("heading")).toHaveText("Activity");

  // a day's log shows what was made that day, as a block of its own
  await put(request, "log/2019-06-01.md", "---\ncreated: 2019-06-01\n---\n# Saturday\n\n```view\ntype: activity\n```\n");
  await put(request, "notes/made-that-day.md", "---\ncreated: 2019-06-01 10:00\n---\n# Made that day\n");

  await openFile(page, "2019-06-01");
  const day = page.locator(".card", { has: page.getByRole("heading", { name: "Made this day" }) });
  await expect(day.locator(".changed-row", { hasText: "made-that-day" })).toBeVisible();
  for (const f of ["log/2019-06-01.md", "notes/made-that-day.md"]) await request.post(`/api/fs/trash?path=${f}`, { headers: H });

  // the map, as a page block would draw it
  await put(request, "notes/map/Map.md", "# Map\n\n```view\ntype: home.map\nmin: 1\n```\n");
  await openFile(page, "Map.md");
  await expect(page.locator(".cm-content")).toContainText("Map");
  const map = page.locator(".home-map");
  await expect(map.locator(".row").first()).toContainText("Physics");
  await expect(map.locator(".row", { hasText: "Optics" })).toBeVisible(); // under Physics, open
  await expect(map.locator(".row", { hasText: "Mechanics" })).toHaveCount(0); // named by nobody: not a hub
  await request.post("/api/fs/trash?path=notes/fresh idea.md", { headers: H });

  // the areas: the top folders as tiles, each with its latest notes
  await put(request, "notes/map/Areas.md", "# Areas\n\n```view\ntype: home.areas\nareas: 8\n```\n");
  await openFile(page, "Areas.md");
  const areas = page.locator(".home-areas");
  await expect(areas.locator(".area", { hasText: "notes" }).first()).toBeVisible();
  await expect(areas.locator(".area .head", { hasText: /^\.atlas/ })).toHaveCount(0);
});

test("the log card's one button makes today's log from the template, then opens it", async ({ page, request }) => {
  const today = (await (await request.get("/api/today", { headers: H })).json()).log.path as string;
  await request.post(`/api/fs/trash?path=${today}`, { headers: H });
  await page.goto("/");
  const log = page.locator(".card", { has: page.getByRole("heading", { name: "Today's log" }) });
  await log.getByRole("button", { name: "Create today's log" }).click();
  await expect(page.locator(".cm-content")).toContainText("Properties"); // the template's properties, folded
  const made = await (await request.get(`/api/file?path=${encodeURIComponent(today)}`, { headers: H })).json();
  expect(made.text).toMatch(/^---\ndate: \d{4}-\d{2}-\d{2}/);
  // made once: the next call finds it
  const again = await (await request.post("/api/log/today", { headers: H })).json();
  expect(again).toEqual({ path: today, created: false });
});
