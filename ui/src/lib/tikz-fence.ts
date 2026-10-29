// The core's fence: a ```tikz block (a \begin{tikzpicture} … \end{tikzpicture}, after optional \usetikzlibrary lines)
// drawn as its picture in live preview and the reading view (lib/tikz.ts), the source staying the note's text: editing
// the block draws it again. A TeX error shows TeX's own message in place of the picture.
import { registerFence } from "./fences";

registerFence("atlas", "tikz", (host, fence) => {
  let gone = false;
  const box = document.createElement("div");
  box.className = "tikz-figure";
  box.dataset.state = "drawing";
  box.textContent = "Drawing the TikZ picture…";
  host.append(box);
  void import("./tikz").then(({ renderTikz }) => renderTikz(fence.source)).then((r) => {
    if (gone) return;
    box.dataset.state = r.ok ? "done" : "error";
    if (r.ok) {
      box.innerHTML = r.svg;
      const svg = box.querySelector("svg");
      svg?.setAttribute("role", "img");
      // TeX sizes in pt with 10 pt text: the width in em makes the picture's text the note's size (height follows)
      const pt = /^([\d.]+)pt$/.exec(svg?.getAttribute("width") ?? "");
      if (pt && svg) svg.style.width = `${Number(pt[1]) / 10}em`;
      return;
    }
    const title = Object.assign(document.createElement("div"), { className: "tikz-error-title", textContent: "TikZ: TeX could not draw this picture" });
    const why = Object.assign(document.createElement("pre"), { className: "tikz-error-log", textContent: r.error });
    box.replaceChildren(title, why);
  });
  return () => { gone = true; box.remove(); };
});
