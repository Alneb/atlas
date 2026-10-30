import { test, expect } from "@playwright/test";
import { openFile, runCommand } from "./open";

// Renaming the open file: the box starts with its name, which offers nothing to do; a new name offers the rename itself
// (not a "New" row), and the note keeps its .md.
const H = { "x-atlas": "1" };

test("rename this file: the name as it is offers nothing, a new one renames it", async ({ page, request }) => {
  await request.put("/api/file", { headers: H, data: { path: "notes/renamee.md", text: "# Renamee\n" } });
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await openFile(page, "notes/renamee.md");
  await runCommand(page, "File: rename this file", "File: rename this file");
  const bar = page.getByTestId("palette");
  await expect(bar.getByRole("textbox")).toHaveValue("renamee");
  await expect(bar.getByTestId("palette-item")).toHaveCount(0);
  await expect(bar.locator(".none")).toHaveText("New name for renamee.md");
  await bar.getByRole("textbox").fill("renamed");
  await expect(bar.getByTestId("palette-item")).toHaveText(["Rename to renamed.md"]);
  await expect(bar.locator(".section")).toHaveCount(0);
  await page.keyboard.press("Enter");
  await expect.poll(async () => (await request.get("/api/file?path=notes/renamed.md", { headers: H })).ok()).toBe(true);
  expect((await request.get("/api/file?path=notes/renamee.md", { headers: H })).ok()).toBe(false);
  await request.post(`/api/fs/trash?path=${encodeURIComponent("notes/renamed.md")}`, { headers: H });
});
