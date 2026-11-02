<script lang="ts">
  // Web pane: any URL with a small address bar. In the desktop app it is a WebKit view of the app's own laid over this
  // pane (atlas-app webtab.rs), so a site that forbids framing shows too; elsewhere (a browser, the phone) an iframe.
  import { onDestroy, onMount } from "svelte";
  import { onOverlays, overlayOver } from "../lib/overlays";
  import type { PaneProps } from "../lib/dock";
  import { allCommands, bindings } from "../lib/keymap.svelte";
  import { matches } from "../lib/keys";
  import { open } from "../lib/dock";
  import Icon from "../components/Icon.svelte";

  let { spec, panel }: PaneProps<"web"> = $props();
  // svelte-ignore state_referenced_locally -- a pane's spec is fixed for its lifetime
  const initial = spec.url;
  let url = $state(initial);
  let shown = $state(initial);
  let frame = $state<HTMLIFrameElement>();
  let slot = $state<HTMLDivElement>();
  let address = $state<HTMLInputElement>();
  let nav = $state({ back: false, forward: false, loading: false });
  let shot = $state("");
  // find in the page (Ctrl+F, in the page or here): WebKit's own find in the native view, every match marked
  let finding = $state(false);
  let findText = $state("");
  let found = $state<number | null>(null);
  let findBox = $state<HTMLInputElement>();

  type Native = { postMessage(s: string): void };
  const native = (globalThis as unknown as { webkit?: { messageHandlers?: { atlasWeb?: Native } } }).webkit?.messageHandlers?.atlasWeb;
  const ask = (m: Record<string, unknown>) => native?.postMessage(JSON.stringify({ id: panel.id, ...m }));

  function normal(u: string): string {
    u = u.trim();
    return u && !/^[a-z]+:\/\//i.test(u) ? `https://${u}` : u;
  }
  function setTitle(t: string | null | undefined, u: string) {
    try { panel.setTitle(t?.trim() || new URL(u).host || u); } catch { /* keep */ }
  }
  function go() {
    const u = normal(url);
    if (!u) return;
    url = shown = u;
    panel.updateParameters({ url: u });
    setTitle(null, u);
    ask({ op: "go", url: u });
  }
  /** The page (or a link Shift+clicked in it) in the system's browser, as Atlas opens any outside link. */
  function inBrowser(u: string) { window.open(u, "_blank", "noopener"); }
  function reload() { if (native) ask({ op: "reload" }); else if (frame) frame.src = shown; }

  // the native view follows this pane's place, and hides when the pane is hidden or something of Atlas lies over it:
  // a registered overlay (lib/overlays.ts: the palette, dialogs, menus, popovers, the Ctrl+Tab glance), told at once;
  // and, for what is not registered (the side bar opened over the panes, a plugin's own popup), a grid that reaches the
  // edges, as elementFromPoint sees it (something lying over one side only covers the edge points)
  let last = "";
  const GRID = [0.01, 0.25, 0.5, 0.75, 0.99];
  function covered(r: DOMRect): boolean {
    if (overlayOver(r)) return true;
    for (const fx of GRID) for (const fy of GRID) {
      const el = document.elementFromPoint(r.left + r.width * fx, r.top + r.height * fy);
      if (!el || !(el === slot || slot!.contains(el))) return true;
    }
    return false;
  }
  function place() {
    if (!native || !slot) return;
    const r = slot.getBoundingClientRect();
    const on = slot.isConnected && r.width > 2 && r.height > 2 && document.visibilityState === "visible" && !covered(r);
    const now = on ? `${Math.round(r.left)},${Math.round(r.top)},${Math.round(r.width)},${Math.round(r.height)}` : "hidden";
    if (now === last) return;
    last = now;
    if (on) ask({ op: "show", url: shown, x: r.left, y: r.top, w: r.width, h: r.height });
    else ask({ op: "hide" });
  }

  function openFind() {
    if (!native) return;
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
    const d = (e as CustomEvent).detail as { id: string; url?: string; title?: string; loading?: boolean; back?: boolean; forward?: boolean; open?: string; external?: string; action?: string; snapshot?: string; key?: { key: string; code: string; ctrl: boolean; shift: boolean; alt: boolean } };
    if (d.id !== panel.id) return;
    if (d.snapshot) return void (shot = d.snapshot); // the page as it was, shown while the view is hidden under Atlas
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
      // the address follows the page unless it is being typed in (the native view holds the focus: not this page's)
      if (document.activeElement !== address || !document.hasFocus()) url = d.url;
      panel.updateParameters({ url: d.url });
    }
    if (d.url) setTitle(d.title, d.url);
    nav = { back: !!d.back, forward: !!d.forward, loading: !!d.loading };
  }

  onMount(() => {
    if (!native) return;
    const ro = new ResizeObserver(place);
    if (slot) ro.observe(slot);
    const tick = setInterval(place, 250); // overlays opening, the dock moving the pane: nothing else tells
    for (const ev of ["resize", "atlas-layout"]) window.addEventListener(ev, place);
    document.addEventListener("visibilitychange", place);
    window.addEventListener("atlas-web", heard);
    const unlisten = onOverlays(place);
    place();
    return () => {
      ro.disconnect(); clearInterval(tick); unlisten();
      for (const ev of ["resize", "atlas-layout"]) window.removeEventListener(ev, place);
      document.removeEventListener("visibilitychange", place);
      window.removeEventListener("atlas-web", heard);
    };
  });
  onDestroy(() => ask({ op: "close" }));
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="web-pane" onkeydown={(e) => { if (e.ctrlKey && !e.altKey && !e.shiftKey && e.key.toLowerCase() === "f") { e.preventDefault(); openFind(); } }}>
  <div class="bar">
    {#if native}
      <button class="icon-btn" title="Back (Alt+←)" disabled={!nav.back} onclick={() => ask({ op: "back" })}><Icon name="arrow-left" size={14} /></button>
      <button class="icon-btn" title="Forward (Alt+→)" disabled={!nav.forward} onclick={() => ask({ op: "forward" })}><Icon name="arrow-right" size={14} /></button>
    {/if}
    <button class="icon-btn" class:spin={nav.loading} title="Reload (F5)" onclick={reload}><Icon name="refresh" size={14} /></button>
    <input bind:this={address} bind:value={url} onkeydown={(e) => { if (e.key === "Enter") go(); }} spellcheck="false" aria-label="Address" />
    {#if native}<button class="icon-btn" class:on={finding} title="Find in the page (Ctrl+F)" onclick={() => (finding ? closeFind() : openFind())}><Icon name="search" size={14} /></button>{/if}
    <button class="icon-btn" title="Open in the browser (Shift+click a link to open it there)" onclick={() => inBrowser(shown)}><Icon name="external-link" size={14} /></button>
  </div>
  {#if native && finding}
    <div class="find" role="search">
      <input bind:this={findBox} bind:value={findText} oninput={() => ask({ op: "find", text: findText })} onkeydown={findKey} placeholder="Find in the page" aria-label="Find in the page" spellcheck="false" />
      <span class="count">{findText ? (found === null ? "" : found ? `${found} match${found === 1 ? "" : "es"}` : "No match") : ""}</span>
      <button class="icon-btn" title="Previous (Shift+Enter)" disabled={!found} onclick={() => ask({ op: "find", text: findText, step: -1 })}><Icon name="arrow-up" size={14} /></button>
      <button class="icon-btn" title="Next (Enter)" disabled={!found} onclick={() => ask({ op: "find", text: findText, step: 1 })}><Icon name="arrow-down" size={14} /></button>
      <button class="icon-btn" title="Close (Esc)" onclick={closeFind}><Icon name="close" size={14} /></button>
    </div>
  {/if}
  {#if native}
    <div class="slot" bind:this={slot} style:background-image={shot ? `url("${shot}")` : undefined}></div>
  {:else}
    <iframe bind:this={frame} src={shown} title={shown} sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-downloads allow-modals"></iframe>
  {/if}
</div>

<style>
  .web-pane { height: 100%; display: flex; flex-direction: column; background: var(--bg); }
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
  /* the native view lies over this; the colour shows only while it is hidden or not made yet */
  .slot { flex: 1; min-height: 0; background: var(--bg) top left / 100% 100% no-repeat; }
</style>
