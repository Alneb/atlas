<script lang="ts">
  // Left activity rail (horizontal-tabs layout): the buttons of the sidebar file's toolbars, as icons.
  import { railItems } from "../lib/sidebar.svelte";
  import { toolTip as tip } from "../lib/toolbar";
  import Icon from "./Icon.svelte";
  import VaultBadge from "./VaultBadge.svelte";

  const bars = $derived(railItems());
</script>

<nav class="rail" aria-label="Activity">
  <div class="brand"><VaultBadge size={30} /></div>
  {#each bars as bar, i}
    {#if i}<div class="sep"></div>{/if}
    {#each bar as b}
      {#if b === "spacer"}<div class="grow"></div>
      {:else if b === "divider"}<div class="sep"></div>
      {:else}<button class="rail-btn" onclick={b.run} aria-label={b.label} data-tip={tip(b)}><Icon name={b.icon} size={19} /></button>{/if}
    {/each}
  {/each}
</nav>

<style>
  .rail { width: var(--rail-w); flex: none; display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 10px 0 10px; background: var(--bg-app); }
  .brand { margin-bottom: 10px; }
  .rail-btn { position: relative; width: 38px; height: 38px; border-radius: 10px; display: grid; place-items: center; color: var(--text-muted); transition: color .12s, background .12s; }
  .rail-btn:hover { color: var(--text); background: var(--bg-hover); }
  .rail-btn:active { transform: scale(.96); }
  .rail-btn::after { content: attr(data-tip); position: absolute; left: calc(100% + 10px); top: 50%; transform: translateY(-50%) translateX(-4px); white-space: nowrap;
    background: var(--bg-elev); color: var(--text); border: 1px solid var(--border-strong); box-shadow: var(--shadow-sm); padding: 4px 9px; border-radius: 7px; font-size: calc(12px * var(--ui-scale, 1));
    pointer-events: none; opacity: 0; transition: opacity .12s, transform .12s; z-index: 100; }
  .rail-btn:hover::after { opacity: 1; transform: translateY(-50%); transition-delay: .35s; }
  .sep { width: 20px; height: 1px; background: var(--border); margin: 6px 0; }
  .grow { flex: 1; }
</style>
