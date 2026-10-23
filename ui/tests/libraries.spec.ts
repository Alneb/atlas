import { test, expect, type Page } from "@playwright/test";
import lz from "lz-string";
const { compressToBase64 } = lz;

// The vault's libraries in one page (docs/design/DESIGN-libraries-everywhere.md): the Drawings library lists
// every drawing — not a file's ink — with its note's properties as the filters, and draws each one's first page.
const H = { "x-atlas": "1" };
const put = (page: Page, path: string, text: string) => page.request.put("/api/file", { headers: H, data: { path, text } });
const rect = (id: string, x: number, frameId: string | null = null) => ({ id, type: "rectangle", x, y: 40, width: 200, height: 120, angle: 0, strokeColor: "#1e1e1e", backgroundColor: "transparent", fillStyle: "solid", strokeWidth: 2, strokeStyle: "solid", roughness: 0, opacity: 100, groupIds: [], frameId, roundness: null, seed: 1, version: 1, versionNonce: 1, isDeleted: false, boundElements: null, updated: 1, link: null, locked: false });
const frame = (id: string, x: number) => ({ ...rect(id, x), type: "frame", y: 0, width: 794, height: 1123, name: null });
const scene = (elements: unknown[]) => JSON.stringify({ type: "excalidraw", version: 2, source: "atlas", elements, appState: { viewBackgroundColor: "#ffffff" }, files: {} });

test("the Drawings library: every drawing with its note's properties as filters, its first page as the cover", async ({ page }) => {
  await put(page, "libs/sketch.excalidraw", scene([rect("a", 0)]));
  await put(page, "libs/lecture.excalidraw", scene([frame("p1", 0), rect("b", 40, "p1"), frame("p2", 900)]));
  await put(page, "libs/paper.pdf.excalidraw", scene([rect("c", 0)])); // a PDF's ink: the PDF's, not a drawing
  // its note (written on the save above) with the user's own properties: the filters
  await expect.poll(async () => (await page.request.get("/api/file?path=libs/lecture.md", { headers: H })).status()).toBe(200);
  // its own project name: the suite shares one workspace, and notes-system.spec counts Thesis's backlinks
  await put(page, "libs/lecture.md", "---\ndrawing: '[[lecture.excalidraw]]'\npages: 2\nproject: '[[QFT course]]'\ntags: [qft]\n---\n");
  await put(page, "libs/uses lecture.md", "the board: ![[lecture.excalidraw]]\n");

  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await page.keyboard.press("F1");
  await page.keyboard.type("Libraries");
  await page.getByTestId("palette").getByText("Libraries (drawings, references, films, comics…)").click();

  const libs = page.locator(".libraries");
  await libs.getByRole("tab", { name: "Drawings" }).click();
  const titles = libs.locator(".library .t");
  await expect(titles.filter({ hasText: "lecture" })).toBeVisible();
  await expect(titles.filter({ hasText: "sketch" })).toBeVisible();
  await expect(titles.filter({ hasText: "paper.pdf" })).toHaveCount(0);
  // the project is a group at the side; picking it leaves the drawings in it
  await libs.locator(".side").getByText("QFT course").click();
  await expect(titles.filter({ hasText: "sketch" })).toHaveCount(0);
  await expect(titles.filter({ hasText: "lecture" })).toBeVisible();
  // its first page drawn as its cover
  await expect(libs.locator("img.cover").first()).toHaveAttribute("src", /^blob:/, { timeout: 20_000 });
  // the detail: open it, or its properties (its note)
  await titles.filter({ hasText: "lecture" }).click();
  // the links to it at the bottom of the card, as under a note
  await expect(libs.locator(".links-bar .backlinks")).toContainText(/Linked mentions\s*2 from 2 notes/); // its own note and the page
  await libs.getByRole("button", { name: "Properties" }).click();
  await expect(page.locator(".dv-active-group .cm-editor")).toContainText(/Properties\s*4/); // drawing, pages, project, tags
});

// "i cannot manage the drawings in the library, i cannot rename them, delete them, create new ones" (2026-10-20): the
// detail renames (its note following it, the core's move) and deletes (its note too), the header makes a new one
test("the Drawings library renames a drawing with its note, deletes one, and makes a new one", async ({ page }) => {
  await put(page, "libs2/old name.excalidraw", scene([rect("a", 0)]));
  await expect.poll(async () => (await page.request.get("/api/file?path=libs2/old%20name.md", { headers: H })).status()).toBe(200);
  await put(page, "libs2/gone.excalidraw", scene([rect("b", 0)]));
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await page.keyboard.press("F1");
  await page.keyboard.type("Libraries");
  await page.getByTestId("palette").getByText("Libraries (drawings, references, films, comics…)").click();
  const libs = page.locator(".libraries");
  await libs.getByRole("tab", { name: "Drawings" }).click();
  const titles = libs.locator(".library .t");
  await titles.filter({ hasText: "old name" }).click();
  await libs.getByRole("button", { name: "Rename" }).click();
  await libs.getByLabel("Name").fill("new name");
  await libs.getByRole("button", { name: "Save" }).click();
  await expect(titles.filter({ hasText: "new name" })).toBeVisible();
  const status = (p: string) => page.request.get(`/api/file?path=${encodeURIComponent(p)}`, { headers: H }).then((r) => r.status());
  expect(await status("libs2/new name.excalidraw")).toBe(200);
  expect(await status("libs2/old name.md")).toBe(404);
  expect(await page.request.get(`/api/file?path=${encodeURIComponent("libs2/new name.md")}`, { headers: H }).then((r) => r.json()).then((j) => j.text)).toContain("[[new name.excalidraw]]");
  // delete: asked, then gone with its note
  await titles.filter({ hasText: "gone" }).click();
  await libs.getByRole("button", { name: "Delete" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete" }).click();
  await expect(titles.filter({ hasText: "gone" })).toHaveCount(0);
  expect(await status("libs2/gone.excalidraw")).toBe(404);
  // new: its pages and paper asked, then it opens
  await libs.getByRole("button", { name: "New drawing" }).click();
  await page.getByTestId("palette").getByText("Infinite canvas", { exact: true }).click();
  await expect(page.locator(".draw-pane canvas.interactive")).toBeVisible({ timeout: 15_000 });
});

test("the Drawings library converts the Obsidian Excalidraw plugin's drawings into drawings with their notes", async ({ page }) => {
  // as the plugin writes them
  // named as the plugin names them, a time with dots last: once taken for a file's ink (`x.pdf.excalidraw`) and not listed
  const obsidian = (json: string) => `---\nexcalidraw-plugin: parsed\ntags:\n  - excalidraw\n---\n==⚠  Switch to EXCALIDRAW VIEW ⚠==\n\n\n# Excalidraw Data\n\n## Text Elements\n%%\n## Drawing\n\`\`\`compressed-json\n${compressToBase64(json).match(/.{1,256}/g)!.join("\n\n")}\n\`\`\`\n%%`;
  await put(page, "libs3/Lecture 2025-11-21 14.37.13.excalidraw.md", obsidian(scene([rect("a", 0), rect("b", 300)])));
  await put(page, "libs3/taken.excalidraw.md", obsidian(scene([rect("c", 0)])));
  await put(page, "libs3/taken.md", "the user's own note of that name: left alone, and so is the drawing\n");
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await page.keyboard.press("F1");
  await page.keyboard.type("Libraries");
  await page.getByTestId("palette").getByText("Libraries (drawings, references, films, comics…)").click();
  const libs = page.locator(".libraries");
  await libs.getByRole("tab", { name: "Drawings" }).click();
  await libs.getByRole("button", { name: /^Convert \d+ Obsidian drawings?$/ }).click();
  await page.getByRole("button", { name: "Convert", exact: true }).click();
  const status = (p: string) => page.request.get(`/api/file?path=${encodeURIComponent(p)}`, { headers: H }).then((r) => r.status());
  await expect.poll(() => status("libs3/Lecture 2025-11-21 14.37.13.excalidraw")).toBe(200);
  const drawn = JSON.parse((await (await page.request.get(`/api/file?path=${encodeURIComponent("libs3/Lecture 2025-11-21 14.37.13.excalidraw")}`, { headers: H })).json()).text);
  expect(drawn.elements.map((e: { id: string }) => e.id)).toEqual(["a", "b"]);
  await expect.poll(() => status("libs3/Lecture 2025-11-21 14.37.13.md")).toBe(200); // its companion note, written by the core
  expect(await status("libs3/Lecture 2025-11-21 14.37.13.excalidraw.md")).toBe(404); // in the Trash
  expect(await status("libs3/taken.excalidraw.md")).toBe(200); // left: its note's name is the user's
  expect(await status("libs3/taken.excalidraw")).toBe(404);
  await expect(page.locator(".toast", { hasText: "1 Obsidian drawing converted" })).toBeVisible();
  await expect(libs.locator(".library .t", { hasText: "Lecture 2025-11-21 14.37.13" })).toBeVisible();
});

// "dragging the mouse does not select text, that it does actual file selection" (2026-10-21): a drag draws a rectangle
// that picks the items it touches; Ctrl+A picks all, Esc lets go; several picked offer what can be done with them
test("a library picks items by dragging over them, as a file manager, never selecting text", async ({ page }) => {
  for (const n of ["one", "two", "three"]) await put(page, `libs4/pick ${n}.excalidraw`, scene([rect(n, 0)]));
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await page.keyboard.press("F1");
  await page.keyboard.type("Libraries");
  await page.getByTestId("palette").getByText("Libraries (drawings, references, films, comics…)").click();
  const libs = page.locator(".libraries");
  await libs.getByRole("tab", { name: "Drawings" }).click();
  await libs.getByRole("radio", { name: "List" }).click().catch(() => {});
  await libs.locator(".library .search").fill("pick ");
  const rows = libs.locator(".library .list [data-pick]");
  await expect(rows).toHaveCount(3);
  const a = (await rows.nth(0).boundingBox())!, b = (await rows.nth(1).boundingBox())!;
  await page.mouse.move(a.x + a.width / 2, a.y + 4);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 8 });
  await expect(libs.locator(".list .marquee")).toBeVisible();
  await page.mouse.up();
  await expect(libs.locator(".detail.many .kind")).toHaveText("2 drawings picked");
  await expect(libs.locator(".list .sel")).toHaveCount(2);
  expect(await page.evaluate(() => String(window.getSelection() ?? ""))).toBe("");
  await expect(libs.getByRole("button", { name: "Delete 2…" })).toBeVisible();
  await libs.locator(".library").press("Control+a");
  await expect(libs.locator(".detail.many .kind")).toHaveText("3 drawings picked");
  await libs.locator(".library").press("Escape");
  await expect(libs.locator(".detail.many")).toHaveCount(0);
});
