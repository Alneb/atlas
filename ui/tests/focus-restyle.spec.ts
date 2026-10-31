import { test, expect } from "@playwright/test";

// A rule `:focus … ::selection` makes the browser restyle the whole subtree of every element whose focus changes:
// with one (CodeMirror's drawSelection theme) opening and closing the command bar restyled a long note twice
// (lib/editor/drawn-selection.ts). No style sheet in the page may carry such a rule once a note is open.
const H = { "x-atlas": "1" };

test("no style rule ties ::selection to a focus pseudo-class (a focus change would restyle a whole note)", async ({ page, request }) => {
  await request.put("/api/file", { headers: H, data: { path: "notes/focus-restyle.md", text: "# Long\n\nSome *text* here.\n" } });
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await page.request.post("/api/cmd/open", { headers: H, data: { args: { path: "notes/focus-restyle.md" } } });
  await expect(page.locator(".dv-active-group .cm-editor")).toContainText("Some text here");
  const found = await page.evaluate(() => {
    const out: string[] = [];
    const walk = (rules: CSSRuleList) => { for (const r of Array.from(rules)) {
      if (r instanceof CSSStyleRule && /:focus[^,]*::selection/.test(r.selectorText)) out.push(r.selectorText);
      if ("cssRules" in r && (r as CSSGroupingRule).cssRules) walk((r as CSSGroupingRule).cssRules);
    } };
    for (const s of [...Array.from(document.styleSheets), ...document.adoptedStyleSheets]) { try { walk(s.cssRules); } catch { /* another origin */ } }
    return { out, sheets: document.styleSheets.length + document.adoptedStyleSheets.length };
  });
  expect(found.sheets).toBeGreaterThan(1); // the check looked at something
  expect(found.out).toEqual([]);
});
