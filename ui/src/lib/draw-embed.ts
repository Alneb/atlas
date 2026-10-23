// `![[x.excalidraw]]` in a note: the drawing itself, not a link chip — an embed registered like a plugin's
// (builtin-embeds.ts), loading Excalidraw only when a note has a drawing.
import { errText } from "./text";
import { api } from "./api";
import type { EmbedContext } from "./embed-registry";

const dark = () => document.documentElement.dataset.theme !== "light";

export async function drawingEmbed(el: HTMLElement, e: EmbedContext): Promise<void> {
  const page = e.anchor; // `![[x.excalidraw#Page 2]]`: that page only (draw-pages.ts frameRef)
  el.classList.add("drawing-embed");
  el.classList.toggle("is-centered", e.options.includes("center"));
  if (e.width) el.style.width = `${e.width}px`;
  try {
    const { sceneJson, sceneSvg } = await import("./draw-excalidraw");
    const svg = await sceneSvg(await sceneJson((await api.file(e.path)).text), dark(), page || undefined);
    // natural size from the scene, unless the embed asked for a width (`|600`); never wider than the note
    const natural = svg.viewBox.baseVal?.width;
    svg.removeAttribute("width");
    svg.removeAttribute("height");
    if (!e.width && natural) svg.style.width = `${natural}px`;
    svg.classList.add("drawing-svg");
    // a button, so a click on it opens the drawing instead of revealing the note's source
    const edit = document.createElement("button");
    edit.type = "button";
    edit.className = "drawing-edit";
    edit.textContent = page ? `Edit ${page}` : "Edit drawing";
    // opened at that page (Excalidraw.svelte: the pane's `page`)
    edit.addEventListener("click", (ev) => { ev.preventDefault(); ev.stopPropagation(); e.open(); });
    el.replaceChildren(svg, edit);
  } catch (err) {
    el.classList.add("is-missing");
    el.textContent = `drawing ${e.path}: ${errText(err)}`;
  }
}
