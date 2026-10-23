<script lang="ts">
  // The file explorer, a tab like Dolphin: the vault, SSH hosts, copyparty servers… in one list (lib/file-sources.svelte.ts).
  // Places at the left; a folder's entries with size and date. Its parts (docs/refactor/REFACTOR-explorer.md): the folder
  // and its loading lib/explorer/browse, the places column lib/explorer/places + components/explorer/Places, the keys
  // lib/explorer/keys, what is done to entries lib/explorer/actions, dragging lib/explorer/drag. This file wires them.
  import { onMount, untrack } from "svelte";
  import { basename } from "../lib/paths";
  import { atPointer, below, type MenuAt } from "../lib/menu";
  import type { PaneProps } from "../lib/dock";
  import { openPath } from "../lib/dock";
  import { fileIcon, type IconName } from "../lib/panes";
  import Icon from "../components/Icon.svelte";
  import ContextMenu, { type MenuItem } from "../components/ContextMenu.svelte";
  import Places from "../components/explorer/Places.svelte";
  import { pluginMenu } from "../lib/plugin-menus";
  import { openWith } from "../lib/actions";
  import { on } from "../lib/bus";
  import { api } from "../lib/api";
  import { explorerGo, paneFocus } from "../lib/registry";
  import { shownEntries, toggleShowAll, treeView } from "../lib/tree-view.svelte";
  import { toast } from "../lib/state.svelte";
  import { sources, sourceOf, joinPath, parentPath, vaultSource, type Entry } from "../lib/file-sources.svelte";
  import { Browse, type Loc } from "../lib/explorer/browse.svelte";
  import { PlaceGroups } from "../lib/explorer/places.svelte";
  import { explorerKey, TypeAhead } from "../lib/explorer/keys";
  import { dragRow, dropped, takesDrop } from "../lib/explorer/drag";
  import * as act from "../lib/explorer/actions";
  import type { Confirm, Editing, Here, SayKind } from "../lib/explorer/actions";
  import { thumb } from "../lib/explorer-thumbs";
  import "../lib/other-vaults"; // the other vaults as a source of places
  import { bytes, shortWhen } from "../lib/text";

  let { spec, panel }: PaneProps<"explorer"> = $props();

  let editing = $state<Editing | null>(null);
  let confirm = $state<Confirm | null>(null);
  let msg = $state<{ text: string; kind: SayKind; open?: string } | null>(null);
  const say = (text: string, kind: SayKind = "ok", open?: string) => { msg = { text, kind, open }; };

  const places = new PlaceGroups();
  // svelte-ignore state_referenced_locally -- the tab starts where its parameters say; it keeps them up to date itself
  const b = new Browse({ source: spec.source, place: spec.place, path: spec.path ?? "" }, {
    file: (path) => { const h = here(); if (h) void act.openFile(h, path); },
    stale: (text) => say(text, "bad"),
    shown: (loc) => places.markUp(loc),
    left: () => { editing = null; confirm = null; },
  });

  // List or Thumbnails: remembered in this browser (one choice for every explorer tab)
  const VIEW = "atlas.explorer.view";
  let view = $state<"list" | "thumbs">((() => { try { return localStorage.getItem(VIEW) === "thumbs" ? "thumbs" : "list"; } catch { return "list"; } })());
  const setView = (v: typeof view) => { view = v; try { localStorage.setItem(VIEW, v); } catch { /* for this run */ } };
  let sort = $state<{ by: "name" | "size" | "modified"; desc: boolean }>({ by: "name", desc: false });
  let typing = $state(false);
  let menu = $state<MenuAt | null>(null);
  let dropDir = $state<string | null>(null);
  let listEl = $state<HTMLDivElement>();
  let fileInput = $state<HTMLInputElement>();
  // touch ("the file explorer … needs some tweaking for touchscreens"): a tap opens, as a phone's files app;
  // a long press is the row's menu (the browser's contextmenu); no drag, which a long press would start instead
  let tap: string = "mouse";
  const coarse = typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;

  const loc = $derived(b.loc);
  const src = $derived(sourceOf(loc.source));
  const isVault = $derived(loc.source === vaultSource.id);
  const remote = $derived(!!src && !isVault);
  const placeTitle = $derived(places.place(loc)?.title ?? (loc.place || src?.title || loc.source));
  const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
  const shown = $derived.by(() => {
    const dir = (e: Entry) => (e.kind === "dir" ? 0 : 1);
    const key = sort.by === "name" ? (a: Entry, c: Entry) => collator.compare(a.name, c.name)
      : sort.by === "size" ? (a: Entry, c: Entry) => (a.size ?? 0) - (c.size ?? 0) : (a: Entry, c: Entry) => (a.modified ?? 0) - (c.modified ?? 0);
    return [...shownEntries(b.entries)].sort((a, c) => dir(a) - dir(c) || (sort.desc ? -1 : 1) * key(a, c) || collator.compare(a.name, c.name));
  });
  // the entry selected gone (deleted, moved): its neighbour takes the place, not the first row
  let lastSel = 0;
  const sel = $derived.by(() => {
    const i = shown.findIndex((e) => e.name === b.selName);
    if (i >= 0) lastSel = i;
    return i >= 0 ? i : Math.max(0, Math.min(lastSel, shown.length - 1));
  });
  const current = $derived(shown[sel] as Entry | undefined);
  const crumbs = $derived.by(() => {
    const abs = loc.path.startsWith("/"), parts = loc.path.split("/").filter(Boolean);
    const root = { path: abs ? "/" : "", label: abs ? "/" : placeTitle };
    return [root, ...parts.map((p, i) => ({ path: `${abs ? "/" : ""}${parts.slice(0, i + 1).join("/")}`, label: p }))];
  });

  const full = new Intl.DateTimeFormat(undefined, { dateStyle: "full", timeStyle: "short" }); // the tooltip on a short time
  const iconOf = (e: Entry): IconName => (e.kind === "dir" ? "folder" : e.kind === "link" ? "link" : fileIcon(e.name));
  const go = (to: Loc) => void b.go(to);
  const focusList = () => listEl?.focus();

  /** The tab as it is now, for an action (none while its source is not loaded). */
  function here(): Here | null {
    const s = src;
    if (!s) return null;
    return { src: s, loc: b.loc, isVault, title: placeTitle, say, focus: focusList, reload: (keep) => b.reload(keep),
      ask: (c) => { msg = null; confirm = c; } };
  }
  const run = <A extends unknown[]>(f: (h: Here, ...a: A) => unknown, ...a: A) => { const h = here(); if (h) void f(h, ...a); };
  const enter = (e: Entry) => (e.kind === "file" ? run(act.openFile, joinPath(loc.path, e.name)) : go({ ...loc, path: joinPath(loc.path, e.name) })); // a link: the source says when it is a file
  const rename = (e: Entry) => { b.selName = e.name; editing = { kind: "rename", name: e.name }; };
  function finishEdit(value: string, ok: boolean): void {
    const ed = editing;
    editing = null;
    if (ed) run(act.finishEdit, ed, value, ok); else focusList();
  }

  /** The mouse's side buttons and a swipe over the explorer (lib/nav-input.ts `atlas-nav`): its own folders first. */
  let rootEl = $state<HTMLDivElement>();
  // a long path in a narrow pane: the crumbs scrolled to their end, so the folder shown is the one in view
  let crumbsEl = $state<HTMLDivElement>();
  $effect(() => { void crumbs; const el = crumbsEl; if (el) queueMicrotask(() => (el.scrollLeft = el.scrollWidth)); });
  $effect(() => {
    const el = rootEl;
    if (!el) return;
    const onNav = (e: Event) => {
      const way = (e as CustomEvent<-1 | 1>).detail < 0 ? "back" : "fwd";
      if (!b.history[way].length) return; // nothing there: the app's own back / forward
      e.preventDefault();
      b.travel(way);
    };
    el.addEventListener("atlas-nav", onNav);
    return () => el.removeEventListener("atlas-nav", onNav);
  });

  // the tab keeps where it is (a restored layout opens there) and says it in its title
  $effect(() => {
    const { source, place, path } = loc, title = path ? `${basename(path)}${remote ? ` (${placeTitle})` : ""}` : placeTitle;
    untrack(() => {
      panel.updateParameters({ ...spec, source, place, path }); panel.setTitle(title);
      // in front, in the vault: the sidebar tree shows this folder as where you are
      if (source === vaultSource.id && panel.isActive) window.dispatchEvent(new CustomEvent("atlas-active-file", { detail: path }));
    });
  });
  // a plugin's source can arrive after the tab (a restored layout): load once it is there
  $effect(() => { if (src && b.mode === "nosource") untrack(() => void b.go(b.loc, { record: false })); });
  // again when a source arrives (a plugin loaded after the tab): its group appears
  $effect(() => { void sources.list.length; return untrack(() => places.watch([...sources.list])); });

  // ---- menus ----------------------------------------------------------------------------------------
  function uploadMenu(ev: MouseEvent): void {
    const items: MenuItem[] = [{ label: "From this computer…", icon: "arrow-up", run: () => fileInput?.click() }];
    if (!isVault) items.push({ label: "A file of this vault…", icon: "files", run: () => run(act.uploadVaultFile) });
    menu = below(ev, items);
  }
  /** The places as a menu: what the narrow pane shows instead of the column (hidden under 620 px). */
  function placesMenu(ev: MouseEvent): void {
    const items: MenuItem[] = [];
    for (const g of places.groups) {
      if (items.length) items.push("sep");
      for (const p of g.list) items.push({ label: p.title, detail: g.src.title, icon: g.src.icon, run: () => go({ source: g.src.id, place: p.id, path: "" }) });
    }
    menu = below(ev, items);
  }
  function rowMenu(ev: MouseEvent, e: Entry | null): void {
    ev.preventDefault();
    const s = src;
    if (!s) return;
    if (e) b.selName = e.name;
    const path = e ? joinPath(loc.path, e.name) : loc.path;
    const items: MenuItem[] = [];
    if (e) items.push({ label: "Open", icon: e.kind === "dir" ? "folder-open" : "file", hint: "Enter", run: () => void enter(e) });
    if (e && isVault && e.kind !== "dir") items.push({ label: "Open with…", icon: "plugin", run: () => openWith(path) });
    if (e && remote) items.push({ label: "Download into the vault…", icon: "arrow-down", run: () => run(act.download, e) });
    if (s.mkdir) items.push("sep", { label: "New folder", icon: "folder", run: () => (editing = { kind: "new" }) });
    if (s.upload || isVault) items.push({ label: "Upload from this computer…", icon: "arrow-up", run: () => fileInput?.click() });
    if (e) {
      items.push("sep", { label: "Copy path", icon: "copy", run: () => void navigator.clipboard.writeText(isVault ? path : `${loc.place}:${path}`).then(() => toast("Copied", path)) });
      if (s.rename) items.push({ label: "Rename…", icon: "edit", hint: "F2", run: () => rename(e) });
      if (s.remove) items.push("sep", { label: isVault ? "Move to Trash…" : "Delete…", icon: "close", hint: "Del", danger: true, run: () => run(act.askDelete, e) });
      if (isVault) items.push(...pluginMenu("file", { path, dir: e.kind === "dir" }));
    }
    menu = atPointer(ev, items);
  }

  // ---- keys -----------------------------------------------------------------------------------------
  const ahead = new TypeAhead();
  function onKey(e: KeyboardEvent): void {
    if (b.mode !== "ready" || editing || typing) return;
    const n = shown.length, cur = current;
    const action = explorerKey(e, {
      travel: (w) => b.travel(w), up: () => b.up(), typePath: () => (typing = true), toggleHidden: toggleShowAll,
      move: (to) => { b.selName = shown[Math.max(0, Math.min(n - 1, to))]?.name ?? null; },
      enter: () => cur && enter(cur), reload: () => b.reload(),
      rename: () => { if (cur && src?.rename) rename(cur); }, remove: () => { if (cur) run(act.askDelete, cur); },
      typeAhead: (ch) => { const hit = ahead.next(ch, shown.map((x) => x.name), sel); if (hit) b.selName = hit; },
    }, { sel, n, line: view === "thumbs" ? perLine() : 1, thumbs: view === "thumbs" });
    if (!action) return;
    e.preventDefault();
    e.stopPropagation();
    void action();
  }
  /** Tiles on one line of the Thumbnails grid (what ↑ ↓ jump). */
  function perLine(): number {
    const tiles = [...(listEl?.querySelectorAll<HTMLElement>(".x-row[data-name]") ?? [])];
    const n = tiles.findIndex((t) => t.offsetTop !== tiles[0].offsetTop);
    return n > 0 ? n : Math.max(1, tiles.length);
  }
  $effect(() => { void b.selName; void shown; queueMicrotask(() => listEl?.querySelector(".x-row.sel")?.scrollIntoView({ block: "nearest" })); });

  // ---- dragging -------------------------------------------------------------------------------------
  function dragStart(ev: DragEvent, e: Entry): void {
    const path = joinPath(loc.path, e.name);
    if (ev.dataTransfer) dragRow(ev.dataTransfer, isVault ? { vault: true, path } : { vault: false, source: loc.source, place: loc.place, path, dir: e.kind === "dir" });
  }
  const dirUnder = (ev: DragEvent) => {
    const row = (ev.target as HTMLElement).closest<HTMLElement>(".x-row[data-dir]");
    return row ? joinPath(loc.path, row.dataset.name!) : loc.path;
  };
  function dragOver(ev: DragEvent): void {
    if (!takesDrop(ev.dataTransfer)) return;
    ev.preventDefault();
    dropDir = dirUnder(ev);
  }
  function drop(ev: DragEvent): void {
    const dt = ev.dataTransfer, dir = dirUnder(ev);
    dropDir = null;
    if (!dt) return;
    ev.preventDefault();
    const d = dropped(dt);
    if (!d) return;
    if ("files" in d) run(act.putFiles, d.files, dir);
    else if ("vault" in d) run(act.putVaultFile, d.vault, dir);
    else run(act.dropRemote, d.remote, dir);
  }

  /** The nearest folder above `path` that is still there (the folder shown was moved or deleted elsewhere). */
  async function nearestThere(path: string): Promise<string> {
    for (let p = parentPath(path); ; p = parentPath(p)) if (!p || (await api.exists(p).catch(() => false))) return p;
  }

  onMount(() => {
    // svelte-ignore state_referenced_locally -- the entry asked for when the tab opened
    void b.go(b.loc, { record: false, keep: spec.select }).then(() => { if (!b.gone && !document.activeElement?.closest(".explorer")) focusList(); });
    // asked for again (Show in the explorer, a breadcrumb): there, the entry selected, the keyboard here
    explorerGo.set(panel.id, (path, select) => void b.go({ ...b.loc, path }, { keep: select }).then(focusList));
    paneFocus.set(panel.id, focusList);
    // the vault's own folders follow the disk (another program, the sidebar): the folder shown is read again; the
    // folder itself (or one above it) renamed or deleted → the nearest one still there
    let t: ReturnType<typeof setTimeout> | undefined;
    const off = on("fs", (e) => {
      if (!isVault) return;
      const here = b.loc.path;
      if (here && e.paths.some((p) => p === here || here.startsWith(`${p}/`))) {
        clearTimeout(t);
        t = setTimeout(async () => {
          if (await api.exists(here).catch(() => true)) return void b.reload();
          const to = await nearestThere(here);
          await b.go({ ...b.loc, path: to }, { record: false });
          say(`“${basename(here)}” was moved or deleted; this is the folder above it.`, "bad");
        }, 300);
      } else if (e.paths.some((p) => parentPath(p) === here)) {
        clearTimeout(t); t = setTimeout(() => void b.reload(), 300);
      }
    });
    return () => { b.dispose(); clearTimeout(t); off(); explorerGo.delete(panel.id); paneFocus.delete(panel.id); };
  });

  const focusInput = (el: HTMLInputElement, select: [number, number] | null) => { queueMicrotask(() => { el.focus(); if (select) el.setSelectionRange(...select); else el.select(); }); };
  const nameSel = (name: string, dir: boolean): [number, number] => { const dot = dir ? -1 : name.lastIndexOf("."); return [0, dot > 0 ? dot : name.length]; };
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="explorer" bind:this={rootEl}>
  <Places groups={places.groups} {loc} onpick={go} />

  <section class="main">
    <div class="bar">
      <button class="icon-btn places-btn" title="Places" aria-label="Places" onclick={placesMenu}><Icon name="folder" size={14} /></button>
      <button class="icon-btn" title="Back (Alt+←)" aria-label="Back" disabled={!b.history.back.length} onclick={() => b.travel("back")}><span class="flip"><Icon name="chevron" size={14} /></span></button>
      <button class="icon-btn" title="Forward (Alt+→)" aria-label="Forward" disabled={!b.history.fwd.length} onclick={() => b.travel("fwd")}><Icon name="chevron" size={14} /></button>
      <button class="icon-btn" title="The folder above (Backspace)" aria-label="The folder above" disabled={b.atTop} onclick={() => b.up()}><Icon name="arrow-up" size={14} /></button>
      {#if typing}
        <input class="path" value={loc.path} aria-label="Go to a folder" use:focusInput={null}
          onkeydown={(e) => { e.stopPropagation(); if (e.key === "Enter") { typing = false; const v = (e.currentTarget as HTMLInputElement).value.trim(); go({ ...loc, path: isVault ? v.replace(/^\/+|\/+$/g, "") : v }); } else if (e.key === "Escape") { typing = false; listEl?.focus(); } }}
          onblur={() => (typing = false)} />
      {:else}
        <!-- svelte-ignore a11y_click_events_have_key_events (Ctrl+L, from the list) -->
        <div class="crumbs" bind:this={crumbsEl} title="Click the empty space (or Ctrl+L) to type a path" onclick={() => (typing = true)}>
          {#each crumbs as c, i (c.path)}
            {#if i > 1 || (i === 1 && crumbs[0].path !== "/")}<span class="sep">/</span>{/if}
            <button onclick={(e) => { e.stopPropagation(); go({ ...loc, path: c.path }); }}>{c.label}</button>
          {/each}
        </div>
      {/if}
      <button class="btn" class:on={treeView.showAll} aria-pressed={treeView.showAll} title="Hidden files: dotfiles, companions (a mail's files, a PDF's ink), notes with shown: false — the same in the sidebar tree (Ctrl+H)" onclick={toggleShowAll}>Hidden</button>
      <div class="seg" role="group" aria-label="View">
        <button class="icon-btn" class:on={view === "list"} aria-pressed={view === "list"} title="List: names, sizes and dates" aria-label="List" onclick={() => setView("list")}><Icon name="rows" size={14} /></button>
        <button class="icon-btn" class:on={view === "thumbs"} aria-pressed={view === "thumbs"} title="Thumbnails: pictures, the first page of PDFs" aria-label="Thumbnails" onclick={() => setView("thumbs")}><Icon name="grid" size={14} /></button>
      </div>
      {#if src?.mkdir}<button class="btn" title="Make a folder here" onclick={() => (editing = { kind: "new" })}>New folder</button>{/if}
      {#if src && (src.upload || isVault)}<button class="btn" title="Put files into this folder" onclick={uploadMenu}>Upload…</button>{/if}
      <button class="icon-btn" title="Refresh (F5)" aria-label="Refresh" onclick={() => void b.reload()}><Icon name="refresh" size={14} /></button>
    </div>
    {#if confirm}
      {@const c = confirm}
      <div class="confirm" role="alertdialog" tabindex="-1" onkeydown={(e) => { if (e.key === "Escape") { e.stopPropagation(); confirm = null; listEl?.focus(); } }}>
        <span>{c.text}</span>
        <!-- svelte-ignore a11y_autofocus -->
        <button class="btn" class:danger={c.danger} class:primary={!c.danger} autofocus onclick={() => { const run = c.run; confirm = null; void run(); }}>{c.yes}</button>
        <button class="btn" onclick={() => { confirm = null; listEl?.focus(); }}>Cancel</button>
      </div>
    {/if}
    <div class="list" class:thumbs={view === "thumbs"} bind:this={listEl} tabindex="0" role="listbox" aria-label="Files in {loc.path || placeTitle}" class:drop-here={dropDir === loc.path}
      onkeydown={onKey} oncontextmenu={(e) => rowMenu(e, null)} ondragover={dragOver} ondragleave={(e) => { if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) dropDir = null; }} ondrop={drop}>
      {#if b.mode === "loading"}
        <div class="note">Opening {loc.path || placeTitle}…</div>
      {:else if b.mode === "nosource"}
        <div class="note"><strong>Waiting for “{loc.source}”</strong><div>Its plugin is not loaded (yet). Is it switched on in Settings → Plugins?</div></div>
      {:else if b.mode === "waiting"}
        <div class="note"><strong>Waiting for the login to {placeTitle}</strong><div>{b.note} The list opens by itself once you are connected.</div><button class="btn" onclick={() => void b.go(loc, { record: false })}>Try again</button></div>
      {:else if b.mode === "error"}
        <div class="note error"><strong>Could not open {loc.path || placeTitle}</strong><div>{b.note}</div>
          <button class="btn" onclick={() => void b.go(loc, { record: false })}>Try again</button>
          {#if !b.atTop}<button class="btn" onclick={() => b.up()}>The folder above</button>{/if}
        </div>
      {:else}
        <div class="head">
          {#each [["name", "Name"], ["size", "Size"], ["modified", "Modified"]] as [by, label] (by)}
            <button class="col {by}" onclick={() => (sort = { by: by as typeof sort.by, desc: sort.by === by ? !sort.desc : by !== "name" })}>
              {label}{#if sort.by === by}<span class="arrow">{sort.desc ? "↓" : "↑"}</span>{/if}
            </button>
          {/each}
        </div>
        <div class="rows">
        {#if editing?.kind === "new"}
          <div class="x-row sel">
            <span class="name"><Icon name="folder" size={15} /><input class="rename" placeholder="Folder name" aria-label="New folder name" use:focusInput={null}
              onkeydown={(e) => { e.stopPropagation(); if (e.key === "Enter") finishEdit((e.currentTarget as HTMLInputElement).value, true); else if (e.key === "Escape") finishEdit("", false); }}
              onblur={(e) => { if (editing) finishEdit(e.currentTarget.value, false); }} /></span>
          </div>
        {/if}
        {#each shown as e, i (e.name)}
          {@const renaming = editing?.kind === "rename" && editing.name === e.name}
          <!-- svelte-ignore a11y_click_events_have_key_events (the list takes the keys) -->
          <div class="x-row {e.kind}" tabindex="-1" class:sel={i === sel} class:drop-into={dropDir !== null && dropDir !== loc.path && dropDir === joinPath(loc.path, e.name)}
            role="option" aria-selected={i === sel} data-name={e.name} data-dir={e.kind === "dir" ? "" : undefined} draggable={!renaming && !coarse}
            onpointerdown={(ev) => (tap = ev.pointerType)}
            onclick={() => { b.selName = e.name; focusList(); if (tap !== "mouse" && !renaming) void enter(e); }} ondblclick={() => void enter(e)} oncontextmenu={(ev) => { ev.stopPropagation(); rowMenu(ev, e); }} ondragstart={(ev) => dragStart(ev, e)}>
            <span class="name">
              {#if view === "thumbs"}
                <span class="pic"><Icon name={iconOf(e)} size={36} />
                  {#if src?.thumb && e.kind === "file"}<img alt="" use:thumb={{ src, place: loc.place, path: joinPath(loc.path, e.name), entry: e }} />{/if}
                </span>
              {:else}<Icon name={iconOf(e)} size={15} />{/if}
              {#if renaming}
                <input class="rename" value={e.name} aria-label="New name for {e.name}" use:focusInput={nameSel(e.name, e.kind === "dir")}
                  onkeydown={(ev) => { ev.stopPropagation(); if (ev.key === "Enter") finishEdit((ev.currentTarget as HTMLInputElement).value, true); else if (ev.key === "Escape") finishEdit("", false); }}
                  onblur={(ev) => { if (editing) finishEdit(ev.currentTarget.value, false); }} />
              {:else}<span class="label" title={view === "thumbs" ? e.name : undefined}>{e.name}</span>{/if}
            </span>
            <span class="num">{e.kind === "dir" ? "" : bytes(e.size)}</span>
            <span class="when" title={e.modified ? full.format(new Date(e.modified * 1000)) : undefined}>{shortWhen(e.modified)}</span>
            <span class="acts">
              {#if e.kind !== "dir"}<button title="Open it in a tab" onclick={(ev) => { ev.stopPropagation(); void enter(e); }}>Open</button>{/if}
              {#if remote}<button title="Into a folder of this vault" onclick={(ev) => { ev.stopPropagation(); run(act.download, e); }}>Download…</button>{/if}
              {#if src?.rename}<button title="F2" onclick={(ev) => { ev.stopPropagation(); rename(e); }}>Rename</button>{/if}
              {#if src?.remove}<button class="danger" title="Delete (asks first)" onclick={(ev) => { ev.stopPropagation(); b.selName = e.name; run(act.askDelete, e); }}>Delete</button>{/if}
            </span>
          </div>
        {/each}
        </div>
        {#if !shown.length && editing?.kind !== "new"}
          <div class="note">{b.entries.length ? "Only hidden files here: “Hidden” shows them." : "This folder is empty. Drop files here, or make a folder."}</div>
        {/if}
      {/if}
    </div>
    <div class="status">
      <span class="msg {msg?.kind ?? ''}" role="status">{msg?.text ?? ""}</span>
      {#if msg?.open}{@const o = msg.open}<button onclick={() => openPath(o)}>Open</button>{/if}
      {#if b.mode === "ready"}
        {@const dirs = shown.filter((e) => e.kind === "dir").length}
        <span>{b.refreshing ? "updating… · " : ""}{shown.length} item{shown.length === 1 ? "" : "s"}{dirs ? ` · ${dirs} folder${dirs === 1 ? "" : "s"}` : ""}</span>
      {/if}
    </div>
  </section>
  <input type="file" multiple hidden bind:this={fileInput} onchange={(e) => { const f = [...(e.currentTarget.files ?? [])]; e.currentTarget.value = ""; run(act.putFiles, f); }} />
</div>
{#if menu}<ContextMenu x={menu.x} y={menu.y} items={menu.items} onclose={() => (menu = null)} />{/if}

<style>
  .explorer { display: flex; height: 100%; min-height: 0; container-type: inline-size; font-size: calc(13px * var(--ui-scale, 1)); color: var(--text); background: var(--bg); }
  button { font: inherit; color: inherit; background: transparent; border: 0; cursor: pointer; }
  .main { flex: 1; min-width: 0; display: flex; flex-direction: column; }
  .bar { display: flex; align-items: center; gap: 4px; padding: 6px 10px; border-bottom: 1px solid var(--border); flex: none; min-width: 0; }
  .icon-btn { display: inline-flex; align-items: center; justify-content: center; width: 26px; height: 26px; border-radius: var(--radius-sm); color: var(--text-muted); flex: none; }
  .icon-btn:hover:not(:disabled) { background: var(--bg-hover); color: var(--text); }
  .icon-btn:disabled { opacity: .35; cursor: default; }
  .flip { display: inline-flex; transform: scaleX(-1); }
  .bar > :not(.crumbs) { flex: none; }
  .crumbs { flex: 1; min-width: 0; display: flex; align-items: center; overflow-x: auto; scrollbar-width: none; white-space: nowrap; font-family: var(--font-mono); font-size: .95em; border-radius: var(--radius-sm); padding: 0 4px; min-height: 26px; cursor: text; }
  .crumbs:hover { background: var(--bg-hover); }
  .crumbs button { padding: 2px 3px; border-radius: var(--radius-sm); color: var(--text-muted); flex: none; }
  .crumbs button:hover { color: var(--text); background: var(--bg-active); }
  .crumbs button:last-child { color: var(--text); font-weight: 600; }
  .crumbs .sep { color: var(--text-faint); padding: 0 1px; }
  .path { flex: 1; min-width: 0; font: inherit; font-family: var(--font-mono); color: var(--text); background: var(--bg-elev); border: 1px solid var(--accent); border-radius: var(--radius-sm); padding: 3px 6px; outline: none; }
  .btn { display: inline-flex; align-items: center; min-height: 26px; padding: 0 9px; border-radius: var(--radius-sm); border: 1px solid var(--border); color: var(--text-muted); flex: none; white-space: nowrap; }
  .btn:hover { color: var(--text); background: var(--bg-hover); border-color: var(--border-strong); }
  .btn.on { color: var(--accent); border-color: var(--accent); }
  .btn.danger { color: #fff; background: var(--red); border-color: var(--red); }
  .btn:focus-visible, .icon-btn:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
  .confirm { display: flex; align-items: center; gap: 8px; padding: 8px 12px; background: var(--bg-elev); border-bottom: 1px solid var(--border); flex: none; }
  .confirm span { flex: 1; min-width: 0; }
  .list { flex: 1; min-height: 0; overflow: auto; padding: 4px 6px 16px; outline: none; }
  .list.drop-here { box-shadow: inset 0 0 0 1px var(--accent); }
  .head, .x-row { display: grid; grid-template-columns: minmax(0, 1fr) 6.5em 8.5em; align-items: center; gap: 10px; padding: 0 8px; }
  .head { position: sticky; top: 0; z-index: 1; background: var(--bg); padding-top: 3px; padding-bottom: 3px; }
  .col { text-align: left; color: var(--text-faint); font-size: calc(11px * var(--ui-scale, 1)); text-transform: uppercase; letter-spacing: .06em; padding: 2px 0; }
  .col:hover { color: var(--text); }
  .col.size { text-align: right; }
  .arrow { margin-left: 4px; }
  .x-row { position: relative; min-height: 28px; border-radius: var(--radius-sm); cursor: default; user-select: none; }
  .x-row:hover { background: var(--bg-hover); }
  .x-row.sel { background: var(--accent-soft); }
  .x-row.drop-into { box-shadow: inset 0 0 0 1px var(--accent); }
  .name { display: flex; align-items: center; gap: 8px; min-width: 0; color: var(--text-faint); }
  .x-row.dir .name { color: var(--accent); }
  .label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text); }
  .num { text-align: right; font-variant-numeric: tabular-nums; color: var(--text-muted); white-space: nowrap; }
  .when { color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-variant-numeric: tabular-nums; }
  /* the row's buttons float over its right end while the pointer is on it: no column of their own to collide with */
  .acts { position: absolute; right: 4px; top: 50%; transform: translateY(-50%); display: flex; gap: 2px; padding: 1px; visibility: hidden;
    border-radius: var(--radius-sm); background: var(--bg-elev); box-shadow: 0 0 0 1px var(--border), 0 2px 6px rgb(0 0 0 / .15); }
  .x-row:hover .acts { visibility: visible; }
  .acts button { min-height: 22px; padding: 0 7px; border-radius: var(--radius-sm); color: var(--text-muted); }
  .acts button:hover { color: var(--text); background: var(--bg-active); }
  .acts button.danger:hover { color: var(--red); }
  .rename { font: inherit; color: var(--text); background: var(--bg-elev); border: 1px solid var(--accent); border-radius: var(--radius-sm); padding: 2px 6px; min-width: 0; flex: 1; outline: none; }
  .note { padding: 28px 18px; color: var(--text-muted); max-width: 60ch; line-height: 1.45; }
  .note strong { color: var(--text); display: block; }
  .note.error strong { color: var(--red); }
  .note .btn { margin-top: 10px; margin-right: 6px; }
  .status { display: flex; align-items: center; gap: 8px; padding: 5px 12px; border-top: 1px solid var(--border); color: var(--text-faint); font-size: calc(12px * var(--ui-scale, 1)); flex: none; min-height: 28px; }
  .status .msg { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .status .msg.ok { color: var(--text-muted); }
  .status .msg.bad { color: var(--red); }
  .status button { color: var(--accent); padding: 0 4px; }
  .seg { display: inline-flex; border: 1px solid var(--border); border-radius: var(--radius-sm); flex: none; }
  .seg .icon-btn { width: 26px; height: 24px; border-radius: 0; }
  .seg .icon-btn.on { color: var(--accent); background: var(--accent-soft); }
  /* Thumbnails: the same rows as tiles */
  .list.thumbs .head { display: none; }
  .list.thumbs .rows { display: grid; grid-template-columns: repeat(auto-fill, minmax(132px, 1fr)); gap: 6px; padding-top: 4px; }
  .list.thumbs .x-row { display: flex; flex-direction: column; align-items: stretch; padding: 6px; gap: 0; }
  .list.thumbs .num, .list.thumbs .when { display: none; }
  .list.thumbs .name { flex-direction: column; gap: 5px; }
  .list.thumbs .label { max-width: 100%; text-align: center; font-size: .95em; }
  .list.thumbs .acts { top: 6px; transform: none; right: 6px; flex-direction: column; align-items: stretch; }
  .pic { position: relative; display: flex; align-items: center; justify-content: center; width: 100%; aspect-ratio: 4 / 3; border-radius: var(--radius-sm); border: 1px solid var(--border); background: var(--bg-elev); overflow: hidden; }
  .pic img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; opacity: 0; }
  :global(.x-row.has-thumb) .pic img { opacity: 1; background: var(--bg-elev); }
  @container (max-width: 820px) { .head, .x-row { grid-template-columns: minmax(0, 1fr) 6em; } .when { display: none; } .head .modified { display: none; } }
  .places-btn { display: none; }
  @container (max-width: 700px) { .places-btn { display: inline-flex; } }
  /* a narrow explorer: the buttons on one line, the path on its own line under them (it was squeezed to nothing) */
  @container (max-width: 700px) { .bar { flex-wrap: wrap; row-gap: 4px; } .crumbs { order: 10; flex-basis: 100%; } }
  /* a finger's targets: rows and buttons ~40 px; the row's hover buttons never show (long press: its menu) */
  @media (pointer: coarse) {
    .x-row { min-height: 44px; }
    .icon-btn { width: 40px; height: 40px; }
    .btn { min-height: 36px; }
    .list:not(.thumbs) .acts { display: none; }
  }
  @container (max-width: 480px) { .list:not(.thumbs) .acts { display: none; } }
</style>
