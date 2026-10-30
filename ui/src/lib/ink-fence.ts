// The core's fence for the Obsidian Ink plugin's ```handdrawn-ink / ```handwritten-ink blocks: they hold a pointer to a
// `.drawing` file, not the drawing, so they are shown as what they are: a card linking that file, or saying it is not
// in this vault. In live preview and the reading view alike, the block's text left as it is.
import { registerFence, type FenceRender } from "./fences";
import { openPath } from "./dock";
import { shownName } from "./paths";
import { resolveLink } from "./vault";

const card = (what: "drawing" | "handwriting"): FenceRender => (host, fence) => {
  let file = "";
  try { file = String(JSON.parse(fence.source).filepath ?? ""); } catch { /* not JSON: said below */ }
  const hit = file ? resolveLink(file, fence.path.slice(0, fence.path.lastIndexOf("/") + 1).replace(/\/$/, "")) : null;
  const box = Object.assign(document.createElement("div"), { className: `ink-card${hit ? "" : " is-missing"}` });
  if (hit) {
    const a = Object.assign(document.createElement("a"), { className: "internal-link", href: "#", textContent: shownName(file) });
    a.onclick = (e) => { e.preventDefault(); e.stopPropagation(); openPath(hit); };
    box.append(`Ink ${what}: `, a, " (Ink plugin format — open to view)");
  } else {
    const code = Object.assign(document.createElement("code"), { textContent: file || "?" });
    box.append(`Ink ${what} `, code, " — the file is not in this vault (Obsidian Ink plugin).");
  }
  host.append(box);
  return () => box.remove();
};

registerFence("atlas", "handdrawn-ink", card("drawing"));
registerFence("atlas", "handwritten-ink", card("handwriting"));
