import { test, expect, type APIRequestContext } from "@playwright/test";
import { readFileSync } from "node:fs";

// "Claude: show usage" is a dialog: each account's limits as bars (red past the warning setting) with when each resets,
// the account in use first. The plugin's page side as it is; its helper a stand-in answering `usage`.
const H = { "x-atlas": "1" };
const DIR = ".atlas/plugins/claude"; // the test vault's agent manifest lives here: put back after
const put = (request: APIRequestContext, path: string, text: string) => request.put("/api/file", { headers: H, data: { path, text } });
const read = (f: string) => readFileSync(new URL(`../../plugins/beta/claude/${f}`, import.meta.url), "utf8");
const soon = new Date(Date.now() + 42 * 60_000).toISOString();
const USAGE = {
  accounts: [
    { name: "work", folder: "/home/u/.claude-work", current: false, limits: [{ kind: "five_hour", label: "session", percent: 12, resets_at: soon }] },
    { name: "personal", folder: "/home/u/.claude", current: true, credits: true, limits: [
      { kind: "five_hour", label: "session", percent: 91, resets_at: soon },
      { kind: "seven_day", label: "week", percent: 40, weekly: true },
    ] },
  ],
};
const HELPER = `import json, sys
for line in sys.stdin:
    m = json.loads(line)
    r = json.loads(${JSON.stringify(JSON.stringify(USAGE))}) if m["method"] == "usage" else {}
    print(json.dumps({"id": m["id"], "result": r}), flush=True)
`;
let manifest = "";

test.beforeAll(async ({ request }) => {
  manifest = (await (await request.get(`/api/file?path=${encodeURIComponent(`${DIR}/plugin.toml`)}`, { headers: H })).json()).text;
  await put(request, `${DIR}/helper.py`, HELPER);
  for (const f of ["main.js", "usage.js"]) await put(request, `${DIR}/${f}`, read(f));
  await put(request, `${DIR}/plugin.toml`, `${manifest.trimEnd()}\n\n[helper]\nrun = "python3 -u \\"$ATLAS_PLUGIN_DIR/helper.py\\""\n`);
});
test.afterAll(async ({ request }) => {
  await request.post("/api/plugins/claude/helper/stop", { headers: H });
  await put(request, `${DIR}/plugin.toml`, manifest);
  for (const f of ["main.js", "usage.js", "helper.py"]) await request.post(`/api/fs/trash?path=${encodeURIComponent(`${DIR}/${f}`)}`, { headers: H });
});

test("Claude: show usage opens a report: the account in use first, its limits as bars, red past the warning", async ({ page }) => {
  const errs: string[] = [];
  page.on("pageerror", (e) => errs.push(e.message));
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await page.keyboard.press("F1");
  await page.keyboard.type("Claude: show usage");
  await page.keyboard.press("Enter");
  const dialog = page.locator(".cu");
  await expect(dialog.locator("section").first()).toContainText("personal", { timeout: 15_000 });
  await expect(dialog.locator("section").first()).toContainText("in use");
  const session = dialog.getByRole("meter", { name: "personal: session" });
  await expect(session).toHaveAttribute("aria-valuenow", "91");
  await expect(session.locator(".bar")).toHaveClass(/warn/);
  await expect(session).toContainText(/resets in 4[12] min/);
  await expect(dialog.getByRole("meter", { name: "personal: week" }).locator(".bar")).not.toHaveClass(/warn/);
  await expect(dialog.getByRole("meter", { name: "work: session" })).toHaveAttribute("aria-valuenow", "12");
  await expect(dialog).toContainText("usage credits on");
  for (const scheme of ["light", "dark"] as const) { // judged in both themes (docs/guides/UI-STYLE.md)
    await page.emulateMedia({ colorScheme: scheme });
    await page.screenshot({ path: test.info().outputPath(`claude-usage-${scheme}.png`) });
  }
  await dialog.getByRole("button", { name: "Close" }).click();
  await expect(dialog).toHaveCount(0);
  expect(errs).toEqual([]);
});
