<script lang="ts">
  // CSS snippets (rung 2): every .atlas/snippets/*.css restyles Atlas live; a switch per file.
  import Icon from "../Icon.svelte";
  import { openPath } from "../../lib/dock";
  import { settings, updateSettings } from "../../lib/settings.svelte";
  import { cssSnippets } from "../../lib/css-snippets.svelte";

  let { onnew }: { onnew: () => void } = $props();
  const on = (name: string) => !(settings.config?.ui.css_snippets_off ?? []).includes(name);
  function toggle(name: string, yes: boolean) {
    void updateSettings((c) => {
      const offs = new Set(c.ui.css_snippets_off);
      if (yes) offs.delete(name); else offs.add(name);
      c.ui.css_snippets_off = [...offs].sort();
    });
  }
</script>

<section class="settings-panel snippets">
  <h3>CSS snippets</h3>
  <p class="desc">Files in <code>.atlas/snippets/</code> restyle Atlas live when saved — the step between settings and plugins.</p>
  {#each cssSnippets.list as s (s.name)}
    <label class="snip"><input type="checkbox" checked={on(s.name)} onchange={(e) => toggle(s.name, e.currentTarget.checked)} aria-label="Snippet {s.name}" />
      <span class="nm">{s.name}</span>
      <button class="link" onclick={(e) => { e.preventDefault(); openPath(s.path); }}>edit</button></label>
  {:else}<p class="muted">No snippets yet.</p>{/each}
  <button class="btn" onclick={onnew}><Icon name="plus" size={13} /> New snippet</button>
</section>

<style>
  h3 { margin: 10px 0 2px; } /* its look: SettingsPage */
  .desc, .muted { margin: 0 0 6px; color: var(--text-faint); font-size: calc(12.5px * var(--ui-scale, 1)); }
  .snip { display: flex; align-items: center; gap: 8px; padding: 4px 0; }
  .snip .nm { font-family: var(--font-mono); flex: 1; }
  .snip .link { color: var(--text-faint); font-size: .9em; }
  .snip .link:hover { color: var(--accent); }
  .btn { display: inline-flex; gap: 6px; align-items: center; margin: 6px 0 4px; border: 1px solid var(--border-strong); }
  .btn:hover { background: var(--bg-hover); }
</style>
