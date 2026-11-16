// One task line as Obsidian Tasks writes it, taken apart for the "Create or edit task" dialog
// (components/TaskDialog.svelte). Only the reader lives here: the line is written back by the core's one task
// writer (tasks.rs `render_line`, `POST /api/task/render`, in Obsidian Tasks' order). Both readers are checked
// against one fixture list (ui/tests/fixtures/task-lines.json) while this one remains.
import { DATE_MARKS, fieldPattern } from "./task-fields";

export type Priority = "highest" | "high" | "medium" | "none" | "low" | "lowest";
const PRIORITY_MARK: Record<Exclude<Priority, "none">, string> = { highest: "🔺", high: "⏫", medium: "🔼", low: "🔽", lowest: "⏬" };

/** The form's fields; with the line's own parts, the core's `TaskFields` (`POST /api/task/render`). */
export interface TaskForm {
  /** What the task says, with its #tags and [[links]]; no fields. */
  description: string;
  done: boolean;
  priority: Priority;
  /** `every week`, `every 2 days when done`… — "" for none. */
  repeat: string;
  /** YYYY-MM-DD or "". */
  created: string; start: string; scheduled: string; due: string; doneOn: string;
}
export interface TaskLine extends TaskForm {
  /** What comes before the box: indentation and the list mark (`  - `, `1. `). */
  lead: string;
  /** The status character inside the box (` `, `x`, or another one kept as it was: `/`, `-`). */
  status: string;
  /** An Obsidian block id (`^abc`) ending the line: kept last, so `[[note#^abc]]` still finds the task. */
  blockId: string;
}

const LINE = /^(\s*(?:[-*+]|\d+[.)])\s+)\[(.)\]\s?(.*)$/u;
const FIELD = fieldPattern();

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
  const priorities = Object.fromEntries(Object.entries(PRIORITY_MARK).map(([k, v]) => [v, k as Priority]));
  t.description = rest.replace(FIELD, (_all, dm: string, day: string, pm: string, rule: string) => {
    if (dm) { const f = DATE_MARKS[dm]; if (f === "done") t.doneOn = day; else t[f] = day; }
    else if (pm) t.priority = priorities[pm];
    else if (rule !== undefined) t.repeat = rule.trim();
    return "";
  }).replace(/\s{2,}/g, " ").trim();
  return t;
}
