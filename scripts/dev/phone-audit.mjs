// The phone layout's look, audited (docs/guides/MOBILE.md, "The shape audit"): nothing may stretch or break
// when the screen's shape changes. Opens every place of
// Atlas on a phone-shaped Chromium (the engine of Android's WebView) — as the phone app's note view (a fake
// `AtlasNative` bridge: the page hides its own bars) and as a phone's browser, portrait and landscape, both themes —
// and flags by shape, not by a list of components: what runs off the screen sideways, media drawn out of their
// proportions, text spilling out of or clipped by its box, boxes squeezed narrower than a letter, buttons stretched
// tall or wide, text too small, targets too small for a finger. A screenshot of each place goes beside the report.
//
//   node scripts/dev/phone-audit.mjs --url http://127.0.0.1:7790/ --vault <a COPY of a vault> --out <dir> [--only home,files]
//
// The core must be serving a copy (the audit opens and scrolls, and a browser's layout is saved): never the vault you work in.
import { createRequire } from "node:module";
import { readdirSync, readFileSync, statSync, mkdirSync, writeFileSync } from "node:fs";
import { join, dirname, relative, extname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const { chromium } = createRequire(join(here, "../../ui/package.json"))("playwright");
const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const URL_ = opt("--url"), VAULT = opt("--vault"), OUT = opt("--out", "phone-audit"), ONLY = opt("--only")?.split(",");
if (!URL_ || !VAULT) { console.error("usage: phone-audit.mjs --url <core> --vault <vault copy> --out <dir>"); process.exit(2); }
mkdirSync(OUT, { recursive: true });

/** Notes chosen by what they hold, so each kind of block is seen once: the largest of each shape. */
function notesByShape() {
  const shapes = { table: /^\|.*\|\s*$\n^\|[ :|-]+\|/m, callout: /^> \[!/m, math: /\$\$/, code: /^```(?!base)\w+/m, embed: /!\[\[[^\]]+\.(md|pdf)|!\[\[[^\].]+\]\]/, image: /!\[\[[^\]]+\.(png|jpe?g|webp|svg)|!\[[^\]]*\]\(/, base: /^```base/m, tasks: /^\s*- \[[ x]\]/m, frontmatter: /^---\n[\s\S]*?\n---/ };
  const best = {};
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      if (e.name.startsWith(".")) continue;
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith(".md")) {
        const t = readFileSync(p, "utf8"), size = t.length;
        for (const [k, re] of Object.entries(shapes)) if (re.test(t) && size < 200_000 && (!best[k] || best[k].size < size)) best[k] = { path: relative(VAULT, p), size };
      }
    }
  };
  walk(VAULT);
  const pdf = (() => { const stack = [VAULT]; while (stack.length) { const d = stack.pop(); for (const e of readdirSync(d, { withFileTypes: true })) { if (e.name.startsWith(".")) continue; const p = join(d, e.name); if (e.isDirectory()) stack.push(p); else if (extname(e.name) === ".pdf" && statSync(p).size > 100_000) return relative(VAULT, p); } } return null; })();
  return { notes: Object.fromEntries(Object.entries(best).map(([k, v]) => [k, v.path])), pdf };
}

/** In the page: every visible element judged by its shape. Returns [kind, where, detail]. */
function judge() {
  const W = document.documentElement.clientWidth, out = [];
  const seen = new Set();
  const H = document.documentElement.clientHeight;
  // seen by someone: on the screen, not cut away by a clipping box around it (a side tool kept mounted but hidden on a
  // phone was judged at 4–22 px wide), and not a screen-reader-only text (1 px and clipped: dockview's live region)
  const clippedAway = (el, r) => {
    for (let e = el.parentElement; e && e !== document.documentElement; e = e.parentElement) {
      const cs = getComputedStyle(e);
      if (cs.overflowX === "visible" && cs.overflowY === "visible") continue;
      const b = e.getBoundingClientRect();
      if (b.width < 2 || b.height < 2 || r.right <= b.left || r.left >= b.right || r.bottom <= b.top || r.top >= b.bottom) return true;
    }
    return false;
  };
  const srOnly = (r, s) => r.width <= 1 || r.height <= 1 || /rect\(0(px)?,? 0(px)?,? 0(px)?,? 0(px)?\)/.test(s.clip) || s.clipPath === "inset(50%)";
  const visible = (el, r, s) => r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none" && Number(s.opacity) > 0.05
    && r.right > 0 && r.bottom > 0 && r.left < W && r.top < H && !srOnly(r, s) && !clippedAway(el, r)
    && !(s.color === "rgba(0, 0, 0, 0)" || s.color === "transparent"); // see-through text (pdf.js's selection layer) is not read
  const name = (el) => el.tagName.toLowerCase() + (typeof el.className === "string" && el.className.trim() ? "." + el.className.trim().split(/\s+/).filter((c) => !c.startsWith("svelte-")).slice(0, 2).join(".") : "") + (el.getAttribute("aria-label") ? `[${el.getAttribute("aria-label")}]` : "");
  const where = (el) => { const p = []; for (let e = el; e && e !== document.body && p.length < 4; e = e.parentElement) p.unshift(name(e)); return p.join(" > "); };
  // a box between the element and the screen that scrolls or clips sideways: running past the screen is then its business
  const contained = (el) => { for (let e = el.parentElement; e && e !== document.documentElement; e = e.parentElement) { const s = getComputedStyle(e); if (s.overflowX !== "visible") return true; } return false; };
  const ownText = (el) => [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 1);
  const say = (kind, el, detail) => { const key = kind + where(el); if (!seen.has(key)) { seen.add(key); out.push([kind, where(el), detail]); } };
  for (const el of document.querySelectorAll("body *")) {
    if (el.closest("svg") && el.tagName.toLowerCase() !== "svg") continue;
    const r = el.getBoundingClientRect(), s = getComputedStyle(el);
    if (!visible(el, r, s)) continue;
    const fs = parseFloat(s.fontSize), text = ownText(el);
    if ((r.right > W + 1 || r.left < -1) && s.position !== "fixed" && !contained(el)) say("off-screen", el, `${Math.round(r.left)}…${Math.round(r.right)} px of ${W}`);
    if (el instanceof HTMLImageElement && el.naturalWidth && s.objectFit === "fill") {
      const a = el.naturalWidth / el.naturalHeight, b = r.width / r.height;
      if (Math.abs(a / b - 1) > 0.04) say("stretched-media", el, `${el.naturalWidth}×${el.naturalHeight} shown ${Math.round(r.width)}×${Math.round(r.height)}`);
    }
    if (el instanceof HTMLCanvasElement && el.width && el.height && r.height > 8) {
      const a = el.width / el.height, b = r.width / r.height;
      if (Math.abs(a / b - 1) > 0.04 && s.objectFit === "fill") say("stretched-media", el, `canvas ${el.width}×${el.height} shown ${Math.round(r.width)}×${Math.round(r.height)}`);
    }
    if (el.tagName.toLowerCase() === "svg" && r.width > 4) {
      const vb = el.viewBox?.baseVal;
      if (vb && vb.width && vb.height && el.getAttribute("preserveAspectRatio") === "none" && Math.abs(vb.width / vb.height / (r.width / r.height) - 1) > 0.1) say("stretched-media", el, `svg ${vb.width}×${vb.height} shown ${Math.round(r.width)}×${Math.round(r.height)}`);
      if (vb && Math.abs(vb.width - vb.height) < 1 && r.width < 40 && Math.abs(r.width / r.height - 1) > 0.2) say("stretched-icon", el, `${Math.round(r.width)}×${Math.round(r.height)}`);
    }
    if (text && el.scrollWidth > el.clientWidth + 2 && el.clientWidth > 0 && s.overflowX === "visible" && s.display !== "inline") say("text-spills", el, `${el.scrollWidth} px of text in ${el.clientWidth}`);
    if (text && /hidden|clip/.test(s.overflowX) && s.textOverflow !== "ellipsis" && el.scrollWidth > el.clientWidth + 2) say("text-clipped", el, `${el.scrollWidth} px cut to ${el.clientWidth}`);
    if (text && r.width < fs * 1.5 && el.textContent.trim().length > 3 && s.display !== "inline") say("squeezed", el, `${Math.round(r.width)} px wide for "${el.textContent.trim().slice(0, 20)}"`);
    if (text && fs < 11 && !el.closest(".cm-gutters, sup, sub, .katex")) say("small-text", el, `${fs.toFixed(1)} px`);
    if (el.matches("button, [role=button], [role=tab], [role=menuitem], select, input:not([type=hidden])")) {
      const small = Math.min(r.width, r.height);
      if (small < 32 && !el.closest(".cm-content, .markdown, .md")) say("small-target", el, `${Math.round(r.width)}×${Math.round(r.height)}`);
      if (r.height > 3 * Math.max(r.width, 48) || (r.width > 0.9 * W && r.height > 120)) say("stretched-control", el, `${Math.round(r.width)}×${Math.round(r.height)}`);
    }
  }
  if (document.documentElement.scrollWidth > W + 1) out.unshift(["page-scrolls-sideways", "html", `${document.documentElement.scrollWidth} in ${W}`]);
  return out;
}

const NATIVE = `window.AtlasNative = { ready() {}, tabs(j) { window.__tabs = j; } };`;
const settle = (page, ms = 1200) => page.waitForTimeout(ms);

/** The places, each a step from the page as the last one left it: in the app through its bridge (as AtlasActivity
 *  does), in a browser as a person would — the bottom bar, the palette, the capture button. null: not in that mode. */
function places(found) {
  const shell = (js) => (page) => page.evaluate(js);
  const bar = (label) => (page) => page.locator(".phone-bar button", { hasText: label }).click();
  const byPalette = (q) => async (page) => {
    await page.keyboard.press("Escape");
    await page.keyboard.press("Control+p");
    await page.keyboard.type(q);
    await page.waitForTimeout(600);
    await page.keyboard.press("Enter");
  };
  const note = (path) => ({ app: async (page) => { await page.keyboard.press("Escape"); await page.evaluate((p) => atlasShell.open(p), path); }, browser: byPalette(path) });
  const list = [
    ["home", { app: shell("atlasShell.home()"), browser: bar("Home") }],
    ["files", { app: shell("atlasShell.view('files')"), browser: bar("Files") }],
    ["search", { app: shell("atlasShell.view('search')"), browser: bar("Search") }],
    ["settings", { app: shell("atlasShell.view('settings')"), browser: byPalette(">Settings") }],
    ["settings-area", { app: (page) => page.locator(".settings nav button").nth(2).click(), browser: (page) => page.locator(".settings nav button").nth(2).click() }],
    ["commands", { app: shell("atlasShell.view('commands')"), browser: null }],
    ["graph", { app: shell("atlasShell.view('graph')"), browser: null }],
    ["library", { app: shell("atlasShell.view('library')"), browser: null }],
    // the Library tab (Catalog's kinds, Manga, Books, Audiobooks, Drawings…): each of its tabs judged on its own
    ["libraries", { app: shell("atlasShell.view('libraries')"), browser: byPalette(">Libraries"), tabs: ".libraries [role=tab]" }],
    ["palette", { app: (page) => page.keyboard.press("Control+p"), browser: bar("Commands") }],
    ["tabs-sheet", { app: null, browser: async (page) => { await page.keyboard.press("Escape"); await bar("Tabs")(page); } }],
    ["capture", { app: null, browser: async (page) => { await page.keyboard.press("Escape"); await page.locator(".fab").click(); } }],
  ];
  for (const [k, p] of Object.entries(found.notes)) list.push([`note-${k}`, note(p)]);
  if (found.pdf) list.push(["pdf", note(found.pdf)]);
  return list;
}

const found = notesByShape();
console.log("[audit] notes by shape:", JSON.stringify(found));
const browser = await chromium.launch();
const report = {};
const modes = [
  { id: "app-portrait", native: true, viewport: { width: 412, height: 700 } },     // the WebView between the app's bars
  { id: "browser-portrait", native: false, viewport: { width: 390, height: 760 } },
  { id: "app-landscape", native: true, viewport: { width: 860, height: 330 } },
  { id: "browser-small", native: false, viewport: { width: 360, height: 640 } },
];
try {
  for (const mode of modes) for (const scheme of ["light", "dark"]) {
    if (scheme === "dark" && mode.id !== "app-portrait" && mode.id !== "browser-portrait") continue;
    const ctx = await browser.newContext({ viewport: mode.viewport, deviceScaleFactor: 2.625, isMobile: true, hasTouch: true, colorScheme: scheme });
    if (mode.native) await ctx.addInitScript(NATIVE);
    const page = await ctx.newPage();
    const errs = [];
    page.on("pageerror", (e) => errs.push(e.message));
    await page.goto(URL_);
    await page.waitForFunction(() => document.querySelector(".dv-dockview") && (window.atlasShell || !window.AtlasNative), null, { timeout: 30_000 });
    page.setDefaultTimeout(5000);
    await settle(page, 3000);
    for (const [id, go] of places(found)) {
      if (ONLY && !ONLY.includes(id)) continue;
      const step = mode.native ? go.app : go.browser;
      if (!step) continue;
      try { await step(page); } catch (e) { errs.push(`${id}: ${e.message.split("\n")[0]}`); }
      await settle(page, id === "pdf" || id === "graph" ? 3000 : 1200);
      const key = `${mode.id}/${scheme}/${id}`;
      report[key] = await page.evaluate(judge);
      await page.screenshot({ path: join(OUT, `${mode.id}-${scheme}-${id}.png`) });
      // a place made of tabs: each one, found on the page (a plugin's tab is not known here)
      const tabs = go.tabs ? await page.locator(go.tabs).allInnerTexts().catch(() => []) : [];
      for (const [i, label] of tabs.entries()) {
        const sub = `${id}-${label.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-") || i}`;
        try { await page.locator(go.tabs).nth(i).click(); } catch (e) { errs.push(`${sub}: ${e.message.split("\n")[0]}`); continue; }
        // a plugin's library asks its helper or a server first (Suwayomi, the catalog's engine): until it shows items or says none
        await page.waitForFunction(() => document.querySelector(".library .list > *"), null, { timeout: 20_000 }).catch(() => {});
        await settle(page, 2500);
        report[`${mode.id}/${scheme}/${sub}`] = await page.evaluate(judge);
        await page.screenshot({ path: join(OUT, `${mode.id}-${scheme}-${sub}.png`) });
      }
    }
    if (errs.length) report[`${mode.id}/${scheme}/errors`] = errs.map((e) => ["page-error", "", e]);
    await ctx.close();
  }
} finally {
  await browser.close();
}
writeFileSync(join(OUT, "report.json"), JSON.stringify(report, null, 1));
const tally = {};
for (const [key, list] of Object.entries(report)) for (const [kind] of list) tally[kind] = (tally[kind] ?? 0) + 1;
console.log("[audit] findings by kind:", JSON.stringify(tally));
for (const [key, list] of Object.entries(report)) if (list.length) console.log(`\n## ${key}\n` + list.slice(0, 12).map(([k, w, d]) => `  ${k.padEnd(18)} ${w}  — ${d}`).join("\n") + (list.length > 12 ? `\n  … ${list.length - 12} more` : ""));
