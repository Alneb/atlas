import { test, expect } from "@playwright/test";

test("Library lists papers, searches, shows details, copies the citekey", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await page.keyboard.press("Meta+Shift+L");
  const lib = page.locator(".library");
  await expect(lib.locator(".row")).toHaveCount(2);
  await lib.getByPlaceholder(/Search title/).fill("hubbard 1963");
  await expect(lib.locator(".row")).toHaveCount(1);
  await expect(lib.locator(".detail h2")).toHaveText("Electron correlations in narrow energy bands");
  await lib.getByPlaceholder(/Search title/).fill("");
  // sidebar: collections listed apart from tags (tags fold away until opened)
  const side = lib.locator(".side");
  await side.getByRole("button", { name: /Philosophy/ }).click();
  await expect(lib.locator(".row")).toHaveCount(1);
  await expect(lib.locator(".detail .abstract")).toContainText("reductionist");
  await expect(side.locator(".tagitem")).toHaveCount(0);
  await side.getByRole("button", { name: /Tags/ }).click();
  await side.locator(".tagitem", { hasText: "Strongly Correlated" }).click();
  await expect(lib.locator(".row")).toHaveCount(1);
  await expect(lib.locator(".detail h2")).toHaveText("Electron correlations in narrow energy bands");
  await side.getByRole("button", { name: /All references/ }).click();
  await expect(lib.locator(".row")).toHaveCount(2);
  await side.getByRole("button", { name: /Philosophy/ }).click();
  await lib.locator(".detail").getByRole("button", { name: "anderson1972more" }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("anderson1972more");
});

test("dropping a PDF on the Library adds an entry with the file", async ({ page, request }) => {
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await page.keyboard.press("Meta+Shift+L");
  const lib = page.locator(".library");
  await expect(lib.locator(".row")).not.toHaveCount(0);
  const before = await lib.locator(".row").count();
  await page.evaluate(() => {
    const dt = new DataTransfer();
    dt.items.add(new File(["%PDF-1.4\n%%EOF\n"], "Dropped_lecture-notes.pdf", { type: "application/pdf" }));
    const el = document.querySelector(".library")!;
    el.dispatchEvent(new DragEvent("dragover", { dataTransfer: dt, bubbles: true, cancelable: true }));
    el.dispatchEvent(new DragEvent("drop", { dataTransfer: dt, bubbles: true, cancelable: true }));
  });
  await expect(lib.locator(".row")).toHaveCount(before + 1);
  await expect(lib.locator(".detail h2")).toHaveText("Dropped lecture notes");
  await expect(lib.locator(".detail").getByRole("button", { name: /Open PDF/ })).toBeEnabled();
  const bib = await (await request.get("/api/file?path=refs/refs.bib", { headers: { "x-atlas": "1" } })).json();
  expect(bib.text).toContain("dropped");

  // Read: the PDF alone ("it opens both pdf and the note … in the pdf editor there should be an button to do that",
  // 2026-10-15); the PDF's "Note" puts the paper's note in a split beside it
  await lib.locator(".detail").getByRole("button", { name: "Read" }).click();
  const side = page.getByTestId("sidebar");
  await expect(side.locator(".group-head")).toHaveText(["Terminal", "Editor"]);
  await page.locator(".pdf-pane, .dv-active-group").getByRole("button", { name: "Paper's note", exact: true }).first().click();
  // one Editor section; the two halves of the split are one row (Zen's split view), the note's half active
  await expect(side.locator(".group-head")).toHaveText(["Terminal", "Editor"]);
  const split = side.getByTestId("split-row");
  await expect(split.locator(".tab").first()).toContainText(".pdf");
  await expect(split.locator(".tab.active")).toHaveText(/^\s*dropped\s*$/); // the note is named after the citekey
});

test("Library: sort by year / title; delete an entry (asks, goes to the Trash, refs.bib updated)", async ({ page, request }) => {
  const h = { "x-atlas": "1" };
  // an entry of our own to delete (other tests use the fixture papers)
  // as the view's import does: the PDF into catalog-papers' cache, then filed by its helper
  const path = ".atlas/cache/plugins/catalog-papers/import-throwaway.pdf";
  await request.post(`/api/fs/upload?path=${encodeURIComponent(path)}`, { headers: h, data: Buffer.from("%PDF-1.4\n%%EOF\n") });
  await request.post("/api/plugins/catalog-papers/helper", { headers: h, data: { method: "import", params: { path, name: "Throwaway_entry.pdf" } } });
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await page.keyboard.press("Meta+Shift+L");
  const lib = page.locator(".library");
  await lib.getByLabel("Sort by").click();
  await page.getByRole("option", { name: "Sort: year" }).click();
  const years = await lib.locator(".row .m").allTextContents();
  const ys = years.map((t) => Number(t.match(/(\d{4})/)?.[1] ?? 0)).filter(Boolean);
  expect(ys).toEqual([...ys].sort((a, b) => b - a));
  await lib.getByLabel("Sort by").click();
  await page.getByRole("option", { name: "Sort: title" }).click();
  const titles = await lib.locator(".row .t").allTextContents();
  expect(titles).toEqual([...titles].sort((a, b) => a.localeCompare(b)));
  // delete
  await lib.getByPlaceholder(/Search title/).fill("throwaway");
  await expect(lib.locator(".row")).toHaveCount(1);
  // edit in place
  await lib.locator(".detail").getByRole("button", { name: "Edit", exact: true }).click();
  await lib.getByLabel("Title").fill("Throwaway, renamed");
  await lib.getByLabel(/^Tags/).fill("tmp, test");
  await lib.getByRole("button", { name: "Save" }).click();
  await expect(lib.locator(".detail h2")).toHaveText("Throwaway, renamed");
  await expect(lib.locator(".detail .tags")).toContainText("#tmp");
  // the entry's fields are its note's properties (ref_entry.rs): the edit lands there, Zotero's tags as `keywords`
  const note = await (await request.get("/api/file?path=refs/papers/throwaway/throwaway.md", { headers: h })).json();
  expect(note.text).toContain("title: Throwaway, renamed");
  expect(note.text).toMatch(/keywords:\n {2}- tmp\n {2}- test/);
  expect((await request.get("/api/file?path=refs/papers/throwaway/info.yaml", { headers: h })).status()).toBe(404);
  await lib.locator(".detail").getByRole("button", { name: "Delete…" }).click();
  await page.getByRole("button", { name: "Move to Trash" }).click();
  await expect(lib.locator(".row")).toHaveCount(0);
  const bib = await (await request.get("/api/file?path=refs/refs.bib", { headers: h })).json();
  expect(bib.text).not.toContain("throwaway");
});
