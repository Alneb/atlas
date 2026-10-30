<script lang="ts">
  // The `tags` block (in a .page, a note's ```view, or the sidebar): every tag of the vault with its
  // number of notes, nested ones under their parent. A click lists the tag's notes; a note opens.
  // The same list is `tag:<name>` in quick open and in the Search pane (core: tags.rs). Right-click: rename a tag in
  // every note, nested ones with it.
  import { errText } from "../../lib/text";
  import { reloadOnChange } from "../../lib/reload-on-change";
  import { shownName, basename } from "../../lib/paths";
  import { onMount } from "svelte";
  import { api } from "../../lib/api";
  import { openPath } from "../../lib/dock";
  import type { TagCount } from "../../lib/gen/TagCount";
  import { atPointer, type MenuAt } from "../../lib/menu";
  import { toast } from "../../lib/state.svelte";
  import ContextMenu from "../ContextMenu.svelte";
  import InputDialog from "../InputDialog.svelte";
  let box = $state<HTMLElement>();

  let tags = $state<TagCount[] | null>(null);
  let open = $state<string | null>(null);
  let notes = $state<string[]>([]);
  let error = $state("");

  async function load() {
    try {
      tags = await api.tags(); error = "";
      const o = open;
      if (o) { const files = (await api.search(`tag:${o}`)).files; if (open === o) notes = files; }
    }
    catch (e) { error = errText(e); }
  }
  async function toggle(tag: string) {
    if (open === tag) { open = null; return; }
    open = tag;
    notes = [];
    try {
      const files = (await api.search(`tag:${tag}`)).files;
      if (open === tag) { notes = files; error = ""; } // a slower answer for a tag clicked before must not list under this one
    } catch (e) { if (open === tag) error = errText(e); }
  }
  const leaf = (t: string) => basename(t);
  const depth = (t: string) => t.split("/").length - 1;
  const name = shownName;
  let menu = $state<MenuAt | null>(null);
  let renaming = $state<string | null>(null);
  async function rename(from: string, to: string) {
    renaming = null;
    const clean = to.trim().replace(/^#/, "");
    if (!clean || clean === from) return;
    try {
      const r = await api.renameTag(from, clean);
      toast(`#${from} → #${clean}`, `${r.tags} tag${r.tags === 1 ? "" : "s"} in ${r.notes.length} note${r.notes.length === 1 ? "" : "s"}`, "success");
      if (open === from) open = clean;
      await load();
    } catch (e) { toast("The tag was not renamed", errText(e), "error"); }
  }

  onMount(() => {
    void load();
    return reloadOnChange(() => void load(), { wait: 1200, wants: (p) => p.endsWith(".md"), host: () => box });
  });
</script>

<div class="tags-block" aria-label="Tags" bind:this={box}>
  {#if tags === null && error}<p class="view-error">{error}</p>
  {:else if tags === null}<p class="muted">Reading tags…</p>
  {:else if !tags.length}<p class="muted">No tags yet. Write <code>#topic</code> in a note, or <code>tags: [topic]</code> in its properties; <code>#topic/part</code> nests.</p>
  {:else}
    <!-- a failed read is said above the last good list, not in its place -->
    {#if error}<p class="view-error">{error}</p>{/if}
    <ul>
      {#each tags as t (t.tag)}
        <li>
          <button class="tag-row" class:on={open === t.tag} style:padding-left="{6 + depth(t.tag) * 14}px" aria-expanded={open === t.tag} title="#{t.tag}" onclick={() => toggle(t.tag)}
            oncontextmenu={(e) => { e.preventDefault(); menu = atPointer(e, [{ label: "Rename tag…", icon: "edit", detail: "in every note, the tags nested under it too", run: () => (renaming = t.tag) }]); }}>
            <span class="hash">#</span><span class="n">{leaf(t.tag)}</span><span class="c">{t.notes}</span>
          </button>
          {#if open === t.tag}
            <ul class="notes">
              {#each notes as p (p)}<li><button class="note" title={p} onclick={() => openPath(p)}><span class="n">{name(p)}</span></button></li>{/each}
            </ul>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}
</div>
{#if menu}<ContextMenu {...menu} onclose={() => (menu = null)} />{/if}
{#if renaming}
  <InputDialog title="Rename #{renaming}" value={renaming} hint="Every note: #{renaming} and #{renaming}/… in the text and in tags:" onsubmit={(v) => void rename(renaming!, v)} oncancel={() => (renaming = null)} />
{/if}

<style>
  .tags-block { font-size: calc(13px * var(--ui-scale, 1)); }
  ul { list-style: none; margin: 0; padding: 0; }
  /* not `.tag`: inside a note that is the markdown tag pill (markdown.css) */
  .tag-row, .note { display: flex; align-items: center; gap: 4px; width: 100%; padding: 3px 6px; border-radius: var(--radius-sm); text-align: left; color: var(--text); }
  .tag-row:hover, .note:hover { background: var(--bg-hover); }
  .tag-row.on { background: var(--accent-soft); }
  .hash { color: var(--text-faint); }
  .n { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .c { color: var(--text-faint); font-size: .86em; font-variant-numeric: tabular-nums; }
  .notes { margin: 1px 0 4px 20px; border-left: 1px solid var(--border); padding-left: 6px; }
  .note { color: var(--text-muted); }
  .muted { color: var(--text-faint); margin: 4px 6px; }
</style>
