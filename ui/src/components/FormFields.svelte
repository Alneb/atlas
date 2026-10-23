<script lang="ts">
  // The controls of a form drawn from its fields (lib/block-options.ts): a field shows only while its
  // `when` holds; the fields of a `group` sit together under a heading that starts closed; a records
  // field is a list of cards (RecordCards), each drawn by this same component.
  import Select from "./Select.svelte";
  import RecordCards from "./RecordCards.svelte";
  import { applies, layout, type Card, type FormValue, type OptionField } from "../lib/block-options";

  let { fields, values = $bindable(), onaction, compact = false, sections = false }: {
    fields: OptionField[]; values: Record<string, FormValue>;
    /** groups as open cards with a heading (a plugin's page in Settings); "Advanced" stays folded */ sections?: boolean;
    /** labels beside the controls (a card): denser than the dialog's labels above */ compact?: boolean;
    /** a card's or a list's button: the plugin's command and its argument */ onaction?: (command: string, arg: Record<string, unknown>) => void;
  } = $props();
  const items = $derived(layout(fields));
  const on = (f: OptionField) => applies(f, values, fields);
</script>

{#snippet field(f: OptionField)}
  <div class="field" data-field={f.key}>
    {#if f.kind === "records"}
      <span class="name">{f.label}</span>
      <RecordCards {f} cards={values[f.key] as Card[]} {onaction} />
    {:else if f.readonly}
      <span class="name">{f.label}</span>
      <span class="static" aria-label={f.label}>{f.kind === "secret" ? (f.isSet ? "Set" : "Not set yet") : String(values[f.key] || "—")}</span>
    {:else if f.kind === "toggle"}
      <label class="check"><input type="checkbox" checked={values[f.key] === true} onchange={(e) => (values[f.key] = e.currentTarget.checked)} /> {f.label}</label>
    {:else if f.kind === "choice"}
      <span class="name">{f.label}</span>
      <Select label={f.label} value={String(values[f.key])} options={f.choices.map((c) => ({ value: c, label: c || "Not set" }))} onchange={(v) => (values[f.key] = v)} />
    {:else if f.kind === "longtext"}
      <label class="long"><span class="name">{f.label}</span>
        <textarea class="text" rows="4" value={String(values[f.key] ?? "")} spellcheck="false" oninput={(e) => (values[f.key] = e.currentTarget.value)}></textarea></label>
    {:else}
      <label><span class="name">{f.label}</span>
        <input class="text" type={f.kind === "secret" ? "password" : undefined} autocomplete={f.kind === "secret" ? "off" : undefined} value={String(values[f.key] ?? "")} inputmode={f.kind === "number" ? "decimal" : undefined} spellcheck="false" oninput={(e) => (values[f.key] = e.currentTarget.value)} /></label>
      {#if f.kind === "text" && f.suggestions?.length}
        <!-- what the plugin found on this machine: picked into the box, which stays free to type -->
        <div class="found"><Select label="{f.label}: found on this machine" value=""
          options={[{ value: "", label: `${f.suggestions.length} found on this machine…` }, ...f.suggestions]} onchange={(v) => (values[f.key] = v)} /></div>
      {/if}
    {/if}
    {#if f.hint}<p class="hint">{f.hint}</p>{/if}
  </div>
{/snippet}

<div class="fields" class:compact class:sections>
{#each items as it ("group" in it ? `group:${it.group}` : it.field.key)}
  {#if "group" in it}
    {@const shownFields = it.fields.filter(on)}
    {#if shownFields.length && sections && it.group !== "Advanced"}
      <section class="sect" data-group={it.group}>
        <h4>{it.group}</h4>
        <div class="inner">{#each shownFields as f (f.key)}{@render field(f)}{/each}</div>
      </section>
    {:else if shownFields.length}
      <details class="group" data-group={it.group}>
        <summary><b>{it.group}</b> <span class="peek">{shownFields.map((f) => f.label).join(", ")}</span></summary>
        <div class="inner">{#each shownFields as f (f.key)}{@render field(f)}{/each}</div>
      </details>
    {/if}
  {:else if on(it.field)}
    {@render field(it.field)}
  {/if}
{/each}
</div>

<style>
  /* the dialog lays the fields out (its gap); a card lays them out here, label beside control */
  .fields { display: contents; }
  .fields.compact { display: flex; flex-direction: column; gap: 8px; }
  .compact .field { display: grid; grid-template-columns: minmax(7em, 11em) 1fr; column-gap: 12px; row-gap: 3px; align-items: center; }
  .compact label:not(.check) { display: contents; }
  .compact .check, .compact .hint, .compact .static { grid-column: 2; }
  .compact .check { grid-column: 1 / -1; }
  .compact .field > :global(.select) { min-width: 0; width: 100%; }
  .field { display: flex; flex-direction: column; gap: 4px; }
  label { display: flex; flex-direction: column; gap: 5px; }
  .name, .check { color: var(--text-muted); font-size: calc(12.5px * var(--ui-scale, 1)); }
  .check { flex-direction: row; align-items: center; gap: 8px; color: var(--text); }
  .compact .field:has(textarea) { align-items: start; }
  input.text, textarea.text { font: inherit; font-size: calc(13.5px * var(--ui-scale, 1)); color: var(--text); background: var(--bg); border: 1px solid var(--border-strong); border-radius: var(--radius-sm); padding: 6px 9px; }
  input.text:focus, textarea.text:focus { outline: none; border-color: var(--accent); }
  textarea.text { resize: vertical; min-height: 5.5em; line-height: 1.45; }
  .static { color: var(--text); font-size: calc(13px * var(--ui-scale, 1)); }
  .found { display: flex; }
  .compact .found { grid-column: 2; }
  .hint { margin: 0; color: var(--text-faint); font-size: calc(12px * var(--ui-scale, 1)); }
  .group { border-top: 1px solid var(--border); padding-top: 6px; }
  .group summary { cursor: pointer; color: var(--text-muted); font-size: calc(12.5px * var(--ui-scale, 1)); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .group summary b { color: var(--text); font-weight: 600; }
  .group .peek { color: var(--text-faint); }
  .group[open] .peek { display: none; }
  .group .inner { display: flex; flex-direction: column; gap: 12px; padding: 10px 0 2px 12px; }
  .compact .group .inner { gap: 8px; padding: 8px 0 2px 0; }
  /* a plugin's page: fields as rows (label and hint left, control right), each group a card of its own */
  .sections { display: flex; flex-direction: column; gap: 0; }
  .sections > .field { display: grid; grid-template-columns: minmax(0, 1fr) minmax(180px, 46%); column-gap: 20px; row-gap: 4px; align-items: center; padding: 11px 0; border-top: 1px solid var(--border); }
  .sections > .field:first-child { border-top: 0; }
  .sections > .field:has(:global(.records)), .sections .inner > .field:has(:global(.records)), .sections > .field:has(textarea) { display: flex; }
  .sections > .field > label:not(.check), .sections .inner > .field > label:not(.check) { display: contents; }
  .sections .field > .name { color: var(--text); font-weight: 500; font-size: calc(13.5px * var(--ui-scale, 1)); }
  .sections .field > .hint { grid-column: 1; grid-row: 2; }
  .sections .field > .check { grid-column: 1 / -1; font-weight: 500; }
  .sections .sect { margin: 14px -18px 0; padding: 4px 18px 6px; border-top: 1px solid var(--border-strong); }
  .sections .sect h4 { margin: 10px 0 2px; font-size: calc(11px * var(--ui-scale, 1)); letter-spacing: .07em; text-transform: uppercase; color: var(--text-muted); }
  .sections .inner { display: flex; flex-direction: column; }
  .sections .inner > .field { display: grid; grid-template-columns: minmax(0, 1fr) minmax(180px, 46%); column-gap: 20px; row-gap: 4px; align-items: center; padding: 11px 0; border-top: 1px solid var(--border); }
  .sections .inner > .field:first-child { border-top: 0; }
  .sections .group { margin-top: 14px; padding-top: 10px; }
  :global(html.phone) .sections .field { grid-template-columns: 1fr !important; }
</style>
