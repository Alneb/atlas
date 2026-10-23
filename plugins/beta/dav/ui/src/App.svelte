<script lang="ts">
  // The Calendar pane (docs/design/DESIGN-calendar.md): a toolbar (today, ← →, the range, the views, search, quick
  // add), the side panel (mini month, calendars), and the view — day, week, work week, month, agenda, year. Its own
  // width decides the shape (container queries): the side panel folds away under 900 px, and under 700 px one
  // column shows (the day or the agenda). Every command has a key (keys.ts); Ctrl+K lists them.
  import { onMount } from "svelte";
  import Sidebar from "./Sidebar.svelte";
  import TimeGrid from "./TimeGrid.svelte";
  import MonthView from "./MonthView.svelte";
  import AgendaView from "./AgendaView.svelte";
  import YearView from "./YearView.svelte";
  import Popover from "./Popover.svelte";
  import Editor from "./Editor.svelte";
  import Toasts from "./Toasts.svelte";
  import Shortcuts from "./Shortcuts.svelte";
  import Icon from "./Icon.svelte";
  import CalendarPicker from "./CalendarPicker.svelte";
  import { Cal, type Draft, type View } from "./store.svelte";
  import { BY_KEY, COMMANDS, keyOf, shown, type Ui } from "./keys";
  import { addDays, call, startOfDay, timeText, wall, ymd, type Ev, type PluginApi, type Quick } from "./api";

  let { atlas }: { atlas: PluginApi } = $props();
  // svelte-ignore state_referenced_locally
  const cal = new Cal(atlas);

  let width = $state(1200);
  let root: HTMLDivElement | undefined = $state();
  let sideOpen = $state(true);
  let help = $state(false);
  let searchBox: HTMLInputElement | undefined = $state();
  let searchText = $state("");
  let quickOpen = $state(false);
  let quickText = $state("");
  let quickBox: HTMLInputElement | undefined = $state();
  let quickSeen = $state<Quick | null>(null);
  let quickCal = $state("");
  let pop = $state<{ e?: Ev; draft?: Draft; at: DOMRect } | null>(null);
  let editor = $state<{ e?: Ev; start: string; end: string; allDay: boolean; title?: string; calendar?: string } | null>(null);

  const narrow = $derived(width < 700);
  // under this the view buttons are a dropdown, so the range's title keeps its room
  const sideShown = $derived(!narrow && width >= 900 ? sideOpen : false);
  const view = $derived(cal.shown());
  $effect(() => { if (cal.narrow !== narrow) { cal.narrow = narrow; void cal.load(); } });

  const VIEWS: [View, string][] = [["day", "Day"], ["week", "Week"], ["workweek", "Work week"], ["month", "Month"], ["agenda", "Agenda"], ["year", "Year"]];
  const selected = $derived(pop?.e ?? null);
  const box = () => root?.getBoundingClientRect() ?? new DOMRect(0, 0, width, 800);

  // ----- what the commands need

  function select(e: Ev, at: DOMRect) { pop = { e, at }; editor = null; }
  function create(start: Date, end: Date, allDay: boolean, at: DOMRect) {
    if (!cal.newCalendar()) { cal.toast(cal.configured ? "No calendar of your accounts takes new events (all read-only?)" : "Add a calendar account in Settings first", "error"); return; }
    pop = { draft: { start, end, all_day: allDay }, at };
  }
  function newEvent() {
    const base = new Date(cal.cursor);
    const now = new Date();
    const s = new Date(base.getFullYear(), base.getMonth(), base.getDate(), now.getHours() + 1, 0);
    editor = { start: wall(s), end: wall(new Date(s.getTime() + 3600_000)), allDay: false };
    pop = null;
  }
  function edit(e = pop?.e) {
    if (!e) return;
    if (!e.writable) { cal.toast(`${e.calendar_name || "This calendar"} is read-only`, "error"); return; }
    const f = Cal.fields(e);
    editor = { e, start: f.start, end: f.end, allDay: e.all_day };
    pop = null;
  }
  function more(title: string, calendar: string) {
    const d = pop?.draft;
    if (!d) return;
    editor = d.all_day ? { start: ymd(d.start), end: ymd(addDays(d.end, -1)), allDay: true, title, calendar } : { start: wall(d.start), end: wall(d.end), allDay: false, title, calendar };
    pop = null;
  }
  function back() {
    if (help) { help = false; return; }
    if (editor) { editor = null; return; }
    if (pop) { pop = null; return; }
    if (quickOpen) { quickOpen = false; return; }
    if (cal.results) { searchText = ""; void cal.search(""); }
  }
  function goto() {
    atlas.pick({
      placeholder: "Go to a date… (2026-12-01, 15 nov, next monday)", tag: "Calendar",
      items: [{ value: ymd(new Date()), title: "Today" }, { value: ymd(addDays(new Date(), 7)), title: "In a week" }],
      typed: (t) => `Go to “${t}”`,
      onpick: async (v, isNew) => {
        if (!isNew) { cal.go(new Date(`${v}T12:00`)); return; }
        try { const q = await call<Quick>(atlas, "quick", { text: v }); cal.go(new Date(`${q.start.slice(0, 10)}T12:00`)); }
        catch (e) { cal.toast((e as Error).message, "error"); }
      },
    });
  }
  function palette() {
    atlas.pick({
      placeholder: "Do what? (every command of the Calendar pane)", tag: "Calendar",
      items: COMMANDS.filter((c) => c.id !== "palette").map((c) => ({ value: c.id, title: c.title, detail: shown(c.keys).join("  ·  ") || undefined, section: c.group })),
      onpick: (id) => COMMANDS.find((c) => c.id === id)?.run(cal, ui),
    });
  }
  function openQuick() { quickOpen = true; quickCal = cal.newCalendar() ?? ""; pop = null; setTimeout(() => quickBox?.focus(), 0); }

  const ui: Ui = {
    create: newEvent, quick: openQuick, edit: () => edit(), remove: () => { const e = pop?.e; if (e?.writable) { pop = null; void cal.remove(e); } },
    focusSearch: () => { searchBox?.focus(); searchBox?.select(); }, help: () => (help = !help), palette, goto, back,
    sidebar: () => (sideOpen = !sideOpen),
  };

  // ----- keys: single keys, never while typing, only for this pane

  function key(e: KeyboardEvent) {
    const t = e.target as HTMLElement;
    if (t.closest("input, textarea, select, [contenteditable=true]")) return;
    // ours: focus in the pane, on the page, or on the dock group holding the pane (where a click on bare space leaves it)
    if (!root || !(root.contains(t) || t === document.body || (t.classList.contains("dv-content-container") && t.contains(root)))) return;
    if (["shift", "control", "alt", "meta"].includes(e.key.toLowerCase())) return;
    const c = BY_KEY.get(keyOf(e));
    if (!c) return;
    // Delete / Enter / e need a selected event; arrows only move when nothing is selected
    if ((c.id === "delete" || c.id === "edit") && !pop?.e) return;
    e.preventDefault();
    e.stopPropagation();
    void c.run(cal, ui);
  }

  // ----- quick add: what the engine understood, shown as you type

  let quickTimer: ReturnType<typeof setTimeout> | undefined;
  function quickTyped() {
    clearTimeout(quickTimer);
    quickTimer = setTimeout(async () => {
      if (!quickText.trim()) { quickSeen = null; return; }
      try { quickSeen = await call<Quick>(atlas, "quick", { text: quickText }); } catch { quickSeen = null; }
    }, 120);
  }
  async function quickSave() {
    if (!quickText.trim()) return;
    const q = quickSeen ?? (await call<Quick>(atlas, "quick", { text: quickText }));
    quickOpen = false; quickText = ""; quickSeen = null;
    const ok = await cal.create({ summary: q.title || "(no title)", start: q.start, end: q.end, all_day: q.all_day, rrule: q.rrule, location: q.location, calendar: quickCal || undefined });
    if (ok) cal.go(new Date(`${q.start.slice(0, 10)}T12:00`));
  }
  const quickWhen = $derived.by(() => {
    const q = quickSeen;
    if (!q) return "";
    const s = new Date(q.all_day ? `${q.start}T00:00` : q.start), e = new Date(q.all_day ? `${q.end}T00:00` : q.end);
    const day = s.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
    const t = (d: Date) => timeText(d, cal.h12);
    return q.all_day ? `${day} · all day` : `${day} · ${t(s)} – ${t(e)}`;
  });

  // ----- search: the cache answers as you type

  let searchTimer: ReturnType<typeof setTimeout> | undefined;
  function searched() { clearTimeout(searchTimer); searchTimer = setTimeout(() => void cal.search(searchText), 160); }

  onMount(() => {
    root?.focus({ preventScroll: true }); // the keys typed after opening the pane are its own
    void (async () => { await cal.loadSources(); await cal.load(); void cal.sync(false); })();
    const offs = [
      atlas.helper.on("changed", () => { void cal.loadSources(); cal.later(); }),
    ];
    const tick = setInterval(() => (cal.now = new Date()), 30_000);
    // another part of Atlas asks to show a day (the Home card, a command)
    const show = (e: Event) => { const d = (e as CustomEvent<{ date?: string; view?: View; quick?: boolean; create?: boolean }>).detail ?? {}; if (d.date) cal.go(new Date(`${d.date}T12:00`), d.view); else if (d.view) cal.setView(d.view); if (d.quick) openQuick(); if (d.create) newEvent(); };
    window.addEventListener("atlas-calendar:show", show);
    const pending = (window as unknown as { __atlasCalendarShow?: unknown }).__atlasCalendarShow;
    if (pending) { show(new CustomEvent("x", { detail: pending })); (window as unknown as { __atlasCalendarShow?: unknown }).__atlasCalendarShow = undefined; }
    return () => { offs.forEach((o) => o()); clearInterval(tick); window.removeEventListener("atlas-calendar:show", show); };
  });
</script>

<svelte:window onkeydown={key} />

<div class="calendar" class:narrow bind:this={root} bind:clientWidth={width} tabindex="-1" role="application" aria-label="Calendar"
  onpointerdown={(e) => { if (!(e.target as HTMLElement).closest("input, textarea, select, button, [tabindex='0']")) root?.focus({ preventScroll: true }); }}>
  <header class="top">
    {#if !narrow}<button class="tool" onclick={() => (sideOpen = !sideOpen)} title="Side panel (s)" aria-label="Side panel"><Icon name="menu" /></button>{/if}
    <button class="atlas-btn today" onclick={() => cal.today()} title="Today (t)">Today</button>
    <div class="nav">
      <button class="tool" onclick={() => cal.step(-1)} title="Previous (k)" aria-label="Previous"><Icon name="back" /></button>
      <button class="tool" onclick={() => cal.step(1)} title="Next (j)" aria-label="Next"><Icon name="right" /></button>
    </div>
    <h1 title={cal.title()}>{cal.title()}</h1>
    {#if cal.loading || cal.syncing}<span class="spin" title={cal.syncing ? "Syncing with the server" : "Reading"} aria-label="Working"></span>{/if}
    <span class="grow"></span>
    <div class="search" class:on={!!searchText}>
      <Icon name="search" size={15} />
      <input bind:this={searchBox} bind:value={searchText} oninput={searched} placeholder="Search events" aria-label="Search events"
        onkeydown={(e) => { if (e.key === "Escape") { searchText = ""; void cal.search(""); searchBox?.blur(); } }} />
    </div>
    {#if width < 980}
      <select class="vsel" value={cal.view} onchange={(e) => cal.setView((e.currentTarget as HTMLSelectElement).value as View)} aria-label="View">
        {#each VIEWS as [v, l] (v)}<option value={v}>{l}</option>{/each}
      </select>
    {:else}
      <div class="seg" role="group" aria-label="View">
        {#each VIEWS as [v, l] (v)}<button class:on={cal.view === v} onclick={() => cal.setView(v)} title="{l} ({COMMANDS.find((c) => c.id === v)?.keys?.split(',')[0]})">{l}</button>{/each}
      </div>
    {/if}
    <button class="tool" onclick={openQuick} title="Quick add in words (q)" aria-label="Quick add"><Icon name="sparkle" /></button>
    {#if !narrow}
      <button class="tool" onclick={() => cal.sync(true)} title="Sync now (r)" aria-label="Sync"><Icon name="refresh" /></button>
      <button class="tool" onclick={palette} title="All commands (Ctrl+K)" aria-label="All commands"><Icon name="keyboard" /></button>
    {/if}
  </header>

  {#if quickOpen}
    <div class="quick">
      <Icon name="sparkle" size={15} />
      <input bind:this={quickBox} bind:value={quickText} oninput={quickTyped} placeholder="lunch with Ana tomorrow 13:00 · examen 15 nov · réunion lundi à 10h @ D3"
        aria-label="Quick add" onkeydown={(e) => { if (e.key === "Enter") { e.preventDefault(); void quickSave(); } else if (e.key === "Escape") { e.stopPropagation(); quickOpen = false; } }} />
      {#if quickSeen}<span class="qprev"><b>{quickSeen.title || "(no title)"}</b> · {quickWhen}{quickSeen.rrule ? " · repeats" : ""}{quickSeen.location ? ` · ${quickSeen.location}` : ""}</span>{/if}
      {#if quickCal}<CalendarPicker {cal} bind:value={quickCal} compact />{/if}
      <button class="atlas-btn primary" onclick={quickSave} disabled={!quickText.trim()}>Add</button>
    </div>
  {/if}

  <div class="body">
    {#if sideShown}<aside class="side" aria-label="Calendars"><Sidebar {cal} oncreate={newEvent} /></aside>{/if}
    <main class="view">
      {#if cal.error}
        <div class="atlas-notice error">{cal.error}<div class="actions"><button class="atlas-btn" onclick={() => cal.load()}>Try again</button><button class="atlas-btn" onclick={() => atlas.plugin.openSettings()}>Settings…</button></div></div>
      {:else if !cal.configured && !cal.sources.length}
        <div class="atlas-notice">No calendar account yet: add one in Settings (its server address, user name and app password; as many as you have) — or subscribe to a public calendar there.<div class="actions"><button class="atlas-btn primary" onclick={() => atlas.plugin.openSettings()}>Settings…</button></div></div>
      {/if}
      {#if cal.results}
        <AgendaView {cal} events={cal.results} from={startOfDay(new Date())} to={startOfDay(new Date())} {selected} onselect={select} search />
      {:else if view === "month"}
        <MonthView {cal} days={cal.days()} {selected} onselect={select} oncreate={create} />
      {:else if view === "agenda"}
        <AgendaView {cal} events={cal.events} from={cal.range().from} to={cal.range().to} {selected} onselect={select} />
      {:else if view === "year"}
        <YearView {cal} />
      {:else}
        {#key view + cal.range().from.getTime()}
          <TimeGrid {cal} days={cal.days()} {selected} onselect={select} oncreate={create} />
        {/key}
      {/if}
    </main>
  </div>

  {#if narrow}<button class="fab" onclick={newEvent} aria-label="New event" title="New event (c)"><Icon name="plus" size={22} /></button>{/if}
  {#if pop}
    <div class="popscrim" role="presentation" onclick={() => (pop = null)}></div>
    {#key pop}<Popover {cal} e={pop.e ?? null} draft={pop.draft ?? null} at={pop.at} box={box()} onedit={() => edit()} onmore={more} onclose={() => (pop = null)} />{/key}
  {/if}
  {#if editor}<Editor {cal} e={editor.e ?? null} start={editor.start} end={editor.end} allDay={editor.allDay} title={editor.title ?? ""} calendar={editor.calendar ?? ""} onclose={() => (editor = null)} />{/if}
  {#if help}<Shortcuts onclose={() => (help = false)} />{/if}
  <Toasts {cal} />
</div>

<style>
  .calendar:focus { outline: none; }
  .calendar { position: relative; height: 100%; display: grid; grid-template-rows: auto auto 1fr; color: var(--text); background: var(--bg); font-size: calc(14px * var(--ui-scale, 1)); container-type: inline-size; overflow: hidden; }
  .top { grid-row: 1; display: flex; align-items: center; gap: 8px; padding: 8px 12px; border-bottom: 1px solid var(--border); min-width: 0; }
  h1 { margin: 0 0 0 4px; font-size: 1.2em; font-weight: 600; color: var(--heading); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 6em; flex: 0 1 auto; }
  .nav { display: flex; }
  .grow { flex: 1; }
  .today { flex: none; }
  .tool { all: unset; cursor: pointer; padding: 6px; border-radius: var(--radius-sm); color: var(--text-muted); display: grid; place-items: center; min-width: 24px; min-height: 24px; flex: none; }
  .tool:hover { background: var(--bg-hover); color: var(--text); }
  .tool:focus-visible, .seg button:focus-visible, .fab:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
  .search { display: flex; align-items: center; gap: 6px; background: var(--bg-hover); border: 1px solid transparent; border-radius: var(--radius); padding: 0 8px; color: var(--text-faint); width: 200px; flex: 0 1 auto; min-width: 70px; }
  .search:focus-within, .search.on { border-color: var(--accent); background: var(--bg); color: var(--text); }
  .search input { all: unset; flex: 1; min-width: 0; padding: 6px 0; color: var(--text); }
  .search input::placeholder { color: var(--text-faint); }
  .seg { display: flex; border: 1px solid var(--border-strong); border-radius: var(--radius-sm); overflow: hidden; flex: none; }
  .seg button { all: unset; cursor: pointer; padding: 4px 10px; font-size: 0.86em; color: var(--text-muted); }
  .seg button + button { border-left: 1px solid var(--border); }
  .seg button:hover { background: var(--bg-hover); color: var(--text); }
  .seg button.on { background: var(--accent-soft); color: var(--accent-strong); font-weight: 600; }
  .vsel { appearance: none; -webkit-appearance: none; font: inherit; color: var(--text); background-color: var(--bg); border: 1px solid var(--border-strong); border-radius: var(--radius-sm); padding: 4px 26px 4px 8px; flex: none;
    background-image: linear-gradient(45deg, transparent 50%, var(--text-muted) 50%), linear-gradient(135deg, var(--text-muted) 50%, transparent 50%); background-position: calc(100% - 14px) 50%, calc(100% - 9px) 50%; background-size: 5px 5px; background-repeat: no-repeat; }
  .spin { width: 12px; height: 12px; border-radius: 50%; border: 2px solid var(--border-strong); border-top-color: var(--accent); animation: spin 0.8s linear infinite; flex: none; }
  @keyframes spin { to { transform: rotate(360deg); } }
  @media (prefers-reduced-motion: reduce) { .spin { animation: none; } }
  .quick { grid-row: 2; display: flex; align-items: center; gap: 10px; padding: 8px 14px; border-bottom: 1px solid var(--border); background: var(--bg-alt); color: var(--accent-strong); min-width: 0; flex-wrap: wrap; }
  .quick input { all: unset; flex: 1 1 260px; min-width: 0; color: var(--text); font-size: 1.02em; padding: 4px 0; }
  .quick input::placeholder { color: var(--text-faint); }
  .qprev { color: var(--text-muted); font-size: 0.9em; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .qprev b { color: var(--text); }
  .body { grid-row: 3; display: flex; min-height: 0; }
  .side { flex: none; width: 248px; border-right: 1px solid var(--border); background: var(--bg-alt); min-height: 0; }
  .view { flex: 1; min-width: 0; min-height: 0; position: relative; display: flex; flex-direction: column; }
  .view > :global(*) { flex: 1; min-height: 0; }
  .view > :global(.atlas-notice) { flex: none; margin: 10px 14px; }
  .popscrim { position: absolute; inset: 0; z-index: 49; }
  .fab { all: unset; cursor: pointer; position: absolute; right: 18px; bottom: 22px; z-index: 40; width: 52px; height: 52px; border-radius: 16px; display: grid; place-items: center; background: var(--accent); color: var(--accent-fg); box-shadow: var(--shadow-md, 0 6px 18px rgba(0,0,0,.3)); }
  .narrow .top { flex-wrap: wrap; row-gap: 6px; padding: 8px; }
  .narrow h1 { order: 10; flex-basis: 100%; margin: 0; font-size: 1.05em; }
  .narrow .search { width: auto; flex: 1 1 60px; min-width: 60px; }
  @container (max-width: 1100px) { .seg button { padding: 4px 7px; } }
</style>
