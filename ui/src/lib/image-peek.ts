// Ctrl over a picture shows it large: in notes
// (live preview and reading view) and pages. Let go of Ctrl, or move off it, and it is gone.
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
  const hide = () => big?.remove();
  document.addEventListener("mouseover", (e) => {
    over = (e.target as Element).closest?.<HTMLImageElement>(pictures) ?? null;
    if (over && e.ctrlKey) show(); else if (!over) hide();
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Control") show(); });
  document.addEventListener("keyup", (e) => { if (e.key === "Control") hide(); });
  window.addEventListener("blur", hide);
}
