<script lang="ts">
  // Every command and its shortcut, rebindable in place (saved to .atlas/keys.toml).
  import { onMount } from "svelte";
  import { allCommands, keymap, loadKeymap } from "../../lib/keymap.svelte";
  import ShortcutButton from "../ShortcutButton.svelte";
  import { keyClashes } from "../../lib/keymap.svelte";

  let q = $state("");
  let onlyBound = $state(false);
  const groups = $derived.by(() => {
    void keymap.overrides; void keymap.server;
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    // a command's other keys count for the search too: "super" finds the whole Super layer (docs/guides/KEYS.md)
    const cmds = allCommands().filter((c) => (!onlyBound || c.keys) && words.every((w) => `${c.title} ${c.id} ${c.keys ?? ""} ${(c.alsoKeys ?? []).join(" ")}`.toLowerCase().includes(w)));
    return [
      { title: "Atlas", list: cmds.filter((c) => c.source === "ui" && !c.id.startsWith("plugin.")) },
      { title: "Plugins", list: cmds.filter((c) => c.id.startsWith("plugin.")) },
      { title: "Workspace commands", list: cmds.filter((c) => c.source === "script") },
      { title: "Atlas server", list: cmds.filter((c) => c.source === "builtin") },
    ].filter((g) => g.list.length);
  });
  const changed = $derived(Object.keys(keymap.overrides).length);
  onMount(() => { if (!keymap.loaded) void loadKeymap(); });
  // keys that two commands claim in the same place (recomputed when a key is changed)
  const clashes = $derived(keyClashes());
</script>

<section class="settings-panel keys">
  <div class="bar">
    <input placeholder="A command or a key: ctrl+shift" bind:value={q} spellcheck="false" aria-label="Filter shortcuts" />
    <label><input type="checkbox" bind:checked={onlyBound} /> only with a shortcut</label>
    <span class="n">{changed} changed from the defaults</span>
  </div>
  {#each groups as g (g.title)}
    <h3>{g.title} <span class="n">{g.list.length}</span></h3>
    <ul>
      {#each g.list as c (c.id)}
        <li><span class="t">{c.title}</span><code>{c.id}</code>
          {#if clashes.get(c.id)}<span class="clash" data-clash={c.id} title="The same key also belongs to: {clashes.get(c.id)!.join(' · ')}. Only one of them runs — give one another key.">same key as {clashes.get(c.id)!.length === 1 ? clashes.get(c.id)![0] : `${clashes.get(c.id)!.length} others`}</span>{/if}
          {#if c.alsoKeys?.length}<span class="also" title="These keys work too (they are part of the command, not settable here)">also {c.alsoKeys.join(" · ")}</span>{/if}
          <ShortcutButton cmd={c} /></li>
      {/each}
    </ul>
  {:else}<p class="muted">No command matches.</p>{/each}
</section>

<style>
  .bar { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; padding: 8px 0; }
  .bar > input { flex: 1; min-width: 220px; font: inherit; font-size: calc(13px * var(--ui-scale, 1)); color: var(--text); background: var(--bg-elev); border: 1px solid var(--border-strong); border-radius: var(--radius-sm); padding: 5px 9px; }
  .bar label { color: var(--text-muted); font-size: calc(12.5px * var(--ui-scale, 1)); display: inline-flex; gap: 5px; align-items: center; }
  h3 { margin: 12px 0 2px; } /* its look: SettingsPage */
  .n { color: var(--text-faint); font-weight: 500; font-size: calc(12px * var(--ui-scale, 1)); }
  ul { list-style: none; margin: 0; padding: 0; }
  li { display: flex; gap: 10px; align-items: center; padding: 3px 0; border-top: 1px solid var(--border); }
  .t { flex: 1; min-width: 0; color: var(--text); }
  code { color: var(--text-faint); font-size: calc(11px * var(--ui-scale, 1)); }
  .muted { color: var(--text-faint); }
  .clash { color: var(--red); font-size: .85em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 34ch; }
  .also { color: var(--text-faint); font-size: .85em; white-space: nowrap; font-family: var(--font-mono); }
</style>
