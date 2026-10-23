// What the capture box says about the text in it, before it is sent: "this will be a to-do",
// "due Friday". The rules are the core's (crates/atlas-core/src/capture.rs: `as_task`,
// `with_dates`) — the core decides what is written; this only says it in advance, so the short
// forms can be learnt from the box itself. Keep the two in step.

const TASK_STARTS = ["- [ ] ", "[ ] ", "[] ", "todo:", "todo ", "t:"];
const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

/** The day a word after `@` names (`today`, `tomorrow`, `tmr`, `mon`…`sunday`, `+3d`), if it names one. */
export function dayOf(word: string, today: Date): Date | null {
  const w = word.toLowerCase(), at = (n: number) => { const d = new Date(today); d.setDate(d.getDate() + n); return d; };
  if (w === "today") return at(0);
  if (w === "tomorrow" || w === "tmr") return at(1);
  const plus = /^\+(\d+)d$/.exec(w);
  if (plus) return at(Number(plus[1]));
  const i = DAYS.findIndex((d) => w.startsWith(d) && w.length <= 9);
  if (i < 0) return null;
  const ahead = (i - ((today.getDay() + 6) % 7) + 7) % 7; // Monday = 0, like the core
  return at(ahead === 0 ? 7 : ahead);
}

export interface CaptureHint { task: boolean; due: Date | null }

export function captureHint(text: string, today = new Date()): CaptureHint {
  const first = text.trimStart().split("\n")[0], lower = first.toLowerCase();
  const start = TASK_STARTS.find((p) => lower.startsWith(p));
  const task = !!start && first.slice(start.length).trim().length > 0;
  // `@tomorrow`, or a due date written out by the task fields (📅 2026-10-17)
  const written = /📅\uFE0F?\s*(\d{4})-(\d{2})-(\d{2})/.exec(first);
  const due = (written ? new Date(Number(written[1]), Number(written[2]) - 1, Number(written[3])) : null)
    ?? first.split(" ").map((w) => (w.startsWith("@") ? dayOf(w.slice(1), today) : null)).find((d) => d) ?? null;
  return { task, due };
}

/** The date as one says it: Today, Tomorrow, Friday 16 Oct. */
export function sayDay(d: Date, today = new Date()): string {
  const days = Math.round((new Date(d).setHours(12, 0, 0, 0) - new Date(today).setHours(12, 0, 0, 0)) / 86_400_000);
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  return d.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "short" });
}
