<script lang="ts">
  // The key sheet (?): every command with a key, from keys.ts — never a list of its own.
  import { COMMANDS, shown } from "./keys";
  let { onclose }: { onclose: () => void } = $props();
  const groups = [...new Set(COMMANDS.map((c) => c.group))];
</script>

<div class="scrim" role="presentation" onclick={onclose}></div>
<div class="sheet" role="dialog" aria-label="Keyboard shortcuts" aria-modal="true">
  <header><h2>Keyboard shortcuts</h2><button class="x" onclick={onclose} aria-label="Close">×</button></header>
  <div class="cols">
    {#each groups as g (g)}
      <section>
        <h3>{g}</h3>
        {#each COMMANDS.filter((c) => c.group === g && c.keys) as c (c.id)}
          <div class="row"><span>{c.title}</span><span class="keys">{#each shown(c.keys) as k (k)}<kbd>{k}</kbd>{/each}</span></div>
        {/each}
      </section>
    {/each}
  </div>
  <p class="hint">Drag on the grid to make an event, drag one to move it, its lower edge to resize (15-minute steps). Esc cancels a drag.</p>
</div>

<style>
  .scrim { position: absolute; inset: 0; background: color-mix(in srgb, var(--bg) 50%, transparent); z-index: 70; }
  .sheet { position: absolute; z-index: 71; left: 50%; top: 50%; transform: translate(-50%, -50%); width: min(760px, calc(100% - 32px)); max-height: calc(100% - 40px); overflow: auto; background: var(--bg-elev); border: 1px solid var(--border-strong); border-radius: var(--radius); box-shadow: var(--shadow-md, 0 8px 30px rgba(0,0,0,.3)); padding: 14px 18px; }
  header { display: flex; align-items: center; }
  h2 { margin: 0; flex: 1; font-size: 1.1em; color: var(--heading); }
  h3 { margin: 10px 0 4px; font-size: 0.75em; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-faint); }
  .cols { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 4px 24px; }
  .row { display: flex; justify-content: space-between; gap: 8px; padding: 3px 0; color: var(--text-muted); }
  .keys { display: flex; gap: 4px; }
  kbd { font: 600 0.85em var(--font-mono); padding: 1px 6px; border-radius: var(--radius-sm); border: 1px solid var(--border-strong); background: var(--bg); color: var(--text); }
  .hint { color: var(--text-faint); font-size: 0.86em; margin: 12px 0 0; }
  .x { all: unset; cursor: pointer; font-size: 1.3em; padding: 0 6px; color: var(--text-muted); }
</style>
