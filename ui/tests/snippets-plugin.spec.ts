import { test, expect, type Page } from "@playwright/test";
import { convert, renumber } from "../../plugins/beta/snippets/ui/src/convert";
import { builders, compileAll, keyOf, type Compiled, type Entry } from "../../plugins/beta/snippets/ui/src/format";
import { options } from "../../plugins/beta/snippets/ui/src/options";
import * as std from "../../plugins/beta/snippets/ui/src/std";
// @ts-expect-error: a plain JavaScript module, the file a vault gets
import starter from "../../plugins/beta/snippets/starter.js";
// loaded as CommonJS by the test runner, a module by the plugin
const starterSet = ((starter as { default?: unknown }).default ?? starter) as (d: object) => Entry[];
import { rank } from "../../plugins/beta/snippets/ui/src/rank";

// The Snippets plugin (plugins/beta/snippets): what must not fire, what comes back, a module of the new format beside the
// old file (the fixture's, playwright.config.ts).
const H = { "x-atlas": "1" };

async function math(page: Page, name: string, typed: string, pre = "mk") {
  await page.request.put("/api/file", { headers: H, data: { path: `snip/${name}.md`, text: `# ${name}\n` } });
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await page.request.post("/api/cmd/open", { headers: H, data: { args: { path: `snip/${name}.md` } } });
  const ed = page.locator(".cm-content:visible").first();
  await expect(ed).toContainText(name);
  await ed.click();
  await page.keyboard.press("Escape");
  await page.keyboard.type("Go");
  const last = page.locator(".cm-line:visible").last();
  await page.locator("html[data-plugins-started]").waitFor({ state: "attached" }); // the snippets plugin has started
  await page.keyboard.type(pre + typed, { delay: 5 });
  return last;
}

test("nothing fires inside a text-like argument, at any depth", async ({ page }) => {
  const last = await math(page, "textarg", "\\text{the band of sums, then bar}");
  await expect(last).toHaveText("$\\text{the band of sums, then bar}$");
});

test("an ordinary word stays as typed; the same letters before another key are the snippet", async ({ page }) => {
  // the fixture's old file has no `pi`: the test brings its own
  await page.request.put("/api/file", { headers: H, data: { path: ".atlas/snippets/zz-pi.js", text: 'export default ({ math }) => [math("pi", "\\\\pi")];\n' } });
  const last = await math(page, "words", "photon number ");
  await expect(last).toHaveText("$photon number $");
  await page.keyboard.type("kpi+");
  await expect(last).toHaveText("$photon number k\\pi+$");
  await page.keyboard.type("spi+");
  await expect(last).toHaveText("$photon number k\\pi+s\\pi+$");
});

test("Backspace right after an expansion gives back what was typed", async ({ page }) => {
  const last = await math(page, "back", "x//");
  await expect(last).toHaveText("$x\\frac{}{}$");
  await page.keyboard.press("Backspace");
  await expect(last).toHaveText("$x//$");
});

test("a { typed by habit after _ adds nothing", async ({ page }) => {
  await page.request.put("/api/file", { headers: H, data: { path: ".atlas/snippets/zz-under.js", text: 'export default ({ math }) => [math("zqu", "_{$1}$0")];\n' } });
  const last = await math(page, "brace", "Gzqu{ij");
  await expect(last).toHaveText("$G_{ij}$");
});

test("a module of the new format works beside the old file: a place, a computed body, code by its language", async ({ page }) => {
  await page.request.put("/api/file", { headers: H, data: { path: ".atlas/snippets/zz-mod.js", text: `export default ({ math, text, code, std }) => [
  math(/(\\d)(\\d)zqm/, (m) => std.matrix(+m[1], +m[2], "b")),
  text("zqt", "written $1 here", { auto: true }),
  code("py", "zqp", "print($1)$0", { auto: true }),
];\n` } });
  // digits first: after a letter the old file's subscript rule (`q1` → `q_{1}`) takes them, as it would in any vault
  await math(page, "mod", "12zqm");
  await expect(page.locator(".cm-content:visible").first()).toContainText("\\begin{bmatrix}"); // on lines of its own
  // the old file still fires
  await page.keyboard.press("Control+End");
  await page.keyboard.type("\nmkx//");
  await expect(page.locator(".cm-line:visible").last()).toHaveText("$x\\frac{}{}$");
  await page.keyboard.press("Control+End");
  await page.keyboard.type("\n\nzqt");
  await expect(page.locator(".cm-line:visible").last()).toHaveText("written  here");

  await page.request.put("/api/file", { headers: H, data: { path: "snip/run_zq.py", text: "x = 1\n" } });
  await page.request.post("/api/cmd/open", { headers: H, data: { args: { path: "snip/run_zq.py" } } });
  const code = page.locator(".code-cm:visible .cm-content").first();
  await expect(code).toContainText("x = 1");
  await code.locator(".cm-line").first().click();
  if (await page.locator(".cm-fat-cursor").count()) await page.keyboard.press("A"); else await page.keyboard.press("End");
  await page.keyboard.type(" zqp");
  await expect(code).toContainText("x = 1 print()");
});

test("the Settings page lists the snippets and offers the conversion", async ({ page }) => {
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await page.keyboard.press("Meta+,");
  const nav = page.getByRole("navigation", { name: "Settings pages" });
  await nav.getByRole("button", { name: /^Snippets/ }).click();
  await expect(page.getByRole("button", { name: "Convert" })).toBeVisible();
  await page.getByLabel("Search snippets").fill("frac");
  await expect(page.getByText("\\frac{$0}{$1}$2").first()).toBeVisible();
  await expect(page.getByLabel(/^Snippet /).first()).toBeChecked();
});

test("the Try box shows what the vault's snippets make of typed keys, by place", async ({ page }) => {
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await page.keyboard.press("Meta+,");
  await page.getByRole("navigation", { name: "Settings pages" }).getByRole("button", { name: /^Snippets/ }).click();
  const out = page.getByTestId("snippet-try-out");
  await page.getByLabel("Try snippets").fill("x//");
  await expect(out).toContainText("\\frac{");
  await page.getByLabel("Typed in").selectOption({ label: "text" });
  await expect(out).toHaveText("x//");
});

test("the conversion mends the misfires as a batch and says so", () => {
  const src = `[
  // a comment
  { trigger: "([A-Z])T", replacement: "[[0]]^{\\\\top}", options: "rmA" },
  { trigger: "=d", replacement: "\\\\Downarrow", options: "mA" },
  { trigger: "-d", replacement: "\\\\downarrow", options: "mA" },
  { trigger: /([A-Za-z])(\\d)/, replacement: "[[0]]_{[[1]]}", options: "rmA", priority: -1 },
  { trigger: "//", replacement: "\\\\frac{$0}{$1}$2", options: "mA" },
  { trigger: "mV", replacement: "\\\\space\\\\text{mV}", options: "mA" },
  { trigger: "minl", replacement: "$$0$", options: "tA" },
];`;
  const { text, dropped } = convert({ sources: [src], variables: "" });
  expect(text).toContain("// a comment");
  expect(text).not.toContain('"([A-Z])T"');
  expect(text).not.toContain('"=d"');
  expect(text).toContain('math("-d", "\\\\downarrow", { when:');
  expect(text).toContain("(?<![\\\\A-Za-z])([A-Za-z])(\\d)");
  expect(text).toContain('math("//", "\\\\frac{$1}{$2}$0")');
  expect(text).toContain('// off, in options.units() below: math("mV"');
  expect(text).toContain("options.units({ on: false })");
  expect(text).toContain('text("minl", "$$1$", { auto: true })');
  expect(dropped.length).toBeGreaterThanOrEqual(4);
  expect(renumber("\\sum_{${0:i}=${1:1}}^{${2:N}} $3")).toBe("\\sum_{${1:i}=${2:1}}^{${3:N}} $0");
});

test("Tab walks a formula's brackets, Shift+Tab walks back", async ({ page }) => {
  await math(page, "tabwalk", "(a)+(b)");
  await page.keyboard.press("Shift+Tab"); // into the last bracket, at its end
  await page.keyboard.type("!"); // not a digit: after a letter that is a subscript
  await page.keyboard.press("Shift+Tab"); // before its `(`
  await page.keyboard.press("Shift+Tab"); // into the first bracket, at its end
  await page.keyboard.type(",");
  await page.keyboard.press("Tab"); // out of it
  await page.keyboard.press("Tab"); // into the next one
  await page.keyboard.type(";");
  await expect(page.locator(".cm-content:visible").first()).toContainText("(a,)+(;b!)");
});

test("the list finds a snippet by its whole trigger first, then its trigger's start, its name, or its name's letters in order", () => {
  const s = (plain: string, name?: string) => ({ plain, name }) as Compiled;
  const arrow = s("lra", "left right arrow");
  expect(rank(arrow, "lr")).toBe(0);
  expect(rank(arrow, "right")).toBe(1);
  expect(rank(arrow, "lrar")).toBe(2);
  expect(rank(arrow, "igar")).toBeNull(); // letters in order, but not from a word's start
  expect(rank(arrow, "la")).toBeNull(); // under three letters: triggers only
  expect(rank(s("sum"), "sum")).toBe(-1); // the whole trigger typed: listed first, what Space would expand
});

test("a space typed after an expanded command stays, and the next letter keeps it (\\partial q, not \\partialq)", async ({ page }) => {
  await page.request.put("/api/file", { headers: H, data: { path: ".atlas/snippets/zz-part.js", text: 'export default ({ math, commands }) => [math("part", "\\\\partial"), commands(["partial"], { digit: "space" })];\n' } });
  const last = await math(page, "partial", "part q");
  await expect(last).toHaveText("$\\partial q$");
});

test("the file is the one set: its options switch as one, Settings flips a snippet or an option by its key", () => {
  const file = () => [builders.math("mbb", "\\mathbb{$1}$0"), options.units({ on: false }), options.matrices()];
  const read = (switched: string[] = []) => compileAll([{ source: "latex.js", entries: file() }], new Set(switched));
  const plain = read();
  expect(plain.options.map((o) => [o.id, o.on])).toEqual([["electrical-units", false], ["matrices-by-size", true]]);
  expect(plain.snippets.some((s) => s.plain === "kV")).toBe(false); // off with its option, still listed
  expect(plain.all.some((s) => s.plain === "kV" && s.option === "electrical-units")).toBe(true);
  const mbb = plain.all.find((s) => s.plain === "mbb")!;
  expect(mbb.key).toBe(keyOf(mbb));
  const flipped = read([mbb.key, "option:electrical-units"]);
  expect(flipped.snippets.some((s) => s.plain === "mbb")).toBe(false);
  expect(flipped.snippets.some((s) => s.plain === "kV")).toBe(true);
  // the starter a vault gets reads whole, frac and the spacing in it, the extra options off
  const set = compileAll([{ source: "latex.js", entries: starterSet({ ...builders, std, options }) }]);
  expect(set.problems).toEqual([]);
  expect(set.snippets.some((s) => s.plain === "frac")).toBe(true);
  expect(set.options.find((o) => o.id === "automatic-spacing")?.on).toBe(true);
  expect(set.options.filter((o) => o.on).map((o) => o.id)).toEqual(["automatic-spacing", "auto-align"]);
});

test("a math word trigger also fires on each shorter start no other trigger shares", () => {
  const set = compileAll([{ source: "s.js", entries: [builders.math("mfrak", "F"), builders.math("mathbb", "B"), builders.math("mathbf", "C"), builders.math("mbf", "D"), builders.text("tfrak", "T")] }]).snippets;
  const plains = set.map((s) => s.plain);
  expect(plains).toEqual(expect.arrayContaining(["mfra", "mfr"])); // mfrak's own starts
  expect(plains).not.toContain("mathb"); // shared by mathbb and mathbf
  expect(plains).not.toContain("tfr"); // text triggers: none (words collide)
  expect(set.filter((s) => s.plain === "mbf").map((s) => String(s.body))).toEqual(["D"]); // an existing trigger is never shadowed
});

test("a command is also typed by its unshared starts and with two neighbouring letters swapped", () => {
  const set = compileAll([{ source: "s.js", entries: [builders.commands(["alpha", "beta", "epsilon", "varepsilon", "theta", "therefore"])] }]).snippets;
  const body = (p: string) => set.find((s) => s.plain === p)?.body;
  expect(body("alp")).toBe("\\alpha");
  expect(body("alpah")).toBe("\\alpha");
  expect(body("bet")).toBe("\\beta");
  expect(body("eps")).toBe("\\epsilon");
  expect(body("the")).toBeUndefined(); // theta and therefore both start so
  expect(body("thet")).toBe("\\theta");
});

test("a longer command is also typed with one letter inside it dropped, where nothing else is so spelled", () => {
  const set = compileAll([{ source: "s.js", entries: [builders.commands(["lambda", "alpha", "sigma", "sigmaz", "beta"])] }]).snippets;
  const body = (p: string) => set.find((s) => s.plain === p)?.body;
  expect(body("lamda")).toBe("\\lambda");
  expect(body("lmbda")).toBe("\\lambda");
  expect(body("apha")).toBe("\\alpha");
  expect(body("bta")).toBeUndefined(); // four letters: too short to guess
  expect(body("sigm")).toBeUndefined(); // a start of sigma itself
  expect(body("sima")).toBe("\\sigma");
});

test("a misspelt command becomes the command, but not where the misspelling is a word", async ({ page }) => {
  await page.request.put("/api/file", { headers: H, data: { path: ".atlas/snippets/zz-typo.js", text: 'export default ({ commands }) => [commands(["lambda", "rangle"])];\n' } });
  const last = await math(page, "typo", "lamda x ");
  await expect(last).toHaveText("$\\lambda x $");
  await page.keyboard.type("range ");
  await expect(last).toHaveText("$\\lambda x range $");
});

test("a trigger typed from its first letter fires at once; Space after it adds nothing; Undo leaves the trigger; ^ takes no space before it", async ({ page }) => {
  await page.request.put("/api/file", { headers: H, data: { path: ".atlas/snippets/zz-now.js", text: 'export default ({ math }) => [math("zfrac", "\\\\frac{$1}{$2}$0"), math("zket", "\\\\ket{$1} $0")];\n' } });
  const last = await math(page, "now", "zfrac a");
  await expect(last).toHaveText("$\\frac{a}{}$");
  await page.keyboard.press("End");
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.type(" zket");
  await expect(last).toHaveText("$\\frac{a}{} \\ket{} $");
  await page.keyboard.press("Control+z");
  await expect(last).toHaveText("$\\frac{a}{} zket$");
  const sup = await math(page, "nowsup", "zketx");
  await page.keyboard.press("End");
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.type("^2");
  await expect(sup).toHaveText("$\\ket{x}^2$");
});
