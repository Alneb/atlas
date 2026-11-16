<script lang="ts">
  // Settings → Files & search: a line only while Syncthing conflict copies are left to settle (core sync_merge.rs
  // `left_copies`), opening the Sync conflicts view. Nothing at all when there are none.
  import { onMount } from "svelte";
  import Icon from "../Icon.svelte";
  import { reloadOnChange } from "../../lib/reload-on-change";
  import { leftCopies, openSyncConflicts } from "../../lib/sync-copies";

  let n = $state(0);
  const load = () => void leftCopies().then((l) => { n = l.length; });
  onMount(() => { load(); return reloadOnChange(load, { wait: 1500, wants: (p) => p.includes(".sync-conflict-") }); });
</script>

{#if n}
  <section class="settings-panel sync-conflicts" data-testid="sync-conflicts-line">
    <h3>Sync conflicts</h3>
    <p class="desc">Two devices changed the same lines of a note while apart, and Syncthing kept the other device's version beside it.</p>
    <button class="btn" onclick={openSyncConflicts}><Icon name="refresh" size={13} /> {n} {n === 1 ? "copy" : "copies"} to settle →</button>
  </section>
{/if}

<style>
  h3 { margin: 10px 0 2px; } /* its look: SettingsPage */
  .desc { margin: 0 0 6px; color: var(--text-faint); font-size: calc(12.5px * var(--ui-scale, 1)); }
</style>
