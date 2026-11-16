<script lang="ts">
  // The properties popover's content, as Obsidian's: every property of the notes, the base's formulas and the file's
  // own, each with a checkbox to show it as a column; the shown ones first, in column order, dragged (or Alt+↑/↓) to
  // reorder and renamed in place (a display name for every view of the base). A search narrows a long list. Below, the
  // base's formulas (Obsidian's `formulas:`, computed columns): written, changed and removed here.
  import Icon from "../Icon.svelte";
  import { reorder } from "../../lib/base-drag";
  import type { ViewEdit } from "../../lib/gen/ViewEdit";
  import type { BaseColumn } from "../../lib/gen/BaseColumn";

  let { columns, formulas = {}, others, onedit }: {
    columns: BaseColumn[];
    /** the base's formulas, name → expression */
    formulas?: Partial<Record<string, string>>;
    /** the properties not shown, with their names */
    others: { id: string; label: string }[];
    /** `then` runs once the change is written (a formula's form stays open until then: a bad one keeps its text) */
    onedit: (e: ViewEdit, then?: () => void) => void;
  } = $props();

  let q = $state("");
  const hit = (id: string, label: string) => !q.trim() || `${id} ${label}`.toLowerCase().includes(q.trim().toLowerCase());
  const order = $derived(columns.map((c) => c.id));
  let dragged = $state<number | null>(null);
  let over = $state<number | null>(null);
  let renaming = $state<string | null>(null);
  const move = (from: number, to: number) => { if (to >= 0 && to < order.length && from !== to) onedit({ op: "order", columns: reorder(order, from, to) }); };
  function rename(c: BaseColumn, name: string) {
    renaming = null;
    const n = name.trim();
    if (n !== c.label) onedit({ op: "display_name", column: c.id, name: n || null });
  }
  const focus = (el: HTMLInputElement) => { el.focus(); el.select(); };

  // the formula being written: a new one (`was` null) or a change of `was`
  let draft = $state<{ was: string | null; name: string; expr: string } | null>(null);
  const formulaList = $derived(Object.entries(formulas).filter((e): e is [string, string] => e[1] !== undefined));
  const nameOk = (n: string) => /^[\p{L}_][\p{L}\p{N}_]*$/u.test(n.trim());
  /** Another formula already has that name: saving would replace it (and its columns). */
  const taken = (d: { was: string | null; name: string }) => d.name.trim() !== d.was && formulas[d.name.trim()] !== undefined;
  function saveFormula() {
    const d = draft;
    if (!d || !nameOk(d.name) || !d.expr.trim() || taken(d)) return;
    const name = d.name.trim();
    onedit({ op: "formula", name, formula: d.expr.trim(), ...(d.was && d.was !== name ? { was: d.was } : {}) }, () => { if (draft === d) draft = null; });
  }
  const keys = (e: KeyboardEvent) => {
    e.stopPropagation();
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); saveFormula(); }
    else if (e.key === "Escape") { e.preventDefault(); draft = null; }
  };
</script>

<input class="search" type="search" placeholder="Search properties…" aria-label="Search properties" bind:value={q} spellcheck="false" />
<ul class="props" aria-label="Shown as columns">
  {#each columns as c, i (c.id)}
    {#if hit(c.id, c.label)}
      <li class:over={over === i && dragged !== i}
        ondragover={(e) => { if (dragged !== null) { e.preventDefault(); over = i; } }}
        ondrop={(e) => { e.preventDefault(); if (dragged !== null) move(dragged, i); dragged = over = null; }}>
        <button type="button" class="handle" draggable="true" aria-label="Move {c.label} (Alt+↑/↓)" title="Drag to reorder"
          ondragstart={(e) => { dragged = i; e.dataTransfer?.setData("text/plain", c.id); }} ondragend={() => (dragged = over = null)}
          onkeydown={(e) => { if (e.altKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) { e.preventDefault(); move(i, i + (e.key === "ArrowUp" ? -1 : 1)); } }}>
          <Icon name="grid" size={12} />
        </button>
        <input type="checkbox" checked aria-label="Show {c.label}" disabled={columns.length === 1} onchange={() => onedit({ op: "hide", column: c.id })} />
        {#if renaming === c.id}
          <input class="name-edit" aria-label="Name of {c.id}" value={c.label} use:focus
            onkeydown={(e) => { e.stopPropagation(); if (e.key === "Enter") rename(c, e.currentTarget.value); else if (e.key === "Escape") { e.preventDefault(); renaming = null; } }}
            onblur={(e) => rename(c, e.currentTarget.value)} />
        {:else}
          <span class="label" title={c.id}>{c.label}</span>
          {#if c.label.toLowerCase() !== c.id.replace(/^(note|file|formula)\./, "").toLowerCase()}<span class="id">{c.id}</span>{/if}
          <button type="button" class="icon-btn" aria-label="Rename {c.label}" title="Rename the column (every view)" onclick={() => (renaming = c.id)}><Icon name="edit" size={12} /></button>
        {/if}
      </li>
    {/if}
  {/each}
</ul>
<div class="sep"></div>
<ul class="props" aria-label="Not shown">
  {#each others.filter((p) => hit(p.id, p.label)) as p (p.id)}
    <li>
      <span class="handle-space"></span>
      <input type="checkbox" aria-label="Show {p.label}" onchange={() => onedit({ op: "show", column: p.id })} />
      <span class="label muted" title={p.id}>{p.label}</span>
      {#if p.label !== p.id}<span class="id">{p.id}</span>{/if}
    </li>
  {:else}
    <li class="empty">{q ? "No property matches." : "Every property is shown."}</li>
  {/each}
</ul>

<div class="sep"></div>
<div class="f-head"><span>Formulas</span>
  {#if !draft}<button type="button" class="add" onclick={() => (draft = { was: null, name: "", expr: "" })}><Icon name="plus" size={12} /> Add formula</button>{/if}
</div>
<ul class="props" aria-label="Formulas">
  {#each formulaList as [name, expr] (name)}
    {#if draft?.was !== name}
      <li class="formula">
        <span class="label" title="formula.{name}">{name}</span>
        <code class="expr" title={expr}>{expr}</code>
        <button type="button" class="icon-btn" aria-label="Edit the formula {name}" title="Edit" onclick={() => (draft = { was: name, name, expr })}><Icon name="edit" size={12} /></button>
        <button type="button" class="icon-btn" aria-label="Remove the formula {name}" title="Remove (and its column in every view)" onclick={() => onedit({ op: "formula", name, formula: null })}><Icon name="trash" size={12} /></button>
      </li>
    {/if}
  {:else}
    {#if !draft}<li class="empty">Computed columns, as Obsidian's: <code>price * qty</code>, <code>if(done, "✓", "")</code>, <code>file.mtime.relative()</code>.</li>{/if}
  {/each}
</ul>
{#if draft}
  <form class="f-edit" onsubmit={(e) => { e.preventDefault(); saveFormula(); }}>
    <input class="f-name" placeholder="name" aria-label="Formula name" bind:value={draft.name} use:focus onkeydown={keys} spellcheck="false" class:bad={draft.name.trim() !== "" && !nameOk(draft.name)} />
    <textarea class="f-expr" rows="2" placeholder={'e.g. (now() - file.ctime).days, price.toFixed(2), tags.join(", ")'} aria-label="Formula" bind:value={draft.expr} onkeydown={keys} spellcheck="false"></textarea>
    <div class="f-actions">
      <span class="hint" class:bad={taken(draft)}>{draft.name.trim() && !nameOk(draft.name) ? "A name is letters, digits and _" : taken(draft) ? "Another formula has that name" : "Enter saves · Shift+Enter a new line"}</span>
      <button type="button" class="btn" onclick={() => (draft = null)}>Cancel</button>
      <button type="submit" class="btn primary" disabled={!nameOk(draft.name) || !draft.expr.trim() || taken(draft)}>{draft.was ? "Save" : "Add"}</button>
    </div>
  </form>
{/if}

<style>
  .f-head { display: flex; align-items: center; justify-content: space-between; padding: 2px 4px 4px; color: var(--text-faint); font-size: .85em; text-transform: uppercase; letter-spacing: .04em; }
  .add { display: inline-flex; align-items: center; gap: 4px; padding: 2px 6px; border-radius: var(--radius-sm); color: var(--accent); text-transform: none; letter-spacing: 0; font-size: 1.1em; }
  .add:hover { background: var(--bg-hover); }
  .formula .expr { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text-muted); font-family: var(--font-mono); font-size: .85em; }
  .formula .icon-btn { margin-left: 0; }
  .empty code { font-family: var(--font-mono); font-size: .92em; }
  .f-edit { display: flex; flex-direction: column; gap: 6px; padding: 6px 4px 2px; }
  .f-name, .f-expr { padding: 4px 8px; border-radius: var(--radius-sm); border: 1px solid var(--border); background: var(--bg); color: var(--text); font-family: var(--font-mono); font-size: .92em; }
  .f-expr { resize: vertical; min-height: 44px; }
  .f-name:focus, .f-expr:focus { outline: none; border-color: var(--accent); }
  .f-name.bad { border-color: var(--red); }
  .f-actions { display: flex; align-items: center; gap: 6px; }
  .hint { flex: 1; color: var(--text-faint); font-size: .85em; }
  .hint.bad { color: var(--red); }
  .btn { padding: 3px 10px; border-radius: var(--radius-sm); border: 1px solid var(--border-strong); }
  .btn:hover:not(:disabled) { background: var(--bg-hover); }
  .btn.primary { background: var(--accent); color: var(--accent-fg, #fff); border-color: var(--accent); }
  .btn:disabled { opacity: .5; }
  .search { height: 28px; padding: 0 8px; margin-bottom: 6px; border-radius: var(--radius-sm); border: 1px solid var(--border); background: var(--bg); color: var(--text); font: inherit; }
  .search:focus { outline: none; border-color: var(--accent); }
  .props { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 1px; }
  li { display: flex; align-items: center; gap: 6px; min-height: 28px; padding: 0 4px; border-radius: var(--radius-sm); border: 1px solid transparent; min-width: 0; }
  li:hover { background: var(--bg-hover); }
  li.over { border-color: var(--accent); background: var(--accent-soft); }
  .handle, .handle-space { flex: none; display: grid; place-items: center; width: 22px; height: 22px; border-radius: 4px; color: var(--text-faint); cursor: grab; }
  .handle:hover { color: var(--text); }
  input[type="checkbox"] { flex: none; accent-color: var(--accent); width: 14px; height: 14px; margin: 0; }
  .label { flex: 0 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .label.muted { color: var(--text-muted); }
  .id { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text-faint); font-family: var(--font-mono); font-size: .85em; }
  .name-edit { flex: 1; min-width: 0; height: 24px; padding: 0 6px; border-radius: var(--radius-sm); border: 1px solid var(--accent); background: var(--bg); color: var(--text); font: inherit; }
  .name-edit:focus { outline: none; }
  .icon-btn { flex: none; margin-left: auto; display: grid; place-items: center; width: 24px; height: 24px; border-radius: var(--radius-sm); color: var(--text-faint); opacity: 0; }
  li:hover .icon-btn, .icon-btn:focus-visible { opacity: 1; }
  .icon-btn:hover { background: var(--bg-elev); color: var(--text); }
  .sep { height: 1px; background: var(--border); margin: 6px 2px; }
  .empty { color: var(--text-faint); font-size: .92em; }
  .empty:hover { background: none; }
</style>
