<script lang="ts">
  // `library.paper`: one Library entry inside a note — what it is, where to read it online, and its
  // PDF embedded (the PDF block, so annotating works there too). The paper is `key:`, else the note's
  // `citekey` property, else the paper whose folder holds the note (its reading note). docs/ZOTERO.md.
  import { onMount } from "svelte";
  import { builtinOn } from "../../lib/builtin-plugins";
  import { library, onLibraryChange } from "../../lib/entities";
  import { open, openPath } from "../../lib/dock";
  import { richTitle } from "../../lib/rich-title";
  import { toast } from "../../lib/state.svelte";
  import type { Paper } from "../../lib/gen/Paper";
  import type { Props } from "../../lib/section-props";
  import Icon from "../Icon.svelte";

  let { doc = "", options = {}, props }: { doc?: string; options?: Record<string, unknown>; props: () => Promise<Props> } = $props();
  const PDF_HEIGHT = 760;
  let paper = $state<Paper | null>(null);
  let problem = $state("");
  let pdfEl = $state<HTMLDivElement>();

  const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const showPdf = $derived(options.hide_pdf !== true);
  const pdfHeight = $derived(Number(options.pdf_height) || PDF_HEIGHT);
  // in the paper's own note the title is the note's heading just above: not said twice
  const own = $derived(!!paper && doc === `${paper.dir}/${paper.key}.md`);

  async function load(): Promise<void> {
    if (!builtinOn("library")) { problem = "The Library is switched off in this vault (Settings → Plugins)."; return; }
    const key = text(options.key) || text((await props()).citekey);
    const dir = doc.includes("/") ? doc.slice(0, doc.lastIndexOf("/")) : "";
    const all = await library();
    paper = all.find((p) => (key ? p.key === key : p.dir === dir)) ?? null;
    problem = paper ? "" : key ? `No paper “${key}” in the Library.` : "This note is not in a paper's folder: give the block a key (key: <citekey>).";
  }

  // the PDF is the PDF block itself (one viewer for tabs, pages and notes), mounted once per file
  let shownPdf = "";
  let cleanPdf = () => {};
  $effect(() => {
    const path = showPdf ? paper?.pdf ?? "" : "";
    if (!pdfEl || path === shownPdf) return;
    cleanPdf();
    cleanPdf = () => {};
    shownPdf = path;
    if (!path) return;
    const el = pdfEl;
    void import("../../lib/blocks").then(({ mountBlock }) => {
      if (shownPdf === path) cleanPdf = mountBlock(el, doc, `type: pdf\npath: ${JSON.stringify(path)}\nheight: ${pdfHeight}`);
    });
  });

  async function copy(value: string, what: string) {
    try { await navigator.clipboard.writeText(value); toast(`Copied ${what}`, value); }
    catch (e) { toast("Copy failed", String(e), "error"); }
  }

  onMount(() => {
    void load();
    const off = onLibraryChange(() => void load());
    return () => { off(); cleanPdf(); };
  });
</script>

<div class="paper-block">
  {#if paper}
    <div class="kind">{paper.kind}{#if paper.year} · {paper.year}{/if}</div>
    {#if !own}<h2 class="title">{@html richTitle(paper.title)}</h2>{/if}
    {#if paper.authors.length}<p class="authors">{paper.authors.join("; ")}</p>{/if}
    {#if paper.venue}<p class="venue">{paper.venue}</p>{/if}
    <div class="links">
      {#if paper.doi}<a href={`https://doi.org/${paper.doi}`} target="_blank" rel="noreferrer"><Icon name="link" size={13} /> doi:{paper.doi}</a>{/if}
      {#if paper.arxiv}<a href={`https://arxiv.org/abs/${paper.arxiv}`} target="_blank" rel="noreferrer"><Icon name="link" size={13} /> arXiv:{paper.arxiv}</a>{/if}
      {#if paper.url && !paper.doi && !paper.arxiv}<a href={paper.url} target="_blank" rel="noreferrer"><Icon name="link" size={13} /> {paper.url.replace(/^https?:\/\//, "").slice(0, 60)}</a>{/if}
      <span class="tools">
        <button class="btn btn-ghost" title="Copy the citekey" onclick={() => copy(paper!.key, "citekey")}><Icon name="copy" size={13} /> {paper.key}</button>
        {#if paper.pdf}<button class="btn btn-ghost" title="The PDF in a tab of its own" onclick={() => openPath(paper!.pdf!)}><Icon name="pdf" size={13} /> Open PDF</button>{/if}
        <button class="btn btn-ghost" title="The Library" onclick={() => open({ kind: "libraries", at: "references" })}><Icon name="library" size={13} /> Library</button>
      </span>
    </div>
    {#if paper.collections.length || paper.tags.length}
      <div class="tags">
        {#each paper.collections as name}<span class="tag coll"><Icon name="folder" size={12} />{name}</span>{/each}
        {#each paper.tags as name}<span class="tag">#{name}</span>{/each}
      </div>
    {/if}
    {#if paper.abstract_text}
      <details class="abstract"><summary>Abstract</summary><p>{paper.abstract_text}</p></details>
    {/if}
    {#if showPdf}
      {#if paper.pdf}<div class="pdf" bind:this={pdfEl}></div>
      {:else}<p class="muted">No PDF yet — drop one into {paper.dir}/ (or onto the Library).</p>{/if}
    {/if}
  {:else if problem}
    <p class="muted">{problem}</p>
  {/if}
</div>

<style>
  .paper-block { padding: 4px 2px 2px; }
  .kind { margin-bottom: 2px; text-transform: uppercase; letter-spacing: .07em; font-size: calc(11px * var(--ui-scale, 1)); color: var(--text-faint); }
  .title { margin: 4px 0 6px; font-size: calc(18px * var(--ui-scale, 1)); color: var(--heading); line-height: 1.3; border: 0; padding: 0; }
  .authors { margin: 0; color: var(--text); }
  .venue { margin: 2px 0 0; color: var(--text-muted); font-style: italic; }
  .links { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 14px; margin: 8px 0 4px; }
  .links a { display: inline-flex; gap: 5px; align-items: center; color: var(--link, var(--accent)); text-decoration: none; font-size: .92em; }
  .links a:hover { text-decoration: underline; }
  .tools { display: inline-flex; flex-wrap: wrap; margin-left: auto; }
  .tools { gap: 6px; }
  .tools .btn { display: inline-flex; gap: 5px; align-items: center; height: 24px; padding: 0 8px; font-size: calc(12px * var(--ui-scale, 1)); color: var(--text); }
  .tags { display: flex; flex-wrap: wrap; gap: 6px; margin: 6px 0; }
  .tag { display: inline-flex; gap: 4px; align-items: center; font-size: calc(11.5px * var(--ui-scale, 1)); padding: 2px 9px; border-radius: 999px; border: 1px solid var(--border-strong); color: var(--text-muted); }
  .tag.coll { color: var(--text); }
  .abstract { margin: 6px 0; }
  .abstract summary { cursor: pointer; color: var(--text-muted); font-size: calc(11px * var(--ui-scale, 1)); text-transform: uppercase; letter-spacing: .07em; }
  .abstract p { margin: 6px 0 0; line-height: 1.6; color: var(--text); }
  .pdf { margin-top: 10px; }
  .muted { color: var(--text-muted); margin: 6px 0; }
</style>
