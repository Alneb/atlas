<script lang="ts">
  // The full editor (`e`, or More options): title, all-day, start and end in local time, repeat, place, description,
  // calendar; who is invited is shown, not edited. Saving a repeating event asks which occurrences it is for.
  import { onMount } from "svelte";
  import { addDays, repeats, ruleText, type Ev } from "./api";
  import type { Cal } from "./store.svelte";
  import CalendarPicker from "./CalendarPicker.svelte";
  import Icon from "./Icon.svelte";

  let { cal, e = null, start, end, allDay, title = "", calendar = "", onclose }: {
    cal: Cal; e?: Ev | null; start: string; end: string; allDay: boolean; title?: string; calendar?: string; onclose: () => void;
  } = $props();

  // the form starts from the event (or the new slot) once; it is the user's after that
  // svelte-ignore state_referenced_locally
  let f = $state({ summary: e?.summary ?? title, all_day: allDay, sday: start.slice(0, 10), stime: start.slice(11, 16) || "09:00", eday: end.slice(0, 10), etime: end.slice(11, 16) || "10:00", location: e?.location ?? "", description: e?.description ?? "", rrule: e?.rrule ?? "", calendar: e?.calendar ?? (calendar || cal.newCalendar()) ?? "" });
  let first: HTMLInputElement | undefined = $state();
  let error = $state("");
  onMount(() => first?.focus());

  const choices = $derived.by(() => {
    const list = repeats(new Date(`${f.sday}T12:00`));
    if (f.rrule && !list.some((c) => c.value === f.rrule)) list.push({ value: f.rrule, label: ruleText(f.rrule) || f.rrule });
    return list;
  });
  const cals = $derived(cal.writable());

  function values() {
    const start = f.all_day ? f.sday : `${f.sday}T${f.stime}`;
    // an all-day event's last day is inclusive here; the engine wants the day after
    const end = f.all_day ? (() => { const d = addDays(new Date(`${f.eday}T12:00`), 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; })() : `${f.eday}T${f.etime}`;
    return { start, end };
  }

  async function save() {
    const { start, end } = values();
    if (end <= start && !(f.all_day && end > start)) { error = "The end is before the start."; return; }
    const change = { summary: f.summary, start, end, all_day: f.all_day, location: f.location, description: f.description, rrule: f.rrule };
    if (!e) {
      onclose();
      await cal.create({ ...change, calendar: f.calendar || undefined });
      return;
    }
    const scope = await cal.askScope(e, "Change");
    if (!scope) return;
    onclose();
    await cal.change(e, { ...change, move_to: f.calendar && f.calendar !== e.calendar ? f.calendar : undefined, from_start: e.start }, scope, "Saved");
  }

  function key(ev: KeyboardEvent) {
    if (ev.key === "Escape") { ev.stopPropagation(); onclose(); }
    else if (ev.key === "Enter" && (ev.ctrlKey || ev.metaKey)) { ev.preventDefault(); void save(); }
  }
  // a typed hour on the 24-hour clock (the webview's own time field shows its locale's AM/PM): "9", "930", "9:30",
  // "21h", "9pm" → "09:00"…; anything else keeps the last good value
  function hm(t: string, fallback: string): string {
    const m = t.trim().toLowerCase().match(/^(\d{1,2})(?:[:h.]?(\d{2}))?\s*(am|pm|h)?$/);
    if (!m) return fallback;
    let h = Number(m[1]);
    const min = Number(m[2] ?? 0);
    if (m[3] === "pm" && h < 12) h += 12;
    if (m[3] === "am" && h === 12) h = 0;
    if (h > 23 || min > 59) return fallback;
    return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
  }
  // the end follows the start when the start moves past it
  function startMoved() {
    if (`${f.eday}T${f.etime}` <= `${f.sday}T${f.stime}`) { f.eday = f.sday; if (!f.all_day) { const [h, m] = f.stime.split(":").map(Number); f.etime = `${String(Math.min(23, h + 1)).padStart(2, "0")}:${String(m).padStart(2, "0")}`; } }
  }
</script>

<div class="scrim" role="presentation" onclick={onclose}></div>
<div class="ed" role="dialog" aria-label={e ? "Edit event" : "New event"} aria-modal="true" tabindex="-1" onkeydown={key}>
  <header>
    <h2>{e ? "Edit event" : "New event"}</h2>
    <button class="tool" onclick={onclose} aria-label="Close"><Icon name="x" /></button>
  </header>
  <input bind:this={first} class="title" bind:value={f.summary} placeholder="Add a title" aria-label="Title" />
  <div class="row when">
    <Icon name="clock" />
    <div class="times">
      <input type="date" bind:value={f.sday} onchange={startMoved} aria-label="Starts on" />
      {#if !f.all_day}<input class="hm" bind:value={f.stime} onchange={() => { f.stime = hm(f.stime, "09:00"); startMoved(); }} inputmode="numeric" placeholder="HH:MM" aria-label="Starts at" />{/if}
      <span class="to">to</span>
      {#if !f.all_day}<input class="hm" bind:value={f.etime} onchange={() => (f.etime = hm(f.etime, "10:00"))} inputmode="numeric" placeholder="HH:MM" aria-label="Ends at" />{/if}
      <input type="date" bind:value={f.eday} aria-label="Ends on" />
      <label class="check"><input type="checkbox" bind:checked={f.all_day} /> All day</label>
    </div>
  </div>
  <div class="row"><Icon name="repeat" />
    <select bind:value={f.rrule} aria-label="Repeat">{#each choices as c (c.value)}<option value={c.value}>{c.label}</option>{/each}</select>
  </div>
  <div class="row"><Icon name="pin" /><input bind:value={f.location} placeholder="Add a place" aria-label="Place" /></div>
  <div class="row"><Icon name="calendar" />
    <CalendarPicker {cal} bind:value={f.calendar} disabled={!!e && e.recurring} />
  </div>
  {#if e?.attendees?.length}
    <div class="row"><Icon name="people" /><span class="guests">{e.attendees.map((a) => a.name ?? a.email).join(", ")}</span></div>
  {/if}
  <div class="row top"><Icon name="text" /><textarea bind:value={f.description} rows="5" placeholder="Add a description" aria-label="Description"></textarea></div>
  <p class="zone">Times in your zone: {Intl.DateTimeFormat().resolvedOptions().timeZone}{e?.tzid && e.tzid !== Intl.DateTimeFormat().resolvedOptions().timeZone ? ` · written in ${e.tzid}` : ""}</p>
  {#if error}<div class="atlas-notice error">{error}</div>{/if}
  <footer>
    <span class="hint">Ctrl+Enter saves</span>
    <button class="atlas-btn" onclick={onclose}>Cancel</button>
    <button class="atlas-btn primary" onclick={save} disabled={!cals.length}>Save</button>
  </footer>
</div>

<style>
  .scrim { position: absolute; inset: 0; background: color-mix(in srgb, var(--bg) 55%, transparent); z-index: 70; }
  .ed { position: absolute; z-index: 71; left: 50%; top: 50%; transform: translate(-50%, -50%); width: min(620px, calc(100% - 24px)); max-height: calc(100% - 24px); overflow: auto; box-sizing: border-box; background: var(--bg-elev); border: 1px solid var(--border-strong); border-radius: var(--radius); box-shadow: var(--shadow-md, 0 10px 30px rgba(0,0,0,.3)); padding: 12px 18px 16px; display: grid; gap: 12px; }
  header { display: flex; align-items: center; }
  h2 { flex: 1; margin: 0; font-size: 0.85em; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-faint); }
  .tool { all: unset; cursor: pointer; padding: 6px; border-radius: var(--radius-sm); color: var(--text-muted); display: grid; place-items: center; }
  .tool:hover { background: var(--bg-hover); }
  .title { all: unset; font-size: 1.35em; font-weight: 600; color: var(--heading); border-bottom: 2px solid var(--border-strong); padding: 4px 0; }
  .title:focus { border-bottom-color: var(--accent); }
  .title:focus-visible { outline: none; }
  .ed select { appearance: none; -webkit-appearance: none; padding-right: 28px; background-image: linear-gradient(45deg, transparent 50%, var(--text-muted) 50%), linear-gradient(135deg, var(--text-muted) 50%, transparent 50%); background-position: calc(100% - 15px) 50%, calc(100% - 10px) 50%; background-size: 5px 5px; background-repeat: no-repeat; }
  .ed select:disabled { opacity: 0.6; }
  .row { display: flex; gap: 12px; align-items: center; color: var(--text-faint); min-width: 0; }
  .row.top { align-items: flex-start; }
  .times { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
  .to { color: var(--text-muted); }
  input:not(.title):not([type=checkbox]), select, textarea { font: inherit; color: var(--text); background-color: var(--bg); border: 1px solid var(--border-strong); border-radius: var(--radius-sm); padding: 5px 8px; min-width: 0; color-scheme: light dark; }
  .row > input, .row > select, textarea { flex: 1; }
  textarea { resize: vertical; }
  input:focus-visible, select:focus-visible, textarea:focus-visible { outline: 2px solid var(--accent); outline-offset: -1px; }
  .hm { width: 5.5em; font-variant-numeric: tabular-nums; text-align: center; }
  .check { display: flex; gap: 6px; align-items: center; color: var(--text); margin-left: 6px; }
  .guests { color: var(--text); }
  .zone { margin: 0; color: var(--text-faint); font-size: 0.82em; }
  footer { display: flex; gap: 8px; align-items: center; justify-content: flex-end; }
  .hint { flex: 1; color: var(--text-faint); font-size: 0.82em; }
</style>
