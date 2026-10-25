<script lang="ts">
  // Settings → Writing → Templates: every template with when it applies by itself (its own `apply_when:`, the vault's
  // rules, the older settings — the core's one list, template_rules.rs), where its notes go, what it asks, and a
  // preview of what it makes. Edit opens the template; New makes one with an example rule.
  import Icon from "../Icon.svelte";
  import { api } from "../../lib/api";
  import { openPath } from "../../lib/dock";
  import { templateLabel } from "../../lib/notes-system";
  import { settings } from "../../lib/settings.svelte";
  import { toast } from "../../lib/state.svelte";
  import { errText } from "../../lib/text";
  import type { TemplateInfo } from "../../lib/gen/TemplateInfo";

  let list = $state<TemplateInfo[] | null>(null);
  let shown = $state<Record<string, string>>({});
  const load = () => api.templates().then((t) => (list = t), () => (list = []));
  $effect(() => { void load(); });

  async function preview(t: TemplateInfo) {
    if (shown[t.name] !== undefined) { const { [t.name]: _, ...rest } = shown; shown = rest; return; }
    try {
      const r = await api.mergeTemplate(`${t.folder ?? "notes"}/Example.md`, t.name, "");
      shown = { ...shown, [t.name]: r.text ?? "" };
    } catch (e) { toast("No preview", errText(e), "error"); }
  }

  const STARTER = `---\ntemplate_title: New template\n# when it applies by itself (each line one case; remove the ones you do not want):\napply_when:\n  - folder: notes/projects        # a new note in this folder\n  - property: { type: project }   # a note whose type becomes project\ntype: project\ndate: {{now}}\n---\n# {{title}}\n\n## Goals\n\n## Notes\n`;
  async function create() {
    const dir = (settings.config?.notes.templates ?? "templates").replace(/\/+$/, "");
    let path = `${dir}/new template.md`;
    for (let n = 2; !(await api.createFile(path, STARTER)).written; n++) path = `${dir}/new template ${n}.md`;
    openPath(path);
    void load();
  }
</script>

<section class="settings-panel templates">
  <h3>Templates</h3>
  <p class="desc">A template applies by itself when one of its rules fits — a new note in a folder, a file's note, a property set on a note, the day's log — written as <code>apply_when:</code> in the template. A note that already has text only gets what it lacks.</p>
  {#if list === null}<p class="muted">Reading…</p>
  {:else}
    {#each list as t (t.name)}
      <article class="tpl">
        <header>
          <b>{templateLabel(t)}</b>{#if t.default}<span class="tag">default</span>{/if}
          <span class="file">{t.path}</span>
          <button class="link" onclick={() => void preview(t)}>{shown[t.name] !== undefined ? "hide preview" : "preview"}</button>
          <button class="link" onclick={() => openPath(t.path)}>edit</button>
        </header>
        <ul>
          {#if t.default}<li>a note nothing else chose</li>{/if}
          {#each t.applies as a (a)}<li>{a}</li>{/each}
          {#if !t.default && !t.applies.length}<li class="muted">only when chosen (New…, Insert template…)</li>{/if}
        </ul>
        {#if t.folder || t.prompts.length}
          <p class="meta">{#if t.folder}files its notes in <code>{t.folder}</code>{/if}{#if t.folder && t.prompts.length} · {/if}{#if t.prompts.length}asks {t.prompts.join(", ")}{/if}</p>
        {/if}
        {#if shown[t.name] !== undefined}<pre class="preview">{shown[t.name]}</pre>{/if}
      </article>
    {:else}<p class="muted">No templates yet in <code>{settings.config?.notes.templates ?? "templates"}/</code>.</p>{/each}
  {/if}
  <button class="btn" onclick={() => void create()}><Icon name="plus" size={13} /> New template</button>
</section>

<style>
  h3 { margin: 10px 0 2px; } /* its look: SettingsPage */
  .desc, .muted, .meta { margin: 0 0 6px; color: var(--text-faint); font-size: calc(12.5px * var(--ui-scale, 1)); }
  .tpl { border: 1px solid var(--border); border-radius: 10px; padding: 8px 12px; margin: 6px 0; background: var(--bg); }
  .tpl header { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; }
  .tpl .file { font-family: var(--font-mono); color: var(--text-faint); font-size: calc(11.5px * var(--ui-scale, 1)); flex: 1; }
  .tag { font-size: calc(11px * var(--ui-scale, 1)); padding: 0 6px; border-radius: 999px; border: 1px solid var(--border-strong); color: var(--text-muted); }
  .link { color: var(--text-faint); font-size: .9em; }
  .link:hover { color: var(--accent); }
  ul { margin: 4px 0; padding-left: 18px; color: var(--text-muted); font-size: calc(12.5px * var(--ui-scale, 1)); }
  .preview { margin: 6px 0 2px; padding: 8px 10px; max-height: 240px; overflow: auto; background: var(--bg-alt); border-radius: 6px; font-size: calc(12px * var(--ui-scale, 1)); white-space: pre-wrap; }
  .btn { display: inline-flex; gap: 6px; align-items: center; margin: 6px 0 4px; border: 1px solid var(--border-strong); }
  .btn:hover { background: var(--bg-hover); }
</style>
