<script lang="ts">
  // The properties popover's content, as Obsidian's: every property of the notes, the base's formulas and the file's
  // own, each with a checkbox to show it as a column; the shown ones first, in column order, dragged (or Alt+↑/↓) to
  // reorder and renamed in place (a display name for every view of the base). A search narrows a long list.
  import Icon from "../Icon.svelte";
  import { reorder } from "../../lib/base-drag";
  import type { ViewEdit } from "../../lib/gen/ViewEdit";
  import type { BaseColumn } from "../../lib/gen/BaseColumn";

  let { columns, others, onedit }: {
    columns: BaseColumn[];
    /** the properties not shown, with their names */
    others: { id: string; label: string }[];
    onedit: (e: ViewEdit) => void;
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

<style>
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
