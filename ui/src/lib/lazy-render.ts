// Renderers fetched on first use, off the start's path (KaTeX, highlight.js and its languages): what was drawn plain
// before one arrived is drawn again — math in place (math.ts), the rest by whoever listens here.
const waiting = new Set<() => void>();

/** `fn` each time a renderer arrives. */
export function onRendererArrived(fn: () => void): () => void {
  waiting.add(fn);
  return () => waiting.delete(fn);
}

export function rendererArrived(): void {
  for (const f of waiting) f();
}
