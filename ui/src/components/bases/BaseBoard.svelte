<script lang="ts">
  // A board view: the notes in lanes by the view's `groupBy` property; dragging a card to another lane rewrites that
  // property of the note (`onwrite`). Double-click a card to open it.
  import CellValue from "./CellValue.svelte";
  import { openPath } from "../../lib/dock";
  import { context, setHover } from "../../lib/context.svelte";
  import { groupRows, NO_VALUE as NONE } from "../../lib/base-groups";
  import type { BaseView } from "../../lib/gen/BaseView";

  let { view, onwrite }: { view: BaseView; onwrite: (path: string, key: string, value: unknown) => void } = $props();

  const hoverIn = (p: string) => setHover({ path: p, source: "base" });
  const hoverOut = () => { if (context.hover?.source === "base") setHover(null); };
  const lit = (p: string) => context.hover?.path === p && context.hover.source !== "base";

  const lanes = $derived(groupRows(view).map((g) => [g.title ?? NONE, g.rows] as const));
  let dragging = $state<string | null>(null);
  let overLane = $state<string | null>(null);
  function dropOn(lane: string) {
    const p = dragging;
    dragging = overLane = null;
    if (!p || !view.group_key) return;
    const row = view.rows.find((r) => r.path === p);
    if (!row || (row.group || NONE) === lane) return;
    onwrite(p, view.group_key, lane === NONE ? null : lane);
  }
</script>

<div class="board">
  {#each lanes as [lane, cards] (lane)}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <section class="lane" class:over={overLane === lane} aria-label="{view.group_by}: {lane}"
      ondragover={(e) => { if (dragging && view.group_key) { e.preventDefault(); overLane = lane; } }}
      ondragleave={(e) => { if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) overLane = null; }}
      ondrop={(e) => { e.preventDefault(); dropOn(lane); }}>
      <header><span class="lane-name">{lane}</span><span class="n">{cards.length}</span></header>
      {#each cards as r (r.path)}
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <article class="card" class:lit={lit(r.path)} onmouseenter={() => hoverIn(r.path)} onmouseleave={hoverOut} draggable={!!view.group_key}
          ondragstart={(e) => { dragging = r.path; e.dataTransfer?.setData("text/plain", r.path); }}
          ondragend={() => (dragging = overLane = null)} ondblclick={() => openPath(r.path)}>
          {#each r.cells as c, i (i)}
            {#if view.columns[i].id === "file.name"}<div class="card-title"><CellValue cell={c} /></div>
            {:else if c.t !== "null" && view.columns[i].id !== view.group_by && view.columns[i].key !== view.group_key}
              <div class="card-prop"><span class="k">{view.columns[i].label}</span> <CellValue cell={c} /></div>{/if}
          {/each}
        </article>
      {/each}
    </section>
  {:else}
    <p class="empty">No notes match this view.</p>
  {/each}
</div>

<style>
  .board { display: flex; gap: 10px; align-items: flex-start; padding: 10px; overflow: auto; min-height: 0; flex: 1; }
  .lane { flex: 0 0 240px; background: var(--bg-alt); border: 1px solid var(--border); border-radius: 8px; padding: 6px; display: flex; flex-direction: column; gap: 6px; min-height: 80px; }
  .lane.over { border-color: var(--accent); background: var(--accent-soft); }
  .lane header { display: flex; gap: 6px; align-items: baseline; padding: 2px 4px 4px; font-weight: 600; color: var(--heading); }
  .lane .n { color: var(--text-faint); font-weight: 400; font-size: .88em; }
  .card { background: var(--bg-elev); border: 1px solid var(--border); border-radius: 6px; padding: 6px 8px; cursor: grab; display: flex; flex-direction: column; gap: 2px; }
  .card:hover { border-color: var(--border-strong); }
  .card.lit { border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent); }
  .card-title { font-weight: 500; }
  .card-prop { font-size: .88em; color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .card-prop .k { color: var(--text-faint); }
  .empty { color: var(--text-faint); padding: 10px; margin: 0; }
</style>
