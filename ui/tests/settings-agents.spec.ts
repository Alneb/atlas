import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { WS } from "../playwright.config";

// Settings → AI agents (agents.rs, DESIGN-local-lock.md step 3): an agent allowed gets its token once, in the MCP
// server entry any client reads (nothing agent-specific: that is each agent's plugin's); the token then opens the locked test core for `atlas mcp`, and a revoke shuts it out.
// The test core keeps agents in ${WS}-agents.json (ATLAS_AGENTS_FILE), never ~/.local/state.
test("Settings → AI agents: allow an agent, its token works for atlas mcp, revoke it", async ({ page, request }) => {
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await page.keyboard.press("Meta+,");
  await page.getByRole("navigation", { name: "Settings pages" }).getByRole("button", { name: "AI agents" }).click();
  const p = page.getByTestId("agents-panel");
  await expect(p).not.toContainText("not locked"); // the test core runs locked

  const name = `Agent ${Date.now()}`;
  await p.getByLabel("Agent name").fill(name);
  await p.getByRole("button", { name: "Allow an agent" }).click();
  const entry = JSON.parse((await p.locator(".shown pre").textContent()) ?? "{}");
  const token: string = entry.mcpServers?.atlas?.env?.ATLAS_AGENT_TOKEN ?? "";
  expect(entry.mcpServers.atlas).toMatchObject({ command: "atlas", args: ["mcp"] });
  expect(token).toMatch(/^atl_/);
  await expect(p.locator(".agent", { hasText: name })).toContainText("last used never");
  expect(readFileSync(`${WS}-agents.json`, "utf8")).not.toContain(token);

  // as `atlas mcp` sends it: its own token in, the machine's key (the fixture's header) alone not
  const mcp = (auth: Record<string, string>) => request.get("/api/workspace", { headers: { "x-atlas": "1", "x-atlas-client": "mcp", ...auth } });
  expect((await mcp({ authorization: `Bearer ${token}` })).status()).toBe(200);
  expect((await mcp({})).status()).toBe(401);

  await p.locator(".agent", { hasText: name }).getByRole("button", { name: "Revoke" }).click();
  await expect(p).toContainText("revoked");
  await expect(p.locator(".agent", { hasText: name })).toHaveCount(0);
  expect((await mcp({ authorization: `Bearer ${token}` })).status()).toBe(401);
});

test("Settings → AI agents: agent terminals can be kept out and let in again", async ({ page }) => {
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await page.keyboard.press("Meta+,");
  await page.getByRole("navigation", { name: "Settings pages" }).getByRole("button", { name: "AI agents" }).click();
  const p = page.getByTestId("agents-panel");
  const box = p.getByRole("checkbox", { name: /Agent terminals Atlas starts get a token/ });
  await expect(box).toBeChecked();
  await box.uncheck();
  await expect(p).toContainText("kept out");
  await expect(box).not.toBeChecked();
  await box.check();
  await expect(p).toContainText("from the next one started");
});
