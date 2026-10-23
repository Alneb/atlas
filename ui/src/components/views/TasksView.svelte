<script lang="ts">
  import { localDay } from "../../lib/local-day";
  // The `task-list` view: tasks with what their line says — priority, due date, recurrence, tags —
  // under their group's heading when the block groups them. The core has already filtered, sorted
  // and grouped (crates/atlas-core/src/tasks.rs); this only draws, and ticks.
  import type { ViewRow } from "../../lib/gen/ViewRow";
  import { openPath } from "../../lib/dock";
  let { rows, ontick }: { rows: ViewRow[]; ontick: (r: ViewRow) => void } = $props();

  // rows arrive group by group: a heading wherever the group changes
  const withHeads = $derived(rows.map((r, i) => ({ r, head: r.props.group !== undefined && r.props.group !== rows[i - 1]?.props.group ? r.props.group : null })));
  const count = (g: string) => rows.filter((r) => r.props.group === g).length;

  const today = localDay();
  const DAY = 86_400_000;
  /** A date as one reads it in a list: Today, Tomorrow, a weekday within the week, else the date. */
  function when(date: string): { text: string; late: boolean; soon: boolean } {
    const days = Math.round((Date.parse(date) - Date.parse(today)) / DAY);
    const text = days === 0 ? "Today" : days === 1 ? "Tomorrow" : days === -1 ? "Yesterday"
      : days < -1 ? `${-days} days ago` : days < 7 ? new Date(date).toLocaleDateString(undefined, { weekday: "long" }) : date;
    return { text, late: days < 0, soon: days >= 0 && days <= 1 };
  }
  const PRIORITY: Record<string, string> = { highest: "‼", high: "!", medium: "·", low: "↓", lowest: "⇊" };
</script>

{#if !rows.length}<p class="empty">No tasks match.</p>{/if}
<ul class="tasks">
  {#each withHeads as { r, head } (`${r.path}:${r.line ?? ""}:${r.title}`)}
    {#if head !== null}<li class="head"><span>{head}</span><span class="n">{count(head)}</span></li>{/if}
    <li class="task" class:done={r.done} data-priority={r.props.priority ?? "normal"}>
      <input type="checkbox" checked={r.done ?? false} disabled={r.done ?? false} aria-label="Done: {r.title}" onchange={() => ontick(r)} />
      <!-- always there, so titles line up whether or not a task has a priority -->
      <span class="pri" title={r.props.priority ? `Priority: ${r.props.priority}` : undefined}>{PRIORITY[r.props.priority ?? ""] ?? ""}</span>
      <button class="title" onclick={() => r.path && openPath(r.path, r.line ?? undefined)} title="{r.path}:{r.line}">{r.title}</button>
      {#if r.props.recurrence}<span class="rec" title="Repeats {r.props.recurrence}: ticking it makes the next one">↻ {r.props.recurrence.replace(/^every\s+/, "")}</span>{/if}
      {#if r.date && !r.done}
        {@const w = when(r.date)}
        <span class="date" class:late={w.late} class:soon={w.soon} title={r.props.due ? `due ${r.props.due}` : r.props.scheduled ? `scheduled ${r.props.scheduled}` : `starts ${r.props.start}`}>{w.text}</span>
      {:else if r.props.completed}<span class="date" title="done on">{r.props.completed}</span>{/if}
    </li>
  {/each}
</ul>

<style>
  .tasks { list-style: none; margin: 0; padding: 4px 0; }
  .task { display: flex; align-items: baseline; gap: 8px; padding: 2px 8px; border-radius: 4px; }
  .task:hover { background: var(--bg-hover); }
  .head { display: flex; align-items: baseline; gap: 8px; margin-top: 10px; padding: 2px 8px; color: var(--text-muted); font-size: .8em; font-weight: 600; text-transform: uppercase; letter-spacing: .05em; }
  .head:first-child { margin-top: 0; }
  .head .n { color: var(--text-faint); font-weight: 400; }
  .title { text-align: left; color: var(--text); flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .title:hover { color: var(--accent); }
  .done .title { text-decoration: line-through; color: var(--text-faint); }
  /* priority: a mark and a tint, strongest for the two that should catch the eye */
  .pri { width: 1em; text-align: center; font-weight: 700; color: var(--text-faint); }
  [data-priority="highest"] .pri { color: var(--red); }
  [data-priority="high"] .pri { color: var(--orange, var(--yellow)); }
  [data-priority="highest"] .title, [data-priority="high"] .title { font-weight: 550; }
  [data-priority="low"] .title, [data-priority="lowest"] .title { color: var(--text-muted); }
  .rec { color: var(--text-faint); font-size: .85em; white-space: nowrap; }
  .date { color: var(--text-faint); font-size: .88em; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .date.soon { color: var(--accent); }
  .date.late { color: var(--red); }
  .empty { color: var(--text-faint); padding: 6px 10px; margin: 0; }
  input { accent-color: var(--accent); }
</style>
