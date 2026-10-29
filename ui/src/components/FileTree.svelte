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
  import ContextMenu, { type MenuItem } from "./ContextMenu.svelte";
  import { LETTER } from "../lib/gitstatus.svelte";
  import { settings } from "../lib/settings.svelte";
  import { shownEntries, treeView } from "../lib/tree-view.svelte";
  import { activeRow, changeOf, openDirs, revealed, setOpen } from "../lib/file-tree.svelte";
  import { joinPath, openExplorer, sources, type FileSource } from "../lib/file-sources.svelte";
  import { busy, listFolder, listed, openRemote, placesOf, remoteKey, remoteOpen, servers, setRemoteOpen, sortEntries, wantPlaces } from "../lib/remote-tree.svelte";
  import { RowWindow } from "../lib/windowed.svelte";

  let { roots, version, scroller }: { roots: TreeEntry[]; version: number; scroller: HTMLElement | undefined } = $props();

  /** A folder's entries, once fetched (the key: its path). */
  const kids = new SvelteMap<string, TreeEntry[]>();
  const loading = new SvelteMap<string, true>();

  async function fetchDir(dir: string): Promise<void> {
    loading.set(dir, true);
    try { kids.set(dir, await api.tree(dir, treeView.showAll)); }
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

  // a server's row (lib/remote-tree): its source's group, a place, or a folder or file in it
  type Remote = { kind: "remote"; key: string; src: FileSource; place: string; dir: string; name: string; folder: boolean; depth: number; open: boolean; group?: boolean; title?: string };
  type Row = { kind: "entry"; e: TreeEntry; depth: number; open: boolean } | { kind: "empty"; depth: number; key: string; text?: string } | Remote;
  const keyOf = (r: Row) => (r.kind === "entry" ? r.e.path : r.key);
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
    const remote: RemoteWant = [];
    for (const src of servers()) walkServer(src, out, remote);
    return { rows: out, want, remote };
  });
  /** Folders of servers drawn open and not listed yet. */
  type RemoteWant = [FileSource, string, string][];
  function walkServer(src: FileSource, out: Row[], want: RemoteWant) {
    const places = placesOf.get(src.id) ?? [];
    if (!places.length) return; // nothing set up: no group (Settings adds a server)
    const gk = remoteKey(src.id), gOpen = remoteOpen.has(gk);
    out.push({ kind: "remote", key: gk, src, place: "", dir: "", name: src.title, folder: true, depth: 0, open: gOpen, group: true });
    if (!gOpen) return;
    for (const p of places) {
      const pk = remoteKey(src.id, p.id), pOpen = remoteOpen.has(pk);
      out.push({ kind: "remote", key: pk, src, place: p.id, dir: "", name: p.title, folder: true, depth: 1, open: pOpen, title: p.detail });
      if (pOpen) walkFolder(src, p.id, "", 2, out, want);
    }
  }
  function walkFolder(src: FileSource, place: string, path: string, depth: number, out: Row[], want: RemoteWant) {
    const l = listed.get(remoteKey(src.id, place, path));
    if (!l) { want.push([src, place, path]); return; }
    if ("error" in l) { out.push({ kind: "empty", depth, key: `${remoteKey(src.id, place, path)}
!`, text: l.error }); return; }
    const shown = sortEntries(l.entries.filter((e) => treeView.showAll || !e.name.startsWith(".")));
    if (!shown.length) out.push({ kind: "empty", depth, key: `${remoteKey(src.id, place, path)}
.` });
    for (const e of shown) {
      const sub = joinPath(l.path || path, e.name);
      const folder = e.kind === "dir", k = remoteKey(src.id, place, sub), open = folder && remoteOpen.has(k);
      out.push({ kind: "remote", key: k, src, place, dir: l.path || path, name: e.name, folder, depth, open });
      if (open) walkFolder(src, place, sub, depth + 1, out, want);
    }
  }
  $effect(() => { void sources.list.length; wantPlaces(); });
  $effect(() => { for (const [src, place, path] of walked.remote) void listFolder(src, place, path); });
  // a server row's own menu (the vault's, Files.svelte, acts on data-path rows): open it, or go there in the explorer,
  // where a server's files are renamed, uploaded and deleted
  let menu = $state<{ x: number; y: number; items: MenuItem[] } | null>(null);
  function remoteMenu(e: MouseEvent, r: Remote) {
    e.preventDefault();
    e.stopPropagation();
    const at = r.group ? undefined : r.depth === 1 ? "" : r.folder ? joinPath(r.dir, r.name) : r.dir;
    const items: MenuItem[] = [];
    if (!r.folder) items.push({ label: "Open", icon: "file", run: () => toggleRemote(r) });
    items.push({ label: "Show in the explorer", icon: "folder-open", run: () => openExplorer(r.src.id, r.place, at || undefined) });
    menu = { x: e.clientX, y: e.clientY, items };
  }
  function toggleRemote(r: Remote) {
    if (!r.folder) { void openRemote(r.src, r.place, r.dir, r.name); return; }
    setRemoteOpen(r.key, !r.open);
  }
  const rows = $derived(walked.rows);
  const wanted = $derived(walked.want);

  // --- the window: rows of one height, those in view (and a screen around) drawn ---
  // rows drawn beyond the screen on each side: scrolling stays drawn, and a folder of a usual size opened at the top is
  // there whole (±20 left rows a click away out of the page — the tree specs' rows, and find-in-page); ~200 rows at
  // most whatever the vault, against 2 258 for the whole tree after a day
  const win = new RowWindow(100);
  $effect(() => win.follow(scroller));
  const { first, last } = $derived(win.range(rows.length));
  let listEl = $state<HTMLElement>();
  $effect(() => { void rows.length; win.measure(listEl?.querySelector<HTMLElement>(".row")); });

  // follow the active file: once its row exists, scroll it to the middle — only while the tree is shown; a tree shown
  // later (its height comes) and the same file asked for again (revealed.n) scroll to it then
  let centred = "";
  $effect(() => {
    const p = revealed.path, ask = `${p}#${revealed.n}`, i = rows.findIndex((r) => r.kind === "entry" && r.e.path === p);
    if (!p || ask === centred || i < 0 || !win.height || !scroller?.clientHeight) return;
    centred = ask;
    const y = i * win.rowH;
    if (y < scroller.scrollTop || y > scroller.scrollTop + scroller.clientHeight - win.rowH) scroller.scrollTop = Math.max(0, y - scroller.clientHeight / 2);
  });

  const showGit = $derived(settings.config?.files.git_status ?? true);

  // --- the keyboard: ↑ ↓ move, → opens a folder (then goes in), ← closes it (then goes up), Home / End ---------------
  // The row with the focus is remembered by path: the window may drop its button when scrolled away, and the focus
  // comes back to it when it is drawn again (it had nowhere else to go).
  let focusPath = $state("");
  let kept = false; // the tree had the focus and lost it only because its row left the window
  const rowEl = (key: string) => listEl?.querySelector<HTMLElement>(`.row[data-key="${CSS.escape(key)}"]`) ?? null;
  function focusRow(i: number) {
    const r = rows[Math.max(0, Math.min(rows.length - 1, i))];
    if (!r || r.kind === "empty" || !scroller) return;
    const y = rows.indexOf(r) * win.rowH;
    if (y < scroller.scrollTop) scroller.scrollTop = y;
    else if (y + win.rowH > scroller.scrollTop + scroller.clientHeight) scroller.scrollTop = y + win.rowH - scroller.clientHeight;
    focusPath = keyOf(r);
    requestAnimationFrame(() => rowEl(keyOf(r))?.focus());
  }
  function onKey(e: KeyboardEvent) {
    const key = (e.target as HTMLElement).closest<HTMLElement>(".row")?.dataset.key;
    const i = rows.findIndex((r) => r.kind !== "empty" && keyOf(r) === key);
    if (i < 0) return;
    const r = rows[i] as Exclude<Row, { kind: "empty" }>, step = (d: number) => { let k = i + d; while (rows[k]?.kind === "empty") k += d; return k; };
    const folder = r.kind === "entry" ? r.e.kind === "dir" : r.folder;
    const fold = (open: boolean) => (r.kind === "entry" ? setOpen(r.e.path, open) : setRemoteOpen(r.key, open));
    let to: number | null = null;
    if (e.key === "ArrowDown") to = step(1);
    else if (e.key === "ArrowUp") to = step(-1);
    else if (e.key === "Home") to = 0;
    else if (e.key === "End") to = rows.length - 1;
    else if (e.key === "ArrowRight" && folder) { if (!r.open) fold(true); else to = step(1); }
    else if (e.key === "ArrowLeft") {
      if (folder && r.open) fold(false);
      else { // up: the nearest row above that is shallower
        let k = i - 1;
        while (k >= 0 && (rows[k].kind === "empty" || rows[k].depth >= r.depth)) k--;
        to = r.depth > 0 && k >= 0 ? k : null;
      }
    } else return;
    e.preventDefault();
    if (to !== null && to >= 0) focusRow(to);
  }
  $effect(() => {
    void first; void last;
    if (!kept || !focusPath) return;
    const el = rowEl(focusPath);
    if (el && (document.activeElement === document.body || !document.activeElement)) { el.focus({ preventScroll: true }); kept = false; }
  });
  function focusIn(e: FocusEvent) { focusPath = (e.target as HTMLElement).closest<HTMLElement>(".row")?.dataset.key ?? focusPath; kept = false; }
  // leaving for nothing (the row unmounted) keeps the claim; leaving for something else gives it up
  function focusOut(e: FocusEvent) { kept = !e.relatedTarget; }
  /** The row of `path` given the focus again (after a dialog about it closed). */
  export function refocus(path: string) { focusPath = path; const i = rows.findIndex((r) => r.kind === "entry" && r.e.path === path); if (i >= 0) focusRow(i); }

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

<!-- svelte-ignore a11y_no_noninteractive_element_interactions (the keys belong to the row buttons inside) -->
<ul class="tree-rows" bind:this={listEl} onkeydown={onKey} onfocusin={focusIn} onfocusout={focusOut} style:padding-top="{first * win.rowH}px" style:padding-bottom="{(rows.length - last) * win.rowH}px">
  {#each rows.slice(first, last) as r (keyOf(r))}
    {#if r.kind === "empty"}
      <li class="empty" class:why={!!r.text} style:padding-left="{22 + r.depth * 14}px" title={r.text}>{r.text ?? "empty"}</li>
    {:else if r.kind === "remote"}
      <!-- a server's row: no data-path (the vault's menus and drops act on data-path rows only) -->
      <li>
        <button class="row" class:is-dir={r.folder} class:group={r.group} style:padding-left="{8 + r.depth * 14}px" onclick={() => toggleRemote(r)} oncontextmenu={(e) => remoteMenu(e, r)}
          title={r.title ?? (r.group ? `${r.name}: your servers (Settings → ${r.name})` : r.folder ? r.name : `${r.name} — fetched from ${r.src.title} when opened`)} data-key={r.key}>
          {#if r.folder}
            <span class="chev" class:open={r.open}><Icon name="chevron" size={12} /></span>
            <span class="ico dir" class:server={r.group || r.depth === 1}><Icon name={r.group ? r.src.icon : r.depth === 1 ? "server" : r.open ? "folder-open" : "folder"} size={15} /></span>
          {:else}
            <span class="chev"></span>
            <span class="ico"><Icon name={fileIcon(r.name)} size={15} /></span>
          {/if}
          <span class="name">{r.name}</span>
          {#if busy.has(r.key) || (r.depth === 1 && busy.has(remoteKey(r.src.id, r.place, "")))}<span class="spin"></span>{/if}
        </button>
      </li>
    {:else}
      {@const entry = r.e}
      {@const change = showGit ? changeOf(entry.path, entry.kind === "dir") : undefined}
      {@const opensNote = entry.kind === "dir" && !!entry.note}
      <li>
        <button class="row git-{change ?? 'clean'}" class:active={activeRow.has(entry.path) || (opensNote && activeRow.has(entry.note!))} class:is-dir={entry.kind === "dir"} class:ignored={entry.ignored}
          style:padding-left="{8 + r.depth * 14}px" onclick={(e) => toggle(e, entry, r.open)} title={entry.path} data-path={entry.path} data-key={entry.path} draggable="true">
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
{#if menu}<ContextMenu x={menu.x} y={menu.y} items={menu.items} onclose={() => (menu = null)} />{/if}

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
  /* the servers' group: set apart from the vault's rows above it by a line (no margin: the window counts rows of one height) */
  .row.group { border-radius: 0; box-shadow: inset 0 1px 0 var(--border); }
  .row.group .name { color: var(--text-muted); font-weight: 600; font-size: calc(11.5px * var(--ui-scale, 1)); text-transform: uppercase; letter-spacing: .04em; }
  .ico.dir.server { color: var(--text-faint); opacity: 1; }
  .empty.why { font-style: normal; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; padding-right: 8px; }
  .row.ignored { opacity: .68; } /* dimmed, still legible (UX audit: icons at .5 fell below 2.5:1) */
  .row.ignored:hover { opacity: .85; }
</style>
