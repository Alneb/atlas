// One way for a view to follow the vault: reload (debounced) when a file it cares about changes — never for Atlas's
// own bookkeeping (.atlas/cache, .atlas/trash) — and, while its element is off-screen (a hidden tab, scrolled away),
// wait until it is seen again instead of asking the core for something nobody looks at.
import { isBookkeeping, on } from "./bus";

export interface ReloadOn {
  /** ms to wait after the last change */
  wait: number;
  /** the paths that matter (default: any); an event naming no paths ("anything may have changed") always counts */
  wants?: (path: string) => boolean;
  /** the view's element: reloads wait while it is off-screen (none yet: reloads at once) */
  host?: () => Element | null | undefined;
}

/** Returns the unsubscribe. */
export function reloadOnChange(load: () => void, o: ReloadOn): () => void {
  let t: ReturnType<typeof setTimeout> | undefined;
  let stale = false, seen = true, watched: Element | null = null;
  const io = o.host && typeof IntersectionObserver !== "undefined"
    ? new IntersectionObserver((es) => { seen = es.some((e) => e.isIntersecting); if (seen && stale) { stale = false; load(); } })
    : null;
  const watch = (el: Element | null | undefined) => { if (io && el && el !== watched) { if (watched) io.unobserve(watched); io.observe(el); watched = el; } };
  watch(o.host?.());
  const fire = () => {
    const el = o.host?.();
    watch(el);
    if (el && (!el.isConnected || !seen)) { stale = true; return; } // no element yet (nothing drawn): reload
    load();
  };
  const later = () => { clearTimeout(t); t = setTimeout(fire, o.wait); };
  const counts = (paths: string[]) => !paths.length || paths.some((p) => !isBookkeeping(p) && (o.wants?.(p) ?? true));
  const offFs = on("fs", (e) => { if (counts(e.paths)) later(); });
  const offGone = on("gone", (e) => { if (counts(e.paths)) later(); });
  return () => { offFs(); offGone(); clearTimeout(t); io?.disconnect(); };
}
