// Excalidraw (a React component) mounted inside a Svelte pane. Scenes are plain `.excalidraw` JSON;
// fonts are served offline under /excalidraw/ (vite.config.ts), never from a CDN.
import { compactJson, shrinkFiles } from "./draw-compact";
import { basename } from "./paths";
import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import "@excalidraw/excalidraw/index.css";
import { outline } from "./draw-ink"; // and the pen's crisp strokes (Excalidraw asks it: vite.config.ts inkStroke)
import { PAGE, type Page, arranged, columns, frameRef, heldView, nextPage, pageAt, pagesOf, wikiTarget } from "./draw-pages";
import { openPath } from "./dock";
import { resolveOrBeside } from "./vault";
import { pick } from "./palette.svelte";
import { toast } from "./state.svelte";
import { api as server } from "./api";
import { nativePen, penOver, type NativeSample } from "./pen-target";
import { fillLinked, isLinkedFile } from "./linked-pages";
import { extent, heldAtEnd, SNAP_MIN, wireToSkeleton } from "./pen-shapes";
import { fingerGestures, paperCss, remember, remembered, startColor, startWidth, webPen, PAPERS, PENS, TOOL, type NoteTool, type Paper, type PenKind } from "./draw-notepad";
import type { DrawConfig } from "./gen/DrawConfig";

(window as unknown as { EXCALIDRAW_ASSET_PATH: string }).EXCALIDRAW_ASSET_PATH = new URL("excalidraw/", document.baseURI).toString();

type Lib = typeof import("@excalidraw/excalidraw");
type Api = Parameters<NonNullable<import("@excalidraw/excalidraw/types").ExcalidrawProps["excalidrawAPI"]>>[0];

export interface Drawing {
  /** Serialized scene (what the `.excalidraw` file holds). */
  /** The scene as written to disk: compact, pictures made smaller (draw-compact.ts). */
  serialize(): Promise<string>;
  /** Standalone SVG of the scene, for embedding in notes. */
  svg(): Promise<string>;
  setTheme(t: "dark" | "light"): void;
  /** Shows a page — its number (1-based) or what an embed names after `#` (frameRef) — fitted to the screen. */
  showPage(ref: number | string): void;
  /** The frame id of the page under the middle of the view, or null (no pages). */
  pageNow(): string | null;
  destroy(): void;
  /** Pen mode only: the calls behind the notepad's own toolbar (NotepadBar.svelte). */
  notepad?: Notepad;
  /** How many other devices have it open now (live, draw-live.ts). */
  others(): number;
  /** Whether this device saves it: the live room's writer, or alone. */
  writes(): boolean;
  /** A copy of the drawing (another device's save) merged into this one, element by element. */
  merge(json: string): void;
}

/** What the notepad toolbar shows as picked: one of its tools (null: another of Excalidraw's) and the pen's width;
 *  `page`: the page on screen, 1-based (0: the drawing has no pages yet); `pages`: how many (draw-pages.ts). */
export interface NoteState { tool: NoteTool | null; width: number; kind: PenKind; paper: Paper; page: number; pages: number; cols: number; held: boolean }
export interface Notepad {
  tool(t: NoteTool): void;
  /** The pen of that kind at that width (PENS[kind].widthTimes × it for a highlighter). */
  pen(kind: PenKind, width: number): void;
  paper(p: Paper): void;
  undo(): void; redo(): void;
  /** A new page in the grid's first free slot (the first one where the drawing is), shown. */
  newPage(): void;
  /** The pages laid out `cols` side by side in reading order, what is on each moving with it (one undo). */
  arrange(cols: number): void;
  /** Shows page `n` (1-based), fitted to the screen. */
  page(n: number): void;
  /** Links the selected elements to a note the user picks (`[[note]]`, as Obsidian's Excalidraw plugin stores it). */
  link(): void;
  /** `![[drawing.excalidraw#Page N]]` of the page on screen (the whole drawing without pages) on the clipboard. */
  copyEmbed(): void;
  watch(f: (s: NoteState) => void): () => void;
  /** The page held in place (page mode) or the canvas free to move and zoom; remembered on this device. */
  holdPages(on: boolean): void;
}

/** How the drawing is drawn on: `pen` is a pen tablet on e-ink (the Boox) — a notepad, not a diagram tool:
 *  thin black ink with no sketchiness, the pen draws and a finger pans, the pen tool picked at open. */
/** `path`: the drawing's own (its links resolve from its folder, as Obsidian's). */
export interface DrawOptions {
  pen?: boolean; onFullscreen?: () => void; path?: string;
  /** shared with the other devices that have it open (draw-live.ts); default on with a path */ live?: boolean;
  /** the other devices' names, when they change */ onPeers?: (names: string[]) => void;
  /** pages side by side for a drawing that has no second row yet (the notepad plugin's `per_row`; 4) */ perRow?: number;
  /** one page at a time, the view held on it (the notepad plugin's `page_mode`; on) */ pageMode?: boolean;
  /** the vault's `[draw]` (Settings → Drawing): the pen, paper, width and colour at the start, snapping and its
   *  recogniser — the same values the Boox's Notepad starts from (NotepadView.java) */ draw?: DrawConfig;
}

/** E-ink pen defaults ("the lines are too thick", again at 1): draw-notepad.ts WIDTHS' "Fine", under
 *  Excalidraw's own thinnest choice (1; its default 2). */
/** Pages are sheets, not masks: ink that runs past a page's edge stays seen, as the Boox's Notepad draws it. */
const FRAMES = { enabled: true, name: true, outline: true, clip: false } as const;
const PEN_STATE = { currentItemStrokeWidth: 0.5, currentItemRoughness: 0, currentItemStrokeColor: "#000000", penMode: true, penDetected: true } as const;

export interface PenSample { clientX: number; clientY: number; pressure: number }

/** Every sample of each pen stroke (it "polls less than" the native pen view): the browser folds the moves
 *  between two frames into one event's `getCoalescedEvents()`, and Excalidraw throttles to one move a frame on top, so
 *  its stroke keeps a fraction of what the pen sent. Collected here and handed over when the pen lifts; returns the remover. */
export function collectPenStrokes(host: HTMLElement, onStroke: (samples: PenSample[], since: number) => void): () => void {
  let samples: PenSample[] | null = null, since = 0;
  const keep = (e: PointerEvent) => samples?.push({ clientX: e.clientX, clientY: e.clientY, pressure: e.pressure });
  const down = (e: PointerEvent) => {
    if (e.pointerType !== "pen" || !(e.target instanceof Node) || !host.contains(e.target)) return;
    // a pen-up that never came (boox_5c_re KNOTE2.md: the Boox can lose one): the stroke before stays as Excalidraw drew
    // it (handing its samples over now would land on the new stroke, Excalidraw's last element); said, and started afresh
    if (samples) console.info(`pen: a down without an up — the stroke before kept as drawn (${samples.length} samples)`);
    samples = []; since = Date.now(); keep(e);
  };
  const move = (e: PointerEvent) => {
    if (!samples || e.pointerType !== "pen") return;
    const folded = e.getCoalescedEvents?.() ?? [];
    for (const m of folded.length ? folded : [e]) keep(m);
  };
  const up = (e: PointerEvent) => {
    if (!samples || e.pointerType !== "pen") return;
    if (e.type === "pointercancel") console.info(`pen: the stroke was cancelled by the browser (${samples.length} samples)`);
    const s = samples; samples = null;
    requestAnimationFrame(() => onStroke(s, since)); // after Excalidraw has finished its own stroke
  };
  const opts = { capture: true, passive: true };
  window.addEventListener("pointerdown", down, opts);
  window.addEventListener("pointermove", move, opts);
  window.addEventListener("pointerup", up, opts);
  window.addEventListener("pointercancel", up, opts);
  return () => { for (const [t, f] of [["pointerdown", down], ["pointermove", move], ["pointerup", up], ["pointercancel", up]] as const) window.removeEventListener(t, f as EventListener, opts); };
}

/** The quick line is drawn as wide as the stroke that replaces it on pen-up at the Boox pen's usual pressure (its
 *  strokes average 0.85–0.95): "the strokes turn out different than what i draw". */
/** The Boox pen's usual (median) pressure, linear: the quick line under the pen is as wide as a stroke at it. */
const USUAL_PRESSURE = 0.39; // the curved median .92 undone: .37; boox_5c_re's trace: .39
/** The Boox's pen pressure arrives linear, as Boox's own engine reads it (PenCatcher → PenInput.linear: Onyx's curve
 *  undone; boox_5c_re's reading of surfaceflinger) — the curved value Android gives had a median of .92 and a quarter at
 *  1.0, so "excalidraw could not see the difference between thin and think pressure on the boox".
 *  Kept as it comes; the fountain's thinning (.6, draw-ink.ts) makes the width follow it. */
export const penPressure = (p: number): number => Math.max(0.05, Math.min(1, p));
/** How much of the view a page shown fitted fills (a hair of margin to see its edge). */
const FIT = 0.98;

type InkState = { activeTool: { type: string }; currentItemStrokeWidth: number; zoom: { value: number } } | null;

/** On a Boox, the app's native pen over the drawing (pen-target.ts: Onyx's instant ink + every sample to `take`). Only
 *  while the pen tool is picked and the drawing shows; the strip with Excalidraw's toolbar left out (a tap there is
 *  not ink). → sync, off. */
function nativeInk(host: HTMLElement, pen: () => PenKind, take: (s: NativeSample[]) => void, draft: (s: NativeSample[] | null) => void): { sync(st: InkState): void; off(): void } {
  console.info(`drawing on e-ink: instant ink ${nativePen() ? "available" : "not in this app"}`); // logcat AtlasPage
  let state: InkState = null;
  const over = penOver(host, take, {
    active: () => state?.activeTool.type === "freedraw",
    top: 72, // CSS px under the drawing's top edge: NotepadBar (8 + 2 × 4 + 2 × 2 + 48) and a margin
    line: () => [state ? state.currentItemStrokeWidth * outline(pen(), penPressure(USUAL_PRESSURE)) * state.zoom.value : 2, PENS[pen()].onyxStyle],
    draft,
  });
  if (!over) return { sync() {}, off() {} };
  return { sync(st) { state = st; over.sync(); }, off: over.off };
}

/** `onEdit` fires only when elements change (not on pan/zoom/selection), so it is the dirty signal. */
export async function mountDrawing(host: HTMLElement, json: string, theme: "dark" | "light", onEdit: () => void, opts: DrawOptions = {}): Promise<Drawing> {
  const lib: Lib = await import("@excalidraw/excalidraw");
  const parsed = json.trim() ? JSON.parse(json) : {};
  const initial = lib.restore(parsed, null, null);
  let api: Api | null = null;
  let version = lib.getSceneVersion(initial.elements);
  let current = theme;
  // the paper is a layer of its own behind the drawing, so it can lie on the pages only; the drawing renders over it, see-through
  const paperLayer = document.createElement("div");
  paperLayer.className = "atlas-paper";
  paperLayer.style.cssText = "position:absolute;inset:0;pointer-events:none;z-index:0";
  const stageEl = document.createElement("div");
  stageEl.style.cssText = "position:absolute;inset:0;z-index:1";
  host.replaceChildren(paperLayer, stageEl);
  const root: Root = createRoot(stageEl);
  // the other devices with this drawing open: changes and pointers both ways (draw-live.ts)
  const live = opts.path && opts.live !== false ? (await import("./draw-live")).liveDrawing(opts.path, lib, () => api, opts.onPeers) : null;
  // the freedraw stroke the pen just made, given every sample it sent instead of Excalidraw's one a frame
  // the pen in hand when the notepad last closed (Settings' "remember the pen"), else Settings' pen; a new page's paper
  // is Settings', as on the Boox
  const draw = opts.draw;
  const startPen = webPen(draw?.pen ?? "fountain");
  let kind = draw?.remember_pen === false ? startPen : remembered<PenKind>("pen", Object.keys(PENS) as PenKind[], startPen);
  let paper: Paper = draw?.paper ?? "blank";
  const penState = { ...PEN_STATE, currentItemStrokeWidth: PEN_STATE.currentItemStrokeWidth * startWidth(draw?.width), currentItemStrokeColor: startColor(draw?.color) };
  const ink = opts.pen ? nativeInk(host, () => kind, (samples) => fromPen(samples), (samples) => live?.drafting(samples && samples.length > 1 ? penStroke(samples) : null)) : { sync() {}, off() {} };
  // the notepad (pen mode): its toolbar follows what is picked, fingers move the page (draw-notepad.ts)
  const watchers = new Set<(s: NoteState) => void>();
  let noted = "";
  const perRow = opts.perRow ?? 4;
  // page mode: the page showPage or a new page went to, else the one nearest the view's centre; held at Excalidraw's next frame
  // switched off on the toolbar, it stays off on this device; the plugin's setting is the default
  let pageMode = (opts.pageMode ?? true) ? remembered<"on" | "off">("pages-held", ["on", "off"], "on") === "on" : false;
  let held: string | null = null, holding = 0;
  // not while the page is being moved (a finger, the hand, the wheel): held only once it lets go, so a pan is never
  // fought frame by frame ("if you try to move it stutters")
  let pressed = 0, wheelAt = 0;
  const moving = () => pressed > 0 || performance.now() - wheelAt < 160;
  const press = (e: PointerEvent) => { if (e.pointerType !== "pen") pressed++; };
  const settle = () => {
    if (pageMode && !holding) holding = requestAnimationFrame(hold);
    if (cornered && !cornering) cornering = requestAnimationFrame(keepCorner);
  };
  const lift = (e: PointerEvent) => { if (e.pointerType !== "pen" && pressed > 0 && --pressed === 0) settle(); };
  const wheel = () => { wheelAt = performance.now(); setTimeout(() => { if (!moving()) settle(); }, 180); };
  host.addEventListener("pointerdown", press, true);
  for (const ev of ["pointerup", "pointercancel"] as const) host.addEventListener(ev, lift, true);
  host.addEventListener("wheel", wheel, { capture: true, passive: true });
  // a canvas with a corner (draw-new.ts: its two edges, `corner-…`): the view never goes left of or above it, so the
  // drawing grows right and down only
  const CORNER = 40; // CSS px between the corner and the view's edge, at most
  const cornered = initial.elements.some((e) => e.id.startsWith("corner-") && !e.isDeleted);
  let cornering = 0;
  const keepCorner = () => {
    cornering = 0;
    if (!api || moving()) return;
    const st = api.getAppState(), z = st.zoom.value, max = CORNER / z;
    if (st.scrollX > max || st.scrollY > max) api.updateScene({ appState: { scrollX: Math.min(st.scrollX, max), scrollY: Math.min(st.scrollY, max) } } as never);
  };
  const hold = () => {
    holding = 0;
    if (!api || !pageMode || moving()) return;
    const st = api.getAppState(), pages = pagesOf(api.getSceneElements() as never);
    if (!pages.length) return;
    const page = pages.find((p) => p.id === held) ?? pages[pageInView(pages, st as unknown as Seen) - 1];
    held = page.id;
    const v = heldView(page, { width: st.width, height: st.height, zoom: st.zoom.value, scrollX: st.scrollX, scrollY: st.scrollY }, FIT);
    if (v) api.updateScene({ appState: { zoom: { value: v.zoom }, scrollX: v.scrollX, scrollY: v.scrollY } } as never);
  };
  type Seen = { activeTool: { type: string }; currentItemStrokeWidth: number; scrollX: number; scrollY: number; zoom: { value: number }; width: number; height: number };
  /** The page under the middle of the view, 1-based (scene = screen / zoom - scroll); 0 with no pages. */
  const pageInView = (pages: Page[], st: Seen) => pageAt(pages, st.width / 2 / st.zoom.value - st.scrollX, st.height / 2 / st.zoom.value - st.scrollY) + 1;
  const note = (st: Seen) => {
    const tool = (Object.keys(TOOL) as NoteTool[]).find((t) => TOOL[t] === st.activeTool.type) ?? null;
    const width = st.currentItemStrokeWidth / PENS[kind].widthTimes;
    const pages = api ? pagesOf(api.getSceneElements() as never) : [];
    const page = pageInView(pages, st);
    const shown = pagePaper(page) ?? (opts.pen ? paper : "blank"); // the page's own paper wherever it is drawn
    const cols = columns(pages, perRow);
    const key = `${tool}/${width}/${kind}/${shown}/${page}/${pages.length}/${cols}/${pageMode}`;
    if (key !== noted) { noted = key; for (const f of watchers) f({ tool, width, kind, paper: shown, page, pages: pages.length, cols, held: pageMode }); }
    // the paper moves with the scene (the scene is see-through over it: viewBackgroundColor, set with the paper)
    if (shown !== "blank" && api && api.getAppState().viewBackgroundColor !== "transparent") api.updateScene({ appState: { viewBackgroundColor: "transparent" } });
    Object.assign(paperLayer.style, paperCss(shown, { scrollX: st.scrollX, scrollY: st.scrollY, zoom: st.zoom.value }, devicePixelRatio));
    // on the pages only, when there are pages: their rectangles on screen (screen = (scene + scroll) × zoom)
    const z = st.zoom.value, rect = (p: { x: number; y: number; width: number; height: number }) => {
      const x = (p.x + st.scrollX) * z, y = (p.y + st.scrollY) * z, w = p.width * z, h = p.height * z;
      return `M${x} ${y}h${w}v${h}h${-w}Z`;
    };
    paperLayer.style.clipPath = pages.length ? `path("${pages.map(rect).join("")}")` : "";
  };
  /** The paper page `n` (1-based) carries itself — `customData.atlasTemplate` on its frame, as the Boox's Notepad
   *  writes it (org.atlas.notepad Page.java) — or null for none. */
  const pagePaper = (n: number): Paper | null => {
    const id = api && n > 0 ? pagesOf(api.getSceneElements() as never)[n - 1]?.id : undefined;
    const t = id ? (api!.getSceneElements().find((e) => e.id === id)?.customData as { atlasTemplate?: string } | undefined)?.atlasTemplate : undefined;
    return t && (PAPERS as string[]).includes(t) ? (t as Paper) : null;
  };
  /** A paper picked here: this device's for drawings without pages, and the page on screen's own (so a Boox shows it). */
  const setPaper = (p: Paper) => {
    paper = p; noted = "";
    api?.updateScene({ appState: { viewBackgroundColor: p === "blank" ? "#ffffff" : "transparent" } });
    if (api) {
      const st = api.getAppState(), els = api.getSceneElements();
      const pages = pagesOf(els as never);
      const at = pageAt(pages, st.width / 2 / st.zoom.value - st.scrollX, st.height / 2 / st.zoom.value - st.scrollY);
      const frame = at >= 0 ? els.find((e) => e.id === pages[at].id) : undefined;
      if (frame) {
        const { atlasTemplate: _, ...rest } = (frame.customData ?? {}) as Record<string, unknown>;
        const customData = p === "blank" ? rest : { ...rest, atlasTemplate: p };
        api.updateScene({ elements: els.map((e) => (e === frame ? lib.newElementWith(frame, { customData }) : e)) });
      }
      note(api.getAppState() as unknown as Seen);
    }
  };
  // Excalidraw's API has no undo: its own keys, as the keyboard would send them
  const keys = (shiftKey: boolean) => host.querySelector(".excalidraw")?.dispatchEvent(new KeyboardEvent("keydown", { key: shiftKey ? "Z" : "z", code: "KeyZ", ctrlKey: true, shiftKey, bubbles: true }));
  const offFingers = opts.pen
    ? fingerGestures(host, {
        view: () => { if (!api) return null; const st = api.getAppState(); return { scrollX: st.scrollX, scrollY: st.scrollY, zoom: st.zoom.value }; },
        setView: (v) => api?.updateScene({ appState: { scrollX: v.scrollX, scrollY: v.scrollY, zoom: { value: v.zoom as never } } }),
        undo: () => keys(false),
        redo: () => keys(true),
      })
    : () => {};
  const offMoves = collectPenStrokes(host, (samples, since) => {
    if (!api) return;
    const els = api.getSceneElements(), last = els[els.length - 1];
    if (!last || last.type !== "freedraw" || last.updated < since) { console.info(`pen: no stroke of Excalidraw's for ${samples.length} samples (tool or timing)`); return; }
    if (samples.length < 3 || samples.length <= last.points.length) {
      if (opts.pen && last.customData?.atlasPen !== kind) api.updateScene({ elements: els.map((e) => (e === last ? lib.newElementWith(last, { customData: { ...last.customData, atlasPen: kind } }) : e)) });
      return;
    }
    const st = api.getAppState();
    const pts = samples.map((p) => lib.viewportCoordsToSceneCoords(p, st));
    const x = pts[0].x, y = pts[0].y;
    const points = pts.map((p) => [p.x - x, p.y - y] as const);
    const xs = points.map((p) => p[0]), ys = points.map((p) => p[1]);
    // a pen that follows the pressure keeps it; the others one width (no pressure, none simulated)
    const pressured = (!opts.pen || PENS[kind].pressure) && samples.some((p) => p.pressure > 0 && p.pressure !== 0.5);
    const done = lib.newElementWith(last, {
      x, y, points: points as never, width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys),
      pressures: pressured ? samples.map((p) => p.pressure) : [], simulatePressure: !pressured && !opts.pen && last.simulatePressure,
      ...(opts.pen ? { customData: { ...last.customData, atlasPen: kind } } : {}), // outlined crisply (draw-ink.ts)
    });
    api.updateScene({ elements: els.map((e) => (e === last ? done : e)) });
  });
  // the app's native pen (PenCatcher, on a Boox): its strokes become this drawing's freedraw elements — every sample
  // and its pressure, as Notepad reads the pen; the page never sees that pen, so no stroke of Excalidraw's to replace
  /** The pen's samples as a freedraw's own fields (scene coordinates `pts`), the pressure spread (penPressure). */
  function freedrawOf(samples: NativeSample[], pts: { x: number; y: number }[]): Record<string, unknown> {
    const x = pts[0].x, y = pts[0].y;
    const points = pts.map((p) => [p.x - x, p.y - y]);
    const xs = points.map((p) => p[0]), ys = points.map((p) => p[1]);
    const pressured = PENS[kind].pressure && samples.some((p) => p.pressure > 0 && p.pressure !== 0.5);
    return {
      type: "freedraw", x, y, width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys), angle: 0,
      points, pressures: pressured ? samples.map((p) => penPressure(p.pressure)) : [], simulatePressure: false, lastCommittedPoint: null,
      customData: { atlasPen: kind },
    };
  }
  /** The stroke so far as an element for the other devices (draw-live.ts `drafting`): the pen's colour and width. */
  function penStroke(samples: NativeSample[]): Record<string, unknown> | null {
    if (!api) return null;
    const st = api.getAppState();
    return { ...freedrawOf(samples, samples.map((p) => lib.viewportCoordsToSceneCoords(p, st))), id: "pen-draft", strokeColor: st.currentItemStrokeColor, strokeWidth: st.currentItemStrokeWidth,
      opacity: st.currentItemOpacity, backgroundColor: "transparent", fillStyle: "solid", strokeStyle: "solid", roughness: 0, version: 1, isDeleted: false };
  }
  function fromPen(samples: NativeSample[]): void {
    if (!api || samples.length < 2) return;
    const st = api.getAppState();
    const pts = samples.map((p) => lib.viewportCoordsToSceneCoords(p, st));
    const pages = pagesOf(api.getSceneElements() as never);
    const page = pageAt(pages, pts[0].x, pts[0].y);
    // the drawing's own fields of a new element: the pen's colour and width, the page under it, Excalidraw's bookkeeping
    const own = () => ({
      id: `pen-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      strokeColor: st.currentItemStrokeColor, backgroundColor: "transparent", fillStyle: "solid", strokeWidth: st.currentItemStrokeWidth,
      strokeStyle: "solid", roughness: 0, opacity: st.currentItemOpacity, groupIds: [], frameId: page >= 0 ? pages[page].id : null,
      roundness: null, seed: Math.floor(Math.random() * 2 ** 31), version: 1, versionNonce: Math.floor(Math.random() * 2 ** 31),
      isDeleted: false, boundElements: null, updated: Date.now(), link: null, locked: false,
    });
    const put = (skeleton: Record<string, unknown>) => {
      if (!api) return;
      const [el] = lib.restoreElements([{ ...own(), ...skeleton }] as never, null);
      api.updateScene({ elements: [...api.getSceneElements(), el], captureUpdate: lib.CaptureUpdateAction.IMMEDIATELY } as never);
    };
    const ink = () => put(freedrawOf(samples, pts));
    // the pen held still at the end: a shape, as Notepad snaps it (pen-shapes.ts; the core's recogniser, the phone's own)
    const timed = pts.map((p, i) => ({ x: p.x, y: p.y, t: samples[i].t }));
    if (draw?.snap !== false && heldAtEnd(timed, st.zoom.value) && extent(timed) * st.zoom.value >= SNAP_MIN) {
      void server.penShape(timed.flatMap((p) => [p.x, p.y, p.t]), draw?.shapes !== "atlas").then(({ wire }) => {
        const shape = wireToSkeleton(wire);
        if (!shape) return ink();
        put({ ...shape, lastCommittedPoint: null, startBinding: null, endBinding: null, startArrowhead: shape.startArrowhead ?? null, endArrowhead: shape.endArrowhead ?? null });
      }, ink);
      return;
    }
    ink();
  }
  // the pen tool once Excalidraw has set its own first state (an activeTool in initialData is reset by it)
  // …and instant ink over it at once, not at Excalidraw's next onChange
  if (opts.pen) {
    const pick = () => {
      if (!api) return void requestAnimationFrame(pick);
      api.setActiveTool({ type: "freedraw" });
      api.updateScene({ appState: { currentItemStrokeWidth: penState.currentItemStrokeWidth * PENS[kind].widthTimes, currentItemOpacity: PENS[kind].opacity } });
      if (paper !== "blank") setPaper(paper); else note(api.getAppState() as unknown as Seen); // this device's paper (a file's own background otherwise)
      // setActiveTool lands with React's next render: the pen is told now rather than read back too early
      ink.sync({ ...api.getAppState(), activeTool: { type: "freedraw" } });
    };
    requestAnimationFrame(pick);
  }
  function pageNow(): string | null {
    if (!api) return null;
    const st = api.getAppState(), pages = pagesOf(api.getSceneElements() as never);
    const at = pageAt(pages, st.width / 2 / st.zoom.value - st.scrollX, st.height / 2 / st.zoom.value - st.scrollY);
    return at >= 0 ? pages[at].id : null;
  }
  /** Scrolls to a page (a number, or what follows `#` in an embed), waiting for Excalidraw's API on a fresh mount. */
  function showPage(ref: number | string): void {
    if (!api) { requestAnimationFrame(() => showPage(ref)); return; }
    const els = api.getSceneElements();
    const f = typeof ref === "number" ? (() => { const p = pagesOf(els as never)[ref - 1]; return p && els.find((e) => e.id === p.id); })() : frameRef(els as never, ref);
    if (f) { held = f.id; api.scrollToContent(f as never, { fitToViewport: true, viewportZoomFactor: FIT, animate: false }); }
    // the toolbar's page number follows at once: it was left on the old page, so "next" kept going to the same one
    requestAnimationFrame(() => { if (api) note(api.getAppState() as unknown as Seen); });
  }
  // a page shown fitted stays fitted when the view changes size (the phone app's fullscreen, a turned screen, a split);
  // one zoomed by hand is left as it is
  let size = { w: host.clientWidth, h: host.clientHeight };
  const resized = new ResizeObserver(() => {
    const was = size;
    size = { w: host.clientWidth, h: host.clientHeight };
    if (!api || !was.w || !was.h || (was.w === size.w && was.h === size.h)) return;
    const st = api.getAppState(), pages = pagesOf(api.getSceneElements() as never);
    const at = pageAt(pages, was.w / 2 / st.zoom.value - st.scrollX, was.h / 2 / st.zoom.value - st.scrollY);
    if (at < 0) return;
    const fit = FIT * Math.min(was.w / pages[at].width, was.h / pages[at].height);
    if (pageMode || Math.abs(st.zoom.value / fit - 1) < 0.03) requestAnimationFrame(() => requestAnimationFrame(() => showPage(at + 1))); // once Excalidraw has the new size
  });
  resized.observe(host);
  // page mode: the view stays on its page, so PageUp / PageDown turn them (the bar's ‹ ›)
  const turn = (e: KeyboardEvent) => {
    if (!api || (e.key !== "PageDown" && e.key !== "PageUp") || e.ctrlKey || e.metaKey || e.altKey) return;
    const pages = pagesOf(api.getSceneElements() as never), at = pageInView(pages, api.getAppState() as unknown as Seen);
    const to = at + (e.key === "PageDown" ? 1 : -1);
    if (to < 1 || to > pages.length) return;
    e.preventDefault(); e.stopPropagation();
    showPage(to);
  };
  host.addEventListener("keydown", turn, true); // held or not, PageUp / PageDown go page to page
  const render = () =>
    root.render(
      createElement(lib.Excalidraw, {
        // pages stay where they are: frames
        // locked, as the notepad keeps them; what is on them moves as before
        // a cornered canvas opens at its corner (fitting its long edges would show it from far away)
        initialData: { elements: initial.elements.map((e) => (e.type === "frame" && !e.locked ? { ...e, locked: true } : e)), appState: { ...initial.appState, theme: current, frameRendering: FRAMES, ...(opts.pen ? penState : {}), ...(cornered ? { scrollX: CORNER, scrollY: CORNER, zoom: { value: 1 as never } } : {}) }, files: initial.files, scrollToContent: !cornered },
        theme: current,
        autoFocus: true, // keyboard-first: R / P / T work as soon as the pane opens
        excalidrawAPI: (a: Api) => (api = a),
        // `[[note]]` on an element (Obsidian's Excalidraw plugin): the note in Atlas, resolved from the drawing's folder
        onLinkOpen: (el: { link: string | null }, ev: CustomEvent<unknown>) => {
          const target = wikiTarget(el.link);
          if (!target) return; // a web address: Excalidraw opens it
          ev.preventDefault();
          const dir = opts.path?.includes("/") ? opts.path.slice(0, opts.path.lastIndexOf("/")) : "";
          openPath(resolveOrBeside(target, dir));
        },
        onChange: (elements: readonly unknown[], st: Parameters<typeof ink.sync>[0]) => {
          ink.sync(st);
          if (!moving()) settle();
          live?.drafting((st as { newElement?: unknown } | null)?.newElement ?? null); // the stroke as it grows, to the others
          if (st) note(st as unknown as Seen); // the toolbar (pen mode) and the paper (both)
          const v = lib.getSceneVersion(elements as never);
          host.dataset.sceneVersion = String(v); // for automation: a change from another device shows here too
          if (st) { const v = st as unknown as Seen; host.dataset.view = `${Math.round(v.scrollX)},${Math.round(v.scrollY)},${v.zoom.value}`; } // where the view is, likewise
          if (v !== version) { version = v; onEdit(); pagesLater(); live?.changed(); }
        },
        onPointerUpdate: live ? (p: Parameters<typeof live.pointer>[0]) => live.pointer(p) : undefined,
        UIOptions: { canvasActions: { loadScene: false, saveToActiveFile: false, export: { saveFileToDisk: true } } },
        renderTopRightUI: opts.onFullscreen
          ? () => createElement("button", { className: "atlas-draw-full", title: "Fullscreen (Super+F)", "aria-label": "Fullscreen", onClick: opts.onFullscreen }, "⛶")
          : undefined,
      }),
    );
  render();
  // linked document pages (linked-pages.ts): drawn from their PDF, in memory only — at mount and when new ones come in
  let filling = false, pagesT = 0;
  const fillPages = async () => {
    if (!api || filling) return;
    filling = true;
    try { await fillLinked(api.getSceneElements() as never, api.getFiles(), (f) => api?.addFiles([f as never])); }
    finally { filling = false; }
  };
  const pagesLater = () => { clearTimeout(pagesT); pagesT = window.setTimeout(() => void fillPages(), 300); };
  const firstPages = () => (api ? void fillPages() : requestAnimationFrame(firstPages));
  firstPages();
  const scene = () => {
    if (!api) throw new Error("drawing not ready");
    // another device's stroke still being drawn (draw-live.ts) is shown, never kept
    const elements = api.getSceneElements().filter((e) => !(e.customData as { atlasDraft?: boolean } | undefined)?.atlasDraft);
    return { elements, appState: api.getAppState(), files: api.getFiles() };
  };
  return {
    async serialize() {
      const s = scene();
      const obj = JSON.parse(lib.serializeAsJSON(s.elements, s.appState, s.files, "local")) as { files?: Record<string, { dataURL?: string }> };
      for (const id of Object.keys(obj.files ?? {})) if (isLinkedFile(id)) delete obj.files![id]; // drawn from the PDF, never kept
      obj.files = await shrinkFiles(obj.files ?? {});
      return compactJson(obj);
    },
    async svg() {
      const s = scene();
      const el = await lib.exportToSvg({ elements: s.elements, appState: { ...s.appState, exportBackground: true, exportWithDarkMode: false }, files: s.files });
      return el.outerHTML;
    },
    setTheme(t) { if (t !== current) { current = t; api?.updateScene({ appState: { theme: t } }); } },
    showPage,
    pageNow,
    destroy() {
      clearTimeout(pagesT); cancelAnimationFrame(holding); cancelAnimationFrame(cornering); host.removeEventListener("keydown", turn, true);
      host.removeEventListener("pointerdown", press, true); host.removeEventListener("pointerup", lift, true); host.removeEventListener("pointercancel", lift, true); host.removeEventListener("wheel", wheel, true); resized.disconnect(); live?.close(); ink.off(); offMoves(); offFingers(); watchers.clear(); root.unmount(); },
    others: () => live?.others() ?? 0,
    writes: () => live?.writes() ?? true,
    merge(json) {
      const data = JSON.parse(json);
      const els = (lib.restore(data, null, null).elements ?? []) as never;
      // its pictures too (a PDF page or a photo put in on the Boox), the ones not here yet
      const files = api?.getFiles() ?? {};
      const fresh = Object.values((data.files ?? {}) as Record<string, { id?: string }>).filter((f) => f?.id && !files[f.id]);
      if (api && fresh.length) { api.addFiles(fresh as never); host.dataset.files = String(Object.keys(api.getFiles()).length); } // for automation
      if (live) { live.merge(els); return; }
      if (!api) return;
      const have = new Map(api.getSceneElementsIncludingDeleted().map((e) => [e.id, e.version]));
      if (!(els as { id: string; version: number }[]).some((e) => (have.get(e.id) ?? -1) < e.version)) return; // nothing newer: no repaint
      api.updateScene({ elements: lib.reconcileElements(api.getSceneElementsIncludingDeleted(), els, api.getAppState()) as never, captureUpdate: lib.CaptureUpdateAction.NEVER });
    },
    notepad: opts.pen
      ? {
          tool(t) { api?.setActiveTool({ type: TOOL[t] as "freedraw" }); },
          pen(k, w) {
            kind = k; remember("pen", k); noted = "";
            api?.setActiveTool({ type: "freedraw" });
            api?.updateScene({ appState: { currentItemStrokeWidth: w * PENS[k].widthTimes, currentItemOpacity: PENS[k].opacity } });
          },
          paper: setPaper,
          newPage() {
            if (!api) return;
            const els = api.getSceneElements(), pages = pagesOf(els as never);
            const at = nextPage(pages, els as never, columns(pages, perRow));
            // a new page takes the last page's size: a drawing keeps the format it was made with (draw-new.ts)
            const last = pages.at(-1);
            const [frame] = lib.convertToExcalidrawElements([{ type: "frame", ...at, width: last?.width ?? PAGE.width, height: last?.height ?? PAGE.height, name: `Page ${pages.length + 1}`, children: [], locked: true }] as never);
            api.updateScene({ elements: [...els, frame] });
            held = frame.id;
            api.scrollToContent(frame, { fitToViewport: true, viewportZoomFactor: FIT, animate: false });
          },
          arrange(cols) {
            if (!api) return;
            const els = api.getSceneElements(), pages = pagesOf(els as never), moves = arranged(pages, cols);
            if (!moves.length) { toast("Pages", `They are ${cols} side by side already.`); return; }
            // a page's own and what is on it (Excalidraw's frameId), all read before anything moves
            const by = new Map(moves.map((m) => [m.id, m]));
            api.updateScene({
              elements: els.map((e) => {
                const m = by.get(e.type === "frame" ? e.id : (e.frameId ?? ""));
                return m ? lib.newElementWith(e, { x: e.x + m.dx, y: e.y + m.dy }) : e;
              }),
              captureUpdate: lib.CaptureUpdateAction.IMMEDIATELY,
            } as never);
            const shown = pages[pageInView(pages, api.getAppState() as unknown as Seen) - 1];
            if (shown) requestAnimationFrame(() => showPage(`^frame=${shown.id}`)); // the page that was on screen, where it went
          },
          link() {
            if (!api) return;
            const chosen = api.getAppState().selectedElementIds;
            if (!Object.keys(chosen).length) { toast("Link to a note", "Pick the strokes or text first (the select tool), then Link."); return; }
            pick({
              placeholder: "Link the selection to which note?", tag: "Link", icon: "link",
              items: async () => (await server.files()).filter((f) => /\.md$/i.test(f) && !/\.excalidraw\.md$/i.test(f))
                .map((f) => ({ value: f, title: basename(f).replace(/\.md$/i, ""), detail: f.includes("/") ? f.slice(0, f.lastIndexOf("/")) : "" })),
              typed: (t) => `Link to a new note “${t}”`,
              onpick: (v) => {
                if (!api) return;
                const name = basename(v).replace(/\.md$/i, "");
                const ids = api.getAppState().selectedElementIds;
                api.updateScene({ elements: api.getSceneElements().map((e) => (ids[e.id] ? lib.newElementWith(e, { link: `[[${name}]]` }) : e)) });
              },
            });
          },
          page: showPage,
          copyEmbed() {
            if (!api) return;
            const st = api.getAppState(), pages = pagesOf(api.getSceneElements() as never);
            const i = pageAt(pages, st.width / 2 / st.zoom.value - st.scrollX, st.height / 2 / st.zoom.value - st.scrollY);
            const frame = i >= 0 ? (api.getSceneElements().find((e) => e.id === pages[i].id) as { name?: string | null } | undefined) : undefined;
            const name = (opts.path ?? "drawing.excalidraw").split("/").pop()!.replace(/\.md$/i, "");
            const embed = `![[${name}${frame ? `#${frame.name?.trim() || `Page ${i + 1}`}` : ""}]]`;
            void navigator.clipboard.writeText(embed).then(() => toast("Copied — paste it in a note", embed), () => toast("Could not copy", embed, "error"));
          },
          undo: () => keys(false),
          redo: () => keys(true),
          watch(f) { watchers.add(f); noted = ""; if (api) note(api.getAppState()); return () => watchers.delete(f); },
          holdPages(on) {
            pageMode = on;
            remember("pages-held", on ? "on" : "off");
            noted = "";
            if (api) { note(api.getAppState() as unknown as Seen); if (on) showPage(pageInView(pagesOf(api.getSceneElements() as never), api.getAppState() as unknown as Seen) || 1); }
          },
        }
      : undefined,
  };
}

/** The Obsidian Excalidraw plugin's file format (a note wrapping the scene), as opposed to plain JSON. */
export const isPluginDrawing = (path: string): boolean => /\.excalidraw\.md$/i.test(path);

/** Put an edited scene back into a plugin file, leaving everything else (frontmatter, notes) as it was.
 *  The "## Text Elements" index goes stale; the plugin rebuilds it the next time Obsidian opens the file. */
export async function writeSceneInto(original: string, json: string): Promise<string> {
  const re = /(```)(compressed-json|json)(\r?\n)([\s\S]*?)(\r?\n```)/;
  const m = re.exec(original);
  if (!m) throw new Error("no ```compressed-json block to write the drawing into");
  const { compressToBase64 } = await import("lz-string");
  const body = m[2] === "json" ? json : compressToBase64(json).replace(/(.{256})/g, "$1\n\n").trimEnd(); // the plugin's own layout
  return original.slice(0, m.index) + m[1] + m[2] + m[3] + body + m[5] + original.slice(m.index + m[0].length);
}

/** A scene file's JSON: Atlas's `.excalidraw` is JSON; the Obsidian Excalidraw plugin's `.excalidraw.md`
 *  keeps it in a ```compressed-json (LZString base64) or ```json block under "## Drawing". */
export async function sceneJson(text: string): Promise<string> {
  const block = /```(compressed-json|json)\r?\n([\s\S]*?)\r?\n```/.exec(text.slice(text.indexOf("## Drawing") + 1 || 0));
  if (!block) return text;
  if (block[1] === "json") return block[2];
  const { decompressFromBase64 } = await import("lz-string");
  const json = decompressFromBase64(block[2].replace(/\s/g, ""));
  if (!json) throw new Error("compressed-json block did not decompress");
  return json;
}

/** Standalone SVG of a scene (for `![[x.excalidraw]]` embeds), drawn for the app's theme. */
/** The scene as an SVG; with `page` (what an embed names after `#`: frameRef) only that page, cut at its edges. */
export async function sceneSvg(json: string, dark: boolean, page?: string): Promise<SVGSVGElement> {
  const lib: Lib = await import("@excalidraw/excalidraw");
  const s = lib.restore(JSON.parse(json), null, null);
  const frame = page ? frameRef(s.elements as never, page) : null;
  if (page && !frame) throw new Error(`no page “${page}” in this drawing`);
  const elements = frame ? s.elements.filter((e) => e.id === frame.id || (e as { frameId?: string | null }).frameId === frame.id) : s.elements;
  return lib.exportToSvg({ elements, appState: { ...s.appState, exportBackground: false, exportWithDarkMode: dark }, files: s.files ?? {}, ...(frame ? { exportingFrame: frame as never } : {}) });
}
