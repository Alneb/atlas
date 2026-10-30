<script lang="ts">
  // A Bases table view, as Obsidian's: a header to drag (reorder), to stretch by its edge (the width is saved as the
  // view's `columnSize`) and to click for its menu (sort, rename, hide); cells edited in place — a click on a property
  // cell opens its editor (CellEditor.svelte), a checkbox toggles at once, a note's name opens it. Every change is
  // written through the core (`onedit` for the `.base`, `onwrite` for a note's property). Rows come in groups when the
  // view has a `groupBy`; the footer holds each column's summary (click it to choose one).
  import { tick } from "svelte";
  import Icon from "../Icon.svelte";
  import ContextMenu, { type MenuItem } from "../ContextMenu.svelte";
  import InputDialog from "../InputDialog.svelte";
  import CellValue from "./CellValue.svelte";
  import CellEditor from "./CellEditor.svelte";
  import { below, type MenuAt } from "../../lib/menu";
  import { openPath } from "../../lib/dock";
  import { reorder } from "../../lib/base-drag";
  import { context, setHover } from "../../lib/context.svelte";
  import { groupRows } from "../../lib/base-groups";
  import { RowWindow } from "../../lib/windowed.svelte";
  import type { BaseView } from "../../lib/gen/BaseView";
  import type { BaseRow } from "../../lib/gen/BaseRow";
  import type { BaseCell } from "../../lib/gen/BaseCell";
  import type { PropertyKind } from "../../lib/gen/PropertyKind";
  import type { ViewEdit } from "../../lib/gen/ViewEdit";
  import type { SummaryKind } from "../../lib/gen/SummaryKind";

  let { view, kindOf, others, onedit, onwrite }: {
    view: BaseView;
    /** a column's property kind (the cell editor it gets) */
    kindOf: (id: string) => PropertyKind;
    /** the properties the "+" column offers */
    others: { id: string; label: string }[];
    onedit: (e: ViewEdit) => void;
    onwrite: (path: string, key: string, value: unknown) => void;
  } = $props();

  // hover sync: a row under the pointer is the shared hover; one hovered elsewhere lights up
  const hoverIn = (p: string) => setHover({ path: p, source: "base" });
  const hoverOut = () => { if (context.hover?.source === "base") setHover(null); };
  const lit = (p: string) => context.hover?.path === p && context.hover.source !== "base";

  let menu = $state<MenuAt | null>(null);
  let dialog = $state<{ column: string; label: string } | null>(null);
  let editing = $state<{ path: string; col: number } | null>(null);

  // --- columns: width, order, menu -----------------------------------------------------------------------------------
  const MIN = 60;
  let live = $state<Record<string, number>>({}); // a width being dragged, before it is saved
  // every column has a width (fixed layout: a long value never pushes the others); the "+" column takes what is left
  const widthOf = (c: BaseView["columns"][number]) => live[c.id] ?? c.width ?? (c.id === "file.name" ? 240 : 160);
  const total = $derived(view.columns.reduce((n, c) => n + widthOf(c), 0) + 36);
  function resize(e: PointerEvent, id: string) {
    e.preventDefault();
    e.stopPropagation();
    const th = (e.currentTarget as HTMLElement).parentElement!;
    const start = e.clientX, from = th.getBoundingClientRect().width;
    const handle = e.currentTarget as HTMLElement;
    handle.setPointerCapture(e.pointerId);
    const moveTo = (ev: PointerEvent) => { live = { ...live, [id]: Math.max(MIN, Math.round(from + ev.clientX - start)) }; };
    const up = () => {
      handle.removeEventListener("pointermove", moveTo);
      handle.removeEventListener("pointerup", up);
      const w = live[id];
      if (w !== undefined && Math.abs(w - from) >= 2) onedit({ op: "width", column: id, width: w });
      else { const { [id]: _, ...rest } = live; live = rest; }
    };
    handle.addEventListener("pointermove", moveTo);
    handle.addEventListener("pointerup", up);
  }
  // a saved width replaces the dragged one once the view comes back with it
  $effect(() => { for (const c of view.columns) if (live[c.id] !== undefined && c.width === live[c.id]) { const { [c.id]: _, ...rest } = live; live = rest; } });

  let dragCol = $state<number | null>(null);
  let overCol = $state<number | null>(null);
  const ids = $derived(view.columns.map((c) => c.id));
  const move = (from: number, to: number) => { if (to >= 0 && to < ids.length && from !== to) onedit({ op: "order", columns: reorder(ids, from, to) }); };
  const sortedBy = (id: string) => view.sort[0]?.property === id ? view.sort[0].direction : null;

  function headerMenu(e: MouseEvent, i: number) {
    const c = view.columns[i];
    const items: MenuItem[] = [
      { label: "Sort ascending", icon: "arrow-up", run: () => onedit({ op: "sort", sort: [{ property: c.id, direction: "ASC" }, ...view.sort.filter((k) => k.property !== c.id)] }) },
      { label: "Sort descending", icon: "arrow-down", run: () => onedit({ op: "sort", sort: [{ property: c.id, direction: "DESC" }, ...view.sort.filter((k) => k.property !== c.id)] }) },
    ];
    if (view.sort.some((k) => k.property === c.id)) items.push({ label: "Remove from the sort", icon: "close", run: () => onedit({ op: "sort", sort: view.sort.filter((k) => k.property !== c.id) }) });
    items.push("sep",
      { label: "Move left", icon: "arrow-left", disabled: i === 0, run: () => move(i, i - 1) },
      { label: "Move right", icon: "arrow-right", disabled: i === ids.length - 1, run: () => move(i, i + 1) },
      { label: "Rename…", icon: "edit", run: () => (dialog = { column: c.id, label: c.label }) });
    if (c.width) items.push({ label: "Reset the width", icon: "refresh", run: () => onedit({ op: "width", column: c.id, width: null }) });
    items.push("sep", { label: `Hide “${c.label}”`, icon: "eye", disabled: ids.length === 1, run: () => onedit({ op: "hide", column: c.id }) });
    menu = below(e, items);
  }
  function addColumnMenu(e: MouseEvent) {
    menu = below(e, others.length ? others.map((p) => ({ label: p.label, detail: p.label !== p.id ? p.id : undefined, run: () => onedit({ op: "show", column: p.id }) })) : [{ label: "Every property is shown", disabled: true, run: () => {} }]);
  }

  // --- summaries (the footer) ----------------------------------------------------------------------------------------
  const COUNTS: SummaryKind[] = ["Empty", "Filled", "Unique"];
  /** The summaries a column's kind makes sense of, as Obsidian offers them. */
  function summariesFor(id: string): SummaryKind[] {
    const k = kindOf(id);
    if (k === "number") return ["Sum", "Average", "Median", "Min", "Max", "Range", "Stddev", ...COUNTS];
    if (k === "date" || k === "datetime") return ["Earliest", "Latest", "Range", ...COUNTS];
    if (k === "bool") return ["Checked", "Unchecked", ...COUNTS];
    return COUNTS;
  }
  function summaryMenu(e: MouseEvent, c: BaseView["columns"][number]) {
    const items: MenuItem[] = summariesFor(c.id).map((kind) => ({ label: kind, icon: c.summary?.kind === kind ? "check" as const : undefined, run: () => onedit({ op: "summary", column: c.id, summary: kind }) }));
    if (c.summary) items.push("sep", { label: "No summary", icon: "close", run: () => onedit({ op: "summary", column: c.id, summary: null }) });
    menu = below(e, items);
  }
  const groups = $derived(groupRows(view));

  // --- cells ---------------------------------------------------------------------------------------------------------
  const editable = (r: BaseRow, i: number) => !!view.columns[i].key && r.edit[i] != null;
  /** A cell's kind: the property's, but a list stays a list where one note holds one. */
  const cellKind = (r: BaseRow, i: number): PropertyKind => {
    const k = kindOf(view.columns[i].id);
    const v = r.values[i];
    if (Array.isArray(v)) return k === "tags" || k === "links" ? k : "list";
    // a date written without a time keeps that shape, whatever the vault's kind says
    return k === "datetime" && typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v.trim()) ? "date" : k;
  };
  function activate(r: BaseRow, i: number) {
    if (!editable(r, i)) return;
    const key = view.columns[i].key!;
    if (cellKind(r, i) === "bool") { onwrite(r.path, key, r.values[i] !== true); return; }
    editing = { path: r.path, col: i };
  }
  const isEditing = (r: BaseRow, i: number) => editing?.path === r.path && editing.col === i;
  /** Closing the editor by a key (Enter, Escape) gives the focus back to its cell; a click elsewhere keeps it there. */
  function closeEditor() {
    const cell = (document.activeElement as HTMLElement | null)?.closest<HTMLElement>("td.editing");
    editing = null;
    if (cell) void tick().then(() => cell.focus());
  }
  const cellKey = (e: KeyboardEvent, r: BaseRow, i: number) => { if ((e.key === "Enter" || e.key === "F2") && !isEditing(r, i)) { e.preventDefault(); activate(r, i); } };
  const asBool = (c: BaseCell): BaseCell => (c.t === "null" ? { t: "bool", value: false } : c);

  // --- the window: a group's title and a row are one height (32px), and only those around the view are drawn; a view
  // over every note of a vault has thousands, each a cell per column. 100 beyond each side: a usual view is drawn whole
  type Line = { kind: "group"; title: string; n: number } | { kind: "row"; r: BaseRow };
  const lines = $derived(groups.flatMap((g): Line[] => [...(g.title !== null ? [{ kind: "group" as const, title: g.title, n: g.rows.length }] : []), ...g.rows.map((r) => ({ kind: "row" as const, r }))]));
  let scroller = $state<HTMLElement>();
  const win = new RowWindow(100, 32);
  $effect(() => win.follow(scroller));
  const { first, last } = $derived(win.range(lines.length));
  $effect(() => { void lines.length; win.measure(scroller?.querySelector<HTMLElement>("tbody tr:not(.pad, .group)")); });
</script>

<div class="scroll" bind:this={scroller}>
  <table style:width="max(100%, {total}px)">
    <colgroup>
      {#each view.columns as c (c.id)}<col style:width="{widthOf(c)}px" />{/each}
      <col />
    </colgroup>
    <thead>
      <tr>
        {#each view.columns as c, i (c.id)}
          {@const dir = sortedBy(c.id)}
          <th class:over={overCol === i && dragCol !== i} class:dragging={dragCol === i}
            ondragover={(e) => { if (dragCol !== null) { e.preventDefault(); overCol = i; } }}
            ondrop={(e) => { e.preventDefault(); if (dragCol !== null) move(dragCol, i); dragCol = overCol = null; }}>
            <!-- the label drags, not the whole header: its edge is the resize handle -->
            <button type="button" class="head" draggable="true"
              ondragstart={(e) => { dragCol = i; e.dataTransfer?.setData("text/plain", c.id); }} ondragend={() => (dragCol = overCol = null)} onclick={(e) => headerMenu(e, i)} oncontextmenu={(e) => { e.preventDefault(); headerMenu(e, i); }} title="{c.label}: sort, rename, hide (drag to move)">
              <span class="label">{c.label}</span>
              {#if dir}<Icon name={dir === "ASC" ? "arrow-up" : "arrow-down"} size={11} />{/if}
            </button>
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <span class="resize" title="Drag to resize" onpointerdown={(e) => resize(e, c.id)} ondblclick={() => onedit({ op: "width", column: c.id, width: null })}></span>
          </th>
        {/each}
        <th class="add-col"><button type="button" onclick={addColumnMenu} title="Show another property as a column" aria-label="Add column"><Icon name="plus" size={12} /></button></th>
      </tr>
    </thead>
    <tbody>
      {#if first}<tr class="pad" aria-hidden="true"><td colspan={view.columns.length + 1} style:height="{first * win.rowH}px"></td></tr>{/if}
      {#each lines.slice(first, last) as l (l.kind === "row" ? l.r.path : `group:${l.title}`)}
      {#if l.kind === "group"}
        <tr class="group"><td colspan={view.columns.length + 1}><span class="g-name">{l.title}</span><span class="g-n">{l.n}</span></td></tr>
      {:else}
        {@const r = l.r}
        <tr class:lit={lit(r.path)} onmouseenter={() => hoverIn(r.path)} onmouseleave={hoverOut}>
          {#each r.cells as c, i (i)}
            {@const kind = editable(r, i) ? cellKind(r, i) : null}
            <td class:first={view.columns[i].id === "file.name"} class:editable={!!kind} class:bool={kind === "bool"} class:num={c.t === "num"} class:editing={isEditing(r, i)}
              tabindex={kind ? 0 : undefined} aria-label={kind ? `${view.columns[i].label} of ${r.path}` : undefined}
              onclick={() => activate(r, i)} onkeydown={(e) => cellKey(e, r, i)} ondblclick={() => { if (!kind && view.columns[i].id !== "file.name") openPath(r.path); }}>
              {#if isEditing(r, i) && kind}
                <CellEditor {kind} value={r.values[i]} label={view.columns[i].label} oncommit={(v) => onwrite(r.path, view.columns[i].key!, v)} onclose={closeEditor} />
              {:else if view.columns[i].id === "file.name" && c.t === "link"}
                <span class="name"><Icon name={c.path && !/\.md$/i.test(c.path) ? "file" : "file-text"} size={14} /><CellValue cell={c} /></span>
              {:else if kind === "bool"}
                <CellValue cell={asBool(c)} />
              {:else}
                <CellValue cell={c} />
              {/if}
            </td>
          {/each}
          <td class="add-col"></td>
        </tr>
      {/if}
      {/each}
      {#if last < lines.length}<tr class="pad" aria-hidden="true"><td colspan={view.columns.length + 1} style:height="{(lines.length - last) * win.rowH}px"></td></tr>{/if}
      {#if !view.rows.length}
        <tr><td class="empty" colspan={view.columns.length + 1}>No notes match this view. Change its filters, or add a note with “New”.</td></tr>
      {/if}
    </tbody>
    <tfoot>
      <tr>
        {#each view.columns as c (c.id)}
          <td><button type="button" class="sum" class:set={!!c.summary} class:left={kindOf(c.id) !== "number"} onclick={(e) => summaryMenu(e, c)} title="Summary of “{c.label}”" aria-label="Summary of {c.label}">
            {#if c.summary}<span class="sum-kind">{c.summary.kind}</span><span class="sum-val">{#if c.summary.value}<CellValue cell={{ t: "text", value: c.summary.value }} />{:else}—{/if}</span>{:else}<span class="sum-kind">Summarize</span>{/if}
          </button></td>
        {/each}
        <td class="add-col"></td>
      </tr>
    </tfoot>
  </table>
</div>

{#if menu}<ContextMenu x={menu.x} y={menu.y} items={menu.items} onclose={() => (menu = null)} />{/if}
{#if dialog}
  <InputDialog title="Name of the column “{dialog.label}” (every view)" value={dialog.label} onsubmit={(v) => { const d = dialog!; dialog = null; onedit({ op: "display_name", column: d.column, name: v || null }); }} oncancel={() => (dialog = null)} />
{/if}

<style>
  .scroll { overflow: auto; min-height: 0; flex: 1; }
  table { border-collapse: separate; border-spacing: 0; table-layout: fixed; }
  th, td { text-align: left; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; border-bottom: 1px solid var(--border); }
  th + th, td + td { border-left: 1px solid var(--border); }
  th { position: sticky; top: 0; z-index: 1; background: var(--bg-alt); padding: 0; user-select: none; }
  th.over { box-shadow: inset 2px 0 0 var(--accent); }
  th.dragging { opacity: .5; }
  .head { display: flex; align-items: center; gap: 4px; width: 100%; height: 30px; padding: 0 10px; color: var(--text-muted); font: inherit; font-weight: 600; font-size: .9em; text-align: left; }
  .head:hover { color: var(--text); background: var(--bg-hover); }
  .head .label { overflow: hidden; text-overflow: ellipsis; min-width: 0; }
  /* the header and the footer clip their cells: their focus rings go inside */
  .head:focus-visible, .sum:focus-visible { outline-offset: -2px; }
  .head :global(.icon) { flex: none; color: var(--accent); }
  .resize { position: absolute; top: 0; right: 0; width: 6px; height: 100%; cursor: col-resize; z-index: 2; }
  .resize:hover { background: var(--accent); opacity: .5; }
  td { padding: 0 10px; height: 32px; color: var(--text); }
  td.editable { cursor: text; }
  td.editable:hover { background: var(--bg-hover); }
  td.editing { position: relative; padding: 2px 4px; overflow: visible; white-space: normal; }
  /* inside the cell (the row clips it); `.editable` outweighs the global [tabindex] ring */
  td.editable:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
  td.num { text-align: right; }
  tbody tr:hover td { background: var(--bg-hover); }
  tbody tr.lit td { background: var(--accent-soft); }
  /* the footer's top edge is the last row's: one line, not two */
  tbody tr:last-child td { border-bottom: 0; }
  .name { display: inline-flex; align-items: center; gap: 8px; min-width: 0; max-width: 100%; }
  .name :global(.icon) { flex: none; color: var(--text-faint); }
  .name :global(.link) { color: var(--text); font-weight: 500; }
  th.add-col, td.add-col { padding: 0 4px; border-left: 0; }
  th.add-col button { display: grid; place-items: center; width: 28px; height: 28px; border-radius: var(--radius-sm); color: var(--text-faint); }
  th.add-col button:hover { background: var(--bg-hover); color: var(--text); }
  .empty { color: var(--text-faint); padding: 14px 10px; white-space: normal; }
  tr.pad td { padding: 0; border: 0; }
  /* a group's title is a row's height: the window counts lines of one height */
  tr.group td { position: sticky; left: 0; height: 32px; background: var(--bg-alt); font-weight: 600; color: var(--heading, var(--text)); }
  .g-n { margin-left: 8px; color: var(--text-faint); font-weight: 400; font-size: .88em; font-variant-numeric: tabular-nums; }
  tfoot td { position: sticky; bottom: 0; background: var(--bg); border-bottom: 0; border-top: 1px solid var(--border); padding: 0; height: 28px; }
  /* no column lines in the footer: unsummarised it is not read as one more, empty row */
  tfoot td + td { border-left: 0; }
  .sum { display: flex; align-items: baseline; justify-content: flex-end; gap: 6px; width: 100%; height: 100%; padding: 0 10px; font: inherit; font-size: .88em; color: var(--text-faint); }
  .sum.left { justify-content: flex-start; }
  .sum:not(.set) .sum-kind { opacity: 0; }
  .sum:hover .sum-kind, .sum:focus-visible .sum-kind { opacity: 1; }
  .sum:hover { background: var(--bg-hover); }
  .sum-val { color: var(--text); font-weight: 600; font-variant-numeric: tabular-nums; }
</style>
