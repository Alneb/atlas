import "@fontsource/inter/400.css";
import "@fontsource/inter/400-italic.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/400-italic.css";
import "@fontsource/jetbrains-mono/600.css";
import "katex/dist/katex.min.css";
import "@xterm/xterm/css/xterm.css";
import "./vendor/dockview/dockview.css";
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/dockview-theme.css";
import "./styles/chrome.css";
import "./styles/markdown.css";
import "./styles/editor.css";
import "./styles/syntax.css";
import "./styles/touch.css";
import { mount } from "svelte";
import App from "./App.svelte";
import CaptureWindow from "./CaptureWindow.svelte";

// `/#capture` is the quick-capture window: one box, none of the app is mounted. Both are imported
// up front on purpose: mounting the app after an awaited import made its first keys arrive before
// its listeners (a key pressed right after the page loads was lost).
const app = mount(location.hash === "#capture" ? CaptureWindow : App, { target: document.getElementById("app")! });
if (location.hash !== "#capture") void import("./lib/ui-reload").then((m) => m.watchUiBuild()); // a new UI reloads in place
export default app;

// A page from before an update asks for a chunk the new build has not ("error loading dynamically imported module …
// Base-oAVxpisc.js"): the new page instead, once a minute at most (never a reload loop)
window.addEventListener("vite:preloadError", (e) => {
  try {
    const last = Number(sessionStorage.getItem("atlas.chunkReload") ?? 0);
    if (Date.now() - last < 60_000) return;
    sessionStorage.setItem("atlas.chunkReload", String(Date.now()));
  } catch { /* no storage: reload all the same */ }
  e.preventDefault();
  location.reload();
});

// a link to a web page anywhere in the app (a note, a property, a plugin's page): a tab when the site allows it
// (lib/web-links.ts) — Ctrl/Shift/middle click keep the browser's own meaning
document.addEventListener("click", (e) => {
  if (e.defaultPrevented || e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
  const a = (e.target as HTMLElement | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
  if (!a || !/^https?:/i.test(a.href) || a.origin === location.origin || a.hasAttribute("download")) return;
  e.preventDefault();
  void import("./lib/web-links").then((m) => m.openWeb(a.href));
}, true);

// the desktop app's hand-off: a page a plugin, a mail or a PDF opened with window.open (or a link that would have
// replaced the app) comes back here as a Web tab when `[web] open_links = "tab"` (crates/atlas-app main.rs `web_link`)
(window as unknown as { __atlasOpenWeb?: (url: string) => void }).__atlasOpenWeb = (url) =>
  void import("./lib/dock").then((m) => m.open({ kind: "web", url }));
