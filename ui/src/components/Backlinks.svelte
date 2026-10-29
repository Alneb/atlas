<script lang="ts">
  // "Linked mentions" footer under a note (Obsidian's backlinks): the notes that link to it,
  // grouped by note, each with its line. Hidden when nothing links here.
  import { errText } from "../lib/text";
  import { loadRaw, saveRaw } from "../lib/prefs";
  import { reloadOnChange } from "../lib/reload-on-change";
  import { shownName, basename } from "../lib/paths";
  import { onMount } from "svelte";
  import { api } from "../lib/api";
  import { openPath } from "../lib/dock";
  import { toast } from "../lib/state.svelte";
  import type { Backlink } from "../lib/types";
  import Icon from "./Icon.svelte";
  let box = $state<HTMLElement>();

  let { path }: { path: string } = $props();
  let links = $state<Backlink[]>([]);
  let unlinked = $state<Backlink[]>([]);
  const KEY = "atlas.backlinks.open";
  let expanded = $state(readOpen());

  function readOpen(): boolean {
    return loadRaw(KEY) === "1"; // folded until asked
  }
  function toggle() {
    expanded = !expanded;
    saveRaw(KEY, expanded ? "1" : "0");
  }

  async function load() {
    try { const b = await api.backlinks(path); links = b.links; unlinked = b.unlinked; } catch { links = []; unlinked = []; }
  }

  /** Turn the mention into `[[name]]` in its note (the core edits that one line). */
  async function link(u: Backlink) {
    try { await api.linkMention({ source: u.source, line: u.line, target: path }); await load(); }
    catch (e) { toast("Could not link the mention", errText(e), "error"); }
  }

  const groups = $derived.by(() => {
    const m = new Map<string, Backlink[]>();
    for (const l of links) m.set(l.source, [...(m.get(l.source) ?? []), l]);
    return [...m];
  });
  /** Typed links: the notes that name this one as the value of a property (`up: "[[This]]"`). */
  const typed = $derived.by(() => {
    const m = new Map<string, Set<string>>();
    for (const l of links) if (l.relation) m.set(l.relation, (m.get(l.relation) ?? new Set()).add(l.source));
    return [...m].map(([relation, set]) => ({ relation, notes: [...set].sort() })).sort((a, b) => a.relation.localeCompare(b.relation));
  });
  const stem = (p: string) => basename(p).replace(/\.md$/i, ""); // a link target
  const folder = (p: string) => (p.includes("/") ? p.slice(0, p.lastIndexOf("/")) : "");
  /** The context split around its links (or after a frontmatter `key: `) for highlighting. */
  const parts = (s: string) => {
    const fm = /^([\w -]+): (?!.*\[\[)(.+)$/.exec(s);
    return fm ? [`${fm[1]}: `, fm[2]] : s.split(/(!?\[\[[^\]]*\]\]|!?\[[^\]]*\]\([^)]*\))/);
  };

  onMount(() => {
    void load();
    // the note's own saves never change who links to it (the core leaves a note's links to itself out)
    return reloadOnChange(() => void load(), { wait: 600, wants: (p) => /\.md$/i.test(p) && p !== path, host: () => box });
  });
</script>

{#if links.length || unlinked.length}
  <section class="backlinks" class:open={expanded} bind:this={box}>
    <button class="head" onclick={toggle} aria-expanded={expanded}>
      <Icon name={expanded ? "chevron-down" : "chevron"} size={12} />
      <Icon name="link" size={13} />
      Linked mentions <span class="n">{links.length}</span>
      <span class="from">from {groups.length} note{groups.length === 1 ? "" : "s"}</span>
      {#if unlinked.length}<span class="from">· unlinked <span class="n soft">{unlinked.length}</span></span>{/if}
    </button>
    {#if expanded}
      <div class="list">
        {#each typed as t (t.relation)}
          <div class="typed" title="Notes whose “{t.relation}” property is this note">
            <span class="rel">{t.relation}</span><span class="n soft">{t.notes.length}</span>
            {#each t.notes as n (n)}<button class="chip" onclick={() => openPath(n)} title={n}>{shownName(n)}</button>{/each}
          </div>
        {/each}
        {#each groups as [src, ls] (src)}
          <div class="group">
            <button class="src" onclick={() => openPath(src, ls[0].line)} title={src}>
              <Icon name="file-text" size={13} /><span class="name">{shownName(src)}</span><span class="dir">{folder(src)}</span>
            </button>
            {#each ls as l (l.line + ":" + l.context)}
              <button class="ctx" onclick={() => openPath(src, l.line)} title="Line {l.line}">
                {#each parts(l.context) as p, i}{#if i % 2}<mark>{p}</mark>{:else}{p}{/if}{/each}
              </button>
            {/each}
          </div>
        {/each}
        {#if unlinked.length}
          <h4 class="sub">Unlinked mentions <span class="n soft">{unlinked.length}</span> <span class="hint">— the name appears, but not as a link</span></h4>
          {#each unlinked as u (u.source + ":" + u.line)}
            <div class="urow">
              <button class="ctx" onclick={() => openPath(u.source, u.line)} title="{u.source}:{u.line}"><span class="usrc">{shownName(u.source)}</span> {u.context}</button>
              <button class="linkbtn" onclick={() => link(u)} title="Turn this mention into [[{stem(path)}]]">Link</button>
            </div>
          {/each}
        {/if}
      </div>
    {/if}
  </section>
{/if}

<style>
  .backlinks { flex: none; border-top: 1px solid var(--border); background: var(--bg-alt); display: flex; flex-direction: column; max-height: 32%; }
  .head { display: flex; align-items: center; gap: 6px; padding: 5px 14px; font-size: calc(12px * var(--ui-scale, 1)); color: var(--text-muted); text-align: left; }
  /* a phone: a header a finger can hit (the phone audit: 31 px under a library's card) */
  :global(html.phone) .head { min-height: 44px; }
  .head:hover { color: var(--text); }
  .n { color: var(--accent); font-weight: 600; font-variant-numeric: tabular-nums; }
  .from { color: var(--text-faint); }
  .list { overflow: auto; padding: 2px 10px 10px; display: flex; flex-direction: column; gap: 6px; }
  .typed { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; padding: 2px 6px 6px; }
  .rel { font-size: calc(10.5px * var(--ui-scale, 1)); font-weight: 600; letter-spacing: .07em; text-transform: uppercase; color: var(--text-muted); }
  .chip { padding: 1px 8px; border-radius: 999px; border: 1px solid var(--border); background: var(--bg); color: var(--text); font-size: calc(12px * var(--ui-scale, 1)); }
  .chip:hover { border-color: var(--accent); color: var(--accent); }
  .group { display: flex; flex-direction: column; }
  .src { display: flex; align-items: center; gap: 6px; padding: 3px 6px; border-radius: var(--radius-sm); color: var(--heading); font-weight: 550;
    font-size: calc(12.5px * var(--ui-scale, 1)); text-align: left; }
  .src:hover { background: var(--bg-hover); }
  .dir { color: var(--text-faint); font-weight: 400; font-size: .9em; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .ctx { display: block; margin-left: 25px; padding: 2px 8px; border-left: 2px solid var(--border-strong); color: var(--text-muted); text-align: left;
    font-size: calc(12px * var(--ui-scale, 1)); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .ctx:hover { color: var(--text); border-left-color: var(--accent); background: var(--bg-hover); }
  mark { background: none; color: var(--link, var(--accent)); }
  .n.soft { color: var(--text-muted); }
  .sub { margin: 8px 6px 2px; font-size: calc(11px * var(--ui-scale, 1)); font-weight: 600; text-transform: uppercase; letter-spacing: .06em; color: var(--text-muted); }
  .sub .hint { text-transform: none; letter-spacing: 0; font-weight: 400; color: var(--text-faint); }
  .urow { display: flex; align-items: center; gap: 6px; }
  .urow .ctx { flex: 1; min-width: 0; margin-left: 6px; }
  .usrc { color: var(--heading); font-weight: 550; margin-right: 4px; }
  .linkbtn { flex: none; font-size: calc(11.5px * var(--ui-scale, 1)); padding: 1px 8px; border-radius: 999px; border: 1px solid var(--border-strong); color: var(--text-muted); }
  .linkbtn:hover { border-color: var(--accent); color: var(--accent); }
</style>
