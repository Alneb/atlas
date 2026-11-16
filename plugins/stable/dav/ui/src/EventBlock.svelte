<script lang="ts">
  // The `calendar.event` block of an event's note (DESIGN-calendar-tasks-nudges §2.2): the live event from the engine's
  // cache — when, where, the calendar, who comes, Join — named by the note's own `uid` / `recurrence_id`; the note's
  // properties are only a snapshot. A click on the day opens it in the Calendar pane.
  import { onMount } from "svelte";
  import { call, hourCycle, meetingLink, span, type EventInfo, type PluginApi } from "./api";
  import Icon from "./Icon.svelte";

  let { atlas, props, onopen }: { atlas: PluginApi; props: () => Promise<Record<string, unknown>>; onopen: (date: string) => void } = $props();
  let info = $state<EventInfo | null>(null);
  let error = $state("");
  let start = $state("");
  const h12 = $derived(hourCycle(atlas.plugin.settings.time_format));
  const e = $derived(info?.event ?? null);
  const join = $derived(e ? meetingLink(e) : null);

  async function load() {
    try {
      const p = await props();
      const text = (k: string) => (p[k] === undefined || p[k] === null ? "" : String(p[k]));
      if (!text("uid")) { error = "This note names no event (its uid property is empty)."; return; }
      start = text("start");
      info = await call<EventInfo>(atlas, "event", { uid: text("uid"), rid: text("recurrence_id") || undefined, start }, 30);
      error = "";
    } catch (x) { error = (x as Error).message; }
  }
  onMount(() => {
    void load();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const off = atlas.helper.on("changed", () => { clearTimeout(timer); timer = setTimeout(() => void load(), 300); });
    return () => { clearTimeout(timer); off(); };
  });
  const cancelled = $derived(e?.status === "CANCELLED" || (!e && !!info?.note?.cancelled));
</script>

<div class="evb" style:--c={e?.color ?? "var(--accent)"}>
  {#if error}
    <div class="atlas-notice error">{error}</div>
  {:else if !info}
    <div class="atlas-empty">Reading the calendar…</div>
  {:else if !e}
    <div class="atlas-empty">{cancelled ? "This event was deleted from its calendar; the note is kept." : "This event is not in the calendar's cache (not synced yet, or its calendar is hidden)."}</div>
  {:else}
    <span class="sq" aria-hidden="true"></span>
    <div class="main">
      <button class="when" class:cancel={cancelled} onclick={() => onopen((e.start ?? start).slice(0, 10))} title="Open this day in the calendar">{span(e, h12)}</button>
      {#if cancelled}<span class="warn">Cancelled</span>{/if}
      {#if e.location}<span class="line"><Icon name="pin" size={13} />{e.location}</span>{/if}
      {#if e.attendees?.length}<span class="line"><Icon name="people" size={13} />{e.attendees.slice(0, 4).map((a) => a.name ?? a.email).join(", ")}{e.attendees.length > 4 ? ` and ${e.attendees.length - 4} more` : ""}</span>{/if}
      <span class="line faint"><Icon name="calendar" size={13} />{e.calendar_name}</span>
    </div>
    {#if join}<a class="atlas-btn join" href={join} target="_blank" rel="noreferrer" data-outside><Icon name="video" size={14} />Join</a>{/if}
  {/if}
</div>

<style>
  .evb { display: flex; gap: 10px; align-items: flex-start; container-type: inline-size; min-width: 0; }
  .sq { width: 12px; height: 12px; border-radius: 3px; background: var(--c); flex: none; margin-top: 4px; }
  .main { display: grid; gap: 2px; flex: 1; min-width: 0; }
  .when { all: unset; cursor: pointer; font-weight: 600; color: var(--heading); overflow-wrap: anywhere; border-radius: var(--radius-sm); }
  .when:hover { text-decoration: underline; }
  .when:focus-visible { outline: 2px solid var(--accent); }
  .cancel { text-decoration: line-through; }
  .warn { color: var(--red); font-size: 0.88em; }
  .line { display: flex; gap: 6px; align-items: center; color: var(--text); font-size: 0.9em; min-width: 0; overflow-wrap: anywhere; }
  .line :global(.icon) { color: var(--text-faint); flex: none; }
  .faint { color: var(--text-muted); }
  .join { display: inline-flex; align-items: center; gap: 6px; text-decoration: none; flex: none; }
</style>
