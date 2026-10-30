<script lang="ts">
  // The bar over a picked mark in the PDF pane (the select tool's click, lib/pdf-tools.ts): its colour, its words (a
  // text box's or post-it's text, a clip's title; Enter saves) and Delete. Each change is saved into the note at once.
  import Icon from "./Icon.svelte";
  import { COLORS } from "../lib/pdf-tools";
  import { STAMPS, WORDED, wordsOf, type Mark, type MarkKind } from "../lib/pdf-marks";

  let { mark, at, onrecolor, onreword, ondelete, onclose }: {
    mark: Mark;
    /** where to sit, in the viewer's own pixels: under (or over) the mark */
    at: { left: number; top: number };
    onrecolor: (hex: string) => void;
    onreword: (text: string) => void;
    ondelete: () => void;
    onclose: () => void;
  } = $props();

  const NAME: Partial<Record<MarkKind, string>> = {
    highlight: "Highlight", underline: "Underline", strike: "Strikethrough", "text-box": "Text box", postit: "Post-it",
    ink: "Pen", clip: "Clip", stamp: "Stamp", bookmark: "Bookmark",
  };
  let words = $state(""), editing = $state(false), input = $state<HTMLTextAreaElement | null>(null);
  $effect(() => { words = wordsOf(mark); editing = false; }); // another mark picked, or this one saved again
  const same = (a: string | null | undefined, b: string) => (a ?? "").toLowerCase() === b.toLowerCase();

  function startEdit() { editing = true; requestAnimationFrame(() => { input?.focus(); input?.select(); }); }
  function key(e: KeyboardEvent) {
    e.stopPropagation(); // the pane's single-letter keys are for the pane, not while typing here
    if (e.key === "Escape") { words = wordsOf(mark); editing = false; }
    else if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); save(); }
  }
  function save() {
    const t = words.trim();
    editing = false;
    if (t !== wordsOf(mark) && (t || mark.kind === "clip")) onreword(t);
  }
</script>

<div class="bar" style:left="{at.left}px" style:top="{at.top}px" role="toolbar" aria-label="The picked mark" data-testid="pdf-mark-bar">
  <span class="kind">{mark.kind === "stamp" ? `${STAMPS[mark.stamp]} ` : ""}{NAME[mark.kind] ?? mark.kind}</span>
  {#if mark.kind !== "bookmark"}
    <span class="sep"></span>
    {#each Object.entries(COLORS) as [name, hex] (name)}
      <button class="swatch" class:on={same(mark.color, hex)} style:background={hex} title={name} aria-label={`Colour ${name}`} onclick={() => onrecolor(hex)}></button>
    {/each}
  {/if}
  {#if WORDED.has(mark.kind)}
    <span class="sep"></span>
    {#if editing}
      <textarea bind:this={input} bind:value={words} rows="1" onkeydown={key} onblur={save} aria-label="Words"
        placeholder={mark.kind === "clip" ? "A title…" : "Text…"}></textarea>
    {:else}
      <button class="words" title="Change the words (Enter saves, Esc leaves them)" onclick={startEdit}>
        <Icon name="edit" size={13} /><span>{wordsOf(mark) || (mark.kind === "clip" ? "Add a title" : "Edit")}</span>
      </button>
    {/if}
  {/if}
  {#if mark.tags?.length}<span class="tags">{mark.tags.map((t) => `#${t}`).join(" ")}</span>{/if}
  <span class="sep"></span>
  <button class="icon" title="Delete this mark (Delete; Ctrl+Z brings it back)" aria-label="Delete mark" onclick={ondelete}><Icon name="trash" size={14} /></button>
  <button class="icon" title="Done (Esc)" aria-label="Close" onclick={onclose}><Icon name="close" size={14} /></button>
</div>

<style>
  .bar { position: absolute; z-index: 20; display: flex; align-items: center; gap: 4px; padding: 4px 6px; max-width: min(520px, calc(100% - 16px));
    background: var(--bg-elev); border: 1px solid var(--border-strong); border-radius: var(--radius-sm); box-shadow: var(--shadow-pop);
    font-size: calc(12px * var(--ui-scale, 1)); color: var(--text-muted); transform: translateX(-50%); white-space: nowrap; }
  .kind { color: var(--text); font-weight: 500; padding: 0 2px; }
  .sep { width: 1px; height: 16px; background: var(--border); margin: 0 2px; flex: none; }
  .swatch { width: 16px; height: 16px; border-radius: 50%; border: 1px solid var(--border-strong); flex: none; }
  .swatch.on { box-shadow: 0 0 0 2px var(--bg-elev), 0 0 0 3.5px var(--accent); }
  .words { display: inline-flex; align-items: center; gap: 4px; min-width: 0; max-width: 220px; padding: 2px 6px; border-radius: 4px; color: var(--text); }
  .words span { overflow: hidden; text-overflow: ellipsis; }
  .words:hover, .icon:hover { background: var(--bg-hover); }
  textarea { width: 220px; resize: none; font: inherit; color: var(--text); background: var(--bg); border: 1px solid var(--accent); border-radius: 4px; padding: 2px 6px; line-height: 1.3; }
  .tags { color: var(--accent); font-size: 0.92em; overflow: hidden; text-overflow: ellipsis; max-width: 120px; }
  .icon { display: grid; place-items: center; width: 24px; height: 22px; border-radius: 4px; color: var(--text-muted); flex: none; }
</style>
