// Back / Forward inside a pane before between panes: a pane with places of its own (the explorer's folders, Email's
// folders and conversations, Calendar's dates, a web tab's pages) registers its element and how it steps, and every
// Back — the mouse's side buttons, a swipe, Super+[ / Super+], the phone's Back, the browser's Back — asks it first
// (`navigate` in dock.ts). Only when it has no step that way does Back go to the previous pane.
//
// One list per page, on the window: a plugin's pane is a bundle with its own copy of this module, and registers where
// the app looks (as back.ts's overlays do).

type Dir = -1 | 1;
type Taker = { el: HTMLElement; step: (dir: Dir) => boolean; can?: (dir: Dir) => boolean };
const takers: Taker[] = ((globalThis as { atlasPaneNav?: Taker[] }).atlasPaneNav ??= []);

/** `el` steps through its own places: `step(dir)` takes one and says true, or says false when it has none that way;
 *  `can(dir)` says beforehand (the swipe's sign). Returns the unregistering function (an `$effect`'s cleanup). */
export function paneSteps(el: HTMLElement, step: (dir: Dir) => boolean, can?: (dir: Dir) => boolean): () => void {
  const t: Taker = { el, step, can };
  takers.push(t);
  return () => {
    const i = takers.indexOf(t);
    if (i >= 0) takers.splice(i, 1);
  };
}

const onScreen = (el: HTMLElement) => el.isConnected && el.getClientRects().length > 0;

/** The panes at `at` (the element under the pointer, or the active pane's), the innermost first: a pane inside
 *  another (a web tab in a plugin's view) answers before the one around it. */
function near(at: Element | null | undefined): Taker[] {
  if (!at) return [];
  const list = takers.filter((t) => onScreen(t.el) && (t.el.contains(at) || at.contains(t.el)));
  return list.sort((a, b) => (a.el.contains(b.el) ? 1 : b.el.contains(a.el) ? -1 : 0));
}

/** Offers a step to the panes at `at`; true when one took it. */
export const offerStep = (dir: Dir, at: Element | null | undefined): boolean => near(at).some((t) => t.step(dir));

/** Whether a pane at `at` has a step that way (one with no `can` is asked only by trying). */
export const paneCanStep = (dir: Dir, at: Element | null | undefined): boolean => near(at).some((t) => t.can?.(dir));

/** A pane's own history of places (`T`: whatever puts it back — a folder, a conversation, a date and view). Each time
 *  the person goes somewhere, take `here()` before and hand it to `left(place)` after; Back and Forward then `apply`
 *  the places in turn. What `apply` does (synchronously) is not recorded again. `attach(el)` registers it for the
 *  pane's element. */
export class Steps<T> {
  back: T[] = [];
  fwd: T[] = [];
  #applying = false;
  constructor(
    private readonly here: () => T,
    private readonly apply: (place: T) => void,
    private readonly same: (a: T, b: T) => boolean = (a, b) => JSON.stringify(a) === JSON.stringify(b),
    private readonly max = 100,
  ) {}

  /** The person has left `place` (not by Back / Forward): it goes on the back list, unless they are still there. */
  left(place: T): void {
    if (this.#applying) return;
    if (this.same(place, this.here())) return; // nowhere new
    if (this.back.length && this.same(this.back[this.back.length - 1], place)) { this.fwd = []; return; }
    this.back = [...this.back, place].slice(-this.max);
    this.fwd = [];
  }

  can(dir: Dir): boolean { return (dir < 0 ? this.back : this.fwd).length > 0; }

  /** One step back (-1) or forward (+1); false when there is none. */
  step(dir: Dir): boolean {
    const from = dir < 0 ? this.back : this.fwd;
    const to = from[from.length - 1];
    if (to === undefined) return false;
    const now = this.here();
    if (dir < 0) { this.back = from.slice(0, -1); this.fwd = [...this.fwd, now]; }
    else { this.fwd = from.slice(0, -1); this.back = [...this.back, now]; }
    this.unrecorded(() => this.apply(to));
    return true;
  }

  /** Runs `f` without recording where it goes (the pane moves by itself: the next conversation after an archive). */
  unrecorded(f: () => void): void {
    const was = this.#applying;
    this.#applying = true;
    try { f(); } finally { this.#applying = was; }
  }

  attach(el: HTMLElement): () => void { return paneSteps(el, (d) => this.step(d), (d) => this.can(d)); }
}
