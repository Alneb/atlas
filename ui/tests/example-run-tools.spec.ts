import { test, expect, type APIRequestContext } from "@playwright/test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// The example plugin plugins/stable/run-tools/ installed as it is: its Run button above a Python
// file types the command into the terminal (`atlas.editor.toolbar` + `atlas.terminal.run`) and the
// output is there to read.
const H = { "x-atlas": "1" };
const put = (r: APIRequestContext, path: string, text: string) => r.put("/api/file", { headers: H, data: { path, text } });
const example = (f: string) => readFileSync(fileURLToPath(new URL(`../../plugins/stable/run-tools/${f}`, import.meta.url)), "utf8");

test.beforeAll(async ({ request }) => {
  await put(request, "code/answer.py", "print('the answer is', 6 * 7)\n");
  await put(request, ".atlas/plugins/run-tools/main.js", example("main.js"));
  await put(request, ".atlas/plugins/run-tools/plugin.toml", example("plugin.toml"));
});
test.afterAll(async ({ request }) => { await put(request, ".atlas/plugins/run-tools/main.js", "export function register() {}\n"); });

test("the example run tools: Run above a Python file runs it in the terminal", async ({ page }) => {
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await page.keyboard.press("Control+p");
  await page.keyboard.type("answer.py");
  await expect(page.getByTestId("palette").getByText("answer.py").first()).toBeVisible();
  await page.keyboard.press("Enter");
  const bar = page.getByTestId("code-bar");
  await expect(bar.getByRole("button", { name: "Test" })).toBeVisible();
  await bar.getByRole("button", { name: "Run", exact: true }).click();
  const term = page.locator(".xterm-rows");
  await expect(term, "the command is there to read").toContainText("python3 'code/answer.py'", { timeout: 15_000 });
  await expect(term, "and so is what it printed").toContainText("the answer is 42", { timeout: 15_000 });
});

// Test: the file's own tests in the chooser, "All" first; the one chosen is the command's selector (pytest file::name).
test("Test offers the file's tests, and runs the one chosen", async ({ page, request }) => {
  await put(request, "code/test_pick.py", "def test_one():\n    assert True\n\nclass TestTwo:\n    def test_inner(self):\n        assert True\n");
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await page.keyboard.press("Control+p");
  await page.keyboard.type("test_pick.py");
  await expect(page.getByTestId("palette").getByText("test_pick.py").first()).toBeVisible();
  await page.keyboard.press("Enter");
  await page.getByTestId("code-bar").getByRole("button", { name: "Test" }).click();
  const palette = page.getByTestId("palette");
  await expect(palette.getByText("All tests in this file")).toBeVisible();
  await expect(palette.getByText("test_one", { exact: true })).toBeVisible();
  await palette.getByText("TestTwo::test_inner", { exact: true }).click();
  await expect(page.locator(".xterm-rows")).toContainText("-m pytest 'code/test_pick.py::TestTwo::test_inner'", { timeout: 15_000 });
});
