import { test, expect, type Page } from "@playwright/test";

function trackErrors(page: Page): string[] {
  const errs: string[] = [];
  page.on("pageerror", (e) => errs.push(e.message));
  page.on("console", (m) => m.type() === "error" && errs.push(m.text()));
  return errs;
}

test("Today shows focus (comments hidden), tasks and the capture box", async ({ page }) => {
  const errs = trackErrors(page);
  await page.goto("/");
  await expect(page.getByText("Finish the GW notes.")).toBeVisible();
  await expect(page.getByText("author note")).toHaveCount(0);
  await expect(page.getByPlaceholder(/Capture/)).toBeFocused();
  // the list shows the first dozen; other tests leave tasks in the shared vault, so the fixture's may be past them
  const all = page.getByRole("button", { name: /^Show all \d+$/ });
  if (await all.count()) await all.first().click();
  await expect(page.getByText("check the sign of t")).toBeVisible();
  expect(errs).toEqual([]);
});

test("palette opens a note in the editor", async ({ page }) => {
  const errs = trackErrors(page);
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await page.keyboard.press("Meta+e");
  const palette = page.getByTestId("palette");
  await expect(palette).toBeVisible();
  // the note by its path: late in a run the test vault holds other things named after Hubbard (a library's items)
  await page.keyboard.type("notes/hubbard");
  await expect(palette.getByText("hubbard", { exact: true }).first()).toBeVisible(); // file list loads async
  await page.keyboard.press("Enter");
  await expect(page.locator(".cm-editor")).toBeVisible();
  await expect(page.locator(".cm-content")).toContainText("Hubbard");
  await page.screenshot({ path: "test-results/editor.png" });
  expect(errs).toEqual([]);
});

test("editor selection reaches /api/ui/state (what atlas_context returns)", async ({ page, request }) => {
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await page.keyboard.press("Meta+e");
  await page.keyboard.type("notes/hubbard"); // by its path, as above
  await expect(page.getByTestId("palette").getByText("hubbard", { exact: true }).first()).toBeVisible();
  await page.keyboard.press("Enter");
  const line = page.locator(".cm-line", { hasText: "check the sign" });
  await line.click();
  await page.keyboard.press("Home");
  await page.keyboard.press("Shift+End");
  await expect.poll(async () => {
    const s = await (await request.get("/api/ui/state", { headers: { "x-atlas": "1" } })).json();
    return { active: s.active, path: s.selection?.path, line: s.selection?.from_line, text: s.selection?.text };
  }).toMatchObject({ active: { kind: "editor", path: "notes/hubbard.md" }, path: "notes/hubbard.md", line: 5, text: expect.stringContaining("check the sign") });
});

test("Today activity separates your commits, Claude's, and housekeeping", async ({ page }) => {
  await page.goto("/");
  // the commits are the activity's third tab since 636b421 (Created, Changed, Commits)
  await page.getByRole("tablist", { name: "Activity" }).getByRole("tab", { name: /^Commits/ }).click();
  await expect(page.getByText("My own hubbard note")).toBeVisible();
  await expect(page.getByText("Claude adds a note")).toBeVisible();
  await expect(page.getByText(/\+ 1 housekeeping commit/)).toBeVisible();
  await page.getByText("My own hubbard note").click();
  await expect(page.locator(".commit-pane h1")).toHaveText("My own hubbard note");
  await expect(page.locator(".commit-pane .badge").first()).toHaveText("You");
  await expect(page.locator(".commit-pane .l.add").first()).toBeVisible();
});

test("Settings is generated from the schema and saves to config.toml", async ({ page, request }) => {
  const cfg = async () => (await (await request.get("/api/config", { headers: { "x-atlas": "1" } })).json()).config;
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor(); // the keymap is attached once the app is up (was flaky)
  await page.keyboard.press("Meta+,");
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
  await page.getByRole("navigation", { name: "Settings pages" }).getByRole("button", { name: "Terminal & agents" }).click();
  await expect(page.getByText("Where the terminal panel docks")).toBeVisible();
  // a two-way choice is a segmented control
  const pos = page.locator('[id="terminal.position"]');
  await pos.getByRole("radio", { name: "Right" }).click();
  await expect.poll(async () => (await cfg()).terminal.position).toBe("right");
  await expect(page.locator('.row[data-path="terminal.position"]')).toContainText("modified");
  await page.locator('.row[data-path="terminal.position"]').getByRole("button", { name: /reset to bottom/ }).click();
  await expect.poll(async () => (await cfg()).terminal.position).toBe("bottom");
  await expect(page.locator('.row[data-path="terminal.position"]')).not.toContainText("modified");
  // the themed dropdown (no native <select>) for longer lists: keyboard picks
  await page.getByRole("navigation", { name: "Settings pages" }).getByRole("button", { name: "Writing" }).click();
  await page.locator('[id="editor.date_names"]').waitFor();
  await page.getByPlaceholder("Search settings…").fill("housekeeping");
  await expect(page.getByText("Show housekeeping commits", { exact: false })).toBeVisible();
  await expect(page.getByText("Where the terminal panel docks")).toHaveCount(0);
});

test("Git pane shows changes, opens a diff, lists history", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("Meta+g");
  const git = page.locator(".side-pane.git");
  await expect(git.getByText("hubbard", { exact: true })).toBeVisible();
  await git.getByText("hubbard", { exact: true }).click();
  await expect(page.locator(".diff-pane .l.add", { hasText: "An uncommitted line." })).toBeVisible();
  await expect(git.getByText("Claude adds a note")).toBeVisible();
  await expect(git.getByText(/^history$/)).toHaveCount(0); // housekeeping hidden by default
});

test("terminal panel hides and comes back without restarting", async ({ page }) => {
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await page.keyboard.press("Meta+j");
  const term = page.locator(".xterm").first();
  await expect(term).toBeVisible();
  await term.locator(".xterm-rows").getByText(/\S/).first().waitFor(); // the shell printed its prompt
  const height = async () => (await term.boundingBox())?.height ?? 0;
  await page.keyboard.press("Meta+j");
  await expect(term).toBeHidden(); // collapsed group + content hidden (no strip peeking through)
  await page.keyboard.press("Meta+j");
  await expect.poll(height).toBeGreaterThan(100);
  await expect(page.getByText("process exited")).toHaveCount(0); // same PTY, not restarted
});

test("two quick setting toggles both land (writes are queued, not raced)", async ({ page, request }) => {
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  const vim = async () => (await (await request.get("/api/config", { headers: { "x-atlas": "1" } })).json()).config.vim;
  const before = await vim();
  await page.getByTestId("vim-mode").click();
  await page.getByTestId("vim-mode").click(); // immediately: the first save is still in flight
  await page.waitForTimeout(800);
  expect(await vim()).toBe(before);
});

test("search options: match case, whole word, regex", async ({ page }) => {
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await page.keyboard.press("Control+Shift+F");
  const pane = page.locator(".search-pane");
  await pane.getByLabel("Search", { exact: true }).fill("energy");
  await expect(pane.locator(".line-hit").first()).toBeVisible();
  const any = await pane.locator(".line-hit").count();
  await pane.getByLabel("Match case").click(); // "Energy" in hubbard.md no longer matches
  await expect.poll(() => pane.locator(".line-hit").count()).toBeLessThan(any);
  await pane.getByLabel("Match case").click();
  await pane.getByLabel("Regular expression").click();
  await pane.getByLabel("Search", { exact: true }).fill("E_kin\\s");
  await expect(pane.locator(".line-hit").first()).toBeVisible();
});
