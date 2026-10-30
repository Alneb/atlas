<script lang="ts">
  // The short forms a capture can start with (lib/capture-guides.ts), shown while a capture box is empty; a click
  // starts `box` with one.
  import { GUIDES, startWith } from "../lib/capture-guides";
  let { box }: { box: HTMLTextAreaElement | HTMLInputElement | undefined } = $props();
</script>

<span class="guides" data-testid="capture-guides">
  {#each GUIDES as g (g.shown)}
    <span class="guide"><button type="button" class="form" title="{g.tip}&#10;Click to start with it" onmousedown={(e) => e.preventDefault()} onclick={() => startWith(box, g.starts)}>{g.shown}</button> {g.what}</span>
  {/each}
</span>

<style>
  .guides { display: inline-flex; flex-wrap: wrap; gap: 4px 10px; align-items: center; }
  .guide { white-space: nowrap; }
  .form { font-family: var(--font-mono); font-size: .92em; color: var(--text-muted); background: var(--bg-hover); border: 0; border-radius: 4px; padding: 0 4px; white-space: pre; cursor: pointer; }
  .form:hover { color: var(--text); }
</style>
