// The phone layout (docs/guides/MOBILE.md): on a narrow screen one pane fills the window — the desktop's split docks, side bar
// and status bar do not fit there — and a bottom bar holds the places a phone needs. Reuses fullscreen: the active tab's
// group maximized, following the keys; the bar replaces what fullscreen hides.
import type { DockviewApi } from "dockview-core";
import { fullscreen, toggleFullscreen } from "./fullscreen.svelte";

/** Phones (and very narrow windows): the same width at which the desktop layout stops fitting — and a phone turned
 *  sideways (a touch screen too short for the desktop's bars), which is wide but no taller than a toolbar or two. */
export const PHONE_QUERY = "(max-width: 720px), (max-height: 480px) and (pointer: coarse)";
/** Inside the phone app (AtlasActivity's bridge) the page is a phone's whatever its shape. */
const inApp = "AtlasNative" in globalThis;
export const phone = $state({ on: false, sheet: false });
const backToWide: (() => void)[] = [];
/** Runs when the screen turns wide again (the side tools opened as panes go back to the left bar: lib/dock.ts). */
export function onWide(fn: () => void): void { backToWide.push(fn); }

/** Keeps the layout in step with the screen's width: one pane at a time while narrow, the layout as it was once wide again. */
export function attachPhone(dock: DockviewApi): () => void {
  if (typeof matchMedia !== "function") return () => {};
  const m = matchMedia(PHONE_QUERY);
  const hold = () => {
    if (phone.on !== fullscreen.on && dock.activePanel) void toggleFullscreen(true);
  };
  const change = () => {
    const was = phone.on;
    const on = m.matches || inApp;
    phone.on = on;
    if (was && !on) backToWide.forEach((f) => f());
    document.documentElement.classList.toggle("phone", on);
    if (!on) phone.sheet = false;
    hold();
  };
  change();
  m.addEventListener("change", change);
  const unroom = keyboardRoom();
  // a tab opened, a layout restored (which leaves fullscreen): one pane over the window again
  const a = dock.onDidActivePanelChange(() => { if (phone.on) queueMicrotask(hold); });
  const b = dock.onDidMaximizedGroupChange(() => { if (phone.on) queueMicrotask(hold); });
  return () => { m.removeEventListener("change", change); a.dispose(); b.dispose(); unroom(); };
}

/** `--keyboard`: how much of the window's bottom the on-screen keyboard covers (a phone's browser keeps its layout the
 *  full height under the keyboard), so what sits at the bottom (toasts, the capture button, the sheet) stays above it. */
function keyboardRoom(): () => void {
  const vv = window.visualViewport;
  if (!vv) return () => {};
  const set = () => {
    const covered = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
    document.documentElement.style.setProperty("--keyboard", `${covered}px`);
  };
  set();
  vv.addEventListener("resize", set);
  vv.addEventListener("scroll", set);
  return () => { vv.removeEventListener("resize", set); vv.removeEventListener("scroll", set); };
}
