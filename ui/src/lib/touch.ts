// Touch everywhere: a long press is a right click — whatever has a menu (a tab, a file, a pin, an app, a link) opens it
// under the finger, as on a phone — and the tap that ends it does not also open the thing. The bigger targets are CSS
// (styles/touch.css, `pointer: coarse`). Links in notes are taken at the tap by the editor itself (editor/create.ts).
const HOLD_MS = 500;
const SLOP = 10;

export function attachTouch(): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let start: { x: number; y: number; target: EventTarget | null } | null = null;
  let fired = false;
  // a native contextmenu during the press (Android's WebView sends one) is the long press: never a second menu
  let nativeAt = 0;

  const cancel = () => { clearTimeout(timer); timer = undefined; start = null; };
  const down = (e: PointerEvent) => {
    if (e.pointerType !== "touch" || !e.isPrimary) return;
    fired = false;
    start = { x: e.clientX, y: e.clientY, target: e.target };
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (!start || Date.now() - nativeAt < HOLD_MS + 100) return;
      const el = start.target instanceof Element ? start.target : null;
      if (!el || el.closest("input, textarea, .cm-content")) return; // text keeps its own long press (select, paste)
      fired = true;
      el.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: start.x, clientY: start.y, button: 2 }));
      start = null;
    }, HOLD_MS);
  };
  const move = (e: PointerEvent) => { if (start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > SLOP) cancel(); };
  // the click that follows a long press would open what the menu is about: swallowed once
  const click = (e: MouseEvent) => { if (fired) { fired = false; e.preventDefault(); e.stopPropagation(); } };
  const native = () => { nativeAt = Date.now(); };

  addEventListener("pointerdown", down, true);
  addEventListener("pointermove", move, true);
  addEventListener("pointerup", cancel, true);
  addEventListener("pointercancel", cancel, true);
  addEventListener("click", click, true);
  addEventListener("contextmenu", native, true);
  return () => {
    cancel();
    removeEventListener("pointerdown", down, true);
    removeEventListener("pointermove", move, true);
    removeEventListener("pointerup", cancel, true);
    removeEventListener("pointercancel", cancel, true);
    removeEventListener("click", click, true);
    removeEventListener("contextmenu", native, true);
  };
}
