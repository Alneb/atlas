import { test, expect, type Page } from "@playwright/test";
import lz from "lz-string";
const { decompressFromBase64 } = lz; // CommonJS module

// Rendering regressions, each a shape taken from the user's real Obsidian notes (see
// docs/guides/MD-RENDERING.md). Fixtures are written through the API so no other test's files change.
const H = { "x-atlas": "1" };
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAgAAAAGCAIAAABxZ0isAAAAEUlEQVR4nGNocFDAihgGUgIAYUoqARogppwAAAAASUVORK5CYII=", "base64");
const NOTES: Record<string, string> = {
  // a daily note whose title "2026-10-15" was drawn twice (file name and heading)
  "mdr/2026-10-15.md": "---\ntags: [daily]\n---\n\n# 2026-10-15\n\n- [ ] something\n\n<!-- atlas:no-tasks -->\n",
  "mdr/Kondo model.md": "# The *Kondo* model\n\ntext\n",
  // Internship Porto: the closer mid-line, prose after it; every later formula used to desync
  "mdr/midline.md": "Intro\n$$\n\\ket{e} = \\sum_i \\psi_i\n$$which in space representation look like\n$$\ny = 1\n$$\nWhere $\\phi_{0}$ and $\\phi_{e}$ are orbitals.\n",
  // Quantum Matter, May 27th: `$$$$` closes one formula and opens the next
  "mdr/dollars4.md": "For the s channel\n$$\nU_{q} = s/V\n$$$$\nH = N^2 s\n$$\nAfter both.\n",
  // Renormalization Group: continuation prose indented by 4 spaces / a tab is text, not code
  "mdr/indented.md": "1. A list item with minimal length $a$ (lattice)\n$$\nm_0 = 1\n$$\n    However we choose $b$ here\n\tAnd a tab with $c$\n",
  // attachments resolve by file name anywhere in the workspace, with Obsidian's |size and |center
  "mdr/deep/embeds.md": "Before\n\n![[mdr-pixel.png | center | 120]]\n\nAfter\n",
  // inline and block HTML (I2ndQ, Renormalization Group, Supercond Carlos)
  "mdr/html.md": "Intro to 2<sup>nd</sup> Quantization and <u>critical point</u>.\n\n<img src=\"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAgAAAAGCAIAAABxZ0isAAAAEUlEQVR4nGNocFDAihgGUgIAYUoqARogppwAAAAASUVORK5CYII=\" alt=\"inline\">\n\nEnd.\n",
  // Ultracold Atoms: a table whose last row is a long line must wrap, not hide columns
  "mdr/table.md": "Units\n\n| Quantity | Condensed | Optical |\n| --- | --- | --- |\n| Lattice | 0.5 nm | 500 nm |\nThe advantages of optical lattices is that a is large and can be resolved with microscopes, the timescales are much easier to access but it really needs to be very cold, which is the whole point of this long line.\n",
  "mdr/props.md": "---\ndate: 2025-04-18 21:09\ntopics:\n- '[[Condensed Matter]]'\ntags: [physics, rg]\ndraft: true\nempty:\n---\nBody.\n",
  // MathJax habits: \\newcommand over a built-in, _ inside \\text
  "mdr/katex.md": "$\\newcommand{\\div}[1]{\\nabla \\cdot #1}$\n\nThen $\\div{E}$ and $\\text{Nb_3Ge}$ and $k_{\\mbox{\\tiny B}}T$.\n",
  // Obsidian Excalidraw plugin drawing (`x.excalidraw` → `x.excalidraw.md`, LZString compressed-json)
  "mdr/drawn.md": "A sketch\n\n![[mdr-sketch.excalidraw|center]]\n\nAfter.\n",
  // a notebook's page: `#Page 2` embeds that frame only
  "mdr/paged.md": "Lecture\n\n![[mdr-book.excalidraw#Page 2]]\n\nAfter.\n",
  "attachments/mdr-book.excalidraw": "{\"type\": \"excalidraw\", \"version\": 2, \"source\": \"atlas-test\", \"elements\": [{\"id\": \"p1\", \"type\": \"frame\", \"x\": 0, \"y\": 0, \"width\": 794, \"height\": 1123, \"name\": \"Page 1\"}, {\"id\": \"p2\", \"type\": \"frame\", \"x\": 0, \"y\": 1171, \"width\": 794, \"height\": 1123, \"name\": \"Page 2\"}, {\"id\": \"r1\", \"type\": \"rectangle\", \"x\": 100, \"y\": 100, \"width\": 200, \"height\": 100, \"frameId\": \"p1\"}, {\"id\": \"e2\", \"type\": \"ellipse\", \"x\": 100, \"y\": 1300, \"width\": 300, \"height\": 150, \"frameId\": \"p2\"}], \"appState\": {}, \"files\": {}}",
  "attachments/mdr-sketch.excalidraw.md": "---\nexcalidraw-plugin: parsed\n---\n# Excalidraw Data\n## Drawing\n```compressed-json\nN4IgLgngDgpiBcIYA8DGBDANgSwCYCd0B3EAGhADcZ8BnbAewDsEAmcmTGAWxkbBoQBtUHgQh8ARjLhocRPhiow6RgHNO05AgAM5CDvJE8YABattukCZjZVJsAgkXyK9XMs0w+egGsYAYXpMenwxAGIJGEjI6QAjdFQfVW8AV0ZcQODQxC8VGih0BT5pADNsTEwAZUgNRBog0XJPbz8AdWMzeDYQZt8YaohanobcaVS7RhgaAXgJcnoC1GxIR2cQZPoUqABJXBnBAF1yEsIeXYRGFIryVPTJ6YurzCaYGFHZ8ipaBmYPymo6EwAHJMVByOYgbA0AAiHBgYDeCBKWBoMHIsU26QAopweHwZpdriAtrh0Aj3hCcIwfI8icFEoj4MjMKiAL5HEDoKBQapkuSgCjYGBEABCCSStwyQRC4RKcvlIFZx3KUwQwFZrKAA==\n```\n%%\n",
  // Obsidian Ink plugin: a pointer to a .drawing file that is not here
  "mdr/ink.md": "Intro\n\n```handdrawn-ink\n{\n  \"versionAtEmbed\": \"0.3.4\",\n  \"filepath\": \"files/Ink/Drawing/2025.4.3 - 9.16am.drawing\"\n}\n```\n\nAfter.\n",
  // look parity (audit/look.spec.ts against obsidian-web): lists, tasks, quotes, folded callouts, footnotes
  "mdr/look.md": "Intro\n\n- first\n- second\n  - nested\n    - third\n\n- [ ] open task\n- [x] done task\n\n> a quote line\n\n> [!tip]- Folded tip\n> Hidden body\n\nA ref[^1] here.\n\n[^1]: The note.\n\nEnd.\n",
  // "sometimes jump line when they shouldnt after latex": a line broke between a formula and its "," / "."
  "mdr/glue.md": "Cases $a$, then $b$. And $(c)$; and $d$ alone\n",
  "mdr/folds.md": "# Heading\n\nLine one of a paragraph\nline two\nline three\n\n- a\n- b\n",
};

async function open(page: Page, path: string) {
  await page.request.post("/api/cmd/open", { headers: H, data: { args: { path } } });
  const ed = page.locator(".dv-active-group .cm-editor").first();
  await ed.waitFor();
  await page.waitForTimeout(500);
  return ed;
}
// text a reader sees, minus formulas and code, on lines without the caret
const visibleProse = (page: Page) =>
  page.evaluate(() => [...document.querySelectorAll(".dv-active-group .cm-line:not(.cm-activeLine)")].map((l) => {
    const c = l.cloneNode(true) as HTMLElement;
    c.querySelectorAll(".katex, code").forEach((k) => k.remove());
    return c.textContent ?? "";
  }).join("\n"));

test.beforeAll(async ({ request }) => {
  for (const [path, text] of Object.entries(NOTES)) await request.put("/api/file", { headers: H, data: { path, text } });
  await request.put("/api/raw?path=attachments/mdr-pixel.png", { headers: H, data: PNG });
});

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
});

test("a $$ closer mid-line ends the formula; prose after it renders", async ({ page }) => {
  const ed = await open(page, "mdr/midline.md");
  await expect(ed.locator(".katex-error")).toHaveCount(0);
  await expect(ed.getByText("which in space representation look like")).toBeVisible();
  expect(await visibleProse(page)).not.toMatch(/\$/);
});

test("$$$$ renders both formulas and no stray $$", async ({ page }) => {
  const ed = await open(page, "mdr/dollars4.md");
  await expect(ed.locator(".katex-display")).toHaveCount(2);
  expect(await visibleProse(page)).not.toContain("$$");
});

test("indented continuation lines are prose with rendered math", async ({ page }) => {
  const ed = await open(page, "mdr/indented.md");
  await expect(ed.locator(".cm-math-inline")).toHaveCount(3);
  expect(await visibleProse(page)).not.toMatch(/\$[abc]\$/);
});

test("an inline formula in a list item is drawn after the word before it", async ({ page }) => {
  const ed = await open(page, "mdr/indented.md");
  const gap = await ed.locator(".cm-line", { hasText: "minimal length" }).evaluate((line) => {
    const math = line.querySelector(".katex .mord")!.getBoundingClientRect();
    const r = document.createRange();
    const text = [...line.childNodes].find((n) => n.nodeType === 3 && n.textContent!.includes("length"))!;
    r.setStart(text, text.textContent!.indexOf("length")); r.setEnd(text, text.textContent!.indexOf("length") + 6);
    return math.left - r.getBoundingClientRect().right;
  });
  expect(gap).toBeGreaterThanOrEqual(0);
});

test("![[x.png | center | 120]] finds the file anywhere, sized and centered", async ({ page }) => {
  const ed = await open(page, "mdr/deep/embeds.md");
  const img = ed.locator("img.cm-embed-image");
  await expect(img).toHaveCount(1);
  await expect.poll(() => img.evaluate((i: HTMLImageElement) => i.naturalWidth)).toBe(8);
  expect(await img.evaluate((i) => i.getBoundingClientRect().width)).toBeCloseTo(120, 0);
  await expect(ed.locator(".cm-embed-image-host.is-centered")).toHaveCount(1);
});

test("inline and block HTML render as elements, not tags", async ({ page }) => {
  const ed = await open(page, "mdr/html.md");
  await expect(ed.locator("sup", { hasText: "nd" })).toHaveCount(1);
  await expect(ed.locator("u", { hasText: "critical point" })).toHaveCount(1);
  await expect.poll(() => ed.locator('img[alt="inline"]').evaluate((i: HTMLImageElement) => i.naturalWidth)).toBe(8);
  expect(await visibleProse(page)).not.toMatch(/<\/?(sup|u|img)\b/);
});

test("a table wraps its cells instead of hiding columns", async ({ page }) => {
  const ed = await open(page, "mdr/table.md");
  const wrap = ed.locator(".table-wrap");
  await expect(wrap).toHaveCount(1);
  const [sw, cw] = await wrap.evaluate((w) => [w.scrollWidth, w.clientWidth]);
  expect(sw).toBeLessThanOrEqual(cw + 2);
  await expect(ed.getByText("Optical", { exact: true })).toBeVisible();
});

test("frontmatter shows as Obsidian-style properties (`[editor] properties = inline`)", async ({ page }) => {
  // hidden is the default (properties.spec.ts): this look is the inline one
  await page.route("**/api/config", async (route) => {
    if (route.request().method() !== "GET") return route.continue();
    const res = await route.fetch(), body = await res.json();
    body.config.editor.properties = "inline";
    await route.fulfill({ response: res, json: body });
  });
  await page.reload();
  await page.getByText("Finish the GW notes.").waitFor();
  const ed = await open(page, "mdr/props.md");
  const props = ed.locator(".note-properties");
  await expect(props.locator(".prop-row")).toHaveCount(5);
  await expect(props.locator(".prop-key", { hasText: "date" })).toBeVisible();
  await expect(props.locator("a.prop-pill", { hasText: "Condensed Matter" })).toBeVisible();
  await expect(props.locator(".prop-tag")).toHaveCount(2);
  await expect(props.locator(".prop-empty")).toHaveCount(1);
  await props.locator(".prop-head").click();
  await expect(props.locator(".prop-rows")).toBeHidden();
  await props.locator(".prop-head").click();
  await expect(props.locator(".prop-rows")).toBeVisible();
});

test("KaTeX accepts MathJax habits (\\newcommand over a built-in, _ in \\text, \\mbox)", async ({ page }) => {
  const ed = await open(page, "mdr/katex.md");
  await expect(ed.locator(".cm-math-inline").first()).toBeVisible();
  await expect(ed.locator(".katex-error")).toHaveCount(0);
});

test("only headings and lists get fold arrows, each on its own line", async ({ page }) => {
  const ed = await open(page, "mdr/folds.md");
  const marks = await ed.evaluate((root) => {
    const tops = [...root.querySelectorAll(".cm-content > *")].map((l) => l.getBoundingClientRect().top);
    return [...root.querySelectorAll(".cm-foldGutter .cm-gutterElement")]
      .filter((g) => g.textContent?.trim() && g.getBoundingClientRect().height > 0)
      .map((g) => tops.some((t) => Math.abs(t - g.getBoundingClientRect().top) < 3));
  });
  expect(marks).toEqual([true, true]); // the heading and the list; the paragraph has none
});

test("![[x.excalidraw]] draws the vault's x.excalidraw.md inline", async ({ page }) => {
  const ed = await open(page, "mdr/drawn.md");
  const svg = ed.locator(".drawing-embed.is-centered svg.drawing-svg");
  await expect(svg).toHaveCount(1, { timeout: 15000 });
  await expect(svg.locator("path, rect").first()).toBeAttached();
  await expect(ed.locator(".drawing-embed.is-missing")).toHaveCount(0);
});

test("![[x.excalidraw#Page 2]] draws that page only, and opens the drawing at it", async ({ page }) => {
  const ed = await open(page, "mdr/paged.md");
  const embed = ed.locator(".drawing-embed");
  const svg = embed.locator("svg.drawing-svg");
  await expect(svg).toHaveCount(1, { timeout: 15000 });
  // cut at the page's edges: one A4 page high (794 × 1123), not the whole notebook (two pages, ~2300 high)
  const height = await svg.evaluate((s) => (s as SVGSVGElement).viewBox.baseVal.height);
  expect(height).toBeGreaterThan(1000);
  expect(height).toBeLessThan(1400);
  await embed.hover();
  await embed.getByRole("button", { name: "Edit Page 2" }).click();
  await expect(page.locator(".dv-active-group .draw-pane canvas.interactive")).toBeVisible({ timeout: 15000 });
});

test("an Ink plugin block says what it is instead of showing its JSON", async ({ page }) => {
  const ed = await open(page, "mdr/ink.md");
  await expect(ed.locator(".ink-card.is-missing")).toContainText("2025.4.3 - 9.16am.drawing");
  await expect(ed.getByText("versionAtEmbed")).toBeHidden(); // the block's text stays in the note, out of sight
});

test("a plugin drawing opens in the Excalidraw pane and saves back into its compressed block", async ({ page, request }) => {
  const ed = await open(page, "mdr/drawn.md");
  const embed = ed.locator(".drawing-embed");
  await expect(embed.locator("svg.drawing-svg")).toHaveCount(1, { timeout: 15000 });
  await embed.hover();
  await embed.getByRole("button", { name: "Edit drawing" }).click();
  const canvas = page.locator(".draw-pane .excalidraw").first();
  await expect(canvas).toBeVisible({ timeout: 15000 });
  const before = (await (await request.get("/api/file?path=attachments/mdr-sketch.excalidraw.md", { headers: H })).json()).text as string;
  // draw a second rectangle mid-canvas
  await canvas.click({ position: { x: 600, y: 400 } });
  await page.keyboard.press("r");
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + 500, box.y + 300); await page.mouse.down(); await page.mouse.move(box.x + 650, box.y + 420, { steps: 5 }); await page.mouse.up();
  await expect.poll(async () => (await (await request.get("/api/file?path=attachments/mdr-sketch.excalidraw.md", { headers: H })).json()).text, { timeout: 8000 }).not.toBe(before);
  const after = (await (await request.get("/api/file?path=attachments/mdr-sketch.excalidraw.md", { headers: H })).json()).text as string;
  expect(after.startsWith("---\nexcalidraw-plugin: parsed\n---\n# Excalidraw Data")).toBe(true); // the rest of the file kept
  const block = /```compressed-json\n([\s\S]*?)\n```/.exec(after)![1];
  const scene = JSON.parse(decompressFromBase64(block.replace(/\s/g, ""))!);
  expect(scene.elements.filter((e: { type: string; isDeleted: boolean }) => e.type === "rectangle" && !e.isDeleted)).toHaveLength(2);
});

test("look parity: lists step evenly, tasks have no bullet, quotes have air, footnotes are superscript", async ({ page }) => {
  const ed = await open(page, "mdr/look.md");
  const line = (t: string) => ed.locator(".cm-line", { hasText: t }).first();
  // one depth class per line (nested lines used to carry their parent's too), indentation drawn once
  expect(await line("nested").getAttribute("class")).not.toContain("cm-list-1");
  const x = async (t: string) => line(t).evaluate((l) => { const r = document.createRange(); r.selectNodeContents(l); return [...r.getClientRects()].pop()!.left; });
  const [a, b, c] = [await x("first"), await x("nested"), await x("third")];
  expect(Math.abs((b - a) - (c - b))).toBeLessThan(3); // equal steps
  await expect(line("open task").locator(".cm-list-mark")).toHaveCount(0);
  await expect(line("open task").locator(".cm-task-mark")).toHaveCount(1);
  expect(await line("a quote line").evaluate((l) => parseFloat(getComputedStyle(l).paddingLeft))).toBeGreaterThan(8);
  await expect(ed.locator(".cm-footnote-ref")).toHaveText("1");
  await expect(ed.getByText("[^1]")).toHaveCount(0);
});

test("a folded callout ([!tip]-) shows only its title until the chevron opens it", async ({ page }) => {
  const ed = await open(page, "mdr/look.md");
  await expect(ed.getByText("Folded tip")).toBeVisible();
  await expect(ed.getByText("Hidden body")).toHaveCount(0);
  await ed.getByRole("button", { name: "Expand callout" }).dispatchEvent("mousedown");
  await expect(ed.getByText("Hidden body")).toBeVisible();
  await ed.getByRole("button", { name: "Collapse callout" }).dispatchEvent("mousedown");
  await expect(ed.getByText("Hidden body")).toHaveCount(0);
});

test("the note's file name shows as Obsidian's inline title", async ({ page }) => {
  const ed = await open(page, "mdr/look.md");
  await expect(ed.locator(".inline-title")).toHaveText("look");
});

test("the inline title is left out when the note's first heading says the same; it comes back when the heading goes", async ({ page }) => {
  const ed = await open(page, "mdr/2026-10-15.md");
  await expect(ed.locator(".cm-line", { hasText: "2026-10-15" })).toHaveCount(1);
  await expect(ed.locator(".inline-title")).toHaveCount(0);
  const other = await open(page, "mdr/Kondo model.md"); // a different heading: both stay
  await expect(other.locator(".inline-title")).toHaveText("Kondo model");
  await open(page, "mdr/2026-10-15.md");
  await page.locator(".dv-active-group .cm-line", { hasText: "2026-10-15" }).click();
  await page.keyboard.press("Home");
  await page.keyboard.press("Delete");
  await page.keyboard.press("Delete"); // "# " gone: the heading is plain text now
  await expect(page.locator(".dv-active-group .cm-editor .inline-title")).toHaveText("2026-10-15");
});

test("no block in the editor has a vertical margin (CodeMirror ignores it: clicks would land on the wrong line)", async ({ page }) => {
  for (const note of ["mdr/props.md", "mdr/look.md", "mdr/table.md", "mdr/drawn.md"]) {
    const ed = await open(page, note);
    await page.waitForTimeout(800);
    const bad = await ed.evaluate((root) => [...root.querySelectorAll(".cm-content > *")]
      .map((el) => { const cs = getComputedStyle(el); return [el.className, cs.marginTop, cs.marginBottom]; })
      .filter(([, t, b]) => t !== "0px" || b !== "0px"));
    expect(bad, note).toEqual([]);
  }
});

test("punctuation after a formula stays on its line with it", async ({ page }) => {
  const ed = await open(page, "mdr/glue.md");
  await ed.locator(".cm-content").click({ position: { x: 5, y: 400 } }).catch(() => {}); // the caret off the line
  const glued = await ed.locator(".cm-line", { hasText: "Cases" }).evaluate((line) =>
    [...line.querySelectorAll(".cm-math-glue")].map((g) => ({ math: !!g.querySelector(".cm-math-inline"), text: g.textContent!.slice(-1), wrap: getComputedStyle(g).whiteSpace })));
  expect(glued.map((g) => g.text).sort()).toEqual([",", ".", ";"]);
  for (const g of glued) { expect(g.math).toBe(true); expect(["nowrap", "pre"]).toContain(g.wrap); } // pre: CodeMirror keeps spaces; both never wrap
});
