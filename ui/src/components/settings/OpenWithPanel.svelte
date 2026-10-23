<script lang="ts">
  // `[files] open_with`: which extensions open in a view other than Atlas's usual one; below, what plugins claim
  // (`claims` in their manifest), which a rule here overrides (lib/openers.ts `resolveSpec`).
  import Icon from "../Icon.svelte";
  import { settings, updateSettings } from "../../lib/settings.svelte";
  import { plugins, pluginOn } from "../../lib/plugins.svelte";

  const rules = $derived(Object.entries(settings.config?.files.open_with ?? {}).filter(([, v]) => !!v).sort());
  const claimed = $derived(plugins.list.filter((p) => p.view && p.claims.length && pluginOn(p)).flatMap((p) => p.claims.map((glob) => ({ glob, title: p.title }))));
  const drop = (ext: string) => void updateSettings((c) => { delete c.files.open_with[ext]; });
</script>

<section class="settings-panel openwith">
  <h3>Open with</h3>
  <p class="desc">Files of these kinds open in another view. Set one from a file's right-click menu or <kbd>Ctrl Alt O</kbd> → “Always open … with”.</p>
  {#each rules as [ext, id] (ext)}
    <div class="rule"><code>.{ext}</code><span>→ {id}</span><button class="icon-btn" title="Back to Atlas's usual view" aria-label="Remove .{ext} rule" onclick={() => drop(ext)}><Icon name="close" size={12} /></button></div>
  {:else}<p class="muted">None: every file opens in Atlas's usual view.</p>{/each}
  {#if claimed.length}
    <h4>Claimed by plugins</h4>
    <p class="desc">These open in a plugin's view unless a rule above names another (switch the plugin off and they open as before).</p>
    {#each claimed as c (c.glob + c.title)}
      <div class="rule"><code>{c.glob}</code><span>→ {c.title}</span></div>
    {/each}
  {/if}
</section>

<style>
  h3 { margin: 10px 0 2px; } /* its look: SettingsPage */
  h4 { margin: 12px 0 2px; font-size: calc(13px * var(--ui-scale, 1)); }
  .desc, .muted { margin: 0 0 6px; color: var(--text-faint); font-size: calc(12.5px * var(--ui-scale, 1)); }
  .rule { display: flex; gap: 10px; align-items: center; padding: 4px 0; border-top: 1px solid var(--border); }
  .rule span { flex: 1; color: var(--text-muted); }
  kbd { font-family: var(--font-mono); font-size: .9em; }
  .icon-btn { display: grid; place-items: center; width: 24px; height: 24px; border-radius: var(--radius-sm); color: var(--text-muted); }
  .icon-btn:hover { background: var(--bg-active); color: var(--text); }
</style>
