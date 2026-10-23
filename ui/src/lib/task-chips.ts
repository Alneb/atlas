// A task's fields drawn as small chips instead of Obsidian Tasks' emoji: `📅 2026-10-17` reads as [calendar] Fri 17 Oct, `⏫` as
// [chevrons] high, `🔁 every week` as [repeat] week. The file keeps the emoji (Obsidian reads them;
// the core's tasks.rs reads them); this only draws — in the editor (editor/task-chips.ts, where a
// line under the caret shows its text to edit) and in Today's list of open tasks.
import { iconSvg } from "./icons";
import type { IconName } from "./panes";
import { localDay } from "./local-day";

export type ChipKind = "due" | "scheduled" | "start" | "created" | "done" | "priority" | "repeat";
export interface Chip { kind: ChipKind; from: number; to: number; text: string; icon: IconName; title: string; tone?: "late" | "soon" | "high" | "low" }

const DATES: Record<string, { kind: ChipKind; icon: IconName; what: string }> = {
  "📅": { kind: "due", icon: "calendar", what: "due" }, "⏳": { kind: "scheduled", icon: "clock", what: "scheduled" },
  "🛫": { kind: "start", icon: "flag", what: "starts" }, "➕": { kind: "created", icon: "plus", what: "created" }, "✅": { kind: "done", icon: "check", what: "done" },
};
const PRIORITIES: Record<string, { name: string; up: boolean }> = {
  "🔺": { name: "highest", up: true }, "⏫": { name: "high", up: true }, "🔼": { name: "medium", up: true }, "🔽": { name: "low", up: false }, "⏬": { name: "lowest", up: false },
};
const FIELD = /(📅|⏳|🛫|➕|✅)️?\s*(\d{4}-\d{2}-\d{2})|(🔺|⏫|🔼|🔽|⏬)️?|🔁️?\s*(every\b[^📅⏳🛫➕✅🔺⏫🔼🔽⏬🔁#\n]*?)(?=\s*(?:[📅⏳🛫➕✅🔺⏫🔼🔽⏬🔁#]|$))/gu;

const iso = localDay;

/** A date as one reads it beside a task: today, tomorrow, a weekday within the week, else "Fri 17 Oct". */
export function sayDate(date: string, now = new Date()): { text: string; days: number } {
  const days = Math.round((Date.parse(date) - Date.parse(iso(now))) / 86_400_000);
  const d = new Date(`${date}T12:00:00`);
  const text = days === 0 ? "today" : days === 1 ? "tomorrow" : days === -1 ? "yesterday"
    : days > 1 && days < 7 ? d.toLocaleDateString(undefined, { weekday: "long" })
    : d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
  return { text, days };
}

/** The fields in a task's text, with their places (offsets in `text`). A done task's dates are not late or
 *  soon any more: its chips carry no tone. */
export function chipsOf(text: string, now = new Date(), done = false): Chip[] {
  const out: Chip[] = [];
  for (const m of text.matchAll(FIELD)) {
    const from = m.index ?? 0, to = from + m[0].length;
    if (m[1]) {
      const f = DATES[m[1]], { text: said, days } = sayDate(m[2], now);
      const open = f.kind === "due" || f.kind === "scheduled" || f.kind === "start";
      out.push({ kind: f.kind, from, to, text: said, icon: f.icon, title: `${f.what} ${m[2]}`, tone: done ? undefined : open && days < 0 && f.kind === "due" ? "late" : open && days >= 0 && days <= 1 ? "soon" : undefined });
    } else if (m[3]) {
      const p = PRIORITIES[m[3]];
      out.push({ kind: "priority", from, to, text: p.name, icon: p.up ? "chevrons-up" : "chevrons-down", title: `${p.name} priority`, tone: done ? undefined : p.up && p.name !== "medium" ? "high" : p.up ? undefined : "low" });
    } else if (m[4]) {
      const rule = m[4].trim();
      out.push({ kind: "repeat", from, to: from + m[0].trimEnd().length, text: rule.replace(/^every\s+/, ""), icon: "repeat", title: `repeats ${rule}` });
    }
  }
  return out;
}

/** One chip as an element: the app's icon and a short text. */
export function chipEl(c: Chip): HTMLElement {
  const el = document.createElement("span");
  el.className = `task-chip task-chip-${c.kind}${c.tone ? ` tone-${c.tone}` : ""}`;
  el.title = c.title;
  el.innerHTML = iconSvg(c.icon, 12);
  el.append(c.text);
  return el;
}

/** A task's text with its fields as chips (Today's list): the text without them, then the chips. */
export function taskTextWithChips(text: string): { title: string; chips: Chip[] } {
  const chips = chipsOf(text);
  let title = "", at = 0;
  for (const c of chips) { title += text.slice(at, c.from); at = c.to; }
  return { title: (title + text.slice(at)).replace(/\s{2,}/g, " ").trim(), chips };
}
