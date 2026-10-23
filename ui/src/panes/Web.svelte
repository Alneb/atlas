<script lang="ts">
  // Web pane: any URL with a small address bar. In the desktop app it is a WebKit view of the app's own laid over this
  // pane (atlas-app webtab.rs), so a site that forbids framing shows too; elsewhere (a browser, the phone) an iframe.
  import { onDestroy, onMount } from "svelte";
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
  function reload() { if (native) ask({ op: "reload" }); else if (frame) frame.src = shown; }

  // the native view follows this pane's place, and hides when the pane is hidden or something of Atlas lies over it
  // (the palette, a dialog, a menu: the view would cover them) — checked at five points, as elementFromPoint sees it
  let last = "";
  function covered(r: DOMRect): boolean {
    for (const [fx, fy] of [[0.5, 0.5], [0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]]) {
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

  /** A Super chord pressed in the page: the global command Atlas binds to it (a page never gets Super). */
  function superKey(k: { key: string; code: string; ctrl: boolean; shift: boolean; alt: boolean }) {
    const ev = new KeyboardEvent("keydown", { key: k.key, code: k.code, ctrlKey: k.ctrl, shiftKey: k.shift, altKey: k.alt, metaKey: true });
    bindings().find((b) => !b.cmd.where && matches(b.chord, ev))?.cmd.run();
  }

  function heard(e: Event) {
    const d = (e as CustomEvent).detail as { id: string; url?: string; title?: string; loading?: boolean; back?: boolean; forward?: boolean; open?: string; action?: string; key?: { key: string; code: string; ctrl: boolean; shift: boolean; alt: boolean } };
    if (d.id !== panel.id) return;
    if (d.open) return void open({ kind: "web", url: d.open });
    if (d.action === "close") return void panel.close();
    if (d.action === "address") return void address?.select();
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
    place();
    return () => {
      ro.disconnect(); clearInterval(tick);
      for (const ev of ["resize", "atlas-layout"]) window.removeEventListener(ev, place);
      document.removeEventListener("visibilitychange", place);
      window.removeEventListener("atlas-web", heard);
    };
  });
  onDestroy(() => ask({ op: "close" }));
</script>

<div class="web-pane">
  <div class="bar">
    {#if native}
      <button class="icon-btn" title="Back (Alt+←)" disabled={!nav.back} onclick={() => ask({ op: "back" })}><Icon name="arrow-left" size={14} /></button>
      <button class="icon-btn" title="Forward (Alt+→)" disabled={!nav.forward} onclick={() => ask({ op: "forward" })}><Icon name="arrow-right" size={14} /></button>
    {/if}
    <button class="icon-btn" class:spin={nav.loading} title="Reload (F5)" onclick={reload}><Icon name="refresh" size={14} /></button>
    <input bind:this={address} bind:value={url} onkeydown={(e) => { if (e.key === "Enter") go(); }} spellcheck="false" aria-label="Address" />
  </div>
  {#if native}
    <div class="slot" bind:this={slot}></div>
  {:else}
    <iframe bind:this={frame} src={shown} title={shown} sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-downloads allow-modals"></iframe>
  {/if}
</div>

<style>
  .web-pane { height: 100%; display: flex; flex-direction: column; background: var(--bg); }
  .bar { display: flex; align-items: center; gap: 6px; padding: 6px 10px; border-bottom: 1px solid var(--border); }
  .bar input { flex: 1; height: 26px; border-radius: var(--radius-sm); border: 1px solid var(--border); background: var(--bg-elev); color: var(--text); font: inherit; font-size: calc(12.5px * var(--ui-scale, 1)); padding: 0 10px; outline: 0; }
  .bar input:focus { border-color: color-mix(in srgb, var(--accent) 55%, transparent); }
  .bar .icon-btn:disabled { opacity: 0.35; }
  .spin :global(svg) { animation: spin 1s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
  iframe { flex: 1; border: 0; background: white; width: 100%; }
  /* the native view lies over this; the colour shows only while it is hidden or not made yet */
  .slot { flex: 1; min-height: 0; background: var(--bg); }
</style>
