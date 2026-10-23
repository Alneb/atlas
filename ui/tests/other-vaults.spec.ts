import { test, expect, type Page } from "@playwright/test";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { WS } from "../playwright.config";

// The other vaults in the explorer (lib/other-vaults.ts). The other vault is a second real core (`atlas
// serve`), reached at `/v/second/` as the desktop's one core serves it: the page's calls there are passed to it.
const SECOND = `${WS}-second`;
const PORT = 7741;
const ATLAS = fileURLToPath(new URL("../../target/debug/atlas", import.meta.url));
let core: ChildProcess;

test.beforeAll(async () => {
  rmSync(SECOND, { recursive: true, force: true });
  mkdirSync(join(SECOND, "notes"), { recursive: true });
  writeFileSync(join(SECOND, "notes", "elsewhere.md"), "# Elsewhere\n\nIn the second vault.\n");
  core = spawn(ATLAS, ["serve", SECOND, "--port", String(PORT)], {
    env: { ...process.env, ATLAS_NO_BROWSER: "1", ATLAS_VAULTS: `${SECOND}-vaults.toml`, ATLAS_SECRETS_DIR: `${SECOND}-secrets`, ATLAS_SERVER_CONFIG: `${SECOND}-server.toml`, ATLAS_SERVER_STATE: `${SECOND}-server.json`, ATLAS_AGENTS_FILE: `${SECOND}-agents.json` },
    stdio: "ignore",
  });
  await expect.poll(() => fetch(`http://127.0.0.1:${PORT}/api/workspace`, { headers: { "x-atlas": "1" } }).then((r) => r.ok, () => false), { timeout: 60_000 }).toBe(true);
});
test.afterAll(() => { core?.kill(); });

/** This core lists the second vault at `/v/second/`, and the page's calls there go to it. */
async function serveSecond(page: Page) {
  await page.route("**/api/vaults", (r) => r.fulfill({ json: { current: WS, manage: true, vaults: [{ name: "Second", path: SECOND, last_opened: 1, missing: false, url: "/v/second/", warm: false }] } }));
  await page.route("**/v/second/api/**", async (r) => {
    const u = new URL(r.request().url());
    r.fulfill({ response: await r.fetch({ url: `http://127.0.0.1:${PORT}${u.pathname.replace("/v/second", "")}${u.search}` }) });
  });
}

test("another vault's files in the explorer: browsed, a note edited and saved back there, a change made there meanwhile not overwritten", async ({ page }) => {
  await serveSecond(page);
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await page.keyboard.press("F1");
  await page.keyboard.type("the explorer");
  await page.getByTestId("palette").getByText("Files: the explorer (vault, SSH hosts, servers)", { exact: true }).click();
  const pane = page.locator(".explorer");
  const row = (name: string) => pane.locator(".x-row", { has: page.locator(".label", { hasText: new RegExp(`^${name.replace(/[.[\]]/g, "\\$&")}$`) }) });

  await pane.locator(".group", { hasText: "Other vaults" }).getByRole("button", { name: "Second" }).click();
  await row("notes").dblclick();
  await row("elsewhere.md").dblclick();
  const ed = page.locator(".dv-active-group .cm-editor");
  await expect(ed).toContainText("In the second vault.");
  await ed.locator(".cm-content").click();
  await page.keyboard.press("Control+End");
  if (await page.locator(".cm-fat-cursor").count()) await page.keyboard.press("o"); // vim: a new line, insert mode
  else await page.keyboard.press("Enter");
  await page.keyboard.type("Edited from the first.");
  await page.keyboard.press("Control+s");
  const file = join(SECOND, "notes", "elsewhere.md");
  await expect.poll(() => readFileSync(file, "utf8")).toContain("Edited from the first.");
  await expect(page.locator(".toast", { hasText: "Saved" })).toBeVisible();

  // changed in the second vault meanwhile: refused, said so, and a click saves over it
  writeFileSync(file, "# Elsewhere\n\nChanged in the second vault itself.\n");
  await page.keyboard.type(" Again.");
  await page.keyboard.press("Control+s");
  const notice = page.getByText(/changed in second since it was opened here/);
  await expect(notice).toBeVisible({ timeout: 15_000 });
  expect(readFileSync(file, "utf8")).toContain("Changed in the second vault itself.");
  await notice.click();
  await expect.poll(() => readFileSync(file, "utf8")).toContain("Edited from the first. Again.");

});

test("a vault switch in this window starts the other vault's tabs: this vault's tabs and terminals stay behind, no tab is closed as gone", async ({ page }) => {
  await serveSecond(page);
  // the second vault's page as the one core serves it: the app with its API at /v/second (server.rs with_base)
  await page.route(/\/v\/second\/$/, async (r) => {
    const html = await (await r.fetch({ url: new URL("/", r.request().url()).href })).text();
    r.fulfill({ contentType: "text/html", body: html.replace("<head>", '<head><script>window.__ATLAS_API__="/v/second"</script>') });
  });
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await page.keyboard.press("Control+p");
  await page.keyboard.type("paste.md");
  await expect(page.getByTestId("palette").getByText("paste", { exact: true }).first()).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page.locator(".cm-content")).toContainText("A figure goes here");
  await page.waitForTimeout(800); // the layout saved (400 ms after a change)

  await page.evaluate(() => location.replace("/v/second/")); // as lib/vaults.ts switches
  await page.waitForURL(/\/v\/second\/$/);
  await page.waitForTimeout(2000);
  await expect(page.locator(".dv-tab", { hasText: /^paste$/ })).toHaveCount(0);
  await expect(page.locator(".toast", { hasText: "A tab closed" })).toHaveCount(0);

  // and back: this window's tabs of the first vault are there again
  await page.goto("/");
  await expect(page.locator(".dv-tab", { hasText: /^paste$/ })).toHaveCount(1);
});
