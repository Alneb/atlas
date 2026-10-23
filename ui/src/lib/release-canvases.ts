// WebKit keeps a canvas's pixels until the element itself is collected, which a closed pane's detached tree may never
// be: 8 PDFs closed still held ~360 MB, 8 drawings ~470 MB (decisions/PERFORMANCE.md, "The long day in WebKit").
// Shrinking every canvas to 0×0 frees its backing store at once, whatever still points at the element.
export function releaseCanvases(root: ParentNode | null | undefined): void {
  root?.querySelectorAll("canvas").forEach((c) => { c.width = 0; c.height = 0; });
}
