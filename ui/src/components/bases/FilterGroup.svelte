<script lang="ts">
  // One group of a Bases filter, as Obsidian draws it: "All / Any / None of the following are true", its conditions and
  // the groups inside it, "Add filter" and "Add filter group". The whole group goes up on every change (`onchange`); a
  // condition just added stays here until it is complete, so a half-typed row never empties the table.
  import Icon from "../Icon.svelte";
  import Picker from "./Picker.svelte";
  import FilterCondition from "./FilterCondition.svelte";
  import Self from "./FilterGroup.svelte";
  import { subGroup, toFilter, type FieldType, type Group, type GroupOp } from "../../lib/base-filter";
  import type { Filter } from "../../lib/gen/Filter";

  let { group, props, typeOf, onchange, onremove, depth = 0, empty = "No filters: every note is in." }: {
    group: Group;
    props: { id: string; label: string }[];
    typeOf: (id: string) => FieldType;
    onchange: (g: Group) => void;
    onremove?: () => void;
    depth?: number;
    /** what an empty top group says */
    empty?: string;
  } = $props();

  const OPS: { value: GroupOp; label: string }[] = [
    { value: "and", label: "All the following are true" },
    { value: "or", label: "Any of the following are true" },
    { value: "not", label: "None of the following are true" },
  ];
  let pending = $state<number[]>([]);
  let next = 0;

  const set = (i: number, f: Filter) => onchange({ ...group, items: group.items.map((x, j) => (j === i ? f : x)) });
  const drop = (i: number) => onchange({ ...group, items: group.items.filter((_, j) => j !== i) });
  function settle(id: number, e: string) {
    pending = pending.filter((p) => p !== id);
    onchange({ ...group, items: [...group.items, e] });
  }
</script>

<div class="group" class:nested={depth > 0}>
  <div class="head">
    <Picker label="How the filters combine" value={group.op} options={OPS} onchange={(op) => onchange({ ...group, op })} />
    {#if onremove}<button type="button" class="icon-btn" title="Remove this group" aria-label="Remove this group" onclick={onremove}><Icon name="close" size={12} /></button>{/if}
  </div>
  <div class="items">
    {#each group.items as item, i (i)}
      {@const sub = subGroup(item)}
      {#if sub}
        <Self group={sub} {props} {typeOf} depth={depth + 1} onchange={(g) => set(i, toFilter(g))} onremove={() => drop(i)} />
      {:else}
        <FilterCondition expr={item as string} {props} {typeOf} onchange={(e) => set(i, e)} onremove={() => drop(i)} />
      {/if}
    {/each}
    {#each pending as id (id)}
      <FilterCondition expr={null} {props} {typeOf} onchange={(e) => settle(id, e)} onremove={() => (pending = pending.filter((p) => p !== id))} />
    {/each}
    {#if !group.items.length && !pending.length}<p class="empty">{depth ? "No filters: every note passes this group." : empty}</p>{/if}
  </div>
  <div class="foot">
    <button type="button" class="add" onclick={() => (pending = [...pending, next++])}><Icon name="plus" size={12} /> Add filter</button>
    {#if depth < 2}<button type="button" class="add" onclick={() => onchange({ ...group, items: [...group.items, { and: [] } as Filter] })}><Icon name="plus" size={12} /> Add filter group</button>{/if}
  </div>
</div>

<style>
  .group { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
  .group.nested { padding: 8px; border: 1px solid var(--border); border-radius: var(--radius); background: var(--bg-alt); }
  .head { display: flex; align-items: center; justify-content: space-between; gap: 6px; }
  .items { display: flex; flex-direction: column; gap: 6px; }
  .foot { display: flex; gap: 4px; flex-wrap: wrap; }
  .add { display: inline-flex; align-items: center; gap: 5px; height: 26px; padding: 0 8px; border-radius: var(--radius-sm); color: var(--text-muted); }
  .add:hover { background: var(--bg-hover); color: var(--text); }
  .empty { margin: 0; color: var(--text-faint); font-size: .92em; }
  .icon-btn { display: grid; place-items: center; width: 24px; height: 24px; border-radius: var(--radius-sm); color: var(--text-faint); }
  .icon-btn:hover { background: var(--bg-hover); color: var(--text); }
</style>
