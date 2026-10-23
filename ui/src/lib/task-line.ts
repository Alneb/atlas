// One task line as Obsidian Tasks writes it, taken apart and put back together — for the "Create or edit task"
// dialog (components/TaskDialog.svelte). The file keeps the emoji fields (Obsidian and the core's tasks.rs read
// them); fields are written back in Obsidian Tasks' order so a line edited here and there stays the same.
import { localDay } from "./local-day";

export type Priority = "highest" | "high" | "medium" | "none" | "low" | "lowest";
const PRIORITY_MARK: Record<Exclude<Priority, "none">, string> = { highest: "🔺", high: "⏫", medium: "🔼", low: "🔽", lowest: "⏬" };
const DATE_MARK = { created: "➕", start: "🛫", scheduled: "⏳", due: "📅", done: "✅" } as const;
type DateField = keyof typeof DATE_MARK;

export interface TaskFields {
  /** What the task says, with its #tags and [[links]]; no fields. */
  description: string;
  done: boolean;
  priority: Priority;
  /** `every week`, `every 2 days when done`… — "" for none. */
  repeat: string;
  /** YYYY-MM-DD or "". */
  created: string; start: string; scheduled: string; due: string; doneOn: string;
}
export interface TaskLine extends TaskFields {
  /** What comes before the box: indentation and the list mark (`  - `, `1. `). */
  lead: string;
  /** The status character inside the box (` `, `x`, or another one kept as it was: `/`, `-`). */
  status: string;
  /** An Obsidian block id (`^abc`) ending the line: kept last, so `[[note#^abc]]` still finds the task. */
  blockId: string;
}

const LINE = /^(\s*(?:[-*+]|\d+[.)])\s+)\[(.)\]\s?(.*)$/u;
const MARKS = "🔺⏫🔼🔽⏬📅⏳🛫➕✅🔁";
const FIELD = new RegExp(`(📅|⏳|🛫|➕|✅)\\uFE0F?\\s*(\\d{4}-\\d{2}-\\d{2})|(🔺|⏫|🔼|🔽|⏬)\\uFE0F?|🔁\\uFE0F?\\s*([^${MARKS}#\\n]*?)(?=\\s*(?:[${MARKS}]|#|$))`, "gu");

/** A task line taken apart; a line that is not a task (`text`, `- item`) becomes a new one with that text. */
export function parseTaskLine(text: string): TaskLine {
  const m = LINE.exec(text);
  const bare = /^(\s*)(?:([-*+]|\d+[.)])\s+)?(.*)$/u.exec(text)!;
  const lead = m ? m[1] : `${bare[1]}${bare[2] && /\d/.test(bare[2]) ? `${bare[2]} ` : "- "}`;
  const status = m ? m[2] : " ";
  const whole = m ? m[3] : bare[3];
  const id = /\s\^([A-Za-z0-9-]+)\s*$/u.exec(` ${whole}`);
  const rest = id ? whole.slice(0, whole.length - id[0].length + 1).trimEnd() : whole;
  const t: TaskLine = { lead, status, blockId: id ? id[1] : "", description: "", done: status === "x" || status === "X", priority: "none", repeat: "", created: "", start: "", scheduled: "", due: "", doneOn: "" };
  const dates: Record<string, DateField> = { "➕": "created", "🛫": "start", "⏳": "scheduled", "📅": "due", "✅": "done" };
  const priorities = Object.fromEntries(Object.entries(PRIORITY_MARK).map(([k, v]) => [v, k as Priority]));
  t.description = rest.replace(FIELD, (_all, dm: string, day: string, pm: string, rule: string) => {
    if (dm) { const f = dates[dm]; if (f === "done") t.doneOn = day; else t[f] = day; }
    else if (pm) t.priority = priorities[pm];
    else if (rule !== undefined) t.repeat = rule.trim();
    return "";
  }).replace(/\s{2,}/g, " ").trim();
  return t;
}

/** The line written back: description, then priority, repeat, created, start, scheduled, due, done (Obsidian
 *  Tasks' order). Ticking it here writes today's ✅ the way a tick does; opening it again drops the date. */
export function formatTaskLine(t: TaskLine): string {
  const status = t.done ? (t.status === "X" ? "X" : "x") : t.status === "x" || t.status === "X" ? " " : t.status;
  const doneOn = t.done ? t.doneOn || localDay(new Date()) : "";
  const parts = [t.description.trim()];
  if (t.priority !== "none") parts.push(PRIORITY_MARK[t.priority]);
  if (t.repeat.trim()) parts.push(`🔁 ${/^every\b/.test(t.repeat.trim()) ? t.repeat.trim() : `every ${t.repeat.trim()}`}`);
  const days: [DateField, string][] = [["created", t.created], ["start", t.start], ["scheduled", t.scheduled], ["due", t.due], ["done", doneOn]];
  for (const [f, day] of days) if (day) parts.push(`${DATE_MARK[f]} ${day}`);
  if (t.blockId) parts.push(`^${t.blockId}`);
  return `${t.lead}[${status}] ${parts.filter(Boolean).join(" ")}`;
}
