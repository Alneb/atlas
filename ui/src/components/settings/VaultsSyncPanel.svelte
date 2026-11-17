<script lang="ts">
  // Settings → Vaults & sync: one row per vault on this device's list, each with its sync state in plain words — the
  // line core sync_state.rs writes (`words`), the same line the phone's vault list shows (Setup.java), so both apps say
  // the same thing from one endpoint (`GET /api/sync/state`). Read again every 30 s while shown.
  import { onMount } from "svelte";
  import { api } from "../../lib/api";
  import { errReason } from "../../lib/text";
  import type { SyncStatus } from "../../lib/gen/SyncStatus";
  import type { GuestInfo } from "../../lib/gen/GuestInfo";
  import { closeGuest } from "../../lib/guest.svelte";

  type Row = { name: string; path: string; current: boolean; state: SyncStatus | null; error: string };
  let rows = $state<Row[]>([]);
  let error = $state("");
  /** The guest folders open now (core guest.rs), each closable here; none off the desktop. */
  let guests = $state<GuestInfo[]>([]);

  async function load(): Promise<void> {
    try {
      const l = await api.vaults();
      // a server's page lists the server's own folders: only this one's state is its to say
      const listed = l.manage ? l.vaults.filter((v) => !v.missing && !/^https?:/.test(v.path)) : l.vaults.filter((v) => v.path === l.current);
      rows = await Promise.all(listed.map(async (v): Promise<Row> => {
        const current = v.path === l.current;
        try { return { name: v.name, path: v.path, current, state: await api.syncState(current ? undefined : v.path), error: "" }; }
        catch (e) { return { name: v.name, path: v.path, current, state: null, error: errReason(e) }; }
      }));
      error = "";
    } catch (e) { error = errReason(e); }
    guests = await api.guests().catch(() => []);
  }
  const close = async (g: GuestInfo) => { if (await closeGuest(g.folder)) guests = guests.filter((x) => x.folder !== g.folder); };
  onMount(() => { void load(); const t = setInterval(() => void load(), 30_000); return () => clearInterval(t); });

  const signIn = (address: string) => window.open(`/signin/door?url=${encodeURIComponent(new URL(address).origin + "/")}`, "_blank");
  const home = (p: string) => p.replace(/^\/home\/[^/]+/, "~");
</script>

<section class="settings-panel vaults-sync" data-testid="vaults-sync">
  <h3>Vaults</h3>
  <p class="desc">How each vault on this device is kept in step: what carries its files, whether its server answers, and what is left to look at. The phone's vault list says the same.</p>
  {#if error}<p class="bad">{error}</p>{/if}
  {#each rows as r (r.path)}
    <div class="vault" data-testid="vault-sync-row">
      <div class="head"><strong>{r.name}</strong>{#if r.current}<span class="tag">this window</span>{/if}<span class="muted path">{home(r.path)}</span></div>
      {#if r.state}
        <div class="line {r.state.level}" data-testid="vault-sync-words">{r.state.words}</div>
        {#if r.state.server === "signin" && r.state.mirror}<button class="btn" onclick={() => signIn(r.state!.mirror!)}>Sign in to the server</button>{/if}
      {:else}
        <div class="line warning">Its state could not be read: {r.error}</div>
      {/if}
    </div>
  {:else}
    {#if !error}<p class="muted">No vault on this device's list.</p>{/if}
  {/each}
  {#if guests.length}
    <h3>Guest folders open</h3>
    <p class="desc">Folders opened as a guest, each in a window of its own: not on the list, forgotten when Atlas restarts. Close one to end it now; its files stay.</p>
    {#each guests as g (g.folder)}
      <div class="vault guest" data-testid="guest-row">
        <div class="head"><strong>{g.folder.split(/[\\/]/).pop()}</strong><span class="tag">{g.editing ? "editing" : "read-only"}</span><span class="muted path">{home(g.folder)}</span></div>
        <button class="btn" onclick={() => void close(g)}>Close</button>
      </div>
    {/each}
  {/if}
</section>

<style>
  h3 { margin: 10px 0 2px; } /* its look: SettingsPage */
  .desc { margin: 0 0 8px; color: var(--text-faint); font-size: calc(12.5px * var(--ui-scale, 1)); }
  .vault { padding: 7px 0; border-top: 1px solid var(--border); display: flex; flex-direction: column; gap: 3px; align-items: flex-start; }
  .head { display: flex; gap: 8px; align-items: baseline; flex-wrap: wrap; }
  .path { font-size: calc(12px * var(--ui-scale, 1)); overflow-wrap: anywhere; }
  .muted { color: var(--text-faint); }
  .tag { font-size: calc(11px * var(--ui-scale, 1)); padding: 0 6px; border-radius: 8px; background: var(--bg-hover, var(--bg-alt)); color: var(--text-muted, var(--text-faint)); }
  .line { font-size: calc(13px * var(--ui-scale, 1)); color: var(--text); }
  .line.success { color: var(--green); }
  .line.warning { color: var(--orange); }
  .line.failure { color: var(--red); }
  .bad { color: var(--red); }
</style>
