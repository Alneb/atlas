<script lang="ts">
  // One plugin's page in Settings: what it is and
  // may do, its switch and actions, its problems, and its own settings as a form on the page — not a dialog behind a
  // "Settings…" button in a list of 24. Saved with the bar that appears once something changed (Ctrl+S too).
  import { untrack } from "svelte";
  import Icon from "../Icon.svelte";
  import PlatformChips from "./PlatformChips.svelte";
  import FormFields from "../FormFields.svelte";
  import { applies, shown, store, type FormValue } from "../../lib/block-options";
  import { formFields, loadSuggestions, runSettingsAction, savePluginSettings, secretNames } from "../../lib/plugin-settings.svelte";
  import { changedSettings, isOff, mayOf, partsOf, pluginDir, removePlugin, switchPlugin, updatePlugin } from "../../lib/plugin-manage";
  import { pluginOn, pluginBlocked, pluginSpec, plugins, type Plugin } from "../../lib/plugins.svelte";
  import { pluginLog, clearPluginLog } from "../../lib/plugin-log.svelte";
  import { open, openPath } from "../../lib/dock";
  import { isIconName } from "../../lib/icons";
  import { accountLists } from "../../lib/accounts.svelte";
  import { sections } from "../../lib/settings-sections.svelte";
  import AccountsPage from "./AccountsPage.svelte";
  import PluginSection from "./PluginSection.svelte";

  let { plugin: p }: { plugin: Plugin } = $props();

  let secrets = $state<string[]>([]);
  let suggestions = $state<Record<string, { value: string; label: string }[]>>({});
  // svelte-ignore state_referenced_locally -- the page is keyed by the plugin (Settings.svelte): a new one starts fresh
  const id = p.id;
  $effect(() => { void secretNames(p).then((s) => { if (p.id === id) secrets = s; }); });
  $effect(() => { loadSuggestions(p, (key, options) => { suggestions[key] = options; }); });

  // accounts are edited above the form, one card at a time (AccountsPage), so the form leaves them out
  const hasAccounts = $derived(accountLists(p.id).length > 0);
  const fields = $derived(formFields(p.fields.filter((f) => !(f.kind === "records" && f.account)), secrets, suggestions));
  const drawn = $derived(sections[p.id] ?? []);
  const icon = $derived(isIconName(p.icon ?? "") ? (p.icon as "plugin") : "plugin");
  let justSaved = $state(false);
  /** The plugin as loaded now (a save reloads it before the prop follows). */
  const latest = () => plugins.list.find((x) => x.id === id) ?? p;
  const start = () => Object.fromEntries(fields.map((f) => [f.key, shown(f, (latest().settings ?? {})[f.key])])) as Record<string, FormValue>;
  // svelte-ignore state_referenced_locally -- the form starts from the plugin's settings; a save reloads the plugin
  let values = $state<Record<string, FormValue>>(start());
  // svelte-ignore state_referenced_locally -- what was saved last: the form as it starts
  let saved = $state(JSON.stringify(values));
  const dirty = $derived(JSON.stringify(values) !== saved);
  // the plugin reloaded (a save, its file edited): the form follows it unless something is being typed — a secret
  // typed and saved is then never shown back, only "Set"
  $effect(() => { void p; void secrets; untrack(() => { if (!dirty) { values = start(); saved = JSON.stringify(values); } }); });
  let saving = $state(false);

  function collect(): Record<string, unknown> {
    const next = { ...(p.settings ?? {}) };
    for (const f of fields) { if (applies(f, values, fields)) store(next, f, values[f.key]); else delete next[f.key]; }
    return next;
  }
  async function save() {
    if (!dirty || saving) return;
    saving = true;
    if (await savePluginSettings(p, collect())) {
      // from the plugin as reloaded: its secrets as stored now ("Set"), the typed ones never shown back
      secrets = await secretNames(latest());
      values = start();
      saved = JSON.stringify(values);
      justSaved = true;
      setTimeout(() => (justSaved = false), 2000);
    }
    saving = false;
  }
  function revert() { values = start(); saved = JSON.stringify(values); }
  const onkeydown = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") { e.preventDefault(); void save(); } };

  const on = $derived(!isOff(p.id));
  const may = $derived(mayOf(p.permissions, p.has_helper));
  const problem = $derived(p.error ?? plugins.errors[p.id] ?? (on ? pluginBlocked(p) : null));
  const changed = $derived(changedSettings(p).length);
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="plugin-page" {onkeydown}>
  <header>
    <div class="title">
      <span class="tile" class:off={!on}><Icon name={icon} size={22} /></span>
      <h2>{p.title}</h2>
      <button class="switch" class:on role="switch" aria-checked={on} aria-label="Plugin {p.title} on" disabled={!!p.error} onclick={() => switchPlugin(p.id, !on)}><span></span></button>
    </div>
    <p class="meta">{[p.id, p.version && `v${p.version}`, p.from && `from ${p.from}`, changed && `${changed} setting${changed === 1 ? "" : "s"} changed`].filter(Boolean).join(" · ")}</p>
    {#if p.description}<p class="desc">{p.description}</p>{/if}
    <dl>
      <dt>Adds</dt><dd>{partsOf(p).join(" · ") || "nothing yet"}</dd>
      {#if may}<dt>May</dt><dd data-plugin-may={p.id}>{may}</dd>{/if}
      <dt>Runs on</dt><dd><PlatformChips {p} /></dd>
    </dl>
    <div class="acts">
      {#if pluginOn(p) && p.view}<button class="btn" onclick={() => open(pluginSpec(p))}><Icon name="panel-right" size={13} /> Open</button>{/if}
      {#if p.from}<button class="btn" onclick={() => void updatePlugin(p)}><Icon name="refresh" size={13} /> Update</button>{/if}
      <button class="btn" title="The manifest, and the settings as text" onclick={() => openPath(`${pluginDir(p.id)}/plugin.toml`)}><Icon name="settings" size={13} /> plugin.toml</button>
      <button class="btn" onclick={() => { const f = p.main ?? p.view; if (f) openPath(f); }}><Icon name="edit" size={13} /> Code</button>
      <button class="btn danger" title="Its folder moves to .atlas/trash/" onclick={() => removePlugin(p)}><Icon name="close" size={13} /> Remove</button>
    </div>
    {#if problem}<p class="err">{problem}</p>{/if}
    {#if pluginLog[p.id]?.length}
      <details class="log" data-plugin-log={p.id}>
        <summary>{pluginLog[p.id].length} problem{pluginLog[p.id].length === 1 ? "" : "s"} since Atlas started</summary>
        {#each pluginLog[p.id] as l (l.at + l.where)}<span class="line"><i>{new Date(l.at).toLocaleTimeString()}</i> <b>{l.where}</b> {l.message}</span>{/each}
        <button class="clear" onclick={() => clearPluginLog(p.id)}>Clear</button>
      </details>
    {/if}
  </header>

  {#if hasAccounts}<AccountsPage only={p.id} />{/if}
  {#each drawn.filter((d) => d.place === "before") as d (d.id)}<PluginSection plugin={p} section={d} />{/each}

  {#if fields.length}<form class="form" aria-label="{p.title} — settings" onsubmit={(e) => { e.preventDefault(); void save(); }}>
    <FormFields {fields} bind:values sections onaction={(command, arg) => void runSettingsAction(p, command, arg, collect())} />
    <p class="where">Kept in <code>.atlas/plugin-settings/{p.id}.toml</code>, secrets outside the vault. An empty field goes back to the plugin's default.</p>
    {#if justSaved && !dirty}
      <div class="savebar saved" role="status"><Icon name="check" size={14} /> Saved</div>
    {:else if dirty}
      <div class="savebar" role="status">
        <span>Unsaved changes</span>
        <button type="button" class="btn" onclick={revert}>Revert</button>
        <button class="btn primary" disabled={saving}>{saving ? "Saving…" : "Save"} <kbd>Ctrl S</kbd></button>
      </div>
    {/if}
  </form>{:else if !hasAccounts && !drawn.length}<p class="where">It has no settings of its own (<code>[[setting]]</code> in its plugin.toml).</p>{/if}
  {#each drawn.filter((d) => d.place !== "before") as d (d.id)}<PluginSection plugin={p} section={d} />{/each}

</div>

<style>
  .plugin-page { max-width: 820px; margin: 0 auto; display: flex; flex-direction: column; gap: 18px; }
  header { display: flex; flex-direction: column; gap: 6px; }
  .title { display: flex; align-items: center; gap: 14px; }
  .tile { flex: none; display: grid; place-items: center; width: 44px; height: 44px; border-radius: 11px; color: #fff; background: linear-gradient(160deg, var(--accent), color-mix(in srgb, var(--accent) 55%, #000)); box-shadow: 0 2px 8px color-mix(in srgb, var(--accent) 30%, transparent); }
  .tile.off { filter: grayscale(1); opacity: .6; }
  h2 { margin: 0; flex: 1; font-size: calc(22px * var(--ui-scale, 1)); color: var(--heading); letter-spacing: -.015em; }
  .meta { margin: 0; color: var(--text-faint); font-size: calc(12px * var(--ui-scale, 1)); font-family: var(--font-mono); overflow-wrap: anywhere; }
  code { font-size: .92em; }
  .desc { margin: 4px 0 0; color: var(--text-muted); line-height: 1.5; }
  dl { display: grid; grid-template-columns: max-content 1fr; gap: 2px 12px; margin: 6px 0 0; font-size: calc(12.5px * var(--ui-scale, 1)); }
  dt { color: var(--text-faint); } dd { margin: 0; color: var(--text-muted); }
  .acts { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
  .btn { display: inline-flex; gap: 6px; align-items: center; padding: 4px 10px; border: 1px solid var(--border-strong); border-radius: var(--radius-sm); color: var(--text); }
  .btn:hover { background: var(--bg-hover); }
  .btn.danger { color: var(--red); }
  .btn.primary { background: var(--accent); border-color: var(--accent); color: var(--bg); font-weight: 600; }
  .btn.primary kbd { font: inherit; font-weight: 400; opacity: .75; font-size: .85em; }
  .err { margin: 4px 0 0; color: var(--red); }
  .form { background: var(--bg); border: 1px solid var(--border); border-radius: 12px; padding: 6px 18px 14px; display: flex; flex-direction: column; gap: 12px; }
  .where { margin: 0; color: var(--text-faint); font-size: calc(12px * var(--ui-scale, 1)); }
  .savebar { position: sticky; bottom: 12px; align-self: center; display: flex; align-items: center; gap: 10px; padding: 8px 10px 8px 16px;
    background: var(--bg-elev); border: 1px solid var(--border-strong); border-radius: 10px; box-shadow: 0 8px 28px rgba(0, 0, 0, .3); }
  .savebar span { color: var(--text-muted); }
  .savebar.saved { color: var(--green, #3fb950); gap: 6px; padding: 8px 16px; font-weight: 600; animation: fade 2s ease-in forwards; }
  @keyframes fade { 70% { opacity: 1; } 100% { opacity: 0; } }
  .switch { flex: none; width: 38px; height: 22px; border-radius: 11px; background: var(--border-strong); position: relative; }
  .switch span { position: absolute; top: 3px; left: 3px; width: 16px; height: 16px; border-radius: 50%; background: var(--bg); transition: transform .15s; }
  .switch.on { background: var(--accent); }
  .switch.on span { transform: translateX(16px); }
  .switch:disabled { opacity: .4; }
  .log { font-size: calc(12px * var(--ui-scale, 1)); }
  .log summary { color: var(--red); cursor: pointer; }
  .log .line { display: block; padding: 2px 0 2px 12px; color: var(--text-muted); font-family: var(--font-mono); overflow-wrap: anywhere; }
  .log .line i { color: var(--text-faint); font-style: normal; } .log .line b { color: var(--text); font-weight: 500; }
  .log .clear { margin: 4px 0 0 12px; padding: 1px 8px; border: 1px solid var(--border); border-radius: 5px; color: var(--text-muted); }
</style>
