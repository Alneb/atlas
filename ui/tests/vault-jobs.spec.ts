import { test, expect } from "@playwright/test";

// Settings → Vaults & sync lists, under each vault, its scheduled jobs and where each runs (core schedule.rs
// `where_jobs`, by the scheduler's own rules): a vault on no server runs everything here, even a `background = "server"` job.
const H = { "x-atlas": "1" };

test("Vaults & sync lists the vault's scheduled jobs and where each runs", async ({ page, request }) => {
  await request.put("/api/file", { headers: H, data: { path: ".atlas/commands/stamp.toml", text: 'title = "Stamp the log"\nrun = "true"\nschedule = "every 2h"\n' } });
  await request.put("/api/file", { headers: H, data: { path: ".atlas/commands/feed.toml", text: 'title = "Poll the feed"\nrun = "true"\nschedule = "daily 03:00"\nbackground = "server"\n' } });
  const jobs = await (await request.get("/api/schedules", { headers: H })).json();
  const mine = jobs.filter((j: { id: string }) => j.id === "stamp" || j.id === "feed");
  expect(mine.map((j: { place: string }) => j.place)).toEqual(["here", "here"]);
  // the test's vault list may be empty: answer it with this vault on it, as a desktop's list has it
  await page.route("**/api/vaults", async (r) => {
    const res = await r.fetch();
    const l = await res.json();
    if (!l.vaults.some((v: { path: string }) => v.path === l.current)) l.vaults.push({ name: "Test vault", path: l.current, always_on: true });
    await r.fulfill({ response: res, json: l });
  });
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await page.keyboard.press("Meta+,");
  await page.getByRole("navigation", { name: "Settings pages" }).getByRole("button", { name: "Vaults & sync" }).click();
  const list = page.getByTestId("vault-jobs").first();
  await expect(list.locator("summary")).toContainText("here");
  await list.locator("summary").click();
  await expect(list.getByTestId("vault-job").filter({ hasText: "Poll the feed" })).toContainText("daily 03:00");
  await expect(list.getByTestId("vault-job").filter({ hasText: "Stamp the log" })).toHaveAttribute("data-place", "here");
});
