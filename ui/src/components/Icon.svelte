<script lang="ts">
  import { iconSvg } from "../lib/icons";
  import type { IconName } from "../lib/panes";
  let { name, size = 16 }: { name: IconName; size?: number } = $props();
</script>

<span class="icon" style:width="{size}px" style:height="{size}px">{@html iconSvg(name, size)}</span>

<style>
  .icon { display: inline-flex; align-items: center; justify-content: center; flex: none; line-height: 0; }
</style>
