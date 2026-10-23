<script lang="ts">
  // The phone's bottom bar (lib/phone.svelte.ts): home, files, search, the open tabs as a sheet, the commands.
  // Thumb-sized (56 px, the platform's own bottom bars), clear of the system's gesture area.
  import { openHome } from "../lib/actions";
  import { closable } from "../lib/back";
  import { open } from "../lib/dock";
  import { openPalette } from "../lib/palette.svelte";
  import { phone } from "../lib/phone.svelte";
  import { activate, closeTab, tabs } from "../lib/tabs.svelte";
  import Icon from "./Icon.svelte";

  const all = $derived(tabs.groups.flatMap((g) => g.tabs));
  const go = (fn: () => unknown) => () => { phone.sheet = false; void fn(); };
  // the sheet closes as any dialog does: Escape (a keyboard), or the system's Back (the browser's history)
  const esc = (e: KeyboardEvent) => { if (e.key === "Escape" && phone.sheet) { e.stopPropagation(); phone.sheet = false; } };
  $effect(() => { if (phone.sheet) return closable(() => (phone.sheet = false)); });
</script>

<svelte:window onkeydown={esc} />

{#if phone.sheet}
  <!-- the open tabs, as a sheet over the pane: tap one to show it, × to close it -->
  <div class="scrim" role="presentation" onclick={() => (phone.sheet = false)}></div>
  <div class="sheet" role="dialog" aria-label="Open tabs">
    <div class="grip"></div>
    {#each all as t (t.id)}
      <div class="tab" class:active={t.active}>
        <button class="pick" onclick={go(() => activate(t.id))}><Icon name={t.icon} size={18} /><span class="title">{t.title}</span>{#if t.hint}<span class="hint">{t.hint}</span>{/if}</button>
        <button class="x" aria-label="Close {t.title}" onclick={() => closeTab(t.id)}><Icon name="close" size={16} /></button>
      </div>
    {:else}
      <p class="none">No tabs open</p>
    {/each}
  </div>
{/if}
<nav class="phone-bar" aria-label="Places">
  <button onclick={go(openHome)}><Icon name="today" size={21} /><span>Home</span></button>
  <button onclick={go(() => open({ kind: "files" }))}><Icon name="files" size={21} /><span>Files</span></button>
  <button onclick={go(() => open({ kind: "search" }))}><Icon name="search" size={21} /><span>Search</span></button>
  <button class:on={phone.sheet} onclick={() => (phone.sheet = !phone.sheet)}><span class="count">{all.length}</span><span>Tabs</span></button>
  <button onclick={go(() => openPalette("all"))}><Icon name="command" size={21} /><span>Commands</span></button>
</nav>

<style>
  .phone-bar { flex: none; display: flex; justify-content: space-around; height: calc(56px + env(safe-area-inset-bottom, 0px)); padding-bottom: env(safe-area-inset-bottom, 0px);
    background: var(--bg); border-top: 1px solid var(--border); }
  .phone-bar button { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 3px; color: var(--text-muted); font-size: 11px; }
  .phone-bar button:active, .phone-bar button.on { color: var(--accent-strong); }
  /* a tap leaves no focus ring (it showed as two bars beside the button); a keyboard's focus still shows */
  .phone-bar button:focus:not(:focus-visible) { outline: none; box-shadow: none; }
  .count { min-width: 22px; height: 21px; padding: 0 5px; border: 1.75px solid currentColor; border-radius: 6px; display: grid; place-items: center; font-size: 11.5px; font-weight: 600; }
  .scrim { position: fixed; inset: 0; background: rgb(0 0 0 / .35); z-index: 60; }
  .sheet { position: fixed; left: 0; right: 0; bottom: calc(56px + env(safe-area-inset-bottom, 0px) + var(--keyboard, 0px)); max-height: 65vh; overflow: auto; z-index: 61;
    background: var(--bg-elev); border-top: 1px solid var(--border-strong); border-radius: 16px 16px 0 0; padding: 6px 8px 10px; box-shadow: var(--shadow-sm); }
  .grip { width: 36px; height: 4px; border-radius: 2px; background: var(--border-strong); margin: 4px auto 8px; }
  .tab { display: flex; align-items: center; border-radius: 10px; }
  .tab.active { background: var(--accent-soft, var(--bg-hover)); }
  .pick { flex: 1; min-width: 0; display: flex; align-items: center; gap: 12px; height: 48px; padding: 0 10px; color: var(--text); text-align: left; }
  .title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 15px; }
  .hint { color: var(--text-faint); font-size: 12px; white-space: nowrap; }
  .x { width: 44px; height: 44px; display: grid; place-items: center; color: var(--text-muted); }
  .none { color: var(--text-muted); text-align: center; padding: 18px; }
</style>
