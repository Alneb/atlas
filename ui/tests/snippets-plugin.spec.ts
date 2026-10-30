import { test, expect, type Page } from "@playwright/test";
import { convert, renumber } from "../../plugins/beta/snippets/ui/src/convert";
import type { Compiled } from "../../plugins/beta/snippets/ui/src/format";
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
  await page.keyboard.type(pre + typed, { delay: 5 });
  return page.locator(".cm-line:visible").last();
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
  await expect(page.getByLabel("Pack Matrices by size")).toBeVisible();
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
  expect(text).toContain('// off, in the Electrical units pack: math("mV"');
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

test("the list finds a snippet by its trigger's start, its name, or its name's letters in order", () => {
  const s = (plain: string, name?: string) => ({ plain, name }) as Compiled;
  const arrow = s("lra", "left right arrow");
  expect(rank(arrow, "lr")).toBe(0);
  expect(rank(arrow, "right")).toBe(1);
  expect(rank(arrow, "lrar")).toBe(2);
  expect(rank(arrow, "igar")).toBeNull(); // letters in order, but not from a word's start
  expect(rank(arrow, "la")).toBeNull(); // under three letters: triggers only
  expect(rank(s("sum"), "sum")).toBeNull(); // the whole trigger typed: it fires, nothing to list
});
