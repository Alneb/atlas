<script lang="ts">
  // One Bases value as Obsidian draws it: a list as chips, a link as a link, a checkbox as a checkbox, a date in the
  // reader's words, a number aligned. Read-only; the cell editor (CellEditor.svelte) takes over when a cell is edited.
  import type { BaseCell } from "../../lib/gen/BaseCell";
  import { openPath } from "../../lib/dock";
  import Self from "./CellValue.svelte";

  let { cell }: { cell: BaseCell } = $props();

  const num = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(Math.abs(n) < 1 ? 3 : 2));
  const ISO = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/;
  /** A date as a row reads it best: the time today, the day this year, the day and year before. */
  function shortDate(v: string): string | null {
    const m = ISO.exec(v.trim());
    if (!m || v.trim().length > 30) return null;
    const d = new Date(+m[1], +m[2] - 1, +m[3], +(m[4] ?? 0), +(m[5] ?? 0));
    const now = new Date();
    if (m[4] && d.toDateString() === now.toDateString()) return `${m[4]}:${m[5]}`;
    return d.toLocaleDateString(undefined, d.getFullYear() === now.getFullYear() ? { day: "numeric", month: "short" } : { day: "numeric", month: "short", year: "numeric" });
  }
</script>

{#if cell.t === "link"}
  {#if cell.path}<button type="button" class="link" onclick={(e) => { e.stopPropagation(); openPath(cell.path!); }}>{cell.text}</button>{:else}<span class="link missing">{cell.text}</span>{/if}
{:else if cell.t === "list"}
  <span class="chips">{#each cell.items as it, i (i)}<span class="chip" class:linkchip={it.t === "link"}><Self cell={it} /></span>{/each}</span>
{:else if cell.t === "bool"}
  <span class="check" class:on={cell.value} role="img" aria-label={cell.value ? "checked" : "not checked"}>{#if cell.value}<svg viewBox="0 0 16 16" width="11" height="11" aria-hidden="true"><path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" /></svg>{/if}</span>
{:else if cell.t === "num"}
  <span class="num">{num(cell.value)}</span>
{:else if cell.t === "date" || (cell.t === "text" && shortDate(cell.value))}
  {@const raw = cell.t === "date" ? cell.text : cell.value}
  <span class="date" title={raw}>{shortDate(raw) ?? raw}</span>
{:else if cell.t === "text"}
  {cell.value}
{/if}

<style>
  .link { color: var(--link, var(--accent)); padding: 0; font: inherit; background: none; border: 0; cursor: pointer; text-align: left; max-width: 100%; overflow: hidden; text-overflow: ellipsis; }
  .link:hover { text-decoration: underline; }
  .link.missing { color: var(--text-faint); cursor: default; }
  .chips { display: inline-flex; gap: 4px; flex-wrap: nowrap; max-width: 100%; overflow: hidden; vertical-align: middle; }
  .chip { flex: none; max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; padding: 0 8px; line-height: 20px; border-radius: 999px;
    background: var(--accent-soft); color: var(--text); font-size: .92em; }
  .check { display: inline-grid; place-items: center; width: 15px; height: 15px; border-radius: 4px; border: 1.5px solid var(--border-strong); vertical-align: middle; color: var(--accent-fg); }
  .check.on { background: var(--accent); border-color: var(--accent); }
  .num { font-variant-numeric: tabular-nums; }
  .date { font-variant-numeric: tabular-nums; }
</style>
