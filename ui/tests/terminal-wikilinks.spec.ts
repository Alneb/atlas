import { test, expect, type Page } from "@playwright/test";
import type { IBufferCell, IBufferLine } from "@xterm/xterm";
import { linksOn, runAround } from "../src/lib/terminal-text";
import { wikilinksIn } from "../src/lib/wikilink-syntax";

// A terminal reads [[…]] as wikilinks (an agent's output names notes this way). A `[[note]]` printed in a terminal is a link: the pointer on it previews the note (its path on top), a click
// opens it; a link to no note says so in the editor's unresolved colour.

/** A fake buffer: one string per row, `~` at a row's start marks it a soft-wrapped continuation. */
function buffer(rows: string[], cols = 20) {
  let cur = { chars: "", width: 1 };
  const cell = { getChars: () => cur.chars, getWidth: () => cur.width } as unknown as IBufferCell;
  const lines = rows.map((r) => {
    const wrapped = r.startsWith("~"), text = wrapped ? r.slice(1) : r;
    return { isWrapped: wrapped, length: cols, getCell: (x: number) => { cur = { chars: text[x] ?? "", width: 1 }; return cell; } } as unknown as IBufferLine;
  });
  return { line: (y: number) => lines[y], cell };
}
const all = () => true;

test("the scanner: aliases, sections, embeds, nothing from a broken pair", () => {
  expect(wikilinksIn("see [[a|b]], [[c#Head|d]] and ![[e.png]] [[ ]] [[x[y]]").map((m) => [m.target, m.alias ?? "", m.embed])).toEqual([
    ["a", "b", false], ["c#Head", "d", false], ["e.png", "", true],
  ]);
});

test("a link on one row, and one cut by a soft wrap, found on every row it touches", () => {
  const b = buffer(["see [[hubbard]] ok", "xxxxxxxxxxxxxxx [[hu", "~bbard#^b1|H]] tail"]);
  const one = linksOn(runAround(b, 0), 0, all);
  expect(one).toEqual([{ target: "hubbard", start: { row: 0, x: 4, w: 1 }, end: { row: 0, x: 14, w: 1 } }]);
  for (const row of [1, 2]) {
    const [l] = linksOn(runAround(b, row), row, all);
    expect(l.target).toBe("hubbard#^b1");
    expect([l.start.row, l.start.x, l.end.row, l.end.x]).toEqual([1, 16, 2, 12]); // the last `]`, as on row 0
  }
});

test("a program's own line break inside a link: read with the space, or without when only that resolves", () => {
  const b = buffer(["  see [[Hubbard", "  model]] here", "  [[hub", "  bard]]"]);
  expect(linksOn(runAround(b, 0), 0, all)[0].target).toBe("Hubbard model");
  expect(linksOn(runAround(b, 1), 1, all)[0].target).toBe("Hubbard model");
  const onlySqueezed = (t: string) => t === "hubbard";
  expect(linksOn(runAround(b, 3), 3, onlySqueezed)[0].target).toBe("hubbard");
});

/** The cell (1-based column, 0-based row of the screen) as a point on the page; xterm sizes its key-catching
 *  textarea to one cell at the cursor, which gives the cell's size. */
async function cellPoint(page: Page, col: number, row: number) {
  const box = (await page.locator(".term-pane .xterm-screen").first().boundingBox())!;
  const { w, h } = await page.locator(".term-pane .xterm-helper-textarea").first().evaluate((t: HTMLElement) => ({ w: parseFloat(t.style.width), h: parseFloat(t.style.height) }));
  return { x: box.x + (col - 0.5) * w, y: box.y + (row + 0.5) * h };
}

test("in a terminal: the pointer previews the note, a click opens it; a missing note says so", async ({ page }) => {
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await page.keyboard.press("Control+`");
  const pane = page.locator(".term-pane").first();
  await expect(pane.locator(".xterm-helper-textarea")).toBeFocused();
  // clear the screen, then two links on row 0; the last one fills row 1 to its end and wraps onto row 2
  await page.keyboard.type(`printf '\\033[2J\\033[H[[hubbard]] and [[no such note]]\\n%*s[[hubbard|H]]\\n' $(( $(tput cols 2>/dev/null || echo $COLUMNS) - 4 )) ''\n`);
  const card = page.getByTestId("hover-preview");

  const p = await cellPoint(page, 4, 0);
  // the shell prints a moment after the keys, and xterm asks for a row's links again only when the pointer comes
  // from another row: step off and back until the link is there
  const off = await cellPoint(page, 4, 4);
  await expect(async () => {
    await page.mouse.move(off.x, off.y);
    await page.mouse.move(p.x, p.y);
    await expect(card).toBeVisible({ timeout: 1000 });
  }).toPass();
  await expect(card.locator(".preview-head")).toHaveText(/hubbard\.md$/);
  await expect(card).toContainText("Energy");

  // a look in both themes, by hand: SHOT_DIR=/some/dir npx playwright test terminal-wikilinks
  if (process.env.SHOT_DIR) for (const theme of ["dark", "light"]) {
    await page.evaluate((t) => { document.documentElement.dataset.theme = t; }, theme);
    await page.mouse.move(p.x + 1, p.y);
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${process.env.SHOT_DIR}/terminal-wikilink-${theme}.png` });
  }

  const q = await cellPoint(page, 22, 0);
  await page.mouse.move(q.x, q.y);
  await expect(card).toContainText("Not in the vault yet");
  if (process.env.SHOT_DIR) await page.screenshot({ path: `${process.env.SHOT_DIR}/terminal-wikilink-missing.png` });
  await expect(card.locator(".preview-head")).toHaveText("no such note.md");

  const w = await cellPoint(page, 3, 2); // the wrapped half: "bbard|H]]"
  await page.mouse.move(w.x, w.y);
  await expect(card.locator(".preview-head")).toHaveText(/hubbard\.md$/);

  await page.mouse.click(p.x, p.y);
  await expect(page.locator(".cm-content:visible").first()).toContainText("Energy");
});
