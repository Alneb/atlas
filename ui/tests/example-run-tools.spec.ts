import { test, expect, type APIRequestContext } from "@playwright/test";
import { openFile } from "./open";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import * as words from "../src/lib/shell-words";

// The example plugin plugins/beta/run-tools/ installed as it is: its Run button above a Python
// file types the command into the terminal (`atlas.editor.toolbar` + `atlas.terminal.run`) and the
// output is there to read.
const H = { "x-atlas": "1" };
const put = (r: APIRequestContext, path: string, text: string) => r.put("/api/file", { headers: H, data: { path, text } });
const example = (f: string) => readFileSync(fileURLToPath(new URL(`../../plugins/beta/run-tools/${f}`, import.meta.url)), "utf8");

test.beforeAll(async ({ request }) => {
  await put(request, "code/answer.py", "print('the answer is', 6 * 7)\n");
  await put(request, ".atlas/plugins/run-tools/main.js", example("main.js"));
  await put(request, ".atlas/plugins/run-tools/plugin.toml", example("plugin.toml"));
});
test.afterAll(async ({ request }) => { await put(request, ".atlas/plugins/run-tools/main.js", "export function register() {}\n"); });

test("the example run tools: Run above a Python file runs it in the terminal", async ({ page }) => {
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await openFile(page, "answer.py");
  const bar = page.getByTestId("code-bar");
  await expect(bar.getByRole("button", { name: "Test" })).toBeVisible();
  await bar.getByRole("button", { name: "Run", exact: true }).click();
  const term = page.locator(".xterm-rows");
  await expect(term, "the command is there to read").toContainText("python3 code/answer.py", { timeout: 15_000 });
  await expect(term, "and so is what it printed").toContainText("the answer is 42", { timeout: 15_000 });
});

// Test: the file's own tests in the chooser, "All" first; the one chosen is the command's selector (pytest file::name).
test("Test offers the file's tests, and runs the one chosen", async ({ page, request }) => {
  await put(request, "code/test_pick.py", "def test_one():\n    assert True\n\nclass TestTwo:\n    def test_inner(self):\n        assert True\n");
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await openFile(page, "test_pick.py");
  await page.getByTestId("code-bar").getByRole("button", { name: "Test" }).click();
  const palette = page.getByTestId("palette");
  await expect(palette.getByText("All tests in this file")).toBeVisible();
  await expect(palette.getByText("test_one", { exact: true })).toBeVisible();
  await palette.getByText("TestTwo::test_inner", { exact: true }).click();
  await expect(page.locator(".xterm-rows")).toContainText("-m pytest code/test_pick.py::TestTwo::test_inner", { timeout: 15_000 });
});

// The words each shell reads back, and what the project files name (main.js's pure part, imported as it is).
test("commands are written for the terminal's shell, and the project's files are read", async () => {
  const m = await import(new URL("../../plugins/beta/run-tools/main.js", import.meta.url).href);
  expect(m.quote("a b")).toBe("'a b'");
  expect(m.quote("it's", "powershell")).toBe("'it''s'");
  expect(m.quote("x\"y", "cmd")).toBe("\"x\"\"y\"");
  expect(m.quote("code/a.py")).toBe("code/a.py");
  expect(m.line("powershell", "C:\\py env\\python.exe", "x.py")).toBe("& 'C:\\py env\\python.exe' x.py");
  expect(m.venvPython("powershell", "proj\\.venv")).toBe("proj\\.venv\\Scripts\\python.exe");
  expect(m.venvPython("posix", ".venv")).toBe(".venv/bin/python");
  expect(m.makeTargets("all: x\n.PHONY: all\nbuild:\n\tcc\nCC := gcc\n%.o: %.c\ntest:")).toEqual(["all", "build", "test"]);
  expect(m.justRecipes("build:\n  cargo b\ntest arg=\"x\":\n  t\nset shell := [\"bash\"]\n")).toEqual(["build", "test"]);
  expect(m.npmScripts('{"scripts":{"dev":"vite","test":"vitest"}}')).toEqual(["dev", "test"]);
  expect(m.testsIn("a.go", "func TestA(t *testing.T) {}\nfunc helper() {}")).toEqual(["TestA"]);
  expect(m.testsIn("a.test.js", "test(\"one thing\", () => {})\n  it('two', f)")).toEqual(["one thing", "two"]);
  // LaTeX: a chapter builds its document, by its own word or the main.tex above it
  expect(m.texRoot("thesis/ch/one.tex", "% !TEX root = ../main.tex\n\\chapter{x}")).toBe("thesis/main.tex");
  expect(m.isDocument("% x\n\\documentclass{article}")).toBe(true);
  expect(m.isDocument("\\chapter{a}")).toBe(false);
  expect(m.LATEX).toContain("-lualatex");
});

// The app's own quoting (`atlas.terminal.quote` / `line`, lib/shell-words.ts) and run-tools' copy (its fallback on an
// older app) say the same words for every shell.
test("pure: atlas.terminal.quote and run-tools' quote agree", async () => {
  const m = await import(new URL("../../plugins/beta/run-tools/main.js", import.meta.url).href);
  for (const shell of ["posix", "powershell", "cmd"] as const) {
    for (const w of ["plain", "a b", "it's", "x\"y", "C:\\py env\\python.exe", "~/notes", "$HOME", "a;b"]) expect(words.quote(w, shell)).toBe(m.quote(w, shell));
    expect(words.line(shell, "C:\\py env\\python.exe", "x.py", undefined, "a b")).toBe(m.line(shell, "C:\\py env\\python.exe", "x.py", undefined, "a b"));
  }
  expect(words.quote("it's")).toBe("'it'\\''s'");
});
