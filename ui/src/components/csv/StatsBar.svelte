<script lang="ts">
  // The numbers under the table: of the selected cells when more than one is selected, else of the cursor's column
  // (the rows shown) — count, then min / max / mean / sum / sd for numbers, or the distinct values for text.
  import { stats } from "../../lib/csv/filter";
  let { cells, what }: { cells: string[]; what: string } = $props();
  const s = $derived(stats(cells));
  const fmt = (v: number) => (Math.abs(v) >= 1e6 || (Math.abs(v) < 1e-3 && v !== 0) ? v.toExponential(3) : String(+v.toPrecision(6)));
</script>

<footer class="stats" aria-label="Statistics">
  <span class="what">{what}</span>
  <span>count <b>{s.filled}</b>{#if s.filled !== s.count}<i> / {s.count}</i>{/if}</span>
  {#if s.num}
    <span>min <b>{fmt(s.num.min)}</b></span><span>max <b>{fmt(s.num.max)}</b></span>
    <span>mean <b>{fmt(s.num.mean)}</b></span><span>sum <b>{fmt(s.num.sum)}</b></span>
    {#if s.num.n > 1}<span>sd <b>{fmt(s.num.sd)}</b></span>{/if}
  {:else if s.filled}
    <span>distinct <b>{s.distinct}</b></span>
    {#if s.top}<span class="top">most: <b>{s.top.value}</b> ×{s.top.n}</span>{/if}
  {/if}
</footer>

<style>
  .stats { display: flex; gap: 16px; align-items: center; padding: 4px 12px; border-top: 1px solid var(--border); background: var(--bg-alt);
    font-size: calc(11.5px * var(--ui-scale, 1)); color: var(--text-muted); font-variant-numeric: tabular-nums; white-space: nowrap; overflow: hidden; flex: none; }
  .what { color: var(--text-faint); max-width: 30%; overflow: hidden; text-overflow: ellipsis; }
  b { color: var(--text); font-weight: 600; }
  i { font-style: normal; color: var(--text-faint); }
  .top { overflow: hidden; text-overflow: ellipsis; }
</style>
