// The Libraries page — the pane of this plugin (`provides = ["libraries"]`): every library of the vault, a tab each,
// drawn by the library page (docs/guides/PLUGIN-API.md, "A pane in Svelte"). `mountLibrary` draws one source on its
// own: main.js's collection and Library app blocks.
import { mount, unmount } from "svelte";
import type { LibrarySource, PluginApi } from "../../../../../ui/src/lib/plugin-api";
import Libraries from "./Libraries.svelte";
import Library from "./Library.svelte";

export default function (host: HTMLElement, atlas: PluginApi) {
  host.style.height = "100%";
  const app = mount(Libraries, { target: host, props: { atlas } });
  return () => void unmount(app);
}

/** The library page over one source; returns the cleanup. */
export function mountLibrary(host: HTMLElement, source: LibrarySource, atlas: PluginApi): () => void {
  host.style.height = "100%"; // in a pane it fills it and its columns scroll; in a note, 100% of nothing is its own height
  const app = mount(Library, { target: host, props: { atlas, source } });
  return () => void unmount(app);
}
