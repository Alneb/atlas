import { test, expect, type Page } from "@playwright/test";
import { shownName } from "../src/lib/paths";

// docs/design/SHELL.md: the shell is files. Layouts are JSON in the vault (the current one, and named
// workspaces that are also commands); vaults are a list the chooser reads and writes.
const H = { "x-atlas": "1" };
const openFile = async (page: Page, name: string) => {
  await page.keyboard.press("Control+p");
  const palette = page.getByTestId("palette");
  await expect(palette.getByRole("textbox")).toBeFocused();
  await page.keyboard.type(name);
  await expect(palette.getByText(shownName(name), { exact: true }).first()).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("sidebar").locator(".tab.active")).toContainText(shownName(name));
  await expect(page.locator(".cm-editor.cm-focused")).toBeVisible(); // the note takes the keys once loaded
};
const run = async (page: Page, command: string) => {
  await page.keyboard.press("Meta+e"); // the palette from anywhere (Ctrl+K is "link" in a note)
  const palette = page.getByTestId("palette");
  await expect(palette.getByRole("textbox")).toBeFocused();
  await page.keyboard.type(command);
  await expect(palette.getByText(command).first()).toBeVisible();
  await page.keyboard.press("Enter");
};
const tabs = (page: Page) => page.getByTestId("sidebar").locator(".tab");

test("a workspace saves the open tabs to a file, and switching to it brings them back", async ({ page, request }) => {
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor(); // home has loaded
  await openFile(page, "aids.md");
  await openFile(page, "related.md");
  await expect(tabs(page).filter({ hasText: "related" })).toBeVisible();
  await run(page, "Workspace: save the current tabs as");
  await page.keyboard.type("Pair");
  await expect(page.getByTestId("palette").getByText("Save as “Pair”")).toBeVisible();
  await page.keyboard.press("Enter");
  await expect.poll(() => request.get("/api/file?path=.atlas/workspaces/Pair.json", { headers: H }).then((r) => r.status())).toBe(200);

  // close both, then come back to them in one step — as a command of its own
  await tabs(page).filter({ hasText: "related" }).click();
  await page.keyboard.press("Control+w");
  await tabs(page).filter({ hasText: "aids" }).click();
  await page.keyboard.press("Control+w");
  await expect(tabs(page).filter({ hasText: "aids" })).toHaveCount(0);
  await run(page, "Workspace: Pair");
  await expect(tabs(page).filter({ hasText: "aids" })).toBeVisible();
  await expect(tabs(page).filter({ hasText: "related" })).toBeVisible();

  // the current layout is a file too: a reload of the window keeps the tabs
  await expect.poll(() => request.get("/api/file?path=.atlas/cache/layout.json", { headers: H }).then((r) => r.json()).then((j) => String(j.text ?? ""))).toContain("related.md");
  await page.reload();
  await expect(tabs(page).filter({ hasText: "related" })).toBeVisible();
});

test("the vault chooser lists vaults, opens a typed folder and creates it only when asked", async ({ page, request }) => {
  const root: string = (await (await request.get("/api/workspace", { headers: H })).json()).root;
  const personal = `${root}-personal`;
  const name = personal.split("/").pop()!; // the run's own folder name (ATLAS_PW_WS may move it)
  const vaults = () => request.get("/api/vaults", { headers: H }).then((r) => r.json()).then((l) => (l.vaults as { path: string; missing: boolean }[]));
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  // the vault's name in the sidebar is the chooser: the switcher dialog (0d396e1), a typed folder offered to open
  await page.getByTestId("sidebar").getByRole("button", { name: root.split("/").pop()! }).click();
  const dlg = page.getByTestId("vault-switcher");
  await expect(dlg.getByRole("textbox", { name: "Search vaults" })).toBeFocused();
  await page.keyboard.type(personal);
  await dlg.getByText(`Open the folder ${personal}`).click();
  // not a folder yet: nothing is created until the user says so
  await expect(page.getByTestId("palette").getByText(`Create a new vault at ${personal}`)).toBeVisible();
  expect((await vaults()).some((v) => v.path === personal)).toBe(false);
  await page.keyboard.press("Enter");
  await expect.poll(vaults).toContainEqual(expect.objectContaining({ path: personal, missing: false }));
  // listed next time (from this window's vault: the new one is the window's own there), and forgettable (the folder stays)
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await page.keyboard.press("Control+Alt+v");
  const row = dlg.locator(`[data-vault="${name}"]`);
  await expect(row).toBeVisible();
  await row.hover();
  await row.getByRole("button", { name: "Remove" }).click();
  await row.getByRole("button", { name: "Remove?" }).click();
  await expect.poll(vaults).not.toContainEqual(expect.objectContaining({ path: personal }));
});

test("quick open: Ctrl+Enter opens the file beside the active tab instead of over it", async ({ page }) => {
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  const palette = page.getByTestId("palette");
  const side = page.getByTestId("sidebar");
  await page.keyboard.press("Control+p");
  await expect(palette.getByRole("textbox")).toBeFocused();
  await page.keyboard.type("hubbard");
  await expect(palette.getByText("hubbard", { exact: true }).first()).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page.locator(".cm-editor.cm-focused")).toBeVisible();
  await page.keyboard.press("Control+p");
  await expect(palette.getByRole("textbox")).toBeFocused();
  await page.keyboard.type("related");
  await expect(palette.getByText("related", { exact: true }).first()).toBeVisible();
  await expect(palette.getByText("open beside")).toBeVisible();
  await page.keyboard.press("Control+Enter");
  const split = side.getByTestId("split-row"); // the two halves: one row of the one Editor section (Zen)
  await expect(side.locator(".group-head")).toHaveText(["Terminal", "Editor"]);
  await expect(split.locator(".tab")).toHaveCount(2);
  await expect(split.locator(".tab.active")).toHaveText(/related/);
  await expect(page.locator(".cm-editor.cm-focused", { hasText: "Related" })).toBeVisible(); // the new note takes the keys once loaded
  // a third file opened beside goes to the other split, not a third one
  await page.keyboard.press("Control+p");
  await expect(palette.getByRole("textbox")).toBeFocused();
  await page.keyboard.type("paste");
  await expect(palette.getByTestId("palette-item").filter({ hasText: "paste" }).first()).toBeVisible();
  await page.keyboard.press("Control+Enter");
  await expect(split.locator(".tab")).toHaveCount(2);
  await expect(split.locator(".tab.active")).toHaveText(/paste/);
  await expect(split.locator(".tab", { hasText: "related" })).toHaveCount(1);
});

test("the side panel hides and comes back without closing its tools (Super+B, the button in its row, the footer's)", async ({ page }) => {
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  const side = page.getByTestId("sidebar"), pane = page.locator(".dv-groupview .side-pane").first();
  await page.keyboard.press("Meta+Shift+f");
  await expect(pane).toBeVisible();
  await expect(side.locator(".tab", { hasText: "Files" }), "a tool is not a tab").toHaveCount(0);
  await page.getByTestId("side-head").getByRole("button", { name: "Hide the side panel" }).click();
  await expect(pane).toBeHidden();
  await expect(page.locator(".dv-groupview .side-pane")).toHaveCount(1); // still open, only out of sight
  await page.keyboard.press("Meta+b");
  await expect(pane).toBeVisible();
  await side.getByRole("button", { name: "Side panel (show / hide)" }).click();
  await expect(pane).toBeHidden();
});
