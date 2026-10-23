<script lang="ts">
  // Any block alone in a tab ("Open as a tab" on a block in a note or page): the same block code,
  // given the whole pane. Its context stays the document it came from.
  import { onMount } from "svelte";
  import { mountBlock } from "../lib/blocks";
  import type { PaneProps } from "../lib/dock";

  let { spec }: PaneProps<"block"> = $props();
  let host: HTMLDivElement;
  // svelte-ignore state_referenced_locally -- a pane's spec is fixed for its lifetime
  onMount(() => mountBlock(host, spec.doc, spec.src, "tab"));
</script>

<div class="block-pane scroll"><div class="view-block markdown" bind:this={host}></div></div>

<style>
  .block-pane { height: 100%; overflow: auto; background: var(--bg); padding: 18px 22px; }
  .block-pane > .view-block { margin: 0 auto; max-width: 1080px; min-height: 100%; }
</style>
