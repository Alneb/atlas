<script lang="ts">
  // An account's postings, newest first, with the running balance; a row opens its transaction in the journal.
  import { label, type RegisterRow } from "./api";
  let { rows, account, onopen, limit = 200 }: { rows: RegisterRow[]; account: string; onopen: (r: RegisterRow) => void; limit?: number } = $props();
  let shown = $state(0);
  const max = $derived(shown || limit);
  const newest = $derived(rows.slice().reverse());
  const num = (s: string) => Number(s.split(" ")[0]);
  const fmt = (s: string) => { const [q, c] = s.split(" "); return `${Number(q).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })} ${c ?? ""}`; };
</script>

<table class="register">
  <tbody>
    {#each newest.slice(0, max) as r, i (i)}
      <tr onclick={() => onopen(r)} title="{r.path}:{r.line}">
        <td class="date">{r.date}</td>
        <td class="payee"><span class:review={r.status === "!"}>{r.payee}</span>{#if r.narration}<span class="faint"> · {r.narration}</span>{/if}{#if r.account !== account}<span class="faint"> · {label(r.account)}</span>{/if}</td>
        <td class="num" class:neg={num(r.amount) < 0}>{fmt(r.amount)}</td>
        <td class="num run">{Number(r.running).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })}</td>
      </tr>
    {:else}
      <tr><td class="atlas-empty" colspan="4">No postings.</td></tr>
    {/each}
  </tbody>
</table>
{#if newest.length > max}
  <button class="atlas-btn more" onclick={() => (shown = max + 500)}>{newest.length - max} older…</button>
{/if}

<style>
  .register { width: 100%; border-collapse: collapse; font-variant-numeric: tabular-nums; }
  tr { cursor: pointer; }
  tr:hover td { background: var(--bg-hover); }
  td { padding: 4px 8px; border-bottom: 1px solid var(--border); vertical-align: baseline; }
  .date { color: var(--text-muted); white-space: nowrap; width: 1%; }
  .payee { overflow-wrap: anywhere; }
  .review { border-bottom: 2px dotted var(--yellow); }
  .faint { color: var(--text-faint); }
  .num { text-align: right; white-space: nowrap; width: 1%; }
  .neg { color: var(--red); }
  .run { color: var(--text-muted); }
  .more { margin: 8px; }
</style>
