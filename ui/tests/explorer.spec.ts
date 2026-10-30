import { test, expect, type Page } from "@playwright/test";
import { runCommand } from "./open";

// The explorer (panes/Explorer.svelte) on the vault: one explorer shared by the local
// files, SSH hosts and copyparty servers, where files are edited, sent and downloaded. The SSH side of the same pane: example-sftp.spec.ts.
const H = { "x-atlas": "1" };

test("the vault in the explorer: browse, sort, upload from the computer, rename, open, move, trash", async ({ page, request }) => {
  await request.put("/api/file", { headers: H, data: { path: "explorer-test/alpha.md", text: "# Alpha\n\nfirst\n" } });
  await request.put("/api/file", { headers: H, data: { path: "explorer-test/beta.txt", text: "a longer file, to sort by size\n".repeat(4) } });
  await request.put("/api/file", { headers: H, data: { path: "explorer-test/inner/gamma.md", text: "# Gamma\n" } });
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await runCommand(page, "the explorer", "Files: the explorer (vault, SSH hosts, servers)");
  const pane = page.locator(".explorer");
  const row = (name: string) => pane.locator(".x-row", { has: page.locator(".label", { hasText: new RegExp(`^${name.replace(/[.[\]]/g, "\\$&")}$`) }) });
  await expect(pane.locator(".place.on")).toBeVisible(); // the vault, at the left
  await row("explorer-test").dblclick();
  await expect(row("alpha.md")).toContainText("15 B");
  await expect(pane.locator(".crumbs")).toContainText("explorer-test");
  // folders first, then by name; a click on Size sorts the files by size, largest first
  await expect(pane.locator(".x-row .label")).toHaveText(["inner", "alpha.md", "beta.txt"]);
  await pane.getByRole("button", { name: "Size", exact: true }).click();
  await expect(pane.locator(".x-row .label")).toHaveText(["inner", "beta.txt", "alpha.md"]);
  await pane.getByRole("button", { name: "Name", exact: true }).click();

  // the keyboard: a letter jumps, Enter goes in, Backspace comes back to the folder it was in
  await pane.locator(".list").focus();
  await page.keyboard.press("i");
  await expect(row("inner")).toHaveClass(/sel/);
  await page.keyboard.press("Enter");
  await expect(row("gamma.md")).toBeVisible();
  await page.keyboard.press("Backspace");
  await expect(row("inner")).toHaveClass(/sel/);
  await page.keyboard.press("Alt+ArrowLeft"); // back: inside inner
  await expect(row("gamma.md")).toBeVisible();
  await page.keyboard.press("Alt+ArrowRight");
  await expect(row("alpha.md")).toBeVisible();

  // from this computer (the file chooser)
  await pane.locator('input[type="file"]').setInputFiles([{ name: "from-disk.bin", mimeType: "application/octet-stream", buffer: Buffer.from([0, 1, 2, 3, 255]) }]);
  await expect(row("from-disk.bin")).toContainText("5 B");
  // again: asks before replacing
  await pane.locator('input[type="file"]').setInputFiles([{ name: "from-disk.bin", mimeType: "application/octet-stream", buffer: Buffer.from([9]) }]);
  await expect(pane.getByRole("alertdialog")).toContainText("already in explorer-test");
  await pane.getByRole("alertdialog").getByRole("button", { name: "Replace" }).click();
  await expect(row("from-disk.bin")).toContainText("1 B");

  // rename in place (F2); the name without its extension is selected
  await row("beta.txt").click();
  await page.keyboard.press("F2");
  const name = pane.getByRole("textbox", { name: "New name for beta.txt" });
  await expect(name).toBeFocused();
  await page.keyboard.type("renamed");
  await page.keyboard.press("Enter");
  await expect(row("renamed.txt")).toBeVisible();
  expect((await request.get("/api/file?path=explorer-test/renamed.txt", { headers: H })).ok()).toBe(true);

  // Enter opens a file in its tab, the same editor as everywhere
  await row("alpha.md").click();
  await page.keyboard.press("Enter");
  await expect(page.locator(".dv-active-group .cm-editor")).toContainText("first");

  // dragged onto a folder: moved into it
  await page.getByTestId("sidebar").locator(".tab", { hasText: "explorer-test" }).click();
  await row("renamed.txt").dragTo(row("inner"));
  await expect(row("renamed.txt")).toHaveCount(0);
  expect((await request.get("/api/file?path=explorer-test/inner/renamed.txt", { headers: H })).ok()).toBe(true);

  // Delete: to the Trash, asked first
  await row("from-disk.bin").click();
  await pane.locator(".list").press("Delete");
  await pane.getByRole("alertdialog").getByRole("button", { name: "Move to Trash" }).click();
  await expect(row("from-disk.bin")).toHaveCount(0);
  await expect(pane.locator(".status .msg")).toContainText("Moved to .atlas/trash");
});

// The Thumbnails view: pictures, the first page of a PDF, the
// file's icon for the rest; ← → move one tile, ↓ a line; the choice is remembered.
const PNG = "iVBORw0KGgoAAAANSUhEUgAAACgAAAAoCAIAAAADnC86AAAALklEQVR4nO3NsQkAAAgDsB7W//EsnxBcAtmTaV9ELBaLxWKxWCwWi8VisVgsvrMSJtBqhGOEbwAAAABJRU5ErkJggg==";
const PDF = "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 260]/Contents 4 0 R>>endobj\n4 0 obj<</Length 35>>stream\n0 0 1 rg 20 20 160 220 re f\nendstream endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n";

test("thumbnails: pictures and the first page of PDFs, by keys, remembered", async ({ page, request }) => {
  expect((await request.post("/api/fs/upload?path=thumbs-test/dot.png", { headers: H, data: Buffer.from(PNG, "base64") })).ok()).toBe(true);
  await request.put("/api/file", { headers: H, data: { path: "thumbs-test/paper.pdf", text: PDF } });
  await request.put("/api/file", { headers: H, data: { path: "thumbs-test/zz note.md", text: "# Note\n" } });
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await runCommand(page, "the explorer", "Files: the explorer (vault, SSH hosts, servers)");
  const pane = page.locator(".explorer");
  const row = (name: string) => pane.locator(".x-row", { has: page.locator(".label", { hasText: name }) });
  await row("thumbs-test").dblclick();
  await pane.getByRole("button", { name: "Thumbnails" }).click();
  await expect(pane.locator(".list")).toHaveClass(/thumbs/);
  await expect(row("dot.png")).toHaveClass(/has-thumb/);
  await expect(row("paper.pdf")).toHaveClass(/has-thumb/);
  await expect(row("zz note.md")).not.toHaveClass(/has-thumb/);
  await expect(row("zz note.md").locator(".pic svg")).toBeVisible(); // its icon instead
  // a grid: → is the next tile, ← the one before
  await pane.locator(".list").focus();
  await page.keyboard.press("Home");
  await page.keyboard.press("ArrowRight");
  await expect(row("paper.pdf")).toHaveClass(/sel/);
  await page.keyboard.press("ArrowLeft");
  await expect(row("dot.png")).toHaveClass(/sel/);
  // remembered: the next explorer opens in Thumbnails
  await page.reload();
  await page.getByText("Finish the GW notes.").waitFor();
  await runCommand(page, "the explorer", "Files: the explorer (vault, SSH hosts, servers)");
  await expect(page.locator(".explorer .list")).toHaveClass(/thumbs/);
  await page.locator(".explorer").getByRole("button", { name: "List" }).click();
  await expect(page.locator(".explorer .list")).not.toHaveClass(/thumbs/);
});
