<script lang="ts">
  // The sort popover's content: the view's sort keys, first key first — each a property and a direction in the words
  // its type reads best (A → Z, 1 → 9, old → new); dragged by the handle (or Alt+↑/↓ on it) to reorder, added, removed.
  // Above them, as in Obsidian, the property the rows are grouped by (a board must keep one).
  import Icon from "../Icon.svelte";
  import Picker from "./Picker.svelte";
  import type { SortKey } from "../../lib/gen/SortKey";
  import type { SortDir } from "../../lib/gen/SortDir";
  import type { FieldType } from "../../lib/base-filter";
  import { reorder } from "../../lib/base-drag";

  let { sort, props, typeOf, onsort, group, board, ongroup }: {
    sort: SortKey[];
    props: { id: string; label: string }[];
    typeOf: (id: string) => FieldType;
    onsort: (s: SortKey[]) => void;
    /** the view's `groupBy` property */
    group: string | null;
    /** a board: always grouped */
    board: boolean;
    ongroup: (property: string | null) => void;
  } = $props();
  const groupOptions = $derived([
    ...(board ? [] : [{ value: "", label: "None" }]),
    ...props.filter((p) => !/^(file|formula)\./.test(p.id) || p.id === group).map((p) => ({ value: p.id, label: p.label })),
  ]);

  const WORDS: Record<FieldType, [string, string]> = {
    text: ["A → Z", "Z → A"], folder: ["A → Z", "Z → A"], number: ["1 → 9", "9 → 1"], date: ["Old → new", "New → old"],
    list: ["A → Z", "Z → A"], tags: ["A → Z", "Z → A"], links: ["A → Z", "Z → A"], bool: ["Unchecked first", "Checked first"],
  };
  const dirOptions = (id: string) => { const [a, d] = WORDS[typeOf(id)]; return [{ value: "ASC" as SortDir, label: a }, { value: "DESC" as SortDir, label: d }]; };
  const propOptions = (cur: string) => props.filter((p) => p.id === cur || !sort.some((k) => k.property === p.id)).map((p) => ({ value: p.id, label: p.label }));
  const set = (i: number, k: SortKey) => onsort(sort.map((x, j) => (j === i ? k : x)));
  const unused = $derived(props.find((p) => !sort.some((k) => k.property === p.id)));
  let dragged = $state<number | null>(null);
  let over = $state<number | null>(null);
</script>

<div class="group-by">
  <span class="lbl">Group by</span>
  <Picker label="Group by" value={group ?? ""} options={groupOptions} onchange={(p) => ongroup(p || null)} />
</div>
<div class="keys">
  {#each sort as k, i (k.property)}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="key" class:over={over === i && dragged !== i}
      ondragover={(e) => { if (dragged !== null) { e.preventDefault(); over = i; } }}
      ondrop={(e) => { e.preventDefault(); if (dragged !== null && dragged !== i) onsort(reorder(sort, dragged, i)); dragged = over = null; }}>
      <button type="button" class="handle" draggable="true" aria-label="Move {k.property} (Alt+↑/↓)" title="Drag to reorder"
        ondragstart={(e) => { dragged = i; e.dataTransfer?.setData("text/plain", k.property); }} ondragend={() => (dragged = over = null)}
        onkeydown={(e) => { if (e.altKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) { e.preventDefault(); const j = i + (e.key === "ArrowUp" ? -1 : 1); if (j >= 0 && j < sort.length) onsort(reorder(sort, i, j)); } }}>
        <Icon name="grid" size={12} />
      </button>
      <Picker label="Sort by" value={k.property} options={propOptions(k.property)} onchange={(p) => set(i, { ...k, property: p })} />
      <Picker label="Direction of {k.property}" value={k.direction} options={dirOptions(k.property)} onchange={(d) => set(i, { ...k, direction: d })} />
      <button type="button" class="icon-btn" aria-label="Remove the sort by {k.property}" title="Remove" onclick={() => onsort(sort.filter((_, j) => j !== i))}><Icon name="close" size={12} /></button>
    </div>
  {:else}
    <p class="empty">Not sorted: the notes come in the order they are found.</p>
  {/each}
</div>
{#if unused}
  <button type="button" class="add" onclick={() => onsort([...sort, { property: unused.id, direction: "ASC" }])}><Icon name="plus" size={12} /> Add sort</button>
{/if}

<style>
  .group-by { display: flex; align-items: center; gap: 8px; padding: 0 2px 8px; margin-bottom: 8px; border-bottom: 1px solid var(--border); }
  .group-by .lbl { flex: none; color: var(--text-muted); font-size: .92em; }
  .group-by > :global(.picker) { flex: 1; }
  .keys { display: flex; flex-direction: column; gap: 4px; margin-bottom: 6px; }
  .key { display: flex; align-items: center; gap: 6px; padding: 2px; border-radius: var(--radius-sm); border: 1px solid transparent; }
  .key.over { border-color: var(--accent); background: var(--accent-soft); }
  .key > :global(.picker) { flex: 1; }
  .handle { flex: none; display: grid; place-items: center; width: 24px; height: 24px; border-radius: var(--radius-sm); color: var(--text-faint); cursor: grab; }
  .handle:hover { background: var(--bg-hover); color: var(--text); }
  .icon-btn { flex: none; display: grid; place-items: center; width: 24px; height: 24px; border-radius: var(--radius-sm); color: var(--text-faint); }
  .icon-btn:hover { background: var(--bg-hover); color: var(--text); }
  .add { display: inline-flex; align-items: center; gap: 5px; height: 26px; padding: 0 8px; border-radius: var(--radius-sm); color: var(--text-muted); align-self: flex-start; }
  .add:hover { background: var(--bg-hover); color: var(--text); }
  .empty { margin: 0; color: var(--text-faint); font-size: .92em; }
</style>
