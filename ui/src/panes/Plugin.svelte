<script lang="ts">
  // A workspace plugin's view: mounts .atlas/plugins/<id>/<view> into this pane, and remounts it when a
  // file of the plugin changes (edit view.js → see it at once). Load errors are shown, never swallowed.
  // As a file's editor (`atlas.pane`, docs/guides/PLUGIN-API.md): the unsaved dot, Ctrl+S and saving on close.
  import { errText } from "../lib/text";
  import { onMount } from "svelte";
  import type { PaneProps } from "../lib/dock";
  import { setDirty } from "../lib/dock";
  import { app, toast } from "../lib/state.svelte";
  import { paneParks, pluginAnchors } from "../lib/registry";
  import { plugins, loadPlugins, loadView, pluginApi, pluginOn, type PluginPane } from "../lib/plugins.svelte";
  import { logPlugin } from "../lib/plugin-log.svelte";
  import { on } from "../lib/bus";

  let { spec, panel }: PaneProps<"plugin"> = $props();
  let host: HTMLDivElement;
  let error = $state("");
  let cleanup: (() => void) | undefined;
  let generation = 0;
  // the mounted view's hooks; reset on every mount, so an older mount's calls change nothing
  let saver: (() => void | Promise<void>) | undefined;
  let goTo: ((anchor: string) => void) | undefined;

  /** The editor contract of one mount: calls from a mount that was replaced are ignored. */
  function paneOf(mine: number): PluginPane {
    const live = () => mine === generation;
    return {
      setDirty: (d) => { if (live()) setDirty(panel.id, !!d); },
      onSave: (fn) => { if (live()) saver = fn; return () => { if (saver === fn) saver = undefined; }; },
      onAnchor: (fn) => { if (live()) goTo = fn; return () => { if (goTo === fn) goTo = undefined; }; },
      close: () => { if (live()) panel.close(); },
    };
  }

  /** Saves through the view's hook while there is something unsaved: resolving clears the dot, a failure keeps it. */
  async function save(): Promise<void> {
    if (!saver || !app.dirty[panel.id]) return;
    try {
      await saver();
      setDirty(panel.id, false);
    } catch (e) {
      logPlugin(spec.id, "save", e);
      toast(`${spec.title ?? spec.id}: not saved`, errText(e), "error");
      throw e;
    }
  }

  async function mount() {
    await save().catch(() => {}); // the plugin changed under unsaved work: save it before the view is replaced
    const mine = ++generation;
    cleanup?.();
    cleanup = undefined;
    saver = goTo = undefined;
    setDirty(panel.id, false);
    host.replaceChildren();
    error = "";
    if (!plugins.loaded) await loadPlugins();
    const p = plugins.list.find((x) => x.id === spec.id);
    if (!p) { error = `No plugin "${spec.id}" in .atlas/plugins/.`; return; }
    if (p.error) { error = p.error; return; }
    if (!pluginOn(p)) { error = `"${p.title}" is switched off (Settings → Plugins).`; return; }
    try {
      const mod = await loadView(p);
      if (mine !== generation) return;
      if (typeof mod.default !== "function") throw new Error("the module has no default export function (host, atlas) => …");
      const r = await mod.default(host, pluginApi(p, { path: spec.path, arg: spec.arg, anchor: spec.anchor, pane: paneOf(mine) }));
      if (mine !== generation) { if (typeof r === "function") r(); return; }
      cleanup = typeof r === "function" ? r : undefined;
    } catch (e) {
      error = `${p.view}: ${errText(e)}`;
      console.error("[atlas] plugin", p.id, e);
    }
  }

  // Ctrl+S (⌘S) in the pane: the view's save, as in the core's editors (keys inside a view's own iframe stay there)
  function onKey(e: KeyboardEvent) {
    if (!saver || !(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey || e.key.toLowerCase() !== "s") return;
    e.preventDefault();
    e.stopPropagation();
    void save().catch(() => {});
  }

  onMount(() => {
    void mount();
    paneParks.set(panel.id, save);
    pluginAnchors.set(panel.id, (a) => goTo?.(a));
    let t: ReturnType<typeof setTimeout> | undefined;
    const prefix = `.atlas/plugins/${spec.id}/`;
    const off = on("fs", (e) => {
      if (!e.paths.some((p) => p.startsWith(prefix))) return;
      clearTimeout(t);
      t = setTimeout(() => void (e.paths.some((p) => p.endsWith("plugin.toml")) ? loadPlugins().then(mount) : mount()), 250);
    });
    return () => {
      off(); clearTimeout(t); generation++; cleanup?.();
      if (paneParks.get(panel.id) === save) paneParks.delete(panel.id);
      pluginAnchors.delete(panel.id);
      setDirty(panel.id, false);
    };
  });
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="plugin-pane" onkeydown={onKey}>
  {#if error}
    <div class="plugin-error"><strong>Plugin “{spec.id}” could not load</strong><pre>{error}</pre><p class="faint">Edit the plugin's files; this pane reloads by itself.</p></div>
  {/if}
  <div class="plugin-host" bind:this={host}></div>
</div>

<style>
  .plugin-pane { height: 100%; display: flex; flex-direction: column; background: var(--bg); }
  .plugin-host { flex: 1; min-height: 0; overflow: auto; }
  /* a view drawn as a block (view.js → mountBlock) is a tab already: no "open as a tab" button, which also sat past the edge */
  .plugin-host > :global(.block-pop) { display: none; }
  .plugin-error { margin: 18px; padding: 12px 14px; border: 1px solid var(--danger, #e06c75); border-radius: var(--radius); }
  .plugin-error pre { white-space: pre-wrap; font: 12px var(--font-mono, monospace); margin: 8px 0; }
</style>
