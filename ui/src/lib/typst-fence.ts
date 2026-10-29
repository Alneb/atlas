// The core's fence: a ```typst block drawn as its pages by the core's Typst (core typst_doc.rs, POST /api/typst/svg)
// in live preview and the reading view, beside ```tikz; the source stays the note's text, and pictures it names are
// read beside the note. A Typst error shows Typst's own message with its line. Drawn pages are kept by the hash of
// the note's folder and source for the session: a note opened again draws at once.
import DOMPurify from "dompurify";
import { registerFence } from "./fences";
import { api } from "./api";

const drawn = new Map<string, Promise<{ svg: string[] } | { error: string }>>();
const MAX = 200;

function draw(path: string, source: string) {
  const key = `${path.replace(/[^/]*$/, "")}\n${source}`;
  let p = drawn.get(key);
  if (!p) {
    p = api.typstSvg(path, source).then(
      (r) => (r.kind === "pages" ? { svg: r.svg } : { error: r.error }),
      (e: Error) => ({ error: `Typst is not available here: ${e.message}` }),
    );
    // errors are not kept: the picture a fence names may come later
    void p.then((r) => { if ("error" in r) drawn.delete(key); });
    drawn.set(key, p);
    if (drawn.size > MAX) drawn.delete(drawn.keys().next().value!);
  }
  return p;
}

registerFence("atlas", "typst", (host, fence) => {
  let gone = false;
  const box = document.createElement("div");
  box.className = "tikz-figure typst-figure";
  box.dataset.state = "drawing";
  box.textContent = "Drawing the Typst block…";
  host.append(box);
  void draw(fence.path, fence.source).then((r) => {
    if (gone) return;
    box.dataset.state = "error" in r ? "error" : "done";
    if ("error" in r) {
      const title = Object.assign(document.createElement("div"), { className: "tikz-error-title", textContent: "Typst could not draw this block" });
      const why = Object.assign(document.createElement("pre"), { className: "tikz-error-log", textContent: r.error });
      box.replaceChildren(title, why);
      return;
    }
    // Typst's SVG is plain SVG, but a note's text can put anything in it: only SVG is kept
    box.innerHTML = r.svg.map((s) => DOMPurify.sanitize(s, { USE_PROFILES: { svg: true, svgFilters: true } }) as string).join("");
    for (const svg of box.querySelectorAll("svg")) {
      svg.setAttribute("role", "img");
      // Typst sizes in pt with 11 pt text: the width in em makes its text the note's size (height follows)
      const pt = /^([\d.]+)pt$/.exec(svg.getAttribute("width") ?? "");
      if (pt) svg.style.width = `${Number(pt[1]) / 11}em`;
    }
  });
  return () => { gone = true; box.remove(); };
});
