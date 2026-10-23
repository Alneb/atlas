<script lang="ts">
  // The `tree` view: notes nested under the note their `by` property names (default `up`) — a
  // hierarchy made of properties, not folders. A note whose parent is not among the rows is a root.
  import type { ViewRow } from "../../lib/gen/ViewRow";
  import { openPath } from "../../lib/dock";

  let { rows, by = "up" }: { rows: ViewRow[]; by?: string } = $props();
  interface Node { row: ViewRow; children: Node[] }

  const roots = $derived.by(() => {
    const nodes = new Map(rows.filter((r) => r.path).map((r) => [r.path!, { row: r, children: [] } as Node]));
    const top: Node[] = [];
    for (const n of nodes.values()) {
      const parent = nodes.get(n.row.props[by] ?? "");
      // a note that names itself (or a cycle's first link) stays a root rather than vanish
      if (parent && parent !== n && !under(n, parent)) parent.children.push(n); else top.push(n);
    }
    const sort = (list: Node[]) => { list.sort((a, b) => a.row.title.localeCompare(b.row.title)); list.forEach((n) => sort(n.children)); return list; };
    return sort(top);
  });
  function under(ancestor: Node, n: Node): boolean { return ancestor.children.some((c) => c === n || under(c, n)); }
  let closed = $state(new Set<string>());
  const toggle = (p: string) => { const s = new Set(closed); if (s.has(p)) s.delete(p); else s.add(p); closed = s; };
</script>

{#snippet branch(list: Node[])}
  <ul>
    {#each list as n (n.row.path)}
      {@const p = n.row.path!}
      <li>
        <div class="row">
          {#if n.children.length}
            <button class="twist" class:closed={closed.has(p)} onclick={() => toggle(p)} aria-label="{closed.has(p) ? 'Expand' : 'Collapse'} {n.row.title}" aria-expanded={!closed.has(p)}>▾</button>
          {:else}<span class="twist leaf"></span>{/if}
          <button class="title" onclick={() => openPath(p)} title={p}>{n.row.title}</button>
          {#if n.children.length}<span class="n">{n.children.length}</span>{/if}
          {#if n.row.date}<span class="date">{n.row.date}</span>{/if}
        </div>
        {#if n.children.length && !closed.has(p)}{@render branch(n.children)}{/if}
      </li>
    {/each}
  </ul>
{/snippet}

{#if !rows.length}<p class="empty">Nothing here yet.</p>{:else}<div class="tree">{@render branch(roots)}</div>{/if}

<style>
  .tree { padding: 4px 0; }
  ul { list-style: none; margin: 0; padding: 0; }
  ul ul { margin-left: 11px; padding-left: 9px; border-left: 1px solid var(--border); }
  .row { display: flex; align-items: baseline; gap: 4px; padding: 2px 6px; border-radius: 4px; }
  .row:hover { background: var(--bg-hover); }
  .twist { flex: none; width: 16px; color: var(--text-faint); font-size: .8em; transition: transform .12s; }
  .twist.closed { transform: rotate(-90deg); }
  .twist:not(.leaf):hover { color: var(--text); }
  .title { flex: 1; min-width: 0; text-align: left; color: var(--text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .title:hover { color: var(--accent); }
  .n, .date { color: var(--text-faint); font-size: .86em; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .empty { color: var(--text-faint); padding: 6px 10px; margin: 0; }
  @media (prefers-reduced-motion: reduce) { .twist { transition: none; } }
</style>
