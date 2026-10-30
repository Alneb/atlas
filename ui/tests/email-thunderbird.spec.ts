import { test, expect } from "@playwright/test";
import { cpSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { WS } from "../playwright.config";

// Email's Thunderbird import and Outlook's sign-in are dialogs. The import: Thunderbird's accounts each added as a card (what to do next said beside
// it), then an account's local mail checked, its counts shown, and written as notes on the go-ahead. The plugin's
// page side as built; its helper a stand-in (the engine reads the real ~/.thunderbird, which a test never does).
const REPO = fileURLToPath(new URL("../..", import.meta.url));
const DIR = join(WS, ".atlas/plugins/email");
const H = { "x-atlas": "1" };

const FOUND = [
  { user: "alice@example.org", name: "Work", imap_host: "imap.example.org", auth: "password", profile: "thunderbird/abc.default", record: { name: "work", user: "alice@example.org", imap_host: "imap.example.org" } },
  { user: "old@example.org", name: "old-pop", imap_host: "pop.example.org", auth: "password", profile: "thunderbird/abc.default", record: { name: "old-pop", user: "old@example.org" } },
];
const HELPER = `import json, sys, time
FOUND = json.loads(${JSON.stringify(JSON.stringify(FOUND))})
for line in sys.stdin:
    m = json.loads(line)
    p = m.get("params") or {}
    r = {}
    if m["method"] == "thunderbird": r = {"accounts": FOUND}
    if m["method"] == "thunderbird_mail":
        r = {"missing": {"Inbox": 3, "Sent": 1}} if p.get("dry", True) else {"saved": ["a", "b", "c", "d"], "failed": []}
    if m["method"] == "signin_start": r = {"flow": "code", "url": "https://login.example.org/device", "code": "ABCD-1234", "opened": True}
    if m["method"] == "signin_finish": time.sleep(1)
    print(json.dumps({"id": m["id"], "result": r}), flush=True)
`;

test.beforeAll(async ({ request }) => {
  rmSync(DIR, { recursive: true, force: true });
  const plugin = join(REPO, "plugins/stable/email");
  for (const f of ["view.js", "main.js", "ui-lib"]) cpSync(join(plugin, f), join(DIR, f), { recursive: true });
  writeFileSync(join(DIR, "helper.py"), HELPER);
  writeFileSync(join(DIR, "plugin.toml"), readFileSync(join(plugin, "plugin.toml"), "utf8").replace(/^run = .*$/m, 'run = "python3 -u \\"$ATLAS_PLUGIN_DIR/helper.py\\""'));
  await request.put("/api/file", { headers: H, data: { path: ".atlas/plugin-settings/email.toml", text: '[[accounts]]\nname = "old-pop"\nuser = "old@example.org"\n\n[[accounts]]\nname = "school"\nuser = "me@school.example.org"\nauth = "outlook"\n' } });
});
test.afterAll(async ({ request }) => {
  await request.post("/api/plugins/email/helper/stop", { headers: H });
  rmSync(DIR, { recursive: true, force: true });
  await request.post(`/api/fs/trash?path=${encodeURIComponent(".atlas/plugin-settings/email.toml")}`, { headers: H });
});

test("Thunderbird's accounts and local mail in one dialog: add a card, check, write", async ({ page, request }) => {
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await page.keyboard.press("F1");
  await page.keyboard.type("Email: import an account from Thunderbird");
  await page.keyboard.press("Enter");
  const dialog = page.locator(".tb");
  const work = dialog.locator("li", { hasText: "alice@example.org" });
  await expect(work.getByRole("button", { name: "Add" })).toBeVisible({ timeout: 15_000 });
  await expect(dialog.locator("li", { hasText: "old@example.org" }).getByRole("button")).toHaveText("Already a card");

  await work.getByRole("button", { name: "Add" }).click();
  await expect(work).toContainText("now type its password on its card");
  await expect.poll(async () => (await (await request.get(`/api/file?path=${encodeURIComponent(".atlas/plugin-settings/email.toml")}`, { headers: H })).json()).text)
    .toContain('name = "work"');

  await dialog.getByRole("combobox", { name: "Account" }).selectOption("old-pop");
  await dialog.getByRole("button", { name: "Check" }).click();
  await expect(dialog).toContainText("4 messages Thunderbird keeps for old-pop are in no note");
  await expect(dialog.locator(".counts li", { hasText: "Inbox" })).toContainText("3");
  for (const scheme of ["light", "dark"] as const) { // judged in both themes (docs/guides/UI-STYLE.md)
    await page.emulateMedia({ colorScheme: scheme });
    await page.screenshot({ path: `test-results/email-thunderbird-${scheme}.png` });
  }
  await dialog.getByRole("button", { name: "Write them as notes" }).click();
  await expect(dialog).toContainText("4 kept as notes.");
  await dialog.getByRole("button", { name: "Close" }).click();
  await expect(dialog).toHaveCount(0);
});

test("Outlook's sign-in is a dialog: the device code with a copy button, then signed in", async ({ page }) => {
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await page.keyboard.press("F1");
  await page.keyboard.type("Email: sign in to Outlook");
  await page.keyboard.press("Enter");
  const dialog = page.locator(".si");
  await expect(dialog.locator(".code span")).toHaveText("ABCD-1234", { timeout: 15_000 }); // the one Outlook card: no question
  await expect(dialog).toContainText("sign in as school");
  await expect(dialog.getByRole("button", { name: "Open the Microsoft page again" })).toBeVisible();
  for (const scheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    await page.screenshot({ path: `test-results/email-signin-${scheme}.png` });
  }
  await expect(dialog).toContainText("Signed in: school's mail can be read now.");
  await dialog.getByRole("button", { name: "Done" }).click();
  await expect(dialog).toHaveCount(0);
});
