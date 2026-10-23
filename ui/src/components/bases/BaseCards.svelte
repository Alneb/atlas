<script lang="ts">
  // A Bases view as cards (Obsidian's cards view): a grid of notes, each its name and the view's other columns as
  // labelled values (lists as chips), its picture on top when the view names an `image` property; in groups when the
  // view has a `groupBy`. Click a card to open its note.
  import CellValue from "./CellValue.svelte";
  import { openPath } from "../../lib/dock";
  import { shownName } from "../../lib/paths";
  import { context, setHover } from "../../lib/context.svelte";
  import { groupRows } from "../../lib/base-groups";
  import { blobUrl, thumbUrl } from "../../lib/raw";
  import type { BaseView } from "../../lib/gen/BaseView";

  let { view }: { view: BaseView } = $props();

  const hoverIn = (p: string) => setHover({ path: p, source: "base" });
  const hoverOut = () => { if (context.hover?.source === "base") setHover(null); };
  const lit = (p: string) => context.hover?.path === p && context.hover.source !== "base";
  const nameAt = $derived(view.columns.findIndex((c) => c.id === "file.name"));
  const groups = $derived(groupRows(view));
  // a vault picture through the API (its header-guarded routes give blob: URLs), downscaled where the core can
  const src = (img: string): Promise<string> =>
    /^https?:\/\//.test(img) ? Promise.resolve(img) : /\.svg$/i.test(img) ? blobUrl(img) : thumbUrl(img, 480).catch(() => blobUrl(img));
</script>

<div class="scroll">
{#each groups as g (g.title)}
{#if g.title !== null}<h3 class="group">{g.title}<span class="n">{g.rows.length}</span></h3>{/if}
<div class="cards">
  {#each g.rows as r (r.path)}
    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
    <article class="card" class:lit={lit(r.path)} onmouseenter={() => hoverIn(r.path)} onmouseleave={hoverOut} onclick={() => openPath(r.path)}>
      {#if view.image}
        <div class="cover">{#if r.image}{#await src(r.image) then u}<img src={u} alt="" loading="lazy" />{/await}{/if}</div>
      {/if}
      <button type="button" class="title" onclick={(e) => { e.stopPropagation(); openPath(r.path); }}>{nameAt >= 0 && r.cells[nameAt].t === "link" ? r.cells[nameAt].text : shownName(r.path)}</button>
      {#each r.cells as c, i (i)}
        {#if i !== nameAt && c.t !== "null"}
          <div class="prop"><span class="k">{view.columns[i].label}</span><span class="v"><CellValue cell={c} /></span></div>
        {/if}
      {/each}
    </article>
  {/each}
</div>
{/each}
{#if !view.rows.length}<p class="empty">No notes match this view.</p>{/if}
</div>

<style>
  .scroll { overflow: auto; min-height: 0; flex: 1; }
  .cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 10px; padding: 10px; align-content: start; }
  .group { margin: 10px 12px 0; font-size: 1em; color: var(--heading, var(--text)); }
  .group .n { margin-left: 8px; color: var(--text-faint); font-weight: 400; font-size: .88em; }
  /* the picture bleeds to the card's edges, as Obsidian's covers */
  .cover { margin: -10px -12px 4px; aspect-ratio: 16 / 9; background: var(--bg-alt); border-bottom: 1px solid var(--border); border-radius: var(--radius) var(--radius) 0 0; overflow: hidden; }
  .cover img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .card { display: flex; flex-direction: column; gap: 4px; padding: 10px 12px; border: 1px solid var(--border); border-radius: var(--radius); background: var(--bg-elev); cursor: pointer; min-width: 0; }
  .card:hover { border-color: var(--border-strong); }
  .card.lit { border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent); }
  .title { font: inherit; font-weight: 600; color: var(--heading, var(--text)); text-align: left; padding: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .title:hover { text-decoration: underline; }
  .prop { display: flex; gap: 8px; align-items: baseline; min-width: 0; font-size: .92em; }
  .k { flex: none; color: var(--text-faint); }
  .v { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text-muted); }
  .empty { color: var(--text-faint); padding: 10px; margin: 0; }
</style>
