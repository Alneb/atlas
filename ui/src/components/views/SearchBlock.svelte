<script lang="ts">
  // A live search as a block (`type: search, q: …`) in a note or a .page: the toolsmith drafts one for
  // a search you keep running; results re-run as files change. Click opens at the line.
  import { errText } from "../../lib/text";
  import { shownPath } from "../../lib/paths";
  import { onMount } from "svelte";
  import { api } from "../../lib/api";
  import { on } from "../../lib/bus";
  import { openPath } from "../../lib/dock";
  import type { SearchResult } from "../../lib/types";

  let { src }: { src: string } = $props();
  const query = $derived((/^\s*q:\s*(.+)$/m.exec(src)?.[1] ?? "").trim().replace(/^["'](.*)["']$/, "$1"));
  let res = $state<SearchResult | null>(null);
  let error = $state("");

  async function load() {
    if (!query) { error = "The block needs `q: <text>`."; return; }
    try { res = await api.search(query); error = ""; } catch (e) { error = errText(e); }
  }
  onMount(() => {
    void load();
    let t: ReturnType<typeof setTimeout> | undefined;
    const off = on("fs", () => { clearTimeout(t); t = setTimeout(load, 800); });
    return () => { off(); clearTimeout(t); };
  });
</script>

<div class="search-block">
  <div class="head">Search <b>“{query}”</b>{#if res} · {res.files.length} files, {res.lines.length} lines{/if}</div>
  {#if error}<p class="view-error">{error}</p>
  {:else if res}
    <ul>
      {#each res.files.slice(0, 8) as f (f)}<li><button onclick={() => openPath(f)}>{f}</button></li>{/each}
      {#each res.lines.slice(0, 20) as h (`${h.path}:${h.line}`)}
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
  li button { display: block; width: 100%; text-align: left; padding: 3px 6px; border-radius: var(--radius-sm); color: var(--text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  li button:hover { background: var(--bg-hover); }
  .p { color: var(--accent); font-family: var(--font-mono); font-size: .9em; }
</style>
