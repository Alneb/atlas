<script lang="ts">
  // Terminal pane: xterm.js over WS /api/pty (binary frames both ways, text frame for resize).
  import { onMount } from "svelte";
  import { Terminal } from "@xterm/xterm";
  import { FitAddon } from "@xterm/addon-fit";
  import { WebLinksAddon } from "@xterm/addon-web-links";
  import { openOutside, openWeb } from "../lib/web-links";
  import { Unicode11Addon } from "@xterm/addon-unicode11";
  import { WebglAddon } from "@xterm/addon-webgl";
  import { openPty, ptyResize, ptyEnd, vaultScoped } from "../lib/api";
  import { app } from "../lib/state.svelte";
  import { settings, onSettings } from "../lib/settings.svelte";
  import type { PaneProps } from "../lib/dock";
  import { terminals } from "../lib/registry";
  import { paneZoom, PANE_ZOOM_EVENT, wheelZoom } from "../lib/pane-zoom";
  import { closePanel, focusPanel } from "../lib/dock";
  import Icon from "../components/Icon.svelte";
  import { terminalButtons } from "../lib/terminal-buttons.svelte";
  import { agentOfTab } from "../lib/agents";
  import { getDock } from "../lib/dock-instance";
  import { wikilinkProvider } from "../lib/terminal-wikilinks";
  import { atPointer, popMenu } from "../lib/menu";
  import { cleanTerminalCopy } from "../lib/text";

  let { spec, panel }: PaneProps<"terminal"> = $props();
  // an agent tab: the buttons its agent's plugin puts there (terminal-buttons.svelte.ts)
  const agent = $derived(agentOfTab(spec));
  const buttons = $derived(agent ? terminalButtons.filter((b) => b.plugin === agent.plugin) : []);
  function press(run: (typeof terminalButtons)[number]["run"]): void {
    if (agent) void run({ id: panel.id, agent: agent.ref, session: spec.session, show: () => { focusPanel(panel.id); terminals.get(panel.id)?.focus(); } });
  }
  /** This window, the same across a reload of it (sessionStorage), another in a second window or test. */
  function windowKey(): string {
    try {
      const at = vaultScoped("atlas-window");
      let k = sessionStorage.getItem(at);
      if (!k) { k = crypto.randomUUID(); sessionStorage.setItem(at, k); }
      return k;
    } catch { return "window"; }
  }
  const ZOOM_KEYS = new Set(["Equal", "Minus", "Digit0", "NumpadAdd", "NumpadSubtract", "Numpad0"]);
  // by the character too: on a Spanish (or German…) keyboard + and - are other keys (BracketRight, Slash), which the
  // codes above missed — the shell got Ctrl++ and the terminal never zoomed there
  const ZOOM_CHARS = new Set(["+", "=", "-", "0"]);
  const zoomChord = (e: KeyboardEvent) => e.ctrlKey && !e.metaKey && (ZOOM_KEYS.has(e.code) || ZOOM_CHARS.has(e.key)) && (!e.shiftKey || e.key === "+");
  const size = () => Math.round((settings.config?.terminal.font_size ?? 13) * paneZoom(panel.id));
  let host: HTMLDivElement;
  let conn = $state<"connecting" | "open" | "exited">("connecting");

  const css = () => getComputedStyle(document.documentElement);
  const COLOURS = ["black", "red", "green", "yellow", "blue", "magenta", "cyan", "white"] as const;
  // A token may be any CSS colour — a chosen accent makes --accent-sel a `color-mix(…)` — which xterm cannot read: it
  // fell back to its own selection colour, a white haze that does not show on a light background. Each one is painted
  // on a pixel and read back as the rgba() xterm parses.
  const pixel = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
  function rgba(colour: string): string {
    if (!colour || !pixel) return colour;
    pixel.clearRect(0, 0, 1, 1);
    pixel.fillStyle = "#000";
    pixel.fillStyle = colour;
    pixel.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = pixel.getImageData(0, 0, 1, 1).data;
    return `rgba(${r}, ${g}, ${b}, ${+(a / 255).toFixed(3)})`;
  }
  /** xterm's theme from the --ansi-* tokens (tokens.css; a VS Code theme may set them). */
  function themeFromCss(): Record<string, string> {
    const c = css();
    const v = (n: string) => rgba(c.getPropertyValue(n).trim());
    const cap = (s: string) => s[0].toUpperCase() + s.slice(1);
    return {
      background: v("--term-bg"), foreground: v("--text"), cursor: v("--accent"), cursorAccent: v("--term-bg"),
      selectionBackground: v("--accent-sel"),
      ...Object.fromEntries(COLOURS.flatMap((k) => [[k, v(`--ansi-${k}`)], [`bright${cap(k)}`, v(`--ansi-bright-${k}`)]])),
    };
  }
  /** A Claude tab's session: made once and kept in the tab's spec (saved with the layout), so a
   *  restored tab — or Enter after it ended — reopens its own conversation (the core resumes it). */
  function claudeSession(): string | undefined {
    if (spec.preset !== "claude" || spec.command) return undefined;
    if (!spec.session) {
      spec = { ...spec, session: crypto.randomUUID() };
      panel.updateParameters(spec);
    }
    return spec.session;
  }
  /** A CSS colour as X11's `rgb:rrrr/gggg/bbbb`, the form OSC 10 / 11 answers take. */
  function xColor(c: string): string {
    const ctx = document.createElement("canvas").getContext("2d")!;
    ctx.fillStyle = "#000";
    ctx.fillStyle = c; // the browser normalises any CSS colour to #rrggbb (or rgba() with alpha)
    const hex = /^#([0-9a-f]{6})$/i.exec(ctx.fillStyle)?.[1] ?? (ctx.fillStyle.match(/\d+/g) ?? ["0", "0", "0"]).slice(0, 3).map((n) => (+n).toString(16).padStart(2, "0")).join("");
    const [r, g, b] = [0, 2, 4].map((i) => hex.slice(i, i + 2));
    return `rgb:${r}${r}/${g}${g}/${b}${b}`;
  }
  /** Text darker than this ratio against its background is lifted (light mode: dark-theme colours stay legible). */
  const contrast = () => Number(css().getPropertyValue("--term-contrast")) || 1;

  onMount(() => {
    const term = new Terminal({
      fontFamily: '"JetBrains Mono", "Atlas Term Symbols", ui-monospace, monospace',
      fontSize: size(),
      lineHeight: 1.25,
      cursorBlink: !document.documentElement.classList.contains("eink"), // e-ink: a blink is a refresh twice a second
      cursorStyle: "bar",
      allowProposedApi: true,
      scrollback: 10000,
      theme: themeFromCss(),
      minimumContrastRatio: contrast(),
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    // the title a program gives its terminal (OSC 0/2: Claude Code's topic, a shell's cwd, vim's file)
    let screenTitle = "";
    term.onTitleChange((t) => { screenTitle = t.trim(); });
    // a web address in the output opens as Atlas opens links (a web tab; Shift+click the system's browser), without
    // what closes it in prose — "(https://x.org/a)." gave xterm's default the ")." too, and it opened a plain window
    term.loadAddon(new WebLinksAddon((e, uri) => {
      const u = uri.replace(/[)\].,;:!?'"]+$/, "");
      if (e.shiftKey) openOutside(u); else openWeb(u);
    }));
    // Unicode 11 widths, as zsh and fastfetch count them: with xterm's Unicode 6 an emoji or icon took one column where
    // the shell put two, and a prompt's decoration or a logo slid and wrapped (worst in a narrow column)
    term.loadAddon(new Unicode11Addon());
    term.unicode.activeVersion = "11";
    term.registerLinkProvider(wikilinkProvider(term)); // [[note]] in the output opens the note (lib/terminal-wikilinks.ts)
    const enc = new TextEncoder();
    let ws: WebSocket | null = null;
    let disposed = false;
  // a terminal that starts (or comes to the front a frame late) does not take the keys from a field being typed in —
  // a tab being renamed lost its name to a Claude session opening (terminal-tabs.spec.ts)
  const typingElsewhere = () => {
    const a = document.activeElement as HTMLElement | null;
    return !!a && !host?.contains(a) && (a.tagName === "INPUT" || a.tagName === "TEXTAREA" || a.isContentEditable);
  };

    const connect = () => {
      conn = "connecting";
      try { fit.fit(); } catch { /* not laid out yet */ }
      // keyed by this window and tab: after a page reload this socket takes over the terminal still running
      ws = openPty({ preset: spec.preset, agent: spec.agent, cols: term.cols, rows: term.rows, command: spec.command, session: claudeSession(), key: `${windowKey()}/${panel.id}` });
      ws.onopen = () => {
        conn = "open";
        if (!ws) return;
        ptyResize(ws, term.cols, term.rows);
        for (const d of early.splice(0)) ws.send(enc.encode(d)); // what was typed while it connected
      };
      ws.onmessage = (m) => {
        if (m.data instanceof ArrayBuffer) term.write(new Uint8Array(m.data));
        else if (typeof m.data === "string") term.write(m.data);
      };
      ws.onclose = (e) => {
        if (disposed) return;
        // the program ended (`exit`, a command tab's command): the tab goes, like any terminal's
        if (e.code === 1000 && e.reason === "exited") { void closePanel(panel); return; }
        conn = "exited";
        setThemeNotify(false); // the next program asks for itself
        term.write("\r\n\x1b[2m[connection to Atlas lost — press Enter to start again]\x1b[0m\r\n");
      };
    };

    const copySel = () => { const sel = cleanTerminalCopy(term.getSelection()); if (sel) void navigator.clipboard.writeText(sel); };
    const pasteIn = () => void navigator.clipboard.readText().then((t) => term.paste(t), () => {});
    // Konsole's keys: Ctrl+Shift+C copies the selection, Ctrl+Shift+V pastes (plain Ctrl+C / V stay the shell's)
    term.attachCustomKeyEventHandler((e) => {
      // the zoom chords (Ctrl+= / Ctrl+- / Ctrl+0, with Alt: everything) are the app's: xterm sent them to the shell
      // and stopped them, so a terminal never zoomed
      if (zoomChord(e)) return false;
      if (e.type !== "keydown" || !e.ctrlKey || !e.shiftKey || e.altKey) return true;
      if (e.code === "KeyC") { copySel(); return false; }
      if (e.code === "KeyV") { pasteIn(); return false; }
      return true;
    });
    // OSC 10 / 11 "what are your colours?": answered with the theme's own, so a program that picks
    // its palette by the background (Claude Code's theme "auto", vim's background) sees light as
    // light — unanswered, Claude assumed dark and kept dark-theme colours on the light theme.
    for (const [code, key] of [[10, "foreground"], [11, "background"]] as const) {
      term.parser.registerOscHandler(code, (data) => {
        if (data !== "?") return false;
        if (ws?.readyState === WebSocket.OPEN) ws.send(enc.encode(`\x1b]${code};${xColor(themeFromCss()[key])}\x1b\\`));
        return true;
      });
    }
    // DEC mode 2031 (Contour's colour-palette updates): a program that sets it is told when the theme flips
    // (`CSI ? 997 ; 1|2 n`, dark|light) and asks OSC 11 again — Claude Code since 2.1.30x asks only then.
    // Kept per tab across a window reload, since the replayed output may no longer hold the `?2031h`.
    const notifyKey = `atlas-theme-notify/${windowKey()}/${panel.id}`;
    let themeNotify = (() => { try { return sessionStorage.getItem(notifyKey) === "1"; } catch { return false; } })();
    const setThemeNotify = (on: boolean) => {
      themeNotify = on;
      try { if (on) sessionStorage.setItem(notifyKey, "1"); else sessionStorage.removeItem(notifyKey); } catch { /* private window */ }
    };
    const themeReport = () => `\x1b[?997;${document.documentElement.dataset.theme === "light" ? 2 : 1}n`;
    for (const final of ["h", "l"] as const) {
      term.parser.registerCsiHandler({ prefix: "?", final }, (params) => {
        if (params.includes(2031)) setThemeNotify(final === "h");
        return false; // xterm still handles the other modes of the same sequence
      });
    }
    term.parser.registerCsiHandler({ prefix: "?", final: "n" }, (params) => {
      if (params[0] !== 996) return false; // DSR 996: "which theme now?"
      if (ws?.readyState === WebSocket.OPEN) ws.send(enc.encode(themeReport()));
      return true;
    });
    const early: string[] = [];
    term.onData((d) => {
      if (conn === "exited") { if (d === "\r") { term.reset(); connect(); } return; }
      if (ws?.readyState === WebSocket.OPEN) ws.send(enc.encode(d));
      else if (ws?.readyState === WebSocket.CONNECTING) early.push(d);
    });
    term.onBinary((d) => {
      if (ws?.readyState !== WebSocket.OPEN) return;
      const buf = new Uint8Array(d.length);
      for (let i = 0; i < d.length; i++) buf[i] = d.charCodeAt(i) & 0xff;
      ws.send(buf);
    });
    term.onResize(({ cols, rows }) => { if (ws) ptyResize(ws, cols, rows); });
    // the keys into this terminal; a pane just switched to may still be hidden for a frame (another
    // terminal of its group was in front), and a hidden textarea refuses focus: try again then
    const focus = () => {
      term.focus();
      if (!host.contains(document.activeElement)) requestAnimationFrame(() => { if (!disposed && !typingElsewhere()) term.focus(); });
    };
    terminals.set(panel.id, {
      preset: spec.preset,
      agent: spec.agent,
      usedAt: Date.now(),
      ready: () => conn === "open" && ws?.readyState === WebSocket.OPEN,
      paste: (t) => term.paste(t),
      run: (cmd) => { term.paste(cmd); term.input("\r"); },
      focus,
      title: () => screenTitle,
      lines: (n) => {
        const b = term.buffer.active, end = b.baseY + b.cursorY + 1;
        return Array.from({ length: Math.min(n, end) }, (_, i) => b.getLine(end - Math.min(n, end) + i)?.translateToString(true) ?? "");
      },
    });

    // Refit once the size settles (not per frame): every refit makes full-screen TUIs like Claude
    // reflow and redraw, which garbled the pane while a divider was being dragged.
    let settle: ReturnType<typeof setTimeout> | undefined;
    const ro = new ResizeObserver(() => {
      clearTimeout(settle);
      settle = setTimeout(() => {
        if (host.offsetWidth > 0 && !document.body.classList.contains("atlas-resizing")) { try { fit.fit(); } catch { /* hidden */ } }
      }, 120);
    });
    const onResizeEnd = () => { clearTimeout(settle); settle = setTimeout(() => { if (host.offsetWidth > 0) { try { fit.fit(); } catch { /* hidden */ } } }, 30); };
    window.addEventListener("atlas-resize-end", onResizeEnd);

    // Measure with the real font, or xterm's cell grid is computed for the fallback.
    void Promise.all([document.fonts.load('13px "JetBrains Mono"'), document.fonts.load('13px "Atlas Term Symbols"', "⎿")]).finally(() => {
      if (disposed) return;
      term.open(host);
      // WebGL draws box-drawing and block characters itself, cell-exact: Claude's │ lines join with no gaps.
      // Without WebGL (or when its context is lost) xterm's DOM renderer stays.
      if (settings.config?.terminal.renderer !== "text") try {
        const gl = new WebglAddon();
        gl.onContextLoss(() => gl.dispose());
        term.loadAddon(gl);
      } catch { /* no WebGL here */ }
      ro.observe(host);
      connect();
      if (panel.isActive && !typingElsewhere()) term.focus();
    });

    const offActive = panel.onDidActiveChange((e) => {
      if (!e.isActive) return;
      app.vimMode = "";
      requestAnimationFrame(focus);
    });
    const themeObs = new MutationObserver(() => {
      term.options.theme = themeFromCss();
      term.options.minimumContrastRatio = contrast();
      if (themeNotify && ws?.readyState === WebSocket.OPEN) ws.send(enc.encode(themeReport()));
    });
    themeObs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    // the setting's size times this tab's own zoom (Ctrl++ in the terminal)
    const resize = () => {
      if (term.options.fontSize === size()) return;
      term.options.fontSize = size();
      try { fit.fit(); } catch { /* hidden */ }
    };
    const offSettings = onSettings(resize);
    const onZoom = (e: Event) => { if ((e as CustomEvent).detail === panel.id) resize(); };
    window.addEventListener(PANE_ZOOM_EVENT, onZoom);
    // Ctrl+wheel: the tab's zoom — taken before xterm, whose scrolling marks the wheel handled (the app's zoom ignores
    // a handled wheel, so the terminal never zoomed by wheel or pinch)
    const onWheel = (e: WheelEvent) => { if (e.ctrlKey && wheelZoom(e, panel.id)) { e.preventDefault(); e.stopPropagation(); } };
    host.addEventListener("wheel", onWheel, { capture: true, passive: false });
    // a terminal's own right-click menu (the app's would offer a text field's, on xterm's hidden textarea)
    const onMenu = (e: MouseEvent) => {
      if (e.shiftKey) return;
      e.preventDefault();
      popMenu(atPointer(e, [
        { label: "Copy", icon: "copy", hint: "Ctrl+Shift+C", disabled: !term.hasSelection(), run: copySel },
        { label: "Paste", icon: "clipboard", hint: "Ctrl+Shift+V", run: pasteIn },
        { label: "Select all", icon: "select-all", run: () => term.selectAll() },
        "sep",
        { label: "Clear the scrollback", icon: "eraser", run: () => term.clear() },
      ]), () => term.focus());
    };
    host.addEventListener("contextmenu", onMenu);

    return () => {
      host.removeEventListener("contextmenu", onMenu);
      disposed = true;
      terminals.delete(panel.id);
      offActive.dispose();
      offSettings();
      window.removeEventListener(PANE_ZOOM_EVENT, onZoom);
      host.removeEventListener("wheel", onWheel, { capture: true });
      clearTimeout(settle);
      window.removeEventListener("atlas-resize-end", onResizeEnd);
      themeObs.disconnect();
      ro.disconnect();
      // the tab closed: its program ends; still in the dock (moved, redrawn): the next mount takes it over
      if (ws) { if (getDock()?.getPanel(panel.id)) ws.close(); else ptyEnd(ws); }
      term.dispose();
    };
  });

</script>

<!-- svelte-ignore a11y_no_static_element_interactions -- a click on the padding gives the terminal its keys too -->
<!-- a press anywhere in it makes its tab the active one (F11, Super+F and every "this tab" command act on it): the
     overlay a terminal is drawn in sits outside its group, and its focus did not always reach dockview -->
<div class="term-pane" data-preset={spec.preset} data-agent={agent?.ref} data-agent-session={agent ? spec.session : undefined} onpointerdowncapture={() => { if (!panel.isActive) panel.setActive(); }} onpointerdown={(e) => { if (e.target === e.currentTarget) { e.preventDefault(); terminals.get(panel.id)?.focus(); } }}>
  <div class="term-host" bind:this={host} onfocusin={() => { const t = terminals.get(panel.id); if (t) t.usedAt = Date.now(); }}></div>
  {#if conn === "connecting"}<div class="term-status">connecting…</div>{/if}
  {#if buttons.length}
    <div class="term-buttons">
      {#each buttons as b (b.plugin + b.id)}
        <button class="icon-btn tipped" aria-label={b.title} data-tip={b.title} onpointerdown={(e) => e.stopPropagation()} onclick={() => press(b.run)}>
          {#if b.icon}<Icon name={b.icon} size={14} />{:else}{b.title}{/if}
        </button>
      {/each}
    </div>
  {/if}
</div>

<style>
  .term-pane { height: 100%; position: relative; background: var(--term-bg); padding: 8px 4px 4px 12px; box-sizing: border-box; }
  .term-host { height: 100%; width: 100%; }
  .term-buttons { position: absolute; right: 14px; top: 6px; z-index: 5; display: flex; gap: 2px; padding: 2px; border-radius: 7px; background: color-mix(in srgb, var(--term-bg) 82%, transparent); opacity: .55; transition: opacity .12s; }
  .term-pane:hover .term-buttons, .term-buttons:focus-within { opacity: 1; }
  .term-status { position: absolute; right: 12px; top: 8px; font-size: calc(11.5px * var(--ui-scale, 1)); color: var(--text-faint); }
  .term-pane :global(.xterm-viewport) { background: transparent !important; }
</style>
