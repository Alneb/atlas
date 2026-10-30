import { test, expect, type APIRequestContext, type Page } from "@playwright/test";
import { openFile } from "./open";
import { mkdirSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { WS } from "../playwright.config";

// "super + e opens a super comand bar that does commands actions and also searches and opens files":
// one bar — commands, files, headings, and now the text of notes — on Super+E and F1. And Ctrl+Q cycles a line: text → list item → to-do → text.
const H = { "x-atlas": "1" };
const put = (r: APIRequestContext, path: string, text: string) => r.put("/api/file", { headers: H, data: { path, text } });
const lastLine = (page: Page) => page.evaluate(() => (window as unknown as { __atlas: { editor(): { text: string } | null } }).__atlas.editor()?.text.trimEnd().split("\n").pop() ?? "");

test.beforeAll(async ({ request }) => {
  await put(request, "notes/bar-note.md", "# Bar note\n\nthe zyqqa spectral function is discussed here\n\nlast\n");
});

test("the command bar finds text inside notes and opens the line; Super+E opens it", async ({ page }) => {
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  const palette = page.getByTestId("palette");

  await page.keyboard.press("Meta+e");
  await expect(palette.getByRole("textbox")).toBeFocused();
  await page.keyboard.type("zyqqa spectral");
  const hit = palette.locator(".item, [role=option]", { hasText: "the zyqqa spectral function" });
  await expect(hit).toBeVisible();
  await expect(hit).toContainText("bar-note:3");
  await hit.click();
  await expect(page.getByTestId("sidebar").locator(".tab.active", { hasText: "bar-note" })).toBeVisible();
  await expect(page.locator(".cm-activeLine")).toContainText("zyqqa spectral function");

  // commands still come first, and Super+E is the bar from inside a note too
  await page.locator(".cm-content").click();
  await page.keyboard.press("Meta+e");
  await expect(palette.getByRole("textbox")).toBeFocused();
  await page.keyboard.type("Graph of notes");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("sidebar").locator(".tab.active", { hasText: "Graph" })).toBeVisible();
});

test("from inside a terminal the shell keeps every non-Super key, and the bar still opens with F1 and Super+E", async ({ page }) => {
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  const palette = page.getByTestId("palette");
  await page.keyboard.press("Control+`"); // the keys go to the terminal
  await expect(page.locator(".xterm").first()).toBeVisible();
  await page.locator(".xterm").first().click();
  await page.keyboard.press("Control+k");
  await page.keyboard.press("Control+Shift+P"); // the bar's Ctrl key: the shell's too now
  await expect(palette).toBeHidden();
  await page.keyboard.press("F1");
  await expect(palette.getByRole("textbox")).toBeFocused();
  await page.keyboard.press("Escape");
  await page.locator(".xterm").first().click();
  await page.keyboard.press("Meta+e");
  await expect(palette.getByRole("textbox")).toBeFocused();
  await page.keyboard.press("Escape");
  // the desktop app (WebKitGTK on Wayland) can report Super+E with metaKey false: a Super key seen
  // going down still makes it Super+E, not an "e" typed into the shell
  await page.locator(".xterm").first().click();
  await page.evaluate(() => {
    const t = document.activeElement ?? document.body;
    const ev = (type: string, key: string, code: string) => t.dispatchEvent(new KeyboardEvent(type, { key, code, bubbles: true, cancelable: true }));
    ev("keydown", "Super", "MetaLeft"); ev("keydown", "e", "KeyE"); ev("keyup", "e", "KeyE"); ev("keyup", "Super", "MetaLeft");
  });
  await expect(palette.getByRole("textbox")).toBeFocused();
  await page.keyboard.press("Escape");
});

test("Ctrl+Q cycles a line: text, list item, to-do, text", async ({ page }) => {
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await openFile(page, "bar-note.md");
  await page.locator(".cm-content").click();
  await page.keyboard.press("Escape");
  await page.keyboard.type("Gobuy dice"); // vim: a new last line, insert mode
  await page.keyboard.press("Control+q");
  await expect.poll(() => lastLine(page)).toBe("- buy dice");
  await page.keyboard.press("Control+q");
  await expect.poll(() => lastLine(page)).toBe("- [ ] buy dice");
  await page.keyboard.press("Control+q");
  await expect.poll(() => lastLine(page)).toBe("buy dice");
});

test("the command bar also captures what was typed", async ({ page, request }) => {
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  const palette = page.getByTestId("palette");
  await page.keyboard.press("Meta+e");
  await page.keyboard.type("a thought from the bar qqz");
  await palette.getByText("Capture “a thought from the bar qqz”").click();
  await expect(page.getByText("Captured").first()).toBeVisible();
  const d = new Date(), day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const log = async () => ((await (await request.get(`/api/file?path=log/${day}.md`, { headers: { "x-atlas": "1" } })).json()).text ?? "") as string;
  await expect.poll(log).toContain("a thought from the bar qqz");
});


// Super+E has a capture mode too: `+` makes the bar a capture box — the task
// fields, [[notes and @days are offered as in the Home box, Enter captures, Backspace on empty goes back.
test("+ in the bar is a capture box with the box's completions; Enter captures", async ({ page, request }) => {
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  const palette = page.getByTestId("palette");
  await page.keyboard.press("Meta+e");
  await page.keyboard.type("+");
  await expect(palette.locator(".mode-tag")).toHaveText("Capture");
  await expect(palette.getByRole("textbox")).toHaveValue("");
  await page.keyboard.type("[] water the qqplants ");
  const list = palette.locator(".ta-complete");
  await expect(list).toContainText("due date");
  await expect(list.locator('[aria-selected="true"]')).toContainText("new line");
  await expect(palette.getByTestId("palette-item")).toContainText("a to-do");
  await page.keyboard.press("ArrowDown"); // onto "due date"
  await page.keyboard.press("Enter");
  await expect(list).toContainText("tomorrow");
  await page.keyboard.press("ArrowDown"); // today → tomorrow
  await page.keyboard.press("Enter");
  await expect(palette.getByTestId("palette-item")).toContainText("a to-do, due");
  await page.keyboard.press("Enter"); // the list is closed now: the bar's Enter captures
  await expect(page.getByText("Captured").first()).toBeVisible();
  const d = new Date(), day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const log = await (await request.get(`/api/file?path=log/${day}.md`, { headers: { "x-atlas": "1" } })).json();
  expect(log.text).toMatch(/- \[ \] \d{2}:\d{2} water the qqplants 📅 \d{4}-\d{2}-\d{2}/);
  // Backspace on the empty box: back to the commands
  await page.keyboard.press("Meta+e");
  await page.keyboard.type("+");
  await page.keyboard.press("Backspace");
  await expect(palette.locator(".mode-tag")).toHaveText("Commands");
});

test("a vault script with a built-in command's id does not blank the bar: the first wins, the clash is said", async ({ page }) => {
  // a past crash: a repeated id → Svelte each_key_duplicate → the bar and Settings → Commands drew nothing
  mkdirSync(join(WS, ".atlas/commands"), { recursive: true });
  const file = join(WS, ".atlas/commands/ui.today.toml");
  writeFileSync(file, 'title = "Shadowing home"\nrun = "true"\n');
  const errs: string[] = [];
  page.on("pageerror", (e) => errs.push(e.message));
  try {
    await page.goto("/");
    await page.getByText("Finish the GW notes.").waitFor();
    await page.keyboard.press("Meta+e");
    const palette = page.getByTestId("palette");
    await page.keyboard.type("Home (your home");
    await expect(palette.locator(".item, [role=option]", { hasText: "Home (your home document)" })).toHaveCount(1);
    await expect(palette.getByText("Shadowing home")).toHaveCount(0);
    await expect(page.getByText("Duplicate command")).toBeVisible();
    expect(errs.filter((e) => /each_key_duplicate/.test(e))).toEqual([]);
  } finally {
    unlinkSync(file);
  }
});

// VS Code's habit (found by the phone audit): Ctrl+P is the file finder, and a `>` first makes it the
// commands — before, ">Settings" there said "No matches".
test("> in the file finder turns it into the commands", async ({ page }) => {
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  const palette = page.getByTestId("palette");
  await page.keyboard.press("Control+p");
  await expect(palette.locator(".mode-tag")).toHaveText("Files");
  await page.keyboard.type(">Settings");
  await expect(palette.locator(".mode-tag")).toHaveText("Commands");
  await expect(palette.getByRole("textbox")).toHaveValue(">Settings");
  await expect(palette.getByTestId("palette-item").first()).toContainText("Settings");
});

test("Enter typed before the file search answers opens the first hit when it comes", async ({ page }) => {
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  // a slow search (a big vault, a busy core): the answer comes after the Enter
  await page.route("**/api/search?*", async (r) => { await new Promise((ok) => setTimeout(ok, 800)); await r.fallback(); });
  await page.keyboard.press("Control+p");
  await page.keyboard.type("hubbard");
  await page.keyboard.press("Enter");
  await expect(page.locator(".cm-content")).toContainText("Energy");
  await expect(page.getByTestId("palette")).toHaveCount(0);
});
