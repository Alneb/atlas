// A row's part that gives way: hidden (class `gone`) when the row's other children leave it less than `min` pixels, so
// it shows readably or not at all. The PDF toolbar squeezed the file's name to "T…" beside its tools. The room is the
// row's width minus its other children's, never the part's own width: hiding it does not change that, so it never
// flickers between shown and hidden. A child that grows (a spacer, flex-grow > 0) is free room, not used.
export function giveWay(row: HTMLElement, opts: { part: string; min: number }): { update(o: typeof opts): void; destroy(): void } {
  let { part, min } = opts;
  const measure = () => {
    const el = row.querySelector<HTMLElement>(part);
    if (!el) return;
    const cs = getComputedStyle(row);
    const gap = parseFloat(cs.columnGap) || 0;
    let used = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
    for (const c of row.children) {
      if (c.contains(el) || parseFloat(getComputedStyle(c).flexGrow) > 0) continue;
      used += (c as HTMLElement).offsetWidth + gap;
    }
    el.classList.toggle("gone", row.clientWidth - used < min);
  };
  const ro = typeof ResizeObserver === "function" ? new ResizeObserver(measure) : null;
  // the row, and each child: a counter growing changes the room without resizing the row (never the part's own:
  // hiding it would ask again at once, a ResizeObserver loop)
  const watch = () => {
    ro?.disconnect();
    ro?.observe(row);
    for (const c of row.children) if (!c.matches(part) && !c.querySelector(part)) ro?.observe(c);
  };
  // children come and go with the pane's state (the tools once the document is open): watched anew, measured again
  const mo = typeof MutationObserver === "function" ? new MutationObserver(() => { watch(); measure(); }) : null;
  mo?.observe(row, { childList: true });
  watch();
  queueMicrotask(measure);
  return { update(o) { ({ part, min } = o); watch(); measure(); }, destroy() { ro?.disconnect(); mo?.disconnect(); } };
}
