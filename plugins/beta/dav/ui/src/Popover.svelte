<script lang="ts">
  // The card on a click (Google's): an event's when in local time, where, which calendar, the note it came from,
  // who comes — with Edit (e), Delete (Del) and Open note. Or, on empty space, a new event's title box: Enter saves,
  // "More options" opens the editor.
  import { onMount } from "svelte";
  import { notePath, ruleText, span, timeText, type Ev } from "./api";
  import type { Cal, Draft } from "./store.svelte";
  import CalendarPicker from "./CalendarPicker.svelte";
  import Icon from "./Icon.svelte";

  let { cal, e = null, draft = null, at, box, onedit, onmore, onclose }: {
    cal: Cal; e?: Ev | null; draft?: Draft | null; at: DOMRect; box: DOMRect;
    onedit: () => void; onmore: (title: string, calendar: string) => void; onclose: () => void;
  } = $props();

  let card: HTMLDivElement | undefined = $state();
  let title = $state("");
  // svelte-ignore state_referenced_locally
  let target = $state(cal.newCalendar() ?? "");
  let input: HTMLInputElement | undefined = $state();
  let pos = $state({ left: 0, top: 0 });

  // beside the thing clicked, inside the pane, flipped when there is no room
  function place() {
    const w = card?.offsetWidth ?? 340, h = card?.offsetHeight ?? 200;
    let left = at.right - box.left + 8;
    if (left + w > box.width - 8) left = at.left - box.left - w - 8;
    if (left < 8) left = Math.max(8, Math.min(box.width - w - 8, at.left - box.left));
    let top = at.top - box.top;
    if (top + h > box.height - 8) top = Math.max(8, box.height - h - 8);
    pos = { left, top: Math.max(8, top) };
  }
  onMount(() => { place(); input?.focus(); });

  async function save() {
    if (!draft) return;
    const pad = (n: number) => String(n).padStart(2, "0");
    const w = (x: Date) => `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}T${pad(x.getHours())}:${pad(x.getMinutes())}`;
    const d = (x: Date) => w(x).slice(0, 10);
    onclose();
    await cal.create({ summary: title.trim() || "(no title)", start: draft.all_day ? d(draft.start) : w(draft.start), end: draft.all_day ? d(draft.end) : w(draft.end), all_day: draft.all_day, calendar: target || undefined });
  }
  const note = $derived(e ? notePath(e) : null);
  const draftWhen = $derived(draft ? (draft.all_day ? `${draft.start.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })} · all day` : `${draft.start.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })} · ${timeText(draft.start, cal.h12)} – ${timeText(draft.end, cal.h12)}`) : "");
</script>

<div class="pop" bind:this={card} style:left="{pos.left}px" style:top="{pos.top}px" role="dialog" aria-label={e ? e.summary : "New event"}>
  {#if e}
    <div class="bar">
      {#if e.writable}<button class="tool" onclick={onedit} title="Edit (e)"><Icon name="pen" size={15} /></button>
        <button class="tool" onclick={() => { onclose(); void cal.remove(e); }} title="Delete (Del)"><Icon name="trash" size={15} /></button>{/if}
      <button class="tool" onclick={onclose} title="Close (Esc)"><Icon name="x" size={15} /></button>
    </div>
    <div class="head">
      <span class="sq" style:--c={e.color ?? cal.colorOf(e.calendar)}></span>
      <div><h2 class:cancel={e.status === "CANCELLED"}>{e.summary || "(no title)"}</h2>
        <p class="when">{span(e, cal.h12)}</p>
        {#if e.recurring}<p class="sub"><Icon name="repeat" size={12} /> {ruleText(e.rrule) || "Repeats"}</p>{/if}
        {#if e.status === "CANCELLED"}<p class="sub warn">Cancelled</p>{/if}
      </div>
    </div>
    {#if e.location}<p class="line"><Icon name="pin" size={14} />{#if /^https?:\/\//.test(e.location)}<a href={e.location} target="_blank" rel="noreferrer">{e.location}</a>{:else}{e.location}{/if}</p>{/if}
    {#if e.organizer || e.attendees?.length}
      <div class="line people"><Icon name="people" size={14} />
        <ul>
          {#if e.organizer}<li>{e.organizer.name ?? e.organizer.email} <span class="faint">organiser</span></li>{/if}
          {#each (e.attendees ?? []).slice(0, 8) as a (a.email)}<li>{a.name ?? a.email} <span class="ps ps-{(a.partstat ?? 'needs-action').toLowerCase()}">{(a.partstat ?? "NEEDS-ACTION").toLowerCase().replace("needs-action", "no answer")}</span></li>{/each}
          {#if (e.attendees?.length ?? 0) > 8}<li class="faint">and {(e.attendees?.length ?? 0) - 8} more</li>{/if}
        </ul>
      </div>
    {/if}
    {#if e.description}<p class="line desc"><Icon name="text" size={14} /><span>{e.description}</span></p>{/if}
    <p class="line faint"><Icon name="calendar" size={14} />{e.calendar_name}{e.writable ? "" : " · read-only"}</p>
    {#if note}<button class="atlas-btn" onclick={() => { cal.atlas.open(note); onclose(); }}><Icon name="note" size={14} />Open the note</button>{/if}
    {#if e.url}<p class="line"><Icon name="link" size={14} /><a href={e.url} target="_blank" rel="noreferrer">{e.url}</a></p>{/if}
  {:else if draft}
    <div class="bar"><button class="tool" onclick={onclose} title="Close (Esc)"><Icon name="x" size={15} /></button></div>
    <input bind:this={input} bind:value={title} class="title" placeholder="Add a title" aria-label="Title"
      onkeydown={(ev) => { if (ev.key === "Enter") { ev.preventDefault(); void save(); } else if (ev.key === "Escape") { ev.stopPropagation(); onclose(); } }} />
    <p class="when">{draftWhen}</p>
    <div class="line faint"><Icon name="calendar" size={14} />{#if target}<CalendarPicker {cal} bind:value={target} />{:else}No calendar to write to{/if}</div>
    <div class="acts">
      <button class="atlas-btn" onclick={() => onmore(title, target)}>More options</button>
      <button class="atlas-btn primary" onclick={save} disabled={!target}>Save</button>
    </div>
  {/if}
</div>

<style>
  .pop { position: absolute; z-index: 50; width: min(360px, calc(100% - 16px)); box-sizing: border-box; background: var(--bg-elev); border: 1px solid var(--border-strong); border-radius: var(--radius); box-shadow: var(--shadow-md, 0 10px 30px rgba(0,0,0,.3)); padding: 8px 14px 14px; display: grid; gap: 8px; animation: in 120ms var(--ease); }
  @keyframes in { from { opacity: 0; transform: translateY(4px); } }
  @media (prefers-reduced-motion: reduce) { .pop { animation: none; } }
  .bar { display: flex; justify-content: flex-end; gap: 2px; margin: 0 -8px -4px 0; }
  .tool { all: unset; cursor: pointer; padding: 6px; border-radius: var(--radius-sm); color: var(--text-muted); display: grid; place-items: center; min-width: 24px; min-height: 24px; box-sizing: border-box; }
  .tool:hover { background: var(--bg-hover); color: var(--text); }
  .tool:focus-visible { outline: 2px solid var(--accent); }
  .head { display: flex; gap: 12px; align-items: flex-start; }
  .sq { width: 14px; height: 14px; border-radius: 4px; background: var(--c); flex: none; margin-top: 5px; }
  h2 { margin: 0; font-size: 1.15em; font-weight: 600; color: var(--heading); overflow-wrap: anywhere; }
  .cancel { text-decoration: line-through; }
  .when { margin: 2px 0 0; color: var(--text-muted); font-size: 0.92em; }
  .sub { margin: 2px 0 0; color: var(--text-faint); font-size: 0.85em; display: flex; align-items: center; gap: 4px; }
  .warn { color: var(--red); }
  .line { margin: 0; display: flex; gap: 10px; align-items: flex-start; color: var(--text); font-size: 0.9em; min-width: 0; overflow-wrap: anywhere; }
  .line :global(.icon) { margin-top: 2px; color: var(--text-faint); }
  .desc span { white-space: pre-wrap; max-height: 9em; overflow: auto; }
  .people ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 2px; }
  .faint { color: var(--text-faint); }
  .ps { font-size: 0.8em; color: var(--text-faint); }
  .ps-accepted { color: var(--green); }
  .ps-declined { color: var(--red); }
  .ps-tentative { color: var(--yellow); }
  a { color: var(--accent); }
  .atlas-btn { display: inline-flex; align-items: center; gap: 6px; justify-self: start; }
  .title { all: unset; font-size: 1.15em; font-weight: 600; color: var(--heading); border-bottom: 2px solid var(--accent); padding: 4px 0; }
  .title::placeholder { color: var(--text-faint); font-weight: 400; }
  .acts { display: flex; justify-content: flex-end; gap: 8px; }
</style>
