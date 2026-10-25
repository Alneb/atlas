<script lang="ts">
  // The table's rows grouped by one column (lib/csv/group.ts): a row per value with its count and the sub-totals of
  // the numeric columns shown — sum, mean, min or max — and the total of all of them last. Drawn from the rows the
  // table shows (filters applied); a click on a group filters the table to it, a second click lets it go.
  import { groupFilter, groupRows, measure, MEASURES, type Measure } from "../../lib/csv/group";
  import Select from "../Select.svelte";

  let { header, numeric, rows, idx, col, cols, dir, shown, by, measureOf = $bindable("sum"), onpick, onfilter, onclose }: {
    header: string[]; numeric: boolean[];
    /** every row's values (formulas' results) */
    rows: string[][];
    /** the rows shown, in their order */
    idx: number[];
    /** the grouped column */
    col: number;
    /** the columns shown, in their order */
    cols: number[];
    /** the groups the other way round (the table sorted down on the grouped column) */
    dir: 1 | -1;
    /** the grouped column's filter now, to mark the group it keeps */
    shown: string;
    /** the grouped columns the user can pick from */
    by: number[];
    measureOf?: Measure;
    onpick: (col: number) => void;
    /** the grouped column's filter set to keep one group (null: none) */
    onfilter: (filter: string | null) => void;
    onclose: () => void;
  } = $props();

  const nums = $derived(cols.filter((c) => c !== col && numeric[c]));
  const grouped = $derived(groupRows(rows, idx, col, nums, numeric[col], dir));
  const fmt = (v: number | null) => (v === null ? "" : Math.abs(v) >= 1e6 || (Math.abs(v) < 1e-3 && v !== 0) ? v.toExponential(3) : String(+v.toPrecision(6)));
  const LABEL: Record<Measure, string> = { sum: "Sum", mean: "Mean", min: "Min", max: "Max" };
</script>

<section class="group-panel" aria-label="Groups">
  <div class="controls">
    <span class="lbl">Grouped by</span>
    <Select value={String(col)} onchange={(v) => onpick(Number(v))} label="Group by"
      options={by.map((i) => ({ value: String(i), label: header[i] }))} />
    {#if nums.length}
      <div class="seg" role="group" aria-label="Sub-totals">
        {#each MEASURES as m (m)}<button class:on={measureOf === m} aria-pressed={measureOf === m} onclick={() => (measureOf = m)}>{LABEL[m]}</button>{/each}
      </div>
    {/if}
    <span class="muted">{grouped.groups.length} group{grouped.groups.length === 1 ? "" : "s"} · a click shows only that group's rows</span>
    <button class="btn" onclick={onclose} title="Show the rows ungrouped">Ungroup</button>
  </div>
  <div class="scroll">
    <table>
      <thead><tr><th>{header[col]}</th><th class="n">Rows</th>{#each nums as c (c)}<th class="n">{LABEL[measureOf]} of {header[c]}</th>{/each}</tr></thead>
      <tbody>
        {#each grouped.groups as g (g.key.toLowerCase())}
          {@const f = groupFilter(g.key)}
          {@const on = shown.trim().toLowerCase() === f.toLowerCase()}
          <tr class:on tabindex="0" aria-current={on ? "true" : undefined} onclick={() => onfilter(on ? null : f)} title={on ? "Show every group again" : "Show only these rows"}
            onkeydown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onfilter(on ? null : f); } }}>
            <td class:blank={!g.key}>{g.key || "(blank)"}</td><td class="n">{g.rows.length}</td>
            {#each nums as c (c)}<td class="n">{fmt(measure(g.totals.get(c), measureOf))}</td>{/each}
          </tr>
        {/each}
      </tbody>
      <tfoot><tr><td>All</td><td class="n">{idx.length}</td>{#each nums as c (c)}<td class="n">{fmt(measure(grouped.all.get(c), measureOf))}</td>{/each}</tr></tfoot>
    </table>
  </div>
</section>

<style>
  .group-panel { border-bottom: 1px solid var(--border); background: var(--bg-alt); max-height: 45%; display: flex; flex-direction: column; flex: none; }
  .controls { display: flex; align-items: center; gap: 10px; padding: 8px 12px; flex-wrap: wrap; }
  .lbl, .muted { color: var(--text-muted); font-size: calc(12px * var(--ui-scale, 1)); }
  .muted { color: var(--text-faint); }
  .btn { margin-left: auto; border: 1px solid var(--border-strong); font-size: calc(12px * var(--ui-scale, 1)); }
  .btn:hover { background: var(--bg-hover); }
  .seg { display: inline-flex; border: 1px solid var(--border-strong); border-radius: var(--radius-sm); overflow: hidden; }
  .seg button { padding: 3px 10px; font-size: calc(12px * var(--ui-scale, 1)); color: var(--text-muted); border-radius: 0; }
  .seg button + button { border-left: 1px solid var(--border-strong); }
  .seg button.on { background: var(--accent-soft); color: var(--text); }
  .scroll { overflow: auto; padding: 0 12px 8px; }
  table { border-collapse: collapse; font-size: calc(12.5px * var(--ui-scale, 1)); font-variant-numeric: tabular-nums; min-width: 50%; }
  th, td { padding: 3px 12px 3px 6px; border-bottom: 1px solid var(--border); text-align: left; white-space: nowrap; }
  th { position: sticky; top: 0; background: var(--bg-alt); color: var(--text-muted); font-weight: 500; }
  .n { text-align: right; }
  tbody tr { cursor: pointer; }
  tbody tr:hover { background: var(--bg-hover); }
  tbody tr.on { background: var(--accent-soft); }
  tbody tr:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
  .blank { color: var(--text-faint); font-style: italic; }
  tfoot td { font-weight: 600; color: var(--text); border-bottom: none; border-top: 1px solid var(--border-strong); }
</style>
