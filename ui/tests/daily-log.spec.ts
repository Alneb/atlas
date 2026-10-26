import { test, expect, type APIRequestContext } from "@playwright/test";
import { readFileSync } from "node:fs";
import { shownName } from "../src/lib/paths";

// A day's log, made pretty: the Daily plugin's header block — the day in words, the
// weather the Weather plugin noted, how much was captured, the days around it — and each line's time as a chip.
const H = { "x-atlas": "1" };
const put = (request: APIRequestContext, path: string, text: string) => request.put("/api/file", { headers: H, data: { path, text } });
const dir = "../../plugins/beta/daily";

test.beforeAll(async ({ request }) => {
  await put(request, ".atlas/plugins/daily/plugin.toml", readFileSync(new URL(`${dir}/plugin.toml`, import.meta.url), "utf8"));
  await put(request, ".atlas/plugins/daily/main.js", readFileSync(new URL(`${dir}/main.js`, import.meta.url), "utf8"));
  await put(request, "notes/daily-tasks.md", "# Tasks\n\n- [ ] send the draft 📅 2020-01-02\n- [x] book the room ✅ 2020-01-02\n- [ ] later 📅 2020-02-01\n");
  await put(request, "log/2020-01-01.md", "---\ndate: 2020-01-01\ntype: log\n---\n# Wednesday, 1 January 2020\n\n## Log\n- 08:00 a first day\n");
  await put(request, "log/2020-01-02.md", "---\ndate: 2020-01-02\ntype: log\nweather: ⛅ Partly cloudy, 3°C · Oslo\n---\n# Thursday, 2 January 2020\n\n```view\ntype: daily.header\n```\n\n## Journal\n\n## Log\n- 09:05 coffee and the Hubbard notes\n- [ ] 10:30 call the lab\n");
});
test.afterAll(async ({ request }) => {
  for (const d of ["01", "02"]) await request.post(`/api/fs/trash?path=log/2020-01-${d}.md`, { headers: H });
  await request.post("/api/fs/trash?path=notes/daily-tasks.md", { headers: H });
});

test("a day's log opens with its day in words, its weather, its entries and the days around it; times are chips", async ({ page }) => {
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await page.keyboard.press("Control+p");
  await page.keyboard.type("2020-01-02");
  await expect(page.getByTestId("palette").getByText(shownName("2020-01-02.md"), { exact: true }).first()).toBeVisible();
  await page.keyboard.press("Enter");
  const head = page.locator(".daily-head");
  await expect(head.locator(".day")).toHaveText(/thursday|jeudi|jueves/i);
  await expect(head.locator(".sub")).toContainText("Partly cloudy, 3°C · Oslo");
  await expect(head.locator(".sky")).toHaveText("⛅");
  await expect(head.locator(".sub")).toContainText("2 entries");
  // that day's tasks, live: due then, done then (no calendar plugin here: no Calendar line)
  await expect(head.locator(".facts")).toContainText(/Due\s*send the draft/);
  await expect(head.locator(".facts")).toContainText(/Done\s*book the room/);
  await expect(head.locator(".facts")).not.toContainText("later");
  await expect(head.locator(".facts")).not.toContainText("Calendar");
  await expect(head.getByRole("button", { name: "←" })).toBeEnabled();
  await expect(head.getByRole("button", { name: "→" })).toHaveAttribute("title", "2026-01-02"); // the next day with a log, not tomorrow
  await expect(page.locator(".cm-log-time")).toHaveText(["09:05", "10:30"]);
  await head.getByRole("button", { name: "←" }).click();
  await expect(page.locator(".dv-tab.dv-active-tab")).toContainText("2020-01-01");
});
