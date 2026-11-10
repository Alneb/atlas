<script lang="ts">
  // A message's body (DESIGN-mail-ui §3 "Message body"): the engine's cleaned HTML in a sandboxed frame — no scripts
  // run; its Content-Security-Policy lets nothing remote load unless the user allowed it for this mail or this sender,
  // which is what really blocks tracking pictures. The frame grows to its content (one scrollbar, the reader's).
  // Quoted earlier messages are folded behind "···" (Gmail, Outlook, Apple, Thunderbird, Yahoo, plain-text quotes).
  // It wears the app's colours (the scheme's --bg, --text, --link…, read from the window and followed when the theme or
  // scheme changes). In a dark theme the mail's own colours are remapped — white made the app's surface, other light
  // backgrounds darkened, dark text made light, hues kept, pictures untouched — rather than the whole page inverted.
  // `atlas`: its links open as Atlas opens links (atlas.openLink, API 28), Shift+click in the system's browser
  import type { PluginApi } from "./api";
  let { html, plain = false, remote = false, prose = "", atlas }: { html: string; plain?: boolean; remote?: boolean; prose?: string; atlas?: PluginApi } = $props();

  /** The window's theme and scheme colours (palettes.css). */
  function appColours() {
    const root = document.documentElement, cs = getComputedStyle(root);
    const dark = root.dataset.theme !== "light";
    const v = (name: string, light: string, night: string) => cs.getPropertyValue(name).trim() || (dark ? night : light);
    return {
      dark,
      bg: v("--bg", "#ffffff", "#1b1d22"), text: v("--text", "#1d1d1f", "#dcdfe5"), muted: v("--text-muted", "#555b66", "#aab0bb"),
      faint: v("--text-faint", "#7a808a", "#8a919d"), link: v("--link", "#2557d6", "#8aa4ff"),
      border: v("--border", "#d6d9de", "#3a3f4a"), borderStrong: v("--border-strong", "#c3c7cf", "#4a5060"), chip: v("--bg-alt", "#eceef1", "#2a2e36"),
    };
  }
  let theme = $state(appColours());
  $effect(() => {
    const o = new MutationObserver(() => (theme = appColours()));
    o.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "data-palette", "style", "class"] });
    return () => o.disconnect();
  });
  const dark = $derived(theme.dark);
  let frame: HTMLIFrameElement | undefined = $state();
  let height = $state(80);

  const QUOTES = [
    ".gmail_quote", "blockquote[type=cite]", ".yahoo_quoted", "#appendonsend", "#divRplyFwdMsg", "#mail-editor-reference-message-container",
    ".moz-cite-prefix", "div[style*='border-top:solid #E1E1E1']", "div[style*='border-top: solid #E1E1E1']", "div[style*='border-top:solid #B5C4DF']", ".atlas-quote",
  ].join(",");

  /** The earlier messages a mail carries, folded into a <details> (it opens with no script). */
  function fold(doc: Document) {
    const root = doc.body;
    const q = root.querySelector(QUOTES);
    if (!q || !q.parentNode || q.closest("details")) return;
    // a short mail that is only a quote (a forward) stays open
    const before = (root.textContent ?? "").split(q.textContent ?? "")[0].trim();
    if (!before) return;
    // Outlook's divider, Thunderbird's prefix: they and everything after them at their level are the quote
    const tail = q.matches("#appendonsend, #divRplyFwdMsg, .moz-cite-prefix, div[style*='border-top']") || /wrote:\s*$|a écrit\s*:\s*$|escribió:\s*$/i.test(q.previousSibling?.textContent ?? "");
    const nodes: Node[] = [];
    let start: Node = q;
    // "On …, X wrote:" just before a blockquote belongs with it
    const prev = q.previousElementSibling;
    if (prev && /wrote:\s*$|a écrit\s*:?\s*$|escribió:\s*$|schrieb.*:\s*$/i.test(prev.textContent ?? "") && (prev.textContent ?? "").length < 300) start = prev;
    for (let n: Node | null = start; n; n = n.nextSibling) { nodes.push(n); if (!tail && n === q) break; }
    const d = doc.createElement("details"), s = doc.createElement("summary");
    d.className = "atlas-quoted";
    s.textContent = "···";
    s.title = "Show the earlier messages";
    start.parentNode!.insertBefore(d, start);
    d.append(s, ...nodes);
  }

  // ----- the dark theme: colours remapped in HSL, lightness turned, hue kept, saturation softened

  function parse(c: string): [number, number, number, number] | null {
    const m = c.match(/rgba?\(([\d.]+)[, ]+([\d.]+)[, ]+([\d.]+)(?:[,/ ]+([\d.]+))?\)/);
    return m ? [Number(m[1]), Number(m[2]), Number(m[3]), m[4] === undefined ? 1 : Number(m[4])] : null;
  }
  function hsl(r: number, g: number, b: number): [number, number, number] {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
    if (max === min) return [0, 0, l];
    const d = max - min, s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return [h * 60, s, l];
  }
  const css = (h: number, s: number, l: number, a: number) => `hsla(${h.toFixed(0)}, ${(s * 100).toFixed(0)}%, ${(l * 100).toFixed(0)}%, ${a})`;
  /** A background: white and near-white become the app's surface, other light ones dark, dark ones stay. */
  function darkBg(c: string): string | null {
    const p = parse(c);
    if (!p || p[3] === 0) return null;
    const [h, s, l] = hsl(p[0], p[1], p[2]);
    if (l < 0.35) return null;
    if (l > 0.93 && s < 0.3) return theme.bg;
    return css(h, s * 0.55, 0.09 + (1 - l) * 0.35, p[3]);
  }
  /** A text colour: dark ones become light, light ones stay. */
  function darkFg(c: string): string | null {
    const p = parse(c);
    if (!p) return null;
    const [h, s, l] = hsl(p[0], p[1], p[2]);
    if (l > 0.6) return null;
    return css(h, Math.min(s, 0.7), 0.92 - l * 0.4, p[3]);
  }
  function remap(doc: Document) {
    const win = doc.defaultView;
    if (!win) return;
    for (const el of Array.from(doc.body.querySelectorAll<HTMLElement>("*"))) {
      if (el instanceof win.HTMLImageElement || el.tagName === "PICTURE" || el.tagName === "VIDEO") continue;
      const cs = win.getComputedStyle(el);
      const bg = darkBg(cs.backgroundColor);
      if (bg) el.style.setProperty("background-color", bg, "important");
      const fg = darkFg(cs.color);
      if (fg) el.style.setProperty("color", fg, "important");
      for (const side of ["Top", "Right", "Bottom", "Left"] as const) {
        const w = cs.getPropertyValue(`border-${side.toLowerCase()}-width`);
        if (w && w !== "0px") {
          const b = darkFg(cs.getPropertyValue(`border-${side.toLowerCase()}-color`));
          if (b) el.style.setProperty(`border-${side.toLowerCase()}-color`, b, "important");
        }
      }
      // a picture as a background: dimmed a little, never turned
      if (cs.backgroundImage !== "none") el.style.setProperty("filter", "brightness(.9)");
      if (el.hasAttribute("bgcolor")) el.removeAttribute("bgcolor");
    }
  }

  const page = $derived.by(() => {
    const img = remote ? "data: https: http:" : "data:";
    const csp = `default-src 'none'; style-src 'unsafe-inline'${remote ? " https: http:" : ""}; img-src ${img}; font-src data:${remote ? " https:" : ""}; media-src 'none'; form-action 'none'`;
    const t = theme;
    const base = t.bg, fg = t.text;
    const font = plain ? `${prose || "Georgia, serif"}` : "system-ui, -apple-system, 'Segoe UI', sans-serif";
    return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp}"><base target="_blank"><meta name="color-scheme" content="${t.dark ? "dark" : "light"}">
<style>
html{overflow-y:hidden;background:${base}}
body{margin:0;padding:4px 2px 8px;font:14px/1.55 ${font};color:${fg};background:${base};overflow-wrap:anywhere;overflow-x:auto}
img{max-width:100%;height:auto}
img:not([src]),img[src^="http"]:not([data-ok]){min-height:0}
a{color:${t.link}}
blockquote{margin:.5em 0 .5em .2em;padding-left:.9em;border-left:3px solid ${t.border};color:${t.muted}}
blockquote blockquote{border-left-color:${t.borderStrong}}
.atlas-plain{white-space:normal;font-size:15px;line-height:1.6;max-width:72ch}
.atlas-signature{color:${t.faint};font-size:.92em}
pre.atlas-text{white-space:pre-wrap;font:inherit}
details.atlas-quoted>summary{display:inline-block;cursor:pointer;list-style:none;padding:0 8px;margin:6px 0;border-radius:6px;background:${t.chip};color:${t.muted};font:600 13px/1.4 system-ui,sans-serif;letter-spacing:.1em}
details.atlas-quoted>summary::-webkit-details-marker{display:none}
details.atlas-quoted[open]>summary{margin-bottom:8px}
table{max-width:100%}
mark.atlas-find{background:${t.dark ? "#7a5d00" : "#ffe27a"};color:inherit;border-radius:2px}
mark.atlas-find.cur{background:${t.dark ? "#c77700" : "#ff9f1a"};color:${t.dark ? "#fff" : "#000"}}
</style></head><body>${html}</body></html>`;
  });

  function loaded() {
    const d = frame?.contentDocument;
    if (!d?.body) return;
    fold(d);
    if (dark && !plain) remap(d);
    const fit = () => { height = Math.max(40, d.documentElement.scrollHeight); };
    fit();
    new ResizeObserver(fit).observe(d.documentElement);
    for (const img of Array.from(d.images)) img.addEventListener("load", fit);
    d.addEventListener("toggle", fit, true);
    // a web link: as Atlas opens links, Shift+click in the browser. Left to the frame (`<base target=_blank>`), every
    // link became a tab of the desktop window, Shift or not. An Atlas without openLink keeps the frame's way.
    d.addEventListener("click", (e) => {
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || !atlas?.openLink || !/^https?:/i.test(a.href) || e.button !== 0) return;
      e.preventDefault();
      atlas.openLink(a.href, { outside: e.shiftKey });
    });
    // Ctrl+F inside the message is the pane's find (Reader.svelte), not lost in the frame
    d.addEventListener("keydown", (e) => {
      if (!((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f")) return;
      e.preventDefault();
      frame?.dispatchEvent(new KeyboardEvent("keydown", { key: e.key, ctrlKey: e.ctrlKey, metaKey: e.metaKey, bubbles: true }));
    });
  }
</script>

<iframe bind:this={frame} class="frame" title="The message" sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox" srcdoc={page} onload={loaded} style:height="{height}px" scrolling="no"></iframe>

<style>
  .frame { display: block; width: 100%; border: 0; background: transparent; color-scheme: normal; }
</style>
