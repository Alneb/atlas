<script lang="ts">
  // The side panel (Google's and Apple's): Create, a mini month to jump anywhere (the range on screen marked), and
  // the calendars under their account (one heading each, its sync error beside it), each with a colour box — a click
  // shows or hides one, the box's menu picks its colour.
  import { addDays, addMonths, sameDay, startOfWeek, type Source } from "./api";
  import { NOTES, type Cal } from "./store.svelte";
  import Icon from "./Icon.svelte";

  let { cal, oncreate }: { cal: Cal; oncreate: () => void } = $props();

  // the month shown follows the pane's day, and the arrows move it on their own
  let shown = $state(new Date());
  $effect(() => { shown = new Date(cal.cursor.getFullYear(), cal.cursor.getMonth(), 1); });
  const cells = $derived.by(() => { const s = startOfWeek(shown, cal.first); return Array.from({ length: 42 }, (_, i) => addDays(s, i)); });
  const heads = $derived(cells.slice(0, 7).map((d) => d.toLocaleDateString(undefined, { weekday: "narrow" })));
  const inRange = (d: Date) => { const r = cal.range(); return d >= r.from && d <= r.to; };
  const busy = $derived(new Set(cal.events.map((e) => e.start.slice(0, 10))));
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  const PALETTE = ["#3b82f6", "#0ea5e9", "#14b8a6", "#22c55e", "#84cc16", "#eab308", "#f97316", "#ef4444", "#ec4899", "#a855f7", "#6366f1", "#64748b"];
  let colorFor = $state<string | null>(null);
  const groups = $derived([
    ...cal.byAccount().map((g) => ({ title: g.account.name, error: g.account.error ?? undefined, items: g.items })),
    { title: "Subscriptions", error: undefined, items: cal.sources.filter((s) => s.kind === "ics") },
  ]);
  const noAccount = $derived(!cal.accounts.length);
  const notesOn = $derived(cal.showNotes);
  function label(s: Source) { return s.error ? `${s.name} — ${s.error}` : s.writable ? s.name : `${s.name} (read-only)`; }
</script>

<div class="side">
  <button class="create atlas-btn primary" onclick={oncreate}><Icon name="plus" size={15} />Create</button>

  <div class="mini" aria-label="Pick a day">
    <div class="mhead">
      <span class="mtitle">{shown.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</span>
      <button class="tool" onclick={() => (shown = addMonths(shown, -1))} aria-label="Previous month"><Icon name="back" size={14} /></button>
      <button class="tool" onclick={() => (shown = addMonths(shown, 1))} aria-label="Next month"><Icon name="right" size={14} /></button>
    </div>
    <div class="mgrid">
      {#each heads as h, i (i)}<span class="h">{h}</span>{/each}
      {#each cells as d (d.getTime())}
        <button class="d" class:other={d.getMonth() !== shown.getMonth()} class:today={sameDay(d, cal.now)} class:on={inRange(d)} class:busy={busy.has(iso(d))} onclick={() => cal.go(d)}>{d.getDate()}</button>
      {/each}
    </div>
  </div>

  {#if noAccount}
    <h3>Calendars</h3>
    <ul><li class="none">{cal.configured ? (cal.error ? "Not read: see the message beside." : "Reading the server…") : "No account yet."}{#if !cal.configured}<button class="link" onclick={() => cal.atlas.plugin.openSettings()}>Set it up…</button>{/if}</li></ul>
  {/if}
  {#each groups as g (g.title)}
    {#if g.items.length || (g.title !== "Subscriptions")}
      <h3 title={g.error ?? g.title}>{g.title}{#if g.error}<span class="err" title={g.error}> !</span>{/if}</h3>
      <ul>
        {#each g.items as s (s.id)}
          <li>
            <button class="cal" role="checkbox" aria-checked={!cal.isHidden(s.id, s.name)} onclick={() => cal.toggle(s.id, s.name)} title={label(s)}>
              <span class="box" class:off={cal.isHidden(s.id, s.name)} style:--c={cal.colorOf(s.id)}>{#if !cal.isHidden(s.id, s.name)}<svg viewBox="0 0 12 12" width="10" height="10" aria-hidden="true"><path d="M2.5 6.5l2.2 2.2L9.5 3.8" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" /></svg>{/if}</span>
              <span class="name">{s.name}</span>
              {#if s.error}<span class="err" title={s.error}>!</span>{/if}
              {#if s.kind === "ics"}<span class="ro" title="A subscription: read-only"><Icon name="rss" size={12} /></span>{:else if !s.writable}<span class="ro" title="Read-only">ro</span>{/if}
            </button>
            <button class="tool small" onclick={() => (colorFor = colorFor === s.id ? null : s.id)} aria-label="Colour of {s.name}" title="Colour"><span class="swatch" style:--c={cal.colorOf(s.id)}></span></button>
            {#if colorFor === s.id}
              <div class="palette" role="listbox" aria-label="Colours">
                {#each PALETTE as c (c)}<button class="pc" role="option" aria-selected={cal.colorOf(s.id) === c} style:--c={c} aria-label={c} onclick={() => { cal.setColor(s.id, c); colorFor = null; }}></button>{/each}
              </div>
            {/if}
          </li>
        {:else}
          <li class="none">{g.error ?? "Reading the server…"}</li>
        {/each}
      </ul>
    {/if}
  {/each}

  {#if notesOn}
    <h3>In the vault</h3>
    <ul>
      <li>
        <button class="cal" role="checkbox" aria-checked={!cal.isHidden(NOTES, "Notes")} onclick={() => cal.toggle(NOTES, "Notes")} title="Notes marked important: true with due: / event:">
          <span class="box" class:off={cal.isHidden(NOTES, "Notes")} style:--c={cal.colorOf(NOTES)}>{#if !cal.isHidden(NOTES, "Notes")}<svg viewBox="0 0 12 12" width="10" height="10" aria-hidden="true"><path d="M2.5 6.5l2.2 2.2L9.5 3.8" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" /></svg>{/if}</span>
          <span class="name">Important notes</span>
        </button>
      </li>
    </ul>
  {/if}
  <button class="link add" onclick={() => cal.atlas.plugin.openSettings()}><Icon name="plus" size={13} />Add an account or a subscription…</button>
</div>

<style>
  .side { height: 100%; overflow-y: auto; padding: 12px 10px 24px; display: flex; flex-direction: column; gap: 4px; box-sizing: border-box; }
  .create { display: inline-flex; align-items: center; gap: 6px; align-self: flex-start; margin: 0 0 10px 4px; padding: 7px 16px; }
  .mini { padding: 0 2px 10px; }
  .mhead { display: flex; align-items: center; gap: 2px; padding: 0 0 4px 6px; }
  .mtitle { flex: 1; font-weight: 600; font-size: 0.9em; color: var(--heading); }
  .mgrid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 1px; }
  .h { font-size: 0.68em; color: var(--text-faint); text-align: center; padding: 2px 0; }
  .d { all: unset; cursor: pointer; text-align: center; font-size: 0.76em; line-height: 24px; border-radius: 999px; font-variant-numeric: tabular-nums; color: var(--text-muted); position: relative; }
  .d:hover { background: var(--bg-hover); color: var(--text); }
  .d.other { color: var(--text-faint); }
  .d.on { background: var(--accent-soft); color: var(--accent-strong); border-radius: 0; }
  .d.busy::after { content: ""; position: absolute; left: 50%; bottom: 2px; width: 3px; height: 3px; border-radius: 50%; background: currentColor; transform: translateX(-50%); opacity: 0.6; }
  .d.today { background: var(--accent); color: var(--accent-fg); font-weight: 700; border-radius: 999px; }
  .d:focus-visible, .cal:focus-visible, .tool:focus-visible, .pc:focus-visible, .link:focus-visible { outline: 2px solid var(--accent); outline-offset: -1px; }
  h3 { margin: 10px 6px 2px; font-size: 0.72em; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-faint); font-weight: 600; }
  ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 1px; }
  li { position: relative; display: flex; align-items: center; }
  .cal { all: unset; flex: 1; min-width: 0; cursor: pointer; display: flex; align-items: center; gap: 9px; padding: 5px 6px; border-radius: var(--radius-sm); color: var(--text); font-size: 0.9em; }
  .cal:hover { background: var(--bg-hover); }
  .box { width: 14px; height: 14px; border-radius: 4px; background: var(--c); border: 2px solid var(--c); box-sizing: border-box; display: grid; place-items: center; color: #fff; flex: none; }
  .box.off { background: transparent; }
  .name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .err { color: var(--red); font-weight: 700; }
  .ro { color: var(--text-faint); font-size: 0.75em; }
  .tool { all: unset; cursor: pointer; padding: 5px; border-radius: var(--radius-sm); color: var(--text-muted); display: grid; place-items: center; min-width: 24px; min-height: 24px; box-sizing: border-box; }
  .tool:hover { background: var(--bg-hover); color: var(--text); }
  .small { opacity: 0; }
  li:hover .small, .small:focus-visible { opacity: 1; }
  .swatch { width: 10px; height: 10px; border-radius: 50%; background: var(--c); }
  .palette { position: absolute; right: 0; top: 100%; z-index: 20; display: grid; grid-template-columns: repeat(6, 22px); gap: 6px; padding: 8px; background: var(--bg-elev); border: 1px solid var(--border-strong); border-radius: var(--radius); box-shadow: var(--shadow-md, 0 8px 24px rgba(0,0,0,.25)); }
  .pc { all: unset; cursor: pointer; width: 22px; height: 22px; border-radius: 50%; background: var(--c); }
  .pc[aria-selected="true"] { box-shadow: 0 0 0 2px var(--bg-elev), 0 0 0 4px var(--c); }
  .none { color: var(--text-faint); font-size: 0.85em; padding: 4px 6px; gap: 6px; flex-wrap: wrap; }
  .link { all: unset; cursor: pointer; color: var(--accent); font-size: 0.85em; display: inline-flex; align-items: center; gap: 4px; }
  .add { margin: 10px 6px 0; }
</style>
