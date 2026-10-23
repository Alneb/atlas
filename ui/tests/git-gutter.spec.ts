import { test, expect, type APIRequestContext } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { changedLines } from "../src/lib/editor/patch-lines";
import { WS } from "../playwright.config";

// "git gutter": in a code file, a mark beside each line that differs from what git has — new,
// changed, removed — refreshed when the file is saved.
const H = { "x-atlas": "1" };
const put = (r: APIRequestContext, path: string, text: string) => r.put("/api/file", { headers: H, data: { path, text } });
const git = (...args: string[]) => execFileSync("git", args, { cwd: WS, stdio: "pipe" });

test("a diff is read into marks for the new file's lines", () => {
  const patch = ["diff --git a/x.py b/x.py", "--- a/x.py", "+++ b/x.py", "@@ -1,5 +1,5 @@", " one", "-two", "+TWO", " three", "-four", " five", "+six", ""].join("\n");
  expect([...changedLines(patch)]).toEqual([[2, "changed"], [4, "removed"], [5, "added"]]);
  expect(changedLines("diff --git a/n b/n\nnew file mode 100644\n--- /dev/null\n+++ b/n\n@@ -0,0 +1 @@\n+x\n").size, "a file git does not know: no marks").toBe(0);
  expect(changedLines("").size).toBe(0);
});

test("changed and new lines of a tracked code file are marked; saving updates the marks", async ({ page, request }) => {
  await put(request, "code/gutter.py", "a = 1\nb = 2\nc = 3\n");
  git("add", "code/gutter.py");
  git("commit", "-q", "-m", "gutter fixture");
  await put(request, "code/gutter.py", "a = 1\nb = 20\nc = 3\nd = 4\n");
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await page.keyboard.press("Control+p");
  await page.keyboard.type("gutter.py");
  await expect(page.getByTestId("palette").getByText("gutter.py").first()).toBeVisible();
  await page.keyboard.press("Enter");
  const gutter = page.locator(".cm-git-gutter");
  await expect(gutter.locator(".cm-git-changed")).toHaveCount(1);
  await expect(gutter.locator(".cm-git-added")).toHaveCount(1);

  // two more lines (vim's `o` on the empty last line leaves that one too), saved: two more marks
  await page.locator(".cm-content").click();
  await page.keyboard.press("Escape");
  await page.keyboard.type("Goe = 5");
  await page.keyboard.press("Escape");
  await page.keyboard.press("Control+s");
  await expect(gutter.locator(".cm-git-added")).toHaveCount(3);
});
