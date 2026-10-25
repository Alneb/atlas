import { test, expect, type Page } from "@playwright/test";

// Templates that apply by themselves (docs/design/DESIGN-templates-automation.md): a property set in a note merges the
// template whose `apply_when:` names it (only what the note lacks; Ctrl+Z undoes it), "Insert template…" puts a
// template at the caret, and Settings → Writing lists each template with its rules in words.
const H = { "x-atlas": "1" };
const MOVIE = "---\ntemplate_title: Film\napply_when:\n  - property: { kind: movie }\nkind: movie\ndirector:\nrating:\n---\n## Review\n";

/** Open `path`, the properties in the side panel (the served settings only). */
async function openNote(page: Page, name: string) {
  await page.route("**/api/config", async (route) => {
    if (route.request().method() !== "GET") return route.continue();
    const res = await route.fetch(), body = await res.json();
    body.config.editor.properties = "panel";
    await route.fulfill({ response: res, json: body });
  });
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await page.keyboard.press("Control+p");
  await page.keyboard.type(name);
  await expect(page.getByTestId("palette").getByText(name, { exact: true }).first()).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page.locator(".cm-content")).toBeVisible();
}
const read = async (page: Page, path: string) => ((await (await page.request.get(`/api/file?path=${encodeURIComponent(path)}`, { headers: H })).json()) as { text: string }).text;
const put = (page: Page, body: Record<string, unknown>) => page.request.put("/api/file", { headers: H, data: body }).then((r) => r.json());

test("a property set to a template's value: an editor gets the merged text, any other writer has it written", async ({ page, request }) => {
  await request.put("/api/file", { headers: H, data: { path: "templates/movie.md", text: MOVIE } });
  await request.put("/api/file", { headers: H, data: { path: "notes/Ran.md", text: "---\nkind: idea\n---\nSeen.\n" } });
  const merged = "---\nkind: movie\ndirector:\nrating:\n---\nSeen.\n\n## Review\n";
  // an editor's save: the file as sent, the merge answered for it to apply
  const r1 = await put(page, { path: "notes/Ran.md", text: "---\nkind: movie\n---\nSeen.\n", apply_here: true });
  expect(r1.template).toMatchObject({ template: "movie", text: merged });
  expect(await read(page, "notes/Ran.md")).toBe("---\nkind: movie\n---\nSeen.\n");
  // saved again unchanged: nothing more
  expect((await put(page, { path: "notes/Ran.md", text: "---\nkind: movie\n---\nSeen.\n", apply_here: true })).template).toBeUndefined();
  // a plugin's or an agent's save: written by the core
  await request.put("/api/file", { headers: H, data: { path: "notes/Ran.md", text: "---\nkind: idea\n---\nSeen.\n" } });
  const r2 = await put(page, { path: "notes/Ran.md", text: "---\nkind: movie\n---\nSeen.\n" });
  expect(r2.template).toMatchObject({ template: "movie", added: ["director", "rating", "## Review"] });
  expect(await read(page, "notes/Ran.md")).toBe(merged);
});

test("in the editor: the property set in the panel brings the template's missing parts; its notice undoes them", async ({ page, request }) => {
  await request.put("/api/file", { headers: H, data: { path: "templates/movie.md", text: MOVIE } });
  await request.put("/api/file", { headers: H, data: { path: "notes/Heat.md", text: "---\nkind: idea\n---\nSeen last night.\n" } });
  await openNote(page, "Heat");
  const field = page.getByTestId("properties-panel").getByLabel("kind: text");
  await field.fill("movie");
  await field.press("Enter");
  await expect.poll(() => read(page, "notes/Heat.md"), { timeout: 10000 }).toBe("---\nkind: movie\ndirector:\nrating:\n---\nSeen last night.\n\n## Review\n");
  await page.getByText("Template “movie” applied").click(); // the notice's click undoes it
  await expect.poll(() => read(page, "notes/Heat.md"), { timeout: 10000 }).toBe("---\nkind: movie\n---\nSeen last night.\n");
});

test("Insert template… merges the template's properties and puts its body at the caret", async ({ page, request }) => {
  await request.put("/api/file", { headers: H, data: { path: "templates/checklist.md", text: "---\ntemplate_title: Checklist\ntags: [todo]\n---\n- [ ] first\n- [ ] second\n" } });
  await request.put("/api/file", { headers: H, data: { path: "notes/Trip.md", text: "---\ntags: [travel]\n---\nBefore leaving:\n\nAfter.\n" } });
  await openNote(page, "Trip");
  const line = page.locator(".cm-content").getByText("Before leaving:");
  await line.click();
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await line.click({ button: "right" });
  await page.getByRole("menuitem", { name: "Insert template…" }).click();
  await page.getByTestId("palette").getByText("Checklist", { exact: true }).click();
  await expect.poll(() => read(page, "notes/Trip.md"), { timeout: 10000 }).toContain("- [ ] first");
  const text = await read(page, "notes/Trip.md");
  expect(text).toMatch(/^---\ntags:\n {2}- travel\n {2}- todo\n---\n/);
  expect(text).toContain("- [ ] first\n- [ ] second\n");
  expect(text.indexOf("- [ ] first")).toBeLessThan(text.indexOf("After."));
});

test("Settings → Writing lists each template with when it applies, and previews what it makes", async ({ page, request }) => {
  await request.put("/api/file", { headers: H, data: { path: "templates/movie.md", text: MOVIE } });
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await page.keyboard.press("Meta+,");
  await page.getByRole("navigation", { name: "Settings pages" }).getByRole("button", { name: "Writing" }).click();
  const card = page.locator(".tpl", { hasText: "Film" });
  await expect(card).toContainText("a note whose kind becomes movie (its own rule)");
  await card.getByRole("button", { name: "preview" }).click();
  await expect(card.locator(".preview")).toContainText("## Review");
  await expect(card.locator(".preview")).not.toContainText("apply_when");
});
