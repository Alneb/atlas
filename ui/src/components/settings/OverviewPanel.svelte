<script lang="ts">
  // "What can Atlas do?": one card per area — its features (with shortcuts) and how many of its
  // options you changed. A card opens that page.
  import Icon from "../Icon.svelte";
  import { actions } from "../../lib/actions";
  import { keysOf } from "../../lib/keymap.svelte";
  import { chordLabel } from "../../lib/keys";
  import { pageDef, type Placed } from "../../lib/settings-pages";
  import { isModified } from "../../lib/settings-schema";
  import { renderInlineMarkdown } from "../../lib/markdown";
  import { api } from "../../lib/api";

  let { pages, go }: { pages: Placed[]; go: (id: string) => void } = $props();
  const cards = $derived(pages.filter((p) => p.page !== "overview"));
  // which Atlas this is: the core's version and plugin API, and the interface's build (it may be newer than the core)
  let version = $state<{ version: string; api: number; ui: string } | null>(null);
  $effect(() => { void api.version().then((v) => (version = v), () => {}); });
  const feats = (id: string) => (pageDef(id)?.features ?? []).flatMap((f) => { const a = actions.find((x) => x.id === f); return a ? [a] : []; });
</script>

{#if version}<p class="version" data-testid="atlas-version">Atlas <b>{version.version}</b> · plugin API {version.api}{#if version.ui} · interface build <code>{version.ui}</code>{/if}</p>{/if}
<section class="cards" aria-label="Areas">
  {#each cards as p (p.page)}
    {@const changed = p.fields.filter(isModified).length}
    <button class="card" onclick={() => go(p.page)}>
      <span class="h"><Icon name={p.icon} size={15} /> <b>{p.title}</b>{#if changed}<span class="ch">{changed} changed</span>{/if}</span>
      {#if p.blurb}<span class="b" title={p.blurb.replaceAll("`", "")}>{@html renderInlineMarkdown(p.blurb)}</span>{/if}
      {#if feats(p.page).length}
        <span class="f">{#each feats(p.page).slice(0, 4) as a (a.id)}{@const k = keysOf(a.id)}<span>{a.title.replace(/\s*\(.*\)$/, "")}{#if k} <kbd class="keys-only">{chordLabel(k).join(" ")}</kbd>{/if}</span>{/each}</span>
      {/if}
      <span class="m">{p.fields.length ? `${p.fields.length} options` : ""}</span>
    </button>
  {/each}
</section>

<style>
  .version { margin: 0 0 10px; color: var(--text-muted); font-size: calc(12.5px * var(--ui-scale, 1)); }
  .version b { color: var(--text); font-weight: 600; }
  .cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 10px; }
  .card { display: flex; flex-direction: column; gap: 6px; align-items: stretch; text-align: left; padding: 12px 14px; border: 1px solid var(--border); border-radius: var(--radius); background: var(--bg); }
  .card:hover { border-color: var(--accent); }
  .h { display: flex; gap: 8px; align-items: center; color: var(--heading); }
  .ch { margin-left: auto; color: var(--accent); font-size: calc(11px * var(--ui-scale, 1)); }
  /* a summary: three lines here, the whole text at the top of the page itself */
  .b { color: var(--text-muted); font-size: calc(12.5px * var(--ui-scale, 1)); display: -webkit-box; -webkit-line-clamp: 3; line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
  .f { display: flex; flex-direction: column; gap: 2px; font-size: calc(12px * var(--ui-scale, 1)); color: var(--text); }
  kbd { font-family: var(--font-mono); font-size: calc(10.5px * var(--ui-scale, 1)); color: var(--text-faint); }
  .m { margin-top: auto; color: var(--text-faint); font-size: calc(11px * var(--ui-scale, 1)); }
</style>
