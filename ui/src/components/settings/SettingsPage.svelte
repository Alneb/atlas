<script lang="ts">
  // One Settings page: what the area is for, the features you can try (with their shortcut), its
  // options, its custom panels, and the next rung up (docs/guides/SETTINGS.md). Drawn by the Settings pane
  // and, alone, as a `settings` block in a .page or a ```view (so options can live where you work).
  import Icon from "../Icon.svelte";
  import InputDialog from "../InputDialog.svelte";
  import ToolDrafts from "../ToolDrafts.svelte";
  import SettingField from "./SettingField.svelte";
  import OverviewPanel from "./OverviewPanel.svelte";
  import PreviewPanel from "./PreviewPanel.svelte";
  import SnippetsPanel from "./SnippetsPanel.svelte";
  import SwitchList from "./SwitchList.svelte";
  import { allApps, ordered, appHidden, setAppHidden, moveApp } from "../../lib/apps.svelte";
  import { libraryChoices, libraryHidden, setLibraryHidden, moveLibrary } from "../../lib/libraries.svelte";
  import TemplatesPanel from "./TemplatesPanel.svelte";
  import KeysPanel from "./KeysPanel.svelte";
  import { renderInlineMarkdown } from "../../lib/markdown";
  import PluginsPanel from "./PluginsPanel.svelte";
  import ScriptsPanel from "./ScriptsPanel.svelte";
  import OpenWithPanel from "./OpenWithPanel.svelte";
  import ServerPanel from "./ServerPanel.svelte";
  import AgentsPanel from "./AgentsPanel.svelte";
  import { allCommands, keysOf } from "../../lib/keymap.svelte";
  import { chordLabel } from "../../lib/keys";
  import { pageDef, type Placed, type NextRung } from "../../lib/settings-pages";
  import { settings } from "../../lib/settings.svelte";
  import { openPath } from "../../lib/dock";
  import { newSnippet, newPlugin, newBlock, editHome, copyViewExample } from "../../lib/settings-actions";
  import type { Schema } from "../../lib/settings-schema";

  let { page, fields, pages = [], go = () => {}, embedded = false }: {
    page: Placed; fields: Map<string, Schema>; pages?: Placed[]; go?: (id: string) => void; embedded?: boolean;
  } = $props();

  const def = $derived(pageDef(page.page));
  const features = $derived((def?.features ?? []).flatMap((id) => { const a = allCommands().find((x) => x.id === id); return a ? [a] : []; }));
  let naming = $state<null | "snippet" | "plugin" | "block">(null);

  function next(n: NextRung) {
    if (n.run === "settings.newSnippet") naming = "snippet";
    else if (n.run === "settings.pluginHelp") naming = "plugin";
    else if (n.run === "settings.newBlock") naming = "block";
    else if (n.run === "settings.editHome") void editHome();
    else if (n.run === "settings.viewHelp") void copyViewExample();
    else void allCommands().find((a) => a.id === n.run)?.run();
  }
</script>

<article class="page" class:embedded data-page={page.page}>
  <header>
    <h2><Icon name={page.icon} size={18} /> {page.title}</h2>
    {#if page.blurb}<p class="blurb">{@html renderInlineMarkdown(page.blurb)}</p>{/if}
  </header>

  {#if features.length}
    <section class="features" aria-label="What you can do here">
      {#each features as a (a.id)}
        {@const k = keysOf(a.id)}
        {@const [, name, detail] = /^(.*?)\s*(?:\((.*)\))?$/.exec(a.title) ?? [, a.title]}
        <button class="feature" onclick={() => void a.run()} title="{a.title} — try it">
          <span class="t">{name}</span>
          {#if detail}<span class="d">{detail}</span>{/if}
          {#if k}<span class="k keys-only">{#each chordLabel(k) as c}<kbd>{c}</kbd>{/each}</span>{/if}
          <span class="try">Try</span>
        </button>
      {/each}
    </section>
  {/if}

  {#each def?.panels ?? [] as panel (panel)}
    {#if panel === "overview"}<OverviewPanel {pages} {go} />
    {:else if panel === "preview"}<PreviewPanel />
    {:else if panel === "apps"}
      <SwitchList title="Apps in the left bar" label="Apps" items={ordered(allApps())} hidden={appHidden} setHidden={setAppHidden} move={moveApp}
        desc="The tiles above the tabs. A hidden app still opens from the palette and its keys; a plugin's pane gets a tile when its manifest says <code>rail = true</code>." />
      <SwitchList title="Libraries" label="Libraries" items={libraryChoices().map((e) => ({ key: e.id, title: e.title, icon: e.icon }))} hidden={libraryHidden} setHidden={setLibraryHidden} move={moveLibrary} movable={(k) => !libraryHidden(k)}
        desc="The tabs of the Library page, in this order: Atlas's own and those your plugins add (the catalog adds one per group of kinds)." />
    {:else if panel === "snippets"}<SnippetsPanel onnew={() => (naming = "snippet")} />
    {:else if panel === "templates"}<TemplatesPanel />
    {:else if panel === "keys"}<KeysPanel />
    {:else if panel === "plugins"}<PluginsPanel onnew={() => (naming = "plugin")} onblock={() => (naming = "block")} />
    {:else if panel === "scripts"}<ScriptsPanel />
    {:else if panel === "openwith"}<OpenWithPanel />
    {:else if panel === "server"}<ServerPanel />
    {:else if panel === "agents"}<AgentsPanel />
    {:else if panel === "file"}
      <section class="panel"><h3>The settings file</h3>
        <p class="what">Every page here writes <code>{settings.path}</code>, and a change made in the file shows here at once. Your comments in it are kept.</p>
        <button class="btn" onclick={() => openPath(settings.path)}><Icon name="edit" size={13} /> Edit the file</button></section>
    {:else if panel === "drafts"}
      <section class="panel"><h3>Suggested tools</h3>
        <p class="what">Atlas looks through your vault for things you do again and again — a folder of notes that all look alike, two notes you open together, a search you keep running — and drafts a small tool for each: a table of the folder, a page with both notes, a page with the live search. Nothing is created until you press Keep, and what Keep writes is a plain file you can edit or delete.</p>
        <ToolDrafts /></section>
    {/if}
  {/each}

  {#if page.fields.length}
    <section class="fields" aria-label="{page.title} options">
      {#if def?.panels?.length || features.length}<h3>Options</h3>{/if}
      {#each page.fields as path (path)}
        {@const s = fields.get(path)}
        {#if s}<SettingField {path} schema={s} />{/if}
      {/each}
    </section>
  {/if}

  {#if def?.next?.length && !embedded}
    <section class="next" aria-label="Go further">
      <h3>Go further</h3>
      {#each def.next as n (n.label)}
        <button class="rung" onclick={() => next(n)}><b>{n.label} →</b><span>{n.why}</span></button>
      {/each}
    </section>
  {/if}
</article>

{#if naming === "snippet"}<InputDialog title="New CSS snippet" hint="A name, e.g. wide-notes" onsubmit={(n) => { naming = null; void newSnippet(n); }} oncancel={() => (naming = null)} />{/if}
{#if naming === "block"}<InputDialog title="New block" hint="A name, e.g. Reading streak — a plugin folder with one block, ready to edit" onsubmit={(n) => { naming = null; void newBlock(n); }} oncancel={() => (naming = null)} />{/if}
{#if naming === "plugin"}<InputDialog title="New plugin" hint="A name, e.g. Reading list" onsubmit={(n) => { naming = null; void newPlugin(n); }} oncancel={() => (naming = null)} />{/if}

<style>
  .page { display: flex; flex-direction: column; gap: 14px; }
  header h2 { display: flex; gap: 10px; align-items: center; margin: 0; font-size: calc(22px * var(--ui-scale, 1)); color: var(--heading); letter-spacing: -.015em; }
  .embedded header h2 { font-size: calc(15px * var(--ui-scale, 1)); }
  .blurb { margin: 4px 0 0; color: var(--text-muted); }
  .what { margin: 0 0 8px; color: var(--text-muted); font-size: calc(12.5px * var(--ui-scale, 1)); line-height: 1.45; }
  /* A section heading in any panel on the page: one look (a panel keeps only its margin). */
  .page :global(h3) { font-size: calc(11px * var(--ui-scale, 1)); font-weight: 600; text-transform: uppercase; letter-spacing: .08em; color: var(--text-muted); }
  h3 { margin: 4px 0; }
  /* an even grid of rows — the name at the left (two lines at most: the whole in its tooltip), the keys at the right —
     not pills of every width wrapping into a ragged block (eleven of them on Appearance) */
  .features { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 6px; }
  /* the whole name (a command's title is what it does: cut, it said nothing), its keys under it */
  .feature { position: relative; display: flex; flex-direction: column; justify-content: center; align-items: flex-start; gap: 4px; min-width: 0; padding: 7px 44px 7px 12px; border: 1px solid var(--border); border-radius: var(--radius-sm); background: var(--bg-alt); text-align: left; }
  .feature:hover { border-color: var(--accent); }
  .feature .t { min-width: 0; color: var(--text); line-height: 1.3; }
  .feature .d { margin-top: -3px; color: var(--text-faint); font-size: .88em; line-height: 1.3; }
  .feature .k { flex: none; }
  .feature .try { position: absolute; right: 12px; top: 50%; transform: translateY(-50%); color: var(--accent); font-size: .85em; font-weight: 600; opacity: 0; transition: opacity .1s; }
  .feature:hover .try, .feature:focus-visible .try { opacity: 1; }
  kbd { font-family: var(--font-mono); font-size: calc(10.5px * var(--ui-scale, 1)); padding: 0 4px; border-radius: 4px; border: 1px solid var(--border-strong); background: var(--bg-elev); color: var(--text-muted); margin-left: 2px; }
  .fields, :global(.settings-panel), .panel { padding: 6px 18px 8px; border: 1px solid var(--border); border-radius: var(--radius); background: var(--bg); }
  .fields h3 + :global(.row) { border-top: 0; }
  .next { display: flex; flex-direction: column; gap: 6px; }
  .rung { display: flex; flex-direction: column; align-items: flex-start; gap: 2px; padding: 10px 14px; text-align: left; border: 1px dashed var(--border-strong); border-radius: var(--radius); }
  .rung:hover { border-color: var(--accent); background: var(--accent-soft); }
  .rung b { color: var(--accent); }
  .rung span { color: var(--text-muted); font-size: calc(12.5px * var(--ui-scale, 1)); }
</style>
