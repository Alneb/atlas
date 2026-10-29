import { test, expect, type APIRequestContext } from "@playwright/test";
import { spawn, type ChildProcess } from "node:child_process";
import { createInterface } from "node:readline";
import { readFileSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { WS } from "../playwright.config";

// A server's folders in the vault's tree (lib/remote-tree): listed when unfolded, a file fetched when opened; and a file
// opened before still opens with the server out of reach (offline, the VPN down): the copy fetched last time, said so
// (file-sources: every plugin source's `local` keeps its copies). The server is the copyparty stand-in.
const H = { "x-atlas": "1" };
const DIR = ".atlas/plugins/copyparty";
const ROOT = `${WS}-copyparty-offline`;
const put = (r: APIRequestContext, path: string, text: string) => r.put("/api/file", { headers: H, data: { path, text } });
const example = (f: string) => readFileSync(fileURLToPath(new URL(`../../plugins/beta/copyparty/${f}`, import.meta.url)), "utf8");
let server: ChildProcess | undefined;

test.beforeAll(async ({ request }) => {
  rmSync(ROOT, { recursive: true, force: true });
  mkdirSync(join(ROOT, "hdd1"), { recursive: true });
  writeFileSync(join(ROOT, "hdd1/away.md"), "# Read on the train\n");
  mkdirSync(join(ROOT, "hdd1/deep"), { recursive: true });
  writeFileSync(join(ROOT, "hdd1/deep/inner.txt"), "from a folder of the server\n");
  server = spawn("python3", [fileURLToPath(new URL("../../scripts/vault/tests/fake_copyparty.py", import.meta.url)), ROOT, ""], { stdio: ["ignore", "pipe", "inherit"] });
  const { port } = await new Promise<{ port: number }>((ok) => createInterface({ input: server!.stdout! }).once("line", (l) => ok(JSON.parse(l))));
  await put(request, `${DIR}/main.js`, example("main.js"));
  await put(request, ".atlas/plugin-settings/copyparty.toml", `[[servers]]\nname = "far"\nurl = "http://127.0.0.1:${port}/hdd1/"\n`);
  await put(request, `${DIR}/plugin.toml`, example("plugin.toml"));
});
test.afterAll(async ({ request }) => {
  server?.kill();
  await put(request, `${DIR}/main.js`, "export function register() {}\n");
  rmSync(ROOT, { recursive: true, force: true });
});

test("a server's folders in the vault's tree: unfolded, listed, a file opened from its copy", async ({ page }) => {
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await page.keyboard.press("Meta+Shift+F");
  const tree = page.locator(".tree");
  const key = (...parts: string[]) => tree.locator(`.row[data-key="${parts.join("\\A ")}"]`); // the keys join with a newline, "\A " in CSS
  await expect(key("copyparty")).toBeVisible();
  await expect(key("copyparty"), "no vault menu on a server's row").not.toHaveAttribute("data-path");
  if (!(await key("copyparty", "far").count())) await key("copyparty").click();
  await key("copyparty", "far").click();
  await expect(key("copyparty", "far", "/away.md")).toBeVisible();
  await key("copyparty", "far", "/deep").click();
  await key("copyparty", "far", "/deep/inner.txt").click();
  await expect(page.locator(".dv-active-group .cm-editor")).toContainText("from a folder of the server");
  // folded again, as it was (the open folders are kept per device)
  await key("copyparty", "far").click();
  await expect(key("copyparty", "far", "/away.md")).toHaveCount(0);
});

test("a server's file fetched before opens from its copy when the server is out of reach", async ({ page }) => {
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await page.keyboard.press("F1");
  await page.keyboard.type("the explorer");
  await page.keyboard.press("Enter");
  const pane = page.locator(".explorer");
  await pane.locator(".place", { hasText: "far" }).click();
  const row = pane.locator(".x-row", { has: page.locator(".label", { hasText: /^away\.md$/ }) });
  await row.dblclick();
  const ed = page.locator(".dv-active-group .cm-editor");
  await expect(ed).toContainText("Read on the train");

  server!.kill();
  await new Promise((ok) => server!.once("exit", ok));
  server = undefined;
  await page.keyboard.press("Control+w");
  await expect(ed).toHaveCount(0);
  await page.getByTestId("sidebar").locator(".tab", { hasText: "(far)" }).click();
  await row.dblclick();
  await expect(page.getByText(/Not fetched from copyparty/)).toBeVisible();
  await expect(page.getByText(/away\.md opened from the copy fetched just now/)).toBeVisible();
  await expect(page.locator(".dv-active-group .cm-editor")).toContainText("Read on the train");
});
