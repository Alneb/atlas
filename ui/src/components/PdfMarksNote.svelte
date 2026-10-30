<script lang="ts">
  // A PDF's pdf-marks block as the note shows it (lib/pdf-marks-fence.ts): the marks by page, each linked to its place
  // in the PDF (the passage's words selected there); a post-it under its passage; an area clip and a page's ink drawn
  // from the page by the reader's engine. The block's lines stay the store (core pdf_marks.rs); this only reads them.
  import { onMount } from "svelte";
  import { api } from "../lib/api";
  import { openWikilink } from "../lib/links";
  import { marksOfBlock } from "../lib/pdf-marks-lines";
  import { STAMPS, pageSvg, type Mark } from "../lib/pdf-marks";
  import { boxShown } from "../lib/pdf-geom";
  import { dpr, pageBitmap } from "../lib/pdf-pages";
  import { engine } from "../lib/pdf-engine";

  // `file`: the block is a chapter's in its series' note (```pdf-marks ch 1.cbz, core pdf_marks.rs `holder`): its
  // pages are pictures, so the marks are listed and linked, with no page drawn under them
  let { source, note, file = "" }: { source: string; note: string; file?: string } = $props();
  let pdf = $state<string | null>(null);
  const chapter = $derived(file ? `${note.slice(0, note.lastIndexOf("/") + 1)}${file}` : null);
  onMount(() => { if (!file) void api.pdfOfNote(note).then((r) => (pdf = r.pdf)).catch(() => {}); });

  const marks = $derived(marksOfBlock(source));
  const onPassage = (m: Mark) => m.kind === "postit" && !!m.on && marks.some((o) => o.id === m.on);
  const pages = $derived([...new Set(marks.map((m) => m.page))].sort((a, b) => a - b));
  const own = (n: number) => marks.filter((m) => m.page === n && !onPassage(m) && m.kind !== "ink");
  const notesOn = (id: string) => marks.filter((m) => m.kind === "postit" && m.on === id);
  const inked = (n: number) => marks.some((m) => m.page === n && m.kind === "ink");
  const TEXT = new Set(["highlight", "underline", "strike"]);
  const NAMES: Record<string, string> = { "text-box": "Text", postit: "Post-it", clip: "Clip", stamp: "Stamp", bookmark: "Bookmark" };

  function go(m: Mark, e: MouseEvent) {
    if (chapter) { void openWikilink(`${chapter.replace(/\/$/, "")}#page=${m.page}`, note, { beside: e.button === 1 || e.ctrlKey }).catch(() => {}); return; }
    if (!pdf) return;
    const words = TEXT.has(m.kind) ? (m as { quote?: { exact: string } | null }).quote?.exact : "";
    void openWikilink(`${pdf}#page=${m.page}${words ? `|${words}` : ""}`, note, { beside: e.button === 1 || e.ctrlKey });
  }

  /** An area of a page drawn into `canvas` (shown once the PDF is known): the clip's box, or the whole page with its
   *  ink over it. */
  function picture(canvas: HTMLCanvasElement, what: { page: number; rect?: [number, number, number, number]; ink?: boolean }) {
    let gone = false;
    const draw = async () => {
      if (!pdf) return;
      const eng = await engine();
      const lay = await eng.layers(pdf, what.page);
      const space = { view: lay.view, rotate: lay.rotate };
      const [W, H] = (lay.rotate & 1 ? [lay.view[3] - lay.view[1], lay.view[2] - lay.view[0]] : [lay.view[2] - lay.view[0], lay.view[3] - lay.view[1]]);
      const box = what.rect ? boxShown(space.view, space.rotate, what.rect) : [0, 0, W, H];
      const want = (what.rect ? 520 : 260) * dpr(), s = want / (box[2] - box[0]);
      const page = await pageBitmap(pdf, what.page, Math.round(W * s), "width");
      if (gone) return;
      canvas.width = Math.round((box[2] - box[0]) * s);
      canvas.height = Math.round((box[3] - box[1]) * s);
      const g = canvas.getContext("2d")!;
      g.drawImage(page, -box[0] * s, -box[1] * s);
      if (what.ink) {
        const svg = pageSvg(marks.filter((m) => m.kind === "ink"), what.page, space);
        svg.setAttribute("width", String(page.width)); svg.setAttribute("height", String(page.height));
        const img = new Image();
        img.src = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(svg)], { type: "image/svg+xml" }));
        await img.decode().catch(() => {});
        if (!gone) g.drawImage(img, 0, 0, page.width, page.height);
        URL.revokeObjectURL(img.src);
      }
    };
    void draw().catch(() => {});
    return { destroy() { gone = true; } };
  }
</script>

<section class="pdf-marks-note" aria-label="Marks">
  <header>
    <span class="title">Marks</span>
    <span class="faint">{marks.length} on {pages.length} page{pages.length === 1 ? "" : "s"}{#if pdf} · {pdf.split("/").pop()}{:else if file} · {file.replace(/\/$/, "")}{/if}</span>
  </header>
  {#each pages as n (n)}
    <div class="page">
      <div class="page-no">p. {n}</div>
      <div class="items">
        {#each own(n) as m (m.id)}
          <div class="item" id={m.id} data-kind={m.kind}>
            {#if TEXT.has(m.kind)}
              {@const q = (m as { quote?: { exact: string } | null }).quote}
              <button class="quote" class:struck={m.kind === "strike"} class:under={m.kind === "underline"} style:border-color={m.color ?? "#FFE066"} onclick={(e) => go(m, e)} onauxclick={(e) => go(m, e)}>{q?.exact || "(a passage)"}</button>
              {#each notesOn(m.id) as p (p.id)}
                <div class="postit" id={p.id}>{(p as { text: string }).text}</div>
              {/each}
            {:else if m.kind === "clip"}
              <button class="clip" onclick={(e) => go(m, e)}>{#if pdf}<canvas use:picture={{ page: n, rect: m.rect }}></canvas>{/if}{#if m.title}<span class="faint">{m.title}</span>{/if}</button>
            {:else}
              <button class="line" onclick={(e) => go(m, e)}>
                <span class="kind" style:color={m.color}>{m.kind === "stamp" ? STAMPS[m.stamp] : NAMES[m.kind] ?? m.kind}</span>
                <span>{m.kind === "text-box" || m.kind === "postit" ? m.text : m.kind === "bookmark" ? m.title || "" : ""}</span>
              </button>
            {/if}
            {#if m.tags?.length}<span class="tags">{#each m.tags as t (t)}<span class="tag">#{t}</span>{/each}</span>{/if}
          </div>
        {/each}
        {#if inked(n) && pdf}
          <button class="ink" onclick={(e) => go(marks.find((m) => m.page === n && m.kind === "ink")!, e)} title="Handwriting on page {n}"><canvas use:picture={{ page: n, ink: true }}></canvas></button>
        {:else if inked(n) && chapter}
          <button class="line" onclick={(e) => go(marks.find((m) => m.page === n && m.kind === "ink")!, e)}><span class="kind">Handwriting</span></button>
        {/if}
      </div>
    </div>
  {/each}
</section>

<style>
  .pdf-marks-note { border: 1px solid var(--border); border-radius: var(--radius-sm, 6px); padding: 8px 12px; background: var(--bg-elev); font-size: 0.95em; }
  header { display: flex; gap: 10px; align-items: baseline; margin-bottom: 6px; }
  .title { font-weight: 600; }
  .page { display: grid; grid-template-columns: 44px 1fr; gap: 8px; padding: 6px 0; border-top: 1px solid var(--border); }
  .page-no { color: var(--text-faint); font-size: 0.85em; padding-top: 2px; }
  .items { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
  .item { display: flex; flex-direction: column; gap: 3px; }
  button { text-align: left; color: var(--text); }
  .quote { border-left: 3px solid; padding: 1px 0 1px 8px; font-style: italic; line-height: 1.45; }
  .quote:hover, .line:hover { background: var(--bg-hover); }
  .struck { text-decoration: line-through; }
  .under { text-decoration: underline; }
  .postit { margin-left: 11px; padding: 3px 8px; background: color-mix(in srgb, #FFE066 28%, var(--bg)); border-radius: 3px; font-size: 0.95em; } /* literal: the highlighter's yellow */
  .line { display: flex; gap: 8px; }
  .kind { font-weight: 600; min-width: 4.5em; color: var(--text-muted); }
  .tags { display: flex; gap: 4px; margin-left: 11px; }
  .tag { font-size: 0.85em; color: var(--accent); }
  .clip, .ink { display: flex; flex-direction: column; gap: 2px; align-items: flex-start; }
  .clip canvas { max-width: 100%; height: auto; border: 1px dashed var(--border); background: #fff; } /* literal: paper */
  .ink canvas { width: 130px; height: auto; border: 1px solid var(--border); background: #fff; } /* literal: paper */
</style>
