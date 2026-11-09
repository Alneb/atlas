// The desktop app on Linux: WebKitGTK hands a Wacom pen to the page as a mouse, without pressure. The app tells the
// page, just before each of the pen's events, its pressure and tilt (`atlasPen`, atlas-app main.rs `pen_as_pen`);
// here the mouse's pointer event that follows is replaced by the same event as a pen's, so the drawings
// (draw-excalidraw.ts, draw-notepad.ts) see a pen. Mouse events (mousedown, click) are left alone: buttons still work.
type Pen = { pressure: number; tiltX: number; tiltY: number; eraser: boolean };
let pen: Pen | null = null;

export function attachPenBridge(): void {
  const w = window as unknown as { atlasPen?: (p: number | null, tx?: number, ty?: number, eraser?: boolean) => void };
  w.atlasPen = (p, tiltX = 0, tiltY = 0, eraser = false) => { pen = p === null ? null : { pressure: p, tiltX, tiltY, eraser }; };
  for (const type of ["pointerdown", "pointermove", "pointerup", "pointerover", "pointerenter", "pointerout", "pointerleave"] as const) {
    addEventListener(type, (e) => {
      if (!pen || e.pointerType !== "mouse" || !e.isTrusted) return;
      e.stopImmediatePropagation();
      const up = type === "pointerup";
      const as = new PointerEvent(type, {
        bubbles: e.bubbles, cancelable: e.cancelable, composed: true,
        pointerId: e.pointerId, pointerType: "pen", isPrimary: true,
        clientX: e.clientX, clientY: e.clientY, screenX: e.screenX, screenY: e.screenY,
        button: pen.eraser && e.button === 0 ? 5 : e.button, buttons: pen.eraser && e.buttons & 1 ? 32 : e.buttons,
        pressure: up ? 0 : pen.pressure || (e.buttons ? 0.5 : 0), tiltX: pen.tiltX, tiltY: pen.tiltY,
        ctrlKey: e.ctrlKey, shiftKey: e.shiftKey, altKey: e.altKey, metaKey: e.metaKey,
      });
      if (!e.target?.dispatchEvent(as)) e.preventDefault();
    }, true);
  }
}
