import { test, expect } from "@playwright/test";
import { fuzzy } from "../src/lib/fuzzy";

// The palette's matcher: letters scattered through the middles of words are not a match, abbreviations are.
test("scattered letters are not a match, abbreviations and substrings are", () => {
  expect(fuzzy("tasks", "PDF: export a copy with its marks inside")).toBeNull();
  expect(fuzzy("tasks", "Email — mail: conversations, search, fast triage")).toBeNull();
  expect(fuzzy("hmpg", "Home.page")).not.toBeNull();
  expect(fuzzy("opf", "Open file…")).not.toBeNull();
  expect(fuzzy("set app", "Settings: Appearance")).not.toBeNull();
  expect(fuzzy("task", "Open tasks")!.score).toBeGreaterThan(fuzzy("tsk", "Open tasks")!.score);
});
