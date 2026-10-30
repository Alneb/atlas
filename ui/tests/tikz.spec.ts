import { test, expect, type APIRequestContext } from "@playwright/test";
import { parseTikz, texError, uniqueIds } from "../src/lib/tikz";

// ```tikz fences drawn in the page by TeX in WebAssembly (lib/tikz.ts, lib/tikz-fence.ts): a flowchart with the
// positioning and fit libraries becomes an SVG, a TeX error shows TeX's message in place, and the source stays the
// note's text.
const H = { "x-atlas": "1" };
const put = (r: APIRequestContext, path: string, text: string) => r.put("/api/file", { headers: H, data: { path, text } });

const FLOWCHART = String.raw`\usetikzlibrary{positioning,fit}
\usetikzlibrary{arrows.meta}
\begin{tikzpicture}[node distance=1.2cm, box/.style={draw, rounded corners, fill=white}]
\node[box] (a) {Impurity solver};
\node[box, below=of a] (b) {Self-energy $\Sigma(\omega)$};
\node[box, right=2cm of b, fill=blue!20] (c) {Bath update};
\draw[-{Stealth}] (a) -- (b);
\draw[-{Stealth}] (b) -- (c);
\draw[-{Stealth}, red] (c) |- (a);
\node[draw, dashed, inner sep=6pt, fit=(a)(b)(c)] {};
\end{tikzpicture}`;
const BROKEN = String.raw`\begin{tikzpicture}
\draw (0,0) -- (1,1) \undefinedmacro;
\end{tikzpicture}`;

test("a tikz fence is read as its libraries, packages and picture", () => {
  const s = parseTikz(`% the loop\n${FLOWCHART}`);
  expect(s.libraries).toEqual(["positioning", "fit", "arrows.meta"]);
  expect(s.packages).toEqual([]);
  expect(s.body.startsWith("\\begin{tikzpicture}")).toBe(true);
  expect(parseTikz("\\usepackage[all]{tikz-cd}\n\\begin{tikzpicture}\\end{tikzpicture}").packages).toEqual([{ name: "tikz-cd", options: "all" }]);
  // a library line inside the picture is the picture's
  expect(parseTikz("\\begin{tikzpicture}\n\\usetikzlibrary{calc}\n\\end{tikzpicture}").libraries).toEqual([]);
});

test("TeX's error is its ! line and the line it stopped at", () => {
  const log = ["(input.tex", "! Undefined control sequence.", "l.3 \\draw (0,0) -- (1,1) \\undefinedmacro", "", "? Type <return> to proceed", "! Emergency stop.", "l.3 \\draw (0,0) -- (1,1) \\undefinedmacro"];
  expect(texError(log, "x")).toBe("! Undefined control sequence.\nl.3 \\draw (0,0) -- (1,1) \\undefinedmacro");
  expect(texError([], "no log")).toBe("no log");
});

test("pgf's ids are made unique per picture", () => {
  expect(uniqueIds('<g id="pgf1"/><use href="#pgf1"/><g id="pgf12"/>', "abc")).toBe('<g id="pgfabc1"/><use href="#pgfabc1"/><g id="pgfabc12"/>');
});

test("a tikz fence draws as an SVG, a broken one shows TeX's error, the source stays", async ({ page, request }) => {
  test.setTimeout(120_000);
  await put(request, "notes/tikz-loop.md", `# Loop\n\n\`\`\`tikz\n${FLOWCHART}\n\`\`\`\n\nBroken:\n\n\`\`\`tikz\n${BROKEN}\n\`\`\`\n\nUnknown package:\n\n\`\`\`tikz\n\\usepackage{siunitx}\n\\begin{tikzpicture}\\node {x};\\end{tikzpicture}\n\`\`\`\n\nlast line\n`);
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await page.keyboard.press("Control+p");
  await page.keyboard.type("tikz-loop");
  await expect(page.getByTestId("palette").getByText("tikz-loop", { exact: true }).first()).toBeVisible();
  await page.keyboard.press("Enter");
  const note = page.locator(".cm-content");
  const svg = note.locator('.tikz-figure[data-state="done"] svg');
  await expect(svg).toBeVisible({ timeout: 90_000 });
  await expect(svg.locator("text").first(), "the labels are TeX's text").toBeAttached();
  expect(await svg.evaluate((s) => s.getBoundingClientRect().width), "a real picture, not the spinner").toBeGreaterThan(150);
  const err = note.locator('.tikz-figure[data-state="error"]', { hasText: "Undefined" });
  await expect(err).toContainText("Undefined control sequence", { timeout: 60_000 });
  await expect(err).toContainText("\\undefinedmacro");
  await expect(note.locator('.tikz-figure[data-state="error"]', { hasText: "siunitx" }), "a package the page's TeX lacks is named").toContainText("Not in the TeX that draws in Atlas: siunitx");
  const text = await request.get("/api/file?path=notes/tikz-loop.md", { headers: H }).then((r) => r.json()).then((j) => j.text as string);
  expect(text, "drawing never touches the note").toContain("fit=(a)(b)(c)");
});

// tikz-feynman, served from src/vendor/tex-extra: vertices placed by hand (its automatic layout needs LuaTeX)
const FEYNMAN = String.raw`\usepackage{tikz-feynman}
\begin{tikzpicture}
\begin{feynman}
\vertex (a1) {\(e^{-}\)};
\vertex [below=2cm of a1] (a2) {\(e^{+}\)};
\vertex [below right=1cm and 1.5cm of a1] (b);
\vertex [right=1.5cm of b] (c);
\vertex [above right=1cm and 1.5cm of c] (d1) {\(\mu^{-}\)};
\vertex [below right=1cm and 1.5cm of c] (d2) {\(\mu^{+}\)};
\diagram* {
  (a1) -- [fermion] (b) -- [fermion] (a2),
  (b) -- [photon, edge label=\(\gamma\)] (c),
  (d2) -- [fermion] (c) -- [fermion] (d1),
};
\end{feynman}
\end{tikzpicture}`;

test("a Feynman diagram (tikz-feynman) draws as an SVG", async ({ page, request }) => {
  test.setTimeout(120_000);
  await put(request, "notes/feynman.md", `# Annihilation\n\n\`\`\`tikz\n${FEYNMAN}\n\`\`\`\n`);
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await page.keyboard.press("Control+p");
  await page.keyboard.type("feynman");
  await expect(page.getByTestId("palette").getByText("feynman", { exact: true }).first()).toBeVisible();
  await page.keyboard.press("Enter");
  const fig = page.locator(".cm-content .tikz-figure");
  await expect(fig).toHaveAttribute("data-state", /done|error/, { timeout: 90_000 });
  expect(await fig.getAttribute("data-state"), await fig.innerText()).toBe("done");
  expect(await fig.locator("svg").evaluate((s) => s.getBoundingClientRect().width), "a real picture").toBeGreaterThan(150);
});
