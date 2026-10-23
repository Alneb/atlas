// Fenced code blocks a plugin draws (`atlas.editor.registerFence("statblock", render)`): a
// ```statblock fence in a note is shown by the plugin, in live preview and in the reading view.
// The markdown renderer is not involved: a fence is rendered as the code block it is, and this
// module puts the plugin's drawing in its place once it is on the page — so a fence nobody draws
// (or whose plugin is off) simply stays a code block, and a plugin loading late needs no re-render.
import { errText } from "./text";
import { logPlugin } from "./plugin-log.svelte";

export interface FenceContext {
  /** The text between the fences. */
  source: string;
  /** The note the fence is in. */
  path: string;
  /** That note's properties (frontmatter and the section's `key:: value`). */
  props(): Promise<Record<string, unknown>>;
}
export type FenceRender = (host: HTMLElement, fence: FenceContext) => void | (() => void);

const fences = new Map<string, { plugin: string; render: FenceRender }>();
const watchers = new Map<string, Set<() => void>>();
const NAME = /^[A-Za-z][\w-]*$/;

export function registerFence(plugin: string, name: string, render: FenceRender): () => void {
  if (!NAME.test(name)) throw new Error(`registerFence: "${name}" is not a fence name (letters, digits, - and _)`);
  const f = { plugin, render };
  fences.set(name, f);
  const tell = () => queueMicrotask(() => { for (const w of [...(watchers.get(name) ?? [])]) w(); });
  tell();
  return () => { if (fences.get(name) === f) { fences.delete(name); tell(); } };
}

/** Draws the fence beside its code block (hidden meanwhile); follows the plugin coming, changing and going. */
function mountFence(pre: HTMLElement, name: string, ctx: FenceContext): () => void {
  const host = document.createElement("div");
  host.className = "atlas-block fence-block";
  host.dataset.fenceName = name;
  // what happens inside the drawing is the plugin's: the editor must not take it for a click into the source
  for (const ev of ["keydown", "keyup", "keypress", "beforeinput", "input", "mousedown", "paste", "cut", "copy"]) host.addEventListener(ev, (e) => e.stopPropagation());
  let clean = () => {};
  const draw = () => {
    clean();
    clean = () => {};
    host.replaceChildren();
    const f = fences.get(name);
    if (!f) { host.remove(); pre.hidden = false; return; } // nobody draws it: the code block shows
    pre.hidden = true;
    pre.after(host);
    try { clean = f.render(host, ctx) ?? (() => {}); }
    catch (e) {
      logPlugin(f.plugin, `fence ${name}`, e);
      host.replaceChildren(Object.assign(document.createElement("p"), { className: "view-error", textContent: `${name}: ${errText(e)}` }));
    }
  };
  draw();
  const set = watchers.get(name) ?? new Set();
  watchers.set(name, set);
  set.add(draw);
  return () => { set.delete(draw); clean(); host.remove(); pre.hidden = false; };
}

/** Every code block under `root` with a language: watched, and drawn by a plugin when one has that name. Each
 *  mount's undo goes to `track` (unmarked too, so a later hydrate draws it again). */
export function hydrateFences(root: HTMLElement, path: string, props: (source: string) => Promise<Record<string, unknown>>, track: (clean: () => void) => void): void {
  for (const pre of root.querySelectorAll<HTMLElement>("pre.hljs:not([data-fence])")) {
    const name = pre.querySelector(":scope > .code-lang")?.textContent?.trim() ?? "";
    if (!NAME.test(name)) continue;
    pre.dataset.fence = name;
    const source = (pre.querySelector(":scope > code")?.textContent ?? "").replace(/\n$/, "");
    const clean = mountFence(pre, name, { source, path, props: () => props(source) });
    track(() => { clean(); delete pre.dataset.fence; });
  }
}
