<script lang="ts">
  // Settings → Libraries: the vault's `[ui] libraries` (libraries.rs). Its own libraries — a folder or a Base with a
  // kind — added, changed and taken off here; the ones Atlas and the plugins give shown or hidden; all ordered. A
  // server's library is listed apart ("On your servers"): its things are never mixed with the vault's.
  import Icon from "../Icon.svelte";
  import Select from "../Select.svelte";
  import { isIconName } from "../../lib/icons";
  import type { IconName } from "../../lib/panes";
  import type { LibraryKind } from "../../lib/gen/LibraryKind";
  import { vaultFiles } from "../../lib/vault";
  import {
    libraryChoices, libraryHidden, setLibraryHidden, moveLibrary, ownLibrary, editLibrary, removeLibrary, addLibrary, librariesPage,
  } from "../../lib/libraries.svelte";

  const KINDS: { value: LibraryKind; label: string }[] = [
    { value: "books", label: "Books" }, { value: "comics", label: "Comics" }, { value: "audio", label: "Audio" },
    { value: "video", label: "Films" }, { value: "papers", label: "Papers" }, { value: "pictures", label: "Pictures" },
    { value: "drawings", label: "Drawings" }, { value: "notes", label: "Notes" }, { value: "any", label: "Any file" },
  ];
  const SORTS = [
    { value: "", label: "Title" }, { value: "-last_read", label: "Last read first" }, { value: "-modified", label: "Changed first" },
  ];
  const LAYOUTS = [{ value: "covers", label: "Covers" }, { value: "list", label: "List" }];

  const icon = (name: string): IconName => (isIconName(name) ? name : "library");
  const all = $derived(libraryChoices());
  const mine = $derived(all.filter((e) => !e.from));
  const services = $derived(all.filter((e) => e.from));

  // where a library can come from: every folder that holds files, every .base
  const places = $derived.by(() => {
    const dirs = new Set<string>(), bases: string[] = [];
    for (const p of vaultFiles()) {
      if (p.split("/").some((s) => s.startsWith("."))) continue;
      if (p.endsWith(".base")) bases.push(p);
      for (let i = p.indexOf("/"); i > 0; i = p.indexOf("/", i + 1)) dirs.add(p.slice(0, i));
    }
    return [...[...dirs].sort(), ...bases.sort()];
  });
  let place = $state("");
  let kind = $state<LibraryKind | "">("");
  let busy = $state(false);
  async function add() {
    const at = place.trim().replace(/^\/+|\/+$/g, "");
    if (!at || busy) return;
    busy = true;
    const spec = await addLibrary({ ...(at.endsWith(".base") ? { base: at } : { folder: at }), kind: kind || null, title: "" });
    busy = false;
    if (spec) { place = ""; kind = ""; }
  }
  const whereOf = (id: string) => { const s = ownLibrary(id); return s ? (s.folder ? `${s.folder}/` : s.base) : ""; };
</script>

{#snippet row(e: (typeof all)[number], i: number, list: typeof all)}
  {@const own = ownLibrary(e.id)}
  <li class="row" class:off={libraryHidden(e.id)} data-key={e.id}>
    <div class="line">
      <label class="on"><input type="checkbox" checked={!libraryHidden(e.id)} onchange={(ev) => setLibraryHidden(e.id, !ev.currentTarget.checked)} aria-label="Show {e.title}" />
        <Icon name={icon(e.icon)} size={16} /><span class="nm">{e.title}</span></label>
      <span class="where">{own ? whereOf(e.id) : e.from ? `from ${e.from}` : e.by === "core" || e.by === "library" ? "Atlas" : e.by}</span>
      <button class="mv" aria-label="Move {e.title} up" title="Move up" disabled={i === 0} onclick={() => moveLibrary(e.id, -1)}><Icon name="arrow-up" size={13} /></button>
      <button class="mv" aria-label="Move {e.title} down" title="Move down" disabled={i === list.length - 1} onclick={() => moveLibrary(e.id, 1)}><Icon name="arrow-down" size={13} /></button>
      {#if own}<button class="mv" aria-label="Take {e.title} off the list" title="Take off the list (its files stay)" onclick={() => removeLibrary(e.id)}><Icon name="close" size={13} /></button>{/if}
    </div>
    {#if own}
      <div class="opts">
        <Select label="Kind of {e.title}" value={own.kind} options={KINDS} onchange={(v) => editLibrary(e.id, { kind: v })} />
        <Select label="Order of {e.title}" value={SORTS.some((s) => s.value === own.sort) ? own.sort : ""} options={SORTS} onchange={(v) => editLibrary(e.id, { sort: v })} />
        <Select label="Layout of {e.title}" value={own.layout} options={LAYOUTS} onchange={(v) => editLibrary(e.id, { layout: v as "covers" | "list" })} />
      </div>
    {/if}
  </li>
{/snippet}

<section class="settings-panel libraries-panel">
  <h3>Your libraries</h3>
  <p class="desc">Each is a folder or a Base of your vault, shown with covers, what you were reading first, sorted and searched. A plugin's library of the same kind joins it; what lives on a server stays apart, under “From …”.{#if !librariesPage()} <b>The Libraries page is the Catalog plugin's: switch it on in Plugins to see them.</b>{/if}</p>
  <ol class="list" aria-label="Libraries">
    {#each mine as e, i (e.id)}{@render row(e, i, mine)}{:else}<li class="muted">None yet.</li>{/each}
  </ol>
  <form class="add" onsubmit={(ev) => { ev.preventDefault(); void add(); }}>
    <input list="library-places" placeholder="A folder or a .base — Books, Comics, Films.base" bind:value={place} spellcheck="false" aria-label="Folder or Base" />
    <datalist id="library-places">{#each places as p (p)}<option value={p}></option>{/each}</datalist>
    <Select label="Kind" value={kind} options={[{ value: "", label: "Kind: guess" }, ...KINDS]} onchange={(v) => (kind = v as LibraryKind | "")} />
    <button class="btn primary" disabled={!place.trim() || busy}><Icon name="plus" size={13} /> Add</button>
  </form>
  <p class="desc">Or from the file explorer: a folder's menu → <b>Show as a library</b>.</p>

  {#if services.length}
    <h4>On your servers</h4>
    <p class="desc">Libraries of a service your plugins reach (each opens its app from the Library page). Their things are the server's, not your vault's.</p>
    <ol class="list" aria-label="Server libraries">
      {#each services as e, i (e.id)}{@render row(e, i, services)}{/each}
    </ol>
  {/if}
</section>

<style>
  h3 { margin: 10px 0 2px; } /* its look: SettingsPage */
  h4 { margin: 16px 0 2px; font-size: calc(13px * var(--ui-scale, 1)); }
  .desc { margin: 0 0 8px; color: var(--text-faint); font-size: calc(12.5px * var(--ui-scale, 1)); }
  .list { list-style: none; margin: 0 0 8px; padding: 0; display: flex; flex-direction: column; gap: 6px; }
  .row { border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 6px 8px; background: var(--bg-alt); }
  .row.off { opacity: .6; }
  .line { display: flex; align-items: center; gap: 6px; }
  .on { display: flex; align-items: center; gap: 8px; flex: 1; min-width: 0; }
  .nm { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 550; color: var(--heading); }
  .where { color: var(--text-faint); font-size: .88em; max-width: 40%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .mv { display: grid; place-items: center; width: 26px; height: 26px; border-radius: 6px; color: var(--text-muted); }
  .mv:hover:not(:disabled) { background: var(--bg-hover); color: var(--text); }
  .mv:disabled { opacity: .35; }
  .opts { display: flex; flex-wrap: wrap; gap: 6px; margin: 6px 0 2px 26px; }
  .add { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; margin: 4px 0; }
  .add input { flex: 1 1 260px; min-width: 0; }
  .muted { color: var(--text-muted); }
</style>
