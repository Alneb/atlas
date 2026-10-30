import { test, expect } from "@playwright/test";

// snippet files come from the fixture's config.toml (playwright.config.ts)
test("LaTeX Suite snippets expand in markdown math (auto, tab stops, regex, variables)", async ({ page }) => {
  {
    await page.goto("/");
    await page.getByText("Finish the GW notes.").waitFor();
    await page.keyboard.press("Control+p");
    await page.keyboard.type("hubbard.md");
    await expect(page.getByTestId("palette").getByText("hubbard", { exact: true }).first()).toBeVisible();
    await page.keyboard.press("Enter");
    await page.locator(".cm-content").click();
    await page.keyboard.press("Escape");
    await page.keyboard.type("Go"); // vim: new line at the end, insert mode
    await page.keyboard.type("mk"); // → $|$
    await page.keyboard.type("x//"); // → $x\frac{|}{}$
    await page.keyboard.type("a");
    await page.keyboard.press("Tab");
    await page.keyboard.type("b2"); // regex: b2 → b_{2}
    await page.keyboard.press("Tab");
    await page.keyboard.type("+@alpha"); // variables: @alpha → \alpha
    const last = page.locator(".cm-line").last();
    await expect(last).toHaveText("$x\\frac{a}{b_{2}}+\\alpha$");
  }
});

test("in a .tex file math snippets fire only in math; visual snippets wrap the selection", async ({ page }) => {
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await page.keyboard.press("Control+p");
  await page.keyboard.type("ch2.tex");
  await expect(page.getByTestId("palette").getByText("ch2.tex").first()).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page.locator(".cm-content")).toContainText("Text here.");
  await page.locator(".cm-content").click();
  await page.keyboard.press("Escape");
  await page.keyboard.type("Go"); // vim: new line at the end, insert mode
  await page.keyboard.type("We begin a//b "); // prose: neither `beg` nor `//` may expand
  await page.keyboard.type("$x//"); // inline math: `//` → \frac
  const last = page.locator(".cm-line").last();
  await expect(last).toHaveText("We begin a//b $x\\frac{}{}"); // .tex does not auto-close $
  // visual: select a word in math (shift+arrows in insert mode), type U → \underbrace{word}_{}
  await page.keyboard.press("End");
  await page.keyboard.type(" \\[ yz \\]");
  for (let i = 0; i < 3; i++) await page.keyboard.press("ArrowLeft"); // before " \\]"
  await page.keyboard.press("Shift+ArrowLeft");
  await page.keyboard.press("Shift+ArrowLeft");
  await page.keyboard.type("U");
  await expect(last).toContainText("\\[ \\underbrace{yz}_{} \\]");
});

// "autocompletion of snippets in md": typing the start of a trigger in math lists the snippets that
// start so, with what they expand to; Enter expands the chosen one with its tab stops. Never in prose.
test("snippet triggers are offered as completions in math, not in prose", async ({ page }) => {
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await page.keyboard.press("Control+p");
  await page.keyboard.type("hubbard.md");
  await expect(page.getByTestId("palette").getByText("hubbard", { exact: true }).first()).toBeVisible();
  await page.keyboard.press("Enter");
  await page.locator(".cm-content").click();
  await page.keyboard.press("Escape");
  await page.keyboard.type("Go");
  const menu = page.locator(".cm-tooltip-autocomplete");
  await page.keyboard.type("the sum ");
  await page.waitForTimeout(400);
  await expect(menu).toHaveCount(0); // prose: no popup
  await page.keyboard.type("mk"); // → $|$
  await page.keyboard.type("su");
  await expect(menu.locator("li")).toHaveText([/sumk.*\\sum_\{k=/, /sumq.*\\sum_\{q\}/]);
  await page.waitForTimeout(150); // CodeMirror ignores Enter for 75 ms after the list opens (interactionDelay)
  await page.keyboard.press("Enter");
  await page.keyboard.type("1");
  await page.keyboard.press("Tab");
  await page.keyboard.type("N");
  await expect(page.locator(".cm-line").last()).toHaveText("the sum $\\sum_{k=1}^{N}$");
});

// The longest trigger wins: "kV" used to eat "kVA" (and "VA" would have, at the A). A trigger that
// can still grow waits one key; a key that does not continue it releases it. Tab releases it too.
test("a snippet whose trigger starts another one waits a key, so the longer one can be typed", async ({ page }) => {
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await page.keyboard.press("Control+p");
  await page.keyboard.type("hubbard.md");
  await expect(page.getByTestId("palette").getByText("hubbard", { exact: true }).first()).toBeVisible();
  await page.keyboard.press("Enter");
  await page.locator(".cm-content").click();
  await page.keyboard.press("Escape");
  await page.keyboard.type("Go");
  const last = page.locator(".cm-line").last();
  await page.keyboard.type("mk5kVA"); // the longer one
  await expect(last).toHaveText("$5\\text{kVA}$");
  await page.keyboard.type("+3kV+"); // the short one, released by the next key
  await expect(last).toHaveText("$5\\text{kVA}+3\\text{kV}+$");
  await page.keyboard.type("2kV");
  await expect(last).toHaveText("$5\\text{kVA}+3\\text{kV}+2kV$"); // waiting
  await page.keyboard.press("Tab");
  await expect(last).toHaveText("$5\\text{kVA}+3\\text{kV}+2\\text{kV}$");
});

// A snippet expanded in another's stop hands Tab back to the outer one when its own stops are done (the outer
// \frac's denominator, not the middle of `}{`); Tab with no stops leaves the bracket the caret is in, from anywhere in
// it; a letters-only trigger never cuts a command short (`hbar`, `\langle` with an `ang` snippet); `bra` waits while
// `braket` is still being typed; a function replacement's own `const` survives the file being read.
test("Tab walks nested snippets in order and leaves brackets; commands are never cut short", async ({ page }) => {
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await page.keyboard.press("Control+p");
  await page.keyboard.type("tabstops.md");
  await expect(page.getByTestId("palette").getByText("tabstops", { exact: true }).first()).toBeVisible();
  await page.keyboard.press("Enter");
  await page.locator(".cm-content").click();
  await page.keyboard.press("Escape");
  await page.keyboard.type("Go");
  const last = page.locator(".cm-line").last();
  await page.keyboard.type("mk"); // → $|$
  await page.keyboard.type("fraca");
  await page.keyboard.type("fracb");
  await page.keyboard.press("Tab");
  await page.keyboard.type("c");
  await page.keyboard.press("Tab"); // out of the inner \frac, still in the outer numerator
  await page.keyboard.type("+");
  await page.keyboard.press("Tab"); // the outer denominator
  await page.keyboard.type("d");
  await page.keyboard.press("Tab");
  await expect(last).toHaveText("$\\frac{a\\frac{b}{c}+}{d}$");
  await page.keyboard.type(" (x+y)");
  for (let i = 0; i < 3; i++) await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("Tab"); // from the middle of ( … ): after it
  await page.keyboard.type(" hbar \\langle bra\\psi");
  await page.keyboard.press("Tab");
  await page.keyboard.type("braketa");
  await page.keyboard.press("Tab");
  await page.keyboard.type("b");
  await page.keyboard.press("Tab");
  await page.keyboard.type("iden3");
  await expect(last).toHaveText("$\\frac{a\\frac{b}{c}+}{d} (x+y) \\hbar \\langle \\bra{\\psi} \\braket{ a | b } I_3$");
});
