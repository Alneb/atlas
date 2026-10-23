<script lang="ts">
  // The library page every library is drawn with (lib/library.ts): a source gives the items and what can be done with
  // one; this page searches, sorts, narrows by tab, group or tag, and shows the selected one.
  import { onMount, untrack } from "svelte";
  import { errText } from "../../lib/text";
  import { superOf } from "../../lib/keys";
  import { toast } from "../../lib/state.svelte";
  import { richTitle } from "../../lib/rich-title";
  import { counted, groupTree, inGroup, GROUP_SEP, matches, sortItems, type LibraryAction, type LibraryDetail, type LibraryForm, type LibraryItem, type LibrarySource } from "../../lib/library";
  import Icon from "../Icon.svelte";
  import Select from "../Select.svelte";
  import InputDialog from "../InputDialog.svelte";
  import LibraryCover from "./LibraryCover.svelte";
  import { marquee } from "../../lib/marquee";
  import Backlinks from "../Backlinks.svelte";

  let { source }: { source: LibrarySource } = $props();
  let items = $state<LibraryItem[]>([]);
  let error = $state("");
  let q = $state("");
  // what the side narrows to: a group (collections, shelves) or a tag
  type Scope = { kind: "all" } | { kind: "group"; name: string } | { kind: "tag"; name: string };
  let scope = $state<Scope>({ kind: "all" });
  let tab = $state<string | null>(null);
  let tagsOpen = $state(false);
  let selId = $state<string | null>(null);
  // a page's source never changes: its defaults are read once
  let sortId = $state(untrack(() => source.sorts[0]?.id ?? ""));
  let layout = $state(untrack(() => source.layouts[0]));
  let tools = $state<LibraryAction[]>([]);
  let list: HTMLDivElement;

  async function load() {
    try {
      // an item that did not change keeps its object, so its card and cover are not drawn again: a sync rewriting notes
      // one by one redrew the whole library each time
      const before = new Map(items.map((i) => [i.id, i]));
      items = (await source.load()).map((i) => { const o = before.get(i.id); return o && JSON.stringify(o) === JSON.stringify(i) ? o : i; });
      error = "";
    }
    catch (e) { error = errText(e); }
  }

  const groups = $derived(counted(items, (i) => i.groups));
  // groups named as paths (a server's folders) are a tree: the top ones open at first
  const isTree = $derived(groups.some(([g]) => g.includes(GROUP_SEP)));
  let opened = $state<string[]>([]), closed = $state<string[]>([]);
  const openSet = $derived(new Set([...opened, ...groups.map(([g]) => g.split(GROUP_SEP)[0])].filter((p) => !closed.includes(p))));
  const treeRows = $derived(isTree ? groupTree(groups, openSet) : []);
  function toggle(path: string) {
    if (openSet.has(path)) { opened = opened.filter((p) => p !== path); closed = [...closed, path]; }
    else { closed = closed.filter((p) => p !== path); opened = [...opened, path]; }
  }
  const tags = $derived(counted(items, (i) => i.tags));
  const tabCounts = $derived.by(() => {
    const all = items; // read first: a source's tabs may be empty until its first load, and the count must follow
    const tabs = typeof source.tabs === "function" ? source.tabs() : (source.tabs ?? []);
    return tabs.map((t) => ({ ...t, n: all.filter((i) => i.tab === t.id).length })).filter((t) => t.n || t.always);
  });
  const isScope = (kind: Scope["kind"], name?: string) => scope.kind === kind && (kind === "all" || (scope as { name: string }).name === name);
  const inScope = (i: LibraryItem) =>
    (!tab || i.tab === tab) && (scope.kind === "all" || (scope.kind === "group" ? inGroup(i.groups, scope.name) : (i.tags ?? []).includes(scope.name)));
  const shown = $derived(items.filter((i) => inScope(i) && matches(i, q)));
  const sorted = $derived(sortItems(shown, source.sorts.find((s) => s.id === sortId) ?? { id: "" }));
  const sel = $derived(sorted.find((i) => i.id === selId) ?? sorted[0] ?? null);
  // narrow (a phone, a thin pane): one column, the groups a row of chips, the item's card a sheet opened by a tap —
  // never the first item's card by itself, which kept a third of a phone's width
  let width = $state(1000);
  const narrow = $derived(width < 700);
  const sheet = $derived(narrow ? (selId !== null && sel?.id === selId ? sel : null) : sel);
  let detail = $state<LibraryDetail | null>(null);
  $effect(() => {
    const s = sel;
    if (!s) { detail = null; return; }
    const d = untrack(() => source.detail(s));
    if (!(d instanceof Promise)) { detail = d; return; }
    let live = true;
    void d.then((x) => { if (live) detail = x; }, (e) => { if (live) error = errText(e); });
    return () => { live = false; };
  });

  // an action's form (Edit) and an action that asks first (Delete…)
  let form = $state<{ def: LibraryForm; values: Record<string, string> } | null>(null);
  let asking = $state<Extract<LibraryAction, { confirm: unknown }> | null>(null);
  async function act(a: LibraryAction) {
    if ("edit" in a) { form = { def: a.edit, values: Object.fromEntries(a.edit.fields.map((f) => [f.key, f.value])) }; return; }
    if ("confirm" in a) { asking = a; return; }
    await run(a.run);
  }
  async function run(f: () => unknown) {
    try { await f(); } catch (e) { toast("It did not work", errText(e), "error"); }
    await load();
  }
  async function save() {
    if (!form) return;
    try { await form.def.save(form.values); form = null; await load(); }
    catch (e) { toast("Could not save", errText(e), "error"); }
  }
  const selected = $derived(sel?.id);
  $effect(() => { void selected; form = null; }); // another item: its own form, not this one's (a reload keeps it)

  let adding = $state(false);
  let addText = $state("");
  async function add() {
    if (!source.add || !addText.trim() || adding) return;
    adding = true;
    try {
      const id = await source.add.run(addText.trim());
      await load();
      if (id) selId = id;
      addText = "";
    } catch (e) { toast("Could not add it", errText(e), "error", 9000); }
    finally { adding = false; }
  }

  let dragging = $state(false);
  async function drop(e: DragEvent) {
    e.preventDefault();
    dragging = false;
    if (!source.drop) return;
    const files = [...(e.dataTransfer?.files ?? [])].filter((f) => source.drop!.accept.test(f.name));
    if (!files.length) { toast("Nothing here can take these files"); return; }
    const id = await source.drop.run(files);
    await load();
    if (id) selId = id;
  }

  // several picked, as in a file manager: a drag draws a rectangle (lib/marquee.ts), Ctrl-click adds or takes one,
  // Shift-click a run from the last one clicked, Ctrl+A all shown, Esc none
  let picked = $state<string[]>([]);
  let anchor: string | null = null;
  const pickedItems = $derived.by(() => { const set = new Set(picked); return sorted.filter((i) => set.has(i.id)); });
  const isPicked = (i: LibraryItem) => (picked.length > 1 ? picked.includes(i.id) : sheet?.id === i.id);
  function click(e: MouseEvent, i: LibraryItem) {
    if (e.ctrlKey || e.metaKey) {
      const base = picked.length ? picked : sel ? [sel.id] : [];
      picked = base.includes(i.id) ? base.filter((x) => x !== i.id) : [...base, i.id];
    } else if (e.shiftKey && anchor) {
      const a = sorted.findIndex((x) => x.id === anchor), b = sorted.indexOf(i);
      picked = a < 0 ? [i.id] : sorted.slice(Math.min(a, b), Math.max(a, b) + 1).map((x) => x.id);
    } else picked = [i.id];
    if (!e.shiftKey) anchor = i.id;
    selId = i.id;
  }
  let before: string[] = [];
  function dragPick(ids: string[], add: boolean) {
    if (!add) before = [];
    else if (!before.length) before = picked;
    picked = [...new Set([...before, ...ids])];
    if (ids.length) selId = ids.at(-1)!;
  }
  const manyActions = $derived.by((): LibraryAction[] => {
    const its = pickedItems;
    if (its.length < 2) return [];
    const open = source.open;
    return [...(open ? [{ label: `Open ${its.length}`, icon: "folder-open" as const, primary: true, run: () => { for (const i of its.slice(0, 20)) open(i); } }] : []), ...(source.many?.(its) ?? [])];
  });

  function move(d: number) {
    if (!sorted.length) return;
    const i = Math.max(0, Math.min(sorted.length - 1, (sel ? sorted.indexOf(sel) : -1) + d));
    selId = sorted[i].id;
    picked = [selId];
    anchor = selId;
    requestAnimationFrame(() => list?.querySelector(".row.sel, .card.sel")?.scrollIntoView({ block: "nearest" }));
  }
  function onKey(e: KeyboardEvent) {
    if ((e.target as HTMLElement).closest("input, select, textarea")) return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "a") { e.preventDefault(); picked = sorted.map((i) => i.id); return; }
    if (e.key === "Escape" && picked.length > 1) { e.preventDefault(); picked = sel ? [sel.id] : []; return; }
    if (e.ctrlKey || superOf(e) || e.altKey) return;
    const k = e.key;
    if (k === "ArrowDown" || k === "j" || (layout === "covers" && k === "ArrowRight")) move(1);
    else if (k === "ArrowUp" || k === "k" || (layout === "covers" && k === "ArrowLeft")) move(-1);
    else if (k === "Enter" && sel && source.open) source.open(sel);
    else if (sel && source.keys?.[k]) source.keys[k](sel);
    else return;
    e.preventDefault();
  }

  onMount(() => {
    void load();
    void source.tools?.().then((t) => (tools = t), () => {});
    let t: ReturnType<typeof setTimeout> | undefined;
    // a burst of changes (a sync filing notes) reloads once it pauses
    const off = source.watch?.(() => { clearTimeout(t); t = setTimeout(load, 1200); });
    return () => { off?.(); clearTimeout(t); };
  });
</script>

{#snippet button(a: LibraryAction)}
  <button class="btn" class:primary={a.primary} class:danger={a.danger} disabled={a.disabled} title={a.title} onclick={() => void act(a)}>
    {#if a.icon}<Icon name={a.icon} size={14} />{/if} {a.label}
  </button>
{/snippet}

<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
<div class="library" class:dragging class:narrow bind:clientWidth={width} tabindex="0" onkeydown={onKey} role="application" aria-label={source.title} data-source={source.id}
  ondragover={(e) => { if (source.drop && e.dataTransfer?.types.includes("Files")) { e.preventDefault(); dragging = true; } }}
  ondragleave={(e) => { if (e.currentTarget === e.target) dragging = false; }} ondrop={drop}>
  {#if dragging && source.drop}<div class="drop-hint">{source.drop.hint}</div>{/if}
  <header>
    <h1><Icon name={source.icon} size={18} /> {source.title} <span class="count">{shown.length === items.length ? items.length : `${shown.length} / ${items.length}`}</span></h1>
    <input class="search" placeholder={source.search} bind:value={q} spellcheck="false" />
    {#if source.sorts.length > 1}
      <Select value={sortId} label="Sort by" onchange={(v) => (sortId = v)} options={source.sorts.map((s) => ({ value: s.id, label: `Sort: ${s.label}` }))} />
    {/if}
    {#if source.layouts.length > 1}
      <div class="seg" role="radiogroup" aria-label="Layout">
        {#each source.layouts as l (l)}<button role="radio" aria-checked={layout === l} class:on={layout === l} onclick={() => (layout = l)}>{l === "covers" ? "Covers" : "List"}</button>{/each}
      </div>
    {/if}
    {#if source.add}
      <form class="add" onsubmit={(e) => { e.preventDefault(); void add(); }}>
        <input placeholder={source.add.placeholder} bind:value={addText} spellcheck="false" disabled={adding} />
        <button class="btn primary" disabled={!addText.trim() || adding}>{adding ? source.add.busy : "Add"}</button>
      </form>
    {/if}
    {#each tools as a (a.label)}{@render button(a)}{/each}
  </header>
  {#if tabCounts.length > 1}
    <div class="types" role="toolbar" aria-label="Type">
      <button class="chip" class:on={!tab} onclick={() => (tab = null)}>All <span class="c">{items.length}</span></button>
      {#each tabCounts as t (t.id)}<button class="chip" class:on={tab === t.id} aria-pressed={tab === t.id} onclick={() => (tab = tab === t.id ? null : t.id)}>{t.title} <span class="c">{t.n}</span></button>{/each}
    </div>
  {/if}
  {#if error}<p class="muted pad">{error}</p>{/if}
  <div class="body" class:bare={!groups.length && !tags.length}>
    {#if groups.length || tags.length}
      <nav class="side" aria-label={source.groupsTitle ?? "Groups"}>
        <button class="item" class:on={isScope("all")} onclick={() => (scope = { kind: "all" })}><Icon name={source.icon} size={14} /><span class="n">All {source.noun}</span><span class="c">{items.length}</span></button>
        {#if groups.length}
          <h4>{source.groupsTitle ?? "Groups"}</h4>
          {#if isTree}
            {#each treeRows as r (r.path)}
              <div class="tree-row" style:padding-left="{r.depth * 12}px">
                {#if r.kids}<button class="twisty" aria-label={openSet.has(r.path) ? `Close ${r.name}` : `Open ${r.name}`} aria-expanded={openSet.has(r.path)} onclick={() => toggle(r.path)}><Icon name={openSet.has(r.path) ? "chevron-down" : "chevron"} size={12} /></button>{:else}<span class="twisty"></span>{/if}
                <button class="item" class:on={isScope("group", r.path)} onclick={() => (scope = { kind: "group", name: r.path })} ondblclick={() => r.kids && toggle(r.path)} title={r.path}><Icon name={openSet.has(r.path) && r.kids ? "folder-open" : "folder"} size={14} /><span class="n">{r.name}</span><span class="c">{r.count}</span></button>
              </div>
            {/each}
          {:else}
            {#each groups as [name, c] (name)}
              <button class="item" class:on={isScope("group", name)} onclick={() => (scope = { kind: "group", name })} title={name}><Icon name="folder" size={14} /><span class="n">{name}</span><span class="c">{c}</span></button>
            {/each}
          {/if}
        {/if}
        {#if tags.length}
          <button class="h4" onclick={() => (tagsOpen = !tagsOpen)} aria-expanded={tagsOpen}><Icon name={tagsOpen ? "chevron-down" : "chevron"} size={12} />Tags <span class="c">{tags.length}</span></button>
          {#if tagsOpen || scope.kind === "tag"}
            {#each tags as [name, c] (name)}
              {#if tagsOpen || isScope("tag", name)}
                <button class="item tagitem" class:on={isScope("tag", name)} onclick={() => (scope = { kind: "tag", name })} title={name}><span class="hash">#</span><span class="n">{name}</span><span class="c">{c}</span></button>
              {/if}
            {/each}
          {/if}
        {/if}
      </nav>
    {/if}
    <div class="list" class:covers={layout === "covers"} bind:this={list} use:marquee={{ pick: dragPick }}>
      {#each sorted as i (i.id)}
        {#if layout === "covers"}
          <button class="card" class:sel={isPicked(i)} data-pick={i.id} onclick={(e) => click(e, i)} ondblclick={() => source.open?.(i)} title={i.sub}>
            <LibraryCover cover={i.cover} title={i.title} />
            <span class="t">{@html richTitle(i.title)}</span>
            {#if i.sub}<span class="m">{i.sub}</span>{/if}
          </button>
        {:else}
          <button class="row" class:sel={isPicked(i)} data-pick={i.id} onclick={(e) => click(e, i)} ondblclick={() => source.open?.(i)}>
            <span class="t">{@html richTitle(i.title)}</span>
            {#if i.sub}<span class="m">{i.sub}</span>{/if}
            {#if i.flags?.length}<span class="flags">{#each i.flags as f (f.label)}<span class="flag" class:red={f.tone === "red"}>{f.label}</span>{/each}</span>{/if}
          </button>
        {/if}
      {:else}
        <p class="muted pad none">{items.length ? "Nothing matches." : source.empty}</p>
      {/each}
    </div>
    {#if pickedItems.length > 1}
      <aside class="detail many" aria-label="Picked">
        <div class="kind">{pickedItems.length} {source.noun} picked</div>
        <ul class="picked">{#each pickedItems.slice(0, 12) as i (i.id)}<li>{@html richTitle(i.title)}</li>{/each}{#if pickedItems.length > 12}<li class="muted">and {pickedItems.length - 12} more</li>{/if}</ul>
        <div class="actions">{#each manyActions as a (a.label)}{@render button(a)}{/each}<button class="btn" onclick={() => (picked = sel ? [sel.id] : [])}>Clear</button></div>
      </aside>
    {:else if sheet && detail}
      {#if narrow}<button class="scrim" aria-label="Close" onclick={() => (selId = null)}></button>{/if}
      <aside class="detail">
        {#if narrow}<button class="close icon-btn" aria-label="Close" title="Close" onclick={() => (selId = null)}><Icon name="close" size={16} /></button>{/if}
        {#if form}
          <form class="edit" onsubmit={(e) => { e.preventDefault(); void save(); }} onkeydown={(e) => { if (e.key === "Escape") { e.stopPropagation(); form = null; } }}>
            {#each form.def.fields as f (f.key)}
              <label class:half={f.half}>{f.label}{#if f.hint} <span class="hint">{f.hint}</span>{/if}
                {#if f.rows}<textarea rows={f.rows} bind:value={form.values[f.key]}></textarea>{:else}<input bind:value={form.values[f.key]} />{/if}
              </label>
            {/each}
            <div class="actions"><button class="btn primary">Save</button><button type="button" class="btn" onclick={() => (form = null)}>Cancel</button></div>
          </form>
        {/if}
        {#if layout === "covers"}<LibraryCover cover={sel.cover} title={sel.title} big />{/if}
        {#if detail.kind}<div class="kind">{detail.kind}</div>{/if}
        <h2>{@html richTitle(detail.title)}</h2>
        {#each detail.lines ?? [] as l, n (n)}<p class={l.muted ? "venue" : "authors"}>{l.text}</p>{/each}
        {#if detail.fields?.length}
          <dl>{#each detail.fields as [k, v] (k)}<dt>{k}</dt><dd>{v}</dd>{/each}</dl>
        {/if}
        <div class="actions">{#each detail.actions as a (a.label)}{@render button(a)}{/each}</div>
        {#if detail.choice}
          <div class="choice" role="radiogroup" aria-label={detail.choice.label}>
            <span>{detail.choice.label}</span>
            {#each detail.choice.options as o (o.label)}<button class="chip" role="radio" aria-checked={o.on} class:on={o.on} onclick={() => void run(o.run)}>{o.label}</button>{/each}
          </div>
        {/if}
        {#if detail.links?.length}
          <div class="links">{#each detail.links as l (l.url)}<a href={l.url} target="_blank" rel="noreferrer"><Icon name="link" size={13} /> {l.label}</a>{/each}</div>
        {/if}
        {#if sel.groups?.length || sel.tags?.length}
          <div class="tags">
            {#each sel.groups ?? [] as name (name)}<button class="tag coll" onclick={() => (scope = { kind: "group", name })}><Icon name="folder" size={12} />{name}</button>{/each}
            {#each sel.tags ?? [] as name (name)}<button class="tag" onclick={() => (scope = { kind: "tag", name })}>#{name}</button>{/each}
          </div>
        {/if}
        {#if detail.body}<h3>{detail.body.title}</h3><p class="abstract">{detail.body.text}</p>{/if}
        <!-- the links to it, as under a note -->
        {#if sel.note}<div class="links-bar">{#key sel.note}<Backlinks path={sel.note} />{/key}</div>{/if}
      </aside>
    {/if}
  </div>
</div>

{#if asking}
  <InputDialog title={asking.confirm.title} confirm={asking.confirm.button} hint={asking.confirm.hint}
    onsubmit={() => { const a = asking!; asking = null; void run(a.run); }} oncancel={() => (asking = null)} />
{/if}

<style>
  .types { display: flex; gap: 6px; flex-wrap: wrap; padding: 0 16px 10px; }
  .chip { display: inline-flex; align-items: center; gap: 6px; height: 26px; padding: 0 10px; border-radius: 999px; border: 1px solid var(--border); color: var(--text-muted); font-size: calc(12.5px * var(--ui-scale, 1)); }
  .chip:hover { background: var(--bg-hover); color: var(--text); }
  .chip.on { background: var(--accent-soft); border-color: color-mix(in srgb, var(--accent) 45%, transparent); color: var(--accent); }
  .chip .c { color: var(--text-faint); font-variant-numeric: tabular-nums; }
  .library { height: 100%; display: flex; flex-direction: column; background: var(--bg); outline: none; position: relative; }
  .library.dragging { box-shadow: inset 0 0 0 2px var(--accent); }
  .drop-hint { position: absolute; inset: 0; z-index: 5; display: grid; place-items: center; pointer-events: none;
    background: color-mix(in srgb, var(--bg) 70%, transparent); color: var(--accent); font-size: calc(16px * var(--ui-scale, 1)); font-weight: 600; }
  header { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; padding: 12px 16px; border-bottom: 1px solid var(--border); }
  h1 { display: inline-flex; gap: 8px; align-items: center; margin: 0 8px 0 0; font-size: calc(17px * var(--ui-scale, 1)); color: var(--heading); }
  .count { font-size: .7em; font-weight: 500; color: var(--text-faint); }
  input { font: inherit; font-size: calc(13px * var(--ui-scale, 1)); color: var(--text); background: var(--bg-elev); border: 1px solid var(--border-strong); border-radius: var(--radius-sm); padding: 5px 9px; }
  input:focus { outline: none; border-color: var(--accent); }
  .search { flex: 1; min-width: 220px; }
  .add { display: flex; gap: 6px; }
  .add input { width: 240px; }
  .seg { display: inline-flex; border: 1px solid var(--border-strong); border-radius: var(--radius-sm); overflow: hidden; }
  .seg button { padding: 4px 10px; color: var(--text-muted); }
  .seg button.on { background: var(--accent-soft); color: var(--accent); }
  .btn { display: inline-flex; gap: 6px; align-items: center; border: 1px solid var(--border-strong); }
  .btn:hover:not(:disabled) { background: var(--bg-hover); }
  .btn:disabled { opacity: .45; cursor: default; }
  .btn.danger { color: var(--red); }
  .edit { display: grid; grid-template-columns: 1fr 2fr; gap: 8px; margin: 0 0 14px; padding: 12px; border: 1px solid var(--border-strong); border-radius: var(--radius-sm); background: var(--bg-alt); }
  .edit label { grid-column: 1 / -1; display: flex; flex-direction: column; gap: 3px; color: var(--text-muted); font-size: calc(12px * var(--ui-scale, 1)); }
  .edit label.half { grid-column: auto; }
  .edit .actions { grid-column: 1 / -1; }
  .edit textarea { font: inherit; font-size: calc(13px * var(--ui-scale, 1)); color: var(--text); background: var(--bg-elev); border: 1px solid var(--border-strong); border-radius: var(--radius-sm); padding: 5px 9px; resize: vertical; }
  .hint { color: var(--text-faint); font-weight: 400; }
  .body { flex: 1; min-height: 0; display: grid; grid-template-columns: 210px minmax(300px, 1.15fr) minmax(280px, 1fr); }
  .body.bare { grid-template-columns: minmax(300px, 1.4fr) minmax(280px, 1fr); }
  .side { overflow: auto; border-right: 1px solid var(--border); padding: 8px 6px; background: var(--bg-alt); display: flex; flex-direction: column; gap: 1px; }
  .side h4, .side .h4 { display: flex; align-items: center; gap: 4px; margin: 12px 8px 4px; padding: 0; font-size: calc(10.5px * var(--ui-scale, 1)); font-weight: 600; text-transform: uppercase; letter-spacing: .07em; color: var(--text-muted); text-align: left; }
  .side .h4:hover { color: var(--text); }
  .item { display: flex; align-items: center; gap: 7px; width: 100%; padding: 4px 8px; border-radius: var(--radius-sm); color: var(--text); text-align: left; font-size: calc(12.5px * var(--ui-scale, 1)); }
  .item:hover { background: var(--bg-hover); }
  .item.on { background: var(--accent-soft); color: var(--heading); box-shadow: inset 2px 0 0 var(--accent); }
  .item .n { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .c { color: var(--text-faint); font-size: .85em; font-variant-numeric: tabular-nums; }
  .hash { color: var(--text-faint); width: 14px; text-align: center; }
  .tagitem { color: var(--text-muted); }
  .tag.coll { display: inline-flex; gap: 4px; align-items: center; color: var(--text); }
  .list { overflow: auto; border-right: 1px solid var(--border); padding: 6px; position: relative; user-select: none; -webkit-user-select: none; }
  .list :global(.marquee) { position: absolute; z-index: 2; pointer-events: none; border: 1px solid var(--accent); background: color-mix(in srgb, var(--accent) 12%, transparent); border-radius: 2px; }
  .tree-row { display: flex; align-items: center; min-width: 0; }
  .tree-row .item { flex: 1; min-width: 0; }
  .twisty { flex: none; width: 16px; height: 22px; display: grid; place-items: center; color: var(--text-faint); padding: 0; }
  .twisty:hover { color: var(--text); }
  .picked { margin: 8px 0 12px; padding-left: 18px; font-size: .9em; color: var(--text-muted); }
  .picked li { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .list.covers { display: grid; grid-template-columns: repeat(auto-fill, minmax(118px, 1fr)); gap: 14px 12px; align-content: start; padding: 12px; }
  .row { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 2px 10px; width: 100%; text-align: left; padding: 8px 10px; border-radius: var(--radius-sm); }
  .row:hover { background: var(--bg-hover); }
  .row.sel { background: var(--accent-soft); box-shadow: inset 2px 0 0 var(--accent); }
  .card { display: flex; flex-direction: column; gap: 4px; text-align: left; padding: 4px; border-radius: var(--radius-sm); min-width: 0; }
  .card:hover { background: var(--bg-hover); }
  .card.sel { background: var(--accent-soft); box-shadow: 0 0 0 2px var(--accent); }
  .card .t { font-size: .92em; white-space: normal; display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; }
  .card .m { font-size: .8em; }
  .t { grid-column: 1; color: var(--heading); font-weight: 550; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .m { grid-column: 1; color: var(--text-muted); font-size: .9em; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .flags { grid-column: 2; grid-row: 1 / span 2; display: flex; gap: 4px; align-items: center; }
  .flag { font-size: calc(11px * var(--ui-scale, 1)); padding: 1px 6px; border-radius: 999px; background: var(--bg-hover); color: var(--text-muted); }
  .flag.red { color: var(--red); background: color-mix(in srgb, var(--red) 14%, transparent); }
  .detail { overflow: auto; padding: 18px 22px 40px; }
  .links-bar { position: sticky; bottom: -40px; margin: 18px -22px -40px; display: flex; flex-direction: column; max-height: 50vh; }
  .links-bar :global(.backlinks) { max-height: 50vh; }
  .kind { text-transform: uppercase; letter-spacing: .07em; font-size: calc(11px * var(--ui-scale, 1)); color: var(--text-faint); }
  h2 { margin: 4px 0 6px; font-size: calc(19px * var(--ui-scale, 1)); color: var(--heading); line-height: 1.3; }
  .authors { margin: 0; color: var(--text); }
  .venue { margin: 2px 0 0; color: var(--text-muted); font-style: italic; }
  dl { display: grid; grid-template-columns: max-content minmax(0, 1fr); gap: 3px 12px; font-size: .9em; margin: 10px 0; }
  dt { color: var(--text-faint); }
  dd { margin: 0; overflow-wrap: anywhere; }
  .actions { display: flex; flex-wrap: wrap; gap: 6px; margin: 14px 0 8px; }
  .choice { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin: 4px 0 10px; }
  .choice span { color: var(--text-faint); font-size: .85em; margin-right: 2px; }
  .links { display: flex; flex-wrap: wrap; gap: 14px; margin: 6px 0; }
  .links a { display: inline-flex; gap: 5px; align-items: center; color: var(--link, var(--accent)); text-decoration: none; font-size: .92em; }
  .links a:hover { text-decoration: underline; }
  .tags { display: flex; flex-wrap: wrap; gap: 6px; margin: 8px 0; }
  .tag { font-size: calc(11.5px * var(--ui-scale, 1)); padding: 2px 9px; border-radius: 999px; border: 1px solid var(--border-strong); color: var(--text-muted); }
  .tag:hover { color: var(--text); border-color: var(--accent); }
  h3 { margin: 18px 0 6px; font-size: calc(11px * var(--ui-scale, 1)); text-transform: uppercase; letter-spacing: .07em; color: var(--text-muted); }
  .abstract { margin: 0; line-height: 1.6; color: var(--text); }
  .pad { padding: 12px 16px; }
  /* the covers are a grid: the "nothing here" line spans all its columns (on a phone it sat in one, a word a line) */
  .none { grid-column: 1 / -1; }

  /* narrow: one column; groups as a row of chips; the card as a sheet over the list */
  .narrow header { padding: 10px 12px; gap: 8px; }
  .narrow .search { flex: 1 1 100%; min-width: 0; order: 1; }
  .narrow .add { flex: 1 1 100%; order: 2; }
  .narrow .add input { flex: 1; width: auto; min-width: 0; }
  .narrow .types { padding: 0 12px 8px; flex-wrap: nowrap; overflow-x: auto; }
  .narrow .body, .narrow .body.bare { display: flex; flex-direction: column; }
  .narrow .side { flex: none; flex-direction: row; align-items: center; gap: 6px; overflow-x: auto; overflow-y: hidden; border-right: 0; border-bottom: 1px solid var(--border); padding: 6px 12px; }
  .narrow .side h4, .narrow .side .h4 { margin: 0 2px 0 6px; flex: none; }
  .narrow .side .item { width: auto; flex: none; max-width: 70vw; padding: 5px 10px; border-radius: 999px; border: 1px solid var(--border); }
  .narrow .side .item.on { box-shadow: none; border-color: color-mix(in srgb, var(--accent) 45%, transparent); }
  .narrow .list { flex: 1; border-right: 0; }
  .narrow .list.covers { grid-template-columns: repeat(auto-fill, minmax(104px, 1fr)); gap: 12px 10px; padding: 10px 12px; }
  .scrim { position: absolute; inset: 0; z-index: 6; background: rgb(0 0 0 / .35); border: 0; padding: 0; cursor: default; }
  .narrow .detail { position: absolute; left: 0; right: 0; bottom: 0; z-index: 7; max-height: 80%; padding: 18px 16px calc(24px + env(safe-area-inset-bottom, 0px));
    background: var(--bg-elev); border-top: 1px solid var(--border-strong); border-radius: 14px 14px 0 0; box-shadow: var(--shadow-pop); }
  .narrow .detail :global(.cover.big) { max-height: 180px; }
  /* stays at the sheet's top right while its card scrolls */
  .close { position: sticky; top: 0; float: right; z-index: 1; margin: -8px -6px 0 8px; width: 36px; height: 36px; display: grid; place-items: center; border-radius: 50%; background: var(--bg-hover); }
</style>
