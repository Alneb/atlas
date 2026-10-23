// The phone app's native pen over a part of the page (AtlasActivity's Bridge.ink → Onyx's instant ink + PenCatcher, the
// user: "make the excalidraw webview as good in terms of stroke as the native notepad"): the app catches the pen as
// Notepad does (every sample, its pressure), the firmware draws the quick line, and each finished stroke comes back
// here for whoever holds the region — a drawing (draw-excalidraw.ts), a plugin's view (`atlas.eink.pen`: the book
// reader's pen highlights). The app has ONE such region, so one holder at a time. A module of its own so the shell
// (native-shell.svelte.ts) reaches the holder without loading Excalidraw.

/** A sample in the page's CSS pixels (client coordinates), the pen's pressure (0–1), and when (ms since the stroke
 *  began: the hold that asks for a shape). */
export type NativeSample = { clientX: number; clientY: number; pressure: number; t: number };

type Bridge = {
  ink?(left: number, top: number, width: number, height: number, lineWidth: number, style: number): void;
  /** the screen under the quick ink shown again: what the page drew meanwhile (another device's stroke) appears */
  inkRepaint?(): void;
  /** whether the app sends the stroke so far as it is drawn (`atlasShell.penDraft`) */
  penDrafts?(on: boolean): void;
};
const bridge = (): Bridge | undefined => (window as unknown as { AtlasNative?: Bridge }).AtlasNative;

/** Whether this app has the native pen (the Android app; never a browser or the desktop). */
export const nativePen = (): boolean => !!bridge()?.ink;

/** The holder of the region: its strokes go to `take`, the stroke so far to `draft` (null once it ends). */
let holder: { owner: object; take: (samples: NativeSample[]) => void; draft?: (samples: NativeSample[] | null) => void } | null = null;

/** Every region's re-send, and how many holds are on: while a menu lies over the drawing the pen is the page's, so its
 *  items take a tap. */
const senders = new Set<() => void>();
let held = 0;
/** The native pen off until the returned release (a menu open over the drawing). */
export function holdPen(): () => void {
  held++;
  for (const f of senders) f();
  let done = false;
  return () => { if (done) return; done = true; held--; for (const f of senders) f(); };
}

/** The screen under the quick ink shown again, at most every 250 ms: while Onyx's ink is on, the page's own drawing does
 *  not reach the e-ink screen, so another device's stroke stayed unseen until a tap on the toolbar. */
let repaintT = 0;
export function repaintUnderPen(): void {
  if (!holder || repaintT) return;
  repaintT = window.setTimeout(() => { repaintT = 0; bridge()?.inkRepaint?.(); }, 250);
}

/** Whether the app sends the stroke so far as it is drawn: only while another device watches (draw-live.ts). */
export function wantPenDrafts(on: boolean): void { bridge()?.penDrafts?.(on); }

/** What the pen over a part of the page does: `active()` says whether it is wanted now (a tool picked…), `top` leaves a
 *  strip at the top to the fingers (a toolbar), `line()` is the quick line's width (CSS px) and Onyx's style
 *  (0 pencil, 1 brush with pressure, 2 marker). */
export type PenOptions = { active?: () => boolean; top?: number; line?: () => [number, number]; draft?: (samples: NativeSample[] | null) => void };

/** The native pen over `host` while it shows (and `active()`); its strokes to `take`. `sync()` after what `active` or
 *  `line` read changes; `off()` gives the region back. Null when this app has no native pen. */
export function penOver(host: HTMLElement, take: (samples: NativeSample[]) => void, opts: PenOptions = {}): { sync(): void; off(): void } | null {
  const b = bridge();
  if (!b?.ink) return null;
  const me = {}, top = opts.top ?? 0;
  let last = "", gone = false;
  const send = () => {
    const r = host.getBoundingClientRect();
    const on = !gone && !held && (opts.active?.() ?? true) && document.visibilityState === "visible" && r.width > 0 && r.height > top;
    const [width, style] = opts.line?.() ?? [2, 0];
    const args: [number, number, number, number, number, number] = on ? [r.left, r.top + top, r.width, r.height - top, width, style] : [0, 0, 0, 0, 0, 0];
    const key = args.map((n) => n.toFixed(1)).join();
    if (key === last) return;
    last = key;
    if (!on && holder !== null && holder.owner !== me) return; // another holds the region: leave it on
    holder = on ? { owner: me, take, draft: opts.draft } : null;
    console.info(`native pen ${on ? `over ${key}` : "off"}`); // logcat AtlasPage
    b.ink!(...args);
  };
  const seen = new ResizeObserver(send);
  seen.observe(host);
  document.addEventListener("visibilitychange", send);
  senders.add(send);
  send();
  return {
    sync: send,
    off() { gone = true; senders.delete(send); seen.disconnect(); document.removeEventListener("visibilitychange", send); send(); },
  };
}

const samplesOf = (pts: number[][]): NativeSample[] => pts.map(([clientX, clientY, pressure, t], i) => ({ clientX, clientY, pressure, t: t ?? i * 8 }));

/** The stroke so far from the app (`null`: it ended), for the other devices to see it grow. */
export function deliverPenDraft(json: string | null): void {
  if (!holder?.draft) return;
  if (json == null) { holder.draft(null); return; }
  try { holder.draft(samplesOf(JSON.parse(json))); } catch { /* a broken message */ }
}

/** A stroke from the app: `[[x, y, pressure, t], …]` in CSS pixels. Dropped (and said) when nothing holds the pen. */
export function deliverPenStroke(json: string): void {
  let pts: number[][];
  try { pts = JSON.parse(json); } catch { return; }
  if (!holder) { console.info(`pen: a native stroke of ${pts.length} samples and nothing to take it`); return; }
  holder.take(samplesOf(pts));
}
