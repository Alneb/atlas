import { test, expect, type Page } from "@playwright/test";
import { restoreCatalog, withCatalog } from "./fixtures/catalog";

// A DOI link is a paper (lib/doi-links.ts): `[text](https://doi.org/10.…)` whose paper the library has is drawn and
// followed as that paper's `[[citekey]]` note, its text unchanged, in the live editor and the reading view; one the
// library lacks is dashed, and "Add to library…" in its menu (or a click) opens Catalog's own "Add to the catalog"
// dialog on it. The test vault's library has anderson1972more (DOI 10.1126/science.177.4047.393); the catalog's helper
// is a stand-in answering `preview`.
const H = { "x-atlas": "1" };
const KNOWN = "https://doi.org/10.1126/science.177.4047.393";
const UNKNOWN = "https://doi.org/10.9999/atlas.test.1";
const NOTE = `# Cited\n\nAs [Anderson 1972](${KNOWN}) argued, and [Nobody 2020](${UNKNOWN}) did not.\n`;

const PREVIEW = {
  candidate: { kind: "paper", ids: { doi: "10.9999/atlas.test.1" }, label: "A test paper" },
  searched: false, label: "Papers", path: "refs/papers/nobody2020test/nobody2020test.md", exists: false, merged: { fields: { title: "A test paper" } },
};
const HELPER = `import json, sys
for line in sys.stdin:
    m = json.loads(line)
    r = {"kinds": []}
    if m["method"] == "preview": r = {"result": json.loads(${JSON.stringify(JSON.stringify(PREVIEW))}), "steps": []}
    print(json.dumps({"id": m["id"], "result": r}), flush=True)
`;

test.beforeAll(async ({ request }) => {
  await withCatalog(request, HELPER, ["main.js", "add.js"]);
  await request.put("/api/file", { headers: H, data: { path: "notes/doi-cited.md", text: NOTE } });
  await request.put("/api/file", { headers: H, data: { path: "DoiCited.page", text: "rows:\n  - [{note: notes/doi-cited.md}]\n" } });
});
test.afterAll(async ({ request }) => {
  await restoreCatalog(request, ["main.js", "add.js"]);
  for (const p of ["notes/doi-cited.md", "DoiCited.page"]) await request.post(`/api/fs/trash?path=${encodeURIComponent(p)}`, { headers: H });
});

async function open(page: Page, typed: string, shown: string) {
  await page.keyboard.press("Control+p");
  await expect(page.getByTestId("palette").getByRole("textbox")).toBeFocused();
  await page.keyboard.type(typed);
  await expect(page.getByTestId("palette").locator(".item.sel")).toContainText(shown);
  await page.keyboard.press("Enter");
}

test("a DOI link: dashed when not in the library (its menu offers Catalog's dialog), else the paper's [[citekey]] note", async ({ page }) => {
  const errs: string[] = [];
  page.on("pageerror", (e) => errs.push(e.message));
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await open(page, "doi-cited", "doi-cited");

  // the live editor: the unfiled one dashed, the filed one not; a click on the filed one opens its paper's note
  const unknown = page.locator(".cm-content .cm-link", { hasText: "Nobody 2020" }).first();
  const known = page.locator(".cm-content .cm-link", { hasText: "Anderson 1972" }).first();
  await expect(unknown).toHaveClass(/not-in-library/, { timeout: 15_000 });
  await expect(known).toHaveClass(/doi-link/);
  await expect(known).not.toHaveClass(/not-in-library/);
  await known.click();
  await expect(page.locator(".dv-tab.dv-active-tab")).toContainText("anderson1972more", { timeout: 15_000 });

  // its note is a file now: back in the citing note the link is drawn as [[anderson1972more]], the text unchanged
  await open(page, "doi-cited", "doi-cited");
  const asNote = page.locator('.cm-content .cm-link.cm-hmd-internal-link[data-target="anderson1972more"]');
  await expect(asNote.first()).toHaveText("Anderson 1972", { timeout: 15_000 });

  // the reading view (a note block on a page): the same two
  await open(page, "DoiCited.page", "DoiCited");
  const read = page.locator(".page-pane, .atlas-block");
  const filed = read.locator('a.internal-link.doi-link[data-href="anderson1972more"]');
  await expect(filed).toHaveText("Anderson 1972", { timeout: 15_000 });
  const dashed = read.locator("a.doi-link.not-in-library", { hasText: "Nobody 2020" });
  await expect(dashed).toBeVisible();
  for (const scheme of ["light", "dark"] as const) { // judged in both themes (docs/guides/UI-STYLE.md)
    await page.emulateMedia({ colorScheme: scheme });
    await page.screenshot({ path: `test-results/doi-links-${scheme}.png` });
  }

  // its menu: "Add to library…" opens Catalog's own dialog on the DOI, which looks it up
  await dashed.click({ button: "right" });
  await page.getByRole("menuitem", { name: /Add to library/ }).click();
  const dialog = page.locator(".cat-add");
  await expect(dialog.locator("input")).toHaveValue(UNKNOWN);
  await expect(dialog.locator(".cat-preview .cat-title")).toHaveText("A test paper", { timeout: 15_000 });
  await expect(dialog.locator(".cat-preview")).toContainText("Paper");
  expect(errs).toEqual([]);
});
