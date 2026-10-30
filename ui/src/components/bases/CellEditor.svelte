<script lang="ts">
  // A Bases cell being edited, by the property's kind: text, number, a date with the browser's picker, a list as chips
  // (Enter or a comma adds one, × or Backspace removes). Enter or leaving the cell writes, Escape cancels; a list writes
  // at every chip added or removed. `oncommit` gets the YAML value (null = empty); conversions are lib/property-model.ts's.
  import Icon from "../Icon.svelte";
  import type { PropertyKind } from "../../lib/gen/PropertyKind";
  import { asLink, asNumber, asTag, fromInput, isListKind, linkLabel, listOf, scalarText, toInput } from "../../lib/property-model";

  let { kind, value, label, oncommit, onclose }: {
    kind: PropertyKind;
    value: unknown;
    label: string;
    oncommit: (v: unknown) => void;
    onclose: () => void;
  } = $props();

  const list = $derived(isListKind(kind));
  const isDate = $derived(kind === "date" || kind === "datetime");
  // svelte-ignore state_referenced_locally -- the editor starts from the value it was opened on
  let items = $state(listOf(value));
  // svelte-ignore state_referenced_locally
  let text = $state(isDate ? toInput(value, kind as "date" | "datetime") : scalarText(value));
  let draft = $state("");
  let root = $state<HTMLElement>();
  let done = false;

  $effect(() => { root?.querySelector<HTMLInputElement>("input")?.focus(); });

  const shape = (s: string) => (kind === "links" ? asLink(s) : kind === "tags" ? asTag(s) : s.trim());
  function scalar(): unknown {
    if (kind === "number") return asNumber(text);
    if (isDate) return text ? fromInput(text, kind as "date" | "datetime", "", value) : null;
    return text.trim() === "" ? null : text;
  }
  function finish(save: boolean) {
    if (done) return;
    done = true;
    if (save && !list) {
      const v = scalar();
      if (scalarText(v) !== scalarText(value)) oncommit(v);
    }
    if (save && list && draft.trim()) add();
    onclose();
  }
  function add() {
    const next = draft.split(",").map(shape).filter((s) => s && !items.includes(s));
    draft = "";
    if (!next.length) return;
    items = [...items, ...next];
    oncommit(items);
  }
  function remove(i: number) {
    items = items.filter((_, j) => j !== i);
    oncommit(items.length ? items : null);
    root?.querySelector<HTMLInputElement>("input")?.focus();
  }
  function onkeydown(e: KeyboardEvent) {
    e.stopPropagation(); // the table's and the editor's keys stay out of a field being typed in
    if (e.key === "Escape") { e.preventDefault(); finish(false); }
    else if (e.key === "Enter" && !(list && draft.trim())) { e.preventDefault(); finish(true); }
    else if (list && (e.key === "Enter" || e.key === ",")) { e.preventDefault(); add(); }
    else if (list && e.key === "Backspace" && !draft && items.length) { e.preventDefault(); remove(items.length - 1); }
  }
  function onfocusout(e: FocusEvent) {
    if (!root?.contains(e.relatedTarget as Node)) finish(true);
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="cell-editor" class:list bind:this={root} {onkeydown} {onfocusout} onclick={(e) => e.stopPropagation()}>
  {#if list}
    {#each items as it, i (it)}
      <span class="chip"><span class="t">{linkLabel(it)}</span><button type="button" class="x" aria-label="Remove {it}" onclick={() => remove(i)}><Icon name="close" size={10} /></button></span>
    {/each}
    <input class="cell-edit" aria-label="Add to {label}" placeholder={items.length ? "" : "Add…"} bind:value={draft} spellcheck="false" />
  {:else if isDate}
    <input class="cell-edit" type={kind === "date" ? "date" : "datetime-local"} aria-label="Edit {label}" bind:value={text} />
  {:else if kind === "number"}
    <!-- not bound: Svelte would hand a number input's value over as a number -->
    <input class="cell-edit num" type="number" step="any" aria-label="Edit {label}" value={text} oninput={(e) => (text = e.currentTarget.value)} />
  {:else}
    <input class="cell-edit" aria-label="Edit {label}" bind:value={text} spellcheck="false" />
  {/if}
</div>

<style>
  .cell-editor { display: flex; align-items: center; gap: 4px; min-width: 0; width: 100%; }
  /* a list's chips float over the cell, wrapping downwards: the row keeps its height (the table's window counts on it) */
  .cell-editor.list { flex-wrap: wrap; position: absolute; top: 0; left: 0; z-index: 3; min-width: 100%; width: max-content; max-width: 360px; min-height: 100%;
    padding: 4px 6px; background: var(--bg-elev); border: 1px solid var(--accent); border-radius: var(--radius-sm); box-shadow: var(--shadow-pop); }
  .cell-edit { flex: 1; min-width: 60px; width: 100%; height: 24px; font: inherit; color: var(--text); background: var(--bg); border: 1px solid var(--accent); border-radius: var(--radius-sm); padding: 0 6px; }
  .list .cell-edit { border: 0; background: transparent; padding: 0 2px; }
  .cell-edit:focus { outline: none; }
  .num { font-variant-numeric: tabular-nums; text-align: right; }
  input[type="date"], input[type="datetime-local"] { color-scheme: light dark; font-variant-numeric: tabular-nums; }
  .chip { display: inline-flex; align-items: center; max-width: 200px; border-radius: 999px; background: var(--accent-soft); font-size: .92em; line-height: 20px; }
  .chip .t { padding: 0 2px 0 8px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .x { display: inline-grid; place-items: center; width: 18px; height: 18px; border-radius: 50%; color: var(--text-faint); }
  .x:hover { color: var(--text); background: var(--bg-hover); }
</style>
