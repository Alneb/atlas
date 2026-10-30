import { test, expect, type APIRequestContext } from "@playwright/test";
import { readFileSync } from "node:fs";

// The catalog's Library app on Atlas's library page (docs/refactor/REFACTOR-libraries.md, step 2): the page References
// is, over every kind the catalog knows — a tab per kind, shelves at the side, covers or a list, the item at the right
// with its fields, the services it is in and its shelf, changed in place. The kinds come from the plugin's helper (a
// stand-in here); the rows from the Bases engine over the notes.
const H = { "x-atlas": "1" };
const put = (request: APIRequestContext, path: string, text: string) => request.put("/api/file", { headers: H, data: { path, text } });
const MAIN = readFileSync(new URL("../../plugins/beta/catalog/main.js", import.meta.url), "utf8");
const VIEW = readFileSync(new URL("../../plugins/beta/catalog/view.js", import.meta.url), "utf8");
// the real id: a second copy of the plugin would register its blocks twice (catalog-collections.spec puts one there)
const DIR = ".atlas/plugins/catalog";

const KINDS = {
  kinds: [
    { kind: { name: "film", type: "film", folder: "Shelf/Films", library: { in: "Films & Series", title: "Films", cover: "poster", key: ["year", "director"], group: "status", shelves: ["to-watch", "watching", "watched"] } } },
    { kind: { name: "record", type: "record", folder: "Shelf/Albums", library: { title: "Albums", key: ["artist"] } } },
    { kind: { name: "manga", type: "manga", folder: "Shelf/Manga", library: { title: "Manga", key: ["author"] } } }, // no note of it yet
  ],
};
const HELPER = `import json, sys
for line in sys.stdin:
    m = json.loads(line)
    print(json.dumps({"id": m["id"], "result": ${JSON.stringify(KINDS)} if m["method"] == "kinds" else None}), flush=True)
`;
// a 1×1 PNG: a cover that is a real picture
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const FILMS: [string, number, string, string][] = [
  ["Dune", 2021, "Denis Villeneuve", "watched"],
  ["Arrival", 2016, "Denis Villeneuve", "watched"],
  ["Perfect Days", 2023, "Wim Wenders", "to-watch"],
];

test.beforeAll(async ({ request }) => {
  await put(request, `${DIR}/helper.py`, HELPER);
  await put(request, `${DIR}/main.js`, MAIN);
  await put(request, `${DIR}/view.js`, VIEW);
  await put(request, `${DIR}/plugin.toml`, 'title = "Catalib"\nrail = true\nicon = "grid"\napi = 4\n\n[helper]\nrun = "python3 -u \\"$ATLAS_PLUGIN_DIR/helper.py\\""\n');
  for (const [title, year, director, status] of FILMS) {
    const slug = title.toLowerCase().replace(/\s+/g, "-");
    expect((await request.put(`/api/raw?path=${encodeURIComponent(`Shelf/Films/${slug}.png`)}`, { headers: H, data: PNG })).ok()).toBeTruthy();
    await put(request, `Shelf/Films/${title}.md`, `---\ntype: film\ntitle: ${title}\nyear: ${year}\ndirector: "[[${director}]]"\nstatus: "[[${status}]]"\nposter: Shelf/Films/${slug}.png\nimdb: tt000${year}\n---\n`);
  }
  // no cover property: its first picture is the cover
  await put(request, "Shelf/Albums/Blue.md", "---\ntype: record\ntitle: Blue\nartist: Joni Mitchell\n---\n\n![[dune.png]]\n");
  // only a PDF: its first page is the cover
  await put(request, "Shelf/Albums/hejira.pdf", "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 300]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n");
  await put(request, "Shelf/Albums/Hejira.md", "---\ntype: record\ntitle: Hejira\nartist: Joni Mitchell\nbooklet: Shelf/Albums/hejira.pdf\n---\n");
});
test.afterAll(async ({ request }) => {
  // gone, as before the catalog specs: left without its helper, its main.js asked for one on every later page (a 400
  // in the console of every spec after this one)
  await request.post("/api/plugins/catalog/helper/stop", { headers: H });
  await request.post(`/api/fs/trash?path=${DIR}`, { headers: H });
  await request.post(`/api/fs/trash?path=Shelf`, { headers: H }); // other specs count notes
});

test("the catalog's library is the library page: kinds as tabs, shelves, covers or a list, the item with its shelf", async ({ page, request }) => {
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await page.locator(`[data-testid=apps] .app[aria-label^="Catalib"]`).click();
  const lib = page.locator('.library[data-source="catalog"]');
  await expect(lib.locator(".card")).toHaveCount(5);
  // the kinds with notes, by how many; an empty kind is no filter
  const chips = lib.locator(".types .chip");
  await expect(chips).toHaveCount(3);
  await expect(chips.nth(0)).toHaveText(/All\s*5/);
  await expect(chips.nth(1)).toHaveText(/Films\s*3/);
  await expect(chips.nth(2)).toHaveText(/Albums\s*2/);
  // covers come as pictures: the films' poster property, an album's embedded picture, the other's PDF's first page
  await expect(lib.locator(".card img")).toHaveCount(5, { timeout: 15000 });

  await lib.locator(".types .chip", { hasText: "Films" }).click();
  await expect(lib.locator(".card")).toHaveCount(3);
  await lib.locator(".side .item", { hasText: "To watch" }).click();
  await expect(lib.locator(".card")).toHaveCount(1);
  await lib.locator(".card", { hasText: "Perfect Days" }).click();
  const detail = lib.locator(".detail");
  await expect(detail.locator("h2")).toHaveText("Perfect Days");
  await expect(detail.locator(".authors")).toContainText("Wim Wenders"); // its key fields, under the title
  await expect(detail.locator("dl")).toContainText("to-watch");
  await expect(detail.locator(".links")).toContainText("IMDb");

  // the shelf changed in place, written to the note as a link
  await detail.getByRole("radio", { name: "Watched" }).click();
  await expect.poll(async () => (await (await request.get(`/api/file?path=${encodeURIComponent("Shelf/Films/Perfect Days.md")}`, { headers: H })).json()).text).toMatch(/status: ["']\[\[watched\]\]["']/);

  // the same items as a list
  await lib.locator(".side .item", { hasText: "All items" }).click();
  await lib.getByRole("radio", { name: "List" }).click();
  await expect(lib.locator(".row")).toHaveCount(3); // the Films tab is still the one chosen
  await lib.getByPlaceholder("Search the library…").fill("villeneuve");
  await expect(lib.locator(".row")).toHaveCount(2);
});

test("the Libraries page: a library per group of kinds, each with its own kinds as tabs", async ({ page }) => {
  // libraries well separated, each with its own kinds as tabs (as References has)
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await page.keyboard.press("F1");
  await page.keyboard.type("Libraries");
  await page.getByTestId("palette").getByText("Libraries (drawings, references, films, comics…)").click();
  const libs = page.locator(".libraries");
  // films by their kind file's `library.in`; records a library of their own; manga by the catalog's default (Comics)
  await expect(libs.getByRole("tab", { name: "Films & Series" })).toBeVisible();
  await expect(libs.getByRole("tab", { name: "Albums" })).toBeVisible();
  await expect(libs.getByRole("tab", { name: "Comics" })).toBeVisible();
  await libs.getByRole("tab", { name: "Films & Series" }).click();
  const lib = page.locator('.library[data-source="catalog.films-series"]');
  await expect(lib.locator(".card")).toHaveCount(3); // only its films, not the albums
  await lib.locator(".card", { hasText: "Dune" }).click();
  await expect(lib.locator(".detail").getByRole("button", { name: "Open note" })).toBeVisible();
  await expect(lib.locator(".detail").getByRole("button", { name: "Copy link" })).toBeVisible();
  // what References has: Edit in place, Delete… to the Trash, more sorts
  await lib.locator(".detail").getByRole("button", { name: "Edit" }).click();
  await lib.locator(".detail form.edit label", { hasText: "Title" }).locator("input").fill("Dune (2021)");
  await lib.locator(".detail").getByRole("button", { name: "Save" }).click();
  await expect.poll(async () => (await (await page.request.get(`/api/file?path=${encodeURIComponent("Shelf/Films/Dune.md")}`, { headers: H })).json()).text).toMatch(/title: Dune \(2021\)/);
  await expect(lib.locator(".detail").getByRole("button", { name: "Delete…" })).toBeVisible();
  await libs.getByRole("tab", { name: "Comics" }).click();
  await expect(page.locator('.library[data-source="catalog.comics"]')).toContainText("Nothing here yet");
});
