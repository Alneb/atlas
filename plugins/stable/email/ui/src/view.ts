// The Email pane: the Svelte app mounted into the pane's host (docs/guides/PLUGIN-API.md, "A pane in Svelte"); with the
// arg RULES_DIALOG, the rules editor alone, as the pane's Rules… opens it in a dialog.
import { mount, unmount } from "svelte";
import App from "./App.svelte";
import Rules from "./Rules.svelte";
import type { PluginApi } from "./api";
import { RULES_DIALOG, standIn } from "./rules-host";

export default function (host: HTMLElement, atlas: PluginApi) {
  if (atlas.arg === RULES_DIALOG) {
    const rules = mount(Rules, { target: host, props: { frame: "dialog", mail: standIn(atlas), onclose: () => atlas.pane?.close?.() } });
    return () => unmount(rules);
  }
  host.style.height = "100%";
  const app = mount(App, { target: host, props: { atlas } });
  return () => unmount(app);
}
