<script lang="ts">
  // The plugin store: every plugin the release offers (its plugins.json, `GET /api/plugins/available`) as a card —
  // what it does, its tier, version, size, whether it runs on this computer — with one button: Install, Update or
  // Installed. Search and filters on top; "Update all" when updates wait. Installing goes through the one install path
  // (plugin-manage.ts installFrom), updating through the plugin's own source (updatePlugin), so the vault's settings stay.
  import Icon from "../Icon.svelte";
  import { api } from "../../lib/api";
  import { errText } from "../../lib/text";
  import { installFrom, updatePlugin } from "../../lib/plugin-manage";
  import { plugins, loadPlugins } from "../../lib/plugins.svelte";
  import type { Available } from "../../lib/gen/Available";
  import { isIconName } from "../../lib/icons";
  import { toast } from "../../lib/state.svelte";

  type Show = "all" | "new" | "installed" | "updates";
  let offered = $state<Available[] | null>(null);
  let failed = $state("");
  let busy = $state<Set<string>>(new Set());
  let q = $state("");
  let show = $state<Show>("all");
  let tier = $state<"" | "stable" | "beta">("");

  // only the latest read is shown: two installs at once must not leave the earlier answer (B still "Install") on top
  let loadSeq = 0;
  async function load() {
    const mine = ++loadSeq;
    failed = "";
    try { const r = await api.availablePlugins(); if (mine === loadSeq) offered = r; } catch (e) { if (mine === loadSeq) failed = errText(e); }
  }
  void load();

  const words = (a: Available) => `${a.title} ${a.id} ${a.description ?? ""}`.toLowerCase();
  const list = $derived.by(() => {
    const t = q.trim().toLowerCase();
    return (offered ?? [])
      .filter((a) => (!t || t.split(/\s+/).every((w) => words(a).includes(w))) && (!tier || a.tier === tier))
      .filter((a) => show === "all" || (show === "new" ? a.installed === undefined : show === "installed" ? a.installed !== undefined : a.update))
      // what wants a hand first: updates, then what is not here yet; stable before beta; then by name
      .sort((a, b) => Number(b.update) - Number(a.update) || Number(a.installed !== undefined) - Number(b.installed !== undefined)
        || (a.tier === b.tier ? 0 : a.tier === "stable" ? -1 : 1) || a.title.localeCompare(b.title));
  });
  const count = (s: Show) => (offered ?? []).filter((a) => s === "all" || (s === "new" ? a.installed === undefined : s === "installed" ? a.installed !== undefined : a.update)).length;
  const updates = $derived((offered ?? []).filter((a) => a.update));

  const iconOf = (a: Available) => (a.icon && isIconName(a.icon) ? a.icon : "plugin");
  const sizeOf = (n?: number) => (n === undefined ? "" : n < 1 << 20 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / (1 << 20)).toFixed(1)} MB`);

  async function act(a: Available) {
    if (busy.has(a.id)) return; // already on its way (a second click, or Update all)
    busy = new Set([...busy, a.id]);
    try {
      if (a.installed === undefined) await installFrom(a.url);
      else {
        if (!plugins.loaded) await loadPlugins();
        const p = plugins.list.find((x) => x.id === a.id);
        if (p) await updatePlugin(p);
        else toast(`${a.title} was not updated`, "It is in .atlas/plugins/ but not loaded: Settings → Plugins says why.", "error");
      }
      await load();
    } finally { busy = new Set([...busy].filter((x) => x !== a.id)); }
  }
  let updatingAll = $state(false);
  async function updateAll() {
    if (updatingAll) return;
    updatingAll = true;
    try { for (const a of [...updates]) await act(a); } finally { updatingAll = false; }
  }
</script>

<section class="settings-panel store" aria-label="Plugin store">
  <div class="top">
    <h3>Plugin store {#if offered}<span class="n">{offered.length}</span>{/if}</h3>
    {#if updates.length || updatingAll}<button class="btn primary" disabled={updatingAll} onclick={updateAll}><Icon name="refresh" size={13} /> {updatingAll ? "Updating…" : `Update all (${updates.length})`}</button>{/if}
  </div>
  <p class="desc">The plugins of Atlas's release. Installing copies one into <code>.atlas/plugins/</code>, switched on; updating keeps its settings, the old copy goes to <code>.atlas/trash/</code>.</p>
  <div class="bar">
    <label class="search"><Icon name="search" size={13} /><input type="search" placeholder="Search plugins" bind:value={q} aria-label="Search plugins" /></label>
    <div class="atlas-seg" role="tablist" aria-label="Which plugins">
      {#each [["all", "All"], ["new", "Not installed"], ["installed", "Installed"], ["updates", "Updates"]] as [k, label] (k)}
        <button role="tab" class:on={show === k} aria-selected={show === k} onclick={() => (show = k as Show)}>{label} <span class="c">{count(k as Show)}</span></button>
      {/each}
    </div>
    <select bind:value={tier} aria-label="Tier"><option value="">Stable and beta</option><option value="stable">Stable</option><option value="beta">Beta</option></select>
  </div>
  {#if failed}<p class="err">The release's plugins could not be read: {failed} <button class="link" onclick={load}>Try again</button></p>
  {:else if offered === null}<p class="muted">Reading the release's plugins…</p>
  {:else if !list.length}<p class="muted">{offered.length ? "No plugin fits." : "This release offers no plugins (no plugin index set)."}</p>{/if}
  <ul class="cards">
    {#each list as a (a.id)}
      <li class="card" class:here={a.installed !== undefined} class:cannot={!a.runs_here} data-store-plugin={a.id}>
        <div class="head">
          <span class="ico"><Icon name={iconOf(a)} size={20} /></span>
          <div class="name"><b>{a.title}</b><span class="meta"><span class="tier {a.tier}">{a.tier}</span>{#if a.version} v{a.version}{/if}{#if a.size} · {sizeOf(a.size)}{/if}</span></div>
        </div>
        <p class="what">{a.description ?? ""}</p>
        <div class="foot">
          {#if !a.runs_here}<span class="note" title="Its engine was not built for this computer's platform">Not for this computer</span>
          {:else if a.update}<span class="note up">v{a.installed || "?"} installed</span>
          {:else if a.installed !== undefined}<span class="note ok"><Icon name="check" size={12} /> Installed</span>
          {:else}<span class="note"></span>{/if}
          {#if a.runs_here && (a.installed === undefined || a.update)}
            <button class="btn" class:primary={a.update} disabled={busy.has(a.id)} onclick={() => act(a)} aria-label="{a.update ? 'Update' : 'Install'} {a.title}">
              {busy.has(a.id) ? (a.update ? "Updating…" : "Installing…") : a.update ? `Update to v${a.version}` : "Install"}
            </button>
          {/if}
        </div>
      </li>
    {/each}
  </ul>
</section>

<style>
  .top { display: flex; align-items: center; gap: 10px; justify-content: space-between; }
  h3 { margin: 18px 0 2px; }
  .n { color: var(--text-faint); }
  .desc, .muted { margin: 0 0 8px; color: var(--text-faint); font-size: calc(12.5px * var(--ui-scale, 1)); }
  .err { color: var(--red); }
  .bar { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-bottom: 10px; }
  .search { display: inline-flex; align-items: center; gap: 6px; flex: 1 1 200px; padding: 3px 8px; border: 1px solid var(--border-strong); border-radius: var(--radius-sm); color: var(--text-faint); }
  .search input { flex: 1; min-width: 0; border: 0; background: none; color: var(--text); outline: none; font: inherit; }
  .atlas-seg .c { color: var(--text-faint); font-variant-numeric: tabular-nums; }
  select { padding: 3px 6px; border: 1px solid var(--border-strong); border-radius: var(--radius-sm); background: var(--bg); color: var(--text); font: inherit; }
  .cards { list-style: none; margin: 0; padding: 0; display: grid; gap: 10px; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); }
  .card { display: flex; flex-direction: column; gap: 6px; padding: 12px; border: 1px solid var(--border); border-radius: var(--radius, 8px); background: var(--bg-elev, var(--bg)); }
  .card:hover { border-color: var(--border-strong); }
  .card.cannot { opacity: .6; }
  .head { display: flex; gap: 10px; align-items: center; }
  .ico { display: grid; place-items: center; width: 36px; height: 36px; flex: none; border-radius: 9px; background: var(--accent-soft, var(--bg-hover)); color: var(--accent); }
  .name { display: flex; flex-direction: column; min-width: 0; }
  .name b { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .meta { color: var(--text-faint); font-size: calc(11.5px * var(--ui-scale, 1)); }
  .tier { margin-right: 4px; padding: 0 6px; border-radius: 9px; border: 1px solid var(--border); text-transform: uppercase; font-size: .85em; letter-spacing: .04em; }
  .tier.stable { color: var(--green); border-color: color-mix(in srgb, var(--green) 40%, transparent); }
  .tier.beta { color: var(--yellow); border-color: color-mix(in srgb, var(--yellow) 40%, transparent); }
  .what { margin: 0; flex: 1; color: var(--text-muted); font-size: calc(12.5px * var(--ui-scale, 1)); line-height: 1.4;
    display: -webkit-box; -webkit-line-clamp: 3; line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
  .foot { display: flex; align-items: center; justify-content: space-between; gap: 8px; min-height: 26px; }
  .note { color: var(--text-faint); font-size: calc(12px * var(--ui-scale, 1)); display: inline-flex; gap: 4px; align-items: center; }
  .note.ok { color: var(--green); }
  .note.up { color: var(--accent); }
  .btn { display: inline-flex; gap: 6px; align-items: center; padding: 3px 12px; border: 1px solid var(--border-strong); border-radius: var(--radius-sm); }
  .btn:hover:not(:disabled) { background: var(--bg-hover); }
  .btn.primary { background: var(--accent); color: var(--accent-fg, #fff); border-color: var(--accent); }
  .btn:disabled { opacity: .6; }
  .link { color: var(--accent); padding: 0; }
</style>
