<script lang="ts">
  // The note's properties in a panel at the right of the editor (`[editor] properties = panel`):
  // one row per property, each edited with the control of its kind (the vault's spec, else the
  // value's shape), the keys the note's `type:` requires and lacks, and "Add a property".
  // Every change is one edit of the editor's text (lib/frontmatter-edit.ts): undo and save as typing.
  import { known, loadKnown, valuesOf } from "../lib/known-properties.svelte";
  import { errText } from "../lib/text";
  import { tick } from "svelte";
  import type { EditorView } from "@codemirror/view";
  import PropertyField from "./PropertyField.svelte";
  import Icon from "./Icon.svelte";
  import { addable, emptyValue, frontmatterOf, kindOf, parseYaml, rowsOf } from "../lib/property-model";
  import { editFrontmatter } from "../lib/frontmatter-edit";
  import { propertyIcon } from "../lib/properties";
  import { propertySpec, watchPropertySpec } from "../lib/property-spec.svelte";
  import { toast } from "../lib/state.svelte";
  import { toggleProperties } from "../lib/properties-panel.svelte";
  import type { FrontmatterEdit } from "../lib/types";

  let { text, view, onopen, closable = false }: { text: string; view: () => EditorView | null; onopen: (target: string) => void; closable?: boolean } = $props();
  // the YAML itself, for what the controls do not cover: the caret at the start of the frontmatter
  function asText() {
    const v = view();
    if (!v) return;
    v.dispatch({ selection: { anchor: Math.min(4, v.state.doc.length) }, scrollIntoView: true });
    v.focus();
  }
  watchPropertySpec();

  const spec = $derived(propertySpec.spec);
  const yaml = $derived(frontmatterOf(text)?.yaml ?? "");
  const data = $derived(parseYaml(yaml)); // re-parsed only when the YAML itself changed, not per keystroke
  const rows = $derived(data ? rowsOf(data, spec) : []);
  // the spec's properties first, then every other one the vault's notes use (the most used first)
  const offered = $derived(data ? [...addable(data, spec), ...known.list.map((p) => p.key)].filter((k, i, all) => !(k in data!) && all.indexOf(k) === i).slice(0, 80) : []);
  $effect(() => { if (data) loadKnown(); });
  const type = $derived(typeof data?.type === "string" ? data.type : "");
  let panel = $state<HTMLElement>();
  let newKey = $state("");

  async function edit(e: FrontmatterEdit): Promise<void> {
    const v = view();
    if (!v) return;
    try {
      if (!(await editFrontmatter(v, e))) toast("The note changed while the property was saved", "Nothing was written; try again.", "error");
    } catch (err) {
      toast("Could not change the property", errText(err), "error");
    }
  }
  const set = (key: string, value: unknown) => edit({ op: "set", key, value });
  async function remove(key: string) {
    await edit({ op: "remove", key });
    toast(`Removed “${key}”`, "Undo in the note brings it back (Ctrl+Z, or u in vim).");
  }
  async function addKey() {
    const key = newKey.trim();
    newKey = "";
    if (!key || !data) return;
    if (!(key in data)) await set(key, emptyValue(kindOf(spec, key, null)));
    await tick();
    panel?.querySelector<HTMLElement>(`[data-key="${CSS.escape(key)}"] :is(input, button.select-btn, button)`)?.focus();
  }
  const describe = (key: string) => spec?.properties[key]?.description ?? "";
  // renaming a key in place (double-click its name): the core's `rename` keeps its value and its place
  let renaming = $state<string | null>(null);
  let newName = $state("");
  function startRename(key: string) { renaming = key; newName = key; }
  async function finishRename() {
    const from = renaming, to = newName.trim();
    renaming = null;
    if (!from || !to || to === from) return;
    if (data && to in data) { toast(`“${to}” is already a property`, "Pick another name, or remove that one first."); return; }
    await edit({ op: "rename", from, to });
  }
  const focusSelect = (el: HTMLInputElement) => { el.focus(); el.select(); };
</script>

<aside class="props-panel" bind:this={panel} data-testid="properties-panel" aria-label="Properties">
  <div class="side-head">
    <span class="side-title">Properties</span>
    <span class="grow"></span>
    <button class="icon-btn" onclick={asText} title="Edit the properties as YAML text" aria-label="Edit as text"><Icon name="file-code" size={13} /></button>
    {#if closable}<button class="icon-btn" onclick={() => toggleProperties(false)} title="Hide the panel (the “Properties” line opens it again)" aria-label="Hide properties"><Icon name="close" size={13} /></button>{/if}
  </div>
  <div class="body">
    {#if !data}
      <p class="note warn">The properties are not valid YAML. Click the “Properties” line in the note to fix them there.</p>
    {:else}
      {#if !rows.length}<p class="note">No properties yet. Add one below.</p>{/if}
      {#each rows as r (r.key)}
        <div class="row" class:missing={r.missing} data-key={r.key}>
          <div class="key" title={describe(r.key) || r.key}>
            <span class="icon">{@html propertyIcon(r.kind)}</span>
            {#if renaming === r.key}
              <input class="rename" aria-label="New name for {r.key}" bind:value={newName} use:focusSelect spellcheck="false"
                onkeydown={(e) => { if (e.key === "Enter") { e.preventDefault(); void finishRename(); } else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); renaming = null; } }}
                onblur={() => void finishRename()} />
            {:else}
              <!-- svelte-ignore a11y_no_static_element_interactions -->
              <span class="name" title="Double-click to rename" ondblclick={() => !r.missing && startRename(r.key)}>{r.key}</span>
            {/if}
            {#if r.missing}<span class="req">required by {type}</span>
            {:else}<button type="button" class="icon-btn rm" aria-label="Remove {r.key}" title="Remove this property" onclick={() => remove(r.key)}><Icon name="close" size={12} /></button>{/if}
          </div>
          <PropertyField name={r.key} kind={r.kind} value={r.value} spec={spec?.properties[r.key]} values={valuesOf(r.key)} onset={(v) => set(r.key, v)} {onopen} />
        </div>
      {/each}
      <form class="add" onsubmit={(e) => { e.preventDefault(); void addKey(); }}>
        <Icon name="plus" size={13} />
        <input aria-label="Add a property" placeholder="Add a property…" list={offered.length ? "prop-keys" : undefined} bind:value={newKey} />
        {#if offered.length}<datalist id="prop-keys">{#each offered as k (k)}<option value={k}>{describe(k)}</option>{/each}</datalist>{/if}
      </form>
      {#if spec}<p class="src" title="[editor] properties_spec">Kinds from {spec.path}</p>{/if}
    {/if}
  </div>
</aside>

<style>
  .props-panel { flex: none; width: min(calc(300px * var(--ui-scale, 1)), 42%); min-width: 0; display: flex; flex-direction: column; border-left: 1px solid var(--border); background: var(--bg-alt); }
  .grow { flex: 1; }
  .side-head { flex: none; display: flex; align-items: center; gap: 8px; height: 36px; padding: 0 10px 0 14px; }
  .side-title { font-size: calc(11px * var(--ui-scale, 1)); font-weight: 600; text-transform: uppercase; letter-spacing: .08em; color: var(--text-muted); }
  .body { flex: 1; min-height: 0; overflow: auto; display: flex; flex-direction: column; gap: 2px; padding: 0 8px 16px; }
  /* one line per property, the name left and its value right (a name above each value
     took two screens for a film's 17 properties) */
  .row { display: grid; grid-template-columns: calc(96px * var(--ui-scale, 1)) minmax(0, 1fr); align-items: start; column-gap: 6px; padding: 2px 4px; border-radius: var(--radius-sm); }
  .row > .key { min-height: 28px; position: relative; }
  .row > .key :global(.rm) { position: absolute; right: 0; background: var(--bg-alt); } /* over the name's end: no width kept for it */
  .row > :global(:not(.key)) { min-width: 0; }
  .props-panel :global(input[type="number"]) { appearance: textfield; -moz-appearance: textfield; }
  .props-panel :global(input[type="number"]::-webkit-inner-spin-button), .props-panel :global(input[type="number"]::-webkit-outer-spin-button) { -webkit-appearance: none; margin: 0; }
  .row:hover { background: var(--bg-hover); }
  .row.missing .name { color: var(--text-faint); }
  .key { display: flex; align-items: center; gap: 6px; min-height: 20px; padding-left: 3px; color: var(--text-muted); font-size: calc(11.5px * var(--ui-scale, 1)); }
  .icon { display: inline-grid; place-items: center; flex: none; opacity: .75; }
  .icon :global(svg) { width: 13px; height: 13px; }
  .name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; font-weight: 550; }
  .rename { flex: 1; min-width: 0; height: 20px; font: inherit; font-weight: 550; color: var(--text); background: var(--bg); border: 1px solid var(--accent); border-radius: var(--radius-sm); padding: 0 4px; }
  .rename:focus { outline: none; }
  .req { margin-left: auto; font-size: .92em; color: var(--text-faint); font-style: italic; white-space: nowrap; }
  .rm { margin-left: auto; width: 24px; height: 20px; opacity: 0; }
  .row:hover .rm, .rm:focus-visible { opacity: 1; }
  /* a choice looks like the other fields: no box until pointed at or focused */
  .props-panel .row :global(.trigger) { height: 26px; padding: 0 7px; border-color: transparent; background: transparent; font-size: calc(12.5px * var(--ui-scale, 1)); }
  .props-panel .row :global(.trigger:hover) { border-color: var(--border); }
  .props-panel .row :global(.trigger:focus-visible), .props-panel .row :global(.trigger[aria-expanded="true"]) { border-color: var(--accent); background: var(--bg); }
  .add { display: flex; align-items: center; gap: 6px; margin-top: 6px; padding: 0 7px; min-height: 28px; border-radius: var(--radius-sm); color: var(--text-faint); border: 1px dashed var(--border-strong); }
  .add:focus-within { border-style: solid; border-color: var(--accent); color: var(--text-muted); }
  .add input { flex: 1; min-width: 0; height: 26px; border: 0; background: transparent; color: var(--text); font: inherit; font-size: calc(12.5px * var(--ui-scale, 1)); }
  .add input:focus { outline: none; }
  .add input::placeholder { color: var(--text-faint); }
  .note { margin: 8px 6px; color: var(--text-faint); font-size: calc(12px * var(--ui-scale, 1)); }
  .note.warn { color: var(--text-muted); }
  .src { margin: 10px 6px 0; color: var(--text-faint); font-size: calc(11px * var(--ui-scale, 1)); overflow-wrap: anywhere; }
  @media (prefers-reduced-motion: no-preference) { .rm { transition: opacity .12s; } }
</style>
