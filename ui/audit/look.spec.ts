import { test, type Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ATLAS_URL, OW_URL, OUT } from "./look.config";
import { propertiesInline } from "./props-inline";

// Every construct of catalogue.md, in obsidian-web's live preview and in Atlas's, compared by computed
// style (the deepest element holding each sentinel token) and shown side by side, screen by screen.
const CONSTRUCTS: [string, string][] = [
  ["k00", "properties tag"], ["k01", "h1"], ["k02", "h2"], ["k03", "h3"], ["k04", "h4"], ["k05", "h5"], ["k06", "h6"],
  ["k10", "paragraph"], ["k11", "bold"], ["k12", "italic"], ["k45", "bold italic"], ["k13", "strike"], ["k14", "highlight"],
  ["k15", "inline code"], ["k16", "wikilink"], ["k17", "external link"], ["k18", "tag"], ["k19", "unresolved link"],
  ["k46", "link in heading"], ["k20", "bullet"], ["k21", "nested bullet"], ["k49", "3rd-level bullet"],
  ["k22", "numbered"], ["k44", "nested numbered"], ["k23", "open task"], ["k24", "done task"],
  ["k47", "list continuation"], ["k25", "blockquote"], ["k26", "callout title"], ["k27", "callout body"],
  ["k28", "warning title"], ["k29", "folded callout"], ["k40", "after hr"], ["k30", "fenced code"],
  ["k31", "inline math"], ["k32", "block math"], ["k33", "table head"], ["k34", "table cell"],
  ["k42", "after <sup>"], ["k43", "<u>"], ["k41", "footnote ref"], ["k39", "footnote text"], ["k99", "last paragraph"],
];
const PROPS = ["fontSize", "fontWeight", "fontStyle", "fontFamily", "lineHeight", "color", "backgroundColor", "textDecorationLine", "paddingLeft", "marginTop"] as const;
type Sig = Record<string, string> & { _box?: string };

function signature([root, token, props]: [string, string, readonly string[]]): Sig | null {
  const scope = document.querySelector(root);
  if (!scope) return null;
  let host: Element | null = null;
  (function walk(n: Element) { for (const c of n.children) walk(c); if (!host && n.textContent?.includes(token)) host = n; })(scope);
  if (!host) return null;
  const h = host as HTMLElement;
  const cs = getComputedStyle(h);
  const out: Sig = {};
  for (const p of props) out[p] = (cs as unknown as Record<string, string>)[p];
  for (let n: HTMLElement | null = h; n && n !== scope.parentElement; n = n.parentElement) {
    const bg = getComputedStyle(n).backgroundColor;
    if (bg && bg !== "rgba(0, 0, 0, 0)" && bg !== "transparent") { out.backgroundColor = bg; break; }
  }
  // the block's left edge relative to the text column: indentation is what lists/quotes are about
  const line = h.closest(".cm-line, .cm-rendered-block, p, li, td, th, h1, h2, h3, h4, h5, h6, blockquote") ?? h;
  out._indent = String(Math.round(line.getBoundingClientRect().left - scope.getBoundingClientRect().left));
  out._tag = `${h.tagName.toLowerCase()}.${[...h.classList].slice(0, 3).join(".")}`;
  return out;
}

async function measure(page: Page, root: string, scroller: string): Promise<Record<string, Sig | null>> {
  const out: Record<string, Sig | null> = {};
  await page.evaluate((s) => { document.querySelector(s)!.scrollTop = 0; }, scroller);
  for (let i = 0; i < 40; i++) {
    for (const [tok] of CONSTRUCTS) if (!out[tok]) {
      const sig = await page.evaluate(signature, [root, tok, PROPS] as [string, string, readonly string[]]);
      if (sig) out[tok] = sig;
    }
    const moved = await page.evaluate((s) => { const el = document.querySelector(s) as HTMLElement; const b = el.scrollTop; el.scrollTop += el.clientHeight * 0.6; return el.scrollTop !== b; }, scroller);
    await page.waitForTimeout(150);
    if (!moved) break;
  }
  return out;
}

async function shots(page: Page, scroller: string, prefix: string) {
  await page.evaluate((s) => { document.querySelector(s)!.scrollTop = 0; }, scroller);
  for (let i = 0; i < 6; i++) {
    await page.waitForTimeout(500);
    await page.screenshot({ path: join(OUT, `${prefix}-${i}.png`) });
    const moved = await page.evaluate((s) => { const el = document.querySelector(s) as HTMLElement; const b = el.scrollTop; el.scrollTop += el.clientHeight * 0.85; return el.scrollTop !== b; }, scroller);
    if (!moved) break;
  }
}

test("look: obsidian-web vs Atlas, construct by construct", async ({ browser }) => {
  mkdirSync(OUT, { recursive: true });
  // obsidian-web (the reference): dark, vim off, edit mode, caret parked on the last line
  const ow = await browser.newPage();
  await ow.addInitScript(() => { localStorage.setItem("vim", "0"); localStorage.setItem("prefs.theme", "dark"); });
  await ow.goto(`${OW_URL}/?path=catalogue.md`, { waitUntil: "domcontentloaded" });
  await ow.locator("#reader").waitFor({ timeout: 20000 });
  await ow.keyboard.press("Control+e");
  await ow.locator("#editor-cm .cm-content").waitFor({ timeout: 20000 });
  await ow.locator("#editor-cm .cm-content").click();
  await ow.keyboard.press("Control+End");
  await ow.waitForTimeout(1500);
  const owSig = await measure(ow, "#editor-cm .cm-content", "#editor-cm .cm-scroller");
  await shots(ow, "#editor-cm .cm-scroller", "ow");

  // Atlas
  const at = await browser.newPage();
  await propertiesInline(at);
  await at.goto(`${ATLAS_URL}/`);
  await at.waitForTimeout(1500);
  await at.request.post(`${ATLAS_URL}/api/cmd/open`, { headers: { "x-atlas": "1" }, data: { args: { path: "catalogue.md", line: 999 } } });
  await at.locator(".dv-active-group .cm-content").waitFor({ timeout: 20000 });
  await at.waitForTimeout(1500);
  const atSig = await measure(at, ".dv-active-group .cm-content", ".dv-active-group .cm-scroller");
  await shots(at, ".dv-active-group .cm-scroller", "atlas");

  const rows: string[] = ["| | construct | obsidian-web | Atlas | differs |", "|---|---|---|---|---|"];
  for (const [tok, what] of CONSTRUCTS) {
    const a = owSig[tok], b = atSig[tok];
    if (!a || !b) { rows.push(`| ${tok} | ${what} | ${a ? a._tag : "**not rendered**"} | ${b ? b._tag : "**not rendered**"} | |`); continue; }
    const diff = [...PROPS, "_indent"].filter((p) => a[p] !== b[p]).map((p) => `${p}: ${a[p]} → ${b[p]}`);
    rows.push(`| ${tok} | ${what} | ${a._tag} | ${b._tag} | ${diff.join("<br>") || "—"} |`);
  }
  writeFileSync(join(OUT, "REPORT.md"), `# Look audit: obsidian-web → Atlas\n\nScreens: ow-N.png / atlas-N.png.\n\n${rows.join("\n")}\n`);
  writeFileSync(join(OUT, "signatures.json"), JSON.stringify({ ow: owSig, atlas: atSig }, null, 1));
  console.log(`look report → ${join(OUT, "REPORT.md")}`);
});
