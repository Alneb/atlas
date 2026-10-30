<script lang="ts">
  // The filter popover's content, Obsidian's two scopes: "All views" edits the base's own `filters` (every view applies
  // them), "This view" the open view's. Each change is written at once and the table redrawn.
  import FilterGroup from "./FilterGroup.svelte";
  import { asGroup, countConditions, topFilter, type FieldType } from "../../lib/base-filter";
  import type { Filter } from "../../lib/gen/Filter";
  import type { ViewEdit } from "../../lib/gen/ViewEdit";

  let { base, view, viewName, props, typeOf, onedit }: {
    base: Filter | null;
    view: Filter | null;
    viewName: string;
    props: { id: string; label: string }[];
    typeOf: (id: string) => FieldType;
    onedit: (e: ViewEdit) => void;
  } = $props();

  type Scope = "view" | "all";
  let scope = $state<Scope>("view");
  const tabs = $derived([
    { id: "all" as Scope, label: "All views", n: countConditions(base) },
    { id: "view" as Scope, label: "This view", n: countConditions(view) },
  ]);
</script>

<div class="scopes" role="tablist" aria-label="Which notes the filter applies to">
  {#each tabs as t (t.id)}
    <button type="button" role="tab" class:on={scope === t.id} aria-selected={scope === t.id} onclick={() => (scope = t.id)}>
      {t.label}{#if t.n}<span class="n">{t.n}</span>{/if}
    </button>
  {/each}
</div>
<p class="hint">{scope === "all" ? "Every view of this base shows only the notes these let in." : `Only “${viewName}”; the filters of all views apply too.`}</p>
{#key scope}
  {#if scope === "all"}
    <FilterGroup group={asGroup(base)} {props} {typeOf} onchange={(g) => onedit({ op: "base_filters", filters: topFilter(g) })} />
  {:else}
    <FilterGroup group={asGroup(view)} {props} {typeOf} onchange={(g) => onedit({ op: "filters", filters: topFilter(g) })}
      empty={countConditions(base) ? "No filters of its own: the view shows every note the filters of all views let in." : "No filters: every note is in."} />
  {/if}
{/key}

<style>
  .scopes { display: flex; gap: 2px; padding: 2px; border-radius: var(--radius-sm); background: var(--bg-alt); border: 1px solid var(--border); margin-bottom: 6px; }
  .scopes button { flex: 1; display: inline-flex; align-items: center; justify-content: center; gap: 6px; height: 26px; border-radius: 5px; color: var(--text-muted); }
  .scopes button:hover { color: var(--text); }
  .scopes button.on { background: var(--bg-elev); color: var(--text); box-shadow: var(--shadow-sm, none); border: 1px solid var(--border); }
  .n { font-size: .85em; font-variant-numeric: tabular-nums; color: var(--accent); background: var(--accent-soft); padding: 0 6px; border-radius: 99px; }
  .hint { margin: 0 0 8px; color: var(--text-faint); font-size: .92em; }
</style>
