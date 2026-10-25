// `![[paper.pdf]]`, `![[Note]]` / `![[Note#Heading]]` and `![[any file]]`: markdown.ts renders a placeholder, this mounts
// what the embed registry has for the file (embed-registry.ts: a drawing, a plugin's), else
// the PDF viewer, the note (its section), or the file's own view into it — Obsidian embeds the first two; they showed as
// a link chip ("pdf's, some blocks … dont render correctly"). Any other file: sound and video play here, a file with a view (a table, a page,
// code, a book in its plugin's reader — the "Open with" default) is that view, the rest a card that opens it. Editor
// widgets and reading views alike, as bases.ts does for `.base`.
import { embedOptions, fileIcon } from "./panes";
import { mountBlock, paneBlockType } from "./blocks";
import { openWikilink, resolveWikilink } from "./links";
import { openersFor, resolveSpec } from "./openers";
import { blobUrl } from "./raw";
import { iconSvg } from "./icons";
import { embedFor, onEmbedsChanged, type Embed } from "./embed-registry";
import { logPlugin } from "./plugin-log.svelte";
import { errText } from "./text";
import "./builtin-embeds";
import "./embed-open"; // the ↗ over an embed, Ctrl+click: the original

/** How deep notes may embed notes (a note that embeds itself, or two that embed each other, stop here). */
const MAX_DEPTH = 2;
const PDF_HEIGHT = 520;
const AUDIO = /\.(mp3|ogg|oga|opus|m4a|aac|wav|flac)$/i;
const VIDEO = /\.(mp4|webm|mov|m4v|mkv|ogv)$/i;

/** The block an embedded file is drawn with (`type: table\npath: …`), or null: a card. `section`: what follows the
 *  `#` (a table's `view=Name`). */
function fileBlock(path: string, section: string): string | null {
  const spec = resolveSpec(path, undefined, section || undefined);
  // the editor is everyone's fallback: only for what it can read (a .zip is not text)
  if (spec.kind === "editor" && !openersFor(path).some((o) => o.id === "editor")) return null;
  const opts = spec.kind === "plugin" ? { id: spec.id, path } : embedOptions(spec);
  if (!opts) return null;
  return [`type: ${paneBlockType(spec.kind)}`, ...Object.entries(opts).map(([k, v]) => `${k}: ${JSON.stringify(v)}`)].join("\n");
}

/** A file nothing draws: its icon, its name, and a click that opens it as a plain open would. */
function card(el: HTMLElement, path: string): void {
  const a = document.createElement("a");
  a.className = "file-card internal-link";
  a.href = "#";
  a.dataset.href = path;
  a.title = `Open ${path}`;
  const icon = document.createElement("span");
  icon.className = "file-card-icon";
  icon.innerHTML = iconSvg(fileIcon(path), 18);
  const name = document.createElement("span");
  name.textContent = path.split("/").pop() ?? path;
  a.append(icon, name);
  el.replaceChildren(a);
}

/** Sound or video, played in the note. */
async function media(el: HTMLElement, path: string, video: boolean): Promise<void> {
  const m = document.createElement(video ? "video" : "audio");
  m.controls = true;
  m.preload = "metadata";
  m.className = video ? "embed-video" : "embed-audio";
  m.src = await blobUrl(path);
  el.replaceChildren(m);
}

/** `compact` (a card on Home, the day's log): a file, PDF or note embedded there is its card, never a whole viewer.
 *  → unmounts what it mounted: a block kept mounted pins its element, and through it the whole closed note
 *  (Svelte's `mount` registers its target until `unmount`; leak hunt). */
export function hydrateEmbeds(root: HTMLElement, notePath: string, compact = false): () => void {
  const mine: HTMLElement[] = [];
  for (const el of root.querySelectorAll<HTMLElement>(`${PLACEHOLDERS.map((c) => `${c}:not([data-mounted])`).join(", ")}`)) {
    el.dataset.mounted = "1";
    el.dataset.embedNote = notePath;
    el.dataset.embedClass = el.className; // what a redraw starts from (a drawing adds its own classes)
    if (compact) el.dataset.embedCompact = "1";
    mine.push(el);
    void mountEmbed(el, notePath, compact);
  }
  return () => { for (const el of mine) release(el); };
}

const PLACEHOLDERS = [".pdf-embed", ".note-embed", ".file-embed"];
// what each mounted embed undoes before it is drawn again (a registration came or went) or when it goes
const cleanups = new WeakMap<HTMLElement, () => void>();
const mounted = new Set<WeakRef<HTMLElement>>();
/** Embeds whose note view went: one still resolving its link must not mount into them afterwards. */
const released = new WeakSet<HTMLElement>();

function release(el: HTMLElement): void {
  released.add(el);
  try { cleanups.get(el)?.(); } catch { /* the drawing's own problem */ }
  cleanups.delete(el);
  for (const ref of mounted) if (ref.deref() === el) mounted.delete(ref);
}
/** Keeps `clean` for `el` — or runs it at once when the embed was released while it was being drawn. */
function keep(el: HTMLElement, clean: () => void): void {
  if (released.has(el)) clean(); else cleanups.set(el, clean);
}

/** One placeholder: a registered embed when one takes the file (embed-registry.ts), else the usual viewer. */
async function mountEmbed(el: HTMLElement, notePath: string, compact: boolean): Promise<void> {
  const [target, ...rest] = (el.dataset.target ?? "").split("#");
  const section = rest.join("#").trim();
  const pdf = el.classList.contains("pdf-embed"), file = el.classList.contains("file-embed");
  let depth = 0;
  for (let up = el.parentElement?.closest(".note-embed"); up; up = up.parentElement?.closest(".note-embed")) depth++;
  const path = await resolveWikilink(target, notePath).catch(() => "");
  if (!path || released.has(el)) return;
  el.dataset.embedPath = path;
  const by = embedFor(path);
  el.dataset.embedBy = String(by?.id ?? 0);
  if (by) {
    mounted.add(new WeakRef(el));
    return drawRegistered(el, by, path, section, notePath, compact);
  }
  if (!pdf && !file && depth >= MAX_DEPTH) return; // left as the link it was drawn with
  if (!pdf && !file && path === notePath && !section) return; // the note itself: the link stays
  mounted.add(new WeakRef(el));
  if (compact && !(AUDIO.test(path) || VIDEO.test(path))) return card(el, path);
  if (file) {
    if (AUDIO.test(path) || VIDEO.test(path)) return void media(el, path, VIDEO.test(path)).catch(() => card(el, path));
    const src = fileBlock(path, section);
    if (!src) return card(el, path);
    el.replaceChildren();
    return keep(el, mountBlock(el, notePath, src));
  }
  el.replaceChildren();
  const page = /^page=(\d+)/.exec(section)?.[1];
  const src = pdf
    ? `type: pdf\npath: ${JSON.stringify(path)}\nheight: ${PDF_HEIGHT}${page ? `\npage: ${page}` : ""}`
    : `type: note\npath: ${JSON.stringify(path)}${section ? `\nsection: ${JSON.stringify(section)}` : ""}`;
  keep(el, mountBlock(el, notePath, src));
}

/** A registered embed into `el`: its failure is said in place and logged as its owner's. */
async function drawRegistered(el: HTMLElement, by: Embed, path: string, anchor: string, note: string, compact: boolean): Promise<void> {
  const options = (el.dataset.opts ?? "").split("|").map((p) => p.trim()).filter(Boolean);
  const width = Number(options.map((p) => /^(\d+)(?:x\d+)?$/.exec(p)?.[1]).find(Boolean)) || undefined;
  el.classList.add("registered-embed");
  el.replaceChildren();
  const fail = (e: unknown) => {
    if (by.owner !== "core") logPlugin(by.owner, `embed ${path}`, e); else console.error("[atlas] embed", path, e);
    el.replaceChildren(Object.assign(document.createElement("p"), { className: "view-error", textContent: `${path.split("/").pop()}: ${errText(e)}` }));
  };
  try {
    const clean = await by.render(el, { path, anchor, options, width, note, compact, open: () => void openWikilink(anchor ? `${path}#${anchor}` : path, note) });
    if (el.dataset.embedBy !== String(by.id)) { if (typeof clean === "function") clean(); return; } // redrawn meanwhile
    if (typeof clean === "function") keep(el, clean);
  } catch (e) { fail(e); }
}

// a registration came or went (a plugin loaded, reloaded or switched off): the embeds it changes are drawn again
onEmbedsChanged(() => {
  for (const ref of [...mounted]) {
    const el = ref.deref();
    if (!el || !el.isConnected) { mounted.delete(ref); continue; }
    const path = el.dataset.embedPath;
    if (!path || String(embedFor(path)?.id ?? 0) === el.dataset.embedBy) continue;
    mounted.delete(ref);
    try { cleanups.get(el)?.(); } catch { /* the old drawing's own problem */ }
    cleanups.delete(el);
    el.className = el.dataset.embedClass ?? el.className;
    el.removeAttribute("style");
    const note = el.dataset.embedNote ?? "", compact = el.dataset.embedCompact === "1";
    void mountEmbed(el, note, compact);
  }
});
