// What every capture box says, the same words everywhere: the empty box's prompt, the short forms shown while it is
// empty, and where a capture landed. Mirrors atlas_core::capture::{PROMPT, GUIDES} (atlas-capture's tests compare).
import { shownName } from "./paths";
import { localDay } from "./local-day";
import type { CaptureResult } from "./gen/CaptureResult";

export const PROMPT = "Capture a thought, a to-do, a link…";

/** shown: the chip; starts: what a click puts in the box; what: the word beside it; tip: the form with examples. */
export interface Guide { shown: string; starts: string; what: string; tip: string }
export const GUIDES: readonly Guide[] = [
  { shown: "[]", starts: "[] ", what: "to-do", tip: "A to-do — [] pay the rent @fri · todo: call Ada" },
  { shown: "@fri", starts: "@", what: "date", tip: "A date — @today, @tomorrow, @fri, @+3d, @2026-11-02 (on a to-do: when it is due)" },
  { shown: "[[", starts: "[[", what: "link", tip: "A link to a note — [[ then a few letters of its name" },
  { shown: "#", starts: "#", what: "tag", tip: "A tag — #idea, #physics" },
];

/** Where a capture went, as every box and notice shows it, in words: "today's log" (a day's log is the file named by
 *  its day), else the note's name. A line number means nothing to a reader; Open goes to the line. */
export function landedAt(r: Pick<CaptureResult, "path" | "line">, today = localDay()): string {
  const name = shownName(r.path);
  return name === today ? "today’s log" : /^\d{4}-\d{2}-\d{2}$/.test(name) ? `the log of ${name}` : name;
}

/** Starts an empty box with a short form, as if typed: `bind:value`, the completions and autosize all see the input. */
export function startWith(box: HTMLTextAreaElement | HTMLInputElement | undefined, starts: string): void {
  if (!box) return;
  box.value = starts;
  box.dispatchEvent(new Event("input", { bubbles: true }));
  box.focus();
  box.setSelectionRange(starts.length, starts.length);
}
