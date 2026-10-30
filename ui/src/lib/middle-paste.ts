// The middle button pastes the X11 selection (Linux, WebKitGTK and Chromium alike) — into whatever has the focus, at
// its caret, wherever the click was: a middle click to close a tab typed the last selection into the open note
// (caught by middle-click.spec.ts).
// Pasting stays where the click is in a text field, a note's text or a terminal (not on a link in it). Anywhere else the release is
// cancelled — and, as Chromium still pastes then (a `paste` event at the focused editor), a paste that comes right
// after such a click is dropped.
const PASTES_HERE = "input, textarea, [contenteditable=''], [contenteditable='true'], .cm-content, .xterm";
/** A link inside a text opens beside on the middle button (editor/create.ts, Markdown.svelte): never a paste. */
const LINK = "a, .cm-link, .cm-hmd-internal-link, .cm-url";
const RIGHT_AFTER_MS = 500;

export function guardMiddlePaste(): () => void {
  let elsewhereAt = -Infinity; // never yet: 0 would drop every paste in a page's first half second
  const elsewhere = (e: MouseEvent) => e.button === 1 && !(e.target instanceof Element && e.target.closest(PASTES_HERE) && !e.target.closest(LINK));
  const press = (e: MouseEvent) => { if (elsewhere(e)) elsewhereAt = performance.now(); };
  const up = (e: MouseEvent) => { if (elsewhere(e)) { elsewhereAt = performance.now(); e.preventDefault(); } };
  const paste = (e: ClipboardEvent) => {
    if (performance.now() - elsewhereAt > RIGHT_AFTER_MS) return;
    e.preventDefault();
    e.stopImmediatePropagation();
  };
  window.addEventListener("mousedown", press, true);
  window.addEventListener("mouseup", up, true);
  window.addEventListener("paste", paste, true);
  return () => {
    window.removeEventListener("mousedown", press, true);
    window.removeEventListener("mouseup", up, true);
    window.removeEventListener("paste", paste, true);
  };
}
