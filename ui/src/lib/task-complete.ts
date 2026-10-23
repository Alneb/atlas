// What to offer while a task (`- [ ] …`) is typed: dates, priority, recurrence — the Obsidian Tasks
// fields. The rules live in the core (crates/atlas-core/src/task_suggest.rs: natural dates such as
// "next fri" or "in 3 days", the new-line row first so a word that only looks like a field never
// eats Enter); this module asks for them and draws a row the same way in the editor's list
// (md-complete.ts) and in the capture boxes (textarea-complete.ts): the app's own monochrome icon,
// a plain name, and the hint in its own column — no emoji in the list, the emoji only in the file.
import { api, type TaskAsk } from "./api";
import { iconSvg } from "./icons";
import type { IconName } from "./panes";
import type { TaskIcon, TaskSuggest, TaskSuggestion } from "./types";

export type { TaskSuggest, TaskSuggestion };

export const TASK_ICON: Record<TaskIcon, IconName> = {
  new_line: "return", due: "calendar", scheduled: "clock", start: "flag", created: "plus", done: "check",
  priority_up: "chevrons-up", priority_down: "chevrons-down", repeat: "repeat", day: "calendar",
};

/** The suggestions at the end of `before` (the task's text up to the caret); null: nothing to offer. */
export function taskSuggestions(before: string, o: TaskAsk = {}): Promise<TaskSuggest | null> {
  return api.taskSuggest(before, o).catch(() => null);
}

/** The icon of a row, as an element (the editor's list and the boxes' lists). */
export function taskIconEl(icon: TaskIcon): HTMLElement {
  return rowIconEl(TASK_ICON[icon]);
}

/** Any icon in a list row's icon column (the capture boxes' note, tag and day rows too). */
export function rowIconEl(name: IconName): HTMLElement {
  const span = document.createElement("span");
  span.className = "task-sugg-icon";
  span.innerHTML = iconSvg(name, 14);
  return span;
}
