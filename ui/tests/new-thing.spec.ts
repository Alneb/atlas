import { test, expect, type APIRequestContext, type Page } from "@playwright/test";

// New… (lib/new-thing.ts, — the phone's +): a blank note, a note per template, a drawing, and the kinds
// plugins add with atlas.registerNew, each placing what it makes itself.
const H = { "x-atlas": "1" };
const put = (r: APIRequestContext, path: string, text: string) => r.put("/api/file", { headers: H, data: { path, text } });
const MAIN = `export function register(atlas) {
  atlas.registerNew({ id: "meeting", title: "Meeting note", detail: "in meetings/", run: async () => {
    await atlas.createFile("meetings/standup.md", "# Standup\\n");
    atlas.open("meetings/standup.md");
  } });
}\n`;

test.beforeAll(async ({ request }) => {
  await put(request, ".atlas/plugins/newkind/plugin.toml", 'title = "Meetings"\n');
  await put(request, ".atlas/plugins/newkind/main.js", MAIN);
});
test.afterAll(async ({ request }) => { await put(request, ".atlas/plugins/newkind/main.js", "export function register() {}\n"); });

async function newThing(page: Page) {
  await page.keyboard.press("F1");
  await page.keyboard.type("New… (a note");
  await page.getByTestId("palette").getByText(/^New… \(a note/).first().click();
  await expect(page.getByTestId("palette").getByText("Drawing", { exact: true })).toBeVisible();
}

test("New…: the kinds listed, a plugin's kind makes its file where it belongs, a blank note is named and made", async ({ page, request }) => {
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await newThing(page);
  const palette = page.getByTestId("palette");
  await expect(palette.getByText("Note", { exact: true })).toBeVisible();
  await expect(palette.getByText("Meeting note", { exact: true })).toBeVisible();
  await palette.getByText("Meeting note", { exact: true }).click();
  await expect(page.locator(".cm-content").getByText("Standup")).toBeVisible();
  expect((await (await request.get("/api/file?path=meetings/standup.md", { headers: H })).json()).text).toBe("# Standup\n");

  await newThing(page);
  await palette.getByText("Note", { exact: true }).click();
  await page.keyboard.type("Placed by New");
  await page.keyboard.press("Enter");
  await expect(page.locator(".tab, [role=option]").getByText(/Placed by New/).first()).toBeVisible();
});

// A template names itself for the lists (`template_title:`, not copied into its notes), and the vault's default
// template is not offered: a plain note is made from it.
test("New…: a template's own title is shown, the default template is not, and a plain note has its properties", async ({ page, request }) => {
  await put(request, "templates/default.md", "---\ndate: {{now}}\ntype: Note\n---\n");
  await put(request, "templates/12_movie.md", "---\ntemplate_title: Film\ntype: movie\n---\n");
  try {
    await page.goto("/");
    await page.getByText("Finish the GW notes.").waitFor();
    await newThing(page);
    const palette = page.getByTestId("palette");
    await expect(palette.getByText("Film", { exact: true })).toBeVisible();
    await expect(palette.getByText("Default note", { exact: true })).toHaveCount(0);
    await palette.getByText("Note", { exact: true }).click();
    await page.keyboard.type("Has properties");
    await page.keyboard.press("Enter");
    await expect.poll(async () => (await (await request.get("/api/file?path=notes/Has properties.md", { headers: H })).json()).text ?? "").toMatch(/^---\ndate: \d{4}-\d\d-\d\d \d\d:\d\d\ntype: Note\n---\n/);
    await palette.isVisible();
  } finally {
    const { rmSync } = await import("node:fs");
    const { join } = await import("node:path");
    const { WS } = await import("../playwright.config");
    for (const f of ["templates/default.md", "templates/12_movie.md", "notes/Has properties.md"]) rmSync(join(WS, f), { force: true });
  }
});
