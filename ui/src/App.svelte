<script lang="ts">
  import { errText } from "./lib/text";
  import { initCssSnippets } from "./lib/css-snippets.svelte";
  import { allCommands, bindings, loadKeymap } from "./lib/keymap.svelte";
  import { loadPlugins, watchPlugins } from "./lib/plugins.svelte";
  import { PANE_KINDS } from "./lib/panes";
  // Shell: tab sidebar (or the rail, with horizontal tabs) | dockview | status bar, plus palette
  // and toasts. Wires server events and keys.
  import { onMount } from "svelte";
  import { apiBase } from "./lib/api";
  import { installPreviews } from "./lib/preview";
  import { api, connectEvents } from "./lib/api";
  import { watchServiceSignins } from "./lib/service-signin";
  import { emit, on } from "./lib/bus";
  import { sweep, counts as hibernationCounts } from "./lib/hibernate";
  import { guardMiddlePaste } from "./lib/middle-paste";
  import { initDock, open, openPath, getDock, activeEditorId, canNavigate, navigate, steppedJustNow } from "./lib/dock";
  import { attachBrowserBack } from "./lib/back";
  import { attachTouch } from "./lib/touch";
  import { paneComponents as components } from "./lib/pane-components";
  import type { FocusTarget } from "./lib/types";
  import { editors, lastEditorId, parkAll } from "./lib/registry";
  import { focusCapture, openHome, shellTerminal, claudeTerminal } from "./lib/actions";
  import { matches } from "./lib/keys";
  import { palette, openPalette } from "./lib/palette.svelte";
  import { app, toast, paintTheme } from "./lib/state.svelte";
  import { loadSettings, settings } from "./lib/settings.svelte";
  import { installDiagnostics } from "./lib/diagnostics";
  import { installNavInput } from "./lib/nav-input";
  import { invalidate } from "./lib/raw";
  import Rail from "./components/Rail.svelte";
  import Sidebar from "./components/Sidebar.svelte";
  import { attachTabs, tabs, whenNoTabs } from "./lib/tabs.svelte";
  import { attachPaneZoom } from "./lib/pane-zoom";
  import { attachGoneFiles } from "./lib/gone-files";
  import { attachFullscreen, fullscreen } from "./lib/fullscreen.svelte";
  import { attachPhone, phone } from "./lib/phone.svelte";
  import { attachEink } from "./lib/eink";
  import { attachNativeShell, nativeShell } from "./lib/native-shell.svelte";
  import PhoneBar from "./components/PhoneBar.svelte";
  import PhoneTop from "./components/PhoneTop.svelte";
  import { autosaveLayout, initWorkspaces, restoreLayout } from "./lib/workspaces";
  import { loadShellPrefs } from "./lib/shell-prefs";
  import { initBookmarks } from "./lib/bookmarks.svelte";
  import { initSidebar } from "./lib/sidebar.svelte";
  import { initRecent } from "./lib/recent";
  import "./lib/sidebar-blocks";
  import StatusBar from "./components/StatusBar.svelte";
  import Palette from "./components/Palette.svelte";
  import Toasts from "./components/Toasts.svelte";

  let dockEl: HTMLDivElement;

  // shortcuts: defaults, `.atlas/keys.toml` overrides and script keys, all from one keymap
  const bound = $derived(bindings());

  /** Is the key for a pane matching `sel`? Inside it, or focus is nowhere (the pane redrew what held
   *  it) and it is the active pane. */
  function keeps(sel: string, target: HTMLElement | null): boolean {
    if (target !== document.body) return !!target?.closest?.(sel);
    return !!getDock()?.activePanel?.view.content.element.querySelector(sel);
  }

  function onKey(e: KeyboardEvent) {
    if (e.defaultPrevented && !palette.open) return;
    const target = e.target as HTMLElement | null;
    const inTerminal = !!target?.closest?.(".xterm"), inNote = !!target?.closest?.(".cm-editor.live-cm");
    for (const b of bound) {
      if (!matches(b.chord, e) || (b.cmd.where === "note" && !inNote)) continue;
      // a terminal keeps every key without Super for its shell (Ctrl+W, Ctrl+K, Ctrl+B, Alt+…): from
      // there Atlas answers only Super keys, F-keys and commands marked `fromTerminal`
      const shellKey = !b.chord.meta && !/^F\d{1,2}$/.test(b.chord.code);
      if ((inTerminal && shellKey && !b.cmd.fromTerminal) || (b.cmd.yieldTo && keeps(b.cmd.yieldTo, target))) return;
      e.preventDefault();
      e.stopPropagation();
      void b.cmd.run();
      return;
    }
  }

  function focusPane(p: FocusTarget): void {
    switch (p) {
      case "today": focusCapture(); break;
      case "files": open({ kind: "files" }); break;
      case "search": open({ kind: "search" }); break;
      case "commands": openPalette("all"); break;
      case "terminal": shellTerminal(); break;
      case "claude": claudeTerminal(); break;
      case "editor": {
        const d = getDock();
        const ed = d?.panels.find((x) => editors.has(x.id));
        if (ed) { ed.api.setActive(); editors.get(ed.id)?.focus(); }
        break;
      }
      default: { const never: never = p; console.warn("[atlas] focus: unknown pane", never); }
    }
  }

  onMount(() => {
    installPreviews(); // hover previews of links and of the left bar's tabs
    installDiagnostics();
    // this window's vault is the active one: the capture box (atlas-capture) starts on the vault opened last
    const active = () => { if (!apiBase().startsWith("/remote/")) void fetch(`${apiBase()}/api/vaults/active`, { method: "POST", headers: { "x-atlas": "1" } }).catch(() => {}); };
    window.addEventListener("focus", active);
    if (document.hasFocus()) active(); // a switch loads the vault's page in a window that has the focus already
    paintTheme(app.theme); // cached choice first (no flash), then the real settings
    const settled = loadSettings().catch((err) => toast("Settings not loaded", errText(err), "error"));
    const dock = initDock(dockEl, components);
    attachTabs(dock);
    // "if no tab is open home should open automatically" — in the phone app its native Home does that
    if (!nativeShell.on) whenNoTabs(dock, () => void openHome());
    attachPaneZoom(dock);
    attachGoneFiles(dock);
    attachFullscreen(dock, dockEl);
    const offPhone = attachPhone(dock);
    const offEink = attachEink(dock); // e-ink: a full refresh where ghosts come from
    const offNative = attachNativeShell();
    // a browser's Back closes what is open, then goes back a place; a phone then leaves Atlas, a desktop stays in its vault.
    // A mouse's side button is taken by nav-input.ts as well: that step counts once.
    const offTouch = attachTouch(); // a long press is a right click; finger-sized targets are styles/touch.css
    const offBack = attachBrowserBack(() => !nativeShell.on, () => steppedJustNow() || (canNavigate(-1) && (navigate(-1), true)), () => phone.on);
    // The tabs as they were left (a file of this vault — docs/design/SHELL.md), unless the setting says to
    // start clean. Home is the first screen either way: restored layouts keep their panes, but home
    // is always there. `home = ""` brings back the classic Today pane.
    let stopLayout = () => {};
    // the phone app keeps its own tabs (the layout file is the desktop's: neither read nor written there)
    if (!nativeShell.on) void settled
      .then(() => loadShellPrefs(settings.config?.ui.restore_layout !== false))
      .then(() => restoreLayout(settings.config?.ui.restore_layout !== false))
      .catch(() => false)
      .then(() => { stopLayout = autosaveLayout(); return openHome(); });

    api.workspace().then((w) => {
      app.workspace = w;
      document.title = `${w.name} — Atlas`;
    }, (err) => console.warn("[atlas] workspace fetch failed", err));

    void loadKeymap().catch(() => {});
    initCssSnippets();
    // the side panes' code, fetched once the app is idle: a shortcut then mounts its pane at once,
    // instead of the keys typed right after it landing in whatever had the focus (depth audit)
    const warm = () => { for (const k of ["search", "files", "outline", "git", "editor"] as const) void components[k]().catch(() => {}); };
    if ("requestIdleCallback" in window) requestIdleCallback(warm, { timeout: 3000 }); else setTimeout(warm, 1500);
    void loadPlugins();
    // introspection for automation and the UX audit: what exists, by the app's own account
    (window as unknown as { __atlas: unknown }).__atlas = {
      commands: () => allCommands().map(({ id, title, source, keys }) => ({ id, title, source, keys })),
      paneKinds: PANE_KINDS,
      editor: () => { const id = activeEditorId() ?? lastEditorId(); const e = id ? editors.get(id) : undefined; return e ? { path: e.path, vim: e.vimMode(), ...e.snapshot() } : null; },
      // the profiler's long-day scenario (scripts/dev/profile-longday.mjs) drives tabs through these
      open: (path: string) => openPath(path),
      run: (id: string) => allCommands().find((c) => c.id === id)?.run(),
      panes: () => getDock()?.panels.map((p) => ({ id: p.id, active: p.api.isActive })) ?? [],
      close: (id: string) => getDock()?.getPanel(id)?.api.close(),
      hibernate: (olderThanMs?: number) => sweep(olderThanMs),
      sleeping: () => hibernationCounts(),
    };

    void initRecent();
    const events = connectEvents(emit, (s) => (app.conn = s));
    const offs = [
      on("open", (e) => openPath(e.path, e.line)),
      on("notify", (e) => toast(e.title, e.body)),
      on("focus", (e) => focusPane(e.pane)),
      on("fs", (e) => e.paths.forEach(invalidate)),
      on("fs", (e) => { if (e.paths.includes(settings.path)) loadSettings().catch(() => {}); }),
      on("fs", (e) => { if (e.paths.some((p) => p === ".atlas/keys.toml" || p.startsWith(".atlas/commands/"))) void loadKeymap().catch(() => {}); }),
      watchPlugins(),
      watchServiceSignins(),
      initWorkspaces(),
      initBookmarks(),
      initSidebar(),
      () => stopLayout(),
      offPhone,
      offEink,
      offNative,
      offBack,
      offTouch,
    ];

    window.addEventListener("keydown", onKey, true);
    const offNav = installNavInput();
    const offMiddle = guardMiddlePaste();
    const ro = new ResizeObserver(() => dock.layout(dockEl.clientWidth, dockEl.clientHeight));
    ro.observe(dockEl);
    // best effort: flush pending editor saves when the window goes away
    const beforeUnload = () => { void Promise.allSettled(parkAll()); };
    window.addEventListener("beforeunload", beforeUnload);

    return () => {
      events.close();
      offs.forEach((f) => f());
      window.removeEventListener("keydown", onKey, true);
      offNav();
      offMiddle();
      window.removeEventListener("beforeunload", beforeUnload);
      ro.disconnect();
      dock.dispose();
    };
  });
</script>

<div class="shell" class:full={fullscreen.on} class:phone={phone.on} class:vtabs={tabs.layout === "vertical"} class:split={tabs.groups.filter((g) => g.visible).length > 1}>
  {#if phone.on && !nativeShell.on}<PhoneTop />{/if}
  <div class="main">
    {#if tabs.layout === "vertical"}<Sidebar />{:else}<Rail />{/if}
    <!-- vertical tabs: the sidebar runs the full height (Zen), the status bar sits under the panes -->
    <div class="work">
      <div class="dock-wrap"><div class="dock" bind:this={dockEl}></div></div>
      {#if tabs.layout === "vertical"}<StatusBar />{/if}
    </div>
  </div>
  {#if tabs.layout !== "vertical"}<StatusBar />{/if}
  {#if phone.on && !nativeShell.on}<PhoneBar />{/if}
</div>
<Palette />
<Toasts />

<style>
  /* clip: the shell never scrolls, not even programmatically (focus/scrollIntoView) */
  .shell { position: fixed; inset: 0; display: flex; flex-direction: column; background: var(--bg-app); overflow: clip; }
  .main { flex: 1; min-height: 0; display: flex; overflow: clip; }
  /* the dock gets explicit edges, not height: 100% — WebKitGTK (the desktop app) resolves a percentage
     inside a stretched flex item against the content, and the dock grew to 2× the window (ui.log) */
  .work { flex: 1; min-width: 0; min-height: 0; display: flex; flex-direction: column; }
  .dock-wrap { flex: 1; min-width: 0; min-height: 0; position: relative; overflow: clip; }
  .dock { position: absolute; top: 6px; right: 6px; bottom: 0; left: 0; }
  .vtabs .dock { top: 8px; right: 8px; }
  /* fullscreen (lib/fullscreen.svelte.ts): the maximized pane and the left bar as icons (it opens on hover);
     the rest hidden, not unmounted, so nothing reloads. No frame round the pane: the accent-tinted border
     of an active group in a split meant nothing with one pane on screen. */
  .full .main > :global(:not(.work):not(.slot)), .full :global(.status) { display: none; }
  .full .dock { inset: 0; }
  .full :global(.dockview-theme-atlas .dv-groupview) { border-color: transparent; border-radius: 0; }
  /* the phone (lib/phone.svelte.ts): the tab strip thumb-high and scrolling sideways; the shell under the system's bars */
  .phone { padding-top: env(safe-area-inset-top, 0px); }
  /* inside the phone app (lib/native-shell.svelte.ts) its native bars stand in for these, and for the system's insets */
  :global(.native-shell) .phone { padding-top: 0; }
  :global(.native-shell) .phone :global(.dv-tabs-and-actions-container), :global(.native-shell) .phone :global(footer.status) { display: none; }
  .phone .main > :global(:not(.work)) { display: none; } /* not even fullscreen's icon strip: the bottom bar takes its place */
  .phone :global(.dv-tabs-and-actions-container) { height: 42px; }
  .phone :global(.dv-tabs-container) { overflow-x: auto; scrollbar-width: none; }
</style>
