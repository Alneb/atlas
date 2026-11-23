// A DOI link is a paper: `[Hedin 1965](https://doi.org/10.1103/PhysRev.139.A796)` stands for that paper's note once the
// library has it (a paper note whose `doi` is that DOI): it is drawn and followed as the wikilink `[[citekey]]` would
// be — its colour, its hover preview, a click and the menu open the note — and its text is never rewritten. Until then
// it is dashed, and a click (or "Add to library…" in its menu) opens Catalog's own "Add to the catalog" dialog on it
// (the catalog plugin's add.js: its preview card, then its add, which has the papers plugin write the note and fetch the
// PDF), never a second way of filing. Shift+click still opens the page in the browser (web-links.ts `openOutside`);
// without Catalog the page opens as any web page.
// A note's sources (its `sources` property: DOIs, arXiv ids, PDF links) the same way: `filedSource` says whether the
// library has one, `openSource` opens it or offers it to Catalog.
import { library, onLibraryChange } from "./entities";
import { openReadingNote } from "./papers";
import { plugins, pluginOn } from "./plugin-registry.svelte";
import { toast } from "./state.svelte";
import { resolveLink } from "./vault";
import type { Paper } from "./gen/Paper";

/** The DOI a link names (`https://doi.org/10.…`, `dx.doi.org`, `doi:10.…`), or null. */
export function doiOf(url: string): string | null {
  const m = /^(?:https?:\/\/(?:dx\.)?doi\.org\/|doi:)(10\.\d{4,9}\/\S+)$/i.exec(url.trim());
  if (!m) return null;
  try { return decodeURIComponent(m[1]); } catch { return m[1]; }
}

/** The library's paper with that DOI (DOIs are case-insensitive). */
export async function paperWithDoi(doi: string): Promise<Paper | undefined> {
  const want = doi.toLowerCase();
  return (await library()).find((p) => p.doi?.toLowerCase() === want);
}

/** Opens the paper the DOI names, else offers it to Catalog; false when the page should open instead. */
export async function openDoi(doi: string): Promise<boolean> {
  const known = await paperWithDoi(doi);
  if (known) { await openReadingNote(known.key); return true; }
  return addToLibrary(doi);
}

/** The plugin that files what is captured (`provides = ["catalog"]`, the catalog plugin), asked by role. */
const catalogPlugin = () => plugins.list.find((p) => p.provides.includes("catalog") && p.has_helper && pluginOn(p)) ?? null;

/** Catalog's "Add to the catalog" dialog on `text` (a DOI, an arXiv id, a PDF link, an ISBN): it looks the thing up,
 *  shows what it would file and where, and on "Add" files it and opens its note. The one way a link files what it
 *  names; false without Catalog (the page opens instead). */
export function addToLibrary(text: string): boolean {
  const p = catalogPlugin();
  if (!p) {
    toast("Catalog is off", "Switch on Catalog (Settings → Plugins) to add papers to the library from their links.", "info");
    return false;
  }
  void import("./plugin-dialog").then((m) => m.openPluginDialog(p, text.trim(), { title: "Add to the catalog", width: 720, height: 560, view: "add.js" }));
  return true;
}

/** An address without its scheme, `www.`, fragment or trailing slash: the same page however it was written. */
const sameUrl = (u: string) => u.trim().replace(/^https?:\/\/(www\.)?/i, "").replace(/#.*$/, "").replace(/\/+$/, "").toLowerCase();

/** An arXiv id a link or text names (`arxiv.org/abs/2401.00001v2`, `arXiv:2401.00001`), without its version. */
export function arxivOf(s: string): string | null {
  return /(?:arxiv\.org\/(?:abs|pdf)\/|^arxiv:\s*)(\d{4}\.\d{4,5})/i.exec(s.trim())?.[1] ?? null;
}

/** A source the papers library can hold: a DOI, an arXiv id, a link to a PDF. A page (a video, a site) is not one. */
export const isSource = (v: string) => !!doiOf(v) || !!arxivOf(v) || /^https?:\/\/\S+\.pdf(?:[?#]\S*)?$/i.test(v.trim());

/** The library's paper a source names: by its DOI, its arXiv id, else the address it was filed from (its `url`). */
export async function filedSource(source: string): Promise<Paper | undefined> {
  const doi = doiOf(source);
  if (doi) return paperWithDoi(doi);
  const ax = arxivOf(source), want = sameUrl(source);
  return (await library()).find((p) => (ax && p.arxiv?.replace(/v\d+$/, "") === ax) || (p.url && sameUrl(p.url) === want));
}

/** Opens the note of a source (a DOI, an arXiv id, a PDF link), else offers it to Catalog; false when nothing was
 *  opened (no Catalog: the page opens instead). */
export async function openSource(source: string): Promise<boolean> {
  const doi = doiOf(source);
  if (doi) return openDoi(doi);
  const known = await filedSource(source);
  if (known) { await openReadingNote(known.key); return true; }
  return addToLibrary(source);
}

// the library's papers by DOI for a look that cannot wait (the editor's decorations): null until it has answered once,
// and again after it changes; the editors that asked are redrawn once it answers (each passes one `ready` of its own)
let dois: Map<string, Paper> | null = null;
let asking: Promise<void> | null = null;
const waiting = new Set<() => void>();
const ask = () => {
  asking ??= library().then((ps) => {
    dois = new Map(ps.filter((p) => p.doi).map((p) => [p.doi!.toLowerCase(), p]));
    const told = [...waiting];
    waiting.clear();
    for (const f of told) try { f(); } catch { /* an editor closed meanwhile */ }
  });
};
// a paper filed (or gone): the editors that drew a DOI link draw it again, as the note link or as not filed
const drawn = new Set<() => void>();
onLibraryChange(() => {
  dois = null;
  asking = null;
  for (const f of drawn) waiting.add(f);
  drawn.clear();
  if (waiting.size) ask();
});

/** The library's paper with this DOI if known now: undefined when it has none, null while asking (then `ready` is
 *  called once it answers, and again whenever the library changes). */
export function doiPaperNow(doi: string, ready: () => void): Paper | undefined | null {
  if (dois) { drawn.add(ready); return dois.get(doi.toLowerCase()); }
  waiting.add(ready);
  ask();
  return null;
}

/** The link `[[citekey]]` a filed paper's DOI link stands for: its key, once its note is a file the vault knows (an
 *  entry with no note yet — a bare `info.yaml` — stays a web link, whose click makes the note: `openReadingNote`). */
const noteLink = (p: Paper | undefined): string | null => (p && resolveLink(p.key, "") ? p.key : null);

const notFiled = (doi: string) => `${doi} — not in the library: a click offers to add it`;
const filedTitle = (p: Paper, doi: string) => `${p.key} — opens its note (${doi}; Shift+click: the page)`;

/** The editor's mark for a `[text](url)` link: a filed DOI is drawn as the link `[[citekey]]` (its class and target,
 *  so hover, preview and menu treat it as that note), one not filed yet is dashed. */
export function doiLinkMark(url: string, ready: () => void): { class: string; title?: string; attributes?: Record<string, string> } | null {
  const doi = doiOf(url);
  if (!doi) return null;
  const p = doiPaperNow(doi, ready);
  if (p === null) return { class: "doi-link" };
  if (!p) return { class: "doi-link not-in-library", title: notFiled(doi) };
  const key = noteLink(p);
  return key ? { class: "doi-link cm-hmd-internal-link", title: filedTitle(p, doi), attributes: { "data-target": key } } : { class: "doi-link", title: filedTitle(p, doi) };
}

/** Rendered HTML: a filed DOI link becomes the vault link to its paper's note (`a.internal-link`, `data-href` the
 *  citekey, its address kept in `data-url` for Shift+click); one not filed yet is `.not-in-library`. */
export function markDoiLinks(root: HTMLElement): void {
  const links = [...root.querySelectorAll<HTMLAnchorElement>("a[href]:not(.internal-link)")].map((a) => [a, doiOf(a.href)] as const).filter(([, d]) => d);
  if (!links.length) return;
  for (const [a, doi] of links) {
    a.classList.add("doi-link");
    void paperWithDoi(doi!).then((p) => {
      a.classList.toggle("not-in-library", !p);
      if (!p) { a.title = notFiled(doi!); return; }
      a.title = filedTitle(p, doi!);
      const key = noteLink(p);
      if (!key) return; // its note is made by the first click (openDoi)
      a.dataset.url = a.href;
      a.classList.add("internal-link");
      a.dataset.href = key;
      a.setAttribute("href", "#"); // the app's web-link click (main.ts) leaves it to the vault link's (rendered-links.ts)
    });
  }
}
