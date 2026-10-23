// E-ink mode (ui.eink, docs/design/DESIGN-pen-eink-reader.md). An e-ink panel redraws slowly and in greys, and every
// partial update leaves a faint ghost of what was there; ghosts pile up until a full refresh (black, then white) clears
// them. So, besides the look (tokens.css / base.css: no motion, no shadows, no translucency), this module refreshes
// the whole screen where ghosts come from: another tab to the front, a scroll come to rest (PDF pages, a long note).
// The phone app on a Boox does it with Onyx's own call (AtlasNative.einkRefresh: applyGCOnce + repaintEverything, as
// Onyx's framework does after a scroll — boox_5c_re docs/ONYX-EPD-PEN.md); a browser gets a black-then-white
// flash, which an e-ink panel answers with a clearing refresh.
import type { DockviewApi } from "dockview-core";
import type { Eink } from "./gen/Eink";
import type { EinkRefresh } from "./gen/EinkRefresh";

type Bridge = { eink?(): string; einkRefresh?(): void; einkClear?(): void };
const bridge = () => (globalThis as unknown as { AtlasNative?: Bridge }).AtlasNative;

/** Inside the phone app (its bridge is there): the screen is the phone's, so its own dark mode decides the theme. */
export const inPhoneApp = (): boolean => bridge() !== undefined;

/** Whether the e-ink mode is on: "auto" asks the screen (the phone app's bridge on a Boox, or `(update: slow)`). */
export function einkOn(mode: Eink): boolean {
  if (mode !== "auto") return mode === "on";
  if (bridge()?.eink?.() === "true") return true;
  return typeof matchMedia === "function" && matchMedia("(update: slow)").matches;
}

const isOn = () => document.documentElement.classList.contains("eink"); // settings.svelte.ts sets it from einkOn

/** Black, then white, over everything, a few frames each: long enough for the panel to drive every pixel. */
function flash(): void {
  const veil = document.createElement("div");
  veil.className = "eink-flash";
  veil.setAttribute("aria-hidden", "true");
  document.body.append(veil);
  setTimeout(() => { veil.style.background = "#ffffff"; }, 90);
  setTimeout(() => veil.remove(), 180);
}

let last = 0;
/** The automatic refreshes are calm (the app's REGAL, no flash) and at most one every 5 s; `clear` (the command
 *  "E-ink: clear the screen") is the full flashing one, always: frequent full refreshes are jarring. A browser has no calm refresh: there, only `clear` flashes. */
export function einkRefresh(clear = false): void {
  document.dispatchEvent(new CustomEvent("atlas-eink-refresh", { detail: { clear } })); // every ask, kept or not (specs, probes)
  const now = performance.now();
  if (!clear && now - last < 5000) return;
  last = now;
  const b = bridge();
  if (clear) { if (b?.einkClear) b.einkClear(); else if (b?.einkRefresh) b.einkRefresh(); else flash(); }
  else if (b?.einkRefresh) b.einkRefresh();
}

let refreshMode: EinkRefresh = "often";
/** settings.svelte.ts: the `ui.eink_refresh` setting. */
export function setEinkRefresh(mode: EinkRefresh): void { refreshMode = mode; }

/** The automatic refreshes, while the e-ink mode is on: a tab to the front (once it has drawn), a scroll at rest. */
export function attachEink(dock: DockviewApi): () => void {
  let t = 0;
  const soon = (ms: number) => { clearTimeout(t); t = window.setTimeout(einkRefresh, ms); };
  const tab = dock.onDidActivePanelChange(() => { if (isOn() && refreshMode !== "manual") soon(250); });
  // `scrollend` does not bubble: caught on the way down, for every scroller (a note, a PDF, a list)
  // only a scroller big enough to leave ghosts (a fifth of the screen): a toolbar sliding sideways flashed it every time
  const scrolled = (e: Event) => {
    if (!isOn() || refreshMode !== "often") return;
    const el = e.target;
    if (el instanceof Element) { const r = el.getBoundingClientRect(); if (r.width * r.height < 0.2 * innerWidth * innerHeight) return; }
    soon(150);
  };
  document.addEventListener("scrollend", scrolled, { capture: true, passive: true });
  return () => { tab.dispose(); clearTimeout(t); document.removeEventListener("scrollend", scrolled, { capture: true }); };
}
