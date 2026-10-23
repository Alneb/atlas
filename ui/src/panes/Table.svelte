<script lang="ts">
  import { errText } from "../lib/text";
  import { shownPath } from "../lib/paths";
  import { superOf } from "../lib/keys";
  // Delimited data (TSV/CSV) as a table: delimiter sniffed, header detected, only visible rows
  // rendered (run tables have thousands), click a header to sort, filter rows, view as text.
  import { onMount } from "svelte";
  import { loadTable } from "../lib/table-load";
  import { on } from "../lib/bus";
  import { open } from "../lib/dock";
  import type { PaneProps } from "../lib/dock";
  import type { Table } from "../lib/table";
  import Icon from "../components/Icon.svelte";
  import { toast } from "../lib/state.svelte";
  import Plot from "../components/Plot.svelte";
  import Select from "../components/Select.svelte";

  let { spec }: PaneProps<"table"> = $props();
  // raw: replaced whole, never mutated; deep proxies over ~10⁶ cells cost more than the parse
  let table = $state.raw<Table | null>(null);
  let error = $state("");
  let filter = $state("");
  let sortCol = $state(-1);
  let sortDir = $state<1 | -1>(1);
  let scroller: HTMLDivElement;
  let scrollTop = $state(0);
  let viewH = $state(600);
  const ROW = 26;

  async function load() {
    try {
      table = await loadTable(spec.path);
      error = "";
    } catch (e) { error = errText(e); }
  }

  const rows = $derived.by(() => {
    if (!table) return [] as string[][];
    const q = filter.trim().toLowerCase();
    let r = q ? table.rows.filter((row) => row.some((c) => c.toLowerCase().includes(q))) : table.rows;
    if (sortCol >= 0) {
      const num = table.numeric[sortCol];
      const k = sortCol;
      r = [...r].sort((a, b) => sortDir * (num ? (parseFloat(a[k]) || 0) - (parseFloat(b[k]) || 0) : (a[k] ?? "").localeCompare(b[k] ?? "")));
    }
    return r;
  });
  const first = $derived(Math.max(0, Math.floor(scrollTop / ROW) - 10));
  const last = $derived(Math.min(rows.length, Math.ceil((scrollTop + viewH) / ROW) + 10));

  // Spreadsheet-style selection: anchor + cursor (row index into the filtered/sorted rows).
  let cur = $state({ r: 0, c: 0 });
  let anchor = $state({ r: 0, c: 0 });
  const inSel = (r: number, c: number) =>
    r >= Math.min(anchor.r, cur.r) && r <= Math.max(anchor.r, cur.r) && c >= Math.min(anchor.c, cur.c) && c <= Math.max(anchor.c, cur.c);

  function select(r: number, c: number, extend: boolean) {
    const nr = Math.max(0, Math.min(rows.length - 1, r)), nc = Math.max(0, Math.min((table?.header.length ?? 1) - 1, c));
    cur = { r: nr, c: nc };
    if (!extend) anchor = { r: nr, c: nc };
    // keep the cursor in view: vertical by arithmetic (rows are virtual), horizontal via the cell
    const top = nr * ROW, head = ROW;
    if (top < scroller.scrollTop) scroller.scrollTop = top;
    else if (top + ROW + head > scroller.scrollTop + scroller.clientHeight) scroller.scrollTop = top + ROW + head - scroller.clientHeight;
    requestAnimationFrame(() => scroller.querySelector(`td[data-c="${nc}"].cursor`)?.scrollIntoView({ block: "nearest", inline: "nearest" }));
  }

  function onKey(e: KeyboardEvent) {
    if ((e.target as HTMLElement).tagName === "INPUT") return;
    const page = Math.max(1, Math.floor(scroller.clientHeight / ROW) - 2);
    const moves: Record<string, [number, number]> = {
      ArrowDown: [1, 0], ArrowUp: [-1, 0], ArrowRight: [0, 1], ArrowLeft: [0, -1], j: [1, 0], k: [-1, 0], l: [0, 1], h: [0, -1],
      PageDown: [page, 0], PageUp: [-page, 0],
    };
    if ((e.ctrlKey || superOf(e)) && e.key.toLowerCase() === "c") { e.preventDefault(); void copySelection(); return; }
    if (e.ctrlKey || superOf(e) || e.altKey) return;
    let to: [number, number] | null = null;
    if (e.key in moves) to = [cur.r + moves[e.key][0], cur.c + moves[e.key][1]];
    else if (e.key === "Home") to = [e.ctrlKey ? 0 : cur.r, 0];
    else if (e.key === "End") to = [cur.r, (table?.header.length ?? 1) - 1];
    else if (e.key === "g") to = [0, cur.c];
    else if (e.key === "G") to = [rows.length - 1, cur.c];
    if (!to) return;
    e.preventDefault();
    select(to[0], to[1], e.shiftKey && e.key !== "G");
  }

  /** The selected block as TSV (a single cell is just its text). */
  async function copySelection() {
    const [r0, r1] = [Math.min(anchor.r, cur.r), Math.max(anchor.r, cur.r)];
    const [c0, c1] = [Math.min(anchor.c, cur.c), Math.max(anchor.c, cur.c)];
    const text = rows.slice(r0, r1 + 1).map((row) => row.slice(c0, c1 + 1).join("\t")).join("\n");
    try { await navigator.clipboard.writeText(text); toast(`Copied ${(r1 - r0 + 1) * (c1 - c0 + 1)} cell${r1 === r0 && c1 === c0 ? "" : "s"}`); }
    catch (err) { toast("Copy failed", String(err), "error"); }
  }

  // quick plot: X = one numeric column, Y = any numeric columns (the filtered rows, in table order)
  const ROWNUM = -1; // "column" = the row number (iteration tables)
  let plotOn = $state(false);
  let xCol = $state<number | null>(null);
  let yCols = $state<number[]>([]);
  const numericCols = $derived(table ? table.header.map((_, i) => i).filter((i) => table!.numeric[i]) : []);
  const col = (i: number) => (i === ROWNUM ? rows.map((_, k) => k + 1) : rows.map((r) => parseFloat(r[i])));
  const varies = (v: number[]) => v.some((x) => Number.isFinite(x) && x !== v.find(Number.isFinite));
  const increasing = (v: number[]) => v.length > 2 && v.every((x, k) => k === 0 || x > v[k - 1]);
  /** Defaults by shape: X = a column that only grows (a sweep), else the row number; Y = the
   *  first other column that varies (constants make flat or vertical lines). */
  function togglePlot() {
    plotOn = !plotOn;
    if (!plotOn || xCol !== null) return;
    xCol = numericCols.find((i) => increasing(col(i))) ?? ROWNUM;
    const y = numericCols.find((i) => i !== xCol && varies(col(i)));
    yCols = y === undefined ? [] : [y];
  }

  function sortBy(i: number) {
    if (sortCol === i) sortDir = sortDir === 1 ? -1 : 1;
    else { sortCol = i; sortDir = 1; }
  }

  onMount(() => {
    void load();
    const ro = new ResizeObserver(() => (viewH = scroller?.clientHeight ?? 600));
    ro.observe(scroller);
    const off = on("fs", (e) => { if (e.paths.includes(spec.path)) void load(); });
    return () => { ro.disconnect(); off(); };
  });
</script>

<div class="table-pane">
  <header>
    <span class="name"><Icon name="table" size={14} /> {shownPath(spec.path)}</span>
    {#if table}<span class="meta">{rows.length === table.rows.length ? table.rows.length : `${rows.length} / ${table.rows.length}`} rows · {table.header.length} columns · {table.delimiterName}</span>{/if}
    <input class="filter" placeholder="Filter rows…" bind:value={filter} spellcheck="false" />
    <button class="btn" class:on={plotOn} onclick={togglePlot} disabled={!numericCols.length} title={numericCols.length ? "Plot columns (or against the row number)" : "No numeric columns"}><Icon name="chart" size={14} /> Plot</button>
    <button class="btn" onclick={() => open({ kind: "editor", path: spec.path })} title="Open the raw file in the editor"><Icon name="file-code" size={14} /> Text</button>
  </header>
  {#if error}<p class="muted pad">{error}</p>{/if}
  {#if plotOn && table && xCol !== null}
    <section class="plot-panel" aria-label="Plot">
      <div class="plot-controls">
        <span class="lbl">X</span>
        <Select value={String(xCol)} onchange={(v) => { xCol = Number(v); yCols = yCols.filter((c) => c !== xCol); }} label="X column"
          options={[{ value: String(ROWNUM), label: "Row #" }, ...numericCols.map((i) => ({ value: String(i), label: table!.header[i] }))]} />
        <span class="lbl">Y</span>
        <div class="chips">
          {#each numericCols.filter((i) => i !== xCol) as i (i)}
            <button class="chip" class:on={yCols.includes(i)} aria-pressed={yCols.includes(i)}
              onclick={() => (yCols = yCols.includes(i) ? yCols.filter((c) => c !== i) : [...yCols, i])}>{table.header[i]}</button>
          {/each}
        </div>
      </div>
      {#if yCols.length}
        <Plot x={col(xCol)} ys={yCols.map(col)} xLabel={xCol === ROWNUM ? "row" : table.header[xCol]} yLabels={yCols.map((i) => table!.header[i])} />
      {:else}<p class="muted pad">Pick one or more Y columns.</p>{/if}
    </section>
  {/if}
  <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
  <div class="grid-scroll" bind:this={scroller} onscroll={() => (scrollTop = scroller.scrollTop)} tabindex="0" onkeydown={onKey} role="grid" aria-label="Table">
    {#if table}
      <table style:--cols={table.header.length}>
        <thead>
          <tr>
            <th class="rownum">#</th>
            {#each table.header as h, i}
              <th class:num={table.numeric[i]} onclick={() => sortBy(i)} title="Sort by {h}">{h}{#if sortCol === i}<span class="dir">{sortDir === 1 ? "▲" : "▼"}</span>{/if}</th>
            {/each}
          </tr>
        </thead>
        <tbody>
          <tr class="spacer" style:height="{first * ROW}px"></tr>
          {#each rows.slice(first, last) as row, j (first + j)}
            <tr>
              <td class="rownum">{first + j + 1}</td>
              {#each table.header as _, i}
                <td class:num={table.numeric[i]} class:sel={inSel(first + j, i)} class:cursor={cur.r === first + j && cur.c === i} data-c={i}
                  onmousedown={(e) => { e.preventDefault(); scroller.focus(); select(first + j, i, e.shiftKey); }}>{row[i] ?? ""}</td>
              {/each}
            </tr>
          {/each}
          <tr class="spacer" style:height="{(rows.length - last) * ROW}px"></tr>
        </tbody>
      </table>
    {/if}
  </div>
</div>

<style>
  .table-pane { height: 100%; display: flex; flex-direction: column; background: var(--bg); }
  header { display: flex; align-items: center; gap: 12px; padding: 8px 12px; border-bottom: 1px solid var(--border); flex-wrap: wrap; }
  .name { display: inline-flex; gap: 6px; align-items: center; font-family: var(--font-mono); font-size: calc(12.5px * var(--ui-scale, 1)); color: var(--text); }
  .meta { color: var(--text-faint); font-size: calc(12px * var(--ui-scale, 1)); }
  .filter { margin-left: auto; width: 200px; font: inherit; font-size: calc(12.5px * var(--ui-scale, 1)); color: var(--text); background: var(--bg-elev);
    border: 1px solid var(--border-strong); border-radius: var(--radius-sm); padding: 4px 8px; }
  .filter:focus { outline: none; border-color: var(--accent); }
  .btn { display: inline-flex; gap: 6px; align-items: center; border: 1px solid var(--border-strong); }
  .btn:hover { background: var(--bg-hover); }
  .btn.on { border-color: var(--accent); color: var(--accent); }
  .btn:disabled { opacity: .45; }
  .plot-panel { border-bottom: 1px solid var(--border); background: var(--bg-alt); max-height: 55%; overflow: auto; flex: none; }
  .plot-controls { display: flex; align-items: flex-start; gap: 8px; padding: 8px 12px 0; flex-wrap: wrap; }
  .lbl { color: var(--text-muted); font-size: calc(12px * var(--ui-scale, 1)); padding-top: 6px; }
  .chips { display: flex; flex-wrap: wrap; gap: 4px; max-height: 64px; overflow: auto; flex: 1; }
  .chip { font-size: calc(11.5px * var(--ui-scale, 1)); padding: 2px 8px; border-radius: 999px; border: 1px solid var(--border-strong); color: var(--text-muted); }
  .chip.on { border-color: var(--accent); color: var(--text); background: var(--accent-soft); }
  .grid-scroll { flex: 1; min-height: 0; overflow: auto; }
  table { border-collapse: separate; border-spacing: 0; font-family: var(--code-font, var(--font-mono)); font-size: calc(12.5px * var(--ui-scale, 1)); font-variant-numeric: tabular-nums; }
  th, td { height: 26px; padding: 0 12px; white-space: nowrap; border-bottom: 1px solid var(--border); border-right: 1px solid color-mix(in srgb, var(--border) 60%, transparent); text-align: left; }
  th { position: sticky; top: 0; z-index: 1; background: var(--bg-alt); color: var(--heading); font-family: var(--font-ui); font-weight: 600; cursor: pointer; user-select: none; }
  th:hover { background: var(--bg-hover); }
  .num { text-align: right; }
  .dir { margin-left: 4px; font-size: .8em; color: var(--accent); }
  .rownum { position: sticky; left: 0; background: var(--bg-alt); color: var(--text-faint); text-align: right; font-size: .9em; z-index: 1; }
  th.rownum { z-index: 2; }
  tbody tr:not(.spacer):hover td { background: color-mix(in srgb, var(--accent) 6%, transparent); }
  tbody tr:not(.spacer):hover td.rownum { background: var(--bg-hover); }
  tr.spacer { border: 0; padding: 0; }
  .pad { padding: 12px; }
  .grid-scroll:focus { outline: none; }
  td.sel { background: color-mix(in srgb, var(--accent) 14%, transparent) !important; }
  td.cursor { box-shadow: inset 0 0 0 2px var(--accent); }
</style>
