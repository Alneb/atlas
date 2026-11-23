// Ctrl over a picture shows it large: in notes
// (live preview and reading view), pages, a ```tikz drawing (its SVG cloned, so TeX's fonts and the dark theme's
// inversion stay), and any picture marked `data-peek` (a thumbnail whose `data-peek` names the
// vault file: the thumbnail shows at once, the file replaces it once loaded — Captures). It stays while the pointer is on the picture or on the large one (which
// covers it: moving within it no longer hides it); let go of Ctrl, or move off both, and it is gone. The large one lets
// clicks through (Ctrl+click still reaches the picture), so "within it" is its rectangle, not a hover.
// Ctrl+click opens it in a tab (the editor's mousedown, create.ts). A display formula grows the same way (its rendering
// cloned at a bigger size). What is under the pointer is looked up when Ctrl goes down — never the last picture
// entered, which a scroll leaves stale — and only once Ctrl has been held a moment (HOLD_MS): a quick Ctrl+click or a
// Ctrl+key shortcut shows nothing.
import { blobUrl } from "./raw";

let installed = false;
const HOLD_MS = 140;

export function installImagePeek(): void {
  if (installed) return;
  installed = true;
  let over: Element | null = null, big: HTMLElement | null = null;
  const pictures = "img.cm-embed-image, .markdown img, .md-render img, img[data-peek], .tikz-figure > svg";
  // display formulas, wherever drawn (the editor's math and rendered blocks, the reading view, the edit preview)
  const formulas = ".katex-display, .cm-math-block";
  const peekable = `${pictures}, ${formulas}`;
  const show = () => {
    if (!over) return;
    if (over instanceof SVGSVGElement) return showDrawing(over);
    if (!(over instanceof HTMLImageElement)) return showFormula(over);
    if (!over.complete || !over.naturalWidth) return;
    if (!(big instanceof HTMLImageElement)) { big?.remove(); big = Object.assign(document.createElement("img"), { className: "image-peek motion-keep", alt: "" }); }
    const img = big as HTMLImageElement;
    img.src = over.currentSrc || over.src;
    const file = over.dataset.peek;
    if (file) void blobUrl(file).then((u) => { if (big === img && over instanceof HTMLImageElement && over.dataset.peek === file) img.src = u; }, () => {});
    if (!img.isConnected) document.body.append(img);
  };
  /** A drawing: its SVG cloned into a box as large as fits 86 % of the window, its proportions kept. */
  const showDrawing = (svg: SVGSVGElement) => {
    const r = svg.getBoundingClientRect();
    if (!r.width || !r.height) return;
    big?.remove();
    const box = big = Object.assign(document.createElement("div"), { className: "image-peek tikz-peek motion-keep" });
    const scale = Math.min((innerWidth * 0.86 - 32) / r.width, (innerHeight * 0.86 - 32) / r.height);
    const copy = svg.cloneNode(true) as SVGSVGElement;
    if (!copy.getAttribute("viewBox")) copy.setAttribute("viewBox", `0 0 ${svg.width.baseVal.value || r.width} ${svg.height.baseVal.value || r.height}`);
    // the fence sizes its drawing in em on the element's style: the copy's size goes there too
    copy.style.width = `${r.width * scale}px`;
    copy.style.height = `${r.height * scale}px`;
    box.append(copy);
    document.body.append(box);
  };
  /** A formula: its rendering cloned, its font grown so it fills up to 86 % of the window (at most 4 times). */
  const showFormula = (el: Element) => {
    const katex = el.matches(".katex-display") ? el : el.querySelector(".katex-display, .katex") ?? el;
    const r = katex.getBoundingClientRect();
    if (!r.width || !r.height) return;
    big?.remove();
    const box = big = Object.assign(document.createElement("div"), { className: "image-peek math-peek motion-keep" });
    const scale = Math.min((innerWidth * 0.86 - 48) / r.width, (innerHeight * 0.86 - 48) / r.height, 4);
    box.style.fontSize = `${parseFloat(getComputedStyle(katex).fontSize) * Math.max(1, scale)}px`;
    box.append(katex.cloneNode(true));
    document.body.append(box);
  };
  let leaving: ReturnType<typeof setTimeout> | undefined;
  let holding: ReturnType<typeof setTimeout> | undefined;
  const hide = () => { clearTimeout(leaving); clearTimeout(holding); holding = undefined; big?.remove(); };
  // where the pointer is, for the look-up when Ctrl goes down (the large one lets the pointer through: not found there)
  let px = -1, py = -1;
  const under = (): Element | null => (px < 0 ? null : document.elementFromPoint(px, py)?.closest(peekable) ?? null);
  // off both pictures: gone after a moment, so the way from the small one to the large one (centred, maybe apart) keeps it
  const hideSoon = () => { if (big?.isConnected) leaving ??= setTimeout(() => { leaving = undefined; over = null; hide(); }, 250); };
  const stay = () => { clearTimeout(leaving); leaving = undefined; };
  const within = (e: MouseEvent) => {
    if (!big?.isConnected) return false;
    const r = big.getBoundingClientRect();
    return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
  };
  document.addEventListener("mouseover", (e) => {
    const at = (e.target as Element).closest?.(peekable) ?? null;
    if (at) { stay(); over = at; if (e.ctrlKey) show(); }
    else if (within(e)) stay();
    else if (big?.isConnected) hideSoon(); else over = null;
  });
  // the large picture covers several elements: its rectangle, not the element under the pointer, says whether it stays
  document.addEventListener("mousemove", (e) => {
    px = e.clientX; py = e.clientY;
    if (!big?.isConnected) return;
    if (within(e) || (e.target as Element).closest?.(peekable)) stay(); else hideSoon();
  }, { passive: true });
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Control") { if (e.ctrlKey) hide(); return; } // Ctrl+C, Ctrl+S…: a shortcut, not a look
    if (e.repeat || holding || big?.isConnected) return;
    holding = setTimeout(() => { holding = undefined; over = under(); show(); }, HOLD_MS);
  });
  // a Ctrl+click is an action (open in a tab, follow a link): no picture before it
  document.addEventListener("mousedown", () => { clearTimeout(holding); holding = undefined; }, true);
  document.addEventListener("keyup", (e) => { if (e.key === "Control") hide(); });
  window.addEventListener("blur", hide);
}
