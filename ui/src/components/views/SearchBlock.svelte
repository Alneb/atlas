<script lang="ts">
  // A live search as a block (`type: search, q: …`) in a note or a .page: the toolsmith drafts one for
  // a search you keep running; results re-run as files change. Click opens at the line.
  import { errText } from "../../lib/text";
  import { reloadOnChange } from "../../lib/reload-on-change";
  import { shownPath } from "../../lib/paths";
  import { onMount } from "svelte";
  import { api } from "../../lib/api";
  import { openPath } from "../../lib/dock";
  import type { SearchResult } from "../../lib/types";
  let box = $state<HTMLElement>();

  /** `doc`: the note holding the block — its own `q:` line is not a hit */
  let { src, doc = "" }: { src: string; doc?: string } = $props();
  const query = $derived((/^\s*q:\s*(.+)$/m.exec(src)?.[1] ?? "").trim().replace(/^["'](.*)["']$/, "$1"));
  let res = $state<SearchResult | null>(null);
  const lines = $derived((res?.lines ?? []).filter((h) => !(h.path === doc && /^\s*q:/.test(h.text))));
  let error = $state("");

  async function load() {
    if (!query) { error = "The block needs `q: <text>`."; return; }
    try { res = await api.search(query); error = ""; } catch (e) { error = errText(e); }
  }
  onMount(() => {
    void load();
    return reloadOnChange(() => void load(), { wait: 800, host: () => box });
  });
</script>

<div class="search-block" bind:this={box}>
  <div class="head">Search <b>“{query}”</b>{#if res} · {res.files.length} files, {lines.length} lines{/if}</div>
  {#if error}<p class="view-error">{error}</p>
  {:else if res}
    <ul>
      {#each res.files.slice(0, 8) as f (f)}<li><button onclick={() => openPath(f)} title={f}>{shownPath(f)}</button></li>{/each}
      {#each lines.slice(0, 20) as h (`${h.path}:${h.line}`)}
        <li><button onclick={() => openPath(h.path, h.line)}><span class="p">{shownPath(h.path)}:{h.line}</span> {h.text.trim().slice(0, 140)}</button></li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .search-block { font-size: calc(13px * var(--ui-scale, 1)); }
  .head { color: var(--text-muted); margin-bottom: 4px; }
  .head b { color: var(--text); }
  ul { list-style: none; margin: 0; padding: 0; }
  ul > li { margin: 0; } /* in a note: not the markdown list's spacing */
  li button { display: block; width: 100%; text-align: left; padding: 3px 6px; border-radius: var(--radius-sm); color: var(--text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  li button:hover { background: var(--bg-hover); }
  .p { color: var(--accent); font-family: var(--font-mono); font-size: .9em; }
</style>
