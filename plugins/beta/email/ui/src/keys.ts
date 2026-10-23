// Every command of the pane in one list (DESIGN-mail-ui §4): its key, its words, what it does. The key handler, the
// command palette (Ctrl+K) and the key sheet (?) all read this list, so a key can never be missing from either.
import type { Mail } from "./store.svelte";

/** What the views lend the commands: the pickers, the search box, the sheets. */
export interface Ui {
  pick(kind: "move" | "label" | "snooze" | "go" | "template"): void;
  focusSearch(): void;
  help(): void;
  palette(): void;
  expandAll(open: boolean): void;
  back(): void;
  rules(): void;
  layout(): void;
}

export interface Command {
  id: string;
  title: string;
  group: "Move around" | "Act" | "Write" | "Go to" | "Select" | "Pane";
  /** keys as typed: "j", "shift+i", "g i" (a sequence), "ctrl+k"; several, comma-separated */
  keys?: string;
  /** shown only when it applies (the palette hides the rest) */
  when?: (m: Mail) => boolean;
  run: (m: Mail, ui: Ui) => void | Promise<void>;
}

const any = (m: Mail) => m.targets().length > 0;

export const COMMANDS: Command[] = [
  { id: "down", title: "Next conversation", group: "Move around", keys: "j, arrowdown", run: (m) => { m.move(1); if (m.openId !== null && m.cursor !== null) m.read(m.cursor); } },
  { id: "up", title: "Previous conversation", group: "Move around", keys: "k, arrowup", run: (m) => { m.move(-1); if (m.openId !== null && m.cursor !== null) m.read(m.cursor); } },
  { id: "open", title: "Open", group: "Move around", keys: "o, enter", when: (m) => m.cursor !== null, run: (m) => { if (m.cursor !== null) m.read(m.cursor); } },
  { id: "back", title: "Back to the list", group: "Move around", keys: "u, escape", run: (_m, ui) => ui.back() },
  { id: "search", title: "Search mail", group: "Move around", keys: "/", run: (_m, ui) => ui.focusSearch() },
  { id: "expand", title: "Expand every message", group: "Move around", keys: ";", run: (_m, ui) => ui.expandAll(true) },
  { id: "collapse", title: "Collapse every message", group: "Move around", keys: ":", run: (_m, ui) => ui.expandAll(false) },
  { id: "first", title: "First conversation", group: "Move around", keys: "home", run: (m) => m.move(-1e9) },
  { id: "last", title: "Last conversation", group: "Move around", keys: "end", run: (m) => m.move(1e9) },

  { id: "archive", title: "Archive", group: "Act", keys: "e", when: any, run: (m) => m.archive() },
  { id: "trash", title: "Delete (to Trash)", group: "Act", keys: "#, delete", when: any, run: (m) => m.trash() },
  { id: "spam", title: "Spam / not spam", group: "Act", keys: "!", when: any, run: (m) => m.spam() },
  { id: "star", title: "Star / unstar", group: "Act", keys: "s", when: any, run: (m) => m.toggleStar() },
  { id: "read", title: "Mark read", group: "Act", keys: "shift+i", when: any, run: (m) => m.mark("read", true) },
  { id: "unread", title: "Mark unread", group: "Act", keys: "shift+u", when: any, run: (m) => m.mark("read", false) },
  { id: "toggle-read", title: "Read / unread", group: "Act", keys: "m", when: any, run: (m) => m.toggleRead() },
  { id: "snooze", title: "Snooze…", group: "Act", keys: "h, b", when: any, run: (_m, ui) => ui.pick("snooze") },
  { id: "unsnooze", title: "Back to the inbox now (unsnooze)", group: "Act", when: (m) => m.view.name === "snoozed" && any(m), run: (m) => m.unsnooze() },
  { id: "move", title: "Move to…", group: "Act", keys: "v", when: any, run: (_m, ui) => ui.pick("move") },
  { id: "label", title: "Label…", group: "Act", keys: "l", when: any, run: (_m, ui) => ui.pick("label") },
  { id: "important", title: "Important", group: "Act", keys: "i", when: any, run: (m) => m.importance(true) },
  { id: "not-important", title: "Not important (moves it out of the inbox)", group: "Act", keys: "n", when: any, run: (m) => m.importance(false) },
  { id: "note", title: "Save as note", group: "Act", keys: "shift+n", when: any, run: (m) => m.saveNote() },
  { id: "undo", title: "Undo", group: "Act", keys: "z, ctrl+z", run: (m) => m.undo() },

  { id: "compose", title: "New message", group: "Write", keys: "c", run: (m) => { m.compose(); } },
  { id: "reply", title: "Reply", group: "Write", keys: "r", when: (m) => m.openId !== null || m.cursor !== null, run: (m) => m.reply("reply") },
  { id: "reply-all", title: "Reply all", group: "Write", keys: "a", when: (m) => m.openId !== null || m.cursor !== null, run: (m) => m.reply("all") },
  { id: "forward", title: "Forward", group: "Write", keys: "f", when: (m) => m.openId !== null || m.cursor !== null, run: (m) => m.reply("forward") },
  { id: "reply-pane", title: "Reply in a full pane", group: "Write", keys: "shift+r", when: (m) => m.openId !== null || m.cursor !== null, run: (m) => m.reply("reply", undefined, false) },
  { id: "reply-all-pane", title: "Reply all in a full pane", group: "Write", keys: "shift+a", when: (m) => m.openId !== null || m.cursor !== null, run: (m) => m.reply("all", undefined, false) },
  { id: "forward-pane", title: "Forward in a full pane", group: "Write", keys: "shift+f", when: (m) => m.openId !== null || m.cursor !== null, run: (m) => m.reply("forward", undefined, false) },
  { id: "template", title: "New from a template…", group: "Write", run: (_m, ui) => ui.pick("template") },

  { id: "go-inbox", title: "Go to the inbox", group: "Go to", keys: "g i", run: (m) => m.go({ name: "inbox", account: m.view.account, folder: null, label: "Inbox" }) },
  { id: "go-starred", title: "Go to Starred", group: "Go to", keys: "g s", run: (m) => m.go({ name: "starred", account: m.view.account, folder: null, label: "Starred" }) },
  { id: "go-unimportant", title: "Go to Not important", group: "Go to", keys: "g n", run: (m) => m.go({ name: "unimportant", account: m.view.account, folder: null, label: "Not important" }) },
  { id: "go-snoozed", title: "Go to Snoozed", group: "Go to", keys: "g b", run: (m) => m.go({ name: "snoozed", account: m.view.account, folder: null, label: "Snoozed" }) },
  { id: "go-drafts", title: "Go to Drafts", group: "Go to", keys: "g d", run: (m) => m.go({ name: "drafts", account: m.view.account, folder: null, label: "Drafts" }) },
  { id: "go-sent", title: "Go to Sent", group: "Go to", keys: "g t", run: (m) => m.go({ name: "sent", account: m.view.account, folder: null, label: "Sent" }) },
  { id: "go-all", title: "Go to all mail", group: "Go to", keys: "g a", run: (m) => m.go({ name: "all", account: m.view.account, folder: null, label: "All mail" }) },
  { id: "go-folder", title: "Go to a folder…", group: "Go to", keys: "g l, g f", run: (_m, ui) => ui.pick("go") },

  { id: "select", title: "Check this conversation", group: "Select", keys: "x", when: (m) => m.cursor !== null, run: (m) => { const r = m.current; if (r) m.toggle(r.thread); } },
  { id: "select-down", title: "Check and go down", group: "Select", keys: "shift+j, shift+arrowdown", run: (m) => { const r = m.current; if (r && !m.checked.includes(r.thread)) m.toggle(r.thread); m.move(1); const n = m.current; if (n && !m.checked.includes(n.thread)) m.toggle(n.thread); } },
  { id: "select-up", title: "Check and go up", group: "Select", keys: "shift+k, shift+arrowup", run: (m) => { const r = m.current; if (r && !m.checked.includes(r.thread)) m.toggle(r.thread); m.move(-1); const n = m.current; if (n && !m.checked.includes(n.thread)) m.toggle(n.thread); } },
  { id: "select-all", title: "Check all", group: "Select", keys: "* a, ctrl+a", run: (m) => m.selectWhere("all") },
  { id: "select-none", title: "Check none", group: "Select", keys: "* n", run: (m) => m.selectWhere("none") },
  { id: "select-unread", title: "Check the unread", group: "Select", keys: "* u", run: (m) => m.selectWhere("unread") },
  { id: "select-read", title: "Check the read", group: "Select", keys: "* r", run: (m) => m.selectWhere("read") },
  { id: "select-starred", title: "Check the starred", group: "Select", keys: "* s", run: (m) => m.selectWhere("starred") },

  { id: "palette", title: "All commands…", group: "Pane", keys: "ctrl+k", run: (_m, ui) => ui.palette() },
  { id: "help", title: "Keyboard shortcuts", group: "Pane", keys: "?", run: (_m, ui) => ui.help() },
  { id: "refresh", title: "Check for new mail", group: "Pane", keys: "shift+g", run: async (m) => { m.toast("Checking for new mail…"); await m.call("sync", {}, 600); m.later(); } },
  { id: "rules", title: "Rules…", group: "Pane", run: (_m, ui) => ui.rules() },
  { id: "layout", title: "Change the layout", group: "Pane", run: (_m, ui) => ui.layout() },
  { id: "settings", title: "Email settings…", group: "Pane", run: (m) => m.atlas.plugin.openSettings() },
];

/** "shift+i" from a key event (letters lower-case, Shift kept only where it changes the meaning). */
export function keyOf(e: KeyboardEvent): string {
  const k = e.key.length === 1 ? e.key.toLowerCase() : e.key.toLowerCase();
  const symbol = e.key.length === 1 && !/[a-z0-9]/i.test(e.key);
  const mods = [e.ctrlKey || e.metaKey ? "ctrl" : "", e.altKey ? "alt" : "", e.shiftKey && !symbol ? "shift" : ""].filter(Boolean);
  return [...mods, k].join("+");
}

/** The commands by every key sequence that runs them. */
export const BY_KEY: Map<string, Command> = new Map(COMMANDS.flatMap((c) => (c.keys ?? "").split(",").map((k) => k.trim()).filter(Boolean).map((k) => [k, c] as [string, Command])));

/** Keys that start a sequence ("g", "*"): wait for the next one. */
export const PREFIXES = new Set([...BY_KEY.keys()].filter((k) => k.includes(" ")).map((k) => k.split(" ")[0]));

/** How a key reads in the sheet and the palette: "shift+i" → "⇧I", "g i" → "g then i". */
export function shown(keys: string | undefined): string[] {
  if (!keys) return [];
  return keys.split(",").map((k) => k.trim()).filter(Boolean).slice(0, 2).map((k) =>
    k.split(" ").map((p) => p.replace("ctrl+", "Ctrl+").replace("shift+", "⇧").replace("arrowdown", "↓").replace("arrowup", "↑").replace("escape", "Esc").replace("enter", "Enter").replace("delete", "Del").replace("home", "Home").replace("end", "End").replace(/^(⇧)?([a-z])$/, (_x, s, l) => (s ? `⇧${l.toUpperCase()}` : l))).join(" then "),
  );
}
