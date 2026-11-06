import { test, expect, type APIRequestContext, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { openFile } from "./open";
import { wordsOf } from "../src/lib/editor/prose";
import { addSentences, emptyModel, packSentences, predict, sentences, unpackSentences } from "../../plugins/beta/predictor/ui/src/model";
import { dicStems } from "../src/lib/editor/dictionaries";
import { parseWordFreq } from "../src/lib/editor/word-freq";

// The Predictor plugin (plugins/beta/predictor): the rest of a word, and the next word when the vault is sure, faint
// after the caret; Tab or → at the end of the line takes it; never in math. The model is tested alone first.
const H = { "x-atlas": "1" };
const put = (r: APIRequestContext, path: string, text: string) => r.put("/api/file", { headers: H, data: { path, text } });
const built = (f: string) => readFileSync(new URL(`../../plugins/beta/predictor/${f}`, import.meta.url), "utf8");
const TEXT = "Wannier functions are local. The Wannier functions of a band. Maximally localized Wannier functions help. "
  + "Wannier functions again. We build Wannier functions. Smooth Wannier functions too. The wannier gauge.";

const model = (text: string) => {
  const m = emptyModel();
  addSentences(m, unpackSentences(packSentences(sentences(text, wordsOf))));
  return m;
};

test("the model: the rest of a word as the vault writes it, the next word only when sure, nothing for one letter", () => {
  const m = model(TEXT);
  const o = { min: 3, nextWord: true };
  expect(predict(m, "The Wan", wordsOf, o)?.ghost).toBe("nier functions");
  expect(predict(m, "the wan", wordsOf, o)?.ghost).toBe("nier functions"); // the typed letters stay as typed
  expect(predict(m, "Smooth Wannier ", wordsOf, o)?.ghost).toBe("functions");
  expect(predict(m, "The W", wordsOf, o)).toBeNull();
  expect(predict(m, "The Wan", wordsOf, { min: 3, nextWord: false })?.ghost).toBe("nier");
  expect(predict(m, "The Wan", wordsOf, { min: 9, nextWord: true })).toBeNull();
  expect(predict(m, "zzz qq", wordsOf, o)).toBeNull();
  // a note's counts leave again (a saved note is recounted)
  const twice = model(TEXT);
  addSentences(twice, sentences(TEXT, wordsOf), 1);
  addSentences(twice, sentences(TEXT, wordsOf), -1);
  expect([...twice.words]).toEqual([...m.words]);
});

test("the language's frequencies finish any word when one is clearly likeliest; the note being written counts first", () => {
  const lex = dicStems("6\napproximate/DSG\napproximation/MS\napproximately\nHubbard/M\nthe\nthere\n");
  expect(lex).toEqual(["approximate", "approximately", "approximation", "the", "there"]); // names left out
  const general = parseWordFreq("en", "@300\nthe\n@350\nthere\n@400\nbecause\nexample\n@450\napproximately\n@520\napproximate\n@530\napproximation\nbecame\n");
  const m = model(TEXT);
  const o = { min: 3, nextWord: true, lexicon: lex, general };
  expect(predict(m, "A good approx", wordsOf, o)?.ghost).toBe("imately"); // the commonest by far
  expect(predict(m, "An Approx", wordsOf, o)?.ghost).toBe("imately");
  expect(predict(m, "It is beca", wordsOf, o)?.ghost).toBe("use");
  expect(predict(m, "A good ap", wordsOf, { ...o, general: undefined })).toBeNull(); // two letters, nothing known
  expect(predict(m, "Over the", wordsOf, o)).toBeNull(); // already a word, likelier than "there"
  // with only a word list and no frequencies, three words are equally likely: no guess
  expect(predict(m, "A good approx", wordsOf, { min: 3, nextWord: true, lexicon: lex })).toBeNull();
  // the open note's own words: a name it uses wins at once
  const note = model("Hubbard model. The Hubbard model is solved. Hubbard again.");
  expect(predict(m, "The Hub", wordsOf, { ...o, note })?.ghost).toBe("bard");
});

test.describe("in the editor", () => {
  test.beforeAll(async ({ request }) => {
    for (const f of ["plugin.toml", "main.js", "helper.js"]) await put(request, `.atlas/plugins/predictor/${f}`, built(f));
    await put(request, "notes/predict-a.md", `# Predict A\n\n${TEXT}\n`);
    await put(request, "notes/predict-b.md", `# Predict B\n\n${TEXT}\n`);
    await put(request, "notes/predict-new.md", "# Predict new\n\n");
  });
  test.afterAll(async ({ request }) => {
    await put(request, ".atlas/plugins/predictor/main.js", "export function register() {}\n");
    await request.post("/api/plugins/predictor/helper/stop", { headers: H });
  });

  const lastLine = (page: Page) => page.evaluate(() => (window as unknown as { __atlas: { editor(): { text: string } | null } }).__atlas.editor()?.text.trimEnd().split("\n").pop());

  test("a ghost after typing in prose: Tab takes it, → at the end of the line too, Escape drops it, none in math", async ({ page }) => {
    await page.goto("/");
    await page.getByText("Finish the GW notes.").waitFor();
    await openFile(page, "predict-new.md");
    await page.locator(".cm-content").click();
    await page.keyboard.press("Escape");
    const ghost = page.locator(".cm-predict-ghost");
    // the vault is learned in the background: type until it answers
    await page.keyboard.type("Go");
    await expect.poll(async () => {
      await page.keyboard.type("The Wan");
      await page.waitForTimeout(300); // the guess waits for a pause in the typing
      const seen = await ghost.count() ? await ghost.textContent() : null;
      for (let i = 0; i < 7; i++) await page.keyboard.press("Backspace");
      return seen;
    }, { timeout: 30000 }).toBe("nier functions");

    await page.keyboard.type("The Wan");
    await expect(ghost).toHaveText("nier functions");
    for (const theme of ["light", "dark"]) {
      await page.evaluate((t) => document.documentElement.setAttribute("data-theme", t), theme);
      await page.locator(".cm-activeLine").screenshot({ path: `../target/snip/predict-${theme}.png` });
    }
    await page.keyboard.type("n"); // typing its own next letter keeps the rest
    await expect(ghost).toHaveText("ier functions");
    await page.keyboard.press("Tab");
    await expect.poll(() => lastLine(page)).toBe("The Wannier functions");
    await expect(ghost).toHaveCount(0);

    await page.keyboard.type(". Smooth Wan");
    await expect(ghost).toHaveText("nier functions");
    await page.keyboard.press("ArrowRight");
    await expect.poll(() => lastLine(page)).toBe("The Wannier functions. Smooth Wannier functions");

    await page.keyboard.type(". The Wan");
    await expect(ghost).toHaveCount(1);
    await page.keyboard.press("Escape");
    await expect(ghost).toHaveCount(0);

    await page.keyboard.type("o $The Wan");
    await page.waitForTimeout(400);
    await expect(ghost, "never in math").toHaveCount(0);
  });
});
