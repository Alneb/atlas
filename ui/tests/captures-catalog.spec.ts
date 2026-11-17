import { test, expect, type APIRequestContext } from "@playwright/test";
import { catalogFile, catalogManifest, CATALOG_DIR, restoreCatalog } from "./fixtures/catalog";

// The captures' answers that go through the catalog (docs/design/DESIGN-capture-triage.md): "Catalogue" runs its `add`
// on the capture and links the capture to the note it made (or says why not); a link to a file (a PDF, an EPUB) also
// offers "Download", its `download` (the file kept in the documents folder with its note). The helper is a stand-in
// answering its tools as the engine would; the engine's own decisions are its unit tests (engine.rs, document.rs).
const H = { "x-atlas": "1" };
const LOG = "log/2020-04-07.md";
const PDF = "https://files.example.org/Books/Group%20Theory%20(2010).pdf";
const put = (request: APIRequestContext, path: string, text: string) => request.put("/api/file", { headers: H, data: { path, text } });
const read = async (request: APIRequestContext, path: string) => ((await (await request.get(`/api/file?path=${encodeURIComponent(path)}`, { headers: H })).json()) as { text: string }).text;

const HELPER = `import json, sys
for line in sys.stdin:
    m = json.loads(line)
    p = m.get("params") or {}
    t = p.get("text", "")
    out = {"id": m["id"], "result": {"kinds": []}}
    if m["method"] == "add":
        if "nothing to see" in t: out = {"id": m["id"], "error": "plain words: nothing to catalogue in them"}
        else: out["result"] = {"path": "Shelf/Pages/A page.md", "outcome": "Created", "kind": "web", "steps": []}
    if m["method"] == "document_types":
        out["result"] = ["pdf", "epub"]
    if m["method"] == "download":
        out["result"] = {"path": "documents/Group Theory (2010).md", "file": "documents/Group Theory (2010).pdf", "outcome": "Created", "kind": "document", "steps": []}
    print(json.dumps(out), flush=True)
`;
const TOOLS = ["add", "download", "document_types"].map((n) => `\n[[tool]]\nname = "${n}"\ndescription = "stand-in"\ninput = ${n === "document_types" ? "{}" : '{ text = "string" }'}\n`).join("");

test.beforeAll(async ({ request }) => {
  // the catalog by its role (`provides = ["catalog"]`), with the two tools and the stand-in helper; no capture hook
  await put(request, `${CATALOG_DIR}/helper.py`, HELPER);
  await put(request, `${CATALOG_DIR}/main.js`, catalogFile("main.js"));
  await put(request, `${CATALOG_DIR}/plugin.toml`, catalogManifest(`\n[helper]\nrun = "python3 -u \\"$ATLAS_PLUGIN_DIR/helper.py\\""\n${TOOLS}`));
  await put(request, "Shelf/Pages/A page.md", "---\ntype: web\n---\nThe page's note.\n");
  await put(request, "documents/Group Theory (2010).md", "---\ntype: document\n---\nThe document's note.\n");
  await put(request, LOG, `---\ndate: 2020-04-07\ntype: log\n---\n# Tuesday, 7 April 2020\n\n## Log\n- 09:00 read later https://example.org/a-page\n- 10:00 chapters 9 and 10 ${PDF}\n- 11:00 nothing to see here\n`);
});
test.afterAll(async ({ request }) => {
  await restoreCatalog(request);
  for (const p of [LOG, "Shelf", "documents"]) await request.post(`/api/fs/trash?path=${encodeURIComponent(p)}`, { headers: H });
});

test("a capture is catalogued or its file downloaded through the catalog, and links to the note made", async ({ page, request }) => {
  const errs: string[] = [];
  page.on("pageerror", (e) => errs.push(e.message));
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await page.keyboard.press("Control+p");
  await page.keyboard.type(">Captures: triage");
  await page.keyboard.press("Enter");
  const view = page.getByTestId("captures");
  const row = (text: string) => view.locator("li.row", { hasText: text });
  await expect(row("read later")).toBeVisible();

  // only a link to a file offers Download; every capture offers Catalogue
  await expect(row("read later").getByRole("button", { name: "Download" })).toHaveCount(0);
  await expect(row("chapters 9 and 10").getByRole("button", { name: "Download" })).toBeVisible();
  for (const scheme of ["light", "dark"] as const) { // judged in both themes (docs/guides/UI-STYLE.md)
    await page.emulateMedia({ colorScheme: scheme });
    await row("chapters 9 and 10").hover();
    await page.screenshot({ path: `test-results/captures-catalog-${scheme}.png` });
  }

  await row("read later").getByRole("button", { name: "Catalogue" }).click();
  await expect.poll(() => read(request, LOG)).toContain("- 09:00 read later https://example.org/a-page → [[A page]]");
  await expect(page.getByText("Catalogued")).toBeVisible();

  await row("chapters 9 and 10").getByRole("button", { name: "Download" }).click();
  await expect.poll(() => read(request, LOG)).toContain(`- 10:00 chapters 9 and 10 ${PDF} → [[Group Theory (2010)]]`);
  await expect(page.getByText("Downloaded")).toBeVisible();
  await page.getByRole("button", { name: "Open" }).last().click();
  await expect(page.getByText("The document's note.")).toBeVisible();

  // the catalog's reason when it files nothing, and the capture left as it was
  await page.keyboard.press("Control+p");
  await page.keyboard.type(">Captures: triage");
  await page.keyboard.press("Enter");
  await row("nothing to see here").getByRole("button", { name: "Catalogue" }).click();
  await expect(page.getByText("Could not catalogue the capture")).toBeVisible();
  await expect(page.getByText(/nothing to catalogue in them/)).toBeVisible();
  expect(await read(request, LOG)).toContain("\n- 11:00 nothing to see here\n");
  expect(errs).toEqual([]);
});
