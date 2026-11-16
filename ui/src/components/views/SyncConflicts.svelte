<script lang="ts">
  // The `sync-conflicts` block: every Syncthing conflict copy the core could not merge and left for the user (core
  // sync_merge.rs `left_copies`, `GET /api/sync/conflicts`), one row each — the note, the device whose version it is,
  // when — with the ways out a note's own banner offers (lib/sync-copies.ts, shared with components/SyncCopies.svelte).
  // Here no editor holds the note: it is read from disk and written back only if unchanged since.
  //   type: sync-conflicts
  import { onMount } from "svelte";
  import { openPath } from "../../lib/dock";
  import { reloadOnChange } from "../../lib/reload-on-change";
  import { dirOf, shownName, shownPath } from "../../lib/paths";
  import { leftCopies, keepThis, takeOther, bothTexts, settleWith, onDisk, madeLabel } from "../../lib/sync-copies";
  import Icon from "../Icon.svelte";
  import SyncCompare from "../SyncCompare.svelte";
  import type { ConflictCopy } from "../../lib/gen/ConflictCopy";

  let copies = $state<ConflictCopy[]>([]);
  let loaded = $state(false);
  let busy = $state(new Set<string>());
  let host = $state<HTMLElement>();

  const load = () => leftCopies().then((l) => { copies = l; loaded = true; });

  /** One way out, the row dimmed meanwhile and gone when it worked (the reload confirms it). */
  async function act(c: ConflictCopy, run: () => Promise<boolean>) {
    busy = new Set(busy).add(c.path);
    const ok = await run();
    busy.delete(c.path); busy = new Set(busy);
    if (ok) copies = copies.filter((x) => x.path !== c.path);
  }

  let comparing = $state<{ c: ConflictCopy; note: ReturnType<typeof onDisk>; mine: string; theirs: string } | null>(null);
  async function compare(c: ConflictCopy) {
    const note = onDisk(c.original);
    const both = await bothTexts(c.path, note);
    if (both) comparing = { c, note, ...both };
  }
  function showBeside(c: ConflictCopy) {
    openPath(c.original);
    openPath(c.path, undefined, { beside: true });
  }

  onMount(() => {
    void load();
    // a copy arrives, or one is settled elsewhere (its banner, the core's merge, the file manager)
    return reloadOnChange(() => void load(), { wait: 1500, wants: (p) => p.includes(".sync-conflict-"), host: () => host });
  });
</script>

<section class="sync-conflicts" bind:this={host} data-testid="sync-conflicts">
  <header>
    <span class="label">Sync conflicts</span>
    {#if copies.length}<span class="n">{copies.length}</span>{/if}
  </header>
  {#if loaded && !copies.length}
    <p class="empty">No conflict copies left: every version Syncthing set aside has been merged or settled.</p>
  {:else if copies.length}
    <p class="why">Two devices changed the same lines of these notes while apart. Each copy is the other device's version, kept beside the note.</p>
    <ul>
      {#each copies as c (c.path)}
        <li class="row" class:busy={busy.has(c.path)} data-testid="sync-conflict">
          <button class="name" onclick={() => openPath(c.original)} title="Open {shownPath(c.original)}">
            <Icon name="file-text" size={13} /><span class="t">{shownName(c.original)}</span>
            {#if dirOf(c.original)}<span class="dir">{dirOf(c.original)}</span>{/if}
          </button>
          <span class="meta">
            <span class="device" title="The device whose version this is: the start of its Syncthing device ID (Syncthing → Actions → Show ID)">{c.device}</span>
            <span class="made" title={shownPath(c.path)}>{madeLabel(c.made)}</span>
          </span>
          <span class="acts">
            <button class="btn btn-ghost" onclick={() => void compare(c)} title="The two versions line by line: choose for each difference">Compare…</button>
            <button class="btn btn-ghost" onclick={() => showBeside(c)}>Show beside</button>
            <button class="btn btn-ghost" onclick={() => void act(c, () => keepThis(c.path))} title="The other version goes to the trash">Keep this one</button>
            <button class="btn primary" onclick={() => void act(c, () => takeOther(c.path, onDisk(c.original)))} title="The note's text becomes the other version's; the copy goes to the trash">Take the other</button>
          </span>
        </li>
      {/each}
    </ul>
  {/if}
</section>

{#if comparing}
  {@const k = comparing}
  <SyncCompare title={shownPath(k.c.original)} mine={k.mine} theirs={k.theirs} oncancel={() => (comparing = null)}
    onapply={(t) => { comparing = null; void act(k.c, () => settleWith(k.c.path, t, k.note)); }} />
{/if}

<style>
  .sync-conflicts { display: flex; flex-direction: column; gap: 4px; font-size: calc(14px * var(--ui-scale, 1)); container-type: inline-size; }
  header { display: flex; align-items: baseline; gap: 8px; }
  .label { font-size: calc(11px * var(--ui-scale, 1)); font-weight: 600; letter-spacing: .07em; text-transform: uppercase; color: var(--text-muted); }
  .n { font-variant-numeric: tabular-nums; color: var(--text-faint); font-size: .92em; }
  .why, .empty { margin: 2px 0 6px; color: var(--text-muted); }
  ul { list-style: none; margin: 0; padding: 0; }
  /* one grid for every copy: the note | its device and date | the ways out */
  .row { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; align-items: center; column-gap: 12px; padding: 6px 0; border-top: 1px solid color-mix(in srgb, var(--border) 60%, transparent); }
  .row:first-child { border-top: 0; }
  .row.busy { opacity: .5; pointer-events: none; }
  .name { display: inline-flex; align-items: baseline; gap: 6px; min-width: 0; padding: 0; border: 0; background: none; color: var(--text); text-align: left; cursor: pointer; }
  .name :global(.icon) { color: var(--text-faint); align-self: center; flex: none; }
  .name .t { font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .name:hover .t { color: var(--accent); }
  .dir { color: var(--text-faint); font-size: .86em; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .meta { display: inline-flex; gap: 10px; color: var(--text-muted); font-size: .88em; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .device { font-family: var(--font-mono); font-size: .95em; padding: 0 5px; border: 1px solid var(--border); border-radius: var(--radius-sm); background: var(--bg-alt); }
  .acts { display: inline-flex; gap: 4px; flex-wrap: wrap; justify-content: flex-end; }
  /* the block's own width (a phone, a page's card): one column, the note's name whole, its device and date and the
     ways out under it */
  @container (max-width: 720px) { .row { grid-template-columns: minmax(0, 1fr); row-gap: 4px; } .acts { justify-content: flex-start; } }
</style>
