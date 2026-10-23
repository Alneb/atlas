<script lang="ts">
  // An Obsidian Base (`.base`) as a table or a board: view tabs, typed cells, click a header to
  // re-sort, right-click it to hide / sort, "+" to show a property, "+ New" for a note in the view,
  // a board view grouped by a property (drag a card to change it). Used by the Base pane and inside
  // notes that embed `![[x.base]]`; every change is written to the notes / the `.base` file.
  import BaseViewEditor from "./BaseViewEditor.svelte";
  import { errText } from "../lib/text";
  import { atPointer, below, type MenuAt } from "../lib/menu";
  import { shownName, shownPath } from "../lib/paths";
  import { onMount } from "svelte";
  import { api } from "../lib/api";
  import { on } from "../lib/bus";
  import { openPath } from "../lib/dock";
  import type { BaseCell, BaseResult } from "../lib/types";
  import Icon from "./Icon.svelte";
  import ContextMenu, { type MenuItem } from "./ContextMenu.svelte";
  import { toast } from "../lib/state.svelte";
  import type { ViewEdit } from "../lib/gen/ViewEdit";
  import { context, setHover } from "../lib/context.svelte";
  // hover sync (R3): a row / card under the pointer is the shared hover; one hovered elsewhere lights up
  const hoverIn = (p: string) => setHover({ path: p, source: "base" });
  const hoverOut = () => { if (context.hover?.source === "base") setHover(null); };
  const lit = (p: string) => context.hover?.path === p && context.hover.source !== "base";

  let { path, thisPath, view: initialView, embedded = false }: {
    path: string;
    /** The note embedding the base (Obsidian's `this.file`). */
    thisPath?: string;
    /** `![[x.base#View]]` picks a view by name. */
    view?: string;
    embedded?: boolean;
  } = $props();

  let res = $state<BaseResult | null>(null);
  let error = $state("");
  // svelte-ignore state_referenced_locally -- the initial view only seeds the tab choice
  let viewName = $state(initialView ?? "");
  let sortCol = $state(-1);
  let sortDir = $state<1 | -1>(1);
  let host: HTMLElement;

  async function load() {
    try { res = await api.base(path, thisPath); error = res.error ?? ""; }
    catch (e) { error = errText(e); }
  }

  /** An embed that names its view (`![[x.base#View]]`, a page's `{view: base, table: …}`) shows that view alone: the
   *  other views' tabs are the database's, one click away in its tab. */
  const pinned = $derived(embedded && !!initialView);
  const view = $derived(res?.views.find((v) => v.name === viewName) ?? res?.views[0] ?? null);
  let width = $state(0);
  /** An embed too narrow for a table of its columns draws rows instead (title, the rest faint, the date at the end). */
  const compact = $derived(embedded && width > 0 && width < 140 * (view?.columns.length ?? 1) && (view?.kind ?? "table") !== "board");

  /** Plain text of a cell, for sorting and the title tooltip. */
  /** A date or date-time as a row reads it best: the time today, the day this year, the day and year before. */
  function shortDate(v: string): string | null {
    const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/.exec(v.trim());
    if (!m || v.trim().length > 30) return null;
    const d = new Date(+m[1], +m[2] - 1, +m[3], +(m[4] ?? 0), +(m[5] ?? 0));
    const now = new Date();
    if (m[4] && d.toDateString() === now.toDateString()) return `${m[4]}:${m[5]}`;
    return d.toLocaleDateString(undefined, d.getFullYear() === now.getFullYear() ? { day: "numeric", month: "short" } : { day: "numeric", month: "short", year: "numeric" });
  }

  function text(c: BaseCell): string {
    switch (c.t) {
      case "null": return "";
      case "bool": return c.value ? "✓" : "";
      case "num": return String(c.value);
      case "text": return c.value;
      case "link": return c.text;
      case "date": return c.text;
      case "list": return c.items.map(text).join(", ");
    }
  }
  const num = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(Math.abs(n) < 1 ? 3 : 2));

  const rows = $derived.by(() => {
    if (!view) return [];
    if (sortCol < 0) return view.rows;
    const k = sortCol;
    return [...view.rows].sort((a, b) => {
      const x = a.cells[k], y = b.cells[k];
      const d = x.t === "num" && y.t === "num" ? x.value - y.value : text(x).localeCompare(text(y), undefined, { numeric: true });
      return sortDir * d;
    });
  });

  function sortBy(i: number) {
    if (sortCol === i) { if (sortDir === -1) sortCol = -1; else sortDir = -1; }
    else { sortCol = i; sortDir = 1; }
  }
  function pickView(name: string) { viewName = name; sortCol = -1; }
  let settingsOpen = $state(false);

  // Notion-style cell editing: double-click a property cell, Enter/blur saves into the note's
  // frontmatter (only that key is rewritten), Esc cancels. Computed columns are read-only.
  let editing = $state<{ path: string; col: number; text: string; list: boolean } | null>(null);
  function startEdit(r: { path: string; edit: (string | null)[]; is_list: boolean[] }, i: number, e: Event) {
    if (!view?.columns[i].key || r.edit[i] == null) return;
    e.stopPropagation();
    editing = { path: r.path, col: i, text: r.edit[i] ?? "", list: r.is_list[i] };
  }
  async function saveEdit() {
    const ed = editing;
    if (!ed || !view) return;
    editing = null;
    try {
      await api.setProperty({ path: ed.path, key: view.columns[ed.col].key!, text: ed.text, list: ed.list || /,\s*\[\[/.test(ed.text) });
      await load();
    } catch (e) { error = errText(e); }
  }
  function editKey(e: KeyboardEvent) {
    e.stopPropagation();
    if (e.key === "Enter") { e.preventDefault(); void saveEdit(); }
    else if (e.key === "Escape") { e.preventDefault(); editing = null; }
  }

  // --- writing through the base -----------------------------------------------------------------
  const fail = (what: string) => (e: unknown) => toast(what, errText(e), "error");
  let menu = $state<MenuAt | null>(null);
  async function newRow() {
    if (!view) return;
    try {
      const r = await api.baseRow(path, view.name);
      openPath(r.path);
      if (!r.matches) toast("Created " + shownPath(r.path), "It does not show in this view yet: fill the properties its filters ask for.");
    } catch (e) { fail("Could not create the note")(e); }
  }
  async function editView(edit: ViewEdit, then?: () => void) {
    if (!view) return;
    try { await api.baseView({ path, view: view.name, edit }); await load(); then?.(); }
    catch (e) { fail("Could not change the view")(e); }
  }
  function columnMenu(e: MouseEvent, i: number) {
    e.preventDefault();
    const c = view!.columns[i];
    menu = atPointer(e, [
      { label: "Sort ascending", icon: "arrow-up" as const, run: () => { sortCol = i; sortDir = 1; } },
      { label: "Sort descending", icon: "arrow-down" as const, run: () => { sortCol = i; sortDir = -1; } },
      "sep",
      { label: `Hide “${c.label}”`, icon: "close" as const, run: () => void editView({ op: "hide", column: c.id }) },
    ]);
  }
  /** The properties a column / a board can use: the view's own columns, then the notes' others. */
  const choices = $derived(view ? [...view.columns.filter((c) => c.key).map((c) => c.key!), ...view.properties] : []);
  function addColumnMenu(e: MouseEvent) {
    const items: MenuItem[] = view!.properties.map((k) => ({ label: k, run: () => void editView({ op: "show", column: k }) }));
    for (const f of ["file.mtime", "file.ctime", "file.folder", "file.tags", "file.backlinks"]) {
      if (!view!.columns.some((c) => c.id === f)) items.push({ label: f, hint: "file", run: () => void editView({ op: "show", column: f }) });
    }
    menu = below(e, items.length ? items : [{ label: "No other properties", run: () => {} }]);
  }
  function boardMenu(e: MouseEvent) {
    const name = (k: string) => { let n = `By ${k}`, i = 2; while (res?.views.some((v) => v.name === n)) n = `By ${k} ${i++}`; return n; };
    menu = below(e, choices.length
      ? choices.map((k) => ({ label: `Board grouped by ${k}`, run: () => { const n = name(k); void editView({ op: "board", name: n, group_by: k }, () => pickView(n)); } }))
      : [{ label: "No property to group by", run: () => {} }]);
  }

  // --- board ------------------------------------------------------------------------------------
  const NONE = "No value";
  const lanes = $derived.by(() => {
    if (!view || view.kind !== "board") return [];
    const m = new Map<string, typeof view.rows>();
    for (const r of view.rows) {
      const g = r.group || NONE;
      if (!m.has(g)) m.set(g, []);
      m.get(g)!.push(r);
    }
    return [...m].sort(([a], [b]) => (a === NONE ? 1 : b === NONE ? -1 : a.localeCompare(b, undefined, { numeric: true })));
  });
  let dragging = $state<string | null>(null);
  let overLane = $state<string | null>(null);
  async function dropOn(lane: string) {
    const p = dragging;
    dragging = overLane = null;
    if (!p || !view?.group_key) return;
    const row = view.rows.find((r) => r.path === p);
    if (!row || (row.group || NONE) === lane) return;
    try { await api.setProperty({ path: p, key: view.group_key, text: lane === NONE ? "" : lane, list: false }); await load(); }
    catch (e) { fail("Could not move the card")(e); }
  }

  onMount(() => {
    void load();
    let t: ReturnType<typeof setTimeout> | undefined;
    // out of the page (its tab in the background, its widget scrolled away): noted, reloaded once it is seen again.
    // It used to unsubscribe for good there, taking a hidden tab for a vanished widget — the table then never
    // followed another change ("the views dont render until i open the code and go out again", 2026-10-21); an
    // embed is now unmounted by its owner when it really goes (lib/hydrate.ts).
    let stale = false;
    const seen = new IntersectionObserver((es) => { if (stale && es.some((e) => e.isIntersecting)) { stale = false; void load(); } });
    if (host) seen.observe(host);
    const off = on("fs", (e) => {
      if (!e.paths.some((p) => /\.(md|base)$/i.test(p))) return;
      if (!host?.isConnected) { stale = true; return; }
      clearTimeout(t);
      t = setTimeout(load, 500);
    });
    return () => { off(); clearTimeout(t); seen.disconnect(); };
  });
</script>

{#snippet cellView(c: BaseCell)}
  {#if c.t === "link"}
    {#if c.path}<button class="link" onclick={(e) => { e.stopPropagation(); openPath(c.path!); }}>{c.text}</button>{:else}<span class="link missing">{c.text}</span>{/if}
  {:else if c.t === "text" && shortDate(c.value)}
    <span class="date" title={c.value}>{shortDate(c.value)}</span>
  {:else if c.t === "list"}
    <span class="list">{#each c.items as it, i}{#if i}<span class="sep">, </span>{/if}{@render cellView(it)}{/each}</span>
  {:else if c.t === "bool"}
    <span class="bool">{c.value ? "✓" : ""}</span>
  {:else if c.t === "num"}
    {num(c.value)}
  {:else}
    {text(c)}
  {/if}
{/snippet}

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="base" class:embedded bind:this={host} bind:clientWidth={width} onmousedown={(e) => embedded && e.stopPropagation()}>
  <div class="bar">
    <Icon name="table" size={13} />
    {#if res && res.views.length > 1 && !pinned}
      <div class="tabs" role="tablist">
        {#each res.views as v (v.name)}
          <button role="tab" class="tab" class:on={v === view} aria-selected={v === view} onclick={() => pickView(v.name)}>{v.name}<span class="n">{v.count}</span></button>
        {/each}
      </div>
    {:else if view}
      <span class="title">{view.name}</span>
    {/if}
    {#if res && !embedded}<button class="add-view" onclick={boardMenu} title="New board view (grouped by a property)" aria-label="New board view"><Icon name="plus" size={12} /></button>{/if}
    {#if view && !embedded}<button class="add-view" class:on={settingsOpen} onclick={() => (settingsOpen = !settingsOpen)} title="View settings: filter, sort, columns" aria-label="View settings" aria-expanded={settingsOpen}><Icon name="sliders" size={12} /></button>{/if}
    {#if view}<span class="count">{view.count === view.rows.length ? view.count : `${view.rows.length} of ${view.count}`} {view.count === 1 ? "note" : "notes"}</span>{/if}
    {#if view}<button class="new" onclick={newRow} title="New note in this view (its filters fill the folder and properties)"><Icon name="plus" size={12} /> New</button>{/if}
    {#if embedded}<button class="open" onclick={() => openPath(path)} title="Open {path}">{shownName(path)}</button>{/if}
  </div>
  {#if settingsOpen && view && res}
    <div class="settings-pop">
      <BaseViewEditor {view} views={res.views.length} onedit={(edit) => editView(edit)} onrenamed={pickView} onclose={() => (settingsOpen = false)} />
    </div>
  {/if}
  {#if error}
    <p class="err">{error}</p>
  {:else if view && view.kind === "board"}
    <div class="scroll board">
      {#each lanes as [lane, cards] (lane)}
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <section class="lane" class:over={overLane === lane} aria-label="{view.group_by}: {lane}"
          ondragover={(e) => { if (dragging && view?.group_key) { e.preventDefault(); overLane = lane; } }}
          ondragleave={(e) => { if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) overLane = null; }}
          ondrop={(e) => { e.preventDefault(); void dropOn(lane); }}>
          <header><span class="lane-name">{lane}</span><span class="n">{cards.length}</span></header>
          {#each cards as r (r.path)}
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <article class="card" class:lit={lit(r.path)} onmouseenter={() => hoverIn(r.path)} onmouseleave={hoverOut} draggable={!!view.group_key} ondragstart={(e) => { dragging = r.path; e.dataTransfer?.setData("text/plain", r.path); }}
              ondragend={() => (dragging = overLane = null)} ondblclick={() => openPath(r.path)}>
              {#each r.cells as c, i (i)}
                {#if view.columns[i].id === "file.name"}<div class="card-title">{@render cellView(c)}</div>
                {:else if c.t !== "null" && view.columns[i].id !== view.group_by && view.columns[i].key !== view.group_key}
                  <div class="card-prop"><span class="k">{view.columns[i].label}</span> {@render cellView(c)}</div>{/if}
              {/each}
            </article>
          {/each}
        </section>
      {:else}
        <p class="empty">No notes match this view.</p>
      {/each}
    </div>
  {:else if view && compact}
    <!-- too narrow for its columns (a card on a page): rows as the Activity card draws them -->
    <ul class="scroll rows">
      {#each rows as r (r.path)}
        {@const lead = r.cells[0]}
        {@const when = r.cells.slice(1).map((c) => (c.t === "text" ? shortDate(c.value) : null)).find(Boolean)}
        {@const rest = r.cells.slice(1).filter((c) => !(c.t === "text" && shortDate(c.value))).map(text).filter(Boolean)}
        <li><button class="row" class:lit={lit(r.path)} onclick={() => openPath(r.path)} onmouseenter={() => hoverIn(r.path)} onmouseleave={hoverOut} title={[text(lead), ...rest].join(" · ")}>
          <Icon name={/\.md$/i.test(r.path) ? "file-text" : "file"} size={14} />
          <span class="lead">{text(lead) || shownName(r.path)}</span>
          {#if rest.length}<span class="rest">{rest.join(" · ")}</span>{/if}
          {#if when}<span class="when">{when}</span>{/if}
        </button></li>
      {:else}
        <li class="empty">No notes match this view.</li>
      {/each}
    </ul>
  {:else if view}
    <div class="scroll">
      <table>
        <thead>
          <tr>
            {#each view.columns as c, i (c.id)}
              <th style:width={c.width ? `${c.width}px` : undefined} onclick={() => sortBy(i)} oncontextmenu={(e) => columnMenu(e, i)} title="Sort by {c.label} (right-click: hide, sort)">
                {c.label}{#if sortCol === i}<span class="dir">{sortDir === 1 ? "▲" : "▼"}</span>{/if}
              </th>
            {/each}
            <th class="add-col"><button onclick={addColumnMenu} title="Show another property as a column" aria-label="Add column"><Icon name="plus" size={12} /></button></th>
          </tr>
        </thead>
        <tbody>
          {#each rows as r (r.path)}
            <tr ondblclick={() => openPath(r.path)} class:lit={lit(r.path)} onmouseenter={() => hoverIn(r.path)} onmouseleave={hoverOut}>
              {#each r.cells as c, i (i)}
                <td class:num={c.t === "num"} class:first={view.columns[i].id === "file.name"} class:editable={r.edit[i] != null} title={r.edit[i] != null ? `${text(c)} — double-click to edit` : text(c)} ondblclick={(e) => startEdit(r, i, e)}>
                  {#if editing && editing.path === r.path && editing.col === i}
                    <!-- svelte-ignore a11y_autofocus -->
                    <input class="cell-edit" bind:value={editing.text} onkeydown={editKey} onblur={() => void saveEdit()} autofocus spellcheck="false" aria-label="Edit {view.columns[i].label}" />
                  {:else if view.columns[i].id === "file.name" && c.t === "link"}
                    <span class="name"><Icon name={c.path && !/\.md$/i.test(c.path) ? "file" : "file-text"} size={14} />{@render cellView(c)}</span>
                  {:else}{@render cellView(c)}{/if}
                </td>
              {/each}
              <td class="add-col"></td>
            </tr>
          {:else}
            <tr><td class="empty" colspan={view.columns.length + 1}>No notes match this view.</td></tr>
          {/each}
        </tbody>
      </table>
    </div>
  {:else if res}
    <p class="err">This base has no views.</p>
  {:else}
    <p class="loading">Loading…</p>
  {/if}
</div>

{#if menu}<ContextMenu x={menu.x} y={menu.y} items={menu.items} onclose={() => (menu = null)} />{/if}

<style>
  .settings-pop { position: absolute; z-index: 30; top: 36px; right: 8px; }
  .add-view.on { color: var(--accent); }
  .base { position: relative; display: flex; flex-direction: column; min-height: 0; font-family: var(--font-ui); font-size: calc(13px * var(--ui-scale, 1)); color: var(--text); white-space: normal; }
  .base.embedded { border: 1px solid var(--border); border-radius: var(--radius, 8px); background: transparent; margin: 6px 0; max-height: 420px; }
  /* in a page's card the card is the frame: no box in a box */
  :global(.pb.card) .base.embedded { border: 0; margin: 0; }
  .bar { display: flex; align-items: center; gap: 8px; padding: 6px 8px 8px; color: var(--text-muted); flex-wrap: wrap; }
  .tabs { display: flex; gap: 6px; flex-wrap: wrap; }
  .tab { padding: 3px 10px; border-radius: 999px; border: 1px solid var(--border); color: var(--text-muted); font-size: .92em; display: inline-flex; gap: 6px; align-items: center; white-space: nowrap; }
  .tab:hover { color: var(--text); border-color: var(--border-strong); }
  .tab.on { background: var(--accent-soft); border-color: transparent; color: var(--heading); }
  .tab .n, .count { color: var(--text-faint); font-size: .85em; font-variant-numeric: tabular-nums; background: var(--bg-hover); padding: 0 7px; border-radius: 99px; }
  .title { color: var(--heading); font-weight: 600; }
  .open { margin-left: auto; color: var(--text-faint); font-size: .88em; padding: 1px 6px; border-radius: 4px; }
  .open:hover { color: var(--text); background: var(--bg-hover); }
  .scroll { overflow: auto; min-height: 0; padding: 0 4px 4px; }
  table { border-collapse: separate; border-spacing: 0; width: 100%; }
  th, td { padding: 6px 10px; text-align: left; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 420px; }
  th { position: sticky; top: 0; background: var(--bg-alt); color: var(--text-faint); font-weight: 600; font-size: .78em; text-transform: uppercase; letter-spacing: .06em;
    border-bottom: 1px solid var(--border); cursor: pointer; user-select: none; z-index: 1; }
  th:hover { color: var(--text-muted); }
  .dir { margin-left: 4px; font-size: .8em; color: var(--accent); }
  td { color: var(--text-muted); }
  td.first { color: var(--text); }
  tbody tr:hover td { background: var(--bg-hover); }
  tbody tr td:first-child { border-radius: 6px 0 0 6px; }
  tbody tr td:last-child { border-radius: 0 6px 6px 0; }
  td.num { text-align: right; font-variant-numeric: tabular-nums; }
  td.editable { cursor: text; }
  .name { display: inline-flex; align-items: center; gap: 8px; min-width: 0; max-width: 100%; }
  .name :global(.icon) { color: var(--text-faint); }
  .name .link { color: var(--text); overflow: hidden; text-overflow: ellipsis; }
  .date { font-variant-numeric: tabular-nums; color: var(--text-faint); }
  .cell-edit { width: 100%; min-width: 120px; font: inherit; color: var(--text); background: var(--bg-elev); border: 1px solid var(--accent); border-radius: 4px; padding: 1px 5px; }
  .cell-edit:focus { outline: none; }
  .link { color: var(--link, var(--accent)); padding: 0; font: inherit; }
  .link:hover { text-decoration: underline; }
  /* a link in another column is a tag-like pill, not a run of blue text */
  td:not(.first) .link { color: var(--text-muted); background: var(--bg-hover); border-radius: 999px; padding: 0 8px; font-size: .92em; }
  td:not(.first) .link:hover { color: var(--text); text-decoration: none; }
  .link.missing { color: var(--text-faint); }
  .list { display: inline-flex; gap: 4px; flex-wrap: nowrap; }
  .sep { display: none; }
  .bool { color: var(--green, var(--accent)); }
  .empty, .loading, .err { color: var(--text-faint); padding: 10px; margin: 0; }
  .rows { list-style: none; margin: 0; padding: 0 2px 4px; }
  .row { display: flex; align-items: center; gap: 8px; width: 100%; padding: 6px 8px; border-radius: 6px; font: inherit; color: var(--text); text-align: left; min-width: 0; }
  .row:hover, .row.lit { background: var(--bg-hover); }
  .row :global(.icon) { color: var(--text-faint); flex: none; }
  .row .lead { flex: 0 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .row .rest { flex: 1 1 0; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text-faint); font-size: .92em; }
  .row .when { flex: none; margin-left: auto; color: var(--text-faint); font-size: .9em; font-variant-numeric: tabular-nums; }
  .new, .add-view { display: inline-flex; align-items: center; gap: 4px; padding: 1px 8px; border-radius: 5px; color: var(--text-muted); font-size: .9em; }
  .new { margin-left: auto; border: 1px solid var(--border-strong); }
  .new:hover, .add-view:hover { background: var(--bg-hover); color: var(--text); }
  .embedded .new { margin-left: 0; }
  th.add-col, td.add-col { width: 28px; padding: 0 4px; cursor: default; }
  th.add-col button { display: grid; place-items: center; width: 20px; height: 20px; border-radius: 4px; color: var(--text-faint); }
  th.add-col button:hover { background: var(--bg-hover); color: var(--text); }
  .board { display: flex; gap: 10px; align-items: flex-start; padding: 10px; }
  .lane { flex: 0 0 240px; background: var(--bg-alt); border: 1px solid var(--border); border-radius: 8px; padding: 6px; display: flex; flex-direction: column; gap: 6px; min-height: 80px; }
  .lane.over { border-color: var(--accent); background: var(--accent-soft); }
  .lane header { display: flex; gap: 6px; align-items: baseline; padding: 2px 4px 4px; font-weight: 600; color: var(--heading); }
  .lane .n { color: var(--text-faint); font-weight: 400; font-size: .88em; }
  .card { background: var(--bg-elev); border: 1px solid var(--border); border-radius: 6px; padding: 6px 8px; cursor: grab; display: flex; flex-direction: column; gap: 2px; }
  .card:hover { border-color: var(--border-strong); }
  .card.lit { border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent); }
  tbody tr.lit td { background: var(--accent-soft); }
  .card-title { font-weight: 500; }
  .card-prop { font-size: .88em; color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .card-prop .k { color: var(--text-faint); }
  .err { color: var(--red); }
</style>
