<script lang="ts">
  // A Bases view as a list (Obsidian's list view, and a table too narrow for its columns): one row per note — its name,
  // the other values faint after it, a date at the end (in the table's words). Click opens the note.
  import Icon from "../Icon.svelte";
  import CellValue from "./CellValue.svelte";
  import { openPath } from "../../lib/dock";
  import { shownName } from "../../lib/paths";
  import { context, setHover } from "../../lib/context.svelte";
  import { groupRows } from "../../lib/base-groups";
  import type { BaseView } from "../../lib/gen/BaseView";
  import type { BaseCell } from "../../lib/gen/BaseCell";

  let { view }: { view: BaseView } = $props();

  const hoverIn = (p: string) => setHover({ path: p, source: "base" });
  const hoverOut = () => { if (context.hover?.source === "base") setHover(null); };
  const lit = (p: string) => context.hover?.path === p && context.hover.source !== "base";
  const ISO = /^\d{4}-\d{2}-\d{2}/;
  const text = (c: BaseCell): string => {
    switch (c.t) {
      case "null": return "";
      case "bool": return c.value ? "✓" : "";
      case "num": return String(c.value);
      case "text": return c.value;
      case "link": case "date": return c.text;
      case "list": return c.items.map(text).join(", ");
    }
  };
  const isDate = (c: BaseCell) => c.t === "date" || (c.t === "text" && ISO.test(c.value) && c.value.length <= 30);
  const groups = $derived(groupRows(view));
  const lead = (cells: BaseCell[]) => cells[Math.max(0, view.columns.findIndex((c) => c.id === "file.name"))];
</script>

<ul class="rows">
  {#each groups as g (g.title)}
  {#if g.title !== null}<li class="group">{g.title}<span class="n">{g.rows.length}</span></li>{/if}
  {#each g.rows as r (r.path)}
    {@const first = lead(r.cells)}
    {@const when = r.cells.find((c) => c !== first && isDate(c))}
    {@const rest = r.cells.filter((c) => c !== first && c !== when).map(text).filter(Boolean)}
    <li><button type="button" class="row" class:lit={lit(r.path)} onclick={() => openPath(r.path)} onmouseenter={() => hoverIn(r.path)} onmouseleave={hoverOut} title={[text(first), ...rest].join(" · ")}>
      <Icon name={/\.md$/i.test(r.path) ? "file-text" : "file"} size={14} />
      <span class="lead">{text(first) || shownName(r.path)}</span>
      {#if rest.length}<span class="rest">{rest.join(" · ")}</span>{/if}
      {#if when}<span class="when"><CellValue cell={when} /></span>{/if}
    </button></li>
  {/each}
  {/each}
  {#if !view.rows.length}<li class="empty">No notes match this view.</li>{/if}
</ul>

<style>
  .rows { list-style: none; margin: 0; padding: 0 2px 4px; overflow: auto; min-height: 0; flex: 1; }
  .rows > li { margin: 0; } /* inside a note, not the markdown list's spacing */
  .row { display: flex; align-items: center; gap: 8px; width: 100%; padding: 6px 8px; border-radius: 6px; font: inherit; color: var(--text); text-align: left; min-width: 0; }
  .row:hover, .row.lit { background: var(--bg-hover); }
  .row :global(.icon) { color: var(--text-faint); flex: none; }
  .lead { flex: 0 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .rest { flex: 1 1 0; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text-faint); font-size: .92em; }
  .when { flex: none; margin-left: auto; color: var(--text-faint); font-size: .9em; font-variant-numeric: tabular-nums; }
  .empty { color: var(--text-faint); padding: 10px; }
  .group { padding: 10px 8px 4px; font-weight: 600; color: var(--heading, var(--text)); }
  .group .n { margin-left: 8px; color: var(--text-faint); font-weight: 400; font-size: .88em; }
</style>
