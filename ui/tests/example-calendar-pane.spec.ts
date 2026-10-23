import { test, expect, type Page } from "@playwright/test";
import { cpSync, rmSync, writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { createServer, type Server } from "node:http";
import { fileURLToPath } from "node:url";
import { WS } from "../playwright.config";

// The Calendar pane (plugins/beta/dav: the Rust engine and the Svelte pane, docs/refactor/REFACTOR-calendar.md) on a
// public ICS subscription served here, and two CalDAV account cards with no password (nothing is asked of a server):
// the views, the keys, quick add read by the engine, the event card, each account under its own heading with its
// problem said. The engine runs as a debug build (built here), as the catalog's helper does.
const PLUGIN = fileURLToPath(new URL("../../plugins/beta/dav", import.meta.url));
const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (d: Date) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
const today = new Date();
const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
// floating times: 10:00 on the user's clock whatever the machine's zone
const FEED = `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nX-WR-CALNAME:Seminars\r\nBEGIN:VEVENT\r\nUID:sem-1@example.org\r\nSUMMARY:Seminar series\r\nLOCATION:Amphi 2\r\nDTSTART:${ymd(today)}T100000\r\nDTEND:${ymd(today)}T113000\r\nRRULE:FREQ=WEEKLY;COUNT=10\r\nEND:VEVENT\r\nBEGIN:VEVENT\r\nUID:hol-1@example.org\r\nSUMMARY:Open day\r\nDTSTART;VALUE=DATE:${ymd(tomorrow)}\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n`;

let feed: Server;
test.beforeAll(async ({ request }) => {
  test.setTimeout(400_000); // the engine is built once
  const built = spawnSync("cargo", ["build", "-q", "--manifest-path", join(PLUGIN, "engine/Cargo.toml"), "--bin", "dav"], { stdio: "inherit" });
  if (built.status !== 0) throw new Error("cannot build the calendar engine");
  feed = createServer((_q, r) => { r.writeHead(200, { "Content-Type": "text/calendar", ETag: '"f1"' }); r.end(FEED); });
  await new Promise<void>((ok) => feed.listen(0, "127.0.0.1", ok));
  const port = (feed.address() as { port: number }).port;
  const dir = join(WS, ".atlas/plugins/dav");
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  for (const f of ["view.js", "main.js", "ui-lib"]) cpSync(join(PLUGIN, f), join(dir, f), { recursive: true });
  const manifest = readFileSync(join(PLUGIN, "plugin.toml"), "utf8").replace(/^run = .*$/m, `run = "${join(PLUGIN, "engine/target/debug/dav")}"`);
  writeFileSync(join(dir, "plugin.toml"), manifest);
  await request.put("/api/file", { headers: { "x-atlas": "1" }, data: { path: ".atlas/plugin-settings/dav.toml", text: `default_view = "week"\ntime_format = "24h"\n\n[[accounts]]\nname = "home"\nurl = "http://127.0.0.1:9/caldav/"\nuser = "alice"\n\n[[accounts]]\nname = "uni"\nurl = "http://127.0.0.1:9/remote.php/dav/"\nuser = "a.r"\n\n[[subscriptions]]\nname = "seminars"\nurl = "http://127.0.0.1:${port}/seminars.ics"\ncolor = "#14b8a6"\n` } });
  await request.post("/api/plugins/dav/helper/stop", { headers: { "x-atlas": "1" } });
});
test.afterAll(async ({ request }) => {
  await request.post("/api/plugins/dav/helper/stop", { headers: { "x-atlas": "1" } });
  rmSync(join(WS, ".atlas/plugins/dav"), { recursive: true, force: true });
  await request.delete(`/api/file?path=${encodeURIComponent(".atlas/plugin-settings/dav.toml")}`, { headers: { "x-atlas": "1" } });
  feed?.close();
});

async function openPane(page: Page) {
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __atlas: { commands(): { id: string }[] } }).__atlas.commands().some((c) => c.id === "plugin.dav.open")), { timeout: 20_000 }).toBe(true);
  const palette = page.getByTestId("palette");
  await expect(async () => {
    if (await palette.isVisible()) await page.keyboard.press("Escape");
    await page.keyboard.press("F1");
    await expect(palette.getByRole("textbox")).toBeFocused({ timeout: 1000 });
    await page.keyboard.type("Calendar: open");
    await expect(palette.getByText("Calendar: open", { exact: true }).first()).toBeVisible({ timeout: 1000 });
    await page.keyboard.press("Enter");
  }).toPass({ timeout: 15_000 });
  const cal = page.locator(".calendar");
  await expect(cal).toBeVisible();
  return cal;
}

test("the week, month and agenda show a subscription's events in local time; keys switch the views", async ({ page }) => {
  test.setTimeout(120_000);
  const cal = await openPane(page);
  // the week: today's seminar at 10:00 (a floating time stays on the clock), the open day in the all-day lane
  await expect(cal.locator(".tg .ev", { hasText: "Seminar series" }).first()).toBeVisible({ timeout: 30_000 });
  await expect(cal.locator(".tg .ev", { hasText: "Seminar series" }).first()).toContainText("10:00");
  await expect(cal.getByRole("checkbox", { name: /seminars/ })).toBeVisible();
  await cal.locator("h1").click();
  await page.keyboard.press("m");
  await expect(cal.locator(".month")).toBeVisible();
  await expect(cal.locator(".month .line", { hasText: "Seminar series" }).first()).toBeVisible();
  await page.keyboard.press("a");
  await expect(cal.locator(".agenda")).toBeVisible();
  const row = cal.locator(".agenda .row", { hasText: "Seminar series" }).first();
  await expect(row).toContainText("10:00 – 11:30");
  // the card: when, where, which calendar; a subscription is read-only (no Edit)
  await row.click();
  const card = cal.getByRole("dialog", { name: "Seminar series" });
  await expect(card).toContainText("Amphi 2");
  await expect(card).toContainText("seminars · read-only");
  await expect(card.getByTitle("Edit (e)")).toHaveCount(0);
  await page.keyboard.press("Escape");
  // hiding the calendar takes its events away
  await cal.getByRole("checkbox", { name: /seminars/ }).click();
  await expect(cal.locator(".agenda .row", { hasText: "Seminar series" })).toHaveCount(0);
  await cal.getByRole("checkbox", { name: /seminars/ }).click();
  await expect(cal.locator(".agenda .row", { hasText: "Seminar series" }).first()).toBeVisible();
});

test("quick add shows what the engine understood, in three languages", async ({ page }) => {
  const cal = await openPane(page);
  await cal.locator("h1").click();
  await page.keyboard.press("q");
  const box = cal.getByRole("textbox", { name: "Quick add" });
  await expect(box).toBeFocused();
  await box.fill("réunion lundi à 10h pendant 2h @ D3");
  await expect(cal.locator(".qprev")).toContainText("réunion");
  await expect(cal.locator(".qprev")).toContainText("10:00 – 12:00");
  await expect(cal.locator(".qprev")).toContainText("D3");
  await box.fill("examen el 15 de noviembre");
  await expect(cal.locator(".qprev")).toContainText("all day");
  await page.keyboard.press("Escape");
  await expect(box).toHaveCount(0);
  // the key sheet lists the keys from the one command list
  await cal.locator("h1").click();
  await page.keyboard.press("?");
  await expect(cal.getByRole("dialog", { name: "Keyboard shortcuts" })).toContainText("Agenda (schedule)");
});

test("each account has its own heading in the side panel, with why it does not sync", async ({ page }) => {
  const cal = await openPane(page);
  for (const name of ["home", "uni"]) {
    const head = cal.locator(".side h3", { hasText: name });
    await expect(head).toBeVisible();
    // no app password yet: said on the heading, nothing asked of the server
    await expect(head.locator(".err")).toHaveAttribute("title", /not set up/, { timeout: 20_000 });
  }
  await expect(cal.locator(".side h3", { hasText: "Subscriptions" })).toBeVisible();
  // Settings' helpers: each card's state, and a Test of an unsaved card
  const status = await page.evaluate(async () => {
    const r = await fetch("/api/plugins/dav/helper", { method: "POST", headers: { "content-type": "application/json", "x-atlas": "1" }, body: JSON.stringify({ method: "account_status", params: {} }) });
    return r.ok ? await r.json() : { error: r.status };
  });
  expect(JSON.stringify(status)).toContain("no app password yet");
});
