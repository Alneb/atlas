<script lang="ts">
  // Which calendar an event goes to: every writable calendar of every account, grouped by account, the chosen one's
  // colour beside the box (the editor, the new-event card, quick add).
  import type { Cal } from "./store.svelte";

  let { cal, value = $bindable(), disabled = false, compact = false }: { cal: Cal; value: string; disabled?: boolean; compact?: boolean } = $props();
  const groups = $derived(cal.byAccount(true));
  const several = $derived(groups.length > 1);
  const named = (id: string) => cal.sources.find((s) => s.id === id)?.name ?? id;
</script>

<span class="pick" class:compact>
  <span class="dot" style:--c={value ? cal.colorOf(value) : "transparent"} aria-hidden="true"></span>
  <select bind:value {disabled} aria-label="Calendar" title={value}>
    {#if value && !groups.some((g) => g.items.some((s) => s.id === value))}<option value={value}>{named(value)}</option>{/if}
    {#each groups as g (g.account.name)}
      {#if several}
        <optgroup label={g.account.name}>
          {#each g.items as s (s.id)}<option value={s.id}>{s.name}</option>{/each}
        </optgroup>
      {:else}
        {#each g.items as s (s.id)}<option value={s.id}>{s.name}</option>{/each}
      {/if}
    {/each}
  </select>
</span>

<style>
  .pick { display: inline-flex; align-items: center; gap: 8px; min-width: 0; flex: 1; }
  .pick.compact { flex: 0 1 auto; }
  .dot { width: 12px; height: 12px; border-radius: 4px; background: var(--c); flex: none; }
  select { font: inherit; color: var(--text); background-color: var(--bg); border: 1px solid var(--border-strong); border-radius: var(--radius-sm); padding: 5px 28px 5px 8px; min-width: 0; flex: 1; color-scheme: light dark;
    appearance: none; -webkit-appearance: none; background-image: linear-gradient(45deg, transparent 50%, var(--text-muted) 50%), linear-gradient(135deg, var(--text-muted) 50%, transparent 50%); background-position: calc(100% - 15px) 50%, calc(100% - 10px) 50%; background-size: 5px 5px; background-repeat: no-repeat; }
  .compact select { flex: 0 1 auto; max-width: 16em; }
  select:disabled { opacity: 0.6; }
  select:focus-visible { outline: 2px solid var(--accent); outline-offset: -1px; }
</style>
