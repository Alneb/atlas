import { test, expect, type Page } from "@playwright/test";
import { shownName } from "../src/lib/paths";

// A note's properties (`[editor] properties`): hidden by default behind one faint line, shown in the
// note as Obsidian does, or edited in a panel at the right of the note with a control per kind (the
// vault's spec, templates/properties.yaml in the fixture). The user: "hide the properties by default,
// and add an option in settings to show them in a right panel, and to edit them visually".
const H = { "x-atlas": "1" };
type Mode = "hidden" | "inline" | "panel";
const PANEL = "---\n# a comment that stays\ndate: 2026-10-01 09:00\ntype: Talk\ntags:\n  - physics\nrating: 3\nsomething_else: kept as it is\n---\n# Panel\n\nThe body, untouched by the panel.\n";
const text = (page: Page) => page.evaluate(() => (window as unknown as { __atlas: { editor(): { text: string } | null } }).__atlas.editor()?.text ?? "");
const read = async (page: Page, path: string) => ((await (await page.request.get(`/api/file?path=${encodeURIComponent(path)}`, { headers: H })).json()) as { text: string }).text;

/** Open `path` with the properties shown as `mode` (the served settings only; config.toml is not touched). */
async function note(page: Page, path: string, mode?: Mode) {
  if (mode) {
    await page.route("**/api/config", async (route) => {
      if (route.request().method() !== "GET") return route.continue();
      const res = await route.fetch(), body = await res.json();
      body.config.editor.properties = mode;
      await route.fulfill({ response: res, json: body });
    });
  }
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await page.keyboard.press("Control+p");
  await page.keyboard.type(path.split("/").pop()!);
  await expect(page.getByTestId("palette").getByText(shownName(path)).first()).toBeVisible();
  await page.keyboard.press("Enter");
  const ed = page.locator(".dv-active-group .cm-editor").first();
  await ed.waitFor();
  return ed;
}

test("by default a note's properties are hidden behind one line that opens the panel on a click", async ({ page }) => {
  const before = await read(page, "props/hidden.md");
  const ed = await note(page, "props/hidden.md");
  const chip = ed.locator(".cm-properties");
  await expect(chip).toBeVisible();
  await expect(chip).toContainText("Properties");
  await expect(chip.locator(".cm-properties-n")).toHaveText("3");
  await expect(ed.locator(".note-properties")).toHaveCount(0);
  await expect(page.getByTestId("properties-panel")).toHaveCount(0);
  await expect(ed.locator(".cm-content")).not.toContainText("physics");
  await expect(ed.locator(".cm-content")).toContainText("The body.");
  // "properties only render as text not rich text … move them to a right panel and hide them by default" (2026-10-15):
  // the line opens the panel with its controls, the caret stays out of the YAML
  await chip.click();
  const panel = page.getByTestId("properties-panel");
  await expect(panel).toBeVisible();
  await expect(panel).toContainText("Concept");
  await expect(ed.locator(".cm-content")).not.toContainText("type: Concept");
  // the YAML is one button away; the panel's × hides it, and it stays hidden on the next note
  await panel.getByRole("button", { name: "Edit as text" }).click();
  await expect(ed.locator(".cm-content")).toContainText("type: Concept");
  await panel.getByRole("button", { name: "Hide properties" }).click();
  await expect(panel).toHaveCount(0);
  expect(await read(page, "props/hidden.md"), "hidden is a look: the file keeps its frontmatter").toBe(before);
});

test("inline: the properties are a table in the note, with the spec's kinds", async ({ page }) => {
  const ed = await note(page, "props/hidden.md", "inline");
  const props = ed.locator(".note-properties");
  await expect(props.locator(".prop-row")).toHaveCount(3);
  await expect(props.locator(".prop-key", { hasText: "date" })).toBeVisible();
  await expect(props.locator(".prop-value.prop-datetime")).toContainText("2026-10-01 09:00");
  await expect(props.locator(".prop-value.prop-enum")).toContainText("Concept");
  await expect(ed.locator(".cm-properties")).toHaveCount(0);
  await expect(page.getByTestId("properties-panel")).toHaveCount(0);
});

test("panel: a date, a tag and a link are edited with controls; only the frontmatter changes, and undo is the editor's", async ({ page, request }) => {
  // written here, not only in the fixture: a rerun (or --repeat-each) starts from the same note
  await request.put("/api/file", { headers: H, data: { path: "props/panel.md", text: PANEL } });
  const ed = await note(page, "props/panel.md", "panel");
  const panel = page.getByTestId("properties-panel");
  await expect(panel).toBeVisible();
  await expect(ed.locator(".cm-properties"), "the note itself shows the folded line").toBeVisible();
  // five keys in file order, then the one its type (Talk) requires and lacks
  await expect(panel.locator(".row")).toHaveCount(6);
  await expect(panel.locator(".row").first()).toHaveAttribute("data-key", "date");
  await expect(panel.locator('.row.missing[data-key="topics"]')).toContainText("required by Talk");
  await expect(panel.locator('.row[data-key="type"]')).toContainText("Talk");
  await expect(panel.locator('[data-key="something_else"] input')).toHaveValue("kept as it is");

  // a date and time, written back in the spec's format
  const date = panel.getByLabel("date: datetime");
  await expect(date).toHaveValue("2026-10-01T09:00");
  await date.fill("2026-10-14T10:30");
  await expect.poll(() => text(page)).toContain("date: 2026-10-14 10:30\n");

  // a tag added to the list
  const tags = panel.locator('[data-key="tags"] input');
  await tags.fill("rg");
  await tags.press("Enter");
  await expect(panel.locator('[data-key="tags"] .pill')).toHaveCount(2);
  await expect.poll(() => text(page)).toContain("tags:\n  - physics\n  - rg\n");

  // the missing link list filled: a bare name becomes a wikilink, added at the end
  const topics = panel.locator('[data-key="topics"] input');
  // the vault's notes are offered while typing (the core's [[ ranking)
  await topics.fill("hubb");
  const offered = panel.locator('[data-key="topics"] [role="option"]');
  await expect(offered.filter({ hasText: "hubbard" })).toHaveCount(1);
  await expect(offered.first().locator(".detail")).not.toBeEmpty(); // the folder it is in, beside its name
  await topics.press("Escape"); // closed: Enter is the typed text's again
  await topics.fill("Optics");
  await topics.press("Enter");
  await expect(panel.locator('[data-key="topics"] .pill')).toHaveText(["Optics"]);
  await expect(panel.locator('.row.missing[data-key="topics"]')).toHaveCount(0);

  // the file after the autosave: the comment, the order, the unknown key and the body as they were
  const expected = "---\n# a comment that stays\ndate: 2026-10-14 10:30\ntype: Talk\ntags:\n  - physics\n  - rg\nrating: 3\nsomething_else: kept as it is\ntopics:\n  - '[[Optics]]'\n---\n# Panel\n\nThe body, untouched by the panel.\n";
  await expect.poll(() => read(page, "props/panel.md"), { timeout: 5000 }).toBe(expected);

  // the panel's edits are the editor's: vim's `u` takes the last one back, and the panel follows
  await ed.getByText("The body, untouched by the panel.").click();
  await page.keyboard.press("Escape");
  await page.keyboard.press("u");
  await expect.poll(() => text(page)).not.toContain("[[Optics]]");
  await expect(panel.locator('.row.missing[data-key="topics"]')).toBeVisible();
});

test("panel: a choice, a number and removing a property", async ({ page, request }) => {
  await request.put("/api/file", { headers: H, data: { path: "props/choice.md", text: "---\ntype: Concept\nrating: 2\ndone: false\n---\nBody.\n" } });
  await note(page, "props/choice.md", "panel");
  const panel = page.getByTestId("properties-panel");
  await panel.getByLabel("type: enum").click();
  await page.getByRole("option", { name: "Talk" }).click();
  await expect.poll(() => text(page)).toContain("type: Talk\n");
  const rating = panel.getByLabel("rating: number");
  await rating.fill("4.5");
  await rating.press("Enter");
  await expect.poll(() => text(page)).toContain("rating: 4.5\n");
  await panel.getByLabel("done: bool").check();
  await expect.poll(() => text(page)).toContain("done: true\n");
  await panel.locator('[data-key="done"]').hover();
  await panel.getByRole("button", { name: "Remove done" }).click();
  await expect.poll(() => text(page)).toBe("---\ntype: Talk\nrating: 4.5\n---\nBody.\n");
  // a new property from the spec, by name
  await panel.getByLabel("Add a property").fill("tags");
  await panel.getByLabel("Add a property").press("Enter");
  await expect(panel.locator('.row[data-key="tags"]')).toBeVisible();
  await expect.poll(() => text(page)).toContain("tags:\n---");
});

test("panel: a property renamed in place keeps its value and its place; a name already used is refused", async ({ page, request }) => {
  await request.put("/api/file", { headers: H, data: { path: "props/rename.md", text: "---\nauthor: Ana\nrating: 2\n---\nBody.\n" } });
  await note(page, "props/rename.md", "panel");
  const panel = page.getByTestId("properties-panel");
  await panel.locator('[data-key="author"] .name').dblclick();
  const field = panel.getByLabel("New name for author");
  await field.fill("speaker");
  await field.press("Enter");
  await expect.poll(() => text(page)).toBe("---\nspeaker: Ana\nrating: 2\n---\nBody.\n");
  // Escape leaves it; a taken name is refused with a word
  await panel.locator('[data-key="rating"] .name').dblclick();
  await panel.getByLabel("New name for rating").press("Escape");
  await panel.locator('[data-key="rating"] .name').dblclick();
  await panel.getByLabel("New name for rating").fill("speaker");
  await panel.getByLabel("New name for rating").press("Enter");
  await expect(page.getByText("“speaker” is already a property")).toBeVisible();
  expect(await text(page)).toBe("---\nspeaker: Ana\nrating: 2\n---\nBody.\n");
});

// Completion from the vault and following what a property points at ("links in properties, and files
// in properties should be clickable").
test("panel: known names and values are offered, [[ offers notes, an address and a file open", async ({ page, request }) => {
  await request.put("/api/file", { headers: H, data: { path: "props/known-a.md", text: "---\nmood: calm\nvenue: Harbour Hall\n---\nA.\n" } });
  await request.put("/api/file", { headers: H, data: { path: "props/known-b.md", text: "---\nmood: calm\n---\nB.\n" } });
  await request.put("/api/file", { headers: H, data: { path: "props/known-c.md", text: "---\nmood: tense\nsource: https://example.org/x\nwhere: \"\"\n---\nC.\n" } });
  await note(page, "props/known-c.md", "panel");
  const panel = page.getByTestId("properties-panel");
  const options = (id: string) => panel.locator(`datalist#${id} option`).evaluateAll((os) => os.map((o) => (o as HTMLOptionElement).value));
  const offered = (key: string) => panel.locator(`[data-key="${key}"] [role="option"] .label`).allInnerTexts();
  // a new property: the names the vault's notes use (venue is only in another note)
  await expect.poll(() => options("prop-keys")).toContain("venue");
  // a value: the property's known values, the commonest first
  const mood = panel.getByLabel("mood: text");
  await mood.fill("");
  await expect.poll(() => offered("mood")).toEqual(expect.arrayContaining(["calm"]));
  // [[ in a text value: the vault's notes, taken with ↓ and Enter
  await mood.fill("see [[hubb");
  await expect.poll(() => offered("mood")).toContain("hubbard");
  await mood.press("ArrowDown");
  await mood.press("Enter");
  await expect(mood).toHaveValue("see [[hubbard]]");
  await mood.press("Escape");
  // an address is followed in the browser
  const popup = page.waitForEvent("popup");
  await panel.getByRole("button", { name: "Open source: text" }).click();
  expect((await popup).url()).toContain("example.org/x");
});
