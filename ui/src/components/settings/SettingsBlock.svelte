<script lang="ts">
  // A Settings page as a block in a .page or a ```view (`type: settings`, `page: appearance`): the
  // options live beside the work they change. Unknown page → the list of known ones.
  import { onMount } from "svelte";
  import { settings, loadSuggestions } from "../../lib/settings.svelte";
  import { leaves } from "../../lib/settings-schema";
  import { placeFields, hostOf } from "../../lib/settings-pages";
  import { nativeShell } from "../../lib/native-shell.svelte";
  import { apiBase } from "../../lib/api";
  import { me, loadMe } from "../../lib/me.svelte";
  import SettingsPage from "./SettingsPage.svelte";
  import { open } from "../../lib/dock";

  let { src }: { src: string } = $props();
  const want = $derived(/^\s*page:\s*["']?([\w-]+)/m.exec(src)?.[1] ?? "appearance");
  const fields = $derived.by(() => { void settings.schema; return leaves(); });
  const pages = $derived(placeFields([...fields.keys()], hostOf({ server: !!me.info?.server, phone: nativeShell.on, path: apiBase() })));
  const page = $derived(pages.find((p) => p.page === want));
  onMount(() => { loadSuggestions().catch(() => {}); void loadMe(); });
</script>

<div class="settings-block">
  {#if !settings.config || !settings.schema}
    <p class="muted">Loading settings…</p>
  {:else if page}
    <SettingsPage {page} {fields} {pages} go={() => open({ kind: "settings" })} embedded />
  {:else}
    <p class="view-error">No settings page “{want}”. Known: {pages.map((p) => p.page).join(", ")}.</p>
  {/if}
</div>

<style>
  .settings-block { padding: 4px 2px; }
  .muted { color: var(--text-muted); }
</style>
