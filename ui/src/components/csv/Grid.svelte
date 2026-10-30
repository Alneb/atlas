<script lang="ts">
  // The table's grid: only the rows on screen are drawn (a run's table has 10⁵ of them), a filter box under each
  // header, columns resized (drag the edge; double-click fits), reordered (drag the header) and frozen at the left.
  // A cell is edited in place: double-click, Enter, F2 or just typing; Enter goes down, Tab across, Esc gives up.
  // A cell starting with `=` is a formula (lib/csv/formula.ts): it shows its result, edits as its formula; columns are
  // lettered A, B… in their headers and rows numbered as shown, which is how a formula names them. A `[[link]]` in a
  // cell is drawn as a link and opens on a click (from the table's folder, as a note's would).
  // Selection like a spreadsheet: click, Shift+click, arrows (Shift extends); Ctrl+C / Ctrl+V as TSV; Delete clears.
  import type { SheetEdit, Op, Cell } from "../../lib/csv/edit.svelte";
  import { superOf } from "../../lib/keys";
  import { toast } from "../../lib/state.svelte";
  import { colName, formulas, isFormula } from "../../lib/csv/formula";
  import { isNum } from "../../lib/csv/parse";
  import { wikilinksIn } from "../../lib/wikilink-syntax";
  import { openWikilink } from "../../lib/links";

  let {
    edit, view, cols, widths, frozen, sort, filters = $bindable(), cur = $bindable(), anchor = $bindable(),
    onsort, onresize, onmovecol, onheadermenu, onrowmenu, path = "", readonly = "",
  }: {
    edit: SheetEdit; view: number[]; cols: number[]; widths: number[]; frozen: number; path?: string;
    /** why the cells cannot be changed here (an Excel sheet); empty: they can */
    readonly?: string;
    sort: { col: number; dir: 1 | -1 } | null; filters: Record<number, string>; cur: Cell; anchor: Cell;
    onsort: (c: number) => void; onresize: (c: number, w: number | "fit") => void; onmovecol: (from: number, to: number) => void;
    onheadermenu: (e: MouseEvent, c: number) => void; onrowmenu: (e: MouseEvent, r: number) => void;
  } = $props();

  const ROW = 26, HEAD = 26 + 28, NUMW = 56;
  let scroller = $state<HTMLDivElement>();
  let scrollTop = $state(0);
  let viewH = $state(600);
  let editing = $state<{ r: number; c: number; value: string } | null>(null);

  // a new object at each edit: the rows are changed in place, and a derived that returns the same object tells no one
  const sheet = $derived({ ...edit.sheet, version: edit.version });
  // the formulas' results, computed as the rows on screen ask for them, anew at each edit
  const calc = $derived((sheet.version, formulas(sheet.rows)));
  const first = $derived(Math.max(0, Math.floor(scrollTop / ROW) - 10));
  const last = $derived(Math.min(view.length, Math.ceil((scrollTop + viewH) / ROW) + 10));
  const total = $derived(NUMW + cols.reduce((s, c) => s + widths[c], 0));
  /** a frozen column's offset from the left edge */
  const left = $derived(cols.map((_, i) => NUMW + cols.slice(0, i).reduce((s, c) => s + widths[c], 0)));
  const inSel = (r: number, c: number) =>
    r >= Math.min(anchor.r, cur.r) && r <= Math.max(anchor.r, cur.r) && c >= Math.min(anchor.c, cur.c) && c <= Math.max(anchor.c, cur.c);
  const cell = (r: number, c: number) => sheet.rows[view[r]]?.[cols[c]] ?? "";
  /** a cell's text in pieces: plain text, and its `[[links]]` (what they show: the alias, else the target) */
  function pieces(text: string): { text: string; target?: string }[] {
    const out: { text: string; target?: string }[] = [];
    let at = 0;
    for (const l of wikilinksIn(text)) {
      if (l.start > at) out.push({ text: text.slice(at, l.start) });
      out.push({ text: l.alias ?? l.target, target: l.target });
      at = l.end;
    }
    if (at < text.length) out.push({ text: text.slice(at) });
    return out;
  }

  function select(r: number, c: number, extend = false) {
    if (!view.length || !cols.length) return;
    const nr = Math.max(0, Math.min(view.length - 1, r)), nc = Math.max(0, Math.min(cols.length - 1, c));
    cur = { r: nr, c: nc };
    if (!extend) anchor = { r: nr, c: nc };
    if (!scroller) return;
    const top = nr * ROW;
    if (top < scroller.scrollTop) scroller.scrollTop = top;
    else if (top + ROW + HEAD > scroller.scrollTop + scroller.clientHeight) scroller.scrollTop = top + ROW + HEAD - scroller.clientHeight;
    requestAnimationFrame(() => scroller?.querySelector(`td.cursor`)?.scrollIntoView({ block: "nearest", inline: "nearest" }));
  }

  function startEdit(r: number, c: number, value?: string) {
    if (!view.length || !cols.length) return;
    if (readonly) { toast(readonly); return; }
    editing = { r, c, value: value ?? cell(r, c) };
  }
  function commit(move?: [number, number]) {
    const e = editing;
    if (!e) return;
    editing = null;
    if (e.value !== cell(e.r, e.c)) edit.do({ kind: "cells", at: [{ r: view[e.r], c: cols[e.c], value: e.value }] });
    if (move) select(e.r + move[0], e.c + move[1]);
    scroller?.focus();
  }

  const box = () => ({ r0: Math.min(anchor.r, cur.r), r1: Math.max(anchor.r, cur.r), c0: Math.min(anchor.c, cur.c), c1: Math.max(anchor.c, cur.c) });

  async function copy() {
    const { r0, r1, c0, c1 } = box();
    const text = Array.from({ length: r1 - r0 + 1 }, (_, i) => Array.from({ length: c1 - c0 + 1 }, (_, j) => cell(r0 + i, c0 + j)).join("\t")).join("\n");
    try { await navigator.clipboard.writeText(text); toast(`Copied ${(r1 - r0 + 1) * (c1 - c0 + 1)} cell${r1 === r0 && c1 === c0 ? "" : "s"}`); }
    catch (err) { toast("Copy failed", String(err), "error"); }
  }

  /** TSV from the clipboard written from the cursor on; rows past the end are added (one undo for all of it). */
  async function paste() {
    if (readonly) { toast(readonly); return; }
    let text: string;
    try { text = await navigator.clipboard.readText(); } catch (err) { return toast("Paste failed", String(err), "error"); }
    const block = text.replace(/\r?\n$/, "").split(/\r?\n/).map((l) => l.split("\t"));
    const ops: Op[] = [];
    const missing = cur.r + block.length - view.length;
    if (missing > 0) ops.push({ kind: "insertRows", at: sheet.rows.length, rows: Array.from({ length: missing }, () => []) });
    const at: { r: number; c: number; value: string }[] = [];
    block.forEach((line, i) => line.forEach((value, j) => {
      const c = cols[cur.c + j];
      if (c === undefined) return;
      const r = cur.r + i < view.length ? view[cur.r + i] : sheet.rows.length + (cur.r + i - view.length);
      at.push({ r, c, value });
    }));
    ops.push({ kind: "cells", at });
    edit.do({ kind: "batch", ops });
  }

  function clear() {
    if (readonly) { toast(readonly); return; }
    const { r0, r1, c0, c1 } = box(), at: { r: number; c: number; value: string }[] = [];
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) if (cell(r, c) !== "") at.push({ r: view[r], c: cols[c], value: "" });
    if (at.length) edit.do({ kind: "cells", at });
  }

  function onKey(e: KeyboardEvent) {
    if (editing || (e.target as HTMLElement).tagName === "INPUT") return;
    const mod = e.ctrlKey || superOf(e);
    if (mod && e.key.toLowerCase() === "c") { e.preventDefault(); void copy(); return; }
    if (mod && e.key.toLowerCase() === "v") { e.preventDefault(); void paste(); return; }
    if (mod || e.altKey) return;
    const page = Math.max(1, Math.floor((scroller?.clientHeight ?? 600) / ROW) - 3);
    const moves: Record<string, [number, number]> = {
      ArrowDown: [1, 0], ArrowUp: [-1, 0], ArrowRight: [0, 1], ArrowLeft: [0, -1], PageDown: [page, 0], PageUp: [-page, 0],
    };
    let to: [number, number] | null = null;
    if (e.key in moves) to = [cur.r + moves[e.key][0], cur.c + moves[e.key][1]];
    else if (e.key === "Home") to = [cur.r, 0];
    else if (e.key === "End") to = [cur.r, cols.length - 1];
    else if (e.key === "Tab") to = [cur.r, cur.c + (e.shiftKey ? -1 : 1)];
    if (to) { e.preventDefault(); select(to[0], to[1], e.shiftKey && e.key !== "Tab"); return; }
    if (e.key === "Enter" || e.key === "F2") { e.preventDefault(); startEdit(cur.r, cur.c); return; }
    if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); clear(); return; }
    if (e.key.length === 1) { e.preventDefault(); startEdit(cur.r, cur.c, e.key); } // typing replaces the cell, as in a spreadsheet
  }

  function editKey(e: KeyboardEvent) {
    e.stopPropagation();
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); commit([1, 0]); }
    else if (e.key === "Tab") { e.preventDefault(); commit([0, e.shiftKey ? -1 : 1]); }
    else if (e.key === "Escape") { e.preventDefault(); editing = null; scroller?.focus(); }
  }

  // a column's edge dragged: its new width; a double-click fits it to what it holds
  function resizeStart(e: PointerEvent, c: number) {
    e.preventDefault(); e.stopPropagation();
    const x0 = e.clientX, w0 = widths[c], el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    const move = (m: PointerEvent) => onresize(c, Math.max(40, w0 + m.clientX - x0));
    const up = () => { el.removeEventListener("pointermove", move); el.removeEventListener("pointerup", up); };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
  }

  let dragFrom = $state<number | null>(null);
  let dropAt = $state<number | null>(null);
  const autofocus = (el: HTMLInputElement) => { el.focus(); el.setSelectionRange(el.value.length, el.value.length); };

  $effect(() => {
    if (!scroller) return;
    const ro = new ResizeObserver(() => (viewH = scroller?.clientHeight ?? 600));
    ro.observe(scroller);
    return () => ro.disconnect();
  });
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<div class="grid-scroll" bind:this={scroller} onscroll={() => (scrollTop = scroller!.scrollTop)} tabindex="0" onkeydown={onKey} role="grid" aria-label="Table" aria-rowcount={view.length}>
  <table style:width="{total}px">
    <colgroup><col style:width="{NUMW}px" />{#each cols as c (c)}<col style:width="{widths[c]}px" />{/each}</colgroup>
    <thead>
      <tr class="names">
        <th class="rownum frozen" style:left="0">#</th>
        {#each cols as c, i (c)}
          <th class:num={sheet.numeric[c]} class:frozen={i < frozen} class:drop={dropAt === i && dragFrom !== i} style:left={i < frozen ? `${left[i]}px` : undefined}
            draggable="true" title="{sheet.header[c]} — click to sort, drag to move, right-click for more"
            ondragstart={(e) => { dragFrom = i; e.dataTransfer?.setData("text/plain", String(i)); }}
            ondragover={(e) => { if (dragFrom !== null) { e.preventDefault(); dropAt = i; } }}
            ondragleave={() => { if (dropAt === i) dropAt = null; }}
            ondrop={(e) => { e.preventDefault(); if (dragFrom !== null && dragFrom !== i) onmovecol(dragFrom, i); dragFrom = dropAt = null; }}
            ondragend={() => (dragFrom = dropAt = null)}
            onclick={() => onsort(c)} oncontextmenu={(e) => { e.preventDefault(); onheadermenu(e, c); }}>
            <span class="letter" aria-hidden="true">{colName(c)}</span><span class="label">{sheet.header[c]}</span>{#if sort?.col === c}<span class="dir">{sort.dir === 1 ? "▲" : "▼"}</span>{/if}
            <button class="more" aria-label="Column {sheet.header[c]}: more" onclick={(e) => { e.stopPropagation(); onheadermenu(e, c); }}>⋯</button>
            <!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events (the menu's "Fit width" is the keyboard's way) -->
            <span class="grip" onpointerdown={(e) => resizeStart(e, c)} ondblclick={(e) => { e.stopPropagation(); onresize(c, "fit"); }} onclick={(e) => e.stopPropagation()}></span>
          </th>
        {/each}
      </tr>
      <tr class="filters">
        <th class="rownum frozen" style:left="0"></th>
        {#each cols as c, i (c)}
          <th class:frozen={i < frozen} style:left={i < frozen ? `${left[i]}px` : undefined}>
            <input class="filter" class:on={!!filters[c]?.trim()} placeholder={sheet.numeric[c] ? ">0, 1..5, empty" : "contains, =x, /re/"} spellcheck="false"
              aria-label="Filter {sheet.header[c]}" bind:value={filters[c]} />
          </th>
        {/each}
      </tr>
    </thead>
    <tbody>
      <tr class="spacer" style:height="{first * ROW}px"></tr>
      {#each view.slice(first, last) as dataRow, j (dataRow)}
        {@const r = first + j}
        <tr>
          <td class="rownum frozen" style:left="0" oncontextmenu={(e) => { e.preventDefault(); select(r, cur.c); onrowmenu(e, r); }}>{dataRow + 1}</td>
          {#each cols as c, i (c)}
            {@const raw = sheet.rows[dataRow]?.[c] ?? ""}
            {@const f = isFormula(raw)}
            {@const xf = sheet.formulas?.get(`${dataRow},${c}`)}
            {@const v = f ? calc.shown(dataRow, c) : raw}
            <td class:num={sheet.numeric[c] || (f && isNum(v))} class:frozen={i < frozen} class:sel={inSel(r, i)} class:cursor={cur.r === r && cur.c === i}
              class:formula={f || !!xf} class:error={f && v.startsWith("#")}
              style:left={i < frozen ? `${left[i]}px` : undefined} title={f ? raw : xf ? `=${xf}` : v.length > 24 ? v : undefined}
              onmousedown={(e) => { if (editing?.r === r && editing.c === i) return; e.preventDefault(); if (editing) commit(); scroller?.focus(); select(r, i, e.shiftKey); }}
              ondblclick={() => startEdit(r, i)}
              oncontextmenu={(e) => { e.preventDefault(); if (!inSel(r, i)) select(r, i); onrowmenu(e, r); }}>
              {#if editing?.r === r && editing.c === i}
                <input class="cell-edit" bind:value={editing.value} onkeydown={editKey} onblur={() => commit()} use:autofocus aria-label="Edit cell" />
              {:else if v.includes("[[")}{#each pieces(v) as p, k (k)}{#if p.target}<!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events (the cell's Enter edits; the link is the mouse's way) --><span class="wl" role="link" tabindex="-1" title={p.target}
                  onmousedown={(e) => e.stopPropagation()} onclick={(e) => { e.stopPropagation(); void openWikilink(p.target!, path, { beside: e.ctrlKey || e.metaKey }); }}>{p.text}</span>{:else}{p.text}{/if}{/each}{:else}{v}{/if}
            </td>
          {/each}
        </tr>
      {/each}
      <tr class="spacer" style:height="{(view.length - last) * ROW}px"></tr>
    </tbody>
  </table>
</div>

<style>
  .grid-scroll { flex: 1; min-height: 0; overflow: auto; position: relative; }
  .grid-scroll:focus { outline: none; }
  table { border-collapse: separate; border-spacing: 0; table-layout: fixed; font-family: var(--code-font, var(--font-mono));
    font-size: calc(12.5px * var(--ui-scale, 1)); font-variant-numeric: tabular-nums; }
  th, td { height: 26px; padding: 0 10px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; text-align: left;
    border-bottom: 1px solid var(--border); border-right: 1px solid color-mix(in srgb, var(--border) 60%, transparent); background: var(--bg); }
  thead th { position: sticky; z-index: 2; background: var(--bg-alt); }
  tr.names th { top: 0; color: var(--heading); font-family: var(--font-ui); font-weight: 600; cursor: pointer; user-select: none; padding-right: 30px; }
  tr.names th:hover { background: var(--bg-hover); }
  tr.names th.drop { box-shadow: inset 3px 0 0 var(--accent); }
  tr.filters th { top: 26px; height: 28px; padding: 2px 4px; }
  .frozen { position: sticky; z-index: 1; }
  thead .frozen { z-index: 3; }
  .rownum { color: var(--text-faint); text-align: right; font-size: .9em; background: var(--bg-alt); }
  .num { text-align: right; }
  th.num { text-align: right; }
  .label { overflow: hidden; text-overflow: ellipsis; }
  .letter { margin-right: 6px; font-family: var(--code-font, var(--font-mono)); font-weight: 400; font-size: .85em; color: var(--text-faint); }
  td.formula { color: var(--accent); }
  .wl { color: var(--link, var(--accent)); text-decoration: underline; text-decoration-color: color-mix(in srgb, currentColor 40%, transparent); cursor: pointer; }
  .wl:hover { text-decoration-color: currentColor; }
  td.error { color: var(--red); }
  .dir { margin-left: 4px; font-size: .8em; color: var(--accent); }
  .more { position: absolute; right: 8px; top: 3px; width: 18px; height: 18px; padding: 0; border-radius: 4px; color: var(--text-faint); opacity: 0; line-height: 1; }
  tr.names th:hover .more, .more:focus-visible { opacity: 1; }
  .more:hover { background: var(--bg-elev); color: var(--text); }
  .grip { position: absolute; right: -3px; top: 0; bottom: 0; width: 7px; cursor: col-resize; z-index: 4; }
  .grip:hover { background: color-mix(in srgb, var(--accent) 45%, transparent); }
  .filter { width: 100%; box-sizing: border-box; font: inherit; font-family: var(--font-ui); font-size: calc(11.5px * var(--ui-scale, 1)); color: var(--text);
    background: var(--bg); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 2px 6px; font-weight: 400; }
  .filter::placeholder { color: var(--text-faint); opacity: .7; }
  .filter:focus { outline: none; border-color: var(--accent); }
  .filter.on { border-color: var(--accent); background: var(--accent-soft); }
  tbody tr:not(.spacer):hover td:not(.sel) { background: color-mix(in srgb, var(--accent) 5%, var(--bg)); }
  tbody tr:not(.spacer):hover td.rownum { background: var(--bg-hover); }
  tr.spacer { border: 0; padding: 0; }
  td.sel { background: color-mix(in srgb, var(--accent) 14%, var(--bg)); }
  td.cursor { box-shadow: inset 0 0 0 2px var(--accent); }
  td:has(.cell-edit) { padding: 0; overflow: visible; }
  .cell-edit { width: 100%; height: 100%; box-sizing: border-box; font: inherit; color: var(--text); background: var(--bg-elev); border: 2px solid var(--accent); padding: 0 8px; outline: none; }
</style>
