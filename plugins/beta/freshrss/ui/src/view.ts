// FreshRSS's reader pane: the Svelte app mounted into the pane's host (docs/guides/PLUGIN-API.md, "A pane in Svelte").
import { mount, unmount } from "svelte";
import Reader from "./Reader.svelte";
import type { PluginApi } from "../../../../../ui/src/lib/plugin-api";

export default function (host: HTMLElement, atlas: PluginApi) {
  const app = mount(Reader, { target: host, props: { atlas } });
  return () => unmount(app);
}
