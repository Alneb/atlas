<script lang="ts">
  // A board view: the notes in lanes by the view's `groupBy` property; dragging a card to another lane rewrites that
  // property of the note (`onwrite`). Double-click a card (or Enter on it) to open it; Alt+←/→ moves it a lane over.
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
    if (p) moveTo(p, lane);
  }
  function moveTo(p: string, lane: string) {
    if (!view.group_key) return;
    const row = view.rows.find((r) => r.path === p);
    if (!row || (row.group || NONE) === lane) return;
    onwrite(p, view.group_key, lane === NONE ? null : lane);
  }
  function cardKey(e: KeyboardEvent, p: string, at: number) {
    if (e.key === "Enter") { e.preventDefault(); openPath(p); }
    else if (e.altKey && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
      const to = lanes[at + (e.key === "ArrowLeft" ? -1 : 1)];
      if (!to) return;
      e.preventDefault();
      refocus = p;
      moveTo(p, to[0]);
    }
  }
  // the moved card comes back in its new lane when the view reloads: the focus follows it there
  let refocus: string | null = null;
  let board = $state<HTMLElement>();
  $effect(() => {
    void lanes;
    if (!refocus) return;
    board?.querySelector<HTMLElement>(`.card[data-path="${CSS.escape(refocus)}"]`)?.focus();
    refocus = null;
  });
</script>

<div class="board" bind:this={board}>
  {#each lanes as [lane, cards], at (lane)}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <section class="lane" class:over={overLane === lane} aria-label="{view.group_by}: {lane}"
      ondragover={(e) => { if (dragging && view.group_key) { e.preventDefault(); overLane = lane; } }}
      ondragleave={(e) => { if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) overLane = null; }}
      ondrop={(e) => { e.preventDefault(); dropOn(lane); }}>
      <header><span class="lane-name">{lane}</span><span class="n">{cards.length}</span></header>
      {#each cards as r (r.path)}
        <!-- a card is the button that opens its note (Enter; Alt+arrows move it between lanes) -->
        <div role="button" class="card" class:lit={lit(r.path)} onmouseenter={() => hoverIn(r.path)} onmouseleave={hoverOut} draggable={!!view.group_key}
          tabindex="0" data-path={r.path} aria-label="{r.path}{view.group_key ? ' (Enter opens, Alt+arrows move it)' : ''}" onkeydown={(e) => cardKey(e, r.path, at)}
          ondragstart={(e) => { dragging = r.path; e.dataTransfer?.setData("text/plain", r.path); }}
          ondragend={() => (dragging = overLane = null)} ondblclick={() => openPath(r.path)}>
          {#each r.cells as c, i (i)}
            {#if view.columns[i].id === "file.name"}<div class="card-title"><CellValue cell={c} /></div>
            {:else if c.t !== "null" && view.columns[i].id !== view.group_by && view.columns[i].key !== view.group_key}
              <div class="card-prop"><span class="k">{view.columns[i].label}</span> <CellValue cell={c} /></div>{/if}
          {/each}
        </div>
      {/each}
    </section>
  {:else}
    <p class="empty">No notes match this view.</p>
  {/each}
</div>

<style>
  .board { display: flex; gap: 10px; align-items: flex-start; padding: 10px; overflow: auto; min-height: 0; flex: 1; }
  .lane { flex: 0 0 240px; background: var(--bg-alt); border: 1px solid var(--border); border-radius: var(--radius); padding: 6px; display: flex; flex-direction: column; gap: 6px; min-height: 80px; }
  .lane.over { border-color: var(--accent); background: var(--accent-soft); }
  .lane header { display: flex; gap: 6px; align-items: baseline; padding: 2px 4px 4px; font-weight: 600; color: var(--heading, var(--text)); }
  .lane .n { color: var(--text-faint); font-weight: 400; font-size: .88em; }
  .card { background: var(--bg-elev); border: 1px solid var(--border); border-radius: 6px; padding: 6px 8px; cursor: grab; display: flex; flex-direction: column; gap: 2px; }
  .card:hover { border-color: var(--border-strong); }
  .card:focus-visible { outline: 2px solid var(--accent); outline-offset: -1px; }
  .card.lit { border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent); }
  /* a card's name reads as the cards view's title, not as a link among the values */
  .card-title { font-weight: 600; color: var(--heading, var(--text)); min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .card-title :global(.link) { color: inherit; }
  .card-prop { font-size: .88em; color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .card-prop .k { color: var(--text-faint); }
  .empty { color: var(--text-faint); padding: 10px; margin: 0; }
</style>
