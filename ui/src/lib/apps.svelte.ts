// Apps: Home, the built-in plugins' panes (the
// Library) and the vault plugins' views (Email). With vertical tabs they stand at the top of the left bar
// beside the pinned tabs (SidePins.svelte): never rows of the tab list, never counted by Ctrl+1…9.
// No imports from the dock or the tabs: both ask this module.
import { BUILTINS, builtinOn } from "./builtin-plugins";
import { allCommands } from "./keymap.svelte";
import { paneId, type IconName, type PaneSpec } from "./panes";
import { plugins, pluginOn, pluginSpec } from "./plugins.svelte";
import { isIconName } from "./icons";
import { settings, change } from "./settings.svelte";

/** Home's tab id: the home document's (a note or a page, `home` in config), else the Today pane's. */
const home = $state({ id: "today" });
export const setHomeSpec = (s: PaneSpec): void => { home.id = paneId(s); };

/** Whether an open pane is an app rather than a document. A plugin's pane opened on a file ("Open with")
 *  is a document; opened on a value (an account, a host) it is that app's. */
export const isApp = (id: string, s: PaneSpec | undefined): boolean =>
  id === home.id || s?.kind === "today" || s?.kind === "library" || s?.kind === "libraries" || (s?.kind === "plugin" && !s.path);

/** `ids`: the tabs it stands for — Home's are the home document's and the classic Today pane's (a vault with both
 *  open showed two "today" tiles). The first is its own. */
export interface AppTile { key: AppKey; ids: string[]; title: string; icon: IconName; keys?: string; open(): void; /** the command that opens it */ command?: string }

/** What `[ui] apps_order` and `apps_hidden` name a tile by: `home`, a built-in's id, a plugin's id. */
export type AppKey = string;

/** Every app the vault has, in its own order (Home, built-ins, plugins), hidden ones included: what Settings lists. */
export function allApps(): AppTile[] {
  const cmds = allCommands(), cmd = (id: string) => cmds.find((c) => c.id === id);
  const homeCmd = cmd("ui.today");
  const builtins = BUILTINS.filter((b) => builtinOn(b.id)).flatMap((b): AppTile[] => {
    const c = b.button && cmd(b.button.command);
    return b.button && c ? [{ key: b.id, ids: [paneId(b.button.pane)], title: c.label ?? b.title, icon: b.icon, keys: c.keys, command: c.id, open: () => void c.run() }] : [];
  });
  const vault = plugins.list.filter((p) => pluginOn(p) && p.rail && p.view).map((p): AppTile => ({
    key: p.id, ids: [paneId(pluginSpec(p))], title: p.title, icon: p.icon && isIconName(p.icon) ? p.icon : "plugin", keys: cmd(`plugin.${p.id}`)?.keys, command: `plugin.${p.id}`, open: () => void cmd(`plugin.${p.id}`)?.run(),
  }));
  // no Capture tile: a popup with its own shortcut and the palette, not an app
  return [{ key: "home", ids: [...new Set([home.id, "today"])], title: "Home", icon: "home", keys: homeCmd?.keys, command: "ui.today", open: () => void homeCmd?.run() }, ...builtins, ...vault];
}

/** `apps` in the vault's order: the keys of `[ui] apps_order` first, as listed, then the rest as they came. */
export function ordered(apps: AppTile[], order: AppKey[] = settings.config?.ui.apps_order ?? []): AppTile[] {
  const rank = (a: AppTile) => { const i = order.indexOf(a.key); return i < 0 ? order.length : i; };
  return apps.map((a, i) => ({ a, i })).sort((x, y) => rank(x.a) - rank(y.a) || x.i - y.i).map(({ a }) => a);
}

export const appHidden = (key: AppKey): boolean => (settings.config?.ui.apps_hidden ?? []).includes(key);

/** The launchers the left bar shows: every app but the hidden ones, in the vault's order. */
export const appLaunchers = (): AppTile[] => ordered(allApps()).filter((a) => !appHidden(a.key));

export function setAppHidden(key: AppKey, hidden: boolean): void {
  change("Apps", (c) => {
    const h = new Set(c.ui.apps_hidden);
    if (hidden) h.add(key); else h.delete(key);
    c.ui.apps_hidden = [...h];
  });
}

/** Moves `key` one place towards the start (-1) or the end (+1) of every app's order, and keeps that whole order. */
export function moveApp(key: AppKey, by: -1 | 1): void {
  const keys = ordered(allApps()).map((a) => a.key);
  const i = keys.indexOf(key), j = i + by;
  if (i < 0 || j < 0 || j >= keys.length) return;
  [keys[i], keys[j]] = [keys[j], keys[i]];
  change("Apps", (c) => { c.ui.apps_order = keys; });
}
