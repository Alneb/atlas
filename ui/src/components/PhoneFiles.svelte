<script lang="ts">
  // Files on a phone (docs/guides/MOBILE.md, "Files and Search on a phone"): one folder at a time, as a phone's files app shows
  // it — where you are on top, a finger-sized row per entry (folders first), a tap to go in or open, Back to go up, a long
  // press for the file's menu (Files.svelte's own, through `.row[data-path]`). The desktop's tree stays for wide screens.
  import { dirOf } from "../lib/paths";
  import { bytes, errText, shortWhen } from "../lib/text";
  import { onMount } from "svelte";
  import { api } from "../lib/api";
  import { reloadOnChange } from "../lib/reload-on-change";
  import { openPath } from "../lib/dock";
  import { fileIcon } from "../lib/panes";
  import { closable, onScreen } from "../lib/back";
  import { load, save } from "../lib/prefs";
  import { shownEntries } from "../lib/tree-view.svelte";
  import { app } from "../lib/state.svelte";
  import type { TreeEntry } from "../lib/types";
  import Icon from "./Icon.svelte";
  import { openExplorer } from "../lib/file-sources.svelte";
  import { placesOf, servers, wantPlaces } from "../lib/remote-tree.svelte";

  let { oncontext, onnewfile, onnewfolder }: { oncontext: (e: MouseEvent) => void; onnewfile: (dir: string) => void; onnewfolder: (dir: string) => void } = $props();

  const DIR_KEY = "atlas.phone.files.dir";
  let dir = $state(load<string>(DIR_KEY, ""));
  let entries = $state<TreeEntry[]>([]);
  let error = $state("");
  let byDate = $state(load<boolean>("atlas.phone.files.byDate", false));
  let lit = $state(""); // the file revealed (Show in Files)
  const parentOf = dirOf;
  let root = $state<HTMLElement>();
  // the folders walked through, newest last: Back retraces them (a jump by the path's names, too), then goes up
  const trail: string[] = [];
  function goTo(d: string): void { if (d !== dir) { trail.push(dir); dir = d; } }
  const crumbs = $derived(dir ? dir.split("/") : []);

  const sorted = $derived(
    shownEntries(entries).sort((a, b) => // (the folder's own note stays: a tap on a folder goes into it here)
      a.kind !== b.kind ? (a.kind === "dir" ? -1 : 1) : byDate ? (b.modified ?? 0) - (a.modified ?? 0) : a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" })),
  );

  async function list() {
    const at = dir;
    try {
      const got = await api.tree(at);
      if (at === dir) { entries = got; error = ""; }
    } catch (e) {
      if (at !== dir) return;
      if (at) { dir = parentOf(at); return; } // a folder gone since: its parent
      error = errText(e);
    }
  }
  $effect(() => { save(DIR_KEY, dir); void list(); });
  // Back goes up a folder before it leaves Files (lib/back.ts)
  // only while Files is on screen: it stays mounted behind an open note, where Back is the note's (lib/back.ts)
  $effect(() => { if (dir || trail.length) { void dir; return closable(() => (dir = trail.pop() ?? parentOf(dir)), () => onScreen(root)); } });

  // the servers (copyparty, SSH) under the vault's top folder, each place a row into the explorer there (lib/remote-tree)
  $effect(() => { void servers().length; wantPlaces(); });
  const serverPlaces = $derived(servers().flatMap((s) => (placesOf.get(s.id) ?? []).map((p) => ({ s, p }))));

  // a files list shows the real names, extensions too
  const label = (e: TreeEntry) => e.name;

  onMount(() => {
    // the list shows one folder, with times and sizes: only a change in that folder redraws it
    const off = reloadOnChange(() => void list(), { wait: 400, wants: (p) => parentOf(p) === dir });
    const reveal = (e: Event) => {
      const path = (e as CustomEvent<string>).detail;
      goTo(parentOf(path));
      lit = path;
      setTimeout(() => document.querySelector(`.pf .row[data-path="${CSS.escape(path)}"]`)?.scrollIntoView({ block: "center" }), 250);
    };
    window.addEventListener("atlas-active-file", reveal);
    return () => { off(); window.removeEventListener("atlas-active-file", reveal); };
  });
</script>

<div class="pf" bind:this={root}>
  <div class="where">
    {#if dir}
      <button class="up" aria-label="Up a folder" onclick={() => goTo(parentOf(dir))}><Icon name="chevron" size={18} /></button>
    {/if}
    <div class="path">
      <span class="title">{crumbs.at(-1) ?? app.workspace?.name ?? "Files"}</span>
      {#if crumbs.length}
        <span class="crumbs">
          <button onclick={() => goTo("")}>{app.workspace?.name ?? "Vault"}</button>
          {#each crumbs.slice(0, -1) as c, i (i)}<span class="sep">/</span><button onclick={() => goTo(crumbs.slice(0, i + 1).join("/"))}>{c}</button>{/each}
        </span>
      {/if}
    </div>
    <button class="act" aria-label={byDate ? "Sort by name" : "Newest first"} title={byDate ? "Sorted by date: by name" : "Sorted by name: newest first"}
      onclick={() => { byDate = !byDate; save("atlas.phone.files.byDate", byDate); }}><Icon name={byDate ? "clock" : "rows"} size={20} /></button>
    <button class="act" aria-label="New note here" title="New note here" onclick={() => onnewfile(dir)}><Icon name="plus" size={20} /></button>
    <button class="act" aria-label="New folder here" title="New folder here" onclick={() => onnewfolder(dir)}><Icon name="folder" size={20} /></button>
  </div>
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="list" oncontextmenu={oncontext}>
    {#if error}<p class="empty">{error}</p>{/if}
    {#each sorted as e (e.path)}
      <button class="row" class:is-dir={e.kind === "dir"} class:lit={lit === e.path} class:ignored={e.ignored} data-path={e.path}
        onclick={() => (e.kind === "dir" ? goTo(e.path) : openPath(e.path))}>
        <span class="icon"><Icon name={e.kind === "dir" ? "folder" : fileIcon(e.path)} size={22} /></span>
        <span class="words">
          <span class="name">{label(e)}</span>
          <span class="detail">{[shortWhen(e.modified), e.kind === "dir" ? "" : bytes(e.size)].filter(Boolean).join(" · ")}</span>
        </span>
        {#if e.kind === "dir"}<span class="go"><Icon name="chevron" size={16} /></span>{/if}
      </button>
    {/each}
    {#if !error && !sorted.length}<p class="empty">This folder is empty.</p>{/if}
    {#if !dir && serverPlaces.length}
      <p class="group">Servers</p>
      {#each serverPlaces as { s, p } (`${s.id}\n${p.id}`)}
        <button class="row" onclick={() => openExplorer(s.id, p.id)} title={p.detail}>
          <span class="icon"><Icon name="server" size={22} /></span>
          <span class="words"><span class="name">{p.title}</span><span class="detail">{s.title}{p.detail ? ` · ${p.detail}` : ""}</span></span>
          <span class="go"><Icon name="chevron" size={16} /></span>
        </button>
      {/each}
    {/if}
  </div>
</div>

<style>
  .pf { display: flex; flex-direction: column; height: 100%; min-height: 0; }
  .where { display: flex; align-items: center; gap: 4px; padding: 10px 8px 8px 12px; border-bottom: 1px solid var(--border); }
  .up { display: grid; place-items: center; width: 44px; height: 44px; margin-left: -8px; border-radius: 22px; color: var(--text-muted); }
  .up :global(svg) { transform: rotate(180deg); }
  .path { flex: 1; min-width: 0; display: flex; flex-direction: column; }
  .title { font-size: calc(19px * var(--ui-scale, 1)); font-weight: 650; color: var(--heading); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .crumbs { display: flex; align-items: center; gap: 2px; font-size: calc(13px * var(--ui-scale, 1)); color: var(--text-faint); white-space: nowrap; overflow: hidden; }
  .crumbs button { color: var(--text-muted); padding: 2px 0; min-height: 28px; overflow: hidden; text-overflow: ellipsis; }
  .sep { opacity: .6; }
  .act { display: grid; place-items: center; width: 44px; height: 44px; border-radius: 22px; color: var(--text-muted); flex: none; }
  .act:active, .up:active { background: var(--bg-hover); }
  .list { flex: 1; min-height: 0; overflow: auto; padding: 4px 4px 96px; } /* room under the last row for the capture button */
  .row { display: flex; align-items: center; gap: 14px; width: 100%; min-height: calc(60px * var(--ui-scale, 1)); padding: 8px 12px; border-radius: 12px; text-align: left; color: var(--text); }
  .row:active { background: var(--bg-hover); }
  .row.lit { background: var(--accent-soft); }
  :global(:root.eink) .row.lit { outline: 2px solid var(--text); } /* e-ink: a frame, not a tint */
  :global(:root.eink) .row { border-bottom: 1px solid var(--border); border-radius: 0; }
  .row.ignored { opacity: .55; }
  .icon { display: grid; place-items: center; width: calc(40px * var(--ui-scale, 1)); height: calc(40px * var(--ui-scale, 1)); border-radius: 10px; background: var(--bg-hover); color: var(--text-muted); flex: none; }
  .is-dir .icon { color: var(--accent); background: var(--accent-soft); }
  .words { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
  .name { font-size: calc(16px * var(--ui-scale, 1)); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .detail { font-size: calc(13px * var(--ui-scale, 1)); color: var(--text-faint); }
  .go { color: var(--text-faint); flex: none; }
  .group { margin: 18px 12px 4px; font-size: calc(13px * var(--ui-scale, 1)); font-weight: 600; color: var(--text-faint); text-transform: uppercase; letter-spacing: .04em; }
  .empty { padding: 32px 16px; text-align: center; color: var(--text-faint); }
</style>
