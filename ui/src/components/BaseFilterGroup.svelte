<script lang="ts" module>
  import type { Filter } from "../lib/gen/Filter";
  export type Op = "and" | "or" | "not";
  export interface Group { op: Op; items: Filter[] }
</script>

<script lang="ts">
  // One group of a Base filter (Obsidian's `and` / `or` / `not`): its conditions, each an expression as Obsidian writes
  // it, editable as text; a condition built from a property, an operator and a value; groups inside groups. Every
  // change is handed up whole (`onchange`), the view writes it (BaseViewEditor.svelte).
  import Icon from "./Icon.svelte";
  import Self from "./BaseFilterGroup.svelte";

  let { group, properties, onchange, depth = 0, onremove }: {
    group: Group;
    properties: string[];
    onchange: (g: Group) => void;
    depth?: number;
    onremove?: () => void;
  } = $props();

  const OPS: { op: Op; label: string }[] = [{ op: "and", label: "All of these" }, { op: "or", label: "Any of these" }, { op: "not", label: "None of these" }];

  /** What a condition row offers, and the expression each writes (the core's Bases evaluator reads them all). */
  const CONDITIONS = [
    { id: "is", label: "is", write: (p: string, v: string) => `${p} == ${lit(v)}` },
    { id: "not", label: "is not", write: (p: string, v: string) => `${p} != ${lit(v)}` },
    { id: "contains", label: "contains", write: (p: string, v: string) => `${p}.contains(${JSON.stringify(v)})` },
    { id: "gt", label: "is after / more than", write: (p: string, v: string) => `${p} > ${lit(v)}` },
    { id: "lt", label: "is before / less than", write: (p: string, v: string) => `${p} < ${lit(v)}` },
    { id: "empty", label: "is empty", write: (p: string) => `${p}.isEmpty()`, bare: true },
    { id: "set", label: "is not empty", write: (p: string) => `${p}.isNotEmpty()`, bare: true },
    { id: "tag", label: "has the tag", write: (_: string, v: string) => `file.hasTag(${JSON.stringify(v.replace(/^#/, ""))})`, any: true },
    { id: "folder", label: "is in the folder", write: (_: string, v: string) => `file.inFolder(${JSON.stringify(v)})`, any: true },
  ] as const;
  /** A number stays a number, anything else is quoted (dates are compared as Obsidian writes them: `"2025-03-01"`). */
  const lit = (v: string) => (/^-?\d+(\.\d+)?$/.test(v.trim()) ? v.trim() : JSON.stringify(v));

  // svelte-ignore state_referenced_locally -- the first property only seeds the builder
  let prop = $state(properties[0] ?? "file.name");
  let cond = $state<(typeof CONDITIONS)[number]["id"]>("is");
  let value = $state("");
  const picked = $derived(CONDITIONS.find((c) => c.id === cond)!);

  const set = (i: number, f: Filter) => onchange({ ...group, items: group.items.map((x, j) => (j === i ? f : x)) });
  const drop = (i: number) => onchange({ ...group, items: group.items.filter((_, j) => j !== i) });
  function add() {
    if (!("bare" in picked) && !value.trim()) return;
    onchange({ ...group, items: [...group.items, picked.write(prop, value.trim())] });
    value = "";
  }
  const groupOf = (f: Filter): Group | null => {
    if (typeof f === "string") return null;
    const op = (Object.keys(f)[0] ?? "and") as Op;
    return { op, items: (f as Record<Op, Filter[]>)[op] ?? [] };
  };
  const asFilter = (g: Group): Filter => ({ [g.op]: g.items }) as Filter;
</script>

<div class="group" class:nested={depth > 0}>
  <div class="head">
    <select aria-label="How the conditions combine" value={group.op} onchange={(e) => onchange({ ...group, op: e.currentTarget.value as Op })}>
      {#each OPS as o (o.op)}<option value={o.op}>{o.label}</option>{/each}
    </select>
    {#if onremove}<button type="button" class="icon-btn" title="Remove this group" aria-label="Remove this group" onclick={onremove}><Icon name="close" size={12} /></button>{/if}
  </div>
  {#each group.items as item, i (i)}
    {@const sub = groupOf(item)}
    {#if sub}
      <Self group={sub} {properties} depth={depth + 1} onchange={(g) => set(i, asFilter(g))} onremove={() => drop(i)} />
    {:else}
      <div class="row">
        <input class="expr" aria-label="Condition {i + 1}" value={item as string} spellcheck="false"
          onchange={(e) => { const v = e.currentTarget.value.trim(); if (v) set(i, v); else drop(i); }} />
        <button type="button" class="icon-btn" title="Remove the condition" aria-label="Remove condition {i + 1}" onclick={() => drop(i)}><Icon name="close" size={12} /></button>
      </div>
    {/if}
  {/each}
  <div class="row build">
    {#if !("any" in picked)}
      <select aria-label="Property" bind:value={prop}>{#each properties as p (p)}<option value={p}>{p}</option>{/each}</select>
    {/if}
    <select aria-label="Condition" bind:value={cond}>{#each CONDITIONS as c (c.id)}<option value={c.id}>{c.label}</option>{/each}</select>
    {#if !("bare" in picked)}
      <input aria-label="Value" placeholder="value" bind:value onkeydown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }} />
    {/if}
    <button type="button" class="btn" onclick={add}>Add</button>
    {#if depth < 2}<button type="button" class="btn btn-ghost" title="A group inside: any of, none of…" onclick={() => onchange({ ...group, items: [...group.items, { or: [] } as Filter] })}>Group</button>{/if}
  </div>
</div>

<style>
  .group { display: flex; flex-direction: column; gap: 6px; }
  .group.nested { margin-left: 14px; padding: 8px 8px 8px 10px; border-left: 2px solid var(--border); background: var(--bg-alt); border-radius: 0 6px 6px 0; }
  .head, .row { display: flex; align-items: center; gap: 6px; min-width: 0; }
  .row .expr { flex: 1; min-width: 0; font-family: var(--font-mono); font-size: .92em; }
  .build { flex-wrap: wrap; }
  .build input { flex: 1; min-width: 90px; }
  select, input { height: 26px; padding: 0 6px; border-radius: var(--radius-sm); border: 1px solid var(--border); background: var(--bg); color: var(--text); font: inherit; font-size: calc(12.5px * var(--ui-scale, 1)); }
  input:focus, select:focus { outline: none; border-color: var(--accent); }
</style>
