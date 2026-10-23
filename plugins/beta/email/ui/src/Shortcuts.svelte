<script lang="ts">
  // The key sheet (?): every command that has a key, by group — read from the one list the keys run (keys.ts).
  import { COMMANDS, shown } from "./keys";
  let { onclose }: { onclose: () => void } = $props();
  const groups = [...new Set(COMMANDS.map((c) => c.group))];
</script>

<div class="scrim" role="presentation" onclick={onclose} onkeydown={(e) => e.key === "Escape" && onclose()}>
  <div class="sheet" role="dialog" aria-modal="true" aria-label="Keyboard shortcuts" tabindex="-1" onclick={(e) => e.stopPropagation()} onkeydown={() => {}}>
    <header><h2>Keyboard shortcuts</h2><span class="faint">Ctrl+K finds any command by name</span><button class="x" onclick={onclose} aria-label="Close">×</button></header>
    <div class="cols">
      {#each groups as g (g)}
        <section>
          <h3>{g}</h3>
          {#each COMMANDS.filter((c) => c.group === g && c.keys) as c (c.id)}
            <div class="line"><span>{c.title}</span><span class="keys">{#each shown(c.keys) as k, i (k)}{#if i}<span class="or">or</span>{/if}<kbd>{k}</kbd>{/each}</span></div>
          {/each}
        </section>
      {/each}
    </div>
  </div>
</div>

<style>
  .scrim { position: absolute; inset: 0; z-index: 60; background: rgba(0, 0, 0, 0.35); display: grid; place-items: center; padding: 16px; }
  .sheet { background: var(--bg-elev); border: 1px solid var(--border-strong); border-radius: var(--radius-lg); box-shadow: var(--shadow-md, var(--shadow-sm)); width: min(980px, 100%); max-height: 90%; overflow: auto; padding: 18px 22px 22px; }
  header { display: flex; gap: 14px; align-items: baseline; margin-bottom: 12px; }
  h2 { margin: 0; font-size: 1.15em; }
  .faint { color: var(--text-faint); font-size: 0.9em; }
  .x { all: unset; cursor: pointer; margin-left: auto; font-size: 1.4em; color: var(--text-muted); padding: 0 6px; }
  .cols { columns: 3 260px; column-gap: 28px; }
  section { break-inside: avoid; margin-bottom: 16px; }
  h3 { margin: 0 0 6px; font-size: 0.75em; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-faint); }
  .line { display: flex; justify-content: space-between; gap: 10px; padding: 3px 0; font-size: 0.92em; }
  .keys { display: flex; gap: 4px; align-items: center; flex: none; }
  .or { color: var(--text-faint); font-size: 0.8em; }
  kbd { font: 600 0.85em var(--font-mono); padding: 1px 6px; border-radius: 5px; border: 1px solid var(--border-strong); border-bottom-width: 2px; background: var(--bg); }
</style>
