<script lang="ts">
  // The table's plot: X = a numeric column or the row number, Y = any numeric columns, as lines or points, log axes;
  // or a histogram of one column. Drawn from the rows the table shows (filters and sort applied) or from the selected
  // rows only. Defaults by shape: X = a column that only grows (a sweep), else the row number; Y = the first other
  // column that varies.
  import Plot from "../Plot.svelte";
  import Histogram from "./Histogram.svelte";
  import Select from "../Select.svelte";

  const ROWNUM = -1;
  let { header, numeric, rows, selected }: { header: string[]; numeric: boolean[]; rows: string[][]; selected: string[][] | null } = $props();

  let kind = $state<"xy" | "hist">("xy");
  let mode = $state<"line" | "points">("line");
  let logX = $state(false), logY = $state(false);
  let onlySel = $state(false);
  let bins = $state(30);
  let xCol = $state<number | null>(null);
  let yCols = $state<number[]>([]);

  const numericCols = $derived(header.map((_, i) => i).filter((i) => numeric[i]));
  const data = $derived(onlySel && selected?.length ? selected : rows);
  const col = (i: number) => (i === ROWNUM ? data.map((_, k) => k + 1) : data.map((r) => parseFloat(r[i])));
  const varies = (v: number[]) => v.some((x) => Number.isFinite(x) && x !== v.find(Number.isFinite));
  const increasing = (v: number[]) => v.length > 2 && v.every((x, k) => k === 0 || x > v[k - 1]);

  $effect(() => {
    if (xCol !== null || !numericCols.length) return;
    const x = numericCols.find((i) => increasing(col(i))) ?? ROWNUM;
    const y = numericCols.find((i) => i !== x && varies(col(i)));
    xCol = x;
    yCols = y === undefined ? [] : [y];
  });
  const label = (i: number) => (i === ROWNUM ? "row" : header[i]);
</script>

<section class="plot-panel" aria-label="Plot">
  <div class="controls">
    <div class="seg" role="group" aria-label="Plot kind">
      <button class:on={kind === "xy"} aria-pressed={kind === "xy"} onclick={() => (kind = "xy")}>X–Y</button>
      <button class:on={kind === "hist"} aria-pressed={kind === "hist"} onclick={() => (kind = "hist")}>Histogram</button>
    </div>
    {#if kind === "xy"}
      <span class="lbl">X</span>
      <Select value={String(xCol ?? ROWNUM)} onchange={(v) => { xCol = Number(v); yCols = yCols.filter((c) => c !== xCol); }} label="X column"
        options={[{ value: String(ROWNUM), label: "Row #" }, ...numericCols.map((i) => ({ value: String(i), label: header[i] }))]} />
      <div class="seg" role="group" aria-label="Draw as">
        <button class:on={mode === "line"} aria-pressed={mode === "line"} onclick={() => (mode = "line")}>Lines</button>
        <button class:on={mode === "points"} aria-pressed={mode === "points"} onclick={() => (mode = "points")}>Points</button>
      </div>
      <label class="check"><input type="checkbox" bind:checked={logX} /> log X</label>
      <label class="check"><input type="checkbox" bind:checked={logY} /> log Y</label>
    {:else}
      <span class="lbl">Column</span>
      <Select value={String(yCols[0] ?? numericCols[0] ?? "")} onchange={(v) => (yCols = [Number(v)])} label="Histogram column"
        options={numericCols.map((i) => ({ value: String(i), label: header[i] }))} />
      <label class="check">Bins <input class="bins" type="number" min="1" max="200" bind:value={bins} /></label>
    {/if}
    <label class="check" title="Plot only the rows selected in the table"><input type="checkbox" bind:checked={onlySel} disabled={!selected || selected.length < 2} /> selection only</label>
  </div>
  {#if kind === "xy"}
    <div class="chips" aria-label="Y columns">
      <span class="lbl">Y</span>
      {#each numericCols.filter((i) => i !== xCol) as i (i)}
        <button class="chip" class:on={yCols.includes(i)} aria-pressed={yCols.includes(i)}
          onclick={() => (yCols = yCols.includes(i) ? yCols.filter((c) => c !== i) : [...yCols, i])}>{header[i]}</button>
      {/each}
    </div>
    {#if yCols.length && xCol !== null}
      <Plot x={col(xCol)} ys={yCols.map(col)} xLabel={label(xCol)} yLabels={yCols.map((i) => header[i])} {mode} {logX} {logY} />
    {:else}<p class="muted pad">Pick one or more Y columns.</p>{/if}
  {:else if numericCols.length}
    {@const c = yCols[0] ?? numericCols[0]}
    <Histogram values={col(c)} label={header[c]} {bins} />
  {/if}
</section>

<style>
  .plot-panel { border-bottom: 1px solid var(--border); background: var(--bg-alt); max-height: 60%; overflow: auto; flex: none; }
  .controls { display: flex; align-items: center; gap: 10px; padding: 8px 12px 0; flex-wrap: wrap; }
  .chips { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; padding: 6px 12px 0; max-height: 64px; overflow: auto; }
  .lbl { color: var(--text-muted); font-size: calc(12px * var(--ui-scale, 1)); }
  .chip { font-size: calc(11.5px * var(--ui-scale, 1)); padding: 2px 8px; border-radius: 999px; border: 1px solid var(--border-strong); color: var(--text-muted); }
  .chip.on { border-color: var(--accent); color: var(--text); background: var(--accent-soft); }
  .seg { display: inline-flex; border: 1px solid var(--border-strong); border-radius: var(--radius-sm); overflow: hidden; }
  .seg button { padding: 3px 10px; font-size: calc(12px * var(--ui-scale, 1)); color: var(--text-muted); border-radius: 0; }
  .seg button + button { border-left: 1px solid var(--border-strong); }
  .seg button.on { background: var(--accent-soft); color: var(--text); }
  .check { display: inline-flex; align-items: center; gap: 4px; font-size: calc(12px * var(--ui-scale, 1)); color: var(--text-muted); }
  .bins { width: 56px; font: inherit; color: var(--text); background: var(--bg-elev); border: 1px solid var(--border-strong); border-radius: var(--radius-sm); padding: 2px 4px; }
  .pad { padding: 12px; }
</style>
