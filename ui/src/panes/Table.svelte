<script lang="ts">
  // A CSV / TSV / whitespace table as a spreadsheet: read in a worker (lib/csv/io.ts), edited in place with undo
  // (lib/csv/edit.svelte.ts), saved with Ctrl+S in the file's own layout — only edited rows rewritten (lib/csv/write.ts).
  // Filters per column, sort, columns resized / hidden / frozen / reordered (this device's view of the file, kept per
  // file), numbers of the selection or column underneath, and a plot of the rows shown. Named views (filters, sort,
  // hidden columns, grouping) are saved in the file's companion note, a `table-views` block (lib/csv/views.ts), for every
  // device. Grouped by a column, the rows come group by group and a panel gives each group's sub-totals (GroupPanel).
  import { onMount } from "svelte";
  import * as prefsStore from "../lib/prefs";
  import { errText } from "../lib/text";
  import { shownPath } from "../lib/paths";
  import { superOf } from "../lib/keys";
  import { on } from "../lib/bus";
  import { open } from "../lib/dock";
  import type { PaneProps } from "../lib/dock";
  import { toast } from "../lib/state.svelte";
  import { api, ApiError } from "../lib/api";
  import { readViews, writeViews, type TableView } from "../lib/csv/views";
  import { writeXlsx } from "../lib/csv/xlsx-write";
  import { diskMtime, loadSheet, loadWorkbook, saveSheet } from "../lib/csv/io";
  import type { Sheet } from "../lib/csv/parse";
  import { SheetEdit, type Cell } from "../lib/csv/edit.svelte";
  import { compile, compare } from "../lib/csv/filter";
  import type { Measure } from "../lib/csv/group";
  import { valuesOf } from "../lib/csv/formula";
  import { numericColumns } from "../lib/csv/parse";
  import Icon from "../components/Icon.svelte";
  import Grid from "../components/csv/Grid.svelte";
  import PlotPanel from "../components/csv/PlotPanel.svelte";
  import GroupPanel from "../components/csv/GroupPanel.svelte";
  import StatsBar from "../components/csv/StatsBar.svelte";
  import ContextMenu, { type MenuItem } from "../components/ContextMenu.svelte";
  import InputDialog from "../components/InputDialog.svelte";

  let { spec }: PaneProps<"table"> = $props();

  let edit = $state.raw<SheetEdit | null>(null);
  // an Excel workbook: its sheets, the one shown; read here only (writing would lose its styles), saved as CSV
  const xlsx = $derived(/\.xlsx$/i.test(spec.path));
  const READONLY = "An Excel sheet is shown here, not changed: “Save as CSV” makes a table you can edit";
  let book = $state.raw<{ name: string; sheet: Sheet }[] | null>(null);
  let sheetAt = $state(0);
  let mtime = 0;
  let progress = $state<number | null>(null);
  let error = $state("");
  let conflict = $state(false);
  let saving = $state(false);
  let quick = $state("");
  let filters = $state<Record<number, string>>({});
  let sort = $state<{ col: number; dir: 1 | -1 } | null>(null);
  /** the column the rows are grouped by */
  let group = $state<number | null>(null);
  let groupMeasure = $state<Measure>("sum");
  let cur = $state<Cell>({ r: 0, c: 0 });
  let anchor = $state<Cell>({ r: 0, c: 0 });
  let plotOn = $state(false);
  let menu = $state<{ x: number; y: number; items: MenuItem[] } | null>(null);
  let dialog = $state<{ title: string; value: string; ok: string; submit: (v: string) => void } | null>(null);
  let pane = $state<HTMLDivElement>();
  /** the keyboard back to the grid (after a menu or a dialog), so Ctrl+S, Ctrl+Z and the arrows reach it */
  // only when nothing has it: a menu item that opens a dialog ("Save this view as…") leaves the focus there
  const focusGrid = () => requestAnimationFrame(() => {
    if (document.activeElement && document.activeElement !== document.body) return;
    pane?.querySelector<HTMLElement>(".grid-scroll")?.focus();
  });

  // a new object at each edit (the rows change in place; the same object would tell no one)
  const sheet = $derived(edit ? { ...edit.sheet, version: edit.version } : null);
  // the rows as they read (formulas' results): what the filters, sort, footer and plot use; a formula column is numeric
  // when its results are
  const values = $derived(sheet ? (sheet.version, valuesOf(sheet.rows)) : []);
  const numeric = $derived(sheet ? (values === sheet.rows ? sheet.numeric : numericColumns(sheet.header.length, values)) : []);

  // --- this device's view of the file: widths, hidden, frozen, order (by column name, so edits keep them) ---------
  type Prefs = { widths: Record<string, number>; hidden: string[]; frozen: number; order: string[] };
  const prefKey = () => `atlas.table.view:${spec.path}`;
  let prefs = $state<Prefs>({ widths: {}, hidden: [], frozen: 0, order: [] });
  function loadPrefs() { prefs = { ...prefs, ...prefsStore.load(prefKey(), {}) }; }
  function savePrefs() { prefsStore.save(prefKey(), prefs); }
  /** a column's name made unique by its occurrence ("col", "col") */
  const keys = $derived(sheet ? sheet.header.map((h, i) => `${h}\u0000${sheet.header.slice(0, i).filter((x) => x === h).length}`) : []);
  const cols = $derived.by(() => {
    if (!sheet) return [] as number[];
    const at = new Map(keys.map((k, i) => [k, i]));
    const ordered = prefs.order.map((k) => at.get(k)).filter((i): i is number => i !== undefined);
    const all = [...new Set([...ordered, ...keys.map((_, i) => i)])];
    return all.filter((i) => !prefs.hidden.includes(keys[i]));
  });
  /** a width by what the column holds: its longest text in the first rows, within reason */
  function fitWidth(c: number): number {
    if (!sheet) return 120;
    let n = 0;
    for (const r of sheet.rows.slice(0, 500)) n = Math.max(n, (r[c] ?? "").length);
    // the header's name has the "⋯" button beside it (30 px), a cell only its padding
    return Math.round(Math.min(420, Math.max(64, n * 7.6 + 24, (sheet.header[c]?.length ?? 4) * 7.8 + 52)));
  }
  const widths = $derived(sheet ? sheet.header.map((_, c) => prefs.widths[keys[c]] ?? fitWidth(c)) : []);

  // --- the rows shown: the quick filter, the column filters, the sort ---------------------------------------------
  const view = $derived.by(() => {
    if (!sheet) return [] as number[];
    const tests = Object.entries(filters).map(([c, q]) => [Number(c), compile(q)] as const).filter((t) => t[1]);
    const q = quick.trim().toLowerCase();
    let idx: number[] = [];
    for (let i = 0; i < values.length; i++) {
      const r = values[i];
      if (q && !r.some((c) => c.toLowerCase().includes(q))) continue;
      if (tests.some(([c, t]) => !t!(r[c] ?? ""))) continue;
      idx.push(i);
    }
    if (sort) {
      const { col, dir } = sort, num = numeric[col], rows = values;
      // blanks last whichever way it is sorted
      idx = idx.sort((a, b) => {
        const [x, y] = [rows[a][col] ?? "", rows[b][col] ?? ""];
        if (!x.trim() !== !y.trim()) return x.trim() ? -1 : 1;
        return dir * compare(x, y, num) || a - b;
      });
    }
    if (group !== null && group < (sheet.header.length)) {
      // group by group (as the panel orders them), the sort kept inside each; one value whatever its case or spaces
      const g = group, num = numeric[g], dir = sort?.col === g ? sort.dir : 1, rows = values;
      const key = (i: number) => (rows[i][g] ?? "").trim();
      idx = idx.sort((a, b) => {
        const [x, y] = [key(a), key(b)];
        return !x !== !y ? (x ? -1 : 1) : dir * compare(x, y, num);
      });
    }
    return idx;
  });

  // --- what the footer counts and the plot draws -------------------------------------------------------------------
  const selBox = $derived({ r0: Math.min(anchor.r, cur.r), r1: Math.max(anchor.r, cur.r), c0: Math.min(anchor.c, cur.c), c1: Math.max(anchor.c, cur.c) });
  const multi = $derived(selBox.r1 > selBox.r0 || selBox.c1 > selBox.c0);
  const statCells = $derived.by(() => {
    if (!sheet || !cols.length) return { cells: [] as string[], what: "" };
    if (multi) {
      const out: string[] = [];
      for (let r = selBox.r0; r <= selBox.r1; r++) for (let c = selBox.c0; c <= selBox.c1; c++) out.push(values[view[r]]?.[cols[c]] ?? "");
      return { cells: out, what: `${selBox.r1 - selBox.r0 + 1} × ${selBox.c1 - selBox.c0 + 1} selected` };
    }
    const c = cols[Math.min(cur.c, cols.length - 1)];
    return { cells: view.map((i) => values[i][c] ?? ""), what: sheet.header[c] };
  });
  const shownRows = $derived(sheet ? view.map((i) => values[i]) : []);
  const selectedRows = $derived(sheet && selBox.r1 > selBox.r0 ? view.slice(selBox.r0, selBox.r1 + 1).map((i) => values[i]) : null);

  // --- named views, in the companion note -------------------------------------------------------------------------
  let views = $state<TableView[]>([]);
  let viewName = $state("");
  let notePath = "";
  const note = (find: boolean) => api.companion({ path: spec.path, title: null, properties: {}, block: null, find });
  let viewsRead = $state(false);
  async function loadViews() {
    try {
      notePath = (await note(true)).path;
      views = readViews((await api.file(notePath)).text);
    } catch { views = []; /* no note yet: no views */ }
    viewsRead = true;
  }
  // the view a link or an embed names (`x.csv#view=Cheap`), applied once the rows and the note are read; again when
  // the link changes
  let viewAsked = "";
  $effect(() => {
    const want = spec.view ?? "";
    if (!want || want === viewAsked || !sheet || !viewsRead) return;
    viewAsked = want;
    const v = views.find((x) => x.name === want);
    if (v) applyView(v); else toast(`No view “${want}” in this table's note`, shownPath(spec.path), "error");
  });
  /** `change` applied to the note's views as they are on disk now (another device's kept), then written. */
  async function changeViews(change: (vs: TableView[]) => TableView[], done: string) {
    try {
      notePath = (await note(false)).path;
      for (let tries = 0; ; tries++) {
        const f = await api.file(notePath);
        const next = change(readViews(f.text));
        try { await api.putFile(notePath, writeViews(f.text, next), f.mtime); views = next; break; }
        catch (e) { if (!(e instanceof ApiError && e.status === 409) || tries > 1) throw e; }
      }
      toast(done, shownPath(notePath));
    } catch (e) { toast("The view was not saved", errText(e), "error"); }
  }
  /** What the table shows now, columns by name. */
  function currentView(name: string): TableView {
    const h = sheet?.header ?? [];
    return {
      name, quick,
      filters: Object.fromEntries(Object.entries(filters).filter(([c]) => h[Number(c)] !== undefined).map(([c, q]) => [h[Number(c)], q])),
      sort: sort && h[sort.col] !== undefined ? { col: h[sort.col], dir: sort.dir } : undefined,
      hidden: prefs.hidden.map((k) => k.split("\u0000")[0]),
      group: group !== null ? h[group] : undefined,
    };
  }
  function applyView(v: TableView) {
    if (!sheet) return;
    const h = sheet.header, at = (name: string) => h.indexOf(name);
    quick = v.quick ?? "";
    filters = Object.fromEntries(Object.entries(v.filters ?? {}).filter(([n]) => at(n) >= 0).map(([n, q]) => [at(n), q]));
    sort = v.sort && at(v.sort.col) >= 0 ? { col: at(v.sort.col), dir: v.sort.dir } : null;
    setHidden(keys.filter((_, i) => (v.hidden ?? []).includes(h[i])));
    group = v.group && at(v.group) >= 0 ? at(v.group) : null;
    viewName = v.name;
  }
  function viewsMenu(e: MouseEvent) {
    const upsert = (v: TableView) => (vs: TableView[]) => vs.some((x) => x.name === v.name) ? vs.map((x) => (x.name === v.name ? v : x)) : [...vs, v];
    const saveAs = () => ask("Save this view as", viewName, "Save", (n) => {
      const name = n.trim();
      if (name) void changeViews(upsert(currentView(name)), `View “${name}” saved`).then(() => (viewName = name));
    });
    const mine = views.find((v) => v.name === viewName);
    menu = { x: e.clientX, y: e.clientY, items: [
      ...views.map((v) => ({ label: v.name, icon: v.name === viewName ? "check" : undefined, run: () => applyView(v) }) as MenuItem),
      ...(views.length ? ["sep" as const] : []),
      ...(mine ? [{ label: `Update “${mine.name}”`, detail: "with the filters, sort and columns shown now", run: () => void changeViews(upsert(currentView(mine.name)), `View “${mine.name}” updated`) } as MenuItem] : []),
      { label: "Save this view as…", icon: "plus", detail: "kept in the file's note", run: saveAs },
      ...(mine ? [{ label: "Copy its embed", icon: "copy", detail: "paste it in a note: the table shown with this view", run: () => {
        const embed = `![[${spec.path}#view=${mine.name}]]`;
        void navigator.clipboard.writeText(embed).then(() => toast("Copied — paste it in a note", embed), () => toast("Could not copy", embed, "error"));
      } } as MenuItem] : []),
      { label: "Everything", detail: "no filter, the file's order, every column", run: () => { quick = ""; filters = {}; sort = null; group = null; setHidden([]); viewName = ""; } },
      ...(mine ? [{ label: `Delete “${mine.name}”`, icon: "trash", danger: true, run: () => void changeViews((vs) => vs.filter((v) => v.name !== mine.name), `View “${mine.name}” deleted`).then(() => (viewName = "")) } as MenuItem] : []),
    ] };
  }

  // --- reading and saving ------------------------------------------------------------------------------------------
  async function load() {
    try {
      progress = 0;
      if (xlsx) {
        const got = await loadWorkbook(spec.path);
        if (!got.sheets.length) throw new Error("this workbook has no sheet with cells");
        book = got.sheets;
        mtime = got.mtime;
        pickSheet(Math.min(sheetAt, got.sheets.length - 1));
      } else {
        const got = await loadSheet(spec.path, (p) => (progress = p));
        edit = new SheetEdit(got.sheet);
        mtime = got.mtime;
      }
      error = ""; conflict = false;
    } catch (e) { error = errText(e); }
    finally { progress = null; }
  }
  function pickSheet(i: number) {
    if (!book) return;
    sheetAt = i;
    edit = new SheetEdit(book[i].sheet);
    filters = {}; sort = null; group = null; cur = { r: 0, c: 0 }; anchor = { r: 0, c: 0 };
  }
  /** The sheet shown, as a CSV beside the workbook (a new name: an existing file is never written over), opened. */
  async function saveAsCsv() {
    if (!edit || !book) return;
    const stem = spec.path.replace(/\.xlsx$/i, "") + (book.length > 1 ? ` - ${book[sheetAt].name.replace(/[\\/:*?"<>|]+/g, " ").trim()}` : "");
    let to = `${stem}.csv`;
    for (let n = 2; (await diskMtime(to)) > 0; n++) to = `${stem} (${n}).csv`;
    try {
      await saveSheet(to, edit.sheet, 0);
      toast("Saved as CSV", shownPath(to));
      open({ kind: "table", path: to });
    } catch (e) { toast("Not saved", errText(e), "error"); }
  }
  /** The table as a new Excel workbook beside it (a free name: an existing workbook is never written over), formulas
   *  kept as Excel's. */
  async function saveAsXlsx() {
    if (!edit) return;
    const stem = spec.path.replace(/\.[^./]+$/, ""), base = stem.split("/").pop() ?? "Sheet1";
    let to = `${stem}.xlsx`;
    for (let n = 2; (await diskMtime(to)) > 0; n++) to = `${stem} (${n}).xlsx`;
    try {
      const s = edit.sheet, bytes = await writeXlsx(base, s.headerSource === "none" ? null : s.header, s.rows);
      await api.upload(to, new Blob([bytes as BlobPart], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
      toast("Saved as an Excel workbook", shownPath(to));
      open({ kind: "table", path: to });
    } catch (e) { toast("Not saved", errText(e), "error"); }
  }
  async function save(force = false) {
    if (xlsx) { toast(READONLY); return; }
    if (!edit || saving || (!edit.dirty && !force)) return;
    saving = true;
    try {
      mtime = await saveSheet(spec.path, edit.sheet, mtime, force);
      edit.markSaved();
      conflict = false;
      toast("Saved", shownPath(spec.path));
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) conflict = true;
      else toast("Save failed", errText(e), "error");
    } finally { saving = false; }
  }

  /** Ctrl+S / Ctrl+Z / Ctrl+Y: from inside the table, or from nowhere (a closed menu leaves the focus on the page)
   *  while the table is on screen. */
  function onKey(e: KeyboardEvent) {
    const mod = e.ctrlKey || superOf(e), at = document.activeElement;
    if (!mod || !pane?.offsetParent || (at && at !== document.body && !pane.contains(at))) return;
    if ((e.target as HTMLElement).tagName === "INPUT") return;
    const k = e.key.toLowerCase();
    if (k === "s") { e.preventDefault(); void save(); }
    else if (k === "z" && !e.shiftKey) { e.preventDefault(); edit?.undo(); }
    else if ((k === "z" && e.shiftKey) || k === "y") { e.preventDefault(); edit?.redo(); }
  }

  // --- columns -------------------------------------------------------------------------------------------------------
  function sortBy(c: number) {
    sort = sort?.col !== c ? { col: c, dir: 1 } : sort.dir === 1 ? { col: c, dir: -1 } : null; // ▲ ▼ then as in the file
  }
  function resize(c: number, w: number | "fit") {
    prefs.widths = { ...prefs.widths, [keys[c]]: w === "fit" ? fitWidth(c) : Math.round(w) };
    savePrefs();
  }
  function moveCol(from: number, to: number) {
    const order = cols.map((i) => keys[i]);
    order.splice(to, 0, order.splice(from, 1)[0]);
    prefs.order = [...order, ...prefs.hidden];
    if (prefs.frozen > 0 && (from < prefs.frozen) !== (to < prefs.frozen)) prefs.frozen = Math.max(0, Math.min(cols.length, prefs.frozen));
    savePrefs();
  }
  const setHidden = (h: string[]) => { prefs.hidden = h; savePrefs(); };
  const ask = (title: string, value: string, ok: string, submit: (v: string) => void) => (dialog = { title, value, ok, submit });

  function headerMenu(e: MouseEvent, c: number) {
    if (!edit || !sheet) return;
    const pos = cols.indexOf(c), ed = edit;
    const changes = (items: MenuItem[]) => (xlsx ? [] : items);
    menu = { x: e.clientX, y: e.clientY, items: [
      { label: "Sort ascending", icon: "arrow-up", run: () => (sort = { col: c, dir: 1 }) },
      { label: "Sort descending", icon: "arrow-down", run: () => (sort = { col: c, dir: -1 }) },
      ...(sort ? [{ label: "Back to the file's order", run: () => (sort = null) } as MenuItem] : []),
      group === c
        ? { label: "Ungroup", icon: "rows", run: () => (group = null) }
        : { label: "Group by this column", icon: "rows", detail: "its values' rows together, with sub-totals", run: () => (group = c) },
      "sep",
      { label: "Hide column", icon: "eye", run: () => setHidden([...prefs.hidden, keys[c]]) },
      { label: pos < prefs.frozen ? "Unfreeze columns" : "Freeze up to here", detail: "kept in view when scrolling sideways", run: () => { prefs.frozen = pos < prefs.frozen ? 0 : pos + 1; savePrefs(); } },
      { label: "Fit width", run: () => resize(c, "fit") },
      ...changes(["sep",
      { label: "Rename…", icon: "edit", run: () => ask("Rename column", sheet.header[c], "Rename", (v) => v.trim() && ed.do({ kind: "rename", c, name: v.trim() })) },
      { label: "Insert column left", icon: "plus", run: () => ed.do({ kind: "insertCol", at: c, name: "new" }) },
      { label: "Insert column right", icon: "plus", run: () => ed.do({ kind: "insertCol", at: c + 1, name: "new" }) },
      { label: "Delete column", icon: "minus", danger: true, disabled: sheet.header.length < 2, run: () => ed.do({ kind: "deleteCol", at: c }) }]),
    ] };
  }

  function rowMenu(e: MouseEvent, r: number) {
    if (!edit || !sheet || xlsx) return;
    const ed = edit, data = view[r], { r0, r1 } = selBox, many = r1 > r0;
    // contiguous in the file only when the table shows the file's order unfiltered
    const plain = !sort && group === null && view.length === sheet.rows.length;
    menu = { x: e.clientX, y: e.clientY, items: [
      { label: "Insert row above", icon: "plus", run: () => ed.do({ kind: "insertRows", at: data, rows: [[]] }) },
      { label: "Insert row below", icon: "plus", run: () => ed.do({ kind: "insertRows", at: data + 1, rows: [[]] }) },
      { label: "Move up", icon: "arrow-up", disabled: !plain || data === 0, run: () => { ed.do({ kind: "moveRows", from: view[r0], count: r1 - r0 + 1, to: view[r0] - 1 }); cur = { ...cur, r: cur.r - 1 }; anchor = { ...anchor, r: anchor.r - 1 }; } },
      { label: "Move down", icon: "arrow-down", disabled: !plain || view[r1] >= sheet.rows.length - 1, run: () => { ed.do({ kind: "moveRows", from: view[r0], count: r1 - r0 + 1, to: view[r0] + 1 }); cur = { ...cur, r: cur.r + 1 }; anchor = { ...anchor, r: anchor.r + 1 }; } },
      "sep",
      { label: many ? `Delete ${r1 - r0 + 1} rows` : "Delete row", icon: "minus", danger: true,
        run: () => {
          // from the bottom up, so the indices of the rest stay right; one undo for all
          const rows = view.slice(r0, r1 + 1).sort((a, b) => b - a);
          ed.do({ kind: "batch", ops: rows.map((i) => ({ kind: "deleteRows", at: i, count: 1 })) });
          cur = anchor = { r: Math.min(r0, Math.max(0, view.length - 1)), c: cur.c };
        } },
    ] };
  }

  onMount(() => {
    loadPrefs();
    void load();
    void loadViews();
    // a change on disk that is not our own save: read again when nothing is unsaved here, else say so (a reload would
    // also lose the undo history)
    const off = on("fs", async (e) => {
      if (notePath && e.paths.includes(notePath)) void loadViews(); // the views changed elsewhere
      if (!e.paths.includes(spec.path) || saving || (await diskMtime(spec.path)) === mtime) return;
      if (edit?.dirty) conflict = true; else void load();
    });
    return off;
  });
</script>

<svelte:window onkeydown={onKey} />
<div class="table-pane" bind:this={pane}>
  <header>
    <span class="name"><Icon name="table" size={14} /> {shownPath(spec.path)}{#if edit?.dirty && !xlsx}<span class="dirty" title="Unsaved changes (Ctrl+S saves)">●</span>{/if}</span>
    {#if sheet}<span class="meta">{view.length === sheet.rows.length ? sheet.rows.length : `${view.length} / ${sheet.rows.length}`} rows · {sheet.header.length} columns · {sheet.delimiterName}</span>{/if}
    <input class="filter" placeholder="Filter rows…" bind:value={quick} spellcheck="false" />
    {#if book && book.length > 1}
      <span class="sheets" role="tablist" aria-label="Sheets">
        {#each book as s, i (i)}<button class="sheet" class:on={i === sheetAt} role="tab" aria-selected={i === sheetAt} onclick={() => pickSheet(i)}>{s.name}</button>{/each}
      </span>
    {/if}
    {#if xlsx && edit}
      <button class="btn" onclick={() => void saveAsCsv()} title="This sheet as a CSV beside the workbook, which you can edit; the workbook is not changed">Save as CSV</button>
    {:else if edit}
      <button class="btn icon" onclick={() => edit?.undo()} disabled={!edit.canUndo} title="Undo (Ctrl+Z)" aria-label="Undo"><Icon name="undo" size={14} /></button>
      <button class="btn icon" onclick={() => edit?.redo()} disabled={!edit.canRedo} title="Redo (Ctrl+Shift+Z)" aria-label="Redo"><Icon name="redo" size={14} /></button>
      <button class="btn" class:primary={edit.dirty} onclick={() => save()} disabled={!edit.dirty || saving} title="Save (Ctrl+S): only the rows you changed are rewritten">Save</button>
      <label class="check" title="Whether the first row holds the column names">
        <input type="checkbox" checked={sheet?.headerSource === "row"} disabled={sheet?.headerSource === "comment"}
          onchange={(e) => edit?.do({ kind: "headerRow", on: (e.currentTarget as HTMLInputElement).checked })} /> header row</label>
      {#if prefs.hidden.length}
        <button class="btn" onclick={(e) => (menu = { x: e.clientX, y: e.clientY, items: [
          ...prefs.hidden.map((k) => ({ label: `Show ${k.split("\u0000")[0]}`, icon: "eye", run: () => setHidden(prefs.hidden.filter((h) => h !== k)) }) as MenuItem),
          "sep", { label: "Show all", run: () => setHidden([]) },
        ] })}><Icon name="eye" size={14} /> {prefs.hidden.length} hidden</button>
      {/if}
    {/if}
    {#if sheet}<button class="btn" class:on={!!viewName} onclick={viewsMenu} title="Named views — filters, sort, grouping and hidden columns — kept in the file's note"><Icon name="list" size={14} /> {viewName || (views.length ? `${views.length} view${views.length === 1 ? "" : "s"}` : "Views")}</button>{/if}
    {#if sheet}<button class="btn" class:on={group !== null} onclick={() => (group = group !== null ? null : (cols[Math.min(cur.c, cols.length - 1)] ?? null))}
      title={group !== null ? "Show the rows ungrouped" : "Group the rows by the cursor's column, with sub-totals"}><Icon name="rows" size={14} /> {group !== null ? `By ${sheet.header[group]}` : "Group"}</button>{/if}
    <button class="btn" class:on={plotOn} onclick={() => (plotOn = !plotOn)} disabled={!sheet?.numeric.some(Boolean)} title="Plot columns, or a histogram"><Icon name="chart" size={14} /> Plot</button>
    {#if !xlsx && edit}<button class="btn" onclick={() => void saveAsXlsx()} title="A copy of this table as an Excel workbook beside it (formulas kept); the table itself stays as it is">Save as Excel</button>{/if}
    {#if !xlsx}<button class="btn" onclick={() => open({ kind: "editor", path: spec.path })} title="Open the raw file in the editor"><Icon name="file-code" size={14} /> Text</button>{/if}
  </header>
  {#if conflict}
    <div class="banner" role="alert">
      The file changed on disk{edit?.dirty ? " while you have unsaved changes" : ""}.
      <button class="btn" onclick={() => load()}>Reload it</button>
      {#if edit?.dirty}<button class="btn danger" onclick={() => save(true)}>Overwrite with mine</button>{/if}
    </div>
  {/if}
  {#if error}<p class="muted pad">{error}</p>{/if}
  {#if progress !== null}<div class="loading" role="progressbar" aria-valuenow={Math.round(progress * 100)}><i style:width="{Math.round(progress * 100)}%"></i><span>Reading {shownPath(spec.path)}…</span></div>{/if}
  {#if group !== null && sheet}
    <GroupPanel header={sheet.header} {numeric} rows={values} idx={view} col={group} {cols} dir={sort?.col === group ? sort.dir : 1}
      shown={filters[group] ?? ""} by={cols} bind:measureOf={groupMeasure} onpick={(c) => (group = c)} onclose={() => (group = null)}
      onfilter={(f) => { const g = group!; const { [g]: _, ...rest } = filters; filters = f === null ? rest : { ...rest, [g]: f }; }} />
  {/if}
  {#if plotOn && sheet}<PlotPanel header={sheet.header} {numeric} rows={shownRows} selected={selectedRows} />{/if}
  {#if edit && sheet}
    <Grid {edit} {view} {cols} {widths} path={spec.path} readonly={xlsx ? READONLY : ""} frozen={Math.min(prefs.frozen, cols.length)} {sort} bind:filters bind:cur bind:anchor
      onsort={sortBy} onresize={resize} onmovecol={moveCol} onheadermenu={headerMenu} onrowmenu={rowMenu} />
    <StatsBar cells={statCells.cells} what={statCells.what} />
  {/if}
</div>
{#if menu}<ContextMenu x={menu.x} y={menu.y} items={menu.items} onclose={() => { menu = null; focusGrid(); }} />{/if}
{#if dialog}<InputDialog title={dialog.title} value={dialog.value} ok={dialog.ok} onsubmit={(v) => { const d = dialog!; dialog = null; d.submit(v); focusGrid(); }} oncancel={() => { dialog = null; focusGrid(); }} />{/if}

<style>
  .table-pane { height: 100%; display: flex; flex-direction: column; background: var(--bg); }
  header { display: flex; align-items: center; gap: 8px; padding: 8px 12px; border-bottom: 1px solid var(--border); flex-wrap: wrap; }
  .name { display: inline-flex; gap: 6px; align-items: center; font-family: var(--font-mono); font-size: calc(12.5px * var(--ui-scale, 1)); color: var(--text); }
  .dirty { color: var(--accent); font-size: 10px; }
  .meta { color: var(--text-faint); font-size: calc(12px * var(--ui-scale, 1)); }
  .filter { margin-left: auto; width: 180px; font: inherit; font-size: calc(12.5px * var(--ui-scale, 1)); color: var(--text); background: var(--bg-elev);
    border: 1px solid var(--border-strong); border-radius: var(--radius-sm); padding: 4px 8px; }
  .filter:focus { outline: none; border-color: var(--accent); }
  .btn { display: inline-flex; gap: 6px; align-items: center; border: 1px solid var(--border-strong); font-size: calc(12.5px * var(--ui-scale, 1)); }
  .btn.icon { padding: 4px 6px; }
  .btn:hover:not(:disabled) { background: var(--bg-hover); }
  .btn.on { border-color: var(--accent); color: var(--accent); }
  .btn.primary { border-color: var(--accent); background: var(--accent); color: var(--accent-fg, #fff); }
  .btn.danger { border-color: var(--red); color: var(--red); }
  .btn:disabled { opacity: .45; }
  .sheets { display: inline-flex; gap: 2px; padding: 2px; border: 1px solid var(--border); border-radius: var(--radius-sm); background: var(--bg-elev); max-width: 40%; overflow-x: auto; scrollbar-width: none; }
  .sheet { padding: 2px 10px; border-radius: calc(var(--radius-sm) - 2px); font-size: calc(12px * var(--ui-scale, 1)); color: var(--text-muted); white-space: nowrap; }
  .sheet:hover { background: var(--bg-hover); }
  .sheet.on { background: var(--accent-soft, var(--bg-hover)); color: var(--text); font-weight: 500; }
  .check { display: inline-flex; align-items: center; gap: 4px; font-size: calc(12px * var(--ui-scale, 1)); color: var(--text-muted); }
  .banner { display: flex; align-items: center; gap: 10px; padding: 6px 12px; background: color-mix(in srgb, var(--yellow) 14%, var(--bg)); border-bottom: 1px solid var(--border); font-size: calc(12.5px * var(--ui-scale, 1)); }
  .loading { position: relative; height: 22px; margin: 8px 12px; border-radius: var(--radius-sm); background: var(--bg-alt); overflow: hidden; font-size: calc(12px * var(--ui-scale, 1)); }
  .loading i { position: absolute; inset: 0 auto 0 0; background: var(--accent-soft); transition: width .15s; }
  .loading span { position: relative; padding: 0 8px; line-height: 22px; color: var(--text-muted); }
  .pad { padding: 12px; }
</style>
