<script lang="ts">
  // The References pane of older layouts: now the Library page at its References tab (one page for every library).
  import type { PaneProps } from "../lib/dock";
  import Libraries from "./Libraries.svelte";

  let { panel }: PaneProps<"library"> = $props();
</script>

<Libraries spec={{ kind: "libraries", at: "references" }} {panel} />
