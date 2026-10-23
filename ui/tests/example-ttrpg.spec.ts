import { test, expect, type APIRequestContext } from "@playwright/test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// The example plugin of the repo (plugins/beta/ttrpg/) is real code, not documentation that
// rots: it is installed into the test vault as it is and used — stat block, dice, the initiative
// block, a session note in its folder, its settings form.
const H = { "x-atlas": "1" };
const put = (r: APIRequestContext, path: string, text: string) => r.put("/api/file", { headers: H, data: { path, text } });
const read = async (r: APIRequestContext, path: string) => ((await (await r.get(`/api/file?path=${encodeURIComponent(path)}`, { headers: H })).json()) as { text?: string }).text ?? "";
const example = (f: string) => readFileSync(fileURLToPath(new URL(`../../plugins/beta/ttrpg/${f}`, import.meta.url)), "utf8");

test.beforeAll(async ({ request }) => {
  await put(request, ".atlas/plugins/ttrpg-example/main.js", example("main.js"));
  await put(request, ".atlas/plugins/ttrpg-example/plugin.toml", example("plugin.toml"));
  await put(request, "campaigns/cast/Mira.md", "---\ntype: character\ninitiative: 17\n---\n# Mira\n");
  await put(request, "campaigns/cast/Brok.md", "---\ntype: character\ninitiative: 4\n---\n# Brok\n");
  await put(request, "campaigns/Ambush.md", "# Ambush\n\n```statblock\nname: Goblin boss\nac: 17\nhp: 6d6\n```\n\n```view\ntype: ttrpg.initiative\n```\n\nend\n");
});
test.afterAll(async ({ request }) => { await put(request, ".atlas/plugins/ttrpg-example/main.js", "export function register() {}\n"); });

test("the example TTRPG plugin: a stat block with dice, the initiative list, a session note in its folder", async ({ page, request }) => {
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await page.keyboard.press("Control+p");
  await page.keyboard.type("Ambush.md");
  await expect(page.getByTestId("palette").getByText("Ambush", { exact: true }).first()).toBeVisible();
  await page.keyboard.press("Enter");
  const note = page.locator(".cm-content");

  const card = note.locator('.fence-block[data-fence-name="statblock"]');
  await expect(card).toContainText("Goblin boss");
  await expect(card).toContainText("17");
  // hp is dice: a button; the roll lands in the status bar (6d6 is 6…36)
  await card.getByRole("button", { name: "6d6" }).click();
  const cell = page.locator('.status [data-cell="ttrpg-example:last"]');
  await expect(cell).toHaveText(/🎲 \d+/);
  const total = Number((await cell.textContent())!.replace(/\D/g, ""));
  expect(total).toBeGreaterThanOrEqual(6);
  expect(total).toBeLessThanOrEqual(36);

  // the initiative block: characters by their property, highest first
  const order = note.locator(".atlas-block.own button span");
  await expect(order).toHaveText(["Mira", "Brok"]);

  // a session note goes to the folder of the plugin's setting, not to the vault's root
  await page.keyboard.press("F1");
  await page.keyboard.type("TTRPG: new session note");
  await page.keyboard.press("Enter");
  const day = new Date().toISOString().slice(0, 10);
  await expect(page.getByTestId("sidebar").locator(".tab.active", { hasText: `Session ${day}` })).toBeVisible();
  expect(await read(request, `campaigns/sessions/Session ${day}.md`)).toContain("type: session");
});
