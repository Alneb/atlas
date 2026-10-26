// Toolbar buttons are commands (docs/guides/SHELL.md): a toolbar block lists command ids, and each button
// takes its icon, name and shortcut from the command. Three words are not commands: `plugins` (a
// button per built-in plugin that is on and per vault plugin with a view), `divider` (a line)
// and `spacer` (pushes what follows to the far end).
import { open } from "./dock";
import type { IconName } from "./panes";
import { allCommands } from "./keymap.svelte";
import { plugins, pluginOn, pluginSpec } from "./plugins.svelte";
import { isIconName } from "./icons";
import { BUILTINS, builtinOn } from "./builtin-plugins";

export type ToolItem = { icon: IconName; label: string; keys?: string; run: () => void };
export type ToolEntry = ToolItem | "spacer" | "divider";

/** The built-in plugins that are on, then the workspace plugins (.atlas/plugins/) that asked for a button. */
function pluginItems(listed: Set<unknown>): ToolItem[] {
  const cmds = allCommands();
  // a toolbar file that names the command itself (older ones list ui.library) keeps that one button
  const builtin = BUILTINS.filter((b) => builtinOn(b.id) && b.button && !listed.has(b.button.command)).flatMap((b): ToolItem[] => {
    const c = cmds.find((x) => x.id === b.button?.command);
    return c ? [{ icon: b.icon, label: c.label ?? b.title, keys: c.keys, run: () => void c.run() }] : [];
  });
  return [...builtin, ...vaultPluginItems()];
}
function vaultPluginItems(): ToolItem[] {
  return plugins.list.filter((p) => pluginOn(p) && p.rail && p.view).map((p) => ({
    icon: p.icon && isIconName(p.icon) ? p.icon : "plugin", label: p.title, keys: allCommands().find((c) => c.id === `plugin.${p.id}`)?.keys, run: () => { open(pluginSpec(p)); },
  }));
}

/** A toolbar's `items:` → buttons. An item is a command id, or `{command: id, icon: …, title: …}` to
 *  dress a command of one's own; ids that name no command (yet), or are in `skip`, are left out. */
export function toolItems(items: unknown, skip: ReadonlySet<string> = new Set(), after?: { ids: ReadonlySet<string>; add: ToolItem[] }): ToolEntry[] {
  const cmds = allCommands().filter((c) => !skip.has(c.id));
  const list = Array.isArray(items) ? items : [];
  const listed = new Set(list.map((it) => (it && typeof it === "object" ? (it as { command?: unknown }).command : it)));
  // `after`: buttons that follow the last of `ids` listed (the plugins' side tools after Files … Git)
  const idOf = (it: unknown) => (it && typeof it === "object" ? (it as { command?: unknown }).command : it);
  const last = after ? list.findLastIndex((it) => after.ids.has(String(idOf(it)))) : -1;
  return list.flatMap((it, i): ToolEntry[] => [...entry(it), ...(i === last ? after!.add : [])]);
  function entry(it: unknown): ToolEntry[] {
    if (it === "spacer" || it === "divider") return [it];
    if (it === "plugins") return pluginItems(listed); // no line before them: write `divider` for one
    const o = typeof it === "string" ? { command: it } : it && typeof it === "object" ? (it as { command?: unknown; icon?: unknown; title?: unknown }) : {};
    const c = cmds.find((x) => x.id === o.command);
    if (!c) return [];
    const own = typeof c.icon === "function" ? c.icon() : c.icon;
    return [{ icon: typeof o.icon === "string" && isIconName(o.icon) ? o.icon : own ?? "command", label: typeof o.title === "string" ? o.title : c.label ?? c.title, keys: c.keys, run: () => void c.run() }];
  }
}

export const toolTip = (b: ToolItem) => (b.keys ? `${b.label} · ${b.keys}` : b.label);
