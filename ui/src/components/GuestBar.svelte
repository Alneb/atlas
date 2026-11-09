<script lang="ts">
  // A guest folder's window (lib/guest.svelte.ts): which folder, whose plugins, and the Edit switch — always in view,
  // so a window that writes into a folder outside the vault never looks like the vault's own.
  import Icon from "./Icon.svelte";
  import { guest, setGuestEditing } from "../lib/guest.svelte";

  const info = $derived(guest.info!);
  const name = (p: string) => p.replace(/[\\/]+$/, "").split(/[\\/]/).pop() ?? p;
</script>

<div class="guest" class:editing={info.editing} role="region" aria-label="Guest folder">
  <Icon name="folder-open" size={14} />
  <span class="what"><b>Guest folder</b> <span class="path" title={info.folder}>{info.folder}</span></span>
  <span class="from">with {name(info.from)}'s plugins · not in the vault, forgotten when Atlas restarts</span>
  <span class="state">{info.editing ? "Editing: changes are saved into this folder" : "Read-only"}</span>
  <button class="switch" class:on={info.editing} role="switch" aria-checked={info.editing} aria-label="Edit this folder" onclick={() => void setGuestEditing(!info.editing)}><span></span></button>
  <span class="label">Edit</span>
</div>

<style>
  .guest { display: flex; align-items: center; gap: 10px; padding: 5px 12px; font-size: 12.5px; color: var(--text); background: var(--accent-soft); border-bottom: 1px solid var(--border); min-width: 0; }
  .guest.editing { background: color-mix(in srgb, var(--orange) 16%, var(--bg-app)); }
  .what { display: flex; gap: 6px; min-width: 0; }
  .path { color: var(--text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-family: var(--font-mono); font-size: 12px; }
  .from { color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 1; min-width: 0; }
  .state { white-space: nowrap; color: var(--text-muted); }
  .editing .state { color: var(--orange); font-weight: 600; }
  .label { font-weight: 600; }
  .switch { width: 34px; height: 20px; flex: none; border-radius: 10px; background: var(--border-strong); position: relative; transition: background .15s; }
  .switch span { position: absolute; top: 3px; left: 3px; width: 14px; height: 14px; border-radius: 50%; background: var(--bg); transition: transform .15s; box-shadow: var(--shadow-sm); }
  .switch.on { background: var(--orange); }
  .switch.on span { transform: translateX(14px); }
</style>
