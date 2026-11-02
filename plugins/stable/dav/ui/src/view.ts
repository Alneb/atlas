// The Calendar pane: the Svelte app mounted into the pane's host (docs/guides/PLUGIN-API.md, "A pane in Svelte"); with
// the new-event dialog's arg (NEW_EVENT_DIALOG, or a seeded one), the event editor alone, as "Calendar: new event" opens it in a dialog.
import { mount, unmount } from "svelte";
import App from "./App.svelte";
import NewEvent from "./NewEvent.svelte";
import { newEventSeed, type PluginApi } from "./api";

export default function (host: HTMLElement, atlas: PluginApi) {
  const seed = newEventSeed(atlas.arg);
  if (seed) {
    const ne = mount(NewEvent, { target: host, props: { atlas, seed, onclose: () => atlas.pane?.close?.() } });
    return () => unmount(ne);
  }
  host.style.height = "100%";
  const app = mount(App, { target: host, props: { atlas } });
  return () => unmount(app);
}
