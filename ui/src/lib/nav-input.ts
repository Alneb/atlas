// Back / forward from the mouse's side buttons and a horizontal two-finger swipe, like a browser.
// A swipe only navigates when nothing under the pointer can scroll that way (tables, code, tab strips keep it) or took
// the wheel itself (a drawing pans with it: Excalidraw's handler cancels the event).
import { canNavigate, navigate } from "./dock";
import { hideSwipe, swipeSign } from "./nav-signs";

const SWIPE_PX = 140; // accumulated horizontal travel that counts as a swipe
const SWIPE_IDLE_MS = 180; // a pause this long ends the gesture
const COOLDOWN_MS = 700; // one navigation per gesture (momentum keeps sending wheel events)

function canScrollX(el: Element | null, dx: number): boolean {
  for (let e = el; e && e !== document.body; e = e.parentElement) {
    const s = getComputedStyle(e);
    if (!/(auto|scroll)/.test(s.overflowX) || e.scrollWidth <= e.clientWidth) continue;
    if (dx < 0 ? e.scrollLeft > 0 : e.scrollLeft + e.clientWidth < e.scrollWidth - 1) return true;
  }
  return false;
}

/** Something that pans or zooms with the wheel without scrolling: a drawing, or anything marked `data-wheel`. Most such
 *  views cancel the wheel (`defaultPrevented`, checked first); this catches one that does not. Not every canvas: a PDF's
 *  pages are canvases, and a swipe over them still goes back. */
function ownsWheel(el: Element | null): boolean {
  return !!el?.closest?.("[data-wheel], .excalidraw");
}

/** Back / forward offered first to the pane under the pointer (`atlas-nav`, cancelable, detail: -1 | 1): the explorer
 *  moves through its own folders; a pane that cancels it has used it. */
function paneTakes(target: EventTarget | null, step: -1 | 1): boolean {
  const el = target instanceof Element ? target : null;
  return !!el && !el.dispatchEvent(new CustomEvent("atlas-nav", { detail: step, bubbles: true, cancelable: true }));
}

export function installNavInput(): () => void {
  // buttons 3/4 = back/forward; swallow them before the webview acts on its own page history
  const stop = (e: MouseEvent) => { if (e.button === 3 || e.button === 4) e.preventDefault(); };
  const onUp = (e: MouseEvent) => {
    if (e.button !== 3 && e.button !== 4) return;
    e.preventDefault();
    if (!paneTakes(e.target, e.button === 3 ? -1 : 1)) navigate(e.button === 3 ? -1 : 1);
  };

  let acc = 0, last = 0, until = 0, idle: ReturnType<typeof setTimeout> | undefined;
  const onWheel = (e: WheelEvent) => {
    if (e.ctrlKey || Math.abs(e.deltaX) <= 2 * Math.abs(e.deltaY)) return; // vertical scroll or pinch
    const now = performance.now();
    if (now < until) return;
    if (now - last > SWIPE_IDLE_MS) acc = 0;
    last = now;
    // a two-finger pan inside a drawing (or anything that scrolls sideways) is never a swipe back
    if (e.defaultPrevented || ownsWheel(e.target as Element) || canScrollX(e.target as Element, e.deltaX)) { acc = 0; hideSwipe(); return; }
    acc += e.deltaX;
    // the sign at the edge follows the fingers; a pause ends the gesture and takes it away
    const step = acc < 0 ? -1 : 1; // fingers to the right (negative deltaX) = back, as in browsers
    swipeSign(acc / SWIPE_PX, canNavigate(step));
    clearTimeout(idle);
    idle = setTimeout(() => { acc = 0; hideSwipe(); }, SWIPE_IDLE_MS);
    if (Math.abs(acc) < SWIPE_PX) return;
    if (!paneTakes(e.target, step)) navigate(step);
    acc = 0;
    until = now + COOLDOWN_MS;
    setTimeout(hideSwipe, 160); // the filled arrow is seen for a moment
  };

  window.addEventListener("mousedown", stop, true);
  window.addEventListener("auxclick", stop, true);
  window.addEventListener("mouseup", onUp, true);
  window.addEventListener("wheel", onWheel, { passive: true });
  const offZoom = noPageZoom();
  return () => {
    offZoom();
    window.removeEventListener("mousedown", stop, true);
    window.removeEventListener("auxclick", stop, true);
    window.removeEventListener("mouseup", onUp, true);
    window.removeEventListener("wheel", onWheel);
    clearTimeout(idle);
    hideSwipe();
  };
}

/** A touchpad pinch zooms what is under the fingers — a drawing, a PDF — never the whole app. Browsers send a
 *  pinch as a wheel with Ctrl, WebKit also as gesture events: cancelled here, at the window, after the view's own
 *  handler has had it (Excalidraw zooms its canvas from the same events). The interface's size is Settings → Appearance. */
function noPageZoom(): () => void {
  const wheel = (e: WheelEvent) => { if (e.ctrlKey) e.preventDefault(); };
  const gesture = (e: Event) => e.preventDefault();
  const kinds = ["gesturestart", "gesturechange", "gestureend"];
  window.addEventListener("wheel", wheel, { passive: false });
  for (const k of kinds) window.addEventListener(k, gesture, { passive: false });
  return () => {
    window.removeEventListener("wheel", wheel);
    for (const k of kinds) window.removeEventListener(k, gesture);
  };
}
