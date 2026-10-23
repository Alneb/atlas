// What a phone's Back closes before it leaves the screen (docs/guides/ANDROID.md, " "): an overlay registers how it
// closes while it is open — the palette, a menu, a dialog, a dropdown, a Settings area on a phone — the newest on top.
// The app's system Back asks `dismiss()` first (atlasShell.dismiss, native-shell.svelte.ts); only when nothing was
// open does it go back a place.
// `shown`: for a view that stays mounted when hidden (Files, Settings behind an open note): counted only while on screen —
// before, Back on a note went up a hidden Files folder each time, and landed at its root.
type Entry = { close: () => void; shown?: () => boolean };
const open: Entry[] = [];

/** Registers `close` while the overlay is open; the returned function unregisters it (an `$effect`'s cleanup). */
export function closable(close: () => void, shown?: () => boolean): () => void {
  const e: Entry = { close, shown };
  open.push(e);
  return () => {
    const i = open.lastIndexOf(e);
    if (i >= 0) open.splice(i, 1);
  };
}

/** Closes the newest open overlay on screen; false when none was. */
export function dismiss(): boolean {
  for (let i = open.length - 1; i >= 0; i--) {
    const e = open[i];
    if (e.shown && !e.shown()) continue;
    open.splice(i, 1);
    e.close();
    return true;
  }
  return false;
}

/** Whether `el` is on screen (not in a hidden panel or view). */
export const onScreen = (el: HTMLElement | undefined): boolean => !!el && el.isConnected && el.getClientRects().length > 0;

/** A browser's Back (the phone's gesture, the desktop's button, Alt+←, a mouse's side button) is the browser's history, of
 *  which Atlas keeps none — so Back left Atlas, or on a server landed in the vault visited before. One guard entry stays on top while `on()`: Back
 *  closes an overlay, else takes the app's own step back (`step`, false when there is none); with nothing left, a phone
 *  leaves (`leave`), a desktop stays in the vault. The guard is put back at the next touch, since a browser skips
 *  history entries made without one. */
export function attachBrowserBack(on: () => boolean, step: () => boolean, leave: () => boolean): () => void {
  const guard = () => { if (on() && !history.state?.atlasBack) history.pushState({ atlasBack: true }, ""); };
  const pop = () => {
    if (!on()) return;
    if (dismiss() || step() || !leave()) guard();
    else history.back(); // nothing left to go back to inside Atlas: leave, as Back would have
  };
  addEventListener("popstate", pop);
  addEventListener("pointerdown", guard, true);
  return () => { removeEventListener("popstate", pop); removeEventListener("pointerdown", guard, true); };
}
