// Apps: Home, the built-in plugins' panes (the
// Library) and the vault plugins' views (Email). With vertical tabs they stand at the top of the left bar
// beside the pinned tabs (SidePins.svelte): never rows of the tab list, never counted by Ctrl+1…9.
// No imports from the dock or the tabs: both ask this module.
import { BUILTINS, builtinOn } from "./builtin-plugins";
import { allCommands } from "./keymap.svelte";
import { paneId, type IconName, type PaneSpec } from "./panes";
import { plugins, pluginOn, pluginSpec } from "./plugins.svelte";
import { isIconName } from "./icons";

/** Home's tab id: the home document's (a note or a page, `home` in config), else the Today pane's. */
const home = $state({ id: "today" });
export const setHomeSpec = (s: PaneSpec): void => { home.id = paneId(s); };

/** Whether an open pane is an app rather than a document. A plugin's pane opened on a file ("Open with")
 *  is a document; opened on a value (an account, a host) it is that app's. */
export const isApp = (id: string, s: PaneSpec | undefined): boolean =>
  id === home.id || s?.kind === "today" || s?.kind === "library" || s?.kind === "libraries" || (s?.kind === "plugin" && !s.path);

/** `ids`: the tabs it stands for — Home's are the home document's and the classic Today pane's (a vault with both
 *  open showed two "today" tiles). The first is its own. */
export interface AppTile { ids: string[]; title: string; icon: IconName; keys?: string; open(): void }

/** The launchers, in a fixed order: Home, the built-in plugins that are on, the vault plugins with a view
 *  that asked for a button (`rail = true`). */
export function appLaunchers(): AppTile[] {
  const cmds = allCommands(), cmd = (id: string) => cmds.find((c) => c.id === id);
  const homeCmd = cmd("ui.today");
  const builtins = BUILTINS.filter((b) => builtinOn(b.id)).flatMap((b): AppTile[] => {
    const c = b.button && cmd(b.button.command);
    return b.button && c ? [{ ids: [paneId(b.button.pane)], title: c.label ?? b.title, icon: b.icon, keys: c.keys, open: () => void c.run() }] : [];
  });
  const vault = plugins.list.filter((p) => pluginOn(p) && p.rail && p.view).map((p): AppTile => ({
    ids: [paneId(pluginSpec(p))], title: p.title, icon: p.icon && isIconName(p.icon) ? p.icon : "plugin", keys: cmd(`plugin.${p.id}`)?.keys, open: () => void cmd(`plugin.${p.id}`)?.run(),
  }));
  return [{ ids: [...new Set([home.id, "today"])], title: "Home", icon: "today", keys: homeCmd?.keys, open: () => void homeCmd?.run() }, ...builtins, ...vault];
}
