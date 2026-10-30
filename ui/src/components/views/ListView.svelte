<script lang="ts">
  // The `list` (and `table`) view: one row per item — a task's checkbox ticks it in its note.
  import type { ViewRow } from "../../lib/gen/ViewRow";
  import { openPath } from "../../lib/dock";
  import { shownPath } from "../../lib/paths";
  let { rows, ontick, table = false }: { rows: ViewRow[]; ontick: (r: ViewRow) => void; table?: boolean } = $props();
</script>

{#if !rows.length}<p class="empty">Nothing here yet.</p>{/if}
<ul class="list" class:table>
  {#each rows as r (`${r.path}:${r.line ?? ""}:${r.title}`)}
    <li class:done={r.done}>
      {#if r.done !== null}<input type="checkbox" class="atlas-check" checked={r.done} disabled={r.done} aria-label="Done: {r.title}" onchange={() => ontick(r)} />{/if}
      <button class="title" onclick={() => r.path && openPath(r.path, r.line ?? undefined)} title={r.path ?? ""}>{r.title}</button>
      {#if r.props.note}<span class="of" title="The note this task is in">{r.props.note}</span>{/if}
      {#if r.date}<span class="date">{r.date}</span>{/if}
      {#if table && r.path}<span class="path">{shownPath(r.path)}</span>{/if}
    </li>
  {/each}
</ul>

<style>
  .list { list-style: none; margin: 0; padding: 4px 0; }
  li { display: flex; align-items: baseline; gap: 8px; padding: 2px 8px; border-radius: 4px; }
  li:hover { background: var(--bg-hover); }
  li.done .title { text-decoration: line-through; color: var(--text-faint); }
  .title { text-align: left; color: var(--text); flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .title:hover { color: var(--accent); }
  .of { color: var(--text-muted); font-size: .88em; white-space: nowrap; max-width: 40%; overflow: hidden; text-overflow: ellipsis; }
  .date, .path { color: var(--text-faint); font-size: .88em; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .empty { color: var(--text-faint); padding: 6px 10px; margin: 0; }
</style>
