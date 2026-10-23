<script lang="ts">
  // The Home card (` ```view ` / `type: dav.upcoming`): today, tomorrow and the rest of the week as a compact agenda,
  // in local time, from the engine's cache; a click opens that day in the Calendar pane, an event from a note the note.
  import { onMount } from "svelte";
  import { addDays, call, evStart, notePath, sameDay, startOfDay, timeText, hourCycle, ymd, type Ev, type PluginApi } from "./api";
  import { onDay } from "./layout";

  let { atlas, options, onopen }: { atlas: PluginApi; options: Record<string, unknown>; onopen: (date: string) => void } = $props();
  let events = $state<Ev[]>([]);
  let error = $state("");
  let loaded = $state(false);
  // svelte-ignore state_referenced_locally
  const days = Math.max(1, Math.min(31, Number(options.days ?? 7) || 7));
  const today = startOfDay(new Date());
  const h12 = $derived(hourCycle(atlas.plugin.settings.time_format));

  async function load() {
    try {
      const r = await call<{ events: Ev[] }>(atlas, "range", { from: ymd(today), to: ymd(addDays(today, days - 1)), notes: atlas.plugin.settings.show_notes !== false }, 30);
      events = r.events;
      error = "";
    } catch (e) { error = (e as Error).message; }
    loaded = true;
  }
  onMount(() => {
    void load();
    void call(atlas, "watch", {}, 30).then(load, () => {});
    const off = atlas.helper.on("changed", () => void load());
    return off;
  });
  const groups = $derived(Array.from({ length: days }, (_, i) => addDays(today, i)).map((d) => ({ d, evs: onDay(events, d).sort((a, b) => Number(!a.all_day) - Number(!b.all_day) || evStart(a).getTime() - evStart(b).getTime()) })).filter((g, i) => i < 2 || g.evs.length));
  const label = (d: Date) => (sameDay(d, today) ? "Today" : sameDay(d, addDays(today, 1)) ? "Tomorrow" : d.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "short" }));
  function open(e: Ev | null, d: Date) {
    const note = e ? notePath(e) : null;
    if (note) atlas.open(note); else onopen(ymd(d));
  }
</script>

<div class="up">
  {#if error}
    <div class="atlas-notice error">{error}<div class="actions"><button class="atlas-btn" onclick={() => atlas.plugin.openSettings()}>Settings…</button></div></div>
  {:else if !loaded}
    <div class="atlas-empty">Reading the calendar…</div>
  {:else}
    {#each groups as g (g.d.getTime())}
      <section>
        <button class="day" onclick={() => open(null, g.d)}>{label(g.d)}</button>
        {#if !g.evs.length}<div class="atlas-empty">Nothing.</div>{/if}
        {#each g.evs.slice(0, 6) as e (e.calendar + e.uid + (e.rid ?? ""))}
          <button class="ev" style:--c={e.color ?? "var(--accent)"} onclick={() => open(e, g.d)} title={e.calendar_name}>
            <span class="bar" aria-hidden="true"></span>
            <span class="t">{e.all_day ? "all day" : timeText(evStart(e), h12)}</span>
            <span class="s">{e.summary || "(no title)"}</span>
          </button>
        {/each}
        {#if g.evs.length > 6}<button class="more" onclick={() => open(null, g.d)}>+{g.evs.length - 6} more</button>{/if}
      </section>
    {/each}
  {/if}
</div>

<style>
  .up { display: grid; gap: 8px; container-type: inline-size; }
  section { display: grid; gap: 1px; }
  .day { all: unset; cursor: pointer; font-size: 0.75em; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-faint); font-weight: 600; padding: 2px 0; }
  .day:hover { color: var(--text); }
  .ev, .more { all: unset; box-sizing: border-box; cursor: pointer; display: flex; align-items: center; gap: 8px; padding: 3px 6px; border-radius: var(--radius-sm); min-width: 0; }
  .ev:hover, .more:hover { background: var(--bg-hover); }
  .ev:focus-visible, .day:focus-visible, .more:focus-visible { outline: 2px solid var(--accent); outline-offset: -1px; }
  .bar { width: 3px; align-self: stretch; border-radius: 2px; background: var(--c); flex: none; }
  .t { width: 4.6em; flex: none; color: var(--text-muted); font-variant-numeric: tabular-nums; font-size: 0.9em; }
  .s { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .more { color: var(--text-muted); font-size: 0.85em; }
</style>
