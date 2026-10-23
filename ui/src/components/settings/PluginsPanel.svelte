<script lang="ts">
  // Workspace plugins as a list: on/off (`[plugins] off`), open, install / update / remove; each one's settings and
  // details are its own page in Settings (PluginPage.svelte), reached by its name or "Settings…".
  import Icon from "../Icon.svelte";
  import { pluginLog } from "../../lib/plugin-log.svelte";
  import { openPluginSettings } from "../../lib/plugin-settings.svelte";
  import { open, openPath } from "../../lib/dock";
  import { BUILTINS } from "../../lib/builtin-plugins";
  import { plugins, pluginOn, pluginBlocked, pluginSpec, loadPlugins } from "../../lib/plugins.svelte";
  import { changedSettings, installPlugin, isOff, mayOf, partsOf, pluginDir, removePlugin, switchPlugin, updatePlugin } from "../../lib/plugin-manage";
  import { onMount } from "svelte";

  let { onnew, onblock }: { onnew: () => void; onblock: () => void } = $props();
  const PROPS = 4; // changed settings named under a plugin; the rest counted (its page has them all)
  onMount(() => { if (!plugins.loaded) void loadPlugins(); });
</script>

<section class="settings-panel plugins">
  <h3>Plugins <span class="n">{BUILTINS.length + plugins.list.length}</span></h3>
  <p class="desc">Folders in <code>.atlas/plugins/</code>: a view (<code>view.js</code>), an optional data script, settings in <code>plugin.toml</code>. They reload when saved.</p>
  <ul>
    <!-- built in: shipped with Atlas, not for every vault; the same switch as a vault plugin -->
    {#each BUILTINS as b (b.id)}
      <li class:off={isOff(b.id)}>
        <button class="switch" class:on={!isOff(b.id)} role="switch" aria-checked={!isOff(b.id)} aria-label="Plugin {b.title}" onclick={() => switchPlugin(b.id, isOff(b.id))}><span></span></button>
        <div class="main">
          <b>{b.title}</b> <code>built in</code>
          <span class="d">{b.description}</span>
          <span class="d">{b.parts}</span>
        </div>
      </li>
    {/each}
    {#each plugins.list as p (p.id)}
      <li class:off={!pluginOn(p)}>
        <button class="switch" class:on={!isOff(p.id)} role="switch" aria-checked={!isOff(p.id)} aria-label="Plugin {p.title}" disabled={!!p.error} onclick={() => switchPlugin(p.id, isOff(p.id))}><span></span></button>
        <div class="main">
          <button class="name" aria-label="The page of {p.title}" title="Its settings, problems and actions" onclick={() => void openPluginSettings(p.id)}><b>{p.title}</b></button> <code>{p.id}</code>{#if p.version} <code>v{p.version}</code>{/if}
          {#if p.description}<span class="d">{p.description}</span>{/if}
          {#if mayOf(p.permissions, p.has_helper)}<span class="d may" data-plugin-may={p.id}>May {mayOf(p.permissions, p.has_helper)}.</span>{/if}
          {#if p.error ?? plugins.errors[p.id]}<span class="err">{p.error ?? plugins.errors[p.id]}</span>
          {:else if !isOff(p.id) && pluginBlocked(p)}<span class="err">Not loaded — {pluginBlocked(p)}</span>{/if}
          {#if pluginLog[p.id]?.length}<button class="d problems" onclick={() => void openPluginSettings(p.id)}>{pluginLog[p.id].length} problem{pluginLog[p.id].length === 1 ? "" : "s"} since Atlas started</button>{/if}
          <span class="d">{partsOf(p).join(" · ") || "nothing yet"}</span>
          {#if changedSettings(p).length}
            {@const changed = changedSettings(p)}
            <span class="props" title="Its settings changed from the defaults">{#each changed.slice(0, PROPS) as s (s.key)}<span><i>{s.label}</i> {s.value}</span>{/each}{#if changed.length > PROPS}<span class="more">{changed.length - PROPS} more</span>{/if}</span>
          {/if}
        </div>
        <span class="acts">
        {#if pluginOn(p) && p.view}<button class="icon-btn" title="Open" aria-label="Open {p.title}" onclick={() => open(pluginSpec(p))}><Icon name="panel-right" size={13} /></button>{/if}
        {#if p.fields.length}<button class="btn small" aria-label="Settings of {p.title}" onclick={() => void openPluginSettings(p.id)}>Settings…</button>{/if}
        {#if p.from}<button class="icon-btn" title="Update from {p.from}" aria-label="Update {p.title}" onclick={() => void updatePlugin(p)}><Icon name="refresh" size={13} /></button>{/if}
        <button class="icon-btn" title="Edit plugin.toml (the manifest, and the settings as text)" aria-label="Edit {p.title} settings" onclick={() => openPath(`${pluginDir(p.id)}/plugin.toml`)}><Icon name="settings" size={13} /></button>
        <button class="icon-btn" title="Edit the code ({p.main ? "main.js" : "view.js"})" aria-label="Edit {p.title} code" onclick={() => { const f = p.main ?? p.view; if (f) openPath(f); }}><Icon name="edit" size={13} /></button>
        <button class="icon-btn" title="Remove from this vault (to .atlas/trash/)" aria-label="Remove {p.title}" onclick={() => removePlugin(p)}><Icon name="close" size={13} /></button>
        </span>
      </li>
    {:else}<li class="muted">No plugins of its own in this workspace (<code>.atlas/plugins/</code>).</li>{/each}
  </ul>
  <button class="btn" onclick={installPlugin} title="Copy a plugin into this vault from a folder, a git address or an archive"><Icon name="arrow-down" size={13} /> Install…</button>
  <button class="btn" onclick={onnew}><Icon name="plus" size={13} /> New plugin</button>
  <button class="btn" onclick={onblock} title="A plugin with one block for notes and pages, from a template"><Icon name="plus" size={13} /> New block</button>
</section>


<style>
  h3 { margin: 10px 0 2px; } /* its look: SettingsPage */
  .n { color: var(--text-faint); }
  .desc, .muted { margin: 0 0 6px; color: var(--text-faint); font-size: calc(12.5px * var(--ui-scale, 1)); }
  ul { list-style: none; margin: 0; padding: 0; }
  /* the text takes the room; the buttons keep together at the right, and go under it when the page is narrow */
  li { display: flex; flex-wrap: wrap; gap: 6px 10px; align-items: center; padding: 8px 0; border-top: 1px solid var(--border); }
  li.off .main { opacity: .55; }
  .main { flex: 1 1 320px; min-width: 0; display: flex; flex-wrap: wrap; gap: 4px 8px; align-items: baseline; }
  .acts { display: flex; gap: 2px; align-items: center; margin-left: auto; }
  .props .more { color: var(--text-faint); }
  code { color: var(--text-faint); font-size: calc(11px * var(--ui-scale, 1)); }
  .d { color: var(--text-muted); font-size: calc(12.5px * var(--ui-scale, 1)); flex-basis: 100%; }
  .err { color: var(--red); flex-basis: 100%; }
  /* the settings as one line of "Label: value", joined by dots (a long list wraps, it does not stack) */
  .props { display: block; flex-basis: 100%; font-size: calc(12px * var(--ui-scale, 1)); line-height: 1.5; color: var(--text); }
  .props span + span::before { content: " · "; color: var(--text-faint); }
  .props i { font-style: normal; color: var(--text-faint); }
  .props i::after { content: ": "; }
  .switch { flex: none; width: 34px; height: 20px; border-radius: 10px; background: var(--border-strong); position: relative; }
  .switch span { position: absolute; top: 3px; left: 3px; width: 14px; height: 14px; border-radius: 50%; background: var(--bg); transition: transform .15s; }
  .switch.on { background: var(--accent); }
  .switch.on span { transform: translateX(14px); }
  .switch:disabled { opacity: .4; }
  .icon-btn { display: grid; place-items: center; width: 26px; height: 26px; border-radius: var(--radius-sm); color: var(--text-muted); }
  .icon-btn:hover { background: var(--bg-active); color: var(--text); }
  .btn { display: inline-flex; gap: 6px; align-items: center; margin: 8px 0 4px; padding: 3px 10px; border: 1px solid var(--border-strong); border-radius: var(--radius-sm); }
  .btn:hover { background: var(--bg-hover); }
  .name { font-weight: 700; color: var(--accent); padding: 0; } .name:hover { text-decoration: underline; }
  .problems { color: var(--red); text-align: left; padding: 0; } .problems:hover { text-decoration: underline; }
</style>
