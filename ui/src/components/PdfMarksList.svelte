<script lang="ts">
  // The PDF pane's Marks tab: the note's marks (lib/pdf-marks.ts) by page, filtered by kind or #tag; a post-it on a
  // highlight sits under it; a click goes to the mark's place and points it out.
  import { STAMPS, type Mark, type MarkKind } from "../lib/pdf-marks";
  let { marks, current, onpick }: { marks: readonly Mark[]; current: number; onpick: (m: Mark, y: number | null) => void } = $props();

  const LABEL: Partial<Record<MarkKind, string>> = {
    highlight: "Highlights", underline: "Underlines", strike: "Struck", "text-box": "Text", postit: "Post-its", ink: "Pen",
    clip: "Clips", stamp: "Stamps", bookmark: "Bookmarks",
  };
  let kind = $state<MarkKind | null>(null), tag = $state<string | null>(null);

  const live = $derived(marks.filter((m) => m.kind !== "deleted"));
  const kinds = $derived([...new Set(live.map((m) => m.kind))]);
  const tags = $derived([...new Set(live.flatMap((m) => m.tags ?? []))].sort());
  // the last mark of a filtered kind or tag gone: its chip goes, and so does the filter (else an empty list, no way out)
  $effect(() => { if (kind && !kinds.some((k) => k === kind)) kind = null; if (tag && !tags.includes(tag)) tag = null; });
  /** A post-it on a passage is listed under it, not on its own (unless filtered for: it is what is asked). */
  const ownerOf = (m: Mark) => (m.kind === "postit" && m.on && live.some((o) => o.id === m.on) ? m.on : null);
  const shown = $derived(live.filter((m) => (!kind || m.kind === kind) && (!tag || (m.tags ?? []).includes(tag)) && (kind === "postit" || tag || !ownerOf(m))));
  const pages = $derived([...new Set(shown.map((m) => m.page))].sort((a, b) => a - b));
  const notesOn = (id: string) => live.filter((m) => m.kind === "postit" && m.on === id);

  /** The words a mark shows in the list. */
  function words(m: Mark): string {
    switch (m.kind) {
      case "highlight": case "underline": case "strike": return m.quote?.exact || "(a passage)";
      case "text-box": case "postit": return m.text;
      case "clip": return m.title || "An area";
      case "bookmark": return m.title || `Page ${m.page}`;
      case "stamp": return STAMPS[m.stamp];
      case "ink": return `${m.strokes.length} stroke${m.strokes.length === 1 ? "" : "s"}`;
      default: return "";
    }
  }
  /** Its top in page space, to scroll it into view. */
  function topOf(m: Mark): number | null {
    switch (m.kind) {
      case "highlight": case "underline": case "strike": return m.quads.length ? Math.max(...m.quads.map((q) => q[3])) : null;
      case "text-box": case "clip": return m.rect[3];
      case "postit": case "stamp": return m.at[1];
      default: return null;
    }
  }
</script>

<nav class="marks scroll" aria-label="Marks">
  {#if !live.length}
    <p class="faint empty">No marks yet. Highlight (H), underline (U), a post-it (N), the pen (P)… — they are kept in the PDF's note.</p>
  {:else}
    <div class="filters">
      <button class="chip" class:on={!kind && !tag} onclick={() => { kind = null; tag = null; }}>All {live.length}</button>
      {#each kinds as k (k)}
        <button class="chip" class:on={kind === k} onclick={() => (kind = kind === k ? null : k)}>{LABEL[k] ?? k}</button>
      {/each}
      {#each tags as t (t)}
        <button class="chip tag" class:on={tag === t} onclick={() => (tag = tag === t ? null : t)}>#{t}</button>
      {/each}
    </div>
    {#each pages as p (p)}
      <div class="page-head" class:current={p === current}>Page {p}</div>
      {#each shown.filter((m) => m.page === p) as m (m.id)}
        <button class="mark" data-kind={m.kind} onclick={() => onpick(m, topOf(m))}>
          <span class="dot" style:background={m.color ?? "#FFE066"}></span>
          <span class="words" class:struck={m.kind === "strike"} class:under={m.kind === "underline"}>{words(m)}</span>
        </button>
        {#each notesOn(m.id) as n (n.id)}
          <button class="mark note" data-kind="postit" onclick={() => onpick(n, topOf(n))}><span class="words">{words(n)}</span></button>
        {/each}
      {/each}
    {/each}
  {/if}
</nav>

<style>
  .marks { width: 260px; flex: none; border-right: 1px solid var(--border); overflow: auto; padding: 6px 0; background: var(--bg-elev); font-size: calc(12.5px * var(--ui-scale, 1)); }
  .empty { padding: 8px 12px; line-height: 1.45; }
  .filters { display: flex; flex-wrap: wrap; gap: 4px; padding: 2px 8px 8px; border-bottom: 1px solid var(--border); margin-bottom: 4px; }
  .chip { padding: 1px 8px; border-radius: 999px; border: 1px solid var(--border); color: var(--text-muted); font-size: 0.92em; }
  .chip.on { background: var(--accent); border-color: var(--accent); color: var(--accent-fg, #fff); }
  .chip.tag { font-style: italic; }
  .page-head { padding: 6px 12px 2px; color: var(--text-faint); font-size: 0.85em; text-transform: uppercase; letter-spacing: 0.04em; }
  .page-head.current { color: var(--accent); }
  .mark { display: flex; gap: 8px; align-items: baseline; width: 100%; text-align: left; padding: 4px 12px; color: var(--text); }
  .mark:hover { background: var(--bg-hover); }
  .mark.note { padding-left: 30px; color: var(--text-muted); }
  .mark.note::before { content: "↳"; color: var(--text-faint); }
  .dot { width: 9px; height: 9px; border-radius: 2px; flex: none; transform: translateY(1px); }
  .words { overflow: hidden; display: -webkit-box; -webkit-line-clamp: 3; line-clamp: 3; -webkit-box-orient: vertical; line-height: 1.35; }
  .struck { text-decoration: line-through; }
  .under { text-decoration: underline; }
</style>
