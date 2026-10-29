// A long list of rows of one height, drawn only around what is in view (the file tree, a base's table): the scroller's
// position and size are followed, `range(n)` names the rows to draw, and the rows above and below are left as padding
// of their height, so the scrollbar stays true.
export class RowWindow {
  rowH = $state(26);
  top = $state(0);
  height = $state(800);

  /** `margin`: rows drawn beyond the screen on each side, so scrolling stays drawn. */
  constructor(readonly margin: number, rowH = 26) {
    this.rowH = rowH;
  }

  /** Follows `el`'s scroll and size; returns the cleanup (for an `$effect`). */
  follow(el: HTMLElement | undefined): (() => void) | undefined {
    if (!el) return;
    const onScroll = () => { this.top = el.scrollTop; };
    const ro = new ResizeObserver(() => { this.height = el.clientHeight || this.height; this.top = el.scrollTop; });
    el.addEventListener("scroll", onScroll, { passive: true });
    ro.observe(el);
    return () => { el.removeEventListener("scroll", onScroll); ro.disconnect(); };
  }

  /** The rows `first`..`last` (exclusive) of `n` to draw now. */
  range(n: number): { first: number; last: number } {
    const last = Math.min(n, Math.ceil((this.top + this.height) / this.rowH) + this.margin);
    return { first: Math.min(last, Math.max(0, Math.floor(this.top / this.rowH) - this.margin)), last };
  }

  /** The row height as the theme draws it (a phone's rows are taller), read off a drawn row. */
  measure(row: HTMLElement | null | undefined) {
    if (row?.offsetHeight) this.rowH = row.offsetHeight;
  }
}
