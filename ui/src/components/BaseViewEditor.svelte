<script lang="ts">
  // A Base view's settings, as Obsidian's view menu: its filter (groups of conditions), its sort, the columns in their order, and the view itself —
  // renamed, copied, deleted. Each change is written to the `.base` at once (core bases/edit.rs) and the view redrawn.
  import type { BaseView } from "../lib/gen/BaseView";
  import type { Filter } from "../lib/gen/Filter";
  import type { SortKey } from "../lib/gen/SortKey";
  import type { ViewEdit } from "../lib/gen/ViewEdit";
  import BaseFilterGroup, { type Group } from "./BaseFilterGroup.svelte";
  import Icon from "./Icon.svelte";

  let { view, views, onedit, onrenamed, onclose }: {
    view: BaseView;
    /** how many views the base has: the last one cannot go */
    views: number;
    onedit: (edit: ViewEdit) => Promise<void>;
    onrenamed: (name: string) => void;
    onclose: () => void;
  } = $props();

  const columns = $derived(view.columns.map((c) => c.id));
  const properties = $derived([...new Set([...columns, ...view.properties, "file.name", "file.mtime", "file.ctime", "file.folder"])]);

  /** The view's filter as one group: none is an empty "all of", a lone expression a group of one. */
  const group = $derived.by((): Group => {
    const f = view.filters;
    if (f === null || f === undefined) return { op: "and", items: [] };
    if (typeof f === "string") return { op: "and", items: [f] };
    const op = Object.keys(f)[0] as Group["op"];
    return { op, items: (f as Record<string, Filter[]>)[op] ?? [] };
  });
  const setFilter = (g: Group) => void onedit({ op: "filters", filters: g.items.length ? ({ [g.op]: g.items } as Filter) : null });

  const setSort = (sort: SortKey[]) => void onedit({ op: "sort", sort });
  let sortBy = $state("");
  const move = (i: number, by: number) => {
    const c = [...columns], j = i + by;
    if (j < 0 || j >= c.length) return;
    [c[i], c[j]] = [c[j], c[i]];
    void onedit({ op: "order", columns: c });
  };
  const label = (id: string) => view.columns.find((c) => c.id === id)?.label ?? id;

  // svelte-ignore state_referenced_locally -- seeded here, then kept in step by the effect below
  let name = $state(view.name);
  let nameBox = $state<HTMLInputElement>();
  // follows the view's name when it changes (a rename, another view) — not while it is being typed: the reload an
  // earlier edit triggers (500 ms after its file event) reset the box mid-word and Enter then renamed nothing
  // svelte-ignore state_referenced_locally -- the name last shown; the effect below follows later ones
  let shownName = view.name;
  $effect(() => { const n = view.name; if (n !== shownName) { shownName = n; if (document.activeElement !== nameBox) name = n; } });
  async function rename() {
    const n = name.trim();
    if (!n || n === view.name) return;
    await onedit({ op: "rename", name: n });
    onrenamed(n);
  }
  async function duplicate() {
    const n = `${view.name} (copy)`;
    await onedit({ op: "duplicate", name: n });
    onrenamed(n);
  }
</script>

<div class="editor" role="dialog" aria-label="View settings: {view.name}">
  <header>
    <strong>View settings</strong>
    <button type="button" class="icon-btn" aria-label="Close" title="Close" onclick={onclose}><Icon name="close" size={13} /></button>
  </header>

  <section>
    <h4>Filter</h4>
    <p class="hint">Which notes this view shows (the base's own filter applies too).</p>
    <BaseFilterGroup {group} {properties} onchange={setFilter} />
  </section>

  <section>
    <h4>Sort</h4>
    {#each view.sort as k, i (k.property + i)}
      <div class="row">
        <span class="grow">{label(k.property)}</span>
        <select aria-label="Direction of {k.property}" value={k.direction}
          onchange={(e) => setSort(view.sort.map((x, j) => (j === i ? { ...x, direction: e.currentTarget.value as SortKey["direction"] } : x)))}>
          <option value="ASC">ascending</option><option value="DESC">descending</option>
        </select>
        <button type="button" class="icon-btn" aria-label="No sort by {k.property}" title="Remove" onclick={() => setSort(view.sort.filter((_, j) => j !== i))}><Icon name="close" size={12} /></button>
      </div>
    {/each}
    <div class="row">
      <select aria-label="Sort by" bind:value={sortBy}>
        <option value="">Sort by…</option>
        {#each properties.filter((p) => !view.sort.some((k) => k.property === p)) as p (p)}<option value={p}>{label(p)}</option>{/each}
      </select>
      <button type="button" class="btn" disabled={!sortBy} onclick={() => { setSort([...view.sort, { property: sortBy, direction: "ASC" }]); sortBy = ""; }}>Add</button>
    </div>
  </section>

  <section>
    <h4>Columns</h4>
    {#each columns as c, i (c)}
      <div class="row">
        <span class="grow">{label(c)}</span>
        <button type="button" class="icon-btn" aria-label="Move {label(c)} up" disabled={i === 0} onclick={() => move(i, -1)}><Icon name="arrow-up" size={12} /></button>
        <button type="button" class="icon-btn" aria-label="Move {label(c)} down" disabled={i === columns.length - 1} onclick={() => move(i, 1)}><Icon name="arrow-down" size={12} /></button>
        <button type="button" class="icon-btn" aria-label="Hide {label(c)}" onclick={() => void onedit({ op: "hide", column: c })}><Icon name="close" size={12} /></button>
      </div>
    {/each}
    {#if view.properties.length}
      <div class="row">
        <select aria-label="Show a property" onchange={(e) => { const v = e.currentTarget.value; if (v) void onedit({ op: "show", column: v }); e.currentTarget.value = ""; }}>
          <option value="">Show a property…</option>
          {#each view.properties as p (p)}<option value={p}>{p}</option>{/each}
        </select>
      </div>
    {/if}
  </section>

  <section>
    <h4>View</h4>
    <div class="row">
      <input aria-label="View name" bind:this={nameBox} bind:value={name} onkeydown={(e) => { if (e.key === "Enter") void rename(); }} onblur={() => void rename()} />
      <button type="button" class="btn btn-ghost" onclick={() => void duplicate()}>Duplicate</button>
      <button type="button" class="btn btn-ghost danger" disabled={views <= 1} title={views <= 1 ? "A base keeps at least one view" : "Delete this view"}
        onclick={() => void onedit({ op: "remove" }).then(onclose)}>Delete</button>
    </div>
  </section>
</div>

<style>
  .editor { display: flex; flex-direction: column; gap: 14px; width: min(520px, calc(100vw - 32px)); max-height: min(70vh, 640px); overflow-y: auto; padding: 12px 14px;
    background: var(--bg-elev); border: 1px solid var(--border-strong); border-radius: var(--radius-lg); box-shadow: var(--shadow-pop);
    font-size: calc(12.5px * var(--ui-scale, 1)); color: var(--text); }
  header { display: flex; align-items: center; justify-content: space-between; }
  h4 { margin: 0 0 6px; font-size: .78em; letter-spacing: .05em; text-transform: uppercase; color: var(--text-muted); }
  .hint { margin: -2px 0 8px; color: var(--text-faint); font-size: .92em; }
  section { display: flex; flex-direction: column; gap: 6px; }
  .row { display: flex; align-items: center; gap: 6px; min-width: 0; }
  .grow { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .row input { flex: 1; min-width: 0; }
  select, input { height: 26px; padding: 0 6px; border-radius: var(--radius-sm); border: 1px solid var(--border); background: var(--bg); color: var(--text); font: inherit; }
  input:focus, select:focus { outline: none; border-color: var(--accent); }
  .danger { color: var(--red); }
</style>
