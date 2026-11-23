<script lang="ts">
  // Settings → Vaults & sync: one row per vault on this device's list, each with its sync state in plain words — the
  // line core sync_state.rs writes (`words`), the same line the phone's vault list shows (Setup.java), so both apps say
  // the same thing from one endpoint (`GET /api/sync/state`). Read again every 30 s while shown. Under it, the vault's
  // scheduled jobs and where each runs — here, on its server, on the devices (`GET /api/schedules`, the scheduler's own rules).
  import { onMount } from "svelte";
  import { api } from "../../lib/api";
  import { errReason } from "../../lib/text";
  import type { SyncStatus } from "../../lib/gen/SyncStatus";
  import type { GuestInfo } from "../../lib/gen/GuestInfo";
  import type { JobWhere } from "../../lib/gen/JobWhere";
  import type { JobPlace } from "../../lib/gen/JobPlace";
  import { closeGuest } from "../../lib/guest.svelte";
  import { setAlwaysOn } from "../../lib/vaults";

  // `alwaysOn`: started with the app, its schedules, plugin rounds and notices going on with no window on it (null: a
  // server's page, where every vault it serves runs)
  type Row = { name: string; path: string; current: boolean; state: SyncStatus | null; error: string; alwaysOn: boolean | null; jobs: JobWhere[] };
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
        const alwaysOn = l.manage ? v.always_on : null;
        const at = current ? undefined : v.path;
        // the jobs are extra: a vault whose list cannot be read still shows its state
        const jobs = await api.schedules(at).catch((): JobWhere[] => []);
        try { return { name: v.name, path: v.path, current, state: await api.syncState(at), error: "", alwaysOn, jobs }; }
        catch (e) { return { name: v.name, path: v.path, current, state: null, error: errReason(e), alwaysOn, jobs }; }
      }));
      error = "";
    } catch (e) { error = errReason(e); }
    guests = await api.guests().catch(() => []);
  }
  const close = async (g: GuestInfo) => { if (await closeGuest(g.folder)) guests = guests.filter((x) => x.folder !== g.folder); };
  onMount(() => { void load(); const t = setInterval(() => void load(), 30_000); return () => clearInterval(t); });

  async function toggleAlwaysOn(r: Row): Promise<void> {
    const on = !r.alwaysOn;
    try { await setAlwaysOn(r.path, on); r.alwaysOn = on; error = ""; }
    catch (e) { error = `${r.name}: ${errReason(e)}`; }
  }
  const signIn = (address: string) => window.open(`/signin/door?url=${encodeURIComponent(new URL(address).origin + "/")}`, "_blank");
  const home = (p: string) => p.replace(/^\/home\/[^/]+/, "~");
  const PLACE: Record<JobPlace, string> = { here: "here", server: "on the server", devices: "on the devices", other_computers: "on other computers", off: "off" };
  /** "3 here, 2 on the server" — the places in the order they come. */
  function tally(jobs: JobWhere[]): string {
    const n = new Map<JobPlace, number>();
    for (const j of jobs) n.set(j.place, (n.get(j.place) ?? 0) + 1);
    return [...n].map(([p, k]) => `${k} ${PLACE[p]}`).join(", ");
  }
  const ago = (ms: number) => { const m = Math.round((Date.now() - ms) / 60_000); return m < 60 ? `${m} min ago` : m < 48 * 60 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} days ago`; };
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
      {#if r.alwaysOn !== null}
        <div class="always">
          <button class="switch" class:on={r.alwaysOn} role="switch" aria-checked={r.alwaysOn} aria-label="Keep {r.name} running in the background" data-testid="vault-always-on" onclick={() => void toggleAlwaysOn(r)}><span></span></button>
          <span class="muted">{r.alwaysOn ? "Always on: starts with Atlas; its schedules, plugins and notices run with no window on it" : "Starts when opened: nothing of it runs in the background until then"}</span>
        </div>
      {/if}
      {#if r.jobs.length}
        <details class="jobs" data-testid="vault-jobs">
          <summary>Background jobs: {tally(r.jobs)}</summary>
          {#each r.jobs as j (j.id)}
            <div class="job" data-testid="vault-job" data-place={j.place}>
              <span class="title">{j.title}</span>
              <span class="muted">{j.schedule}</span>
              <span class="place {j.place}">{j.words}</span>
              {#if j.last_run}<span class="muted" class:bad={!j.last_run.ok} title={j.last_run.summary}>{j.last_run.ok ? "ran" : "failed"} {ago(j.last_run.time)}</span>{/if}
            </div>
          {/each}
        </details>
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
  .always { display: flex; gap: 8px; align-items: center; font-size: calc(12.5px * var(--ui-scale, 1)); }
  .jobs { font-size: calc(12.5px * var(--ui-scale, 1)); width: 100%; }
  .jobs summary { cursor: pointer; color: var(--text-muted, var(--text-faint)); }
  .job { display: flex; gap: 10px; flex-wrap: wrap; align-items: baseline; padding: 2px 0 2px 16px; }
  .job .title { color: var(--text); }
  .place { padding: 0 6px; border-radius: 8px; background: var(--bg-hover, var(--bg-alt)); }
  .place.here { color: var(--green); }
  .place.off { color: var(--text-faint); }
</style>
