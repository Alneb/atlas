<script lang="ts">
  // The vault's libraries in one page (docs/design/DESIGN-libraries-everywhere.md): a tab per library the vault shows
  // (lib/libraries.svelte.ts, `[ui] libraries`), the chosen one drawn by the generic library page. Opened at one
  // (`at`), else at the last one seen here.
  import type { PaneProps } from "../lib/dock";
  import { shownLibraries } from "../lib/libraries.svelte";
  import { load, save } from "../lib/prefs";
  import { errText } from "../lib/text";
  import type { LibrarySource } from "../lib/library";
  import Library from "../components/library/Library.svelte";
  import Icon from "../components/Icon.svelte";

  let { spec }: PaneProps<"libraries"> = $props();
  const LAST = "atlas.libraries.last";
  const list = $derived(shownLibraries());
  let chosen = $state(load<string>(LAST, ""));
  $effect(() => { if (spec.at) chosen = spec.at; }); // opened (again) at one
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
  {#if list.length > 1}
    <div class="which" role="tablist" aria-label="Libraries">
      {#each list as e (e.id)}
        <button role="tab" class:on={e === current} aria-selected={e === current} onclick={() => (chosen = e.id)}><Icon name={e.icon} size={14} />{e.title}</button>
      {/each}
    </div>
  {/if}
  {#if !current}
    <p class="none">No library in this vault: its plugins give them (Drawings is Atlas's own; Settings → Appearance → Libraries chooses which show).</p>
  {:else if error}
    <p class="none">{error}</p>
  {:else if source}
    {#key source}<Library {source} />{/key}
  {/if}
</div>

<style>
  .libraries { display: flex; flex-direction: column; height: 100%; min-height: 0; }
  .which { display: flex; gap: 4px; padding: 6px 10px 0; overflow-x: auto; flex: none; border-bottom: 1px solid var(--border); }
  .which button { display: inline-flex; align-items: center; gap: 6px; padding: 6px 12px; border: none; background: none; color: var(--text-muted);
    border-bottom: 2px solid transparent; white-space: nowrap; font: inherit; cursor: pointer; }
  .which button:hover { color: var(--text); }
  .which button.on { color: var(--text); border-bottom-color: var(--accent); }
  .libraries > :global(:last-child) { flex: 1; min-height: 0; }
  .none { padding: 24px; color: var(--text-muted); }
</style>
