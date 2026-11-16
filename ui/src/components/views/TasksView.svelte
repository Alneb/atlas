<script lang="ts">
  import { localDay } from "../../lib/local-day";
  import { showDate } from "../../lib/dates";
  // The `task-list` view: tasks with what their line says — priority, due date, recurrence, tags —
  // under their group's heading when the block groups them. The core has already filtered, sorted
  // and grouped (crates/atlas-core/src/tasks.rs); this only draws, and ticks. A deadlines list (`from: deadlines`) also
  // has notes and calendar events (`props.from`): no box to tick, a mark of what they are instead.
  import type { ViewRow } from "../../lib/gen/ViewRow";
  import { openPath } from "../../lib/dock";
  import Icon from "../Icon.svelte";
  import type { IconName } from "../../lib/panes";
  // `deadlines`: the list is `from: deadlines` (Home's box, the Deadlines page): its groups tinted by urgency, each row
  // saying where it comes from, and an empty list saying what would show
  let { rows, ontick, deadlines = false }: { rows: ViewRow[]; ontick: (r: ViewRow) => void; deadlines?: boolean } = $props();
  /** Where a row comes from, in a word or two: the note's name, or the calendar's. */
  const source = (r: ViewRow) => r.props.from === "event" ? (r.props.calendar_name ?? "calendar") : (r.path ?? "").split("/").pop()?.replace(/\.md$/i, "") ?? "";

  // rows arrive group by group: a heading wherever the group changes
  const withHeads = $derived(rows.map((r, i) => ({ r, head: r.props.group !== undefined && r.props.group !== rows[i - 1]?.props.group ? r.props.group : null })));
  const count = (g: string) => rows.filter((r) => r.props.group === g).length;

  // today as of now, not as of when the pane opened: a Home left open overnight moves on
  let today = $state(localDay());
  $effect(() => { const t = setInterval(() => { const d = localDay(); if (d !== today) today = d; }, 60_000); return () => clearInterval(t); });
  const DAY = 86_400_000;
  /** A date as one reads it in a list: Today, Tomorrow, a weekday within the week, else the date. */
  function when(date: string): { text: string; late: boolean; soon: boolean } {
    const days = Math.round((Date.parse(date) - Date.parse(today)) / DAY);
    const text = days === 0 ? "Today" : days === 1 ? "Tomorrow" : days === -1 ? "Yesterday"
      : days < -1 ? `${-days} days ago` : showDate(date);
    return { text, late: days < 0, soon: days >= 0 && days <= 1 };
  }
  const PRIORITY: Record<string, string> = { highest: "‼", high: "!", medium: "·", low: "↓", lowest: "⇊" };
  /** A row that is not a task line (a note's `due:`, a calendar's event): nothing to tick. */
  const other = (r: ViewRow) => r.props.from === "note" || r.props.from === "event" || !r.line;
  const KIND: Record<string, { icon: IconName; label: string }> = { note: { icon: "file-text", label: "A note due that day" }, event: { icon: "calendar", label: "An event in a deadline calendar" } };
  const dateTitle = (r: ViewRow) => r.props.from === "event" ? `${r.props.calendar_name ?? "calendar"}: ${r.props.start ?? r.date}`
    : r.props.due ? `due ${r.props.due}` : r.props.scheduled ? `scheduled ${r.props.scheduled}` : `starts ${r.props.start}`;
</script>

{#if !rows.length}
  {#if deadlines}<p class="empty calm"><Icon name="check" size={14} /><span><strong>Nothing due.</strong> Overdue tasks, today's and this week's (📅), notes with a <code>due:</code> and events of deadline calendars show here.</span></p>
  {:else}<p class="empty">No tasks match.</p>{/if}
{/if}
<ul class="tasks" class:deadlines>
  <!-- a recurring event has no path or line and comes once per day: its date keeps each one apart (and the index) -->
  {#each withHeads as { r, head }, i (`${r.path}:${r.line ?? ""}:${r.title}:${r.date ?? ""}:${i}`)}
    {#if head !== null}<li class="head" data-group={head}><span>{head}</span><span class="n">{count(head)}</span></li>{/if}
    <li class="task" class:done={r.done} data-priority={r.props.priority ?? "normal"} data-from={r.props.from}>
      {#if other(r)}
        {@const k = KIND[r.props.from ?? "note"] ?? KIND.note}
        <span class="kind" title={k.label} aria-label={k.label}><Icon name={k.icon} size={13} /></span>
      {:else}
        <input type="checkbox" class="atlas-check" checked={r.done ?? false} disabled={r.done ?? false} aria-label="Done: {r.title}" onchange={() => ontick(r)} />
      {/if}
      <!-- always there, so titles line up whether or not a task has a priority -->
      <span class="pri" title={r.props.priority ? `Priority: ${r.props.priority}` : undefined}>{PRIORITY[r.props.priority ?? ""] ?? ""}</span>
      <span class="main">
        <button class="title" data-path={r.path} data-line={r.line} onclick={() => r.path && openPath(r.path, r.line ?? undefined)} title="{r.path}:{r.line}">{r.title}</button>
        {#if deadlines && source(r) && source(r) !== r.title}<span class="src">{source(r)}</span>{/if}
      </span>
      {#if r.props.recurrence}<span class="rec" title="Repeats {r.props.recurrence}: ticking it makes the next one">↻ {r.props.recurrence.replace(/^every\s+/, "")}</span>{/if}
      {#if r.date && !r.done}
        {@const w = when(r.date)}
        <span class="date" class:late={w.late} class:soon={w.soon} title={dateTitle(r)}>{w.text}</span>
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
  .main { flex: 1; min-width: 0; display: flex; flex-direction: column; }
  .src { color: var(--text-faint); font-size: .78em; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  /* deadlines: each group a tinted band, the most pressing loudest */
  .deadlines .head { border-left: 3px solid var(--border); padding-left: 8px; margin-top: 12px; }
  .deadlines .head[data-group="Overdue"] { border-color: var(--red); color: var(--red); }
  .deadlines .head[data-group="Today"] { border-color: var(--accent); color: var(--accent); }
  .deadlines .head[data-group="This week"] { border-color: var(--yellow); }
  .deadlines .task { padding-block: 4px; align-items: center; }
  .deadlines .task .date { align-self: center; }
  .empty.calm { display: flex; gap: 8px; align-items: baseline; line-height: 1.45; }
  .empty.calm strong { color: var(--text-muted); font-weight: 600; }
  .empty code { font-size: .9em; }
  .title { text-align: left; color: var(--text); flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .title:hover { color: var(--accent); }
  .done .title { text-decoration: line-through; color: var(--text-faint); }
  /* priority: a mark and a tint, strongest for the two that should catch the eye */
  /* a note or an event in a deadlines list: where a task's box would be, the same width, so titles line up */
  .kind { display: inline-flex; justify-content: center; width: 16px; flex: none; color: var(--text-faint); align-self: center; }
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
</style>
