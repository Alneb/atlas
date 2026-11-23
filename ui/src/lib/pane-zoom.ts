// Ctrl++ / Ctrl+- / Ctrl+0 on ONE tab: the text of the tab that has the keys grows or shrinks, the
// rest of the window stays (the sizes for everything are settings: Settings → Appearance, and the
// "zoom everything" commands). A tab's zoom is the app's size variables overridden on its own
// element, so every pane follows without knowing; a terminal sizes its font from `paneZoom(id)`.
// Kept per pane id in the vault's shell.json, so a file reopens at the size it was read at.
// Immediate: a press, a wheel notch or a pinch sets the text size at once (no picture scaled first, no glide); a
// gesture's events are folded into one size per frame.
import type { DockviewApi, IDockviewPanel } from "dockview-core";
import { EditorView } from "@codemirror/view";
import { onSettings, settings } from "./settings.svelte";
import { saveShellPrefs, shellPart } from "./shell-prefs";
import { zoomShown } from "./zoom-status.svelte";
import { wheelPixels } from "./wheel";
import type { PaneKind } from "./panes";

const STEP = 1.1, MOST = 8; // ten percent a press, between 1.1^-8 and 1.1^8
const WHEEL_STEP = 1 / 120; // a wheel notch (120) zooms one step
const steps = new Map<string, number>();
/** Tabs zoomed (or reset) in this window since the last write: only these go over the file's levels. */
const touched = new Set<string>();
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
  const c = settings.config, el = p.view.content.element, f = isContent(p) ? paneZoom(p.id) : 1; // the interface: no zoom of its own
  if (!c) return;
  const vars: [string, string][] = [["--ui-scale", `calc(${(c.ui.font_size / 14) * f} * var(--eink-scale, 1))`], ["--code-size", `${c.editor.code_font_size * f}px`], ["--prose-size", `${c.editor.prose_font_size * f}px`]];
  const back = holdPlace(el);
  for (const [k, v] of vars) { if (f === 1) el.style.removeProperty(k); else el.style.setProperty(k, v); }
  window.dispatchEvent(new CustomEvent(PANE_ZOOM_EVENT, { detail: p.id }));
  window.dispatchEvent(new Event("resize")); // editors measure their lines again
  back();
  if (p === dock?.activePanel) showActive();
}

/** The editors' places in `el` before a size change, and a function that puts each back: the line at the top stays at
 *  the top. A scroll offset in pixels kept the same number while every line grew or shrank, so a zoom threw the
 *  reader to another part of the note. */
function holdPlace(el: HTMLElement): () => void {
  const views = [...el.querySelectorAll<HTMLElement>(".cm-editor")].map((e) => EditorView.findFromDOM(e)).filter((v): v is EditorView => !!v);
  const tops = views.filter((v) => v.scrollDOM.scrollTop > 0).map((v) => {
    const into = v.scrollDOM.getBoundingClientRect().top - v.documentTop; // how far the view has scrolled into the text
    return { v, pos: v.lineBlockAtHeight(into).from };
  });
  return () => { for (const { v, pos } of tops) v.dispatch({ effects: EditorView.scrollIntoView(pos, { y: "start" }) }); };
}

/** Panes whose size changed since the last frame: drawn once at the next one. */
const pending = new Set<IDockviewPanel>();
let frame = 0;

/** The pane at `next` steps: its size set at the next frame. */
function zoomTo(p: IDockviewPanel, next: number): void {
  next = Math.max(-MOST, Math.min(MOST, next));
  if (Math.abs(next) < 1e-6) steps.delete(p.id); else steps.set(p.id, next);
  touched.add(p.id);
  pending.add(p);
  frame ||= requestAnimationFrame(() => {
    frame = 0;
    pending.forEach(paint);
    pending.clear();
    saveShellPrefs("paneZoom");
  });
}

// Two kinds of tab: content (a note, a PDF, a terminal…) zooms on its own, on top of the content's app-wide size; the
// interface (Settings, Today, the file tree, a search…) and the bars have one size for the whole app, which a zoom over
// them changes (`[ui] font_size`) — a zoom of Settings alone left the rest of the interface as it was.
// Every kind decided here (a new kind fails to compile until it is); a plugin's view (mail, a reader) and a block are
// content.
const CONTENT: Record<PaneKind, boolean> = {
  editor: true, terminal: true, pdf: true, image: true, web: true, diff: true, table: true, base: true, page: true,
  excalidraw: true, graph: true, plugin: true, block: true, commit: true,
  today: false, files: false, explorer: false, search: false, settings: false, git: false, outline: false, commands: false,
};
const isContent = (p: IDockviewPanel): boolean => CONTENT[(p.params as { kind?: PaneKind } | undefined)?.kind ?? "settings"] ?? false;
const zoomUi = (step: -1 | 0 | 1) => void import("./settings-schema").then((m) => m.zoom(step, "ui"));

/** `step` presses larger or smaller on the active tab — the interface when that tab is not content; 0 = back to the
 *  settings' size. */
export function zoomPane(step: -1 | 0 | 1): void {
  const p = dock?.activePanel;
  if (!p || !isContent(p)) return zoomUi(step);
  zoomTo(p, step === 0 ? 0 : (steps.get(p.id) ?? 0) + step);
}

// a wheel over the interface: one step of the interface's size per notch (120 px), however the wheel reports
let uiWheel = 0;

/** Ctrl+wheel and a touchpad pinch (WebKit sends it as a wheel with Ctrl) over a pane zoom that pane.
 *  Heard last (bubbling, on window): a pane with a zoom of its own (a PDF, the graph) takes it first. */
function onWheel(e: WheelEvent): void {
  if (!e.ctrlKey || e.defaultPrevented || !dock) return;
  const p = dock.panels.find((x) => x.view.content.element.contains(e.target as Node));
  e.preventDefault();
  if (p && isContent(p)) { zoomTo(p, (steps.get(p.id) ?? 0) - wheelPixels(e) * WHEEL_STEP); return; }
  uiWheel -= wheelPixels(e);
  while (Math.abs(uiWheel) >= 120) { const up = uiWheel > 0; uiWheel += up ? -120 : 120; zoomUi(up ? 1 : -1); }
}

/** Ctrl+wheel on the pane `id` (a terminal, whose own wheel handling hides it from `onWheel`); false if no such pane. */
export function wheelZoom(e: WheelEvent, id: string): boolean {
  const p = dock?.panels.find((x) => x.id === id);
  if (!p) return false;
  zoomTo(p, (steps.get(p.id) ?? 0) - wheelPixels(e) * WHEEL_STEP);
  return true;
}

/** Called once, right after the dock is created. */
export function attachPaneZoom(d: DockviewApi): void {
  dock = d;
  window.addEventListener("wheel", onWheel, { passive: false });
  d.panels.forEach(paint);
  d.onDidAddPanel(paint);
  // a terminal's id names a slot (`terminal:claude:1`), not what runs in it: the next tab there is another session,
  // which took the closed one's zoom (a new Claude tab opened small). Closed, its zoom is forgotten; an editor's id is
  // its file, whose zoom is kept for the next time it opens.
  d.onDidRemovePanel((p) => {
    if (!p.id.startsWith("terminal:") || !steps.delete(p.id)) return;
    touched.add(p.id);
    saveShellPrefs("paneZoom");
  });
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
  // the file's levels (other windows' tabs too) with this window's changes over them
  merge: (saved) => {
    const out: Record<string, unknown> = { ...saved };
    for (const id of touched) { const n = steps.get(id); if (n) out[id] = n; else delete out[id]; }
    touched.clear();
    return out;
  },
});
