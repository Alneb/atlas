// Ctrl over a picture shows it large: in notes
// (live preview and reading view) and pages. It stays while the pointer is on the picture or on the large one (which
// covers it: moving within it no longer hides it); let go of Ctrl, or move off both, and it is gone. The large one lets
// clicks through (Ctrl+click still reaches the picture), so "within it" is its rectangle, not a hover.
// Ctrl+click opens it in a tab (the editor's mousedown, create.ts).
let installed = false;

export function installImagePeek(): void {
  if (installed) return;
  installed = true;
  let over: HTMLImageElement | null = null, big: HTMLImageElement | null = null;
  const pictures = "img.cm-embed-image, .markdown img, .md-render img";
  const show = () => {
    if (!over || !over.complete || !over.naturalWidth) return;
    big ??= Object.assign(document.createElement("img"), { className: "image-peek motion-keep", alt: "" });
    big.src = over.currentSrc || over.src;
    if (!big.isConnected) document.body.append(big);
  };
  let leaving: ReturnType<typeof setTimeout> | undefined;
  const hide = () => { clearTimeout(leaving); big?.remove(); };
  // off both pictures: gone after a moment, so the way from the small one to the large one (centred, maybe apart) keeps it
  const hideSoon = () => { if (big?.isConnected) leaving ??= setTimeout(() => { leaving = undefined; over = null; hide(); }, 250); };
  const stay = () => { clearTimeout(leaving); leaving = undefined; };
  const within = (e: MouseEvent) => {
    if (!big?.isConnected) return false;
    const r = big.getBoundingClientRect();
    return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
  };
  document.addEventListener("mouseover", (e) => {
    const at = (e.target as Element).closest?.<HTMLImageElement>(pictures) ?? null;
    if (at) { stay(); over = at; if (e.ctrlKey) show(); }
    else if (within(e)) stay();
    else if (big?.isConnected) hideSoon(); else over = null;
  });
  // the large picture covers several elements: its rectangle, not the element under the pointer, says whether it stays
  document.addEventListener("mousemove", (e) => {
    if (!big?.isConnected) return;
    if (within(e) || (e.target as Element).closest?.(pictures)) stay(); else hideSoon();
  }, { passive: true });
  document.addEventListener("keydown", (e) => { if (e.key === "Control") show(); });
  document.addEventListener("keyup", (e) => { if (e.key === "Control") hide(); });
  window.addEventListener("blur", hide);
}
