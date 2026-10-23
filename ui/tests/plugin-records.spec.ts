import { test, expect, type APIRequestContext, type Page } from "@playwright/test";
import { storedSecret } from "./fixtures/secrets";

// A `kind = "records"` setting (docs/guides/PLUGIN-API.md, "Settings"): a list of cards in the plugin's form —
// added, removed after a confirm, moved to the top (the main one), fields shown by `when` and folded by
// `group`, a secret per card, buttons that run the plugin's command with the card, and one under the list.
const H = { "x-atlas": "1" };
const put = (r: APIRequestContext, path: string, text: string) => r.put("/api/file", { headers: H, data: { path, text } });
const read = async (r: APIRequestContext, path: string) => ((await (await r.get(`/api/file?path=${encodeURIComponent(path)}`, { headers: H })).json()) as { text: string }).text;
// a secret's value never reaches a page: read where the core keeps it
const secret = async (_r: APIRequestContext, name: string) => storedSecret("crew", name);
const TOML = `# the crew, as cards
title = "Crew"

[permissions]
secrets = true

[[setting]]
key = "people"
label = "People"
kind = "records"
add = "Add person"
actions = [{ label = "Greet", command = "greet" }, { label = "Page", command = "page", when = { role = "pilot" } }]
list_actions = [{ label = "Import…", command = "import" }]
fields = [
  { key = "name", label = "Name", kind = "text" },
  { key = "role", label = "Role", kind = "choice", choices = ["cook", "pilot"], default = "cook" },
  { key = "pin", label = "PIN", kind = "secret", when = { role = "pilot" } },
  { key = "plane", label = "Plane", kind = "text", group = "Flying", when = { role = "pilot" } },
  { key = "hours", label = "Hours", kind = "number", group = "Flying", when = { role = "pilot" } },
]

[[setting]]
key = "motto"
label = "Motto"
kind = "text"
`;
const MAIN = `export function register(atlas) {
  const people = atlas.plugin.settings.people ?? [];
  atlas.shell.statusItem({ id: "crew", text: "crew: " + people.map((p) => p.name + (p.plane ? "/" + p.plane : "")).join(",") });
  atlas.registerCommand({ id: "settings", title: "Crew: settings", run: () => atlas.plugin.openSettings() });
  atlas.registerCommand({ id: "greet", title: "Crew: greet", run: (arg) => { window.__crewGreeted = arg; atlas.toast("Hello " + (arg?.record ?? "nobody")); } });
  atlas.registerCommand({ id: "import", title: "Crew: import", run: async (arg) => {
    await atlas.plugin.saveSettings({ people: [...atlas.plugin.settings.people, { name: "imported" }] });
    atlas.toast("Imported into " + arg?.setting);
  } });
}\n`;

test.beforeAll(async ({ request }) => {
  await put(request, ".atlas/plugins/crew/plugin.toml", TOML);
  await put(request, ".atlas/plugins/crew/main.js", MAIN);
});
test.afterAll(async ({ request }) => { await put(request, ".atlas/plugins/crew/main.js", "export function register() {}\n"); });

// after a save the plugin reloads (twice: the save, then the file watcher), so its command can be gone for a moment
async function openForm(page: Page) {
  const form = page.getByRole("form", { name: /Crew — settings/ });
  await expect(async () => {
    if (await page.getByTestId("palette").isVisible()) await page.keyboard.press("Escape");
    await page.keyboard.press("F1");
    await page.keyboard.type("Crew: settings");
    await expect(page.getByTestId("palette").getByText("Crew: settings", { exact: true }).first()).toBeVisible({ timeout: 1000 });
    await page.keyboard.press("Enter");
    await expect(form).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 10_000 });
  return form;
}

test("records are cards: add, when, group, a secret per card, make main, save", async ({ page, request }) => {
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  const cell = page.locator('.status [data-cell="crew:crew"]');
  await expect(cell).toHaveText("crew:");

  const form = await openForm(page);
  await form.getByRole("button", { name: "Add person" }).click();
  await expect(form.getByLabel("Name"), "a new card starts at its name").toBeFocused();
  await page.keyboard.type("ann");
  const ann = form.getByRole("group", { name: "ann" });
  await expect(ann.getByText("main", { exact: true })).toBeVisible();
  await expect(ann.getByLabel("PIN"), "a cook has no PIN: when role = pilot").toHaveCount(0);
  await expect(ann.getByText("Flying")).toHaveCount(0);
  await expect(ann.getByRole("button", { name: "Page" })).toHaveCount(0);

  await form.getByRole("button", { name: "Add person" }).click();
  await page.keyboard.type("bob");
  const bob = form.getByRole("group", { name: "bob" });
  await bob.getByLabel("Role").click();
  await bob.getByRole("option", { name: "pilot" }).click();
  await expect(bob.getByText(/Not set yet/)).toBeVisible();
  await bob.getByLabel("PIN").fill("1234");
  await expect(bob.locator("summary"), "a closed group says what is in it").toContainText("Flying Plane, Hours");
  await expect(bob.getByLabel("Plane")).toBeHidden();
  await bob.locator("summary").click();
  await bob.getByLabel("Plane").fill("B-17");
  await expect(bob.getByRole("button", { name: "Page" })).toBeVisible();
  await bob.getByRole("button", { name: "Make main" }).click();
  await expect(form.getByRole("group").first(), "moved to the top").toHaveAttribute("aria-label", "bob");
  await expect(bob.getByText("main", { exact: true })).toBeVisible();
  await form.getByRole("button", { name: "Save" }).click();
  await expect(form.getByRole("status")).toHaveCount(0); // saved: a page now, the save bar goes

  await expect(cell, "the plugin was reloaded with its cards, in their order").toHaveText("crew: bob/B-17,ann");
  // the cards are in the vault's settings file (2026-10-18: not in plugin.toml); the manifest keeps its schema only
  expect(await read(request, ".atlas/plugins/crew/plugin.toml")).toContain("# the crew, as cards");
  const text = await read(request, ".atlas/plugin-settings/crew.toml");
  expect(text.indexOf('name = "bob"')).toBeLessThan(text.indexOf('name = "ann"'));
  expect(text, "the cards as tables of the file").toMatch(/\[\[people\]\]/);
  expect(text, "a default is not written; a secret never is").not.toContain('role = "cook"');
  expect(text).not.toContain("1234");
  expect(await secret(request, "people.bob.pin"), "the card's secret, under its name").toBe("1234");

  // opened again: saved cards are named by their title, the name can be changed (2026-10-18), the secret says it is set
  const again = await openForm(page);
  const bob2 = again.getByRole("group", { name: "bob" });
  await expect(bob2.getByLabel("Name")).toHaveValue("bob");
  await expect(bob2.getByText(/Set\. Type to replace it/)).toBeVisible();
  await expect(bob2.getByLabel("PIN")).toHaveValue("");
  // a card's button saves the form, then runs the plugin's command with the card
  await bob2.getByRole("button", { name: "Greet" }).click();
  await expect(page.getByText("Hello bob")).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { __crewGreeted: unknown }).__crewGreeted)).toEqual({ setting: "people", record: "bob" });

  // renamed ("the name of the accounts cannot be changed"): the card's secret follows it, nothing is forgotten
  const form3 = await openForm(page);
  await form3.getByRole("group", { name: "bob" }).getByLabel("Name").fill("robert");
  await form3.getByRole("button", { name: "Save" }).click();
  await expect(form3.getByRole("status")).toHaveCount(0); // saved: a page now, the save bar goes
  await expect.poll(() => secret(request, "people.robert.pin")).toBe("1234");
  expect(await secret(request, "people.bob.pin")).toBeNull();
});

test("removing a card asks first and forgets its secrets; the button under the list runs the plugin's command", async ({ page, request }) => {
  await request.put("/api/plugins/crew/settings", { headers: H, data: { people: [{ name: "bob", role: "pilot", pin: "4321" }, { name: "ann" }] } });
  expect(await secret(request, "people.bob.pin")).toBe("4321");
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  const form = await openForm(page);
  const bob = form.getByRole("group", { name: "bob" });
  await bob.getByRole("button", { name: "Remove bob" }).click();
  await expect(bob.getByRole("alert")).toContainText("Its secrets are forgotten when the form is saved");
  await bob.getByRole("button", { name: "Keep" }).click();
  await expect(bob).toBeVisible();
  await bob.getByRole("button", { name: "Remove bob" }).click();
  await bob.getByRole("button", { name: "Remove", exact: true }).click();
  await expect(form.getByRole("group", { name: "bob" })).toHaveCount(0);
  await expect(form.getByRole("group", { name: "ann" }).getByText("main", { exact: true }), "the next one is the main one now").toBeVisible();
  await form.getByRole("button", { name: "Save" }).click();
  await expect(form.getByRole("status")).toHaveCount(0); // saved: a page now, the save bar goes
  await expect.poll(() => secret(request, "people.bob.pin")).toBeNull();

  const again = await openForm(page);
  await again.getByRole("button", { name: "Import…" }).click();
  await expect(page.getByText("Imported into people")).toBeVisible();
  await expect(page.locator('.status [data-cell="crew:crew"]')).toHaveText("crew: ann,imported");
});
