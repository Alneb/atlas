<script lang="ts">
  // The Today pane: every Today part, laid out as a page (the home document uses them one by one).
  import TodayParts from "../components/TodayParts.svelte";
  import type { PaneProps } from "../lib/dock";
  let { panel }: PaneProps<"today"> = $props();
</script>

<TodayParts {panel} />
