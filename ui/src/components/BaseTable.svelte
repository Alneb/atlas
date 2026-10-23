<script lang="ts">
  // An Obsidian Base (`.base`), as Obsidian's Bases draws it: a toolbar (views, Sort, Filter, Properties, New) over the
  // view — a table edited in place, cards, a list, or a board. Used by the Base pane, by notes that embed
  // `![[x.base]]` and by page blocks; every change goes through the core: view edits to the `.base` (bases/edit.rs),
  // cell edits to the note's frontmatter (/api/property).
  import { onMount } from "svelte";
  import Toolbar from "./bases/Toolbar.svelte";
  import BaseGrid from "./bases/BaseGrid.svelte";
  import BaseCards from "./bases/BaseCards.svelte";
  import BaseList from "./bases/BaseList.svelte";
  import BaseBoard from "./bases/BaseBoard.svelte";
  import { errText } from "../lib/text";
  import { shownName, shownPath } from "../lib/paths";
  import { api } from "../lib/api";
  import { on } from "../lib/bus";
  import { openPath } from "../lib/dock";
  import { toast } from "../lib/state.svelte";
  import { propertySpec, watchPropertySpec } from "../lib/property-spec.svelte";
  import { allProps, fieldType, kindOf, propLabel } from "../lib/base-props";
  import type { BaseResult } from "../lib/types";
  import type { ViewEdit } from "../lib/gen/ViewEdit";

  let { path, thisPath, view: initialView, embedded = false }: {
    path: string;
    /** The note embedding the base (Obsidian's `this.file`). */
    thisPath?: string;
    /** `![[x.base#View]]` picks a view by name. */
    view?: string;
    embedded?: boolean;
  } = $props();

  let res = $state<BaseResult | null>(null);
  let error = $state("");
  // svelte-ignore state_referenced_locally -- the initial view only seeds the choice
  let viewName = $state(initialView ?? "");
  let host: HTMLElement;
  let width = $state(0);

  async function load() {
    try { res = await api.base(path, thisPath); error = res.error ?? ""; }
    catch (e) { error = errText(e); }
  }

  /** An embed that names its view (`![[x.base#View]]`, a page's `{view: base, table: …}`) shows that view alone. */
  const pinned = $derived(embedded && !!initialView);
  const view = $derived(res?.views.find((v) => v.name === viewName) ?? res?.views[0] ?? null);
  /** An embed too narrow for a table of its columns draws rows instead. */
  const narrow = $derived(embedded && width > 0 && width < 140 * (view?.columns.length ?? 1));
  const fields = $derived(view && res ? allProps(view, res).map((id) => ({ id, label: propLabel(id, view) })) : []);
  const typeOf = (id: string) => fieldType(id, res, propertySpec.spec);
  const kindFor = (id: string) => kindOf(id, res, propertySpec.spec);

  const fail = (what: string) => (e: unknown) => toast(what, errText(e), "error");
  async function editView(edit: ViewEdit, then?: () => void) {
    if (!view) return;
    try { await api.baseView({ path, view: view.name, edit }); await load(); then?.(); }
    catch (e) { fail("Could not change the base")(e); }
  }
  async function write(note: string, key: string, value: unknown) {
    try { await api.setProperty({ path: note, key, text: "", list: Array.isArray(value), value }); await load(); }
    catch (e) { fail(`Could not change ${key}`)(e); }
  }
  async function newRow() {
    if (!view) return;
    try {
      const r = await api.baseRow(path, view.name);
      openPath(r.path);
      if (!r.matches) toast("Created " + shownPath(r.path), "It does not show in this view yet: fill the properties its filters ask for.");
    } catch (e) { fail("Could not create the note")(e); }
  }

  onMount(() => {
    watchPropertySpec();
    void load();
    let t: ReturnType<typeof setTimeout> | undefined;
    // out of the page (a background tab, a widget scrolled away): noted, reloaded once it is seen again
    let stale = false;
    const seen = new IntersectionObserver((es) => { if (stale && es.some((e) => e.isIntersecting)) { stale = false; void load(); } });
    if (host) seen.observe(host);
    const off = on("fs", (e) => {
      if (!e.paths.some((p) => /\.(md|base)$/i.test(p))) return;
      if (!host?.isConnected) { stale = true; return; }
      clearTimeout(t);
      t = setTimeout(load, 500);
    });
    return () => { off(); clearTimeout(t); seen.disconnect(); };
  });
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="base" class:embedded bind:this={host} bind:clientWidth={width} onmousedown={(e) => embedded && e.stopPropagation()}>
  {#if res && view}
    <div class="top">
      <Toolbar {res} {view} {pinned} compact={embedded && width < 560} props={fields} {typeOf} onpick={(n) => (viewName = n)} onedit={(e, then) => void editView(e, then)} onnew={() => void newRow()} />
      {#if embedded}<button type="button" class="open" onclick={() => openPath(path)} title="Open {path}">{shownName(path)}</button>{/if}
    </div>
  {/if}
  {#if error}
    <p class="err">{error}</p>
  {:else if view && view.kind === "board"}
    <BaseBoard {view} onwrite={(p, k, v) => void write(p, k, v)} />
  {:else if view && view.kind === "cards"}
    <BaseCards {view} />
  {:else if view && (view.kind === "list" || narrow)}
    <BaseList {view} />
  {:else if view}
    <BaseGrid {view} kindOf={kindFor} others={fields.filter((p) => !view.columns.some((c) => c.id === p.id))} onedit={(e) => void editView(e)} onwrite={(p, k, v) => void write(p, k, v)} />
  {:else if res}
    <p class="err">This base has no views.</p>
  {:else}
    <p class="loading">Loading…</p>
  {/if}
</div>

<style>
  .base { position: relative; display: flex; flex-direction: column; min-height: 0; font-family: var(--font-ui); font-size: calc(13px * var(--ui-scale, 1)); color: var(--text); white-space: normal; }
  .base.embedded { border: 1px solid var(--border); border-radius: var(--radius, 8px); background: transparent; margin: 6px 0; max-height: 420px; overflow: hidden; }
  /* in a page's card the card is the frame: no box in a box */
  :global(.pb.card) .base.embedded { border: 0; margin: 0; }
  .top { display: flex; align-items: center; min-width: 0; }
  .top > :global(.toolbar) { flex: 1; }
  .embedded .top { border-bottom: 1px solid var(--border); }
  .embedded .top > :global(.toolbar) { border-bottom: 0; }
  .open { flex: none; margin-right: 8px; color: var(--text-faint); font-size: .88em; padding: 2px 6px; border-radius: 4px; }
  .open:hover { color: var(--text); background: var(--bg-hover); }
  .loading, .err { color: var(--text-faint); padding: 10px; margin: 0; }
  .err { color: var(--red); }
</style>
