<script lang="ts">
  // A `.base` file opened on its own: the table full-size, plus its YAML in the editor.
  import BaseTable from "../components/BaseTable.svelte";
  import Icon from "../components/Icon.svelte";
  import { shownPath } from "../lib/paths";
  import { open } from "../lib/dock";
  import type { PaneProps } from "../lib/dock";

  let { spec }: PaneProps<"base"> = $props();
</script>

<div class="base-pane">
  <header>
    <span class="name"><Icon name="table" size={14} /> {shownPath(spec.path)}</span>
    <button class="btn" onclick={() => open({ kind: "editor", path: spec.path })} title="Edit the base's filters, formulas and views (YAML)"><Icon name="file-code" size={14} /> Edit YAML</button>
  </header>
  <BaseTable path={spec.path} />
</div>

<style>
  .base-pane { height: 100%; display: flex; flex-direction: column; background: var(--bg); }
  .base-pane > :global(.base) { flex: 1; }
  header { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 8px 12px; border-bottom: 1px solid var(--border); }
  .name { display: inline-flex; gap: 6px; align-items: center; font-family: var(--font-mono); font-size: calc(12.5px * var(--ui-scale, 1)); }
  .btn { display: inline-flex; gap: 6px; align-items: center; border: 1px solid var(--border-strong); }
  .btn:hover { background: var(--bg-hover); }
</style>
