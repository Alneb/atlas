// `atlas.openDialog(arg, opts)` (plugin API 20): a plugin's pane mounted in a popup over the app
// (components/PluginDialog.svelte) instead of a tab — for a moment rather than a place (Export's and Print's dialogs).
// One open per plugin and arg: a second call while it is open resolves with it.
import { mount, unmount } from "svelte";
import PluginDialog from "../components/PluginDialog.svelte";
import type { Plugin } from "./plugin-registry.svelte";

const open = new Map<string, Promise<void>>();

export interface DialogOptions { title?: string; width?: number; height?: number }

/** Shows the plugin's view.js in a dialog; resolves when it closes. */
export function openPluginDialog(p: Plugin, arg: string | undefined, opts: DialogOptions = {}): Promise<void> {
  if (!p.view) throw new Error(`plugin ${p.id} has no pane (no view.js)`);
  const key = `${p.id}\n${arg ?? ""}`;
  const already = open.get(key);
  if (already) return already;
  const was = document.activeElement as HTMLElement | null;
  const host = document.body.appendChild(document.createElement("div"));
  const shown = new Promise<void>((resolve) => {
    let app: ReturnType<typeof mount> | null = null;
    const close = () => {
      if (!app) return;
      const a = app;
      app = null;
      void unmount(a);
      host.remove();
      open.delete(key);
      was?.focus?.();
      resolve();
    };
    app = mount(PluginDialog, { target: host, props: { plugin: p, arg, title: opts.title ?? p.title, width: opts.width, height: opts.height, onclose: close } });
  });
  open.set(key, shown);
  return shown;
}
