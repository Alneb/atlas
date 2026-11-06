// Ctrl++ / Ctrl+- / Ctrl+0 on ONE tab: the text of the tab that has the keys grows or shrinks, the
// rest of the window stays (the sizes for everything are settings: Settings → Appearance, and the
// "zoom everything" commands). A tab's zoom is the app's size variables overridden on its own
// element, so every pane follows without knowing; a terminal sizes its font from `paneZoom(id)`.
// Kept per pane id in the vault's shell.json, so a file reopens at the size it was read at.
// Immediate: a press, a wheel notch or a pinch sets the text size at once (no picture scaled first, no glide); a
// gesture's events are folded into one size per frame.
import type { DockviewApi, IDockviewPanel } from "dockview-core";
import { onSettings, settings } from "./settings.svelte";
import { saveShellPrefs, shellPart } from "./shell-prefs";
import { zoomShown } from "./zoom-status.svelte";

const STEP = 1.1, MOST = 8; // ten percent a press, between 1.1^-8 and 1.1^8
const WHEEL_STEP = 1 / 120; // a wheel notch (120) zooms one step
const steps = new Map<string, number>();
let dock: DockviewApi | undefined;

/** How much larger than the settings' sizes this pane draws (1 = as set). */
export const paneZoom = (id: string): number => STEP ** (steps.get(id) ?? 0);
/** Fired on `window` with the pane id when a pane's zoom changed (a terminal refits). */
export const PANE_ZOOM_EVENT = "atlas-pane-zoom";

/** The lower bar's zoom cell follows the tab in front. */
function showActive(): void {
  const p = dock?.activePanel;
  zoomShown.percent = Math.round((p ? paneZoom(p.id) : 1) * 100);
}

function paint(p: IDockviewPanel): void {
  const c = settings.config, el = p.view.content.element, f = paneZoom(p.id);
  if (!c) return;
  const vars: [string, string][] = [["--ui-scale", `calc(${(c.ui.font_size / 14) * f} * var(--eink-scale, 1))`], ["--code-size", `${c.editor.code_font_size * f}px`], ["--prose-size", `${c.editor.prose_font_size * f}px`]];
  for (const [k, v] of vars) { if (f === 1) el.style.removeProperty(k); else el.style.setProperty(k, v); }
  window.dispatchEvent(new CustomEvent(PANE_ZOOM_EVENT, { detail: p.id }));
  window.dispatchEvent(new Event("resize")); // editors measure their lines again
  if (p === dock?.activePanel) showActive();
}

/** Panes whose size changed since the last frame: drawn once at the next one. */
const pending = new Set<IDockviewPanel>();
let frame = 0;

/** The pane at `next` steps: its size set at the next frame. */
function zoomTo(p: IDockviewPanel, next: number): void {
  next = Math.max(-MOST, Math.min(MOST, next));
  if (Math.abs(next) < 1e-6) steps.delete(p.id); else steps.set(p.id, next);
  pending.add(p);
  frame ||= requestAnimationFrame(() => {
    frame = 0;
    pending.forEach(paint);
    pending.clear();
    saveShellPrefs();
  });
}

/** `step` presses larger or smaller on the active tab; 0 = back to the settings' size. */
export function zoomPane(step: -1 | 0 | 1): void {
  const p = dock?.activePanel;
  if (!p) return;
  zoomTo(p, step === 0 ? 0 : (steps.get(p.id) ?? 0) + step);
}

/** Ctrl+wheel and a touchpad pinch (WebKit sends it as a wheel with Ctrl) over a pane zoom that pane.
 *  Heard last (bubbling, on window): a pane with a zoom of its own (a PDF, the graph) takes it first. */
function onWheel(e: WheelEvent): void {
  if (!e.ctrlKey || e.defaultPrevented || !dock) return;
  const p = dock.panels.find((x) => x.view.content.element.contains(e.target as Node));
  if (!p) return;
  e.preventDefault();
  const px = e.deltaMode === 1 ? e.deltaY * 40 : e.deltaY; // lines → pixels
  zoomTo(p, (steps.get(p.id) ?? 0) - px * WHEEL_STEP);
}

/** Called once, right after the dock is created. */
export function attachPaneZoom(d: DockviewApi): void {
  dock = d;
  window.addEventListener("wheel", onWheel, { passive: false });
  d.panels.forEach(paint);
  d.onDidAddPanel(paint);
  d.onDidActivePanelChange(showActive);
  onSettings(() => d.panels.forEach(paint));
}

shellPart("paneZoom", {
  get: () => Object.fromEntries(steps),
  set: (v) => {
    steps.clear();
    for (const [id, n] of Object.entries(v)) if (typeof n === "number" && Number.isFinite(n) && n && Math.abs(n) <= MOST) steps.set(id, n);
    dock?.panels.forEach(paint);
  },
});
