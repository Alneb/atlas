<script lang="ts">
  // A plugin's word on each platform (its manifest's [platforms]): works, untested or no, the reason on hover.
  import type { Plugin } from "../../lib/plugins.svelte";
  import { PLATFORM_NAMES, SUPPORT_WORDS } from "../../lib/plugin-manage";

  let { p }: { p: Plugin } = $props();
</script>

<span class="platforms" data-plugin-platforms={p.id}>
  {#each p.platforms ?? [] as c (c.platform)}
    <span class="chip {c.support}" title="{PLATFORM_NAMES[c.platform]}: {SUPPORT_WORDS[c.support]}{c.why ? ` — ${c.why}` : ""}">
      <i aria-hidden="true">{c.support === "works" ? "✓" : c.support === "no" ? "✕" : "?"}</i>{PLATFORM_NAMES[c.platform]}
    </span>
  {/each}
</span>

<style>
  .platforms { display: inline-flex; flex-wrap: wrap; gap: 4px; }
  .chip { display: inline-flex; gap: 3px; align-items: baseline; padding: 0 6px; border-radius: 9px; border: 1px solid var(--border);
    font-size: calc(11px * var(--ui-scale, 1)); line-height: 17px; color: var(--text-muted); }
  .chip i { font-style: normal; font-weight: 600; }
  .chip.works i { color: var(--green); }
  .chip.untested { color: var(--text-faint); border-style: dashed; }
  .chip.no { color: var(--text-faint); text-decoration: line-through; text-decoration-color: var(--red); }
  .chip.no i { color: var(--red); }
</style>
