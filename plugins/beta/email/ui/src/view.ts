// The Email pane: the Svelte app mounted into the pane's host (docs/guides/PLUGIN-API.md, "A pane in Svelte").
import { mount, unmount } from "svelte";
import App from "./App.svelte";
import type { PluginApi } from "./api";

export default function (host: HTMLElement, atlas: PluginApi) {
  host.style.height = "100%";
  const app = mount(App, { target: host, props: { atlas } });
  return () => unmount(app);
}
