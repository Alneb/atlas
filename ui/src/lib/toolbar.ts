// Toolbar buttons are commands (docs/guides/SHELL.md): a toolbar block lists command ids, and each button
// takes its icon, name and shortcut from the command. Three words are not commands: `plugins` (the apps —
// Home, the Library, the plugins' views — from lib/apps.svelte.ts, in the vault's order, hidden ones left out),
// `divider` (a line) and `spacer` (pushes what follows to the far end).
import type { IconName } from "./panes";
import { allCommands } from "./keymap.svelte";
import { isIconName } from "./icons";
import { appLaunchers } from "./apps.svelte";

export type ToolItem = { icon: IconName; label: string; keys?: string; run: () => void };
export type ToolEntry = ToolItem | "spacer" | "divider";

/** The apps as buttons, but those the toolbar names by their command already (an older file lists ui.today). */
function appItems(listed: Set<unknown>): ToolItem[] {
  return appLaunchers().filter((a) => !listed.has(a.command)).map((a) => ({ icon: a.icon, label: a.title, keys: a.keys, run: a.open }));
}

export interface ToolOptions {
  /** command ids left out */
  skip?: ReadonlySet<string>;
  /** buttons that follow the last of `ids` listed (the plugins' side tools after Files … Git) */
  after?: { ids: ReadonlySet<string>; add: ToolItem[] };
  /** the apps' tiles stand beside this toolbar (the sidebar's `pins`, the rail's first group): `plugins` and the
   *  commands that open an app are left out, so no app shows twice */
  appsShown?: boolean;
}

/** A toolbar's `items:` → buttons. An item is a command id, or `{command: id, icon: …, title: …}` to
 *  dress a command of one's own; ids that name no command (yet), or are skipped, are left out. */
export function toolItems(items: unknown, { skip = new Set(), after, appsShown = false }: ToolOptions = {}): ToolEntry[] {
  const apps = appsShown ? new Set(appLaunchers().map((a) => a.command)) : new Set<string | undefined>();
  const cmds = allCommands().filter((c) => !skip.has(c.id) && !apps.has(c.id));
  const list = Array.isArray(items) ? items : [];
  const listed = new Set(list.map((it) => (it && typeof it === "object" ? (it as { command?: unknown }).command : it)));
  const idOf = (it: unknown) => (it && typeof it === "object" ? (it as { command?: unknown }).command : it);
  const last = after ? list.findLastIndex((it) => after.ids.has(String(idOf(it)))) : -1;
  return list.flatMap((it, i): ToolEntry[] => [...entry(it), ...(i === last ? after!.add : [])]);
  function entry(it: unknown): ToolEntry[] {
    if (it === "spacer" || it === "divider") return [it];
    if (it === "plugins") return appsShown ? [] : appItems(listed); // no line before them: write `divider` for one
    const o = typeof it === "string" ? { command: it } : it && typeof it === "object" ? (it as { command?: unknown; icon?: unknown; title?: unknown }) : {};
    const c = cmds.find((x) => x.id === o.command);
    if (!c) return [];
    const own = typeof c.icon === "function" ? c.icon() : c.icon;
    return [{ icon: typeof o.icon === "string" && isIconName(o.icon) ? o.icon : own ?? "command", label: typeof o.title === "string" ? o.title : c.label ?? c.title, keys: c.keys, run: () => void c.run() }];
  }
}

export const toolTip = (b: ToolItem) => (b.keys ? `${b.label} · ${b.keys}` : b.label);
