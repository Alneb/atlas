// A DOI link is a paper: `[Hedin 1965](https://doi.org/10.1103/PhysRev.139.A796)` opens that paper's note when the
// library has it (its `doi`), and otherwise offers to file it there — the papers plugin writes its note and fetches its
// PDF — then opens the new note. The link's text is never rewritten. Shift+click still opens the page in the browser
// (web-links.ts `openOutside`); without the papers plugin, or when filing fails, the page opens as any web page.
// A note's sources (its `sources` property: DOIs, arXiv ids, PDF links) the same way: `filedSource` says whether the library
// has one, `openSource` opens it or files it through the catalog (a PDF link is downloaded and read for its metadata).
import { api } from "./api";
import { confirmDialog } from "./confirm";
import { library, onLibraryChange } from "./entities";
import { openReadingNote } from "./papers";
import { toast } from "./state.svelte";
import { errText } from "./text";
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

/** Opens the paper the DOI names, filing it first when asked; false when the page should open instead. */
export async function openDoi(doi: string): Promise<boolean> {
  const known = await paperWithDoi(doi);
  if (known) { await openReadingNote(known.key); return true; }
  const add = await confirmDialog(`Add ${doi} to the library?`,
    "Its note is made in the library and its PDF fetched when one can be found; this link then opens the note. Shift+click opens the page in the browser instead.",
    "Add to library", false);
  if (!add) return true;
  try {
    const r = await api.refsAdd(doi);
    toast(r.created ? `Added ${r.paper.key}` : `Already in the library: ${r.paper.key}`, r.paper.title + (r.created && r.pdf ? " · PDF downloaded" : ""), r.created ? "success" : "info");
    await openReadingNote(r.paper.key);
    return true;
  } catch (e) {
    toast(`Could not add ${doi}`, errText(e), "error", 9000);
    return false;
  }
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

/** Opens the note of a source (a DOI, an arXiv id, a PDF link), filing it through the catalog first when asked; false when
 *  nothing was opened (declined, or the catalog could not file it — the page opens instead). Never an empty note:
 *  the catalog files only what it recognises. */
export async function openSource(source: string): Promise<boolean> {
  const doi = doiOf(source);
  if (doi) return openDoi(doi);
  const known = await filedSource(source);
  if (known) { await openReadingNote(known.key); return true; }
  const add = await confirmDialog("Add this source to the library?",
    `${source}\n\nThe catalog files it: a PDF is downloaded and read for its title, authors and year. Shift+click opens the address in the browser instead.`,
    "Add to library", false);
  if (!add) return true;
  try {
    const r = (await api.pluginTool("catalog", "add", { text: source.trim() })) as { path?: string };
    if (!r.path) throw new Error("the catalog filed nothing");
    toast("In the library", r.path, "success");
    const { openPath } = await import("./dock");
    openPath(r.path);
    return true;
  } catch (e) {
    toast("Could not add this source", errText(e), "error", 9000);
    return false;
  }
}

// the library's DOIs for a look that cannot wait (the editor's decorations): null until it has answered once, and
// again after it changes; the editors that asked meanwhile are told when it is there
let dois: Set<string> | null = null;
let asking: Promise<void> | null = null;
const waiting = new Set<() => void>();
onLibraryChange(() => { dois = null; asking = null; });

/** Whether the library has this DOI, if known now; null while asking (then `ready` is called once it answers). */
export function doiInLibraryNow(doi: string, ready: () => void): boolean | null {
  if (dois) return dois.has(doi.toLowerCase());
  waiting.add(ready);
  asking ??= library().then((ps) => {
    dois = new Set(ps.map((p) => p.doi?.toLowerCase()).filter((d): d is string => !!d));
    const told = [...waiting];
    waiting.clear();
    for (const f of told) f();
  });
  return null;
}

/** The editor's mark for a `[text](url)` link: a DOI the library has not got yet looks as in the reading view. */
export function doiLinkMark(url: string, ready: () => void): { class: string; title: string } | null {
  const doi = doiOf(url);
  if (!doi) return null;
  const has = doiInLibraryNow(doi, ready);
  return has === false ? { class: "doi-link not-in-library", title: `${doi} — not in the library: a click offers to add it` } : { class: "doi-link", title: "" };
}

/** Rendered HTML: each DOI link says whether the library has it (`.doi-link`, `.not-in-library`). */
export function markDoiLinks(root: HTMLElement): void {
  const links = [...root.querySelectorAll<HTMLAnchorElement>("a[href]")].map((a) => [a, doiOf(a.href)] as const).filter(([, d]) => d);
  if (!links.length) return;
  for (const [a, doi] of links) {
    a.classList.add("doi-link");
    void paperWithDoi(doi!).then((p) => {
      a.classList.toggle("not-in-library", !p);
      a.title = p ? `${p.key} — opens its note` : `${doi} — not in the library: a click offers to add it`;
    });
  }
}
