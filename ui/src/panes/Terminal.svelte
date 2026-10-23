<script lang="ts">
  // Terminal pane: xterm.js over WS /api/pty (binary frames both ways, text frame for resize).
  import { onMount } from "svelte";
  import { Terminal } from "@xterm/xterm";
  import { FitAddon } from "@xterm/addon-fit";
  import { WebLinksAddon } from "@xterm/addon-web-links";
  import { WebglAddon } from "@xterm/addon-webgl";
  import { openPty, ptyResize, ptyEnd, vaultScoped } from "../lib/api";
  import { app } from "../lib/state.svelte";
  import { settings, onSettings } from "../lib/settings.svelte";
  import type { PaneProps } from "../lib/dock";
  import { terminals } from "../lib/registry";
  import { paneZoom, PANE_ZOOM_EVENT } from "../lib/pane-zoom";
  import { closePanel } from "../lib/dock";
  import { getDock } from "../lib/dock-instance";
  import { wikilinkProvider } from "../lib/terminal-wikilinks";

  let { spec, panel }: PaneProps<"terminal"> = $props();
  /** This window, the same across a reload of it (sessionStorage), another in a second window or test. */
  function windowKey(): string {
    try {
      const at = vaultScoped("atlas-window");
      let k = sessionStorage.getItem(at);
      if (!k) { k = crypto.randomUUID(); sessionStorage.setItem(at, k); }
      return k;
    } catch { return "window"; }
  }
  const size = () => Math.round((settings.config?.terminal.font_size ?? 13) * paneZoom(panel.id));
  let host: HTMLDivElement;
  let conn = $state<"connecting" | "open" | "exited">("connecting");

  const css = () => getComputedStyle(document.documentElement);
  const COLOURS = ["black", "red", "green", "yellow", "blue", "magenta", "cyan", "white"] as const;
  /** xterm's theme from the --ansi-* tokens (tokens.css; a VS Code theme may set them). */
  function themeFromCss(): Record<string, string> {
    const c = css();
    const v = (n: string) => c.getPropertyValue(n).trim();
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
    term.loadAddon(new WebLinksAddon());
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

    // Konsole's keys: Ctrl+Shift+C copies the selection, Ctrl+Shift+V pastes (plain Ctrl+C / V stay the shell's)
    term.attachCustomKeyEventHandler((e) => {
      if (e.type !== "keydown" || !e.ctrlKey || !e.shiftKey || e.altKey) return true;
      if (e.code === "KeyC") { const sel = term.getSelection(); if (sel) void navigator.clipboard.writeText(sel); return false; }
      if (e.code === "KeyV") { void navigator.clipboard.readText().then((t) => term.paste(t), () => {}); return false; }
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

    return () => {
      disposed = true;
      terminals.delete(panel.id);
      offActive.dispose();
      offSettings();
      window.removeEventListener(PANE_ZOOM_EVENT, onZoom);
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
<div class="term-pane" data-preset={spec.preset} onpointerdown={(e) => { if (e.target === e.currentTarget) { e.preventDefault(); terminals.get(panel.id)?.focus(); } }}>
  <div class="term-host" bind:this={host} onfocusin={() => { const t = terminals.get(panel.id); if (t) t.usedAt = Date.now(); }}></div>
  {#if conn === "connecting"}<div class="term-status">connecting…</div>{/if}
</div>

<style>
  .term-pane { height: 100%; position: relative; background: var(--term-bg); padding: 8px 4px 4px 12px; box-sizing: border-box; }
  .term-host { height: 100%; width: 100%; }
  .term-status { position: absolute; right: 12px; top: 8px; font-size: calc(11.5px * var(--ui-scale, 1)); color: var(--text-faint); }
  .term-pane :global(.xterm-viewport) { background: transparent !important; }
</style>
