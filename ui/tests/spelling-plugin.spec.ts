import { test, expect, type APIRequestContext } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";
import { openFile } from "./open";

// The Spelling plugin (plugins/beta/spelling): a word neither the machine's Hunspell dictionary nor the vault knows
// is marked; math, links and the vault's own words are not; a right-click offers suggestions and "Add to this
// vault's words". Installed for this file only, as a vault holds it, and switched off after.
const H = { "x-atlas": "1" };
const put = (r: APIRequestContext, path: string, text: string) => r.put("/api/file", { headers: H, data: { path, text } });
const built = (f: string) => readFileSync(new URL(`../../plugins/beta/spelling/${f}`, import.meta.url), "utf8");
const DICT = "/usr/share/hunspell/en_US.dic";

test.skip(!existsSync(DICT), `needs an English Hunspell dictionary (${DICT})`);

test.beforeAll(async ({ request }) => {
  for (const f of ["plugin.toml", "main.js", "helper.js"]) await put(request, `.atlas/plugins/spelling/${f}`, built(f));
  await put(request, "notes/spell-a.md", "# Spell A\n\nThe electrons teh insulator carry Wannier centers and self-energy's sub-bath, $\\alpha teh$ and [[Mott|teh link]].\n\nAnother blochy line, where we met Hubbardo and Sénéchalz.\n");
  await put(request, "notes/spell-b.md", "# Spell B\n\nWannier functions, Wannier centres and Wannier bands.\n");
});
test.afterAll(async ({ request }) => {
  await put(request, ".atlas/plugins/spelling/main.js", "export function register() {}\n");
  await request.post("/api/plugins/spelling/helper/stop", { headers: H });
});

test("a misspelled word is marked, math, links, names and the vault's words are not; suggestions and the vault's words from a right-click", async ({ page }) => {
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await openFile(page, "spell-a.md");
  const marked = page.locator(".cm-content .cm-spell-miss");
  await expect.poll(() => marked.allTextContents(), { timeout: 20000 }).toEqual(["teh", "blochy"]);
  // the bottom bar: the note's language and what is marked
  await expect(page.locator('.status [data-cell="spelling:spelling"]')).toHaveText("EN · 2 misspelled");

  for (const theme of ["light", "dark"]) {
    await page.evaluate((t) => document.documentElement.setAttribute("data-theme", t), theme);
    await page.locator(".cm-content .cm-line").nth(2).screenshot({ path: `../target/snip/spell-${theme}.png` });
  }

  await marked.first().click({ button: "right" });
  // the suggestions open the menu, before the app's rows
  await expect(page.getByRole("menu").locator("[data-label]").first()).toHaveAttribute("data-label", "the");
  await page.locator('[data-label="the"]').click();
  await expect(page.locator(".cm-content")).toContainText("The electrons the insulator");
  await expect(marked).toHaveText(["blochy"]);

  await marked.first().click({ button: "right" });
  await page.locator('[data-label="Add “blochy” to this vault\'s words"]').click();
  await expect(marked).toHaveCount(0);
  await expect(page.locator('.status [data-cell="spelling:spelling"]')).toHaveText("EN ✓");
  const words = await (await page.request.get("/api/file?path=.atlas/spelling/words.md", { headers: H })).json();
  expect(words.text).toContain("```words\nblochy\n```");
});

test("the lower bar's Spelling panel: the marked words with their fixes, words added and taken back, the language", async ({ page, request }) => {
  await put(request, "notes/spell-c.md", "# Spell C\n\nWe recieve wierd results from the solver.\n");
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await openFile(page, "spell-c.md");
  const cell = page.locator('.status [data-cell="spelling:spelling"]');
  await expect(cell).toHaveText("EN · 2 misspelled", { timeout: 20000 });
  await cell.click();
  const panel = page.locator('[data-panel="spelling:spelling"]');
  await expect(panel.locator("li.word .w")).toHaveText(["recieve", "wierd"]);
  await expect(panel.locator("li.word").first().locator(".fix").first()).toHaveText("receive");
  for (const theme of ["light", "dark"]) {
    await page.evaluate((t) => document.documentElement.setAttribute("data-theme", t), theme);
    await page.locator(".popover").screenshot({ path: `../target/snip/spell-panel-${theme}.png` });
  }

  // a fix replaces the word in the note, and the panel shows what is left
  await panel.locator("li.word").first().locator(".fix").first().click();
  await expect(page.locator(".cm-content")).toContainText("We receive wierd results");
  await expect(panel.locator("li.word .w")).toHaveText(["wierd"]);
  // added to the vault's words, then taken back
  await panel.locator("li.word .keep").click();
  await expect(panel.locator(".chip", { hasText: "wierd" })).toHaveCount(1);
  await expect(panel.locator("li.word")).toHaveCount(0);
  await panel.getByRole("button", { name: "Remove wierd" }).click();
  await expect(panel.locator(".chip", { hasText: "wierd" })).toHaveCount(0);
  expect((await (await request.get("/api/file?path=.atlas/spelling/words.md", { headers: H })).json()).text).not.toContain("wierd");
  // Escape closes it; the language buttons write the note's lang: property
  await page.keyboard.press("Escape");
  await expect(panel).toHaveCount(0);
  await cell.click();
  await expect(panel.locator(".langs button.on")).toHaveText("English");
});

test("Settings → Spelling: the languages, the main one, and the words added by hand", async ({ page, request }) => {
  await put(request, "notes/spell-d.md", "# Spell D\n\nA plain line.\n");
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await openFile(page, "spell-d.md");
  const cell = page.locator('.status [data-cell="spelling:spelling"]');
  await expect(cell).toHaveText("EN ✓", { timeout: 20000 });
  await cell.click();
  await page.locator('[data-panel="spelling:spelling"]').getByRole("button", { name: "Spelling settings…" }).click();
  const section = page.locator('[data-section="spelling/words"]');
  await expect(section.locator("table button")).toContainText(["English"]);
  await expect(section.locator("table button.on")).toHaveCount(1);
  // a word added here is in the vault's words, and × takes it back
  await section.getByLabel("A word to add").fill("Sénéchalz");
  await section.getByRole("button", { name: "Add", exact: true }).click();
  await expect(section.locator(".chip", { hasText: "Sénéchalz" })).toHaveCount(1);
  expect((await (await request.get("/api/file?path=.atlas/spelling/words.md", { headers: H })).json()).text).toContain("Sénéchalz");
  for (const theme of ["light", "dark"]) {
    await page.evaluate((t) => document.documentElement.setAttribute("data-theme", t), theme);
    await section.screenshot({ path: `../target/snip/spell-settings-${theme}.png` });
  }
  await section.getByRole("button", { name: "Remove Sénéchalz" }).click();
  await expect(section.locator(".chip", { hasText: "Sénéchalz" })).toHaveCount(0);
});
