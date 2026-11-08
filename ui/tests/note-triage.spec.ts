import { test, expect, type APIRequestContext } from "@playwright/test";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { WS } from "../playwright.config";

// Note triage (lib/note-triage.ts): the command writes `.atlas/note-triage.base` once — never over the owner's — and
// opens it; its views list the vault's own notes that wait for a decision, never mail, logs or references.
const H = { "x-atlas": "1" };
const BASE = ".atlas/note-triage.base";
const put = (request: APIRequestContext, path: string, text: string) => request.put("/api/file", { headers: H, data: { path, text } });

test.describe.configure({ mode: "serial" });
test.afterAll(() => rmSync(join(WS, BASE), { force: true }));

test("the command writes the triage Base once and its views ask the right questions", async ({ page, request }) => {
  rmSync(join(WS, BASE), { force: true });
  await put(request, "triage-loose.md", "# Loose\n\nA thought at the top.\n");
  await put(request, "triage-fx/plain.md", "# Plain\n\nNo tag, no link.\n");
  await put(request, "triage-fx/tagged.md", "---\ntags: [physics]\n---\n# Tagged\n");
  await put(request, "triage-fx/linked.md", "---\ntags: [physics]\n---\nSee [[tagged]].\n");
  await put(request, "mail/acct/Inbox/2020-01-01 hello.md", "# Hello\n");

  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await page.keyboard.press("Control+p");
  await page.keyboard.type(">Notes: triage");
  await page.keyboard.press("Enter");
  await expect(page.locator(".view-switch")).toContainText("Unsorted");
  await expect(page.getByText("triage-loose").first()).toBeVisible();
  await page.screenshot({ path: "../target/note-triage.png" });

  const src = readFileSync(join(WS, BASE), "utf8");
  const res = await (await request.post("/api/base/query", { headers: H, data: { src } })).json();
  expect(res.error).toBeNull();
  const rows = (name: string) => (res.views.find((v: { name: string }) => v.name === name)?.rows ?? []).map((r: { path: string }) => r.path);
  expect(res.views.map((v: { name: string }) => v.name)).toEqual(["Unsorted", "Untagged", "Orphans", "Stale"]);
  expect(rows("Unsorted")).toContain("triage-loose.md");
  expect(rows("Unsorted")).not.toContain("triage-fx/plain.md");
  expect(rows("Untagged")).toContain("triage-fx/plain.md");
  expect(rows("Untagged")).not.toContain("triage-fx/tagged.md");
  expect(rows("Orphans")).toContain("triage-fx/plain.md");
  expect(rows("Orphans")).not.toContain("triage-fx/tagged.md"); // linked from `linked`
  expect(rows("Orphans")).not.toContain("triage-fx/linked.md"); // links out
  expect(rows("Stale")).not.toContain("triage-fx/plain.md"); // just written
  for (const v of res.views) expect(v.rows.map((r: { path: string }) => r.path).filter((p: string) => p.startsWith("mail/") || p.startsWith("log/"))).toEqual([]);
});

test("a triage Base the owner changed is opened as it is, never written over", async ({ page }) => {
  const mine = readFileSync(join(WS, BASE), "utf8").replace("name: Stale", "name: Old and alone");
  writeFileSync(join(WS, BASE), mine);
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await page.keyboard.press("Control+p");
  await page.keyboard.type(">Notes: triage");
  await page.keyboard.press("Enter");
  await expect(page.locator(".view-switch")).toBeVisible();
  expect(readFileSync(join(WS, BASE), "utf8")).toBe(mine);
});
