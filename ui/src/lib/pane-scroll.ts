// A background tab's element is taken out of the page (dockview's "onlyWhenVisible"), and the browser forgets
// every scroll position inside it. This keeps them: each scroll inside the pane is noted while it is shown and
// put back when it is shown again — so a pane need not stay in the page (laid out, its listeners live) to keep
// its place. Generic: an editor's scroller, a PDF's pages, a list, whatever scrolls.

export interface ScrollKeeper {
  /** The pane went to the background (stop noting: the reset to 0 on detaching is not the user's). */
  hidden(): void;
  /** The pane is back in the page: put every noted position back. */
  shown(): void;
  dispose(): void;
}

export function keepScroll(root: HTMLElement): ScrollKeeper {
  const at = new Map<Element, [number, number]>();
  let noting = true;
  const onScroll = (e: Event) => {
    if (!noting || !root.isConnected) return;
    const el = e.target instanceof Element ? e.target : null;
    if (el) at.set(el, [el.scrollTop, el.scrollLeft]);
  };
  // scroll does not bubble: capture sees every scroller inside
  root.addEventListener("scroll", onScroll, { capture: true, passive: true });
  const put = () => {
    for (const [el, [top, left]] of at) {
      if (!root.contains(el)) { at.delete(el); continue; } // gone with a re-render
      if (el.scrollTop !== top) el.scrollTop = top;
      if (el.scrollLeft !== left) el.scrollLeft = left;
    }
  };
  return {
    hidden() { noting = false; },
    shown() {
      if (!root.isConnected) return;
      put();
      // a scroller sized a frame later (an editor measuring itself) takes it then
      requestAnimationFrame(() => { put(); noting = true; });
    },
    dispose() { root.removeEventListener("scroll", onScroll, { capture: true }); at.clear(); },
  };
}
