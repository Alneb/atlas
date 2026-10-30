import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { WS } from "../playwright.config";

// The quick-capture window (docs/guides/CAPTURE.md): `/#capture` is the app reduced to one box — what the
// desktop app shows for a global shortcut. Enter writes and the window asks to be closed; Esc asks
// to be closed without writing; another known vault can be chosen from the box.
const H = { "x-atlas": "1" };
const OTHER = `${WS}-capture-other`;
const localDay = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

test("the capture window: only the box, its hints, Enter saves into today's log and closes", async ({ page, request }) => {
  const closes: string[] = [];
  await page.route("**/__atlas_close", (route) => { closes.push(route.request().url()); return route.fulfill({ status: 204, body: "" }); });
  await page.goto("/#capture");
  const box = page.getByTestId("capture");
  await expect(box).toBeFocused();
  await expect(page.getByTestId("sidebar"), "none of the app is there").toHaveCount(0);
  // the little guides: what the short forms do
  await expect(page.getByTestId("capture-guides")).toHaveText(/\[\]\s*to-do\s*@fri\s*date\s*\[\[\s*link\s*#\s*tag/);
  await box.fill("[] ring the lab @tomorrow");
  await expect(page.getByTestId("capture-what")).toHaveText("a to-do, due tomorrow");
  // what is sent is a plain line: a to-do would join Today's open tasks, which other specs count (a shared vault)
  await box.fill("ring the lab went well");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("capture-ok")).toContainText("today’s log");
  const log = await (await request.get(`/api/file?path=log/${localDay()}.md`, { headers: H })).json();
  expect(log.text).toContain("ring the lab went well");
  await expect.poll(() => closes.length, "it asked to be closed").toBe(1);
});

test("the capture window: Esc closes without writing; another vault can be chosen", async ({ page, request }) => {
  await request.post("/api/vaults/open", { headers: H, data: { path: OTHER, create: true } });
  const closes: string[] = [];
  await page.route("**/__atlas_close", (route) => { closes.push("x"); return route.fulfill({ status: 204, body: "" }); });
  await page.goto("/#capture");
  const box = page.getByTestId("capture");
  await box.fill("for the other vault");
  const pick = page.getByTestId("capture-vault");
  await expect(pick).toBeVisible();
  await pick.selectOption({ label: OTHER.split("/").pop()! });
  await box.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("capture-ok")).toContainText(OTHER.split("/").pop()!);
  // a new vault keeps its log under notes/log (config.rs DEFAULT_LOG_DIR)
  expect(readFileSync(join(OTHER, "notes/log", `${localDay()}.md`), "utf8")).toContain("for the other vault");
  await expect.poll(() => closes.length).toBe(1);

  await page.goto("about:blank"); // a fresh load: going from one hash to another does not reload the page
  await page.goto("/#capture");
  await page.getByTestId("capture").fill("never mind");
  await page.keyboard.press("Escape");
  await expect.poll(() => closes.length, "Esc: closed").toBe(2);
  const log = await (await request.get(`/api/file?path=log/${localDay()}.md`, { headers: H })).json();
  expect(log.text ?? "").not.toContain("never mind");
});

// "there is still no modal for tasks in the capture, and the modal for links is cut off by the window":
// the desktop window is 620×160; every list stays inside it, and a to-do gets the editor's task fields.
test("the capture window's lists: task fields with their icons, links, never past the window's edge", async ({ page }) => {
  await page.setViewportSize({ width: 620, height: 160 });
  await page.goto("/#capture");
  const box = page.getByTestId("capture"), list = page.locator(".ta-complete");
  await expect(box).toBeFocused();
  const inside = async () => {
    const r = (await list.boundingBox())!;
    expect(r.y, "not above the window").toBeGreaterThanOrEqual(0);
    expect(r.y + r.height, "not below the window").toBeLessThanOrEqual(160);
    expect(r.x + r.width, "not past its right edge").toBeLessThanOrEqual(620);
  };
  await page.keyboard.type("[] pay the rent d");
  await expect(list.getByRole("option", { name: "due date" })).toBeVisible();
  await expect(list.getByRole("option").first(), "Enter stays the box's own first").toContainText("new line");
  await expect(list.locator("li .task-sugg-icon svg").first(), "rows carry the app's icons").toBeVisible();
  await inside();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Enter");
  await expect(box).toHaveValue("[] pay the rent 📅 ");
  await expect(list.getByRole("option", { name: /tomorrow/ }), "then the dates").toBeVisible();
  await inside();
  await page.keyboard.press("Escape");
  await expect(list).toBeHidden();
  await box.fill("");
  await page.keyboard.type("see [[hub");
  const row = list.getByRole("option", { name: "hubbard" });
  await expect(row).toBeVisible();
  await expect(row.locator(".task-sugg-icon svg"), "a note's row has the note icon").toBeVisible();
  await inside();
  await box.fill("");
});
