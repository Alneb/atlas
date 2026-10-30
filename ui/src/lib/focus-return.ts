// Something that opens over the page (the command bar, the capture popup, a dialog) gives the focus back when it
// closes: without it the focus falls to <body> and the next keys go nowhere until a click.
import { getDock } from "./dock-instance";

/** Remembers what has the focus now; the returned function gives it back, unless something else took it since (a pane
 *  the closing thing opened, another overlay) or another tab became the active one (a note opened from the command bar
 *  that has not taken the focus yet). Use as an effect's cleanup: `$effect(() => { if (open) return holdFocus(); })`. */
export function holdFocus(): () => void {
  const a = document.activeElement;
  const was = a instanceof HTMLElement && a !== document.body ? a : null;
  const tab = getDock()?.activePanel?.id;
  return () => requestAnimationFrame(() => {
    const now = document.activeElement;
    if (getDock()?.activePanel?.id !== tab) return;
    if (was?.isConnected && (!now || now === document.body)) was.focus({ preventScroll: true });
  });
}

export const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), [contenteditable="true"]';

/** Tab and Shift+Tab kept inside `root` (a modal): from its last control to its first and back, never out into the page
 *  behind it. Call from the root's keydown; true when it moved the focus. */
export function trapTab(e: KeyboardEvent, root: HTMLElement): boolean {
  if (e.key !== "Tab" || e.defaultPrevented) return false;
  const all = [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null || el === document.activeElement);
  if (!all.length) { e.preventDefault(); root.focus(); return true; }
  const first = all[0], last = all[all.length - 1], at = document.activeElement;
  const out = e.shiftKey ? at === first || at === root || !root.contains(at) : at === last || !root.contains(at);
  if (!out) return false;
  e.preventDefault();
  (e.shiftKey ? last : first).focus();
  return true;
}
