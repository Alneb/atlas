<script module lang="ts">
  import { releaseCanvases } from "../lib/release-canvases";
  import { superOf } from "../lib/keys";
  let lastUsed: HTMLElement | null = null; // the PDF pane the pointer was last in (see onWin below)
</script>

<script lang="ts">
  import { errText } from "../lib/text";
  import { attachPan } from "../lib/pdf-pan";
  import { shownName } from "../lib/paths";
  // PDF reader + annotator on pdf.js's viewer: highlight (H), pen/stylus ink (P), text (T), select (V/Esc),
  // find (Ctrl+F), outline and page thumbnails, zoom (Ctrl+= / Ctrl+- / Ctrl+0), dark pages (D), reopens at
  // the last page read, save into the PDF (Ctrl+S, 409-safe), "to notes" extracts annotations to markdown.
  import { pdfPages } from "../lib/registry";
  import { onMount } from "svelte";
  import type { PaneProps } from "../lib/dock";
  import { setDirty } from "../lib/dock";
  import { createViewer, COLORS, type ToolName, type Viewer } from "../lib/pdf-viewer";
  import { attachPdfInk } from "../lib/pdf-ink";
  import { eraseAt, writeMarks, type PageBox } from "../lib/pdf-ink-save";
  import { api, ApiError } from "../lib/api";
  import { ensureNoteOf, notesBeside } from "../lib/papers";
  import { placeLink, selectedPlace, showAnnotation, showPlace } from "../lib/pdf-place";
  import Icon from "../components/Icon.svelte";
  import PdfThumbs from "../components/PdfThumbs.svelte";
  import { settings } from "../lib/settings.svelte";

  let { spec, panel }: PaneProps<"pdf"> = $props();
  let container: HTMLDivElement;
  let v = $state.raw<Viewer | null>(null); // raw: pdf.js objects must not be proxied
  let error = $state("");
  let pages = $state(0);
  let pageInput = $state("1");
  let scaleLabel = $state("Fit");
  let tool = $state<ToolName>("select");
  // Starting values come from Settings → [pdf]; the toolbar changes them for this pane only.
  const pdfCfg = () => settings.config?.pdf;
  let color = $state<string>(COLORS[pdfCfg()?.color ?? "yellow"]);
  let thickness = $state(pdfCfg()?.ink_thickness ?? 2);
  const ZOOM = { "page-width": "page-width", "page-fit": "page-fit", actual: "1" } as const;
  const openZoom = () => ZOOM[pdfCfg()?.open_zoom ?? "page-width"];
  let dirty = $state(false);
  let saving = $state(false);
  let status = $state("");
  let findOpen = $state(false);
  let passage: { page: number; sel: [number, number, number, number] } | null = null;
  let annotation: { page: number; id: string } | null = null; // a link's #annotation=…, flashed once drawn
  let spread = $state(false);
  // a link to this page, or to the selected passage, the Obsidian / PDF++ way (lib/pdf-place.ts)
  async function copyLink() {
    const here = selectedPlace(container);
    const link = here ? placeLink(spec.path, here, here.text) : placeLink(spec.path, { page: current || 1 });
    try { await navigator.clipboard.writeText(link); flash(here?.selection ? "Link to the selected passage copied" : `Link to page ${current || 1} copied`); }
    catch { flash(link, 8000); }
  }
  const rotate = () => { if (v) v.viewer.pagesRotation = (v.viewer.pagesRotation + 90) % 360; };
  const toggleSpread = () => { spread = !spread; if (v) v.viewer.spreadMode = spread ? 1 : 0; };
  let findQ = $state("");
  let findInfo = $state("");
  let outlineOpen = $state(false);
  let side = $state<"outline" | "pages">("outline");
  let current = $state(1);
  let dark = $state(loadPref("atlas.pdf.dark") === "1");
  let outline = $state<{ title: string; dest: unknown; depth: number }[]>([]);
  let offInk = () => {};
  let findInput = $state<HTMLInputElement | null>(null);

  // per-viewer conveniences (which page, which zoom, dark pages): browser storage, never required
  function loadPref(k: string): string | null { try { return localStorage.getItem(k); } catch { return null; } }
  function savePref(k: string, v: string): void { try { localStorage.setItem(k, v); } catch { /* private window */ } }
  const posKey = () => `atlas.pdf.pos:${spec.path}`;
  let posTimer = 0;
  function rememberPosition() {
    clearTimeout(posTimer);
    posTimer = window.setTimeout(() => { if (v) savePref(posKey(), JSON.stringify({ page: v.viewer.currentPageNumber, scale: v.viewer.currentScaleValue })); }, 400);
  }
  function restorePosition() {
    const raw = loadPref(posKey());
    if (!raw || !v) return;
    try {
      const pos = JSON.parse(raw) as { page?: number; scale?: string };
      if (pos.scale) { v.viewer.currentScaleValue = pos.scale; if (pos.scale !== "page-width") scaleLabel = `${Math.round(v.viewer.currentScale * 100)}%`; }
      if (pos.page && pos.page > 1 && pos.page <= pages) v.viewer.currentPageNumber = pos.page;
    } catch { /* a stale entry is not worth an error */ }
  }
  function toggleDark() { dark = !dark; savePref("atlas.pdf.dark", dark ? "1" : "0"); }
  function toggleSide(which: "outline" | "pages") { if (outlineOpen && side === which) outlineOpen = false; else { side = which; outlineOpen = true; } }

  function flash(s: string, ms = 2500) { status = s; setTimeout(() => { if (status === s) status = ""; }, ms); }

  // the eraser: a mark of the PDF's drawing taken out where it is clicked (lib/pdf-ink-save.ts eraseAt); pdf.js's own
  // tools are off meanwhile
  let erasing = $state(false);
  function erase(on = !erasing) { erasing = on; if (on) { tool = "select"; v?.setTool("select"); } }
  async function eraseClick(e: MouseEvent) {
    if (!erasing) return;
    const pageEl = (e.target as HTMLElement).closest<HTMLElement>(".page[data-page-number]");
    if (!pageEl) return;
    e.preventDefault(); e.stopPropagation();
    const r = pageEl.getBoundingClientRect();
    try {
      const gone = await eraseAt(spec.path, Number(pageEl.dataset.pageNumber), (e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
      if (!gone) flash("No mark of its drawing there");
    } catch (err) { flash(`Not erased: ${errText(err)}`, 5000); }
  }

  function pick(t: ToolName) {
    erasing = false;
    tool = t;
    v?.setTool(t);
    if (t !== "select") requestAnimationFrame(() => { v?.setColor(color); if (t === "ink") v?.setThickness(thickness); });
  }
  function pickColor(c: string) { color = c; v?.setColor(c); }

  /** The marks made here into the PDF's companion drawing (`x.pdf.excalidraw`), the store every device writes — the
   *  PDF itself is never modified; then the document opened
   *  again, its marks shown from there. */
  async function save() {
    if (!v || saving) return;
    saving = true;
    const was = v;
    try {
      const n = await writeMarks(spec.path, was.marks(), async (k) => (await was.doc.getPage(k)).view as PageBox);
      dirty = false;
      savePref(posKey(), JSON.stringify({ page: was.viewer.currentPageNumber, scale: was.viewer.currentScaleValue }));
      offInk(); was.destroy(); v = null;
      await openViewer();
      flash(n ? `Saved into ${shownName(spec.path.split("/").pop()!)}'s notes (its drawing)` : "Nothing new to save");
      if (pdfCfg()?.export_on_save) void toNotes();
    } catch (e) {
      dirty = true;
      flash(e instanceof ApiError && e.status === 409 ? "Its notes changed on another device meanwhile — save again" : `Save failed: ${errText(e)}`, 6000);
    } finally {
      saving = false;
    }
  }

  async function toNotes() {
    if (dirty) { await save(); if (pdfCfg()?.export_on_save) return; } // save() already exported
    try {
      await ensureNoteOf(spec.path); // a paper's note starts with its properties and block, then the export
      const r = await api.cmd("pdf.annotations", { path: spec.path });
      if (!r.ok) throw new Error(r.error);
      flash(typeof r.result === "string" ? r.result : "Annotations exported");
    } catch (e) {
      flash(`Export failed: ${errText(e)}`, 6000);
    }
  }

  function zoom(f: number) { if (v) { v.viewer.currentScale = Math.min(6, Math.max(0.25, v.viewer.currentScale * f)); } }
  // the label: fit the width, again: the whole page
  const fitWidth = () => { if (v) v.viewer.currentScaleValue = v.viewer.currentScaleValue === "page-width" ? "page-fit" : "page-width"; };
  const goto = (n: number) => { if (v) v.viewer.currentPageNumber = Math.max(1, Math.min(n, pages)); };

  function runFind(again = false, back = false) {
    v?.bus.dispatch("find", { source: null, type: again ? "again" : "", query: findQ, caseSensitive: false, entireWord: false, highlightAll: true, findPrevious: back, matchDiacritics: false });
  }

  async function loadOutline() {
    const items = (await v?.doc.getOutline()) ?? [];
    const flat: typeof outline = [];
    const walk = (xs: typeof items, depth: number) => { for (const x of xs ?? []) { flat.push({ title: x.title, dest: x.dest, depth }); walk(x.items, depth + 1); } };
    walk(items, 0);
    outline = flat;
  }
  async function jump(dest: unknown) {
    if (!v || !dest) return;
    const explicit = typeof dest === "string" ? await v.doc.getDestination(dest) : (dest as unknown[]);
    if (!explicit) return;
    const idx = await v.doc.getPageIndex(explicit[0] as never);
    v.viewer.scrollPageIntoView({ pageNumber: idx + 1, destArray: explicit as never });
  }

  function onkeydown(e: KeyboardEvent) {
    const mod = e.ctrlKey || superOf(e);
    if (mod && e.key.toLowerCase() === "s") { e.preventDefault(); e.stopPropagation(); void save(); return; }
    if (mod && e.key.toLowerCase() === "f") { e.preventDefault(); e.stopPropagation(); findOpen = true; requestAnimationFrame(() => findInput?.select()); return; }
    // zoom the page, not the app (the shell's Ctrl+= scales the whole UI)
    if (mod && (e.key === "=" || e.key === "+")) { e.preventDefault(); e.stopPropagation(); zoom(1.15); return; }
    if (mod && e.key === "-") { e.preventDefault(); e.stopPropagation(); zoom(1 / 1.15); return; }
    if (mod && e.key === "0") { e.preventDefault(); e.stopPropagation(); fitWidth(); return; }
    const t = e.target as HTMLElement;
    const typing = t.isContentEditable || /^(INPUT|TEXTAREA)$/.test(t.tagName);
    // annotation undo/redo/delete: pdf.js only hears its own keys while focus is inside its viewer,
    // so the pane forwards them as the viewer's "editingaction" (what its toolbar buttons send)
    const edit = mod && e.key.toLowerCase() === "z" ? (e.shiftKey ? "redo" : "undo")
      : mod && e.key.toLowerCase() === "y" ? "redo"
      : !mod && !typing && (e.key === "Delete" || e.key === "Backspace") ? "delete" : null;
    if (edit && v && !typing) { e.preventDefault(); e.stopPropagation(); v.bus.dispatch("editingaction", { source: null, name: edit }); return; }
    if (mod || typing) return;
    const k = e.key.toLowerCase();
    if (k === "h") pick("highlight");
    else if (k === "p") pick("ink");
    else if (k === "t") pick("text");
    else if (k === "e") erase();
    else if (k === "v" || (k === "escape" && (tool !== "select" || erasing))) pick("select");
    else if (k === "d") toggleDark();
    else return;
    e.preventDefault();
  }

  $effect(() => { setDirty(panel.id, dirty); });

  // Ctrl+wheel and a touchpad pinch zoom the pages smoothly: scaled at once, drawn sharp when the
  // gesture rests (pdf.js's drawingDelay) — the app's own Ctrl+wheel (pane-zoom.ts) leaves a PDF alone
  function pinch(e: WheelEvent) {
    if (!e.ctrlKey || !v) return;
    e.preventDefault();
    const px = e.deltaMode === 1 ? e.deltaY * 40 : e.deltaY;
    v.viewer.updateScale({ drawingDelay: 400, scaleFactor: Math.exp(-px / 300), origin: [e.clientX, e.clientY] });
  }

  // pdf.js rebuilds a page's text layer on zoom, and the focused node goes with it: focus falls to <body>
  // and the pane would stop hearing keys. Keys typed with nothing focused go to the PDF pane used last.
  let paneEl: HTMLDivElement;
  const markUsed = () => { lastUsed = paneEl; };
  $effect(() => {
    const onWin = (e: KeyboardEvent) => { if (document.activeElement === document.body && lastUsed === paneEl && paneEl.isConnected) onkeydown(e); };
    window.addEventListener("keydown", onWin);
    // the module keeps the last pane used: a closed one must not stay alive through it
    return () => { window.removeEventListener("keydown", onWin); if (lastUsed === paneEl) lastUsed = null; };
  });

  let disposed = false;
  /** The document in the viewer (again, after a save: pdf.js's marks then show from the companion drawing). */
  async function openViewer(): Promise<void> {
    try {
      const viewer = await createViewer(container, spec.path, (d) => (dirty = d));
      if (disposed) { viewer.destroy(); return; }
      v = viewer;
      // the ink every device writes to the PDF's companion drawing, over its pages (lib/pdf-ink.ts)
      offInk = attachPdfInk(container, spec.path, (drawn) => {
        const f = (e: { pageNumber: number }) => drawn(e.pageNumber);
        viewer.bus.on("pagerendered", f);
        return () => viewer.bus.off("pagerendered", f);
      });
      viewer.bus.on("pagesinit", () => { viewer.viewer.currentScaleValue = openZoom(); pages = viewer.doc.numPages; restorePosition(); if (spec.page) { goto(spec.page); passage = spec.selection ? { page: spec.page, sel: spec.selection } : null; annotation = spec.annotation ? { page: spec.page, id: spec.annotation } : null; panel.updateParameters({ ...spec, page: undefined, selection: undefined, annotation: undefined }); } }); // used once: a restored layout must not jump back
      // a link's passage (#page=…&selection=…) is selected once that page's text is drawn
      viewer.bus.on("textlayerrendered", (e: { pageNumber: number }) => { if (passage && e.pageNumber === passage.page && showPlace(container, passage.page, passage.sel)) passage = null; });
      viewer.bus.on("annotationlayerrendered", (e: { pageNumber: number }) => { if (annotation && e.pageNumber === annotation.page && showAnnotation(container, annotation.page, annotation.id)) annotation = null; });
      viewer.bus.on("pagechanging", (e: { pageNumber: number }) => { pageInput = String(e.pageNumber); current = e.pageNumber; rememberPosition(); });
      viewer.bus.on("scalechanging", (e: { scale: number; presetValue?: string }) => { scaleLabel = e.presetValue === "page-width" ? "Fit" : e.presetValue === "page-fit" ? "Page" : `${Math.round(e.scale * 100)}%`; rememberPosition(); });
      viewer.bus.on("updatefindmatchescount", (e: { matchesCount: { current: number; total: number } }) => { findInfo = e.matchesCount.total ? `${e.matchesCount.current}/${e.matchesCount.total}` : "0"; });
      void loadOutline();
    } catch (err) {
      error = errText(err);
    }
  }

  onMount(() => {
    void openViewer();
    pdfPages.set(panel.id, (n) => goto(n));
    // refit on a real width change only: a background tab leaves the page (width 0) and comes back at the same
    // width — refitting then re-laid out every page on each tab switch
    let fittedAt = 0;
    const offPan = attachPan(container, () => tool === "select" && !erasing);
    const ro = new ResizeObserver(() => {
      const w = container.clientWidth;
      if (!w || w === fittedAt) return;
      fittedAt = w;
      if (v && scaleLabel === "Fit") v.viewer.currentScaleValue = "page-width";
    });
    ro.observe(container);
    return () => { disposed = true; releaseCanvases(container); offInk(); offPan(); pdfPages.delete(panel.id); ro.disconnect(); clearTimeout(posTimer); v?.destroy(); setDirty(panel.id, false); };
  });
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="pdf-pane" {onkeydown} onpointerdown={markUsed} bind:this={paneEl}>
  <div class="toolbar">
    <button class="icon-btn" class:on={outlineOpen && side === "outline"} title="Outline" aria-label="Outline" onclick={() => toggleSide("outline")} disabled={!outline.length}>
      <svg viewBox="0 0 16 16" width="15" height="15"><path d="M2 3.5h12M5 8h9M5 12.5h9" stroke="currentColor" stroke-width="1.4" fill="none" stroke-linecap="round"/></svg>
    </button>
    <button class="icon-btn" class:on={outlineOpen && side === "pages"} title="Pages" aria-label="Pages" onclick={() => toggleSide("pages")} disabled={!pages}>
      <svg viewBox="0 0 16 16" width="15" height="15"><rect x="2.5" y="2" width="4.5" height="5.5" rx="1" fill="none" stroke="currentColor" stroke-width="1.3"/><rect x="9" y="2" width="4.5" height="5.5" rx="1" fill="none" stroke="currentColor" stroke-width="1.3"/><rect x="2.5" y="9" width="4.5" height="5.5" rx="1" fill="none" stroke="currentColor" stroke-width="1.3"/><rect x="9" y="9" width="4.5" height="5.5" rx="1" fill="none" stroke="currentColor" stroke-width="1.3"/></svg>
    </button>
    <span class="title" title={spec.path}><Icon name="pdf" size={14} /><span class="name">{shownName(spec.path)}</span>{#if dirty}<span class="dot" title="Unsaved annotations"></span>{/if}</span>
    <span class="spacer"></span>

    <div class="tools" role="toolbar" aria-label="Annotation tools">
      <button class="tool" class:on={tool === "select"} title="Select (V)" onclick={() => pick("select")}>
        <svg viewBox="0 0 16 16" width="15" height="15"><path d="M3 2l9 6-4 1-2 4z" fill="currentColor"/></svg>
      </button>
      <button class="tool" class:on={tool === "highlight"} title="Highlight (H)" onclick={() => pick("highlight")}>
        <svg viewBox="0 0 16 16" width="15" height="15"><path d="M9.5 2.5l4 4-6 6H3.5v-4z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><path d="M2 14.5h12" stroke="currentColor" stroke-width="1.6"/></svg>
      </button>
      <button class="tool" class:on={tool === "ink"} title="Pen / stylus (P)" onclick={() => pick("ink")}>
        <svg viewBox="0 0 16 16" width="15" height="15"><path d="M2.5 13.5c2-1 3-4 5-6s4-3 6-5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
      </button>
      <button class="tool" class:on={tool === "text"} title="Text note (T)" onclick={() => pick("text")}>
        <svg viewBox="0 0 16 16" width="15" height="15"><path d="M3 3.5h10M8 3.5v9.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
      </button>
      <button class="tool" class:on={erasing} title="Eraser (E): a saved mark taken out where you click" aria-label="Eraser" aria-pressed={erasing} onclick={() => erase()}>
        <Icon name="eraser" size={15} />
      </button>
      {#if tool !== "select"}
        <span class="sep"></span>
        {#each Object.entries(COLORS) as [name, hex] (name)}
          <button class="swatch" class:on={color === hex} style:background={hex} title={name} aria-label={name} onclick={() => pickColor(hex)}></button>
        {/each}
        {#if tool === "ink"}
          <input class="thick" type="range" min="1" max="12" bind:value={thickness} oninput={() => v?.setThickness(thickness)} title="Thickness" />
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
    <button class="icon-btn" title="Write the highlights and their comments into the paper's note — the same <citekey>.md the note button opens" aria-label="Highlights into the note" onclick={toNotes}><Icon name="quote" size={14} /></button>
    <!-- only when there is something to save: the one word in the bar is the thing waiting for you -->
    {#if dirty || saving}<button class="text-btn primary" disabled={saving} title="Save annotations into the PDF (Ctrl+S)" onclick={save}>{saving ? "Saving…" : "Save"}</button>{/if}
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
          <button class="ol-item" style:padding-left="{10 + o.depth * 12}px" onclick={() => jump(o.dest)}>{o.title}</button>
        {/each}
      </nav>
    {:else if outlineOpen && side === "pages" && v}
      <PdfThumbs doc={v.doc} {current} {dark} onpick={goto} />
    {/if}
    <div class="viewer-wrap">
      <div class="viewer-container" class:inking={tool === "ink"} class:can-pan={tool === "select" && !erasing} class:erasing class:dark bind:this={container} onwheel={pinch} onclickcapture={eraseClick}>
        <div class="pdfViewer"></div>
      </div>
      {#if error}
        <div class="pane-empty overlay"><p class="muted">Could not open this PDF.</p><p class="faint small">{error}</p></div>
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
  .title .name { overflow: hidden; text-overflow: ellipsis; min-width: 0; }
  .title :global(svg) { flex: none; }
  .dot { width: 7px; height: 7px; border-radius: 50%; background: var(--accent); flex: none; }
  .spacer { flex: 1; }
  .sep { width: 1px; height: 16px; background: var(--border); margin: 0 4px; flex: none; }
  .tools { display: inline-flex; align-items: center; gap: 2px; background: var(--bg-elev); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 2px; }
  .tool { display: grid; place-items: center; width: 26px; height: 24px; border-radius: calc(var(--radius-sm) - 2px); color: var(--text-muted); }
  .tool:hover { background: var(--bg-hover); color: var(--text); }
  .tool.on, .icon-btn.on { background: var(--accent-soft, var(--bg-hover)); color: var(--accent); }
  .swatch { width: 16px; height: 16px; border-radius: 50%; border: 2px solid transparent; margin: 0 1px; }
  .swatch.on { border-color: var(--text); }
  .thick { width: 70px; margin-left: 4px; accent-color: var(--accent); }
  .pager { display: inline-flex; align-items: center; gap: 4px; font-variant-numeric: tabular-nums; }
  .page-in { width: 36px; text-align: center; background: var(--bg-elev); border: 1px solid var(--border); border-radius: var(--radius-sm); color: var(--text); font: inherit; padding: 2px 0; }
  .zoom-label { min-width: 46px; padding: 3px 6px; border-radius: var(--radius-sm); color: var(--text); font-variant-numeric: tabular-nums; }
  .zoom-label:hover, .text-btn:hover:not(:disabled) { background: var(--bg-hover); }
  .text-btn { padding: 3px 9px; border-radius: var(--radius-sm); color: var(--text); white-space: nowrap; }
  .text-btn.primary:not(:disabled) { background: var(--accent); color: var(--accent-fg, #fff); }
  .text-btn:disabled { opacity: .45; }
  /* a phone: tools a finger can hit, the bar scrolling sideways rather than squeezed; the name is the top bar's */
  :global(html.phone) .toolbar { height: 50px; gap: 6px; overflow-x: auto; scrollbar-width: none; }
  :global(html.phone) .toolbar > * { flex: none; }
  :global(html.phone) .title, :global(html.phone) .toolbar .spacer { display: none; }
  :global(html.phone) .tool { width: 40px; height: 38px; }
  :global(html.phone) .swatch { width: 26px; height: 26px; }
  :global(html.phone) .page-in { width: 44px; padding: 6px 0; font-size: 16px; }
  :global(html.phone) .text-btn, :global(html.phone) .zoom-label { padding: 9px 10px; }
  .findbar { display: flex; align-items: center; gap: 6px; padding: 5px 10px; border-bottom: 1px solid var(--border); background: var(--bg-elev); flex: none; }
  .findbar input { flex: 0 1 280px; background: var(--bg); border: 1px solid var(--border); border-radius: var(--radius-sm); color: var(--text); font: inherit; padding: 3px 8px; }
  .body { flex: 1; min-height: 0; display: flex; }
  .outline { width: 240px; flex: none; border-right: 1px solid var(--border); overflow: auto; padding: 6px 0; background: var(--bg-elev); }
  .ol-item { display: block; width: 100%; text-align: left; padding: 4px 10px; font-size: calc(12.5px * var(--ui-scale, 1)); color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .ol-item:hover { background: var(--bg-hover); color: var(--text); }
  .viewer-wrap { position: relative; flex: 1; min-width: 0; }
  /* pdf.js requires an absolutely positioned scroll container. */
  .viewer-container { position: absolute; inset: 0; overflow: auto; background: var(--pdf-bg); }
  .viewer-container.inking { touch-action: none; } /* stylus strokes are not scroll gestures */
  /* the select tool: the page's blank parts drag it (lib/pdf-pan.ts), text keeps its text cursor */
  .viewer-container.can-pan :global(.pdfViewer .page), .viewer-container.can-pan :global(.textLayer) { cursor: grab; }
  .viewer-container.can-pan :global(.textLayer span) { cursor: text; }
  .viewer-container:global(.panning), .viewer-container:global(.panning) :global(*) { cursor: grabbing !important; user-select: none; }
  .viewer-container :global(.pdfViewer .page) { margin: 14px auto; border: none; box-shadow: 0 1px 3px rgba(0,0,0,.25), 0 8px 24px rgba(0,0,0,.18); border-radius: 2px; }
  /* dark reading: invert the rendered page (Zotero/Okular-style); annotation layers keep their colours */
  .viewer-container.dark :global(.pdfViewer .page .canvasWrapper) { filter: invert(.88) hue-rotate(180deg); }
  /* a link's annotation (#annotation=…), pointed at once it is drawn */
  .viewer-container :global(.atlas-flash) { animation: atlas-flash 1.6s ease-out 2; border-radius: 2px; }
  @keyframes -global-atlas-flash { 0%, 40% { box-shadow: 0 0 0 3px var(--accent), 0 0 18px 4px var(--accent); } 100% { box-shadow: 0 0 0 3px transparent; } }
  .overlay { position: absolute; inset: 0; }
  .status { position: absolute; bottom: 14px; left: 50%; transform: translateX(-50%); background: var(--bg-elev); border: 1px solid var(--border); border-radius: 999px; padding: 5px 14px; font-size: calc(12.5px * var(--ui-scale, 1)); color: var(--text); box-shadow: 0 6px 20px rgba(0,0,0,.25); pointer-events: none; }
  .viewer-container.erasing :global(.page) { cursor: crosshair; }
</style>
