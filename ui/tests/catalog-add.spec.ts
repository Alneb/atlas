import { test, expect, type APIRequestContext } from "@playwright/test";
import { restoreCatalog, withCatalog } from "./fixtures/catalog";

// "Add to the catalog…" is a dialog: the collections block's own form (addBox in main.js, mounted by add.js) — what is
// typed looked up, its card with the other matches as chips, then Add opens the note and closes the dialog. The
// helper is a stand-in answering `preview` and `add`.
const H = { "x-atlas": "1" };
const put = (request: APIRequestContext, path: string, text: string) => request.put("/api/file", { headers: H, data: { path, text } });

const PREVIEW = {
  candidate: { kind: "film", ids: { imdb: "tt1160419" }, label: "Dune (2021)" },
  others: [{ kind: "book", ids: { isbn: "9780441013593" }, label: "Dune (book)" }],
  searched: true, label: "Films", path: "Shelf/Films/Dune.md", exists: false, merged: { fields: { title: "Dune" } },
};
const HELPER = `import json, sys
for line in sys.stdin:
    m = json.loads(line)
    r = {"kinds": []}
    if m["method"] == "preview": r = {"result": json.loads(${JSON.stringify(JSON.stringify(PREVIEW))}), "steps": []}
    if m["method"] == "add":
        p = m.get("params") or {}
        r = {"result": {"path": "Shelf/Films/Dune.md" if p.get("kind") == "film" else "Shelf/Books/Dune.md"}}
    print(json.dumps({"id": m["id"], "result": r}), flush=True)
`;

test.beforeAll(async ({ request }) => {
  await withCatalog(request, HELPER, ["main.js", "add.js"]); // the vault's copy (its page) with its main.js and the dialog
  await put(request, "Shelf/Films/Dune.md", "---\ntype: film\ntitle: Dune\n---\nThe film note.\n");
});
test.afterAll(async ({ request }) => {
  await restoreCatalog(request, ["main.js", "add.js"]);
  await request.post(`/api/fs/trash?path=Shelf`, { headers: H });
});

test("Add to the catalog… opens a dialog: look up, the matches as chips, Add opens the note and closes it", async ({ page }) => {
  const errs: string[] = [];
  page.on("pageerror", (e) => errs.push(e.message));
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await page.keyboard.press("F1");
  await page.keyboard.type("Add to the catalog");
  await page.keyboard.press("Enter");
  const dialog = page.locator(".cat-add");
  await expect(dialog.locator("input")).toBeFocused({ timeout: 15_000 });
  await page.keyboard.type("dune");
  await page.keyboard.press("Enter");
  await expect(dialog.getByText("Add to Films: Dune")).toBeVisible({ timeout: 15_000 });
  await expect(dialog.getByRole("button", { name: "Dune (book)" })).toBeVisible();
  for (const scheme of ["light", "dark"] as const) { // judged in both themes (docs/guides/UI-STYLE.md)
    await page.emulateMedia({ colorScheme: scheme });
    await page.screenshot({ path: `test-results/catalog-add-${scheme}.png` });
  }
  await dialog.getByRole("button", { name: "Add", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByText("The film note.")).toBeVisible();
  expect(errs).toEqual([]);
});
