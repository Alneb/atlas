// A DOI link is a paper: `[Hedin 1965](https://doi.org/10.1103/PhysRev.139.A796)` opens that paper's note when the
// library has it (its `doi`), and otherwise offers to file it there — the papers plugin writes its note and fetches its
// PDF — then opens the new note. The link's text is never rewritten. Shift+click still opens the page in the browser
// (web-links.ts `openOutside`); without the papers plugin, or when filing fails, the page opens as any web page.
import { api } from "./api";
import { confirmDialog } from "./confirm";
import { library } from "./entities";
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
