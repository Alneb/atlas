// Every command of the Calendar pane in one list (DESIGN-calendar §1, Google Calendar's keys): its key, its words,
// what it does. The key handler, the palette (Ctrl+K) and the key sheet (?) all read this list.
import type { Cal, View } from "./store.svelte";

/** What the pane lends the commands. */
export interface Ui {
  create(): void;
  quick(): void;
  edit(): void;
  remove(): void;
  focusSearch(): void;
  help(): void;
  palette(): void;
  goto(): void;
  back(): void;
  sidebar(): void;
}

export interface Command {
  id: string;
  title: string;
  group: "Views" | "Move around" | "Events" | "Pane";
  keys?: string;
  run: (c: Cal, ui: Ui) => void | Promise<void>;
}

const view = (v: View) => (c: Cal) => c.setView(v);

export const COMMANDS: Command[] = [
  { id: "day", title: "Day", group: "Views", keys: "d, 1", run: view("day") },
  { id: "week", title: "Week", group: "Views", keys: "w, 2", run: view("week") },
  { id: "workweek", title: "Work week", group: "Views", keys: "x, 3", run: view("workweek") },
  { id: "month", title: "Month", group: "Views", keys: "m, 4", run: view("month") },
  { id: "agenda", title: "Agenda (schedule)", group: "Views", keys: "a, 5", run: view("agenda") },
  { id: "year", title: "Year", group: "Views", keys: "y, 6", run: view("year") },

  { id: "today", title: "Today", group: "Move around", keys: "t", run: (c) => c.today() },
  { id: "next", title: "Next period", group: "Move around", keys: "j, n, arrowright", run: (c) => c.step(1) },
  { id: "prev", title: "Previous period", group: "Move around", keys: "k, p, arrowleft", run: (c) => c.step(-1) },
  { id: "goto", title: "Go to a date…", group: "Move around", keys: "g", run: (_c, ui) => ui.goto() },
  { id: "search", title: "Search events", group: "Move around", keys: "/", run: (_c, ui) => ui.focusSearch() },
  { id: "back", title: "Close / back", group: "Move around", keys: "escape", run: (_c, ui) => ui.back() },

  { id: "create", title: "New event", group: "Events", keys: "c", run: (_c, ui) => ui.create() },
  { id: "quick", title: "Quick add (in words)", group: "Events", keys: "q, shift+c", run: (_c, ui) => ui.quick() },
  { id: "edit", title: "Edit the selected event", group: "Events", keys: "e, enter", run: (_c, ui) => ui.edit() },
  { id: "delete", title: "Delete the selected event", group: "Events", keys: "delete, backspace, #", run: (_c, ui) => ui.remove() },

  { id: "refresh", title: "Sync with the server now", group: "Pane", keys: "r", run: (c) => c.sync(true) },
  { id: "sidebar", title: "Show / hide the side panel", group: "Pane", keys: "s", run: (_c, ui) => ui.sidebar() },
  { id: "palette", title: "All commands…", group: "Pane", keys: "ctrl+k", run: (_c, ui) => ui.palette() },
  { id: "help", title: "Keyboard shortcuts", group: "Pane", keys: "?", run: (_c, ui) => ui.help() },
  { id: "settings", title: "Calendar settings…", group: "Pane", run: (c) => c.atlas.plugin.openSettings() },
];

export function keyOf(e: KeyboardEvent): string {
  const k = e.key.toLowerCase();
  const symbol = e.key.length === 1 && !/[a-z0-9]/i.test(e.key);
  const mods = [e.ctrlKey || e.metaKey ? "ctrl" : "", e.altKey ? "alt" : "", e.shiftKey && !symbol ? "shift" : ""].filter(Boolean);
  return [...mods, k].join("+");
}

export const BY_KEY: Map<string, Command> = new Map(COMMANDS.flatMap((c) => (c.keys ?? "").split(",").map((k) => k.trim()).filter(Boolean).map((k) => [k, c] as [string, Command])));

/** How a key reads: "shift+c" → "⇧C", "arrowright" → "→". */
export function shown(keys: string | undefined): string[] {
  if (!keys) return [];
  return keys.split(",").map((k) => k.trim()).filter(Boolean).slice(0, 2).map((k) =>
    k.replace("ctrl+", "Ctrl+").replace("shift+", "⇧").replace("arrowright", "→").replace("arrowleft", "←").replace("escape", "Esc").replace("enter", "Enter").replace("delete", "Del").replace("backspace", "⌫").replace(/^(⇧)?([a-z])$/, (_x, s, l) => (s ? `⇧${l.toUpperCase()}` : l)),
  );
}
