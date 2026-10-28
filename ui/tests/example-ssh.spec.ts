import { test, expect, type APIRequestContext } from "@playwright/test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// The SSH example plugin as it is: an agent's ssh_terminal ("open me an ssh terminal on iq") opens a
// terminal tab in the user's window. The call goes the way `atlas mcp` sends it (POST …/tools/terminal),
// the helper asks the page for the tab, and answers only once the page says it is open.
// ssh is a stand-in (fixtures/fake_ssh.sh, ATLAS_SSH_BIN in playwright.config.ts): no network.
const H = { "x-atlas": "1" };
const DIR = ".atlas/plugins/ssh";
const put = (r: APIRequestContext, path: string, text: string) => r.put("/api/file", { headers: H, data: { path, text } });
// the helper as the webServer builds it (playwright.config.ts): the plugin's own bin/ is built by engine/build.sh
const HELPER = fileURLToPath(new URL("../../target/debug/atlas-ssh", import.meta.url));
const example = (f: string) => readFileSync(fileURLToPath(new URL(`../../plugins/stable/ssh/${f}`, import.meta.url)), "utf8");

test.beforeAll(async ({ request }) => {
  await put(request, `${DIR}/main.js`, example("main.js"));
  // no hosts read from the machine's own ssh config
  await put(request, `${DIR}/plugin.toml`, example("plugin.toml").replace(/^run = .*$/m, `run = "${HELPER}"`));
  await put(request, ".atlas/plugin-settings/ssh.toml", 'config = "no-such-ssh-config"\n'); // the vault's values, never in the manifest
});
test.afterAll(async ({ request }) => {
  await put(request, `${DIR}/main.js`, "export function register() {}\n");
  await request.post("/api/plugins/ssh/helper/stop", { headers: H });
});

test("ssh_terminal opens a visible terminal tab on the host, and says so only once it is open", async ({ page, request }) => {
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  // the page has loaded the plugin (its listener for the helper's "tab" event is set up with its commands)
  await expect.poll(() => page.evaluate(() => (window as unknown as { __atlas: { commands(): { id: string }[] } }).__atlas.commands().some((c) => c.id === "plugin.ssh.connect")), { timeout: 15_000 }).toBe(true);

  const r = await request.post("/api/plugins/ssh/tools/terminal", { headers: H, data: { host: "iq" }, timeout: 40_000 });
  const body = await r.text();
  expect(r.ok(), body).toBe(true);
  const answer = JSON.parse(body) as { opened: string; host: string; connected: boolean; note: string };
  expect(answer).toMatchObject({ opened: "iq", host: "iq", connected: false });
  expect(answer.note, "not connected: the passphrase / 2FA is asked in the tab").toContain("2FA");

  await expect(page.getByTestId("sidebar").locator(".tab", { hasText: /\biq\b/ })).toBeVisible();
  await expect(page.locator(".xterm").filter({ hasText: "fake ssh: logged in to iq" }).first()).toBeVisible({ timeout: 10_000 });
});
