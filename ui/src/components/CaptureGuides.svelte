<script lang="ts">
  // The short forms a capture can start with (lib/capture-guides.ts), shown while a capture box is empty; a click
  // starts `box` with one.
  import { GUIDES, startWith } from "../lib/capture-guides";
  let { box }: { box: HTMLTextAreaElement | HTMLInputElement | undefined } = $props();
</script>

<span class="guides" data-testid="capture-guides">
  {#each GUIDES as g (g.shown)}
    <!-- the chip and its word are one target, padded to a finger's 24 px without moving the line (the margins give it back) -->
    <button type="button" class="guide" title="{g.tip}&#10;Click to start with it" onmousedown={(e) => e.preventDefault()} onclick={() => startWith(box, g.starts)}><span class="form">{g.shown}</span> {g.what}</button>
  {/each}
</span>

<style>
  .guides { display: inline-flex; flex-wrap: wrap; gap: 4px 10px; align-items: center; }
  .guide { white-space: nowrap; font: inherit; color: inherit; background: none; border: 0; padding: 4px 3px; margin: -4px -3px; border-radius: 4px; cursor: pointer; }
  .form { font-family: var(--font-mono); font-size: .92em; color: var(--text-muted); background: var(--bg-hover); border-radius: 4px; padding: 0 4px; white-space: pre; }
  .guide:hover .form { color: var(--text); }
  .guide:hover { color: var(--text); }
</style>
