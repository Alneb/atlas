<script lang="ts">
  import { errText } from "../lib/text";
  import { below, type MenuAt } from "../lib/menu";
  import { shownName, shownPath } from "../lib/paths";
  import { superOf } from "../lib/keys";
  // A `.page` file (docs/guides/PAGES.md): rows and columns of blocks. The file is the source — "Arrange"
  // reshapes it by hand (drag, add, resize, remove; each gesture is one write of the file) and
  // "Edit as text" opens the same YAML in the editor. Saving either way redraws the page at once.
  import { onMount } from "svelte";
  import type { Document } from "yaml";
  import { api, ApiError } from "../lib/api";
  import { on } from "../lib/bus";
  import { open, type PaneProps } from "../lib/dock";
  import { allBlocks, getBlock, mountBlock, optionFields } from "../lib/blocks";
  import BlockOptions from "../components/BlockOptions.svelte";
  import { rowViewTypes } from "../lib/views";
  import { pick, type PickItem } from "../lib/palette.svelte";
  import { toast } from "../lib/state.svelte";
  import {
    parsePage, writePage, blockSrc, newBlock, findBlock, blockAt, insertBlock, insertRow, insertColumn, moveBlock, removeBlock, setWidths,
    type BlockAt, type Drop, type PageBlock, type PageModel,
  } from "../lib/page-doc";
  import ContextMenu from "../components/ContextMenu.svelte";
  import { pluginMenu } from "../lib/plugin-menus";
  import Icon from "../components/Icon.svelte";

  let { spec, panel }: PaneProps<"page"> = $props();
  // svelte-ignore state_referenced_locally -- a pane's spec is fixed for its lifetime
  const path = spec.path;

  const page = $state<PageModel>({ rows: [] });
  let doc: Document | null = null; // the parsed YAML the model came from (comments, other keys)
  let text = ""; // the file as last read or written
  let mtime: number | undefined;
  let error = $state("");
  let arranging = $state(false);
  let undo = $state<string[]>([]);

  function show(src: string): void {
    const p = parsePage(src);
    doc = p.doc;
    page.title = p.model.title;
    page.rows = p.model.rows;
    text = src;
    error = "";
    if (page.title) panel.setTitle(page.title);
  }
  let writes = 0; // our own writes started: a reload begun before one of them answers with the older file
  async function load(): Promise<void> {
    const seen = writes;
    try {
      const f = await api.file(path);
      if (seen !== writes) return;
      mtime = f.mtime;
      if (f.text !== text || error) show(f.text); // our own write comes back unchanged: keep the blocks
    } catch (e) { error = errText(e); }
  }

  /** Write the model to the file (one gesture = one write); `keep` puts the old text on the undo stack. */
  async function save(next = doc ? writePage($state.snapshot(page) as PageModel, doc) : text, keep = true): Promise<void> {
    if (next === text) return;
    const before = text;
    text = next;
    writes++;
    try {
      mtime = (await api.putFile(path, next, mtime)).mtime;
      if (keep) undo = [...undo.slice(-30), before];
    } catch (e) {
      text = before;
      toast("The page was not saved", e instanceof ApiError && e.status === 409 ? "It changed on disk meanwhile — reloaded." : errText(e), "error");
      text = ""; // force the reload to redraw from the file
      await load();
    }
  }
  async function undoLast(): Promise<void> {
    const prev = undo.at(-1);
    if (prev === undefined) return;
    undo = undo.slice(0, -1);
    await save(prev, false);
    show(prev);
  }

  // --- drawing --------------------------------------------------------------------------------------
  function draw(el: HTMLElement, src: string) {
    return { destroy: mountBlock(el, path, src, "page") }; // on close / change only — a hidden tab keeps its blocks
  }
  const carded = (b: PageBlock) => !!b.title || !!getBlock(b.type)?.card;
  const label = (b: PageBlock) => b.title ?? getBlock(b.type)?.title ?? b.type;
  // two columns keep the proportions of the old Today screen unless the file says otherwise
  const cols = (r: PageModel["rows"][number]) => (r.widths ?? (r.columns.length === 2 ? [1.25, 1] : r.columns.map(() => 1))).map((w) => `minmax(0, ${w}fr)`).join(" ");

  // --- arranging: add ---------------------------------------------------------------------------------
  const SECTIONS: [string, (type: string) => boolean][] = [
    ["Today", (t) => ["greeting", "capture", "focus", "log", "tasks", "activity"].includes(t)],
    ["Content", (t) => ["note", "text", "base", "editor", "pdf", "image", "file-table", "excalidraw", "web"].includes(t)],
    ["From plugins", (t) => t.includes(".")],
  ];
  const sectionOf = (type: string) => SECTIONS.find(([, has]) => has(type))?.[0] ?? "Tools";
  const HIDDEN = new Set(["commit", "diff", "plugin", "today", "page"]); // need ids a person does not type

  /** Ask which block (and which file, when it shows one), then hand it to `place`. */
  function addBlock(place: (b: PageBlock) => void): void {
    const items: PickItem[] = [
      ...rowViewTypes().map((t) => ({ value: t, title: `${t[0].toUpperCase()}${t.slice(1)} of tasks`, detail: "open tasks, by date", icon: "today" as const, section: "Views" })),
      ...allBlocks().filter((b) => !HIDDEN.has(b.type)).map((b) => ({ value: b.type, title: b.title, detail: b.type, icon: b.icon ?? ("chart" as const), section: sectionOf(b.type) })),
    ].sort((a, b) => a.section.localeCompare(b.section));
    pick({
      placeholder: "Add a block…", tag: "Block", icon: "plus", items,
      onpick: (type) => {
        const b = getBlock(type);
        const done = (options: Record<string, unknown> = {}) => { place(newBlock(type, options)); void save(); };
        if (b?.file) setTimeout(() => pickFile(b.file!, (p) => done({ path: p })), 0); // after this palette closes
        else if (type === "text") done({ text: "Write here." });
        else if (type === "web") setTimeout(() => pick({ placeholder: "Address (https://…)", tag: "Web page", icon: "globe", items: [], typed: (t) => `Show ${t}`, onpick: (url) => done({ url }) }), 0);
        else done(b ? {} : { from: "tasks" });
      },
    });
  }
  function pickFile(match: RegExp | true, then: (path: string) => void): void {
    pick({
      placeholder: "Which file…", tag: "File", icon: "file",
      items: async () => (await api.files()).filter((p) => match === true || match.test(p)).map((p) => ({ value: p, title: shownName(p), detail: shownPath(p) })),
      onpick: then,
    });
  }

  // --- arranging: move (drag, or the block's menu for the keyboard) -------------------------------
  let dragging = $state<number | null>(null);
  let over = $state("");
  function dragStart(e: DragEvent, b: PageBlock): void {
    dragging = b.id;
    e.dataTransfer?.setData("text/plain", String(b.id));
    if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
  }
  const dragEnd = () => { dragging = null; over = ""; };
  function slotOver(e: DragEvent, key: string): void {
    if (dragging === null) return;
    e.preventDefault();
    over = key;
  }
  function drop(e: DragEvent, to: Drop): void {
    if (dragging === null) return;
    e.preventDefault();
    moveBlock(page, dragging, to);
    dragEnd();
    void save();
  }
  /** A slot: where a dragged block lands, and a "+" that adds one there. */
  const place = (to: Drop) => (b: PageBlock) => {
    if (to.kind === "at") insertBlock(page, to.at, b);
    else if (to.kind === "row") insertRow(page, to.row, b);
    else insertColumn(page, to.row, b);
  };

  // --- arranging: a block's menu ------------------------------------------------------------------------
  let menu = $state<MenuAt | null>(null);
  // the block whose options form is open, and where it stood: a reload meanwhile re-parses the page into new blocks
  let editing = $state<{ block: PageBlock; at: BlockAt } | null>(null);
  /** `b` if it is still in the page, else the block of its type at its old place (the file was reloaded meanwhile). */
  function current(b: PageBlock, at: BlockAt): PageBlock | undefined {
    if (findBlock(page, b.id)) return b;
    const there = blockAt(page, at);
    return there?.type === b.type ? there : undefined;
  }
  function ask(placeholder: string, tag: string, then: (v: string) => void, clear?: string): void {
    pick({ placeholder, tag, icon: "edit", items: clear ? [{ value: "", title: clear }] : [], typed: (t) => `Use “${t}”`, onpick: then });
  }
  function blockMenu(e: MouseEvent, b: PageBlock): void {
    const at = findBlock(page, b.id);
    if (!at) return;
    const here = page.rows[at.row].columns[at.col];
    const edit = (f: () => void) => () => { f(); void save(); };
    menu = below(e, [
      { label: "Title…", icon: "edit" as const, run: () => ask("Title of this block", "Title", (v) => { b.title = v.trim() || undefined; void save(); }, "No title") },
      ...(optionFields(b.type).length ? [{ label: "Options…", icon: "settings" as const, run: () => { editing = { block: b, at }; } }] : []),
      ...(getBlock(b.type)?.height ? [{ label: "Height…", run: () => ask("Height in pixels (e.g. 360)", "Height", (v) => { const n = Number(v); if (n >= 120) b.options.height = Math.round(n); else delete b.options.height; void save(); }, "Default height") }] : []),
      "sep",
      ...(at.index > 0 ? [{ label: "Move up", icon: "arrow-up" as const, run: edit(() => moveBlock(page, b.id, { kind: "at", at: { ...at, index: at.index - 1 } })) }] : []),
      ...(at.index < here.length - 1 ? [{ label: "Move down", icon: "arrow-down" as const, run: edit(() => moveBlock(page, b.id, { kind: "at", at: { ...at, index: at.index + 2 } })) }] : []),
      { label: "Move to a new column", icon: "panel-right" as const, run: edit(() => moveBlock(page, b.id, { kind: "column", row: at.row })) },
      { label: "Move to its own row", icon: "panel-bottom" as const, run: edit(() => moveBlock(page, b.id, { kind: "row", row: at.row + 1 })) },
      { label: "Duplicate", icon: "copy" as const, run: edit(() => insertBlock(page, { ...at, index: at.index + 1 }, newBlock(b.type, { ...$state.snapshot(b.options) }, b.title))) },
      "sep",
      { label: "Remove", icon: "close" as const, danger: true, run: () => { removeBlock(page, b.id); void save().then(() => toast("Block removed", "Undo brings it back (Ctrl+Z while arranging)")); } },
      ...pluginMenu("block", { type: b.type, note: path }),
    ], 4);
  }

  // --- arranging: column widths ---------------------------------------------------------------------------
  function resizeColumns(e: PointerEvent, row: number, col: number): void {
    e.preventDefault();
    const r = page.rows[row];
    const grid = (e.currentTarget as HTMLElement).closest<HTMLElement>(".row")!;
    const start = r.widths ?? (r.columns.length === 2 ? [1.25, 1] : r.columns.map(() => 1));
    const perPx = start.reduce((a, b) => a + b, 0) / grid.clientWidth;
    const x0 = e.clientX;
    document.body.classList.add("atlas-resizing"); // no text selection while dragging
    const move = (ev: PointerEvent) => {
      // neither side below a quarter share
      const d = Math.min(Math.max((ev.clientX - x0) * perPx, 0.25 - start[col]), start[col + 1] - 0.25);
      setWidths(page, row, start.map((w, i) => (i === col ? w + d : i === col + 1 ? w - d : w)));
    };
    const up = () => {
      document.body.classList.remove("atlas-resizing");
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      void save();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  function onKey(e: KeyboardEvent): void {
    if (!arranging) return;
    if (e.key === "Escape") { arranging = false; e.stopPropagation(); }
    else if ((e.ctrlKey || superOf(e)) && e.key.toLowerCase() === "z") { e.preventDefault(); e.stopPropagation(); void undoLast(); }
  }

  onMount(() => {
    void load();
    let t: ReturnType<typeof setTimeout> | undefined;
    const off = on("fs", (e) => { if (e.paths.includes(path)) { clearTimeout(t); t = setTimeout(load, 150); } });
    return () => { off(); clearTimeout(t); };
  });
</script>

{#snippet slot(to: Drop, key: string, kind: "between" | "row" | "column")}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="drop {kind}" data-slot={key} class:over={over === key} ondragover={(e) => slotOver(e, key)} ondragleave={() => { if (over === key) over = ""; }} ondrop={(e) => drop(e, to)}>
    <button class="add" onclick={() => addBlock(place(to))} aria-label={kind === "column" ? "Add a block in a new column" : kind === "row" ? "Add a block in a new row" : "Add a block here"}
      title={kind === "column" ? "Add a column" : "Add a block"}><Icon name="plus" size={13} /></button>
  </div>
{/snippet}

{#snippet block(b: PageBlock)}
  <div class="pb" class:card={carded(b)} class:moving={dragging === b.id} data-block={b.type}>
    {#if arranging}
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div class="bar" draggable="true" ondragstart={(e) => dragStart(e, b)} ondragend={dragEnd} title="Drag to move">
        <span class="grip" aria-hidden="true">⠿</span><span class="name">{label(b)}</span>
        <button class="icon-btn" onclick={(e) => blockMenu(e, b)} aria-label="Block menu: {label(b)}" title="Title, height, move, duplicate, remove…"><Icon name="chevron-down" size={14} /></button>
      </div>
    {/if}
    {#if b.title && !arranging}<h2>{b.title}</h2>{/if}
    {#key blockSrc(b)}<div class="content" inert={arranging} use:draw={blockSrc(b)}></div>{/key}
  </div>
{/snippet}

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="page scroll" class:arranging onkeydown={onKey}>
  <div class="inner">
    <div class="tools">
      {#if arranging}
        <button class="tool" onclick={undoLast} disabled={!undo.length} title="Undo the last change (Ctrl+Z)"><Icon name="undo" size={13} /> Undo</button>
        <button class="tool primary" onclick={() => (arranging = false)} title="Finish arranging (Esc)"><Icon name="check" size={13} /> Done</button>
      {:else}
        <button class="tool" onclick={() => (arranging = true)} title="Move, add, resize and remove blocks by hand"><Icon name="edit" size={13} /> Arrange</button>
        <button class="tool" onclick={() => open({ kind: "editor", path })} title="This screen is the file {path}: edit it as text"><Icon name="file-code" size={13} /> Edit as text</button>
      {/if}
    </div>
    {#if error}
      <section class="pb card err"><strong>{shownPath(path)} could not be read.</strong><pre>{error}</pre>
        <button class="link" onclick={() => open({ kind: "editor", path })}>Open it to fix it</button></section>
    {:else}
      {#each page.rows as row, i (i)}
        {#if arranging}{@render slot({ kind: "row", row: i }, `r${i}`, "row")}{/if}
        <div class="row" style:grid-template-columns={cols(row)}>
          {#each row.columns as col, j (j)}
            <div class="col">
              {#each col as b, k (b.id)}
                {#if arranging}{@render slot({ kind: "at", at: { row: i, col: j, index: k } }, `b${i}.${j}.${k}`, "between")}{/if}
                {@render block(b)}
              {/each}
              {#if arranging}
                {@render slot({ kind: "at", at: { row: i, col: j, index: col.length } }, `b${i}.${j}.end`, "between")}
                {#if j < row.columns.length - 1}
                  <div class="col-resize" role="separator" aria-orientation="vertical" aria-label="Resize columns" onpointerdown={(e) => resizeColumns(e, i, j)}></div>
                {/if}
              {/if}
            </div>
          {/each}
          {#if arranging}{@render slot({ kind: "column", row: i }, `c${i}`, "column")}{/if}
        </div>
      {/each}
      {#if arranging}{@render slot({ kind: "row", row: page.rows.length }, "rend", "row")}{/if}
      {#if !page.rows.length && !arranging}
        <section class="pb card empty"><strong>This page is empty.</strong>
          <button class="link" onclick={() => { arranging = true; }}>Arrange it</button> to add blocks: tasks, a calendar, a note, a PDF, the Library…</section>
      {/if}
    {/if}
  </div>
</div>
{#if menu}<ContextMenu x={menu.x} y={menu.y} items={menu.items} onclose={() => (menu = null)} />{/if}
{#if editing}
  {@const { block: b, at } = editing}
  <BlockOptions title={label(b)} fields={optionFields(b.type)} options={$state.snapshot(b.options)} oncancel={() => (editing = null)}
    onsave={(o) => { const cur = current(b, at); editing = null; if (!cur) return toast("The block moved meanwhile", "Its options were not saved.", "error"); cur.options = o; void save(); }} />
{/if}

<style>
  .page { height: 100%; overflow: auto; background: var(--bg); container-type: inline-size; }
  .inner { max-width: 1080px; margin: 0 auto; padding: 40px 36px 64px; position: relative; }
  .row { display: grid; gap: 16px; align-items: start; margin-bottom: 16px; position: relative; }
  .col { display: flex; flex-direction: column; gap: 16px; min-width: 0; position: relative; }
  @container (max-width: 760px) { .row { grid-template-columns: 1fr !important; } .inner { padding: 28px 18px 48px; } }
  .pb { min-width: 0; position: relative; }
  .pb.card { background: var(--bg-alt); border: 1px solid var(--border); border-radius: var(--radius-lg); padding: 16px 18px; }
  .pb h2 { font-size: calc(12px * var(--ui-scale, 1)); font-weight: 600; text-transform: uppercase; letter-spacing: .07em; color: var(--text-muted); margin: 0 0 8px; }
  .pb[data-block="base"] { padding: 10px; }
  .content { min-width: 0; }
  /* a Today part draws its own card */
  .content :global(.today.part .card) { margin: 0; }
  .err pre { white-space: pre-wrap; color: var(--red); font-size: .9em; }
  .empty { color: var(--text-muted); }

  .tools { position: absolute; top: 12px; right: 36px; display: flex; gap: 4px; z-index: 6; }
  .tool { display: inline-flex; gap: 5px; align-items: center; min-height: 24px; color: var(--text-faint); font-size: calc(12px * var(--ui-scale, 1)); padding: 2px 8px; border-radius: 6px; }
  .tool:hover:not(:disabled) { color: var(--text); background: var(--bg-hover); }
  .tool:disabled { opacity: .45; }
  .tool.primary { color: var(--accent-fg); background: var(--accent); }
  .tool.primary:hover { background: var(--accent-strong); color: var(--accent-fg); }

  /* arranging: every block is an object you hold by its bar; its content rests */
  .arranging .pb { outline: 1px dashed var(--border-strong); outline-offset: 3px; border-radius: var(--radius-lg); }
  .arranging .content { opacity: .82; }
  .pb.moving { opacity: .35; }
  .bar { display: flex; align-items: center; gap: 6px; height: 26px; margin: 0 0 6px; padding: 0 4px 0 8px; border-radius: 7px; cursor: grab; user-select: none;
    background: var(--bg-elev); border: 1px solid var(--border); color: var(--text-muted); font-size: calc(12px * var(--ui-scale, 1)); }
  .bar:active { cursor: grabbing; }
  .bar .grip { color: var(--text-faint); }
  .bar .name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  /* a slot: thin until the pointer or a dragged block is on it */
  .drop { display: grid; place-items: center; border-radius: 6px; transition: background .12s; }
  .drop.between { height: 14px; margin: -8px 0; }
  .drop.row { height: 16px; margin: -8px 0 8px; }
  .drop.column { position: absolute; top: 0; bottom: 0; right: -30px; width: 22px; }
  .drop .add { width: 24px; height: 24px; display: grid; place-items: center; border-radius: 50%; color: var(--text-muted); background: var(--bg-elev); border: 1px solid var(--border-strong);
    opacity: 0; transition: opacity .12s; position: relative; z-index: 4; }
  .drop:hover .add, .drop .add:focus-visible { opacity: 1; }
  .drop .add:hover { color: var(--accent); border-color: var(--accent); }
  .drop.over { background: var(--accent-sel); outline: 1px solid var(--accent); }
  .col-resize { position: absolute; top: 0; bottom: 0; right: -12px; width: 8px; cursor: col-resize; border-radius: 4px; z-index: 3; }
  .col-resize:hover { background: var(--accent-sel); }
  @media (prefers-reduced-motion: reduce) { .drop, .drop .add { transition: none; } }
</style>
