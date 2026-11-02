<script lang="ts">
  import { iconSvg } from "../lib/icons";
  import type { IconName } from "../lib/panes";
  let { name, size = 16 }: { name: IconName; size?: number } = $props();
</script>

<span class="icon" style:width="calc({size}px * var(--ui-scale, 1))" style:height="calc({size}px * var(--ui-scale, 1))">{@html iconSvg(name, size)}</span>

<style>
  /* sized by the interface's scale (Settings → font size, a tab's zoom), as the text beside it */
  .icon { display: inline-flex; align-items: center; justify-content: center; flex: none; line-height: 0; }
  .icon :global(svg) { width: 100%; height: 100%; }
</style>
