import { test, expect } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { WS } from "../playwright.config";

const git = (...a: string[]) => execFileSync("git", ["-C", WS, ...a], { stdio: "ignore" });
const TEN = Array.from({ length: 12 }, (_, i) => `line ${i + 1}`).join("\n") + "\n";

// VS Code's source control: stage one hunk from the diff, discard a file (asks; a copy is kept).
test("git: stage a single hunk, then discard the rest of the file", async ({ page }) => {
  const f = join(WS, "notes/hunks.md");
  writeFileSync(f, TEN);
  git("add", "notes/hunks.md"); // in the index only: no commit for other tests' Activity to see
  writeFileSync(f, TEN.replace("line 1\n", "LINE ONE\n").replace("line 12\n", "LINE TWELVE\n"));

  await page.goto("/");
  await page.keyboard.press("Meta+g");
  await page.locator(".entry", { hasText: "hunks" }).last().locator(".name").click(); // under Changes
  const stageHunk = page.getByRole("button", { name: "Stage hunk" });
  await expect(stageHunk).toHaveCount(2);
  await stageHunk.first().click();
  await expect(stageHunk).toHaveCount(1); // the diff reloads: one hunk left unstaged
  await page.keyboard.press("Meta+g");
  await page.locator(".entry", { hasText: "hunks" }).last().hover();
  await page.getByRole("button", { name: "Discard changes to notes/hunks.md" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Discard" }).click();
  // the staged hunk stays, the unstaged one is gone
  await expect.poll(() => readFileSync(f, "utf8")).toBe(TEN.replace("line 1\n", "LINE ONE\n"));
  git("rm", "-q", "--cached", "notes/hunks.md");
  rmSync(f);
});
