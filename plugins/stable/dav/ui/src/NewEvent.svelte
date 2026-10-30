<script lang="ts">
  // "Calendar: new event" as a dialog over the app (view.ts, arg NEW_EVENT_DIALOG): the pane's own Editor without the
  // calendar around it, starting at the next full hour. Its result is said in the app's notices, the dialog gone.
  import { untrack } from "svelte";
  import { wall, type PluginApi } from "./api";
  import { Cal } from "./store.svelte";
  import Editor from "./Editor.svelte";

  let { atlas, onclose }: { atlas: PluginApi; onclose: () => void } = $props();
  const cal = untrack(() => new Cal(atlas));
  // the pane's toasts live in the pane; here they are the app's
  cal.toast = (text, kind) => atlas.toast("Calendar", text, kind === "error" ? "error" : "success");
  let ready = $state(false);
  void cal.loadSources().then(() => (ready = true));
  const now = new Date();
  const s = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours() + 1, 0);
</script>

{#if ready}
  {#if cal.writable().length}
    <Editor {cal} start={wall(s)} end={wall(new Date(s.getTime() + 3600_000))} allDay={false} frame="dialog" {onclose} />
  {:else}
    <div class="none">
      <p>No calendar to write to: add a CalDAV account in the Calendar's settings.</p>
      <button class="atlas-btn" onclick={() => atlas.plugin.openSettings()}>Open its settings</button>
    </div>
  {/if}
{:else}
  <p class="none">Loading the calendars…</p>
{/if}

<style>
  .none { padding: 16px; display: grid; gap: 10px; justify-items: start; color: var(--text-muted); margin: 0; }
  .none p { margin: 0; }
</style>
