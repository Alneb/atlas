// Opening Settings at a page from anywhere (a plugin's `atlas.plugin.openSettings()`, the phone app, a button): the
// Settings pane follows `settingsNav.want` once mounted, or reads it on mounting (panes/Settings.svelte).
import { open } from "./dock";

export const settingsNav = $state({ want: "" });

/** A page id: a core page (`appearance`…) or a plugin's (`plugin:<id>`). */
export function openSettingsAt(page: string): void {
  settingsNav.want = page;
  open({ kind: "settings" });
}
export const pluginPageId = (id: string): string => `plugin:${id}`;
