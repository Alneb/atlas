<script lang="ts">
  // The `toolbar` block: a row of buttons, each a command (lib/toolbar.ts). In a collapsed sidebar
  // it stands as a column of icons.
  import type { BlockHost } from "../../lib/blocks";
  import { sideWide } from "../../lib/sidebar.svelte";
  import { toolItems, toolTip } from "../../lib/toolbar";
  import { SIDE_COMMANDS } from "../../lib/side-panel.svelte";
  import { sideTools, toolId } from "../../lib/side-tools.svelte";
  import { openSide } from "../../lib/dock";
  import Icon from "../Icon.svelte";

  let { items, host }: { items: unknown; host: BlockHost } = $props();
  const wide = $derived(host !== "side" || sideWide());
  // Files … Git and the plugins' side tools are the row on top of the side panel (SideHead.svelte), so the
  // default footer does not list them (a sidebar page that does keeps them). Collapsed to icons that row is
  // not drawn: the tools stand here, first.
  const tools = $derived(wide ? [] : toolItems([...SIDE_COMMANDS], undefined, { ids: SIDE_COMMANDS, add: sideTools.map((t) => ({ icon: t.icon, label: t.title, run: () => openSide(toolId(t.type)) })) }));
  const list = $derived([...tools, ...(tools.length ? ["divider" as const] : []), ...toolItems(items, wide ? undefined : SIDE_COMMANDS)]);
</script>

<div class="side-toolbar" class:wide role="toolbar">
  {#each list as b}
    {#if b === "spacer"}<span class="grow"></span>
    {:else if b === "divider"}<span class="divider" role="separator"></span>
    {:else}<button class="side-tool tipped" onclick={b.run} aria-label={b.label} data-tip={toolTip(b)}><Icon name={b.icon} size={17} /></button>{/if}
  {:else}
    {#if wide}<span class="hint">An empty toolbar: list command ids in <code>items:</code></span>{/if}
  {/each}
</div>

<style>
  .side-toolbar { display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 2px 0 6px; }
  /* wide: the buttons share the row evenly (nine fit a default sidebar before it wraps); a divider starts a new row */
  /* wide: 28 px buttons from the bar's left edge, as the side panel's tools above; a spacer pushes the rest right */
  .side-toolbar.wide { flex-direction: row; flex-wrap: wrap; gap: 2px; padding: 4px 6px 8px calc(var(--side-inset) - 7px); }
  .side-toolbar.wide .side-tool { flex: none; width: 28px; height: 28px; }
  .grow { flex: 1; }
  .divider { width: 20px; height: 1px; margin: 4px 0; background: var(--border); flex: none; }
  .side-toolbar.wide .divider { flex: 0 0 calc(100% - 12px); margin: 3px 6px; }
  .hint { color: var(--text-faint); font-size: calc(11.5px * var(--ui-scale, 1)); }
</style>
