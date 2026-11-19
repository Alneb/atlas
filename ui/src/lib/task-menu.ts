// An open task's right-click, wherever a task is listed (the Tasks views, Home's open tasks): what plugins do with a
// task (Plan's Snooze, the Calendar's Time-block…) around the app's own Mark done, then the rows every file has, at
// the task's line. One menu so a task offers the same everywhere.
import { partMenu } from "./app-menu";
import { pluginRows } from "./plugin-menus";

export type MenuTask = { path: string; line?: number; title: string; done?: boolean };

/** `tick`: how this list marks it done (absent: no Mark done, e.g. a row that is not a task line). */
export function taskMenu(e: MouseEvent, t: MenuTask, tick?: () => void): void {
  const own = tick && !t.done ? [{ label: "Mark done", icon: "check" as const, run: tick }] : [];
  const plugins = pluginRows("task", { path: t.path, line: t.line, selection: t.title, done: !!t.done });
  partMenu(e, [...plugins.top, ...own, ...plugins.end], t.path, undefined, t.line);
}
