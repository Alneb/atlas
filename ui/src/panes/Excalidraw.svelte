<script lang="ts">
  import { releaseCanvases } from "../lib/release-canvases";
  import { lastPage, rememberPage } from "../lib/last-pages";
  import { errText } from "../lib/text";
  import { superOf } from "../lib/keys";
  // Excalidraw drawing over a plain `.excalidraw` file — or an Obsidian plugin `.excalidraw.md`, whose
  // compressed scene block is rewritten in place. Autosaves (1 s after the last stroke, 409-safe), Ctrl+S
  // saves now. No image beside it: a note embeds the
  // drawing itself; "Drawing: export as SVG" writes `<file>.svg` on demand.
  import { onMount } from "svelte";
  import type { PaneProps } from "../lib/dock";
  import { setDirty } from "../lib/dock";
  import { api, ApiError } from "../lib/api";
  import { shownPath } from "../lib/paths";
  import { toast } from "../lib/state.svelte";
  import { settings } from "../lib/settings.svelte";
  import { plugins } from "../lib/plugins.svelte";
  import { on } from "../lib/bus";
  import { fullscreen, toggleFullscreen } from "../lib/fullscreen.svelte";
  import { mountDrawing, isPluginDrawing, sceneJson, writeSceneInto, type Drawing, type Notepad } from "../lib/draw-excalidraw";
  import NotepadBar from "../components/NotepadBar.svelte";
  import Icon from "../components/Icon.svelte";
  import { nativeShell } from "../lib/native-shell.svelte";
  import { hostOf, mirrorState, type MirrorState } from "../lib/mirror";
  import { drawingExports, drawingPages } from "../lib/registry";

  let { spec, panel }: PaneProps<"excalidraw"> = $props();
  let host: HTMLDivElement;
  let d: Drawing | null = null;
  let baseMtime: number | undefined;
  let dirty = $state(false);
  let saving: Promise<void> | null = null;
  let conflict = $state(false);
  let pad = $state<Notepad | null>(null); // pen mode (e-ink): the notepad's own toolbar instead of Excalidraw's
  let full = $state(false); // …or all of Excalidraw's tools, asked for
  // zen: the page alone — the
  // toolbar gone and the app's chrome with it (fullscreen, which it leaves as it found it); a corner button comes back
  let zen = $state(false), zenMadeFull = false;
  async function setZen(on: boolean): Promise<void> {
    if (on === zen) return;
    zen = on;
    document.documentElement.classList.toggle("atlas-zen", on); // chrome.css: nothing but the drawing
    if (on && !fullscreen.on) { zenMadeFull = true; await toggleFullscreen(); }
    // the phone app keeps its own fullscreen (the page's `fullscreen.on` stays off there): toggled back as it was toggled
    else if (!on && zenMadeFull) { zenMadeFull = false; if (fullscreen.on || nativeShell.on) await toggleFullscreen(); }
  }
  let error = $state("");
  /** This vault's mirror (lib/mirror.ts): saved here, drawn live in the server's room (core server.rs live_ws); the chip. */
  let mirror = $state<{ host: string; state: MirrorState } | null>(null);
  /** Who saves while it is drawn live (lib/live.ts writes()); read again as the room changes. */
  const writesHere = $derived.by(() => { void peers; return d?.writes() ?? true; });
  let timer = 0;
  let original = ""; // a plugin file's full text: the scene is written back into it
  let peers = $state<string[]>([]); // the other devices drawing here now (draw-live.ts)
  const plugin = $derived(isPluginDrawing(spec.path));
  const themeNow = () => (document.documentElement.dataset.theme === "light" ? "light" : "dark");

  /** A 409 that is only our own last write seen with another mtime (Android's shared storage reports one after a
   *  rename and another later): the file still holds what we last loaded or saved → take its mtime, not a conflict. */
  async function ownWrite(): Promise<boolean> {
    const f = await api.file(spec.path).catch(() => null);
    if (!f || f.text !== original) return false;
    baseMtime = f.mtime;
    return true;
  }

  /** A 409: the other save merged in element by element (draw-live.ts; each element its newest version), ours on top —
   *  whether or not that device is in the live room now. */
  async function mergeTheirs(): Promise<boolean> {
    if (plugin || !d) return false;
    const f = await api.file(spec.path).catch(() => null);
    if (!f) return false;
    d.merge(f.text);
    baseMtime = f.mtime;
    return true;
  }

  /** The file's text now: the scene, written into the plugin note it lives in when it is one. */
  const fileText = (): Promise<string> => (plugin ? d!.serialize().then((sc) => writeSceneInto(original, sc)) : d!.serialize());

  /** `closing`: the drawing's last text, read before the pane went — saved all the same, or kept, never dropped. */
  async function save(closing?: Promise<string>) {
    clearTimeout(timer);
    while (saving) await saving; // strokes made meanwhile are read after
    if (!closing && !d) return;
    if (conflict) { if (closing) rescue(await closing); return; }
    // drawn live with a device that writes: its save has these strokes (sent through the room), back here by Syncthing
    if (d && !d.writes()) return;
    saving = (async () => {
      let text = await (closing ?? fileText());
      try {
        let r;
        try { r = await api.putFile(spec.path, text, baseMtime); }
        catch (e) {
          if (!(e instanceof ApiError && e.status === 409)) throw e;
          if (await ownWrite()) r = await api.putFile(spec.path, text, baseMtime);
          else if (!closing && (await mergeTheirs())) { text = await fileText(); r = await api.putFile(spec.path, text, baseMtime); }
          else throw e;
        }
        baseMtime = r.mtime;
        original = text;
        if (!closing) dirty = false;
      } catch (e) {
        if (e instanceof ApiError && e.status === 409) conflict = true;
        else error = `Save failed: ${errText(e)}`;
        if (closing) rescue(text);
      }
    })();
    try { await saving; } finally { saving = null; }
  }

  /** The pane closed with strokes that could not be saved: the whole drawing kept beside the vault's recovery copies. */
  function rescue(text: string) {
    const to = `.atlas/cache/recovery/${spec.path}`;
    void api.putFile(to, text).catch(() => {});
    toast(`${shownPath(spec.path)} could not be saved`, `The drawing is kept in ${to}.`, "error", 12000);
  }

  async function reload() {
    conflict = false;
    d?.destroy();
    d = null;
    pad = null;
    await load();
  }

  /** The notepad's look and gestures (the Boox's: its bar, pens, paper, fingers move the page) everywhere, not only on
   *  e-ink;
   *  `draw.notepad = false` in the vault's config brings plain Excalidraw back (its tools are one button away anyway). */
  function notepadStyle(): boolean {
    if (document.documentElement.classList.contains("eink")) return true;
    return settings.config?.draw.notepad ?? true;
  }

  /** Pages side by side for a new notebook: the notepad plugin's `per_row`, the Boox's own setting (4 without it). */
  const notepad = () => plugins.list.find((p) => p.id === "notepad")?.settings;
  const perRow = () => Number(notepad()?.per_row) || 4;
  const pageMode = () => notepad()?.page_mode !== false && notepad()?.page_mode !== "false"; // on unless turned off

  async function load() {
    try {
      const f = await api.file(spec.path);
      baseMtime = f.mtime;
      original = f.text;
      d = await mountDrawing(host, plugin ? await sceneJson(f.text) : f.text, themeNow(), () => {
        dirty = true;
        clearTimeout(timer);
        timer = window.setTimeout(save, 1000);
      }, { pen: notepadStyle(), onFullscreen: () => void toggleFullscreen(), path: spec.path, live: settings.config?.editor.live ?? true, onPeers: (n) => (peers = n), perRow: perRow(), pageMode: notepadStyle() && pageMode() });
      pad = d.notepad ?? null;
      if (spec.page) d.showPage(spec.page); // opened from a page's embed
      else { const at = await lastPage(spec.path); if (at) d.showPage(`^frame=${at}`); } // else where it was last shown
      dirty = false;
      // Excalidraw's autoFocus fires before dockview shows the pane; focus once it is laid out.
      requestAnimationFrame(() => host.querySelector<HTMLElement>(".excalidraw")?.focus());
    } catch (e) {
      error = errText(e);
    }
  }

  function onkeydown(e: KeyboardEvent) {
    if ((e.ctrlKey || superOf(e)) && e.key.toLowerCase() === "s") { e.preventDefault(); e.stopPropagation(); void save(); }
  }

  $effect(() => { setDirty(panel.id, dirty); });

  onMount(() => {
    let gone = false;
    void load();
    const askMirror = () => void mirrorState().then((m) => { if (!gone) mirror = m && { host: hostOf(m.address), state: m.state }; }, () => {});
    askMirror();
    window.addEventListener("atlas-mirror-unlinked", askMirror); // linked or unlinked in the vault switcher
    drawingPages.set(panel.id, (p) => d?.showPage(p)); // an embed's "Edit Page 2" with the drawing already open
    drawingExports.set(panel.id, async () => {
      if (!d) throw new Error("the drawing is still loading");
      await api.putFile(`${spec.path}.svg`, await d.svg());
      return `${spec.path}.svg`;
    });
    const mo = new MutationObserver(() => d?.setTheme(themeNow()));
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    // Changed on disk by someone else while we have no unsaved strokes → take the new version.
    const off = on("fs", (e) => {
      if (!e.paths.includes(spec.path) || dirty || saving) return;
      void api.file(spec.path).then((f) => {
        if (f.text === original) baseMtime = f.mtime; // our own save, seen by the watcher
        // another device's save: merged in where the view is, no reload (it flashed and recentred)
        else if (d && !plugin) { d.merge(f.text); baseMtime = f.mtime; original = f.text; }
        else void reload();
      });
    });
    // the page on screen, kept for the next opening (written only when it changes)
    const keepPage = () => { if (d) void rememberPage(spec.path, d.pageNow()); };
    const pageTick = window.setInterval(keepPage, 5000);
    return () => {
      gone = true;
      if (zen) document.documentElement.classList.remove("atlas-zen"); // the pane closed in zen: the app back
      keepPage(); clearInterval(pageTick);
      if (dirty && d) void save(fileText()); // the scene read now, before the drawing goes
      window.removeEventListener("atlas-mirror-unlinked", askMirror);
      drawingPages.delete(panel.id); drawingExports.delete(panel.id); mo.disconnect(); off(); clearTimeout(timer); releaseCanvases(host); d?.destroy(); setDirty(panel.id, false); };
  });
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="draw-pane" {onkeydown}>
  {#if conflict}
    <div class="banner">This drawing changed on disk. <button onclick={reload}>Reload it</button> (your unsaved strokes are lost) or keep drawing and copy what you need first.</div>
  {/if}
  {#if error}<div class="banner err">{error}</div>{/if}
  {#if peers.length}<div class="live" title="These devices have this drawing open: their strokes and pen show here as they draw.{mirror ? (writesHere ? ' This device writes the drawing.' : ' Another device writes; its saves come here through Syncthing.') : ''}">Live · {[...new Set(peers)].join(", ")}{#if mirror} · ⇄ {mirror.host}{/if}</div>
  {:else if mirror}<div class="live mirror" class:down={mirror.state !== "online"} title={mirror.state === "online"
    ? `Live with ${mirror.host}, this vault's mirror: saved in this folder, the server leasing each save so Syncthing never sees two versions. This device writes the drawing.`
    : `${mirror.host} ${mirror.state === "signin" ? "wants a sign-in" : "is offline"}: this drawing is saved here only, and a later difference is merged.`}>⇄ {mirror.host}{mirror.state === "online" ? "" : mirror.state === "signin" ? " · sign in" : " · offline"}</div>{/if}
  <div class="host" class:pen={pad} class:notepad={pad && !full} bind:this={host}></div>
  {#if pad && !zen}<NotepadBar {pad} bind:full onFullscreen={() => void toggleFullscreen()} onZen={() => void setZen(true)} />{/if}
  {#if zen}<button class="zen-out" title="Leave zen: the toolbar and the app back" aria-label="Leave zen" onclick={() => void setZen(false)}><Icon name="close" size={16} /></button>{/if}
</div>

<style>
  .draw-pane { height: 100%; display: flex; flex-direction: column; background: var(--bg); position: relative; }
  /* the notepad: only the page and NotepadBar — Excalidraw's menus, shape tools, hints and footer come back with "All tools" */
  .host.notepad :global(.App-menu_top), .host.notepad :global(.layer-ui__wrapper__footer), .host.notepad :global(.HintViewer),
  .host.notepad :global(.App-bottom-bar) { display: none !important; }
  /* fingers are ours on a pen tablet (draw-notepad.ts): the browser neither scrolls nor zooms, nor cancels a gesture it
     thought was its own (a pointercancel half-way was what made pinching unreliable) */
  .host.pen, .host.pen :global(canvas) { touch-action: none; }
  .host { flex: 1; min-height: 0; position: relative; }
  .live { position: absolute; z-index: 3; bottom: 10px; left: 50%; transform: translateX(-50%); padding: 3px 10px; border-radius: 999px;
    background: var(--accent); color: var(--accent-fg, #fff); font-size: calc(12px * var(--ui-scale, 1)); pointer-events: none; }
  .live.mirror { background: var(--bg-elev); color: var(--text-muted); border: 1px solid var(--border); opacity: .85; }
  .live.mirror.down { color: var(--text-faint); border-style: dashed; }
  /* Excalidraw in Atlas's look ("to meet the design of our app"), light, dark and e-ink alike: its own
     variables set from our tokens — more specific than its .theme--dark, so ours follow the theme */
  .host :global(.excalidraw) {
    --ui-font: var(--font-ui, Inter, system-ui, sans-serif);
    --color-primary: var(--accent); --color-primary-darker: var(--accent-strong); --color-primary-darkest: var(--accent-strong);
    --color-primary-hover: var(--accent-strong); --color-primary-light: var(--accent-soft); --color-primary-light-darker: var(--accent-sel);
    --color-surface-primary-container: var(--accent-soft);
    --island-bg-color: var(--bg-elev); --popup-bg-color: var(--bg-elev); --default-bg-color: var(--bg); --input-bg-color: var(--bg);
    --color-surface-lowest: var(--bg); --color-surface-low: var(--bg-elev); --color-surface-mid: var(--bg-hover); --color-surface-high: var(--bg-active);
    --button-bg: var(--bg-elev); --button-hover-bg: var(--bg-hover); --button-gray-1: var(--bg-hover);
    --default-border-color: var(--border); --color-border-outline: var(--border-strong); --color-border-outline-variant: var(--border);
    --color-on-surface: var(--text); --text-primary-color: var(--text);
    --shadow-island: var(--shadow-pop); --border-radius-lg: var(--radius-lg); --border-radius-md: var(--radius);
  }
  .host :global(.excalidraw .Island) { border: 1px solid var(--border); }
  .zen-out { position: absolute; z-index: 6; top: 8px; right: 8px; width: 34px; height: 34px; display: grid; place-items: center; border-radius: 50%;
    border: 2px solid var(--text); background: var(--bg); color: var(--text); opacity: .55; }
  .zen-out:hover, .zen-out:focus-visible { opacity: 1; }
  .host :global(.atlas-draw-full) { width: 2.25rem; height: 2.25rem; border-radius: 8px; border: 1px solid var(--border); background: var(--bg-elev); color: var(--text); font-size: 1.1rem; }
  .banner { padding: 6px 12px; background: var(--bg-elev); border-bottom: 1px solid var(--border); font-size: calc(12.5px * var(--ui-scale, 1)); color: var(--text); }
  .banner button { color: var(--accent); text-decoration: underline; }
  .banner.err { color: var(--danger, #e66); }
</style>
