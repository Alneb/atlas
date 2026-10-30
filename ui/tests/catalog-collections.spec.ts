import { test, expect, type Page, type APIRequestContext } from "@playwright/test";
import { openFile } from "./open";
import { readFileSync } from "node:fs";
import { deflateSync } from "node:zlib";

// The catalog's collections (docs/design/DESIGN-collections.md): a collection's index page is the Library page over its base,
// its shelves (one per status, in the kind's order) at the side; dragging a cover onto another shelf moves it there; the item
// block at the top of a note shows its fields, its shelf chips, stars and the services it points at. Rows come from the
// base through Atlas's Bases engine, so these are the same files Obsidian reads.
const H = { "x-atlas": "1" };
const put = (request: APIRequestContext, path: string, text: string) => request.put("/api/file", { headers: H, data: { path, text } });
const MAIN = readFileSync(new URL("../../plugins/beta/catalog/main.js", import.meta.url), "utf8");

// a solid-colour PNG, so covers are real pictures without the network
function png(w: number, h: number, [r, g, b]: [number, number, number]): Buffer {
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (buf: Buffer) => { let c = 0xffffffff; for (const x of buf) c = crcTable[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type: string, data: Buffer) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(w * 3).map((_, i) => [r, g, b][i % 3])]);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(Buffer.concat(Array(h).fill(row)))), chunk("IEND", Buffer.alloc(0))]);
}

const FILMS: [string, number, string, string, number, [number, number, number]][] = [
  ["Dune", 2021, "Denis Villeneuve", "watched", 5, [196, 140, 72]],
  ["Arrival", 2016, "Denis Villeneuve", "watched", 4, [90, 110, 130]],
  ["Moonrise Kingdom", 2012, "Wes Anderson", "to-watch", 0, [214, 180, 90]],
  ["Perfect Days", 2023, "Wim Wenders", "to-watch", 0, [70, 120, 90]],
  ["Past Lives", 2023, "Celine Song", "watching", 0, [150, 80, 90]],
];

async function vault(request: APIRequestContext) {
  await put(request, ".atlas/plugins/catalog/plugin.toml", 'title = "Catalog"\nicon = "library"\napi = 4\n');
  await put(request, ".atlas/plugins/catalog/main.js", MAIN);
  for (const [title, year, director, status, rating, rgb] of FILMS) {
    const slug = title.toLowerCase().replace(/\s+/g, "-");
    expect((await request.put(`/api/raw?path=${encodeURIComponent(`Films/covers/${slug}.png`)}`, { headers: H, data: png(40, 60, rgb) })).ok()).toBeTruthy();
    await put(request, `Films/${title}.md`, `---\ntype: movie\ntitle: ${title}\nyear: ${year}\ndirector: "[[${director}]]"\nstatus: "[[${status}]]"\n${rating ? `rating: ${rating}\n` : ""}poster: Films/covers/${slug}.png\nimdb: tt000${year}\nletterboxd: ${slug}\n---\n\n\`\`\`view\ntype: catalog.item\n\`\`\`\n\nSinopsis:\n`);
  }
  // what the catalog makes with a kind's first note (collection.rs, tested there): the base and the index page
  await put(request, "Films/Films.base", '# The Films collection\nfilters:\n  and:\n    - file.inFolder("Films")\n    - type == "movie"\nviews:\n  - type: cards\n    name: Shelves\n    groupBy:\n      property: note.status\n    image: note.poster\n    order: [file.name, poster, year, director, rating, status]\n  - type: cards\n    name: Covers\n    image: note.poster\n    order: [file.name, poster, year, director, rating, status]\n  - type: table\n    name: Table\n    order: [file.name, year, director, rating, status]\n');
  await put(request, "Films/Films.md", '---\ntype: collection\nkind: movie\n---\n\n```view\ntype: catalog.library\nbase: "Films/Films.base"\nlayout: shelves\ngroup: status\nshelves: ["to-watch", "watching", "watched", "dropped"]\ncover: poster\nkey: [year, director, rating]\n```\n');
}

async function open(page: Page, name: string) {
  await openFile(page, name);
}

// the plugin goes with the spec: left installed without its helper it asks for one on every later page
test.afterAll(async ({ request }) => { await request.post("/api/fs/trash?path=.atlas/plugins/catalog", { headers: H }); });

test("a collection's index page is the Library page over its base: shelves in the kind's order, a cover dragged to another shelf moves there", async ({ page, request }) => {
  await vault(request);
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await open(page, "Films.md");

  const lib = page.locator('.library[data-source^="catalog.base."]');
  const shelf = (name: string) => lib.locator(".side .item", { hasText: name });
  // the shelves keep the kind's order, not the alphabet's; an empty one stays, as a place to drop onto
  await expect(lib.locator(".side .item .n")).toHaveText(["All items", "To watch", "Watching", "Watched", "Dropped"]);
  await expect(shelf("To watch").locator(".c")).toHaveText("2");
  await expect(shelf("Watching").locator(".c")).toHaveText("1");
  await expect(shelf("Dropped").locator(".c")).toHaveText("0");
  await expect(lib.locator(".card")).toHaveCount(5);
  await expect(lib.locator(".card", { hasText: "Dune" }).locator("img")).toBeVisible();
  await expect(lib.locator(".card", { hasText: "Arrival" })).toContainText("2016 · Denis Villeneuve");

  await page.emulateMedia({ colorScheme: "light" }); // judged in both themes (docs/guides/UI-STYLE.md)
  await page.screenshot({ path: "test-results/catalog-shelves-light.png" });
  await page.emulateMedia({ colorScheme: "dark" });
  await page.screenshot({ path: "test-results/catalog-shelves-dark.png" });

  // drag Past Lives onto To watch at the side: its note's status changes, the shelves follow
  await lib.locator(".card", { hasText: "Past Lives" }).dragTo(shelf("To watch"));
  await expect(shelf("To watch").locator(".c")).toHaveText("3");
  const status = async () => (await request.get(`/api/file?path=${encodeURIComponent("Films/Past Lives.md")}`, { headers: H }).then((r) => r.json())).text;
  expect(await status()).toMatch(/status: ["']?\[\[to-watch\]\]["']?/);
  // and without dragging: the shelf chosen in its card
  await lib.locator(".card", { hasText: "Past Lives" }).click();
  await lib.locator(".detail").getByRole("radio", { name: "Watched" }).click();
  await expect.poll(status).toMatch(/status: ["']?\[\[watched\]\]["']?/);
  await expect(shelf("Watched").locator(".c")).toHaveText("3");

  // a shelf narrows the list; search narrows it further; the list layout sorted by year
  await shelf("To watch").click();
  await expect(lib.locator(".card")).toHaveCount(2); // Moonrise Kingdom, Perfect Days
  await lib.locator(".search").fill("wenders");
  await expect(lib.locator(".card")).toHaveCount(1);
  await lib.locator(".search").fill("");
  await lib.getByRole("radio", { name: "List" }).click();
  await lib.getByRole("button", { name: "Sort by" }).click();
  await page.getByRole("option", { name: "Sort: Year" }).click();
  await expect(lib.locator(".row .t")).toHaveText(["Perfect Days", "Moonrise Kingdom"]); // the newest first
});

test("a catalogued note opens with its item block: fields, shelf chips, stars and the services it points at", async ({ page, request }) => {
  await vault(request);
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await open(page, "Arrival.md");

  const item = page.locator(".cat-item");
  await expect(item.locator("h2")).toContainText("Arrival");
  await expect(item.locator("h2 small")).toHaveText("2016");
  await expect(item.locator(".cat-stars button.on")).toHaveCount(4);
  await expect(item.getByRole("link", { name: "IMDb" })).toHaveAttribute("href", "https://www.imdb.com/title/tt0002016/");
  await expect(item.getByRole("link", { name: "Letterboxd" })).toHaveAttribute("href", "https://letterboxd.com/film/arrival/");
  await expect(item.locator("img.cat-cover")).toBeVisible();
  await page.emulateMedia({ colorScheme: "light" });
  await page.screenshot({ path: "test-results/catalog-item-light.png" });
  await page.emulateMedia({ colorScheme: "dark" });
  await page.screenshot({ path: "test-results/catalog-item-dark.png" });

  // a star sets the rating in the note's properties
  await item.locator(".cat-stars button").nth(4).click();
  await expect(item.locator(".cat-stars button.on")).toHaveCount(5);
  const note = await request.get(`/api/file?path=${encodeURIComponent("Films/Arrival.md")}`, { headers: H }).then((r) => r.json());
  expect(note.text).toContain("rating: 5");
});
