// While a divider is dragged, `body.atlas-resizing` stops selection and takes the pointer from terminals and iframes
// (base.css). Each divider ends it on its own pointerup; one that is lost (released outside the window, a cancelled
// touch, the window losing focus) left it on, and a terminal then took keys but no drag or double-click. Any end of
// any pointer, the window's blur, and the next press anywhere end it here too (a new drag sets it again after).
const end = () => document.body.classList.remove("atlas-resizing");

export function guardResizing(): void {
  for (const type of ["pointerup", "pointercancel", "pointerdown"] as const) window.addEventListener(type, end, true);
  window.addEventListener("blur", end);
}
