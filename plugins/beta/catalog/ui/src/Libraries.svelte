<script lang="ts">
  // The vault's libraries in one page (docs/design/DESIGN-libraries-everywhere.md): a tab per library the vault shows
  // (`atlas.libraries`: those Atlas's features and the plugins register, as `[ui] libraries` says; those of one
  // subject one tab), the chosen one drawn by the library page. Opened at one (`at`, the pane's anchor; later ones
  // come to `atlas.pane.onAnchor`), else at the last one seen here.
  import { onMount, untrack } from "svelte";
  import { load, save } from "../../../../../ui/src/lib/prefs";
  import { errText } from "../../../../../ui/src/lib/text";
  import type { LibraryEntry, LibrarySource, PluginApi } from "../../../../../ui/src/lib/plugin-api";
  import { bySubject } from "./library";
  import Library from "./Library.svelte";
  import Icon from "./Icon.svelte";

  let { atlas }: { atlas: PluginApi } = $props();
  const LAST = "atlas.libraries.last";
  let entries = $state.raw<LibraryEntry[]>(untrack(() => atlas.libraries.list()));
  const list = $derived(bySubject(entries));
  // the vault's libraries, then the services' own (a server's library with nothing of the vault's kind beside it)
  const mine = $derived(list.filter((e) => !e.from));
  const services = $derived(list.filter((e) => e.from));
  let chosen = $state(untrack(() => atlas.anchor) || load<string>(LAST, ""));
  onMount(() => {
    const offList = atlas.libraries.onChange((l) => (entries = l));
    const offAt = atlas.pane?.onAnchor((at) => (chosen = at)); // opened again at another library
    return () => { offList(); offAt?.(); };
  });
  const current = $derived(list.find((e) => e.id === chosen || e.members?.includes(chosen)) ?? list[0]);
  let source = $state<LibrarySource | null>(null);
  let error = $state("");

  $effect(() => {
    const e = current;
    source = null;
    error = "";
    if (!e) return;
    save(LAST, e.id);
    let live = true;
    Promise.resolve(e.source()).then((s) => { if (live) source = s; }, (err) => { if (live) error = `${e.title}: ${errText(err)}`; });
    return () => { live = false; };
  });
</script>

<div class="libraries">
  {#snippet tab(e: (typeof list)[number])}
    <button role="tab" class:on={e === current} aria-selected={e === current} onclick={() => (chosen = e.id)}><Icon name={e.icon} size={14} />{e.title}</button>
  {/snippet}
  {#if list.length > 1}
    <div class="which" role="tablist" aria-label="Libraries">
      {#each mine as e (e.id)}{@render tab(e)}{/each}
      {#if services.length}
        <span class="apart" aria-hidden="true"></span><span class="label">On your servers</span>
        {#each services as e (e.id)}{@render tab(e)}{/each}
      {/if}
    </div>
  {/if}
  {#if !current}
    <p class="none">No library in this vault yet. Show a folder as a library from its menu in the file explorer (“Show as a library”), or add one in Settings → Libraries.</p>
  {:else if error}
    <p class="none">{error}</p>
  {:else if source}
    {#key source}<Library {atlas} {source} />{/key}
  {/if}
</div>

<style>
  .libraries { display: flex; flex-direction: column; height: 100%; min-height: 0; }
  .which { display: flex; gap: 4px; padding: 6px 10px 0; overflow-x: auto; flex: none; border-bottom: 1px solid var(--border); }
  .which button { display: inline-flex; align-items: center; gap: 6px; padding: 6px 12px; border: none; background: none; color: var(--text-muted);
    border-bottom: 2px solid transparent; white-space: nowrap; font: inherit; cursor: pointer; }
  .which button:hover { color: var(--text); }
  .which button.on { color: var(--text); border-bottom-color: var(--accent); }
  .which .apart { flex: none; width: 1px; margin: 6px 6px 8px; background: var(--border-strong); }
  .which .label { flex: none; align-self: center; padding: 0 4px 2px; color: var(--text-faint); font-size: calc(11px * var(--ui-scale, 1)); text-transform: uppercase; letter-spacing: .06em; white-space: nowrap; }
  .libraries > :global(:last-child) { flex: 1; min-height: 0; }
  .none { padding: 24px; color: var(--text-muted); }
</style>
