<script lang="ts">
  // The explorer's Places column (lib/explorer/places.svelte.ts): a group per source, its places; the one shown marked,
  // a remote place's dot connected or not. Hidden under 620 px, where the bar's Places button is a menu of the same.
  import Icon from "../Icon.svelte";
  import { vaultSource } from "../../lib/file-sources.svelte";
  import { openSettingsAt, pluginPageId } from "../../lib/settings-nav.svelte";
  import type { PlaceGroup } from "../../lib/explorer/places.svelte";
  import type { Loc } from "../../lib/explorer/browse.svelte";

  let { groups, loc, onpick }: { groups: PlaceGroup[]; loc: Loc; onpick: (to: Loc) => void } = $props();
</script>

<nav class="places" aria-label="Places">
  {#each groups.filter((g) => g.list.length || g.error || !g.src.hideEmpty) as g (g.src.id)}
    <div class="group">
      <div class="group-title">{g.src.title}</div>
      {#each g.list as p (p.id)}
        <button class="place" class:on={loc.source === g.src.id && loc.place === p.id} title={p.detail ?? p.title}
          onclick={() => onpick({ source: g.src.id, place: p.id, path: "" })}>
          <Icon name={g.src.icon} size={14} />
          <span class="label">{p.title}</span>
          {#if p.up !== undefined && g.src.id !== vaultSource.id}<span class="dot" class:up={p.up} title={p.up ? "connected" : "not connected"}></span>{/if}
        </button>
      {:else}
        {#if g.loading || g.error}<div class="place-note" class:error={!g.loading && !!g.error} title={g.error}>{g.loading ? "…" : g.error}</div>
        {:else}<div class="place-note">none yet: <button class="link" onclick={() => openSettingsAt(pluginPageId(g.src.id))}>add some in its settings</button></div>{/if}
      {/each}
    </div>
  {/each}
</nav>

<style>
  button { font: inherit; color: inherit; background: transparent; border: 0; cursor: pointer; }
  .places { flex: none; width: 190px; overflow: auto; padding: 8px 6px; border-right: 1px solid var(--border); background: var(--bg); }
  .group + .group { margin-top: 10px; }
  .group-title { font-size: calc(11px * var(--ui-scale, 1)); text-transform: uppercase; letter-spacing: .06em; color: var(--text-faint); font-weight: 600; padding: 2px 8px 4px; }
  .place { display: flex; align-items: center; gap: 7px; width: 100%; padding: 4px 8px; border-radius: var(--radius-sm); color: var(--text-muted); text-align: left; }
  .place:hover { background: var(--bg-hover); color: var(--text); }
  .place.on { background: var(--accent-soft); color: var(--text); }
  .place:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
  .place .label { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .place-note { color: var(--text-faint); font-size: calc(12px * var(--ui-scale, 1)); padding: 2px 8px; }
  /* a source's error can be a long exception: three lines here, the whole of it on hover */
  .place-note.error { color: var(--red); display: -webkit-box; -webkit-line-clamp: 3; line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; overflow-wrap: anywhere; }
  .place-note .link { padding: 0; color: var(--accent); font-size: inherit; text-align: left; }
  .place-note .link:hover { text-decoration: underline; }
  .dot { width: 7px; height: 7px; border-radius: 50%; background: var(--border-strong); flex: none; }
  .dot.up { background: var(--green); }
  @container (max-width: 700px) { .places { display: none; } }
  @media (pointer: coarse) { .place { padding: 10px 8px; } }
</style>
