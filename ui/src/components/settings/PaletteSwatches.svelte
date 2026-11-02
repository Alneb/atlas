<script lang="ts">
  // The colour schemes as swatches to pick from, each drawn by the palette's own rules (palettes.css matches
  // `.pal-sample[data-theme][data-palette]` beside the window's): the day's (`ui.palette`) in light, the night's
  // (`ui.palette_dark`) in dark, with "as by day" first for the night.
  import { leaves, options, choiceLabel, resolve, valueOf, setValue } from "../../lib/settings-schema";

  let { path, label }: { path: string; label: string } = $props();
  const night = $derived(path === "ui.palette_dark");
  const schema = $derived(resolve(leaves().get("ui.palette") ?? {}));
  const names = $derived((options(schema) ?? []).map((o) => o.value));
  const v = $derived((valueOf(path) as string | null) ?? "");
  const day = $derived((valueOf("ui.palette") as string) ?? "atlas");
</script>

<div class="swatches" role="radiogroup" aria-label={label} id={path}>
  {#if night}
    <button role="radio" aria-checked={!v} class:on={!v} title="The day's scheme at night too" onclick={() => setValue(path, null)}>
      <span class="pal-sample sample" data-theme="dark" data-palette={day}><i></i><b>Aa</b></span>
      <span class="name">as by day</span>
    </button>
  {/if}
  {#each names as n (n)}
    <button role="radio" aria-checked={v === n} class:on={v === n} onclick={() => setValue(path, n)}>
      <span class="pal-sample sample" data-theme={night ? "dark" : "light"} data-palette={n}><i></i><b>Aa</b></span>
      <span class="name">{choiceLabel(schema, n)}</span>
    </button>
  {/each}
</div>

<style>
  .swatches { display: grid; grid-template-columns: repeat(auto-fill, minmax(calc(64px * var(--ui-scale, 1)), 1fr)); gap: 6px; width: min(100%, 460px); }
  button { display: flex; flex-direction: column; align-items: stretch; gap: 3px; padding: 3px; border: 1px solid transparent; border-radius: var(--radius); background: none; cursor: pointer; font: inherit; color: var(--text-muted); }
  button:hover { border-color: var(--border); color: var(--text); }
  button.on { border-color: var(--accent); color: var(--text); }
  .sample { position: relative; display: flex; align-items: center; justify-content: center; height: calc(38px * var(--ui-scale, 1)); border-radius: var(--radius-sm);
    background: var(--bg); border: 1px solid var(--border); color: var(--heading, var(--text)); }
  .sample b { font-size: calc(13px * var(--ui-scale, 1)); font-weight: 600; }
  .sample i { position: absolute; right: 5px; bottom: 5px; width: 9px; height: 9px; border-radius: 50%; background: var(--accent); }
  .name { font-size: calc(11px * var(--ui-scale, 1)); text-align: center; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; text-transform: capitalize; }
</style>
