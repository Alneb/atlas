<script lang="ts">
  // Web pane: any URL with a small address bar, in an iframe. In the desktop app the frame shows any site (its hook
  // lifts the headers that forbid framing, lib/web-links.ts) and carries a page script (atlas-app frame_page.js) for
  // address, title, history and find; elsewhere (a browser, the phone) a plain iframe.
  import { onMount } from "svelte";
  import type { PaneProps } from "../lib/dock";
  import { allCommands, bindings } from "../lib/keymap.svelte";
  import { matches } from "../lib/keys";
  import { open } from "../lib/dock";
  import { framesAnything, frameToken, openOutside } from "../lib/web-links";
  import Icon from "../components/Icon.svelte";
  import { paneSteps } from "../lib/pane-nav";

  let { spec, panel }: PaneProps<"web"> = $props();
  // svelte-ignore state_referenced_locally -- a pane's spec is fixed for its lifetime
  const initial = spec.url;
  let url = $state(initial);
  let shown = $state(initial);
  /** The frame's own address, set only by Atlas (a page that navigates itself must not be reloaded by the pane). */
  let src = $state(initial);
  let frame = $state<HTMLIFrameElement>();
  let address = $state<HTMLInputElement>();
  let nav = $state({ back: false, forward: false, loading: false });
  // find in the page (Ctrl+F, in the page or here), through the frame's page script
  let finding = $state(false);
  let findText = $state("");
  let found = $state<number | null>(null);
  /** the link under the pointer in the page: its address shown in a corner, as a browser's status bar */
  let hover = $state("");
  let findBox = $state<HTMLInputElement>();

  // a frame that shows any site (lib/web-links.ts) has Atlas's page script (atlas-app frame_page.js), spoken to by postMessage
  const framed = framesAnything;
  const ask = (m: Record<string, unknown>) => {
    if (framed) frame?.contentWindow?.postMessage({ atlasFrameDo: m }, "*");
  };

  function normal(u: string): string {
    u = u.trim();
    return u && !/^[a-z]+:\/\//i.test(u) ? `https://${u}` : u;
  }
  function setTitle(t: string | null | undefined, u: string) {
    try { panel.setTitle(t?.trim() || new URL(u).host || u); } catch { /* keep */ }
  }
  /** The addresses this tab showed, in order: Back's own way when the page cannot say its history (its script did not
   *  run there, or stopped answering) — the button and the mouse's Back never dead-end on such a page. */
  // svelte-ignore state_referenced_locally -- the address it opened on starts the trail
  let trail: string[] = initial ? [initial] : [];
  /** The page itself says it can go back (its script answered with its history). */
  let pageBack = false;
  let stepping = false;
  const remember = (u: string) => { if (!stepping && trail.at(-1) !== u) trail = [...trail, u].slice(-50); stepping = false; };
  function go() {
    const u = normal(url);
    if (!u) return;
    url = shown = u;
    remember(u);
    ahead = 0; // a new address: no forward history left
    panel.updateParameters({ url: u });
    setTitle(null, u);
    src = u;
  }
  /** The page (or a link Shift+clicked in it) in the system's browser, as Atlas opens any outside link. */
  const inBrowser = (u: string) => void openOutside(u);
  function reload() { if (framed) ask({ op: "reload" }); else if (frame) frame.src = shown; }

  function openFind() {
    if (!framed) return;
    finding = true;
    requestAnimationFrame(() => { findBox?.focus(); findBox?.select(); });
  }
  function closeFind() {
    finding = false;
    found = null;
    ask({ op: "findend" });
  }
  function findKey(e: KeyboardEvent) {
    if (e.key === "Enter") { e.preventDefault(); ask({ op: "find", text: findText, step: e.shiftKey ? -1 : 1 }); }
    else if (e.key === "Escape") { e.preventDefault(); closeFind(); }
  }

  /** A Super chord pressed in the page: the global command Atlas binds to it (a page never gets Super). */
  function superKey(k: { key: string; code: string; ctrl: boolean; shift: boolean; alt: boolean }) {
    const ev = new KeyboardEvent("keydown", { key: k.key, code: k.code, ctrlKey: k.ctrl, shiftKey: k.shift, altKey: k.alt, metaKey: true });
    bindings().find((b) => !b.cmd.where && matches(b.chord, ev))?.cmd.run();
  }

  function heard(e: Event) {
    const d = (e as CustomEvent).detail as { id: string; url?: string; title?: string; loading?: boolean; back?: boolean; forward?: boolean; open?: string; external?: string; action?: string; hover?: string; key?: { key: string; code: string; ctrl: boolean; shift: boolean; alt: boolean } };
    if (d.id !== panel.id) return;
    if (typeof d.hover === "string") return void (hover = d.hover);
    if (d.open) return void open({ kind: "web", url: d.open });
    if (d.external) return void inBrowser(d.external);
    if (d.action === "close") return void panel.close();
    if (d.action === "address") return void address?.select();
    if (d.action === "find") return void openFind();
    if ("found" in d) return void (found = (d as { found: number }).found);
    if (d.key) return void superKey(d.key);
    if (d.action === "files" || d.action === "palette") return void allCommands().find((c) => c.id === (d.action === "files" ? "ui.quickOpen" : "ui.palette"))?.run();
    if (d.url && d.url !== shown) {
      shown = d.url;
      remember(d.url);
      hover = ""; // a new page: the old one's link is gone
      // the address follows the page unless it is being typed in
      if (document.activeElement !== address || !document.hasFocus()) url = d.url;
      panel.updateParameters({ url: d.url });
    }
    if (d.url) setTitle(d.title, d.url);
    // a frame cannot know its forward history: the button stays on
    pageBack = !!d.back;
    nav = { back: pageBack || trail.length > 1, forward: true, loading: !!d.loading };
  }

  /** A frame's page script speaking: only from that frame's window (another page's messages are not this pane's) and
   *  with this run's token (the framed site's own scripts can post here too, but never know it). */
  function fromFrame(e: MessageEvent) {
    const d = e.source && e.source === frame?.contentWindow ? (e.data as { atlasFrame?: Record<string, unknown>; token?: unknown } | null) : null;
    const m = frameToken && d?.token === frameToken ? d.atlasFrame : undefined;
    if (m) heard(new CustomEvent("atlas-web", { detail: { id: panel.id, ...m } }));
  }

  // The app's Back / Forward (mouse buttons, swipes, Super+[, the phone's Back) go through the page's history first.
  // A frame cannot tell its forward history: Forward is taken only after a Back taken here.
  let root = $state<HTMLDivElement>();
  let ahead = 0;
  $effect(() => {
    if (!root || !framed) return;
    return paneSteps(root, (d) => (d < 0 ? nav.back : ahead > 0) && (stepPage(d), true), (d) => (d < 0 ? nav.back : ahead > 0));
  });
  /** One page back or forward in the frame (the bar's arrows, the app's Back). */
  function stepPage(d: -1 | 1) {
    ahead = Math.max(0, ahead - d);
    // the page's own history when it says it has one; else this tab's trail (the address before, loaded again)
    if (d < 0 && !pageBack && trail.length > 1) {
      trail = trail.slice(0, -1);
      stepping = true;
      url = shown = trail.at(-1)!;
      src = shown;
      if (frame) frame.src = shown; // the same address as the frame was given first is loaded again too
      return;
    }
    ask({ op: d < 0 ? "back" : "forward" });
  }

  onMount(() => {
    if (!framed) return;
    window.addEventListener("message", fromFrame);
    return () => window.removeEventListener("message", fromFrame);
  });
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="web-pane" bind:this={root} onkeydown={(e) => { if (e.ctrlKey && !e.altKey && !e.shiftKey && e.key.toLowerCase() === "f") { e.preventDefault(); openFind(); } }}>
  <div class="bar">
    {#if framed}
      <button class="icon-btn" title="Back (Alt+←)" disabled={!nav.back} onclick={() => stepPage(-1)}><Icon name="arrow-left" size={14} /></button>
      <button class="icon-btn" title="Forward (Alt+→)" disabled={!nav.forward} onclick={() => stepPage(1)}><Icon name="arrow-right" size={14} /></button>
    {/if}
    <button class="icon-btn" class:spin={nav.loading} title="Reload (F5)" onclick={reload}><Icon name="refresh" size={14} /></button>
    <input bind:this={address} bind:value={url} onkeydown={(e) => { if (e.key === "Enter") go(); }} spellcheck="false" aria-label="Address" />
    {#if framed}<button class="icon-btn" class:on={finding} title="Find in the page (Ctrl+F)" onclick={() => (finding ? closeFind() : openFind())}><Icon name="search" size={14} /></button>{/if}
    <button class="icon-btn" title="Open in the browser (Shift+click a link to open it there)" onclick={() => inBrowser(shown)}><Icon name="external-link" size={14} /></button>
  </div>
  {#if framed && finding}
    <div class="find" role="search">
      <input bind:this={findBox} bind:value={findText} oninput={() => ask({ op: "find", text: findText })} onkeydown={findKey} placeholder="Find in the page" aria-label="Find in the page" spellcheck="false" />
      <span class="count">{findText ? (found === null ? "" : found ? `${found} match${found === 1 ? "" : "es"}` : "No match") : ""}</span>
      <button class="icon-btn" title="Previous (Shift+Enter)" disabled={!found} onclick={() => ask({ op: "find", text: findText, step: -1 })}><Icon name="arrow-up" size={14} /></button>
      <button class="icon-btn" title="Next (Enter)" disabled={!found} onclick={() => ask({ op: "find", text: findText, step: 1 })}><Icon name="arrow-down" size={14} /></button>
      <button class="icon-btn" title="Close (Esc)" onclick={closeFind}><Icon name="close" size={14} /></button>
    </div>
  {/if}
  <iframe bind:this={frame} {src} title={shown} sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-downloads allow-modals"></iframe>
  <!-- the link under the pointer, over the page's bottom corner -->
  {#if hover}<div class="hover" data-testid="web-hover">{hover}</div>{/if}
</div>

<style>
  .web-pane { position: relative; height: 100%; display: flex; flex-direction: column; background: var(--bg); }
  .hover { position: absolute; left: 0; bottom: 0; max-width: min(70%, 640px); padding: 3px 9px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; pointer-events: none; z-index: 2;
    font-size: calc(12px * var(--ui-scale, 1)); color: var(--text-muted); background: var(--bg-elev); border: 1px solid var(--border); border-left: 0; border-bottom: 0; border-top-right-radius: var(--radius-sm); }
  .bar { display: flex; align-items: center; gap: 6px; padding: 6px 10px; border-bottom: 1px solid var(--border); }
  .bar input { flex: 1; height: 26px; border-radius: var(--radius-sm); border: 1px solid var(--border); background: var(--bg-elev); color: var(--text); font: inherit; font-size: calc(12.5px * var(--ui-scale, 1)); padding: 0 10px; outline: 0; }
  .bar input:focus { border-color: color-mix(in srgb, var(--accent) 55%, transparent); }
  .bar .icon-btn:disabled, .find .icon-btn:disabled { opacity: 0.35; }
  .bar .icon-btn.on { color: var(--accent); }
  .find { display: flex; align-items: center; gap: 6px; padding: 4px 10px; border-bottom: 1px solid var(--border); background: var(--bg-alt); }
  .find input { flex: 0 1 280px; min-width: 0; height: 24px; border-radius: var(--radius-sm); border: 1px solid var(--border); background: var(--bg-elev); color: var(--text); font: inherit; font-size: calc(12.5px * var(--ui-scale, 1)); padding: 0 8px; outline: 0; }
  .find input:focus { border-color: color-mix(in srgb, var(--accent) 55%, transparent); }
  .find .count { font-size: calc(12px * var(--ui-scale, 1)); color: var(--text-faint); white-space: nowrap; }
  .spin :global(svg) { animation: spin 1s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
  iframe { flex: 1; border: 0; background: white; width: 100%; }
</style>
