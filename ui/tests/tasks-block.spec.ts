import { test, expect, type APIRequestContext } from "@playwright/test";

// Tasks, Atlas's way (docs/guides/TASKS.md): a task's line is read for its fields (priority, due date,
// recurrence, tags — the Obsidian Tasks syntax, by shape), and a `task-list` block filters, sorts and
// groups. Ticking a recurring task leaves its next occurrence.
const H = { "x-atlas": "1" };
const put = (r: APIRequestContext, path: string, text: string) => r.put("/api/file", { headers: H, data: { path, text } });
const read = async (r: APIRequestContext, path: string) => ((await (await r.get(`/api/file?path=${encodeURIComponent(path)}`, { headers: H })).json()) as { text?: string }).text ?? "";
// the local date (the core groups by the local day; toISOString's UTC date is tomorrow's near midnight)
// calendar days, not 24-hour steps: across a clock change (the last Sunday of October) a step of 24 h landed on the
// day before near midnight
const day = (offset: number) => { const d = new Date(); d.setDate(d.getDate() + offset); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

test.beforeAll(async ({ request }) => {
  await put(request, "notes/chores.md", [
    "# Chores",
    "<!-- atlas:no-tasks -->", // kept out of Today's open tasks: the vault is shared by the specs, and Today shows only the first twelve
    "",
    `- [ ] water the plants 🔁 every week 📅 ${day(-1)} #home`,
    `- [ ] fix figure 2 ⏫ 📅 ${day(0)} #work/figures`,
    `- [ ] write the intro 🔼 📅 ${day(3)} #work`,
    "- [ ] buy dice #fun",
    `- [x] pay the rent 📅 ${day(-9)} ✅ ${day(-9)}`,
    `- [ ] book flights 🛫 ${day(20)} 📅 ${day(30)}`,
    "",
    "```view",
    "type: task-list",
    "group: due",
    "sort: [priority]",
    "```",
    "",
    "## Only the thesis",
    "",
    "```view",
    "type: task-list",
    "from: note",
    "tag: work",
    "sort: [priority, due]",
    "```",
    "",
    "end",
    "",
  ].join("\n"));
});

test("a task-list block groups by date, shows priority and recurrence, filters by tag; a recurring task ticked leaves its next", async ({ page, request }) => {
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await page.keyboard.press("Control+p");
  await page.keyboard.type("chores.md");
  await expect(page.getByTestId("palette").getByText("chores", { exact: true }).first()).toBeVisible();
  await page.keyboard.press("Enter");
  const blocks = page.locator(".cm-content .tasks");
  const first = blocks.nth(0);

  // grouped by date in the order of urgency; done and not-yet-started tasks are not shown
  await expect(first.locator(".head span:first-child")).toHaveText(["Overdue", "Today", "This week", "No date"]);
  await expect(first.locator(".task .title")).toHaveText(["water the plants #home", "fix figure 2 #work/figures", "write the intro #work", "buy dice #fun"]);
  const water = first.locator(".task", { hasText: "water the plants" });
  await expect(water.locator(".rec")).toHaveText("↻ week");
  await expect(water.locator(".date")).toHaveClass(/late/);
  await expect(first.locator('.task[data-priority="high"] .title')).toHaveText("fix figure 2 #work/figures");

  // the second block: this note's tasks tagged work (sub-tags included), the most important first
  await expect(blocks.nth(1).locator(".task .title")).toHaveText(["fix figure 2 #work/figures", "write the intro #work"]);

  // ticking the weekly task: done today, and next week's is there, still open
  await water.getByRole("checkbox").check();
  await expect.poll(() => read(request, "notes/chores.md")).toContain(`- [x] water the plants 🔁 every week 📅 ${day(-1)} #home ✅ ${day(0)}`);
  expect(await read(request, "notes/chores.md")).toContain(`- [ ] water the plants 🔁 every week 📅 ${day(6)} #home`);
  await expect(first.locator(".task", { hasText: "water the plants" }).locator(".date"), "the next one shows, in a week").not.toHaveClass(/late/);
});
