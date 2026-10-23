<script lang="ts">
  // A section a plugin draws on its Settings page (`atlas.plugin.registerSettingsSection`): a titled card whose body
  // the plugin mounts; its settings reach the file through `ctx.save` (the form's own save path).
  import { api } from "../../lib/api";
  import { plugins, type Plugin } from "../../lib/plugins.svelte";
  import { savePluginSettings } from "../../lib/plugin-settings.svelte";
  import { guard } from "../../lib/plugin-log.svelte";
  import type { SettingsSection } from "../../lib/plugin-api";

  let { plugin, section }: { plugin: Plugin; section: SettingsSection } = $props();
  let host = $state<HTMLElement>();
  const latest = () => plugins.list.find((x) => x.id === plugin.id) ?? plugin;

  $effect(() => {
    if (!host) return;
    const s = section, el = host;
    const undo = guard(plugin.id, `settings section ${s.id}`, () => s.mount(el, {
      settings: () => ({ ...(latest().settings ?? {}) }),
      save: (patch) => savePluginSettings(latest(), { ...(latest().settings ?? {}), ...patch }),
      call: (method, params, timeoutSecs) => api.pluginHelper(plugin.id, method, params, timeoutSecs),
    }), undefined);
    return () => { if (typeof undo === "function") undo(); el.replaceChildren(); };
  });
</script>

<section class="psect" data-section="{plugin.id}/{section.id}">
  <h3>{section.title}</h3>
  {#if section.hint}<p class="hint">{section.hint}</p>{/if}
  <div class="body" bind:this={host}></div>
</section>

<style>
  .psect { padding: 14px 18px 16px; border: 1px solid var(--border); border-radius: 12px; background: var(--bg); }
  h3 { margin: 0; font-size: calc(11px * var(--ui-scale, 1)); letter-spacing: .07em; text-transform: uppercase; color: var(--text-muted); }
  .hint { margin: 4px 0 0; color: var(--text-faint); font-size: calc(12.5px * var(--ui-scale, 1)); }
  .body { margin-top: 10px; }
</style>
