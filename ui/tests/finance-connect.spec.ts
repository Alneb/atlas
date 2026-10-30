import { test, expect, type Page } from "@playwright/test";
import { cpSync, rmSync, writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { WS } from "../playwright.config";

// Finance's Sources tab connects a bank in three steps drawn in its card (bank, consent, accounts) instead of a chain
// of pickers and toasts. The engine is not run: its answers (an empty ledger, a country's banks, the consent and its
// return) are given here, and the links asked of it are recorded.
const PLUGIN = fileURLToPath(new URL("../../plugins/beta/finance", import.meta.url));
const H = { "x-atlas": "1" };
const SUMMARY = {
  accounts: [], review: 0, transactions: 0, errors: 0, warnings: 0, months: [], income: [], net_worth: [], unit: "EUR", units: [],
  known: ["Assets:Bank", "Assets:Pocket USD", "Expenses:Food"], first_use: [], sources: [],
  budget: { currency: "EUR", month: "2026-10", elapsed: "0.5", unpriced: [], lines: [], months: [], recurring: [] },
};
const BANKS = [{ name: "Banco Uno", country: "ES", days: 180 }, { name: "Caja Dos", country: "ES", days: 90 }, { name: "Tercer Banco", country: "ES", days: null }];

test.beforeAll(async ({ request }) => {
  const dir = join(WS, ".atlas/plugins/finance");
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  for (const f of ["view.js", "main.js", "ui-lib"]) cpSync(join(PLUGIN, f), join(dir, f), { recursive: true });
  writeFileSync(join(dir, "plugin.toml"), readFileSync(join(PLUGIN, "plugin.toml"), "utf8").replace(/^run = .*$/m, 'run = "false"'));
  await request.put("/api/plugins/finance/settings", { headers: H, data: { bank_app_id: "app-1", bank_redirect: "https://vault.example.org/back" } });
});
test.afterAll(async ({ request }) => {
  await request.post("/api/plugins/finance/helper/stop", { headers: H });
  await request.delete("/api/plugins/finance/secrets/enable_banking_key", { headers: H });
  rmSync(join(WS, ".atlas/plugins/finance"), { recursive: true, force: true });
});

/** Answers the engine's calls; returns the `bank_link` calls made. */
async function engine(page: Page): Promise<Record<string, unknown>[]> {
  const links: Record<string, unknown>[] = [];
  await page.route("**/api/plugins/finance/helper", async (route) => {
    const { method, params } = route.request().postDataJSON() as { method: string; params: Record<string, unknown> };
    const json = ({
      summary: SUMMARY, transactions: { transactions: [] }, banks: { banks: [], downloads: null },
      bank_list: { banks: BANKS },
      bank_connect: { url: "/consent-page" },
      bank_finish: { path: "finance/sources/caja-dos.md", bank: "Caja Dos", accounts: 2, until: "2027-01-28", unlinked: [{ uid: "u-usd", iban: "ES0000000000001234", name: "Pocket", currency: "USD" }, { uid: "u-x", iban: null, name: "Savings", currency: "EUR" }] },
      bank_link: {},
    } as Record<string, unknown>)[method];
    if (method === "bank_link") links.push(params);
    return json === undefined ? route.fulfill({ status: 500, body: `command failed: plugin finance: ${method}: not here` }) : route.fulfill({ json });
  });
  return links;
}

test("connecting a bank: a filtered list, the consent's address pasted back, the accounts linked in one list", async ({ page, context }) => {
  const errs: string[] = [];
  page.on("pageerror", (e) => errs.push(e.message));
  const links = await engine(page);
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await page.getByTestId("sidebar").getByRole("button", { name: /^Finance/ }).first().click();
  await page.getByRole("button", { name: "Sources" }).click();

  // step 0: the key, kept as a secret through a file chooser
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: /Choose the key file|Replace the key/ }).click();
  const pem = "-----BEGIN PRIVATE KEY-----\nfake\n-----END PRIVATE KEY-----\n"; // scan:allow (a fake key: the page checks only its shape)
  await (await chooser).setFiles({ name: "app.pem", mimeType: "text/plain", buffer: Buffer.from(pem) });

  // step 1: the country's banks, narrowed by typing
  await page.getByRole("button", { name: "Connect a bank" }).click();
  const bank = page.getByRole("group", { name: "Choose a bank" });
  await expect(bank.getByRole("button")).toHaveCount(4); // three banks and Cancel
  await bank.getByRole("textbox", { name: "Bank" }).fill("caja");
  await expect(bank.getByRole("button", { name: /Banco Uno/ })).toHaveCount(0);
  await expect(bank.getByRole("button", { name: /Caja Dos/ })).toContainText("consent up to 90 days");
  for (const scheme of ["light", "dark"] as const) { // judged in both themes (docs/guides/UI-STYLE.md)
    await page.emulateMedia({ colorScheme: scheme });
    await page.screenshot({ path: test.info().outputPath(`finance-bank-${scheme}.png`) });
  }

  // step 2: the bank's page opens in a tab; its return address pasted here when it does not come back by itself
  const consent = context.waitForEvent("page");
  await bank.getByRole("button", { name: /Caja Dos/ }).click();
  await (await consent).close();
  await expect(page.getByText("2 Consent")).toBeVisible();
  await page.getByPlaceholder("https://vault.example.org/back?code=…").fill("https://vault.example.org/back?code=c1&state=Caja%20Dos");
  await page.getByRole("button", { name: "Finish" }).click();

  // step 3: each account no ledger account names, with its own choice; "not now" leaves it
  const accounts = page.getByRole("group", { name: "Link the accounts" });
  await expect(accounts).toContainText("Connected Caja Dos: 2 accounts, consent until 2027-01-28");
  await accounts.getByRole("combobox", { name: "Ledger account for Pocket (USD) …1234" }).selectOption("Assets:Pocket USD");
  await expect(accounts.getByRole("combobox", { name: "Ledger account for Savings (EUR)" })).toHaveValue("");
  for (const scheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    await page.screenshot({ path: test.info().outputPath(`finance-accounts-${scheme}.png`) });
  }
  await accounts.getByRole("button", { name: "Done" }).click();
  await expect(accounts).toHaveCount(0);
  expect(links.map((l) => [l.account, l.uid])).toEqual([["Assets:Pocket USD", "u-usd"]]);
  expect(errs).toEqual([]);
});
