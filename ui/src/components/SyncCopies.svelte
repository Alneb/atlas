<script lang="ts">
  // The other device's version of a note that Syncthing kept beside it (`name.sync-conflict-<date>-<time>-<device>.md`)
  // and the core could not merge: both changed the same lines (core sync_merge.rs; DESIGN-mirror-v2.md §4). Said on the
  // note, with the ways out: compare the two line by line and choose per difference, look at it beside this one, keep
  // this one, or take the other.
  import { onMount } from "svelte";
  import { openPath } from "../lib/dock";
  import { reloadOnChange } from "../lib/reload-on-change";
  import { shownPath, basename } from "../lib/paths";
  import { leftCopies, keepThis as keep, takeOther as take2, bothTexts, settleWith, type NoteSide } from "../lib/sync-copies";
  import SyncCompare from "./SyncCompare.svelte";

  let { path, mine, take }: { path: string; mine: () => string; take: (text: string) => void } = $props();

  let copies = $state<string[]>([]);
  // the note is the editor's: its text as typed, and taken back into it (saved by the editor)
  const note: NoteSide = { mine: () => mine(), take: (text) => take(text) };
  const gone = (copy: string) => (ok: boolean) => { if (ok) copies = copies.filter((c) => c !== copy); };

  // which files are this note's copies is the core's one rule (sync_merge.rs), asked of this note's folder only
  const look = () => void leftCopies(path).then((l) => { copies = l.map((c) => c.path); });
  const keepThis = (copy: string) => keep(copy).then(gone(copy));
  const takeOther = (copy: string) => take2(copy, note).then(gone(copy));

  let comparing = $state<{ copy: string; mine: string; theirs: string } | null>(null);
  async function compare(copy: string) {
    const both = await bothTexts(copy, note);
    if (both) comparing = { copy, ...both };
  }
  async function useMerged(copy: string, text: string) {
    comparing = null;
    gone(copy)(await settleWith(copy, text, note));
  }

  onMount(() => {
    look();
    // looked for a moment after a change: the core merges most copies at once, and those need no word
    const stem = basename(path).replace(/\.[^.]*$/, "");
    return reloadOnChange(look, { wait: 2000, wants: (p) => basename(p).startsWith(`${stem}.sync-conflict-`) });
  });
</script>

{#each copies as copy (copy)}
  <div class="banner banner-warn" role="alert" data-testid="sync-copy">
    <span>Another device changed the same lines of this note while the two were apart. Its version is kept as <strong>{shownPath(copy)}</strong>.</span>
    <span class="banner-actions">
      <button class="btn btn-ghost" onclick={() => void compare(copy)} title="The two versions line by line: choose for each difference">Compare…</button>
      <button class="btn btn-ghost" onclick={() => openPath(copy, undefined, { beside: true })}>Show it beside</button>
      <button class="btn btn-ghost" onclick={() => void keepThis(copy)} title="The other version goes to the trash">Keep this one</button>
      <button class="btn primary" onclick={() => void takeOther(copy)} title="This note's text becomes the other version's; the copy goes to the trash">Take the other</button>
    </span>
  </div>
{/each}

{#if comparing}
  {@const c = comparing}
  <SyncCompare title={shownPath(path)} mine={c.mine} theirs={c.theirs} oncancel={() => (comparing = null)} onapply={(t) => void useMerged(c.copy, t)} />
{/if}
