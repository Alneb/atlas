<script module lang="ts">
  import { releaseCanvases } from "../lib/release-canvases";
  import { load, loadRaw, save, saveRaw } from "../lib/prefs";
  import { superOf } from "../lib/keys";
  let lastUsed: HTMLElement | null = null; // the PDF pane the pointer was last in (see onWin below)
</script>

<script lang="ts">
  import { errText } from "../lib/text";
  import { attachPan } from "../lib/pdf-pan";
  import { shownName } from "../lib/paths";
  // PDF reader + annotator on PDFium (lib/pdf-reader.ts): highlight (H, or H over selected text), pen/stylus ink (P),
  // text note (T), select (V/Esc), eraser (E), undo (Ctrl+Z), find (Ctrl+F), outline and page thumbnails, zoom
  // (Ctrl+= / Ctrl+- / Ctrl+0), dark pages (D), reopens at the last page read. Marks are saved as they are made into
  // the PDF's companion drawing (lib/pdf-tools.ts); "to notes" extracts them to markdown.
  import { pdfPages } from "../lib/registry";
  import { tellWhere } from "../lib/where.svelte";
  import { MARK_ID } from "../lib/note-anchor";
  import { flushSync, onMount } from "svelte";
  import type { PaneProps } from "../lib/dock";
  import { openReader, type OutlineItem, type Reader, type Zoom } from "../lib/pdf-reader";
  import { attachTools, COLORS, type ToolName, type Tools } from "../lib/pdf-tools";
  import { attachPdfMarks, markAt, recoloured, reworded, STAMPS, type Mark, type MarksView, type Stamp } from "../lib/pdf-marks";
  import PdfMarkBar from "../components/PdfMarkBar.svelte";
  import { api } from "../lib/api";
  import { exportWithMarks } from "../lib/pdf-export";
  import { ensureNoteOf, notesBeside } from "../lib/papers";
  import { placeLink } from "../lib/pdf-place";
  import Icon from "../components/Icon.svelte";
  import PdfThumbs from "../components/PdfThumbs.svelte";
  import PdfMarksList from "../components/PdfMarksList.svelte";
  import { settings } from "../lib/settings.svelte";
  import { chosenEngine, engine, otherEngine, type EngineName } from "../lib/pdf-engine";

  let { spec, panel }: PaneProps<"pdf"> = $props();
  let container: HTMLDivElement;
  let r = $state.raw<Reader | null>(null); // raw: the reader holds DOM and workers, not state
  let tools: Tools | null = null;
  let error = $state("");
  // one engine for this document: Settings' choice, or the other one when asked after it could not open the file
  let engineName = $state<EngineName>(chosenEngine());
  const ENGINE_LABEL: Record<EngineName, string> = { pdfium: "PDFium", pdfjs: "pdf.js" };
  let pages = $state(0);
  let pageInput = $state("1");
  let scaleLabel = $state("Fit");
  let tool = $state<ToolName>("select");
  // Starting values come from Settings → [pdf]; the toolbar changes them for this pane only.
  const pdfCfg = () => settings.config?.pdf;
  let color = $state<string>(COLORS[pdfCfg()?.color ?? "yellow"]);
  let thickness = $state(pdfCfg()?.ink_thickness ?? 2);
  const ZOOM = { "page-width": "page-width", "page-fit": "page-fit", actual: 1 } as const;
  const openZoom = (): Zoom => ZOOM[pdfCfg()?.open_zoom ?? "page-width"];
  let status = $state("");
  let findOpen = $state(false);
  let spread = $state(false);
  // a link to this page, or to the selected passage by its words (lib/pdf-place.ts)
  async function copyLink() {
    const sel = (await r?.selection()) ?? [];
    const link = sel.length ? placeLink(spec.path, { page: sel[0].page, quote: sel.map((s) => s.text).join(" ") }) : placeLink(spec.path, { page: current || 1 });
    try { await navigator.clipboard.writeText(link); flash(sel.length ? "Link to the selected passage copied" : `Link to page ${current || 1} copied`); }
    catch { flash(link, 8000); }
  }
  const rotate = () => r?.rotate();
  const toggleSpread = () => { spread = !spread; r?.setSpread(spread); };
  let findQ = $state("");
  let findInfo = $state("");
  let outlineOpen = $state(false);
  let side = $state<"outline" | "pages" | "marks">("outline");
  let current = $state(1);
  let dark = $state(loadRaw("atlas.pdf.dark") === "1");
  let outline = $state.raw<OutlineItem[]>([]);
  // older marks, in the PDF's companion drawing: shown and erasable until moved into the note (`atlas pdf-marks migrate`)
  let marks: MarksView | null = null;
  let findInput = $state<HTMLInputElement | null>(null);

  // per-viewer conveniences (which page, which zoom, dark pages): browser storage, never required
  const posKey = () => `atlas.pdf.pos:${spec.path}`;
  let posTimer = 0;
  function rememberPosition() {
    if (!container?.clientWidth) return; // hidden: nothing being read to remember
    clearTimeout(posTimer);
    posTimer = window.setTimeout(() => {
      if (!r || !container?.clientWidth) return;
      const at = r.where();
      save(posKey(), { page: at.page, y: at.y, scale: String(r.zoom) });
      if (panel.isActive) tellWhere({ path: spec.path, page: r.page }); // the page, for a device that follows this one
    }, 400);
  }
  /** The page and zoom this PDF was left at (the zoom saved as "page-width", "page-fit" or a number). */
  function savedPosition(): { page?: number; y?: number | null; zoom?: Zoom } {
    try {
      const pos = load<{ page?: number; y?: number | null; scale?: string }>(posKey(), {});
      const z = pos.scale === "page-width" || pos.scale === "page-fit" ? pos.scale : Number(pos.scale) > 0 ? Number(pos.scale) : undefined;
      return { ...(pos.page ? { page: pos.page, y: typeof pos.y === "number" ? pos.y : null } : {}), ...(z !== undefined ? { zoom: z } : {}) };
    } catch { return {}; }
  }
  function toggleDark() { dark = !dark; saveRaw("atlas.pdf.dark", dark ? "1" : "0"); }
  function toggleSide(which: "outline" | "pages" | "marks") { if (outlineOpen && side === which) outlineOpen = false; else { side = which; outlineOpen = true; } }

  function flash(s: string, ms = 2500) { status = s; setTimeout(() => { if (status === s) status = ""; }, ms); }

  // the eraser: the note's mark under the click taken out (lib/pdf-marks.ts)
  let erasing = $state(false);
  function erase(on = !erasing) { erasing = on; if (on) pick("select", false); }
  async function eraseClick(e: MouseEvent) {
    if (!erasing || !r) return;
    const at = r.pageAt(e.clientX, e.clientY);
    if (!at) return;
    e.preventDefault(); e.stopPropagation();
    try {
      const [x, y] = await r.toPagePoint(at.n, at.X, at.Y), hit = marks && markAt(marks.marks(), at.n, x, y);
      if (hit) { await tools?.remove(hit.id); return; } // undo brings it back
      flash("No mark there");
    } catch (err) { flash(`Not erased: ${errText(err)}`, 5000); }
  }

  function pick(t: ToolName, stopErasing = true) {
    if (stopErasing) erasing = false;
    tool = t;
    tools?.setTool(t);
    tools?.setColor(color);
    tools?.setThickness(thickness);
    tools?.setStamp(stamp);
  }
  function pickColor(c: string) { color = c; tools?.setColor(c); }
  let stamp: Stamp = $state("check");
  function pickStamp(s: Stamp) { stamp = s; tools?.setStamp(s); }

  // the page's bookmark (B): one mark of its own, listed with the others in the note
  let bookmarked = $state(false), markList = $state<readonly Mark[]>([]);
  const seeBookmark = () => { bookmarked = !!marks?.marks().some((m) => m.page === current && m.kind === "bookmark"); };
  const marksChanged = (ms: readonly Mark[]) => {
    markList = ms;
    seeBookmark();
    if (picked) { picked = ms.find((m) => m.id === picked!.id && m.kind !== "deleted") ?? null; if (!picked) tools?.select(null); placeBarSoon(); }
  };

  // the picked mark's bar (the select tool's click): under the mark, over it near the bottom
  let picked = $state.raw<Mark | null>(null), barAt = $state<{ left: number; top: number } | null>(null), wrap = $state<HTMLElement | null>(null);
  function placeBar() {
    const g = picked && container?.querySelector(`svg.atlas-marks [data-mark="${picked.id}"]`);
    if (!g || !wrap) { barAt = null; return; }
    const b = g.getBoundingClientRect(), w = wrap.getBoundingClientRect();
    const below = b.bottom - w.top + 8, above = b.top - w.top - 44;
    barAt = { left: Math.max(150, Math.min(w.width - 150, b.left + b.width / 2 - w.left)), top: below + 40 > w.height && above > 0 ? above : below };
  }
  // the marks are drawn again after a save: the bar finds its mark once they are
  const placeBarSoon = () => { requestAnimationFrame(placeBar); setTimeout(placeBar, 250); };
  const unpick = () => tools?.select(null);
  const editPicked = (next: Mark) => { void tools?.edit(next); };
  function deletePicked() {
    if (!picked || !tools) return;
    const id = picked.id;
    tools.select(null);
    void tools.remove(id).then(() => flash("Mark deleted — Ctrl+Z brings it back"));
  }
  async function toggleBookmark() {
    if (!tools) return;
    bookmarked = await tools.toggleBookmark(current);
    flash(bookmarked ? `Page ${current} bookmarked` : "Bookmark taken away");
  }

  // Settings → PDF → "export on save": the note follows the marks, a moment after the last one
  let exportTimer = 0;
  function saved() {
    if (pdfCfg()?.export_on_save) { clearTimeout(exportTimer); exportTimer = window.setTimeout(() => void toNotes(), 2000); }
  }

  async function toNotes() {
    try {
      await ensureNoteOf(spec.path); // a paper's note starts with its properties and block, then the export
      const res = await api.cmd("pdf.annotations", { path: spec.path });
      if (!res.ok) throw new Error(res.error);
      flash(typeof res.result === "string" ? res.result : "Annotations exported");
    } catch (e) {
      flash(`Export failed: ${errText(e)}`, 6000);
    }
  }

  const zoom = (f: number) => r?.zoomBy(f);
  // the label: fit the width, again: the whole page
  const fitWidth = () => r?.setZoom(r.zoom === "page-width" ? "page-fit" : "page-width");
  const goto = (n: number) => r?.goto(Math.max(1, Math.min(n, pages)));
  /** A link's words selected, or its annotation flashed: a PDF annotation's id, or one of the note's marks (`m-…`). */
  function mark(page: number, at: { quote?: string; annotation?: string }) {
    if (at.quote) void r?.selectWords(page, at.quote);
    if (at.annotation && MARK_ID.test(at.annotation)) void marks?.flash(at.annotation).then((ok) => { if (!ok) flash("That mark is gone"); });
    else if (at.annotation) void r?.flashAnnotation(page, at.annotation);
  }
  const runFind = (again = false, back = false) => r?.find(findQ, { again, back });
  const jump = (o: OutlineItem) => { if (o.page !== null) r?.goto(o.page + 1, o.y); };

  async function undo() {
    if (await tools?.undo()) flash("Mark taken back"); else flash("Nothing to take back");
  }

  function onkeydown(e: KeyboardEvent) {
    const mod = e.ctrlKey || superOf(e);
    if (mod && e.key.toLowerCase() === "s") { e.preventDefault(); e.stopPropagation(); flash("Marks are saved as you make them"); return; }
    if (mod && e.key.toLowerCase() === "f") { e.preventDefault(); e.stopPropagation(); findOpen = true; flushSync(); findInput?.select(); return; } // focused at once: the next keys are the query's, not the pane's
    // zoom the page, not the app (the shell's Ctrl+= scales the whole UI)
    if (mod && (e.key === "=" || e.key === "+")) { e.preventDefault(); e.stopPropagation(); zoom(1.15); return; }
    if (mod && e.key === "-") { e.preventDefault(); e.stopPropagation(); zoom(1 / 1.15); return; }
    if (mod && e.key === "0") { e.preventDefault(); e.stopPropagation(); fitWidth(); return; }
    const t = e.target as HTMLElement;
    const typing = t.isContentEditable || /^(INPUT|TEXTAREA)$/.test(t.tagName);
    if (mod && !e.shiftKey && e.key.toLowerCase() === "z" && !typing) { e.preventDefault(); e.stopPropagation(); void undo(); return; }
    if (mod || typing) return;
    if (picked && (e.key === "Delete" || e.key === "Backspace")) { e.preventDefault(); e.stopPropagation(); deletePicked(); return; }
    if (picked && e.key === "Escape") { e.preventDefault(); e.stopPropagation(); unpick(); return; }
    const k = e.key.toLowerCase();
    // a text mark's key marks the selection at once, else picks that tool
    const textMark = ({ h: "highlight", u: "underline", x: "strike" } as const)[k as "h" | "u" | "x"];
    if (textMark) { void tools?.markSelection(textMark).then((done) => { if (!done) pick(textMark); }); }
    else if (k === "p") pick("ink");
    else if (k === "t") pick("text");
    else if (k === "n") pick("postit");
    else if (k === "c") pick("clip");
    else if (k === "m") pick("stamp");
    else if (k === "b") void toggleBookmark();
    else if (k === "e") erase();
    else if (k === "v" || (k === "escape" && (tool !== "select" || erasing))) pick("select");
    else if (k === "d") toggleDark();
    else return;
    e.preventDefault();
  }

  // Ctrl+wheel and a touchpad pinch zoom the pages smoothly: scaled at once, drawn sharp when the gesture rests
  // (lib/pdf-reader.ts) — the app's own Ctrl+wheel (pane-zoom.ts) leaves a PDF alone
  function pinch(e: WheelEvent) {
    if (!e.ctrlKey || !r) return;
    e.preventDefault();
    const px = e.deltaMode === 1 ? e.deltaY * 40 : e.deltaY;
    r.zoomBy(Math.exp(-px / 300), { x: e.clientX, y: e.clientY });
  }

  // Keys typed with nothing focused go to the PDF pane used last (a click on a page leaves the focus on <body>).
  let paneEl: HTMLDivElement;
  const markUsed = () => { lastUsed = paneEl; };
  $effect(() => {
    // keys with nothing focused, or the dock's wrapper around this pane (a click on the page focuses it): this pane's
    const onWin = (e: KeyboardEvent) => {
      const a = document.activeElement;
      if ((a === document.body || (a !== paneEl && a?.contains(paneEl))) && lastUsed === paneEl && paneEl.isConnected) onkeydown(e);
    };
    window.addEventListener("keydown", onWin);
    // the module keeps the last pane used: a closed one must not stay alive through it
    return () => { window.removeEventListener("keydown", onWin); if (lastUsed === paneEl) lastUsed = null; };
  });

  const labelOf = (z: Zoom, s: number) => (z === "page-width" ? "Fit" : z === "page-fit" ? "Page" : `${Math.round(s * 100)}%`);
  let disposed = false;
  async function openViewer(): Promise<void> {
    try {
      const was = savedPosition();
      const reader = await openReader(container, spec.path, await engine(engineName), { zoom: was.zoom ?? openZoom(), page: spec.page ?? was.page, y: spec.page ? null : was.y });
      if (disposed) { reader.destroy(); return; }
      r = reader;
      pages = reader.pages;
      outline = reader.outline;
      current = reader.page; pageInput = String(current);
      scaleLabel = labelOf(reader.zoom, reader.scale);
      marks = attachPdfMarks(reader, spec.path, marksChanged);
      tools = attachTools(container, reader, marks, { saved, failed: (e) => flash(`Not saved: ${errText(e)}`, 6000), selected: (m) => { picked = m; placeBar(); } });
      pick(tool, false);
      reader.on("page", (n) => { pageInput = String(n); current = n; rememberPosition(); seeBookmark(); });
      reader.on("scale", ({ scale, zoom: z }) => { scaleLabel = labelOf(z, scale); rememberPosition(); });
      reader.on("find", ({ current: c, total }) => { findInfo = total ? `${c}/${total}` : "0"; });
      // a link's page, words and annotation, used once: a restored layout must not jump back
      if (spec.page) {
        mark(spec.page, spec);
        panel.updateParameters({ ...spec, page: undefined, quote: undefined, annotation: undefined });
      }
    } catch (err) {
      error = errText(err);
    }
  }

  /** After a failure: this file once more, by the other engine. */
  function openWithOther(): void {
    engineName = otherEngine(engineName);
    error = "";
    void openViewer();
  }

  onMount(() => {
    void openViewer();
    pdfPages.set(panel.id, (n, at) => { goto(n); if (at) mark(n, at); });
    // refit on a real width change only: a background tab leaves the page (width 0) and comes back at the same
    // width — refitting then re-laid out every page on each tab switch
    let fittedAt = 0;
    const offPan = attachPan(container, () => tool === "select" && !erasing);
    let hidden = false;
    const ro = new ResizeObserver(() => {
      const w = container.clientWidth;
      if (!w) { hidden = true; return; }
      // back from a background tab at the same width: its pages drawn again (they could come back white)
      if (hidden) { hidden = false; if (w === fittedAt) { r?.shown(); return; } }
      if (w === fittedAt) return;
      fittedAt = w;
      r?.refit();
    });
    ro.observe(container);
    return () => {
      disposed = true;
      marks?.stop(); offPan(); pdfPages.delete(panel.id); ro.disconnect(); clearTimeout(posTimer); clearTimeout(exportTimer);
      const reader = r;
      void (tools?.destroy() ?? Promise.resolve()).finally(() => reader?.destroy());
      releaseCanvases(container);
    };
  });
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="pdf-pane" {onkeydown} onpointerdown={markUsed} bind:this={paneEl}>
  <div class="toolbar">
    <button class="icon-btn" class:on={outlineOpen && side === "outline"} title="Outline" aria-label="Outline" onclick={() => toggleSide("outline")} disabled={!outline.length}>
      <Icon name="contents" size={15} />
    </button>
    <button class="icon-btn" class:on={outlineOpen && side === "pages"} title="Pages" aria-label="Pages" onclick={() => toggleSide("pages")} disabled={!pages}>
      <Icon name="pages" size={15} />
    </button>
    <button class="icon-btn" class:on={outlineOpen && side === "marks"} title="Marks: every highlight, post-it, clip and bookmark, kept in the PDF's note" aria-label="Marks" onclick={() => toggleSide("marks")} disabled={!pages}>
      <Icon name="notes" size={15} />{#if markList.length}<span class="count">{markList.length}</span>{/if}
    </button>
    <span class="title" title={spec.path}><Icon name="pdf" size={14} /><span class="name">{shownName(spec.path)}</span>{#if engineName !== "pdfium"}<span class="engine faint small" title="Read by {ENGINE_LABEL[engineName]} (Settings → PDF → engine)">{ENGINE_LABEL[engineName]}</span>{/if}</span>
    <span class="spacer"></span>

    <div class="tools" role="toolbar" aria-label="Annotation tools">
      <button class="tool" class:on={tool === "select"} title="Select (V)" onclick={() => pick("select")}>
        <Icon name="pointer" size={15} />
      </button>
      <button class="tool" class:on={tool === "highlight"} title="Highlight (H): select text to mark it; H over a selection marks it at once" onclick={() => pick("highlight")}>
        <Icon name="highlighter" size={15} />
      </button>
      <button class="tool" class:on={tool === "underline"} title="Underline (U): select text to underline it" aria-label="Underline" onclick={() => pick("underline")}>
        <Icon name="underline" size={15} />
      </button>
      <button class="tool" class:on={tool === "strike"} title="Strike through (X): select text to strike it" aria-label="Strike through" onclick={() => pick("strike")}>
        <Icon name="strike" size={15} />
      </button>
      <button class="tool" class:on={tool === "ink"} title="Pen / stylus (P)" onclick={() => pick("ink")}>
        <Icon name="pen" size={15} />
      </button>
      <button class="tool" class:on={tool === "text"} title="Text note (T)" onclick={() => pick("text")}>
        <Icon name="text" size={15} />
      </button>
      <button class="tool" class:on={tool === "postit"} title="Post-it (N): click a place; over a highlight it is that passage's" aria-label="Post-it" onclick={() => pick("postit")}>
        <Icon name="sticky" size={15} />
      </button>
      <button class="tool" class:on={tool === "clip"} title="Clip an area (C): drag a box around a figure or an equation" aria-label="Clip an area" onclick={() => pick("clip")}>
        <Icon name="crop" size={15} />
      </button>
      <button class="tool" class:on={tool === "stamp"} title="Stamp (M): ✓ ? ! ★ where you click" aria-label="Stamp" onclick={() => pick("stamp")}>
        <Icon name="stamp" size={15} />
      </button>
      <button class="tool fill" class:on={bookmarked} title="Bookmark this page (B)" aria-label="Bookmark this page" aria-pressed={bookmarked} onclick={() => void toggleBookmark()}>
        <Icon name="bookmark" size={15} />
      </button>
      <button class="tool" class:on={erasing} title="Eraser (E): a saved mark taken out where you click" aria-label="Eraser" aria-pressed={erasing} onclick={() => erase()}>
        <Icon name="eraser" size={15} />
      </button>
      {#if tool !== "select"}
        <span class="sep"></span>
        {#each Object.entries(COLORS) as [name, hex] (name)}
          <button class="swatch" class:on={color === hex} style:background={hex} title={name} aria-label={name} onclick={() => pickColor(hex)}></button>
        {/each}
        {#if tool === "stamp"}
          {#each Object.entries(STAMPS) as [name, glyph] (name)}
            <button class="tool stamp" class:on={stamp === name} title={name} aria-label={`Stamp ${name}`} onclick={() => pickStamp(name as Stamp)}>{glyph}</button>
          {/each}
        {/if}
        {#if tool === "ink"}
          <input class="thick" type="range" min="1" max="12" bind:value={thickness} oninput={() => tools?.setThickness(thickness)} title="Thickness" />
        {/if}
      {/if}
    </div>

    <span class="sep"></span>
    {#if pages}
      <span class="pager">
        <input class="page-in" bind:value={pageInput} onkeydown={(e) => { if (e.key === "Enter") goto(Number(pageInput) || 1); }} aria-label="Page" />
        <span class="faint">/ {pages}</span>
      </span>
      <button class="icon-btn" title="Zoom out" onclick={() => zoom(1 / 1.15)}><Icon name="minus" size={14} /></button>
      <button class="zoom-label" title="Fit the width; again: the whole page" onclick={fitWidth}>{scaleLabel}</button>
      <button class="icon-btn" title="Zoom in" onclick={() => zoom(1.15)}><Icon name="plus" size={14} /></button>
    {/if}
    <span class="sep"></span>
    <button class="icon-btn" title="Rotate the pages" aria-label="Rotate" onclick={rotate}><Icon name="repeat" size={14} /></button>
    <button class="icon-btn" class:on={spread} title="Two pages side by side" aria-label="Two pages" onclick={toggleSpread}><Icon name="library" size={14} /></button>
    <button class="icon-btn" class:on={dark} title="Dark pages (D)" aria-label="Dark pages" onclick={toggleDark}><Icon name="moon" size={14} /></button>
    <button class="icon-btn" title="Copy a link to this page — or to the selected text — to paste in a note ([[…#page=…]])" aria-label="Copy link" onclick={copyLink}><Icon name="link" size={14} /></button>
    <button class="icon-btn" title="Find (Ctrl+F)" onclick={() => { findOpen = !findOpen; if (findOpen) requestAnimationFrame(() => findInput?.focus()); }}><Icon name="search" size={14} /></button>
    <span class="sep"></span>
    <button class="icon-btn" title="This paper's note (its <citekey>.md), beside the PDF" aria-label="Paper's note" onclick={() => void notesBeside(spec.path)}><Icon name="file-text" size={14} /></button>
    <button class="icon-btn" title="Export a copy with the marks inside, as annotations any PDF reader shows — x (marked).pdf, beside this one. Shift+click: drawn into the pages, for printing — x (marked, flat).pdf" aria-label="Export with marks" onclick={(e) => void exportWithMarks(spec.path, e.shiftKey ? "flat" : "annotations")}><Icon name="pdf" size={14} /></button>
    <button class="icon-btn" title="Write the highlights and their comments into the paper's note — the same <citekey>.md the note button opens" aria-label="Highlights into the note" onclick={toNotes}><Icon name="quote" size={14} /></button>
  </div>

  {#if findOpen}
    <div class="findbar">
      <input bind:this={findInput} bind:value={findQ} placeholder="Find in document" oninput={() => runFind()} onkeydown={(e) => { if (e.key === "Enter") runFind(true, e.shiftKey); if (e.key === "Escape") { findOpen = false; findQ = ""; runFind(); } }} />
      <span class="faint small">{findQ ? findInfo : ""}</span>
      <button class="icon-btn" title="Previous (Shift+Enter)" onclick={() => runFind(true, true)}>↑</button>
      <button class="icon-btn" title="Next (Enter)" onclick={() => runFind(true)}>↓</button>
    </div>
  {/if}

  <div class="body">
    {#if outlineOpen && side === "outline" && outline.length}
      <nav class="outline scroll">
        {#each outline as o, i (i)}
          <button class="ol-item" style:padding-left="{10 + o.depth * 12}px" onclick={() => jump(o)}>{o.title}</button>
        {/each}
      </nav>
    {:else if outlineOpen && side === "pages" && pages}
      <PdfThumbs {pages} path={spec.path} engine={engineName} {current} {dark} onpick={goto} />
    {:else if outlineOpen && side === "marks"}
      <PdfMarksList marks={markList} {current} onpick={(n, y) => r?.goto(n, y)} />
    {/if}
    <div class="viewer-wrap" bind:this={wrap}>
      {#if picked && barAt}
        <PdfMarkBar mark={picked} at={barAt} onrecolor={(hex) => editPicked(recoloured(picked!, hex))} onreword={(t) => editPicked(reworded(picked!, t))} ondelete={deletePicked} onclose={unpick} />
      {/if}
      <div class="viewer-container" onscroll={() => { if (picked) placeBar(); }} class:inking={tool === "ink"} class:noting={tool === "text" || tool === "postit" || tool === "clip" || tool === "stamp"} class:can-pan={tool === "select" && !erasing} class:erasing class:dark bind:this={container} onwheel={pinch} onclickcapture={eraseClick}>
        <div class="pdfViewer"></div>
      </div>
      {#if error}
        <div class="pane-empty overlay">
          <p class="muted">{ENGINE_LABEL[engineName]} could not open this PDF.</p><p class="faint small">{error}</p>
          <button class="btn" onclick={openWithOther}>Open with {ENGINE_LABEL[otherEngine(engineName)]}</button>
        </div>
      {/if}
    </div>
  </div>
  {#if status}<div class="status">{status}</div>{/if}
</div>

<style>
  .pdf-pane { height: 100%; display: flex; flex-direction: column; background: var(--bg); position: relative; outline: none; }
  .toolbar { display: flex; align-items: center; gap: 4px; height: 38px; padding: 0 8px 0 8px; border-bottom: 1px solid var(--border); font-size: calc(12.5px * var(--ui-scale, 1)); color: var(--text-muted); flex: none;
    overflow-x: auto; scrollbar-width: none; }
  /* the title gives way first; nothing else shrinks (the page counter wrapped to two lines); narrower than the tools, the bar scrolls */
  .toolbar > :not(.title):not(.spacer) { flex: none; }
  .pager { white-space: nowrap; }
  .title { display: inline-flex; align-items: center; gap: 6px; flex: 0 1 auto; min-width: 40px; white-space: nowrap; margin-left: 4px; }
  .overlay button { margin-top: 8px; padding: 4px 12px; border: 1px solid var(--border-strong); border-radius: 6px; pointer-events: auto; }
  .overlay button:hover { background: var(--bg-hover); }
  .title .engine { border: 1px solid var(--border); border-radius: 4px; padding: 0 4px; }
  .title .name { overflow: hidden; text-overflow: ellipsis; min-width: 0; }
  .title :global(svg) { flex: none; }
  .spacer { flex: 1; }
  .sep { width: 1px; height: 16px; background: var(--border); margin: 0 4px; flex: none; }
  .tools { display: inline-flex; align-items: center; gap: 2px; background: var(--bg-elev); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 2px; }
  .tool { display: grid; place-items: center; width: 26px; height: 24px; border-radius: calc(var(--radius-sm) - 2px); color: var(--text-muted); }
  .tool:hover { background: var(--bg-hover); color: var(--text); }
  .tool.on, .icon-btn.on { background: var(--accent-soft, var(--bg-hover)); color: var(--accent); }
  .tool.fill.on :global(path) { fill: currentColor; }
  .swatch { width: 16px; height: 16px; border-radius: 50%; border: 2px solid transparent; margin: 0 1px; }
  .swatch.on { border-color: var(--text); }
  .thick { width: 70px; margin-left: 4px; accent-color: var(--accent); }
  .pager { display: inline-flex; align-items: center; gap: 4px; font-variant-numeric: tabular-nums; }
  .page-in { width: 36px; text-align: center; background: var(--bg-elev); border: 1px solid var(--border); border-radius: var(--radius-sm); color: var(--text); font: inherit; padding: 2px 0; }
  .zoom-label { min-width: 46px; padding: 3px 6px; border-radius: var(--radius-sm); color: var(--text); font-variant-numeric: tabular-nums; }
  .zoom-label:hover { background: var(--bg-hover); }
  /* a phone: tools a finger can hit, the bar scrolling sideways rather than squeezed; the name is the top bar's */
  :global(html.phone) .toolbar { height: 50px; gap: 6px; overflow-x: auto; scrollbar-width: none; }
  :global(html.phone) .toolbar > * { flex: none; }
  :global(html.phone) .title, :global(html.phone) .toolbar .spacer { display: none; }
  :global(html.phone) .tool { width: 40px; height: 38px; }
  :global(html.phone) .swatch { width: 26px; height: 26px; }
  :global(html.phone) .page-in { width: 44px; padding: 6px 0; font-size: 16px; }
  :global(html.phone) .zoom-label { padding: 9px 10px; }
  .findbar { display: flex; align-items: center; gap: 6px; padding: 5px 10px; border-bottom: 1px solid var(--border); background: var(--bg-elev); flex: none; }
  .findbar input { flex: 0 1 280px; background: var(--bg); border: 1px solid var(--border); border-radius: var(--radius-sm); color: var(--text); font: inherit; padding: 3px 8px; }
  .body { flex: 1; min-height: 0; display: flex; }
  .outline { width: 240px; flex: none; border-right: 1px solid var(--border); overflow: auto; padding: 6px 0; background: var(--bg-elev); }
  .ol-item { display: block; width: 100%; text-align: left; padding: 4px 10px; font-size: calc(12.5px * var(--ui-scale, 1)); color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .ol-item:hover { background: var(--bg-hover); color: var(--text); }
  .viewer-wrap { position: relative; flex: 1; min-width: 0; }
  /* the reader scrolls this box (lib/pdf-reader.ts) */
  .viewer-container { position: absolute; inset: 0; overflow: auto; background: var(--pdf-bg); }
  .icon-btn .count { font-size: 10px; margin-left: 2px; color: var(--text-faint); }
  .tool.stamp { font-size: 13px; font-weight: 700; min-width: 22px; }
  .viewer-container.inking { touch-action: none; } /* stylus strokes are not scroll gestures */
  /* the pen and the text note take a press on text or a link too (lib/pdf-tools.ts) */
  .viewer-container.inking :global(.pageLayers > div), .viewer-container.noting :global(.pageLayers > div),
  .viewer-container.inking :global(.linkLayer > a), .viewer-container.noting :global(.linkLayer > a) { pointer-events: none; }
  .viewer-container.inking :global(.page), .viewer-container.noting :global(.page) { cursor: crosshair; }
  /* the select tool: the page's blank parts drag it (lib/pdf-pan.ts), text keeps its text cursor */
  .viewer-container.can-pan :global(.pdfViewer .page), .viewer-container.can-pan :global(.textLayer) { cursor: grab; }
  .viewer-container.can-pan :global(.textLayer span) { cursor: text; }
  .viewer-container:global(.panning), .viewer-container:global(.panning) :global(*) { cursor: grabbing !important; user-select: none; }
  .viewer-container :global(.pdfViewer .page) { margin: 14px auto; border: none; box-shadow: 0 1px 3px rgba(0,0,0,.25), 0 8px 24px rgba(0,0,0,.18); border-radius: 2px; }
  /* dark reading: invert the rendered page (Zotero/Okular-style); annotation layers keep their colours */
  .viewer-container.dark :global(.pdfViewer .page .canvasWrapper) { filter: invert(.88) hue-rotate(180deg); }
  /* a link's annotation (#annotation=…), pointed at once it is drawn */
  .viewer-container :global(.atlas-flash-mark) { animation: atlas-flash-mark 1.6s ease-out 2; }
  @keyframes -global-atlas-flash-mark { 0%, 40% { filter: drop-shadow(0 0 3px var(--accent)) drop-shadow(0 0 8px var(--accent)); } 100% { filter: none; } }
  .viewer-container :global(.atlas-flash) { animation: atlas-flash 1.6s ease-out 2; border-radius: 2px; }
  @keyframes -global-atlas-flash { 0%, 40% { box-shadow: 0 0 0 3px var(--accent), 0 0 18px 4px var(--accent); } 100% { box-shadow: 0 0 0 3px transparent; } }
  .overlay { position: absolute; inset: 0; }
  .status { position: absolute; bottom: 14px; left: 50%; transform: translateX(-50%); background: var(--bg-elev); border: 1px solid var(--border); border-radius: 999px; padding: 5px 14px; font-size: calc(12.5px * var(--ui-scale, 1)); color: var(--text); box-shadow: 0 6px 20px rgba(0,0,0,.25); pointer-events: none; }
  .viewer-container.erasing :global(.page) { cursor: crosshair; }
</style>
