<script lang="ts">
  // The file tree as one flat, windowed list: the open folders flattened into rows, and only the rows in view
  // drawn. The recursive tree drew every row of every open folder (2 258 rows, 21 000 elements kept in the page
  // after a day of tabs); this draws ~40 whatever the vault. Folders are fetched on first open and
  // re-fetched when the tree's `version` bumps (files appeared or went).
  import { untrack } from "svelte";
  import { SvelteMap } from "svelte/reactivity";
  import { api } from "../lib/api";
  import { openPath } from "../lib/dock";
  import { fileIcon } from "../lib/panes";
  import type { TreeEntry } from "../lib/types";
  import Icon from "./Icon.svelte";
  import { LETTER } from "../lib/gitstatus.svelte";
  import { settings } from "../lib/settings.svelte";
  import { shownEntries } from "../lib/tree-view.svelte";
  import { activeRow, changeOf, openDirs, revealed, setOpen } from "../lib/file-tree.svelte";

  let { roots, version, scroller }: { roots: TreeEntry[]; version: number; scroller: HTMLElement | undefined } = $props();

  /** A folder's entries, once fetched (the key: its path). */
  const kids = new SvelteMap<string, TreeEntry[]>();
  const loading = new SvelteMap<string, true>();

  async function fetchDir(dir: string): Promise<void> {
    loading.set(dir, true);
    try { kids.set(dir, await api.tree(dir)); }
    catch { kids.set(dir, []); }
    finally { loading.delete(dir); }
  }
  // an open folder is fetched once it is reachable — its parent drawn open (a folder named only by a remembered or
  // revealed path that is gone was asked for and 404'd; the old tree asked only for what it drew)
  $effect(() => { for (const d of wanted) if (!untrack(() => kids.has(d) || loading.has(d))) void fetchDir(d); });
  // files appeared or went: every folder fetched so far again (the open ones; a closed one is dropped, fetched on opening)
  let seen = untrack(() => version);
  $effect(() => {
    if (version === seen) return;
    seen = version;
    // the open folders still drawn (the roots were just re-read: a folder gone is not asked for); the rest forgotten
    untrack(() => {
      const drawn = new Set(rows.flatMap((r) => (r.kind === "entry" && r.open ? [r.e.path] : [])));
      for (const d of [...kids.keys()]) { if (drawn.has(d)) void fetchDir(d); else kids.delete(d); }
    });
  });

  type Row = { kind: "entry"; e: TreeEntry; depth: number; open: boolean } | { kind: "empty"; depth: number; key: string };
  /** Every row of the tree as it unfolds now, top to bottom; and the open folders drawn whose entries are not here yet. */
  const walked = $derived.by(() => {
    const out: Row[] = [];
    const want: string[] = [];
    const walk = (entries: TreeEntry[], depth: number) => {
      for (const e of entries) {
        const open = e.kind === "dir" && openDirs.has(e.path);
        out.push({ kind: "entry", e, depth, open });
        if (!open) continue;
        const c = kids.get(e.path);
        if (!c) { want.push(e.path); continue; }
        const shown = shownEntries(c, e.note);
        if (shown.length) walk(shown, depth + 1);
        else out.push({ kind: "empty", depth: depth + 1, key: `${e.path}/` });
      }
    };
    walk(shownEntries(roots), 0);
    return { rows: out, want };
  });
  const rows = $derived(walked.rows);
  const wanted = $derived(walked.want);

  // --- the window: rows of one height, those in view (and a screen around) drawn ---
  let rowH = $state(26);
  let top = $state(0);
  let height = $state(800);
  $effect(() => {
    const el = scroller;
    if (!el) return;
    const onScroll = () => { top = el.scrollTop; };
    const ro = new ResizeObserver(() => { height = el.clientHeight || height; top = el.scrollTop; });
    el.addEventListener("scroll", onScroll, { passive: true });
    ro.observe(el);
    return () => { el.removeEventListener("scroll", onScroll); ro.disconnect(); };
  });
  // rows drawn beyond the screen on each side: scrolling stays drawn, and a folder of a usual size opened at the top is
  // there whole (±20 left rows a click away out of the page — the tree specs' rows, and find-in-page); ~200 rows at
  // most whatever the vault, against 2 258 for the whole tree after a day
  const MARGIN = 100;
  const first = $derived(Math.max(0, Math.floor(top / rowH) - MARGIN));
  const last = $derived(Math.min(rows.length, Math.ceil((top + height) / rowH) + MARGIN));
  let listEl = $state<HTMLElement>();
  // the row height as the theme draws it (a phone's rows are taller)
  $effect(() => { void rows.length; const r = listEl?.querySelector<HTMLElement>(".row"); if (r?.offsetHeight) rowH = r.offsetHeight; });

  // follow the active file: once its row exists, scroll it to the middle — only while the tree is shown
  let centred = "";
  $effect(() => {
    const p = revealed.path, i = rows.findIndex((r) => r.kind === "entry" && r.e.path === p);
    if (!p || p === centred || i < 0 || !scroller?.offsetParent) return;
    centred = p;
    const y = i * rowH;
    if (y < scroller.scrollTop || y > scroller.scrollTop + scroller.clientHeight - rowH) scroller.scrollTop = Math.max(0, y - scroller.clientHeight / 2);
  });

  const showGit = $derived(settings.config?.files.git_status ?? true);

  function toggle(e: MouseEvent, entry: TreeEntry, open: boolean) {
    if (entry.kind === "file") { openPath(entry.path); return; }
    if (entry.note && !(e.target as HTMLElement).closest(".chev")) {
      // a folder with its own note (`<folder>/<folder>.md`) is that note: its name opens it, the chevron folds it
      openPath(entry.note);
      if (!open) setOpen(entry.path, true);
      return;
    }
    setOpen(entry.path, !open);
  }
</script>

<ul class="tree-rows" bind:this={listEl} style:padding-top="{first * rowH}px" style:padding-bottom="{(rows.length - last) * rowH}px">
  {#each rows.slice(first, last) as r (r.kind === "entry" ? r.e.path : r.key)}
    {#if r.kind === "empty"}
      <li class="empty" style:padding-left="{22 + r.depth * 14}px">empty</li>
    {:else}
      {@const entry = r.e}
      {@const change = showGit ? changeOf(entry.path, entry.kind === "dir") : undefined}
      {@const opensNote = entry.kind === "dir" && !!entry.note}
      <li>
        <button class="row git-{change ?? 'clean'}" class:active={activeRow.has(entry.path) || (opensNote && activeRow.has(entry.note!))} class:is-dir={entry.kind === "dir"} class:ignored={entry.ignored}
          style:padding-left="{8 + r.depth * 14}px" onclick={(e) => toggle(e, entry, r.open)} title={entry.path} data-path={entry.path} draggable="true">
          {#if entry.kind === "dir"}
            <span class="chev" class:open={r.open}><Icon name="chevron" size={12} /></span>
            <span class="ico dir" class:note={opensNote}><Icon name={opensNote ? "file-text" : r.open ? "folder-open" : "folder"} size={15} /></span>
          {:else}
            <span class="chev"></span>
            <span class="ico"><Icon name={fileIcon(entry.path)} size={15} /></span>
          {/if}
          <span class="name">{entry.name}</span>
          {#if change}
            {#if entry.kind === "dir"}<span class="gdot" title="Contains {change} files"></span>
            {:else}<span class="glet" title={change}>{LETTER[change]}</span>{/if}
          {/if}
          {#if loading.has(entry.path)}<span class="spin"></span>{/if}
        </button>
      </li>
    {/if}
  {/each}
</ul>

<style>
  ul { list-style: none; margin: 0; padding: 0; }
  .row { display: flex; align-items: center; gap: 4px; width: 100%; height: 26px; padding-right: 8px; border-radius: var(--radius-sm);
    color: var(--text-muted); font-size: calc(13px * var(--ui-scale, 1)); text-align: left; white-space: nowrap; }
  /* a phone: rows a finger can hit (lib/phone.svelte.ts) */
  :global(html.phone) .row { height: 40px; }
  .row:hover { background: var(--bg-hover); color: var(--text); }
  .row.active { background: var(--accent-soft); color: var(--text); }
  .row:focus-visible { outline: none; background: var(--accent-soft); color: var(--text); }
  .chev { width: 14px; display: inline-flex; justify-content: center; color: var(--text-faint); transition: transform .12s ease; }
  .chev.open { transform: rotate(90deg); }
  /* fixed widths: a long name must not shrink the chevron slot (rows lost their alignment) */
  .chev, .ico { flex: none; }
  .ico { display: inline-flex; color: var(--text-faint); margin-right: 3px; }
  .ico.dir { color: var(--accent); opacity: .85; }
  .ico.dir.note { color: var(--text-faint); opacity: 1; }
  .name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-align: left; }
  .is-dir .name { color: var(--text); }
  /* the same height as a row: the window counts rows of one height */
  .empty { font-size: calc(12px * var(--ui-scale, 1)); color: var(--text-faint); height: 26px; line-height: 26px; font-style: italic; }
  :global(html.phone) .empty { height: 40px; line-height: 40px; }
  .spin { width: 10px; height: 10px; border: 1.5px solid var(--text-faint); border-top-color: transparent; border-radius: 50%; animation: spin .7s linear infinite; margin-left: auto; }
  /* git status: the name takes the colour, a letter (files) or a dot (folders) says what changed */
  .glet { margin-left: auto; font-family: var(--font-mono); font-size: calc(11px * var(--ui-scale, 1)); font-weight: 600; padding-left: 6px; }
  .gdot { margin-left: auto; width: 6px; height: 6px; border-radius: 50%; background: currentColor; flex: none; }
  .row.git-modified .name, .row.git-modified .glet, .row.git-modified .gdot, .row.git-renamed .name, .row.git-renamed .glet, .row.git-renamed .gdot { color: var(--yellow); }
  .row.git-added .name, .row.git-added .glet, .row.git-added .gdot, .row.git-untracked .name, .row.git-untracked .glet, .row.git-untracked .gdot { color: var(--green); }
  .row.git-deleted .name, .row.git-deleted .glet, .row.git-deleted .gdot, .row.git-conflicted .name, .row.git-conflicted .glet, .row.git-conflicted .gdot { color: var(--red); }
  .row.ignored { opacity: .68; } /* dimmed, still legible (UX audit: icons at .5 fell below 2.5:1) */
  .row.ignored:hover { opacity: .85; }
</style>
