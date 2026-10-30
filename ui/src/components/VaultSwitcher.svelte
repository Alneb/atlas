<script lang="ts">
  // The vault switcher (lib/vaults.ts chooseVault): every vault this window can show, searched as typed, each with what
  // it is (a folder, a server, started already, its mirror) and what can be done to it; then opening a folder, making a
  // vault, reaching a server. A folder and its copy on a server are one row (docs/design/DESIGN-mirror-v2.md).
  import Icon from "./Icon.svelte";
  import Dialog from "./Dialog.svelte";
  import { errText } from "../lib/text";
  import { toast } from "../lib/state.svelte";
  import { askFolder, askServer, forgetVault, openVault, setMirror, vaultListing, type VaultEntry } from "../lib/vaults";
  import { forgetMirrorState, hostOf, reach, serverVaults, type MirrorState } from "../lib/mirror";

  /** `linkMirror`: opened from a note ("edit live on its mirror"): this window's folder at its mirror form. */
  let { onclose, linkMirror = false }: { onclose: () => void; linkMirror?: boolean } = $props();
  let entries = $state<VaultEntry[]>([]);
  let manage = $state(false);
  let failed = $state("");
  let query = $state("");
  let sel = $state(0);
  let input = $state<HTMLInputElement>();
  let reached = $state<Record<string, MirrorState>>({});
  /** The folder whose mirror is being set, the address typed, the server vaults offered. */
  let linking = $state<{ path: string; address: string; offers: { name: string; address: string }[] } | null>(null);
  let removing = $state("");

  async function load() {
    try {
      const l = await vaultListing();
      entries = l.entries; manage = l.manage;
      for (const e of l.entries) if (e.mirror) void reach(e.mirror).then((s) => { reached = { ...reached, [e.mirror!]: s }; });
      const here = linkMirror && l.entries.find((e) => e.current && e.kind === "folder" && e.managed);
      if (here) void startLinking(here);
    } catch (e) { failed = errText(e); }
  }
  $effect(() => { void load(); });
  // Esc, Back or the scrim while linking a mirror steps back out of it first
  const back = () => { if (linking) linking = null; else onclose(); };
  $effect(() => { input?.focus(); });

  const typedPath = $derived(/^(\/|~|[A-Za-z]:\\|https?:\/\/)/.test(query.trim()) ? query.trim() : "");
  const typedServer = $derived(/^https?:/.test(typedPath));
  const shown = $derived.by(() => {
    const q = query.trim().toLowerCase();
    if (!q || typedPath) return entries;
    return entries.filter((e) => `${e.name} ${e.path} ${e.mirror ?? ""}`.toLowerCase().includes(q));
  });
  $effect(() => { if (sel >= shown.length + (typedPath ? 1 : 0)) sel = 0; });

  function go(e: VaultEntry) {
    if (e.current) return onclose();
    if (e.missing) return toast("The folder is not there", `${e.path} — plugged out or moved? Take it off the list, or open it where it is now.`, "error", 7000);
    onclose();
    e.go();
  }
  const isAddress = (a: string) => /^https?:\/\/\S+$/.test(a.trim());
  function act(fn: () => void) { onclose(); fn(); }

  function key(ev: KeyboardEvent) {
    const n = shown.length + (typedPath ? 1 : 0);
    if (ev.key === "Escape") { ev.preventDefault(); ev.stopPropagation(); back(); }
    else if (linking) return;
    else if (ev.key === "ArrowDown") { ev.preventDefault(); sel = n ? (sel + 1) % n : 0; }
    else if (ev.key === "ArrowUp") { ev.preventDefault(); sel = n ? (sel - 1 + n) % n : 0; }
    else if (ev.key === "Enter") {
      if (ev.target instanceof HTMLButtonElement) return; // a focused button does its own thing
      ev.preventDefault();
      if (sel < shown.length) go(shown[sel]);
      else if (typedPath) act(() => void openVault(typedPath));
    }
  }

  async function startLinking(e: VaultEntry) {
    linking = { path: e.path, address: e.mirror ?? "", offers: [] };
    // what the known servers serve: a vault there of the same name is most likely this one's copy
    const servers = [...new Set(entries.filter((x) => x.kind === "server").map((x) => new URL(x.path).origin))];
    const offers = (await Promise.all(servers.map(serverVaults))).flat();
    const same = (o: { name: string }) => Number(o.name.toLowerCase() === e.name.toLowerCase());
    if (linking?.path === e.path) linking.offers = offers.sort((a, b) => same(b) - same(a));
  }
  async function saveMirror(address: string) {
    if (!linking) return;
    try {
      await setMirror(linking.path, address);
      forgetMirrorState();
      toast(address ? "Mirror linked" : "Mirror unlinked", address ? `Saved here, each save cleared with ${hostOf(address)}, and notes edited live with its devices while it answers.` : "This vault is local only again.", "success");
      linking = null;
      await load();
    } catch (e) { toast("The mirror was not set", errText(e), "error", 9000); }
  }
  async function remove(e: VaultEntry) {
    if (removing !== e.path) { removing = e.path; return; }
    try { await forgetVault(e.path); toast("Removed from the list", e.kind === "folder" ? `${e.path} is still on disk.` : `${e.path} is still on its server.`); removing = ""; await load(); }
    catch (err) { toast("Not removed", errText(err), "error"); }
  }

  const MIRROR_WORD: Record<MirrorState, string> = { online: "live through the server", signin: "sign in to edit live", offline: "server not answering — local" };
</script>

<!-- the keys at the window: a row removed takes the focus with it -->
<svelte:window onkeydown={key} />
<Dialog label="Switch vault" onclose={back} testid="vault-switcher">
  <div class="dialog">
    <div class="search">
      <Icon name="search" size={15} />
      <input bind:this={input} bind:value={query} placeholder="Switch vault — type a name, or a folder or server address" spellcheck="false" aria-label="Search vaults" />
    </div>

    <ul class="rows" role="listbox" aria-label="Vaults">
      {#if failed}<li class="note">The vault list did not load: {failed}</li>{/if}
      {#each shown as e, i (e.path)}
        <li class="row" class:sel={sel === i} class:current={e.current} class:missing={e.missing} role="option" aria-selected={sel === i}
          data-vault={e.name} onmouseenter={() => (sel = i)}>
          <button class="main" onclick={() => go(e)} title={e.current ? "This window's vault" : `Switch to ${e.name}`}>
            <span class="ic"><Icon name={e.kind === "server" ? "server" : "folder"} size={18} /></span>
            <span class="text">
              <span class="name">{e.name}</span>
              <span class="where">{e.path}</span>
            </span>
            <span class="badges">
              {#if e.current}<span class="badge here">this window</span>
              {:else if e.missing}<span class="badge bad">folder not found</span>
              {:else if e.warm}<span class="badge warm" title="Started already: switching is instant">ready</span>{/if}
              {#if e.kind === "server"}<span class="badge">server</span>{/if}
              {#if e.mirror}
                {@const s = reached[e.mirror]}
                <span class="badge mirror {s ?? ''}" title="Mirrored on {e.mirror}{s ? ` — ${MIRROR_WORD[s]}` : ''}">⇄ {hostOf(e.mirror)}</span>
              {/if}
            </span>
          </button>
          {#if e.managed}
            <span class="acts">
              {#if e.mirror && reached[e.mirror] === "signin"}<button class="act" onclick={() => { window.open(`/signin/door?url=${encodeURIComponent(new URL(e.mirror!).origin + "/")}`, "_blank"); }} title="The mirror's sign-in page, in a window of Atlas">Sign in</button>{/if}
              {#if e.kind === "folder"}<button class="act" onclick={() => void startLinking(e)} title="Link this folder to its copy on a server">{e.mirror ? "Mirror…" : "Link mirror…"}</button>{/if}
              {#if !e.current}<button class="act" class:danger={removing === e.path} onclick={() => void remove(e)} title="Take it off this list (nothing is deleted)">{removing === e.path ? "Remove?" : "Remove"}</button>{/if}
            </span>
          {/if}
          {#if linking?.path === e.path}
            <form class="link" onsubmit={(ev) => { ev.preventDefault(); void saveMirror(linking!.address); }}>
              <p>Its copy on a server, kept in step by Syncthing. While the server answers, files of this vault open, save and edit live there — one writer, so the two copies never conflict. Offline, the folder here is used as before.</p>
              <!-- svelte-ignore a11y_autofocus -->
              <input bind:value={linking.address} placeholder="https://atlas.example.org/v/{e.name.toLowerCase().replace(/[^a-z0-9_-]+/g, '-')}/" spellcheck="false" autofocus aria-label="Mirror address" />
              {#if linking.offers.length}
                <div class="offers">
                  {#each linking.offers as o (o.address)}<button type="button" class="chip" class:on={linking.address === o.address} onclick={() => (linking!.address = o.address)}>{o.name} · {hostOf(o.address)}</button>{/each}
                </div>
              {/if}
              <div class="btns">
                {#if e.mirror}<button type="button" class="btn" onclick={() => void saveMirror("")}>Unlink</button>{/if}
                <span class="grow"></span>
                <button type="button" class="btn" onclick={() => (linking = null)}>Cancel</button>
                <button class="btn primary" disabled={!isAddress(linking.address)}>Link</button>
              </div>
            </form>
          {/if}
        </li>
      {/each}
      {#if typedPath}
        <li class="row" class:sel={sel === shown.length} role="option" aria-selected={sel === shown.length}>
          <button class="main" onclick={() => act(() => void openVault(typedPath))}>
            <span class="ic"><Icon name={typedServer ? "server" : "folder-open"} size={18} /></span>
            <span class="text"><span class="name">{typedServer ? "Connect to" : "Open the folder"} {typedPath}</span><span class="where">it joins this list</span></span>
          </button>
        </li>
      {:else if !shown.length && !failed}
        <li class="note">No vault matches “{query}”. Type a folder (~/Notes) or a server's address to open it.</li>
      {/if}
    </ul>

    {#if manage}
      <div class="foot">
        <button class="btn" onclick={() => act(() => askFolder(false))}><Icon name="folder-open" size={14} /> Open folder…</button>
        <button class="btn" onclick={() => act(() => askFolder(true))}><Icon name="plus" size={14} /> New vault…</button>
        <button class="btn" onclick={() => act(askServer)}><Icon name="server" size={14} /> Connect to a server…</button>
        <span class="grow"></span>
        <span class="hint">↑↓ Enter · Esc</span>
      </div>
    {/if}
  </div>
</Dialog>

<style>
  .dialog { width: min(640px, calc(100vw - 32px)); max-height: 78vh; display: flex; flex-direction: column; background: var(--bg-elev); border: 1px solid var(--border-strong);
    border-radius: var(--radius-lg); box-shadow: var(--shadow-pop); overflow: hidden; outline: none; }
  .search { display: flex; align-items: center; gap: 8px; padding: 10px 14px; border-bottom: 1px solid var(--border); color: var(--text-muted); }
  .search input { flex: 1; font: inherit; font-size: calc(15px * var(--ui-scale, 1)); color: var(--text); background: transparent; border: 0; outline: none; padding: 4px 0; }
  .rows { list-style: none; margin: 0; padding: 6px; overflow: auto; flex: 1; }
  .row { display: flex; flex-wrap: wrap; align-items: center; border-radius: 8px; }
  .row.sel { background: var(--bg-hover, rgba(127, 127, 127, .12)); }
  .row.current .name { color: var(--accent); }
  .row.missing .name, .row.missing .where { opacity: .55; }
  .main { flex: 1; min-height: 52px; min-width: 0; display: flex; align-items: center; gap: 10px; padding: 8px 10px; font: inherit; color: var(--text); background: transparent; border: 0; text-align: left; cursor: pointer; }
  .ic { color: var(--text-muted); display: flex; }
  .text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
  .name { font-weight: 600; font-size: calc(14px * var(--ui-scale, 1)); }
  .where { font-size: calc(12px * var(--ui-scale, 1)); color: var(--text-faint, var(--text-muted)); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .badges { display: flex; gap: 4px; flex-wrap: wrap; justify-content: flex-end; }
  .badge { font-size: calc(11px * var(--ui-scale, 1)); color: var(--text-muted); border: 1px solid var(--border); border-radius: 999px; padding: 1px 8px; white-space: nowrap; }
  .badge.here { color: var(--accent); border-color: color-mix(in srgb, var(--accent) 45%, transparent); }
  .badge.warm { color: var(--green); border-color: color-mix(in srgb, var(--green) 40%, transparent); }
  .badge.bad { color: var(--red); border-color: color-mix(in srgb, var(--red) 40%, transparent); }
  .badge.mirror.online { color: var(--green); }
  .badge.mirror.offline { opacity: .6; }
  .badge.mirror.signin { color: var(--orange); }
  .acts { display: none; gap: 4px; padding-right: 8px; }
  .row.sel .acts, .row:focus-within .acts { display: flex; }
  .act { font: inherit; font-size: calc(12px * var(--ui-scale, 1)); color: var(--text-muted); background: transparent; border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 3px 8px; cursor: pointer; }
  .act:hover { color: var(--text); border-color: var(--border-strong); }
  .act.danger { color: var(--red); border-color: var(--red); }
  .link { flex-basis: 100%; display: flex; flex-direction: column; gap: 8px; margin: 0 10px 10px 38px; padding: 10px; border: 1px solid var(--border); border-radius: 8px; background: var(--bg); }
  .link p { margin: 0; font-size: calc(12.5px * var(--ui-scale, 1)); color: var(--text-muted); line-height: 1.45; }
  .link input { font: inherit; color: var(--text); background: var(--bg-elev); border: 1px solid var(--border-strong); border-radius: var(--radius-sm); padding: 6px 9px; outline: none; }
  .link input:focus { border-color: var(--accent); }
  .offers { display: flex; flex-wrap: wrap; gap: 6px; }
  .chip { font: inherit; font-size: calc(12px * var(--ui-scale, 1)); color: var(--text-muted); background: transparent; border: 1px solid var(--border); border-radius: 999px; padding: 3px 10px; cursor: pointer; }
  .chip.on { color: var(--accent-fg); background: var(--accent); border-color: transparent; }
  .btns, .foot { display: flex; align-items: center; gap: 8px; }
  .foot { padding: 8px 10px; border-top: 1px solid var(--border); flex-wrap: wrap; }
  .grow { flex: 1; }
  .hint { font-size: calc(11.5px * var(--ui-scale, 1)); color: var(--text-faint, var(--text-muted)); }
  .btn { display: inline-flex; align-items: center; gap: 6px; font: inherit; font-size: calc(13px * var(--ui-scale, 1)); color: var(--text); background: transparent; border: 1px solid var(--border-strong); padding: 5px 12px; border-radius: var(--radius-sm); cursor: pointer; }
  .btn.primary { color: var(--accent-fg); background: var(--accent); border-color: transparent; }
  .btn:disabled { opacity: .5; cursor: default; }
  .note { padding: 14px 12px; color: var(--text-muted); font-size: calc(13px * var(--ui-scale, 1)); }
  @media (max-width: 520px) { .acts { display: flex; } .badges { display: none; } }
</style>
