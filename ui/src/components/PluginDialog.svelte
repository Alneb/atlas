<script lang="ts">
  // A plugin's pane (view.js) in a popup over the app (`atlas.openDialog`, lib/plugin-dialog.ts): the same module and
  // API as in a tab, drawn in a titled frame; Escape, Back, the ✕ and the backdrop close it, and so does
  // `atlas.pane.close()` from inside. Load errors are shown, never swallowed.
  import { onMount } from "svelte";
  import Dialog from "./Dialog.svelte";
  import { errText } from "../lib/text";
  import { loadView, pluginApi, type Plugin } from "../lib/plugins.svelte";

  let { plugin, arg, title, width = 960, height = 680, onclose }: {
    plugin: Plugin; arg?: string; title: string; width?: number; height?: number; onclose: () => void;
  } = $props();
  let host: HTMLDivElement;
  let error = $state("");
  onMount(() => {
    let cleanup: (() => void) | undefined;
    let gone = false;
    const pane = { setDirty: () => {}, onSave: () => () => {}, onAnchor: () => () => {}, close: () => onclose() };
    void (async () => {
      try {
        const mod = await loadView(plugin);
        if (gone) return;
        if (typeof mod.default !== "function") throw new Error("the module has no default export function (host, atlas) => …");
        const r = await mod.default(host, pluginApi(plugin, { arg, pane }));
        if (gone) { if (typeof r === "function") r(); return; }
        cleanup = typeof r === "function" ? r : undefined;
      } catch (e) {
        error = `${plugin.view}: ${errText(e)}`;
        console.error("[atlas] plugin dialog", plugin.id, e);
      }
    })();
    return () => { gone = true; cleanup?.(); };
  });
</script>

<!-- focus can fall to the body (a button inside disables itself while it works): Escape there closes it too -->
<svelte:window onkeydown={(e) => { if (e.key === "Escape" && (!document.activeElement || document.activeElement === document.body)) { e.preventDefault(); onclose(); } }} />
<Dialog label={title} {onclose} center>
  <div class="frame" style:width="min({width}px, 96vw)" style:height="min({height}px, 92vh)">
    <header>
      <h2>{title}</h2>
      <button class="x" aria-label="Close" title="Close · Esc" onclick={onclose}>✕</button>
    </header>
    {#if error}<p class="error">{error}</p>{/if}
    <div class="body" bind:this={host}></div>
  </div>
</Dialog>

<style>
  .frame { display: flex; flex-direction: column; min-height: 0; background: var(--bg); border: 1px solid var(--border-strong); border-radius: 12px; box-shadow: var(--shadow-pop); overflow: hidden; outline: none; }
  header { display: flex; align-items: center; gap: 8px; padding: 8px 10px 8px 16px; border-bottom: 1px solid var(--border); background: var(--bg-elev); }
  h2 { margin: 0; flex: 1; min-width: 0; font-size: calc(14px * var(--ui-scale, 1)); font-weight: 600; color: var(--text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .x { border: 0; background: transparent; color: var(--text-muted); width: calc(28px * var(--ui-scale, 1)); height: calc(28px * var(--ui-scale, 1)); border-radius: var(--radius-sm); cursor: pointer; }
  .x:hover { background: var(--bg-hover, var(--border)); color: var(--text); }
  .body { flex: 1; min-height: 0; overflow: hidden; }
  .error { margin: 12px 16px; color: var(--red); white-space: pre-wrap; }
</style>
